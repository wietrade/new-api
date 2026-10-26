package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/samber/lo"

	"github.com/gin-gonic/gin"
)

const (
	defaultTimeoutSeconds       = 10
	defaultEndpoint             = "/api/pricing"
	maxConcurrentFetches        = 8
	maxRatioConfigBytes         = 10 << 20 // 10MB
	floatEpsilon                = 1e-9
	officialRatioPresetID       = -100
	officialRatioPresetName     = "上游倍率预设"
	officialRatioPresetBaseURL  = "https://basellm.github.io"
	modelsDevPresetID           = -101
	modelsDevPresetName         = "models.dev 价格预设"
	modelsDevPresetBaseURL      = "https://models.dev"
	modelsDevHost               = "models.dev"
	modelsDevPath               = "/api.json"
	modelsDevInputCostRatioBase = 1000.0
)

func nearlyEqual(a, b float64) bool {
	if a > b {
		return a-b < floatEpsilon
	}
	return b-a < floatEpsilon
}

func valuesEqual(a, b any) bool {
	af, aok := a.(float64)
	bf, bok := b.(float64)
	if aok && bok {
		return nearlyEqual(af, bf)
	}
	return a == b
}

var pricingSyncFields = []string{
	"model_ratio",
	"completion_ratio",
	"cache_ratio",
	"create_cache_ratio",
	"image_ratio",
	"audio_ratio",
	"audio_completion_ratio",
	"model_price",
	billing_setting.BillingModeField,
	billing_setting.BillingExprField,
}

var numericPricingSyncFields = map[string]bool{
	"model_ratio":            true,
	"completion_ratio":       true,
	"cache_ratio":            true,
	"create_cache_ratio":     true,
	"image_ratio":            true,
	"audio_ratio":            true,
	"audio_completion_ratio": true,
	"model_price":            true,
}

type upstreamResult struct {
	Name string         `json:"name"`
	Data map[string]any `json:"data,omitempty"`
	Err  string         `json:"err,omitempty"`
}

func valueMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	case map[string]float64:
		return lo.MapValues(typed, func(value float64, _ string) any { return value })
	case map[string]string:
		return lo.MapValues(typed, func(value string, _ string) any { return value })
	default:
		return nil
	}
}

func asFloat64(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func normalizeSyncValue(field string, value any) any {
	if numericPricingSyncFields[field] {
		if parsed, ok := asFloat64(value); ok {
			return parsed
		}
	}
	return value
}

func getLocalPricingSyncData() map[string]any {
	data := billing_setting.GetPricingSyncData(map[string]any(ratio_setting.GetExposedData()))
	data["image_ratio"] = ratio_setting.GetImageRatioCopy()
	data["audio_ratio"] = ratio_setting.GetAudioRatioCopy()
	data["audio_completion_ratio"] = ratio_setting.GetAudioCompletionRatioCopy()
	return data
}

// effectivePricingSyncData follows the billing engine's mode precedence. An
// inactive expression and numeric settings covered by an active expression
// are not separate prices and must not appear as synchronization differences.
func effectivePricingSyncData(data map[string]any) map[string]any {
	result := make(map[string]any, len(pricingSyncFields))
	names := make(map[string]struct{})
	for _, field := range pricingSyncFields {
		entries := make(map[string]any)
		for name, raw := range valueMap(data[field]) {
			value := normalizeSyncValue(field, raw)
			if numericPricingSyncFields[field] {
				number, ok := value.(float64)
				if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 {
					continue
				}
			}
			entries[name] = value
			names[name] = struct{}{}
		}
		result[field] = entries
	}
	modes := valueMap(result[billing_setting.BillingModeField])
	expressions := valueMap(result[billing_setting.BillingExprField])
	for name := range names {
		expression, _ := expressions[name].(string)
		if modes[name] == billing_setting.BillingModeTieredExpr {
			if strings.TrimSpace(expression) == "" {
				for _, field := range pricingSyncFields {
					delete(valueMap(result[field]), name)
				}
				continue
			}
			expressions[name] = strings.TrimSpace(expression)
			for field := range numericPricingSyncFields {
				delete(valueMap(result[field]), name)
			}
			continue
		}
		delete(expressions, name)
		modes[name] = billing_setting.BillingModeRatio
		_, fixed := valueMap(result["model_price"])[name]
		_, token := valueMap(result["model_ratio"])[name]
		if !fixed && !token {
			for _, field := range pricingSyncFields {
				delete(valueMap(result[field]), name)
			}
			continue
		}
		if fixed {
			for field := range numericPricingSyncFields {
				if field != "model_price" {
					delete(valueMap(result[field]), name)
				}
			}
		}
	}
	return result
}

func modelPricingSyncValues(data map[string]any, name string) map[string]any {
	values := make(map[string]any)
	for _, field := range pricingSyncFields {
		if value, exists := valueMap(data[field])[name]; exists {
			values[field] = value
		}
	}
	return values
}

func FetchUpstreamRatios(c *gin.Context) {
	var req struct {
		dto.UpstreamRequest
		IncludeUnchanged bool `json:"include_unchanged"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.SysError(common.LogText("failed to bind upstream request: %s", err.Error()))
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid request parameter format"))
		return
	}

	if req.Timeout <= 0 {
		req.Timeout = defaultTimeoutSeconds
	}

	var upstreams []dto.UpstreamDTO

	if len(req.Upstreams) > 0 {
		for _, u := range req.Upstreams {
			if strings.HasPrefix(u.BaseURL, "http") {
				if u.Endpoint == "" {
					u.Endpoint = defaultEndpoint
				}
				u.BaseURL = strings.TrimRight(u.BaseURL, "/")
				upstreams = append(upstreams, u)
			}
		}
	} else if len(req.ChannelIDs) > 0 {
		intIds := make([]int, 0, len(req.ChannelIDs))
		for _, id64 := range req.ChannelIDs {
			intIds = append(intIds, int(id64))
		}
		dbChannels, err := model.GetChannelsByIds(intIds)
		if err != nil {
			logger.LogError(c.Request.Context(), common.LogText("failed to query channels: %s", err.Error()))
			common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to query channels"))
			return
		}
		for _, ch := range dbChannels {
			if base := ch.GetBaseURL(); strings.HasPrefix(base, "http") {
				upstreams = append(upstreams, dto.UpstreamDTO{
					ID:       ch.Id,
					Name:     ch.Name,
					BaseURL:  strings.TrimRight(base, "/"),
					Endpoint: "",
				})
			}
		}
	}

	if len(upstreams) == 0 {
		common.ApiErrorT(c, "No valid upstream channel")
		return
	}

	var wg sync.WaitGroup
	ch := make(chan upstreamResult, len(upstreams))

	sem := make(chan struct{}, maxConcurrentFetches)

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{MaxIdleConns: 100, IdleConnTimeout: 90 * time.Second, TLSHandshakeTimeout: 10 * time.Second, ExpectContinueTimeout: 1 * time.Second, ResponseHeaderTimeout: 10 * time.Second}
	if common.TLSInsecureSkipVerify {
		transport.TLSClientConfig = common.InsecureTLSConfig.Clone()
	}
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			host = addr
		}
		// 对 github.io 优先尝试 IPv4，失败则回退 IPv6
		if strings.HasSuffix(host, "github.io") {
			if conn, err := dialer.DialContext(ctx, "tcp4", addr); err == nil {
				return conn, nil
			}
			return dialer.DialContext(ctx, "tcp6", addr)
		}
		return dialer.DialContext(ctx, network, addr)
	}
	client := &http.Client{Transport: transport}

	for _, chn := range upstreams {
		wg.Add(1)
		go func(chItem dto.UpstreamDTO) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			isOpenRouter := chItem.Endpoint == "openrouter"

			endpoint := chItem.Endpoint
			var fullURL string
			if isOpenRouter {
				fullURL = chItem.BaseURL + "/v1/models"
			} else if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
				fullURL = endpoint
			} else {
				if endpoint == "" {
					endpoint = defaultEndpoint
				} else if !strings.HasPrefix(endpoint, "/") {
					endpoint = "/" + endpoint
				}
				fullURL = chItem.BaseURL + endpoint
			}
			isModelsDev := isModelsDevAPIEndpoint(fullURL)

			uniqueName := chItem.Name
			if chItem.ID != 0 {
				uniqueName = fmt.Sprintf("%s(%d)", chItem.Name, chItem.ID)
			}

			ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(req.Timeout)*time.Second)
			defer cancel()

			httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
			if err != nil {
				logger.LogWarn(c.Request.Context(), common.LogText("build request failed: %s", err.Error()))
				ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
				return
			}

			// OpenRouter requires Bearer token auth
			if isOpenRouter && chItem.ID != 0 {
				dbCh, err := model.GetChannelById(chItem.ID, true)
				if err != nil {
					ch <- upstreamResult{Name: uniqueName, Err: "failed to get channel key: " + err.Error()}
					return
				}
				key, _, apiErr := dbCh.GetNextEnabledKey()
				if apiErr != nil {
					ch <- upstreamResult{Name: uniqueName, Err: "failed to get enabled channel key: " + apiErr.Error()}
					return
				}
				if strings.TrimSpace(key) == "" {
					ch <- upstreamResult{Name: uniqueName, Err: "no API key configured for this channel"}
					return
				}
				httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(key))
			} else if isOpenRouter {
				ch <- upstreamResult{Name: uniqueName, Err: "OpenRouter requires a valid channel with API key"}
				return
			}

			// 简单重试：最多 3 次，指数退避
			var resp *http.Response
			var lastErr error
			for attempt := range 3 {
				resp, lastErr = client.Do(httpReq)
				if lastErr == nil {
					break
				}
				time.Sleep(time.Duration(200*(1<<attempt)) * time.Millisecond)
			}
			if lastErr != nil {
				logger.LogWarn(c.Request.Context(), common.LogText("http error on %s: %s", chItem.Name, lastErr.Error()))
				ch <- upstreamResult{Name: uniqueName, Err: lastErr.Error()}
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				logger.LogWarn(c.Request.Context(), common.LogText("non-200 from %s: %s", chItem.Name, resp.Status))
				ch <- upstreamResult{Name: uniqueName, Err: resp.Status}
				return
			}

			// Content-Type 和响应体大小校验
			if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.Contains(strings.ToLower(ct), "application/json") {
				logger.LogWarn(c.Request.Context(), common.LogText("unexpected content-type from %s: %s", chItem.Name, ct))
			}
			limited := io.LimitReader(resp.Body, maxRatioConfigBytes)
			bodyBytes, err := io.ReadAll(limited)
			if err != nil {
				logger.LogWarn(c.Request.Context(), common.LogText("read response failed from %s: %s", chItem.Name, err.Error()))
				ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
				return
			}

			// type3: OpenRouter /v1/models -> convert per-token pricing to ratios
			if isOpenRouter {
				converted, err := convertOpenRouterToRatioData(bytes.NewReader(bodyBytes))
				if err != nil {
					logger.LogWarn(c.Request.Context(), common.LogText("OpenRouter parse failed from %s: %s", chItem.Name, err.Error()))
					ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
					return
				}
				ch <- upstreamResult{Name: uniqueName, Data: converted}
				return
			}

			// type4: models.dev /api.json -> convert provider model pricing to ratios
			if isModelsDev {
				converted, err := convertModelsDevToRatioData(bytes.NewReader(bodyBytes))
				if err != nil {
					logger.LogWarn(c.Request.Context(), common.LogText("models.dev parse failed from %s: %s", chItem.Name, err.Error()))
					ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
					return
				}
				ch <- upstreamResult{Name: uniqueName, Data: converted}
				return
			}

			// 兼容两种上游接口格式：
			//  type1: /api/ratio_config -> data 为 map[string]any，包含 model_ratio/completion_ratio/cache_ratio/model_price
			//  type2: /api/pricing      -> data 为 []Pricing 列表，需要转换为与 type1 相同的 map 格式
			var body struct {
				Success bool            `json:"success"`
				Data    json.RawMessage `json:"data"`
				Message string          `json:"message"`
			}

			if err := common.DecodeJson(bytes.NewReader(bodyBytes), &body); err != nil {
				logger.LogWarn(c.Request.Context(), common.LogText("json decode failed from %s: %s", chItem.Name, err.Error()))
				ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
				return
			}

			if !body.Success {
				ch <- upstreamResult{Name: uniqueName, Err: body.Message}
				return
			}

			// 若 Data 为空，将继续按 type1 尝试解析（与多数静态 ratio_config 兼容）

			// 尝试按 type1 解析
			var type1Data map[string]any
			if err := common.Unmarshal(body.Data, &type1Data); err == nil {
				// 如果包含至少一个 ratioTypes 字段，则认为是 type1
				isType1 := false
				for _, rt := range pricingSyncFields {
					if _, ok := type1Data[rt]; ok {
						isType1 = true
						break
					}
				}
				if isType1 {
					ch <- upstreamResult{Name: uniqueName, Data: type1Data}
					return
				}
			}

			// 如果不是 type1，则尝试按 type2 (/api/pricing) 解析
			var pricingItems []struct {
				ModelName            string   `json:"model_name"`
				QuotaType            int      `json:"quota_type"`
				ModelRatio           *float64 `json:"model_ratio"`
				ModelPrice           *float64 `json:"model_price"`
				CompletionRatio      *float64 `json:"completion_ratio"`
				CacheRatio           *float64 `json:"cache_ratio"`
				CreateCacheRatio     *float64 `json:"create_cache_ratio"`
				ImageRatio           *float64 `json:"image_ratio"`
				AudioRatio           *float64 `json:"audio_ratio"`
				AudioCompletionRatio *float64 `json:"audio_completion_ratio"`
				BillingMode          string   `json:"billing_mode"`
				BillingExpr          string   `json:"billing_expr"`
			}
			if err := common.Unmarshal(body.Data, &pricingItems); err != nil {
				logger.LogWarn(c.Request.Context(), common.LogText("unrecognized data format from %s: %s", chItem.Name, err.Error()))
				ch <- upstreamResult{Name: uniqueName, Err: "failed to parse the upstream response"}
				return
			}

			modelRatioMap := make(map[string]float64)
			completionRatioMap := make(map[string]float64)
			cacheRatioMap := make(map[string]float64)
			createCacheRatioMap := make(map[string]float64)
			imageRatioMap := make(map[string]float64)
			audioRatioMap := make(map[string]float64)
			audioCompletionRatioMap := make(map[string]float64)
			modelPriceMap := make(map[string]float64)
			billingModeMap := make(map[string]string)
			billingExprMap := make(map[string]string)

			for _, item := range pricingItems {
				if item.ModelName == "" {
					continue
				}
				if item.BillingMode == billing_setting.BillingModeTieredExpr {
					billingModeMap[item.ModelName] = billing_setting.BillingModeTieredExpr
					billingExprMap[item.ModelName] = item.BillingExpr
					continue
				}
				if item.QuotaType == 1 {
					if item.ModelPrice != nil {
						modelPriceMap[item.ModelName] = *item.ModelPrice
					}
				} else {
					if item.ModelRatio != nil {
						modelRatioMap[item.ModelName] = *item.ModelRatio
					}
					if item.CompletionRatio != nil {
						completionRatioMap[item.ModelName] = *item.CompletionRatio
					}
				}
				if item.CacheRatio != nil {
					cacheRatioMap[item.ModelName] = *item.CacheRatio
				}
				if item.CreateCacheRatio != nil {
					createCacheRatioMap[item.ModelName] = *item.CreateCacheRatio
				}
				if item.ImageRatio != nil {
					imageRatioMap[item.ModelName] = *item.ImageRatio
				}
				if item.AudioRatio != nil {
					audioRatioMap[item.ModelName] = *item.AudioRatio
				}
				if item.AudioCompletionRatio != nil {
					audioCompletionRatioMap[item.ModelName] = *item.AudioCompletionRatio
				}
			}

			converted := make(map[string]any)

			if len(modelRatioMap) > 0 {
				ratioAny := make(map[string]any, len(modelRatioMap))
				for k, v := range modelRatioMap {
					ratioAny[k] = v
				}
				converted["model_ratio"] = ratioAny
			}

			if len(completionRatioMap) > 0 {
				compAny := make(map[string]any, len(completionRatioMap))
				for k, v := range completionRatioMap {
					compAny[k] = v
				}
				converted["completion_ratio"] = compAny
			}
			if len(cacheRatioMap) > 0 {
				converted["cache_ratio"] = valueMap(cacheRatioMap)
			}
			if len(createCacheRatioMap) > 0 {
				converted["create_cache_ratio"] = valueMap(createCacheRatioMap)
			}
			if len(imageRatioMap) > 0 {
				converted["image_ratio"] = valueMap(imageRatioMap)
			}
			if len(audioRatioMap) > 0 {
				converted["audio_ratio"] = valueMap(audioRatioMap)
			}
			if len(audioCompletionRatioMap) > 0 {
				converted["audio_completion_ratio"] = valueMap(audioCompletionRatioMap)
			}

			if len(modelPriceMap) > 0 {
				priceAny := make(map[string]any, len(modelPriceMap))
				for k, v := range modelPriceMap {
					priceAny[k] = v
				}
				converted["model_price"] = priceAny
			}
			if len(billingModeMap) > 0 {
				converted[billing_setting.BillingModeField] = valueMap(billingModeMap)
			}
			if len(billingExprMap) > 0 {
				converted[billing_setting.BillingExprField] = valueMap(billingExprMap)
			}

			ch <- upstreamResult{Name: uniqueName, Data: converted}
		}(chn)
	}

	wg.Wait()
	close(ch)

	localData := effectivePricingSyncData(getLocalPricingSyncData())

	var testResults []dto.TestResult
	var successfulChannels []struct {
		name string
		data map[string]any
	}

	for r := range ch {
		if r.Err != "" {
			testResults = append(testResults, dto.TestResult{
				Name:   r.Name,
				Status: "error",
				Error:  r.Err,
			})
		} else {
			testResults = append(testResults, dto.TestResult{
				Name:   r.Name,
				Status: "success",
			})
			successfulChannels = append(successfulChannels, struct {
				name string
				data map[string]any
			}{name: r.Name, data: effectivePricingSyncData(r.Data)})
		}
	}

	differences := buildDifferences(localData, successfulChannels)
	type modelSyncPrices struct {
		Current   map[string]any            `json:"current"`
		Upstreams map[string]map[string]any `json:"upstreams"`
	}
	models := make(map[string]struct{}, len(differences))
	for name := range differences {
		models[name] = struct{}{}
	}
	if req.IncludeUnchanged {
		for _, channel := range successfulChannels {
			for _, field := range pricingSyncFields {
				for name := range valueMap(channel.data[field]) {
					models[name] = struct{}{}
				}
			}
		}
	}
	prices := make(map[string]modelSyncPrices, len(models))
	for name := range models {
		row := modelSyncPrices{Current: modelPricingSyncValues(localData, name), Upstreams: make(map[string]map[string]any)}
		expressionPriority := valueMap(localData[billing_setting.BillingModeField])[name] == billing_setting.BillingModeTieredExpr
		for _, channel := range successfulChannels {
			if valueMap(channel.data[billing_setting.BillingModeField])[name] == billing_setting.BillingModeTieredExpr {
				expressionPriority = true
				break
			}
		}
		for _, channel := range successfulChannels {
			candidate := modelPricingSyncValues(channel.data, name)
			if expressionPriority && candidate[billing_setting.BillingModeField] != billing_setting.BillingModeTieredExpr {
				continue
			}
			_, hasRatio := candidate["model_ratio"]
			_, hasPrice := candidate["model_price"]
			_, hasExpression := candidate[billing_setting.BillingExprField]
			if hasRatio || hasPrice || hasExpression {
				row.Upstreams[channel.name] = candidate
			}
		}
		if len(row.Upstreams) > 0 {
			prices[name] = row
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"differences":  differences,
			"prices":       prices,
			"test_results": testResults,
		},
	})
}

func buildDifferences(localData map[string]any, successfulChannels []struct {
	name string
	data map[string]any
}) map[string]map[string]dto.DifferenceItem {
	differences := make(map[string]map[string]dto.DifferenceItem)
	localData = effectivePricingSyncData(localData)
	normalizedChannels := make([]struct {
		name string
		data map[string]any
	}, 0, len(successfulChannels))
	for _, channel := range successfulChannels {
		channel.data = effectivePricingSyncData(channel.data)
		normalizedChannels = append(normalizedChannels, channel)
	}
	successfulChannels = normalizedChannels

	allModels := make(map[string]struct{})

	for _, field := range pricingSyncFields {
		for modelName := range valueMap(localData[field]) {
			allModels[modelName] = struct{}{}
		}
	}

	for _, channel := range successfulChannels {
		for _, field := range pricingSyncFields {
			for modelName := range valueMap(channel.data[field]) {
				allModels[modelName] = struct{}{}
			}
		}
	}

	confidenceMap := make(map[string]map[string]bool)

	// 预处理阶段：检查pricing接口的可信度
	for _, channel := range successfulChannels {
		confidenceMap[channel.name] = make(map[string]bool)

		modelRatios := valueMap(channel.data["model_ratio"])
		completionRatios := valueMap(channel.data["completion_ratio"])

		if len(modelRatios) > 0 && len(completionRatios) > 0 {
			// 遍历所有模型，检查是否满足不可信条件
			for modelName := range allModels {
				// 默认为可信
				confidenceMap[channel.name][modelName] = true

				// 检查是否满足不可信条件：model_ratio为37.5且completion_ratio为1
				if modelRatioVal, ok := modelRatios[modelName]; ok {
					if completionRatioVal, ok := completionRatios[modelName]; ok {
						// 转换为float64进行比较
						modelRatioFloat, modelRatioOK := asFloat64(modelRatioVal)
						completionRatioFloat, completionRatioOK := asFloat64(completionRatioVal)
						if modelRatioOK && completionRatioOK && nearlyEqual(modelRatioFloat, 37.5) && nearlyEqual(completionRatioFloat, 1.0) {
							confidenceMap[channel.name][modelName] = false
						}
					}
				}
			}
		} else {
			// 如果不是从pricing接口获取的数据，则全部标记为可信
			for modelName := range allModels {
				confidenceMap[channel.name][modelName] = true
			}
		}
	}

	for modelName := range allModels {
		expressionPriority := valueMap(localData[billing_setting.BillingModeField])[modelName] == billing_setting.BillingModeTieredExpr
		for _, channel := range successfulChannels {
			if valueMap(channel.data[billing_setting.BillingModeField])[modelName] == billing_setting.BillingModeTieredExpr {
				expressionPriority = true
			}
		}
		for _, ratioType := range pricingSyncFields {
			if expressionPriority && numericPricingSyncFields[ratioType] {
				continue
			}
			var localValue any = nil
			if val, exists := valueMap(localData[ratioType])[modelName]; exists {
				localValue = normalizeSyncValue(ratioType, val)
			}

			upstreamValues := make(map[string]any)
			confidenceValues := make(map[string]bool)
			hasUpstreamValue := false
			hasDifference := false

			for _, channel := range successfulChannels {
				if expressionPriority && valueMap(channel.data[billing_setting.BillingModeField])[modelName] != billing_setting.BillingModeTieredExpr {
					continue
				}
				var upstreamValue any = nil

				if val, exists := valueMap(channel.data[ratioType])[modelName]; exists {
					upstreamValue = normalizeSyncValue(ratioType, val)
					hasUpstreamValue = true

					if localValue != nil && !valuesEqual(localValue, upstreamValue) {
						hasDifference = true
					} else if valuesEqual(localValue, upstreamValue) {
						upstreamValue = "same"
					}
				}
				if upstreamValue == nil && localValue == nil {
					upstreamValue = "same"
				}

				if localValue == nil && upstreamValue != nil && upstreamValue != "same" {
					hasDifference = true
				}

				upstreamValues[channel.name] = upstreamValue

				confidenceValues[channel.name] = confidenceMap[channel.name][modelName]
			}

			shouldInclude := false

			if localValue != nil {
				if hasDifference {
					shouldInclude = true
				}
			} else {
				if hasUpstreamValue {
					shouldInclude = true
				}
			}

			if shouldInclude {
				if differences[modelName] == nil {
					differences[modelName] = make(map[string]dto.DifferenceItem)
				}
				differences[modelName][ratioType] = dto.DifferenceItem{
					Current:    localValue,
					Upstreams:  upstreamValues,
					Confidence: confidenceValues,
				}
			}
		}
	}

	channelHasDiff := make(map[string]bool)
	for _, ratioMap := range differences {
		for _, item := range ratioMap {
			for chName, val := range item.Upstreams {
				if val != nil && val != "same" {
					channelHasDiff[chName] = true
				}
			}
		}
	}

	for modelName, ratioMap := range differences {
		for ratioType, item := range ratioMap {
			for chName := range item.Upstreams {
				if !channelHasDiff[chName] {
					delete(item.Upstreams, chName)
					delete(item.Confidence, chName)
				}
			}

			allSame := true
			for _, v := range item.Upstreams {
				if v != "same" {
					allSame = false
					break
				}
			}
			if len(item.Upstreams) == 0 || allSame {
				delete(ratioMap, ratioType)
			} else {
				differences[modelName][ratioType] = item
			}
		}

		if len(ratioMap) == 0 {
			delete(differences, modelName)
		}
	}

	return differences
}

func roundRatioValue(value float64) float64 {
	return math.Round(value*1e6) / 1e6
}

func isModelsDevAPIEndpoint(rawURL string) bool {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if strings.ToLower(parsedURL.Hostname()) != modelsDevHost {
		return false
	}
	path := strings.TrimSuffix(parsedURL.Path, "/")
	if path == "" {
		path = "/"
	}
	return path == modelsDevPath
}

// convertOpenRouterToRatioData parses OpenRouter's /v1/models response and converts
// its per-token USD pricing into billing expressions.
//
// [改造] OpenRouter 同步改为表达式计费：
//
//	billing_mode = tiered_expr
//	billing_expr = tier("standard", p * <USD/1M> + c * ...)
//
// 表达式里的系数就是真实的 $/1M 单价（p/c 为 token 数），不再经过“倍率 ×2”的换算。
//
// OpenRouter 的 pricing 字段是持续增长的（2026-10 实测已出现 input_cache_write_1h /
// audio / audio_output / image_output / image_token / input_audio_cache / web_search /
// discount / overrides 等），因此这里按 map 解析而不是固定结构体：
//   - 能映射到结算引擎 token 变量的字段（p/c/cr/cc/cc1h/ai/ao）全部折算进表达式；
//   - overrides 的 min_prompt_tokens（长上下文阶梯价）与 utc_days/utc_start/utc_end
//     （时段价）用 len / weekday("UTC") / hour("UTC") / minute("UTC") 还原；
//   - 覆盖按上游语义「later entries win per key」逐字段生效；
//   - 无法表达的收费项（按次/按张/按搜索等）不猜测，统一汇总 WARN。
func convertOpenRouterToRatioData(reader io.Reader) (map[string]any, error) {
	var orResp struct {
		Data []struct {
			ID      string         `json:"id"`
			Pricing map[string]any `json:"pricing"`
		} `json:"data"`
	}

	if err := common.DecodeJson(reader, &orResp); err != nil {
		return nil, fmt.Errorf("failed to decode OpenRouter response: %w", err)
	}

	modeMap := make(map[string]any)
	exprMap := make(map[string]any)

	// tokenPriceFields 列出能映射到结算引擎 token 变量的字段（OpenRouter 单位：USD/token）。
	tokenPriceFields := []struct {
		key      string
		variable string
	}{
		{"prompt", "p"},
		{"completion", "c"},
		{"input_cache_read", "cr"},
		{"input_cache_write", "cc"},
		{"input_cache_write_1h", "cc1h"},
		{"audio", "ai"},
		{"audio_output", "ao"},
	}
	tokenKeySet := make(map[string]bool, len(tokenPriceFields))
	for _, field := range tokenPriceFields {
		tokenKeySet[field.key] = true
	}

	// 已知但无法并入 token 表达式的字段（按次/按张/按搜索/无对应 token 维度）。
	unsupportedFields := []string{
		"request", "image", "image_output", "image_token", "web_search",
		"internal_reasoning", "input_audio_cache",
	}
	knownNonToken := map[string]bool{
		"request": true, "image": true, "image_output": true, "image_token": true,
		"web_search": true, "internal_reasoning": true, "input_audio_cache": true,
		"discount": true, "overrides": true,
	}
	ignored := make(map[string][]string)

	// priceValue 把 OpenRouter 的数值字段（字符串或数字）解析成 float64；缺失视为 0。
	priceValue := func(pricing map[string]any, key string) (float64, bool) {
		raw, exists := pricing[key]
		if !exists || raw == nil {
			return 0, true
		}
		switch value := raw.(type) {
		case string:
			text := strings.TrimSpace(value)
			if text == "" {
				return 0, true
			}
			parsed, err := strconv.ParseFloat(text, 64)
			if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
				return 0, false
			}
			return parsed, true
		case float64:
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return 0, false
			}
			return value, true
		default:
			return 0, false
		}
	}

	num := func(v float64) string {
		return strconv.FormatFloat(math.Round(v*1e9)/1e9, 'f', -1, 64)
	}

	// wrapBoolCondition 只给含 && / || 的复合条件补括号；单一比较保持裸写，
	// 便于前端价格页把它们识别成普通分档条件。
	enclosedInParens := func(expr string) bool {
		if !strings.HasPrefix(expr, "(") || !strings.HasSuffix(expr, ")") {
			return false
		}
		depth := 0
		for index, char := range expr {
			switch char {
			case '(':
				depth++
			case ')':
				depth--
				if depth == 0 && index != len(expr)-1 {
					return false
				}
			}
		}
		return depth == 0
	}
	wrapBoolCondition := func(expr string) string {
		if strings.ContainsAny(expr, "|&") && !enclosedInParens(expr) {
			return "(" + expr + ")"
		}
		return expr
	}

	// wrapCondition 给复合表达式补括号，避免条件/三元与算术运算的优先级歧义。
	wrapCondition := func(expr string) string {
		if strings.ContainsAny(expr, " ?|&=<>+*/") {
			return "(" + expr + ")"
		}
		return expr
	}

	// presentTokenPrices 只返回 pricing 中显式出现的 token 单价（用于 overrides 继承语义）。
	presentTokenPrices := func(pricing map[string]any) (map[string]float64, bool) {
		out := make(map[string]float64, len(tokenPriceFields))
		for _, field := range tokenPriceFields {
			if _, exists := pricing[field.key]; !exists {
				continue
			}
			value, ok := priceValue(pricing, field.key)
			if !ok {
				return nil, false
			}
			out[field.key] = value
		}
		return out, true
	}

	weekdayIndex := map[string]int{
		"sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3,
		"thursday": 4, "friday": 5, "saturday": 6,
	}
	// OpenRouter 的 utc_start/utc_end 是 HHMM 时钟数（100 = 01:00，1030 = 10:30）。
	timeOfDayUTC := `(hour("UTC") * 100 + minute("UTC"))`
	validHHMM := func(v float64) bool {
		if v < 0 || v >= 2400 || math.Mod(v, 1) != 0 {
			return false
		}
		return math.Mod(v, 100) < 60
	}

	// overrideCondition 把一条 override 的条件编译成表达式；supported=false 表示无法表达。
	overrideCondition := func(entry map[string]any) (condition string, hasCondition bool, supported bool) {
		parts := make([]string, 0, 2)
		if rawDays, exists := entry["utc_days"]; exists {
			list, ok := rawDays.([]any)
			if !ok || len(list) == 0 {
				return "", false, false
			}
			dayConds := make([]string, 0, len(list))
			for _, item := range list {
				name, _ := item.(string)
				index, ok := weekdayIndex[strings.ToLower(strings.TrimSpace(name))]
				if !ok {
					return "", false, false
				}
				dayConds = append(dayConds, fmt.Sprintf(`weekday("UTC") == %d`, index))
			}
			dayExpr := strings.Join(dayConds, " || ")
			if len(dayConds) > 1 {
				// 多选星期必须分组，否则会与后面的时间条件按 && 优先于 || 结合错误。
				dayExpr = "(" + dayExpr + ")"
			}
			parts = append(parts, dayExpr)
		}

		_, hasStartKey := entry["utc_start"]
		_, hasEndKey := entry["utc_end"]
		if hasStartKey || hasEndKey {
			start, startOK := priceValue(entry, "utc_start")
			end, endOK := priceValue(entry, "utc_end")
			if !startOK || !endOK || !validHHMM(start) || !validHHMM(end) {
				return "", false, false
			}
			switch {
			case start == end:
				// 覆盖整个 UTC 日，无需时间条件。
			case end == 0:
				// 区间到当日 24:00 为止。
				parts = append(parts, fmt.Sprintf("%s >= %s", timeOfDayUTC, num(start)))
			case start == 0:
				parts = append(parts, fmt.Sprintf("%s < %s", timeOfDayUTC, num(end)))
			case start < end:
				parts = append(parts, fmt.Sprintf("%s >= %s && %s < %s", timeOfDayUTC, num(start), timeOfDayUTC, num(end)))
			default:
				// 跨午夜：[start, 24:00) ∪ [00:00, end)
				parts = append(parts, fmt.Sprintf("(%s >= %s || %s < %s)", timeOfDayUTC, num(start), timeOfDayUTC, num(end)))
			}
		}

		for key := range entry {
			if tokenKeySet[key] || key == "utc_days" || key == "utc_start" || key == "utc_end" || key == "min_prompt_tokens" {
				continue
			}
			return "", false, false
		}

		if len(parts) == 0 {
			return "", false, true
		}
		return strings.Join(parts, " && "), true, true
	}

	type overrideRule struct {
		// condition 是完整条件串（同时含 len 与时间条件时用 && 连接），供无法拆档时回退使用。
		condition     string
		timeCondition string
		threshold     float64
		hasThreshold  bool
		hasTime       bool
		prices        map[string]float64
	}

	for _, m := range orResp.Data {
		id := strings.TrimSpace(m.ID)
		if id == "" {
			continue
		}
		pricing := m.Pricing
		if pricing == nil {
			pricing = map[string]any{}
		}

		basePrices := make(map[string]float64, len(tokenPriceFields))
		present, ok := presentTokenPrices(pricing)
		if !ok {
			logger.LogWarn(context.Background(), common.LogText("OpenRouter model %s has unparsable pricing, skipped", id))
			continue
		}
		for _, field := range tokenPriceFields {
			basePrices[field.key] = present[field.key]
		}

		requestPrice, reqOK := priceValue(pricing, "request")
		imagePrice, imgOK := priceValue(pricing, "image")
		discount, discOK := priceValue(pricing, "discount")
		if !reqOK || !imgOK || !discOK {
			logger.LogWarn(context.Background(), common.LogText("OpenRouter model %s has unparsable pricing, skipped", id))
			continue
		}

		negative := requestPrice < 0 || imagePrice < 0
		for _, field := range tokenPriceFields {
			if basePrices[field.key] < 0 {
				negative = true
			}
		}
		if negative {
			logger.LogWarn(context.Background(), common.LogText("OpenRouter model %s uses dynamic pricing, skipped", id))
			continue
		}

		factor := 1.0
		if discount > 0 && discount < 1 {
			factor = 1 - discount
			for _, field := range tokenPriceFields {
				basePrices[field.key] *= factor
			}
			requestPrice *= factor
			imagePrice *= factor
		}

		// overrides：长上下文阶梯价 + 时段价，保持上游「later entries win per key」语义。
		rules := make([]overrideRule, 0, 4)
		unsupportedOverrides := false
		if raw, exists := pricing["overrides"]; exists && raw != nil {
			entries, okEntries := raw.([]any)
			if !okEntries {
				unsupportedOverrides = true
			}
			for _, entry := range entries {
				entryMap, okMap := entry.(map[string]any)
				if !okMap {
					unsupportedOverrides = true
					continue
				}
				rule := overrideRule{}
				if _, hasThreshold := entryMap["min_prompt_tokens"]; hasThreshold {
					threshold, thOK := priceValue(entryMap, "min_prompt_tokens")
					if !thOK || threshold < 0 {
						logger.LogWarn(context.Background(), common.LogText("OpenRouter model %s has unparsable min_prompt_tokens override, entry ignored", id))
						unsupportedOverrides = true
						continue
					}
					rule.hasThreshold = true
					rule.threshold = threshold
				}
				timeCondition, hasTime, supported := overrideCondition(entryMap)
				if !supported {
					unsupportedOverrides = true
					continue
				}
				rule.hasTime = hasTime
				rule.timeCondition = timeCondition
				overridePrices, prOK := presentTokenPrices(entryMap)
				if !prOK {
					logger.LogWarn(context.Background(), common.LogText("OpenRouter model %s has unparsable override pricing, entry ignored", id))
					unsupportedOverrides = true
					continue
				}
				if len(overridePrices) == 0 {
					continue
				}
				entryNegative := false
				for key, value := range overridePrices {
					if value < 0 {
						entryNegative = true
						break
					}
					overridePrices[key] = value * factor
				}
				if entryNegative {
					logger.LogWarn(context.Background(), common.LogText("OpenRouter model %s has dynamic override pricing, entry ignored", id))
					unsupportedOverrides = true
					continue
				}
				conditions := make([]string, 0, 2)
				if rule.hasThreshold {
					// 上游语义：total prompt tokens strictly greater than the threshold。
					conditions = append(conditions, fmt.Sprintf("len > %s", num(rule.threshold)))
				}
				if rule.hasTime {
					conditions = append(conditions, rule.timeCondition)
				}
				rule.condition = strings.Join(conditions, " && ")
				rule.prices = overridePrices
				rules = append(rules, rule)
			}
		}

		// priceBody 把一组 USD/token 单价渲染成表达式主体；全零时保持显式零价。
		priceBody := func(prices map[string]float64) string {
			terms := make([]string, 0, len(tokenPriceFields))
			for _, field := range tokenPriceFields {
				value := prices[field.key]
				if value <= 0 {
					continue
				}
				terms = append(terms, fmt.Sprintf("%s * %s", field.variable, num(value*1_000_000)))
			}
			if len(terms) == 0 {
				return "p * 0 + c * 0"
			}
			return strings.Join(terms, " + ")
		}
		mergePrices := func(inherited, overrides map[string]float64) map[string]float64 {
			out := make(map[string]float64, len(tokenPriceFields))
			for key, value := range inherited {
				out[key] = value
			}
			for key, value := range overrides {
				out[key] = value
			}
			return out
		}
		samePrices := func(a, b map[string]float64) bool {
			for _, field := range tokenPriceFields {
				if a[field.key] != b[field.key] {
					return false
				}
			}
			return true
		}
		// buildTierChain 生成「条件 ? tier(名称, 价格) : (下一档)」阶梯表达式。
		// 前端模型广场只识别这种整档形式（tier 叶子 + 纯数字系数），
		// 系数级条件（p * (cond ? a : b)）会被判定为「特殊计费表达式」。
		buildTierChain := func(ordered []overrideRule, label string, accumulate bool) string {
			expression := `tier("standard", ` + priceBody(basePrices) + `)`
			fallback := basePrices
			for i := range ordered {
				inherited := basePrices
				if accumulate {
					inherited = fallback
				}
				merged := mergePrices(inherited, ordered[i].prices)
				// 省略不影响结果的档位：累计档与上一档相同即可省略；
				// 互斥时段档只有在与基础价相同时才能省略（多个时段可能同价）。
				if samePrices(merged, basePrices) || (accumulate && samePrices(merged, fallback)) {
					continue
				}
				expression = fmt.Sprintf("%s ? tier(%q, %s) : (%s)", wrapBoolCondition(ordered[i].condition), label, priceBody(merged), expression)
				fallback = merged
			}
			return expression
		}

		thresholdOnly := true
		timeOnly := true
		for _, rule := range rules {
			if !rule.hasThreshold || rule.hasTime {
				thresholdOnly = false
			}
			if !rule.hasTime || rule.hasThreshold {
				timeOnly = false
			}
		}

		expression := ""
		switch {
		case len(rules) == 0:
			expression = `tier("standard", ` + priceBody(basePrices) + `)`
		case thresholdOnly:
			// 阈值档：按阈值升序累计继承，高阈值分支在最外层。
			ordered := make([]overrideRule, len(rules))
			copy(ordered, rules)
			sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].threshold < ordered[j].threshold })
			expression = buildTierChain(ordered, "long-context", true)
		case timeOnly:
			// 时段档：后出现的 entry 优先，各档只覆盖自己显式给出的字段。
			expression = buildTierChain(rules, "scheduled", false)
		default:
			// 混合条件（len + 时段）无法用单条阶梯表达，退回逐字段系数条件，保证计费正确。
			terms := make([]string, 0, len(tokenPriceFields))
			for _, field := range tokenPriceFields {
				coefficient := num(basePrices[field.key] * 1_000_000)
				simple := true
				for i := 0; i < len(rules); i++ {
					value, exists := rules[i].prices[field.key]
					if !exists {
						continue
					}
					simple = false
					term := num(value * 1_000_000)
					if rules[i].condition == "" {
						coefficient = term
						continue
					}
					coefficient = fmt.Sprintf("%s ? %s : %s", wrapCondition(rules[i].condition), term, wrapCondition(coefficient))
				}
				if coefficient == "0" || coefficient == "0.0" {
					continue
				}
				if !simple {
					coefficient = wrapCondition(coefficient)
				}
				terms = append(terms, fmt.Sprintf("%s * %s", field.variable, coefficient))
			}
			if len(terms) == 0 {
				expression = `tier("standard", p * 0 + c * 0)`
			} else {
				expression = `tier("standard", ` + strings.Join(terms, " + ") + `)`
			}
			ignored["overrides(mixed conditions, UI shows special expression)"] = appendUnique(ignored["overrides(mixed conditions, UI shows special expression)"], id)
		}

		hasTokenPrice := false
		for _, field := range tokenPriceFields {
			if basePrices[field.key] > 0 {
				hasTokenPrice = true
				break
			}
		}
		if !hasTokenPrice {
			for _, rule := range rules {
				for _, value := range rule.prices {
					if value > 0 {
						hasTokenPrice = true
						break
					}
				}
				if hasTokenPrice {
					break
				}
			}
		}
		if hasTokenPrice {
			if requestPrice > 0 {
				ignored["request"] = appendUnique(ignored["request"], id)
			}
			if imagePrice > 0 {
				ignored["image"] = appendUnique(ignored["image"], id)
			}
		} else if requestPrice > 0 {
			expression = `tier("request", fixed(` + num(requestPrice) + `))`
		} else if imagePrice > 0 {
			expression = `tier("image", fixed(` + num(imagePrice) + `)) * image_count`
		}

		if err := billing_setting.SmokeTestExpr(expression); err != nil {
			logger.LogWarn(context.Background(), common.LogText("OpenRouter model %s expression rejected: %s", id, err.Error()))
			continue
		}

		// 统计无法表达的收费项（按次/按张/按搜索/未知条件等），统一汇总告警。
		for _, key := range unsupportedFields {
			value, parseOK := priceValue(pricing, key)
			if parseOK && value > 0 {
				ignored[key] = appendUnique(ignored[key], id)
			}
		}
		if unsupportedOverrides {
			ignored["overrides(unsupported)"] = appendUnique(ignored["overrides(unsupported)"], id)
		}
		for key := range pricing {
			if tokenKeySet[key] || knownNonToken[key] {
				continue
			}
			value, parseOK := priceValue(pricing, key)
			if parseOK && value != 0 {
				ignored["unknown:"+key] = appendUnique(ignored["unknown:"+key], id)
			}
		}

		modeMap[id] = billing_setting.BillingModeTieredExpr
		exprMap[id] = expression
	}

	if len(ignored) > 0 {
		keys := make([]string, 0, len(ignored))
		for key := range ignored {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			models := ignored[key]
			sample := models
			if len(sample) > 3 {
				sample = sample[:3]
			}
			parts = append(parts, fmt.Sprintf("%s=%d[%s]", key, len(models), strings.Join(sample, ",")))
		}
		logger.LogWarn(context.Background(), common.LogText("OpenRouter sync: fees that cannot be expressed in token pricing (ignored, verify manually): %s", strings.Join(parts, "; ")))
	}

	converted := make(map[string]any)
	if len(modeMap) > 0 {
		converted[billing_setting.BillingModeField] = modeMap
		converted[billing_setting.BillingExprField] = exprMap
	}
	return converted, nil
}

// appendUnique 去重追加，避免同一模型重复计数。
func appendUnique(list []string, value string) []string {
	for _, item := range list {
		if item == value {
			return list
		}
	}
	return append(list, value)
}

type modelsDevProvider struct {
	Models map[string]modelsDevModel `json:"models"`
}

type modelsDevModel struct {
	Cost             modelsDevCost `json:"cost"`
	CanonicalModelID string        `json:"canonical_model_id"`
}

type modelsDevCost struct {
	Input     *float64 `json:"input"`
	Output    *float64 `json:"output"`
	CacheRead *float64 `json:"cache_read"`
}

type modelsDevCandidate struct {
	Provider  string
	Input     float64
	Output    *float64
	CacheRead *float64
	// Canonical means this entry comes from the model's own vendor
	// (canonical_model_id prefix), i.e. the official list price.
	Canonical bool
}

func cloneFloatPtr(v *float64) *float64 {
	if v == nil {
		return nil
	}
	out := *v
	return &out
}

func isValidNonNegativeCost(v float64) bool {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return false
	}
	return v >= 0
}

// isCanonicalModelsDevProvider reports whether provider owns the model.
// models.dev tags every entry with canonical_model_id (e.g.
// "alibaba/qwen3.8-flash"); its prefix is the vendor that publishes the
// model, so that entry carries the official list price.
func isCanonicalModelsDevProvider(provider, canonicalModelID string) bool {
	if strings.TrimSpace(canonicalModelID) == "" {
		return false
	}
	prefix, _, ok := strings.Cut(canonicalModelID, "/")
	if !ok {
		return false
	}
	return strings.EqualFold(prefix, provider)
}

func buildModelsDevCandidate(provider string, model modelsDevModel) (modelsDevCandidate, bool) {
	cost := model.Cost
	if cost.Input == nil {
		return modelsDevCandidate{}, false
	}

	input := *cost.Input
	if !isValidNonNegativeCost(input) {
		return modelsDevCandidate{}, false
	}

	var output *float64
	if cost.Output != nil {
		if !isValidNonNegativeCost(*cost.Output) {
			return modelsDevCandidate{}, false
		}
		output = cloneFloatPtr(cost.Output)
	}

	// input=0/output>0 cannot be transformed into local ratio.
	if input == 0 && output != nil && *output > 0 {
		return modelsDevCandidate{}, false
	}

	var cacheRead *float64
	if cost.CacheRead != nil && isValidNonNegativeCost(*cost.CacheRead) {
		cacheRead = cloneFloatPtr(cost.CacheRead)
	}

	return modelsDevCandidate{
		Provider:  provider,
		Input:     input,
		Output:    output,
		CacheRead: cacheRead,
		Canonical: isCanonicalModelsDevProvider(provider, model.CanonicalModelID),
	}, true
}

func shouldReplaceModelsDevCandidate(current, next modelsDevCandidate) bool {
	// Vendor-owned entries are the official list price and must win over any
	// reseller, otherwise "cheapest non-zero" would silently replace the
	// published price with a discounted marketplace one.
	if current.Canonical != next.Canonical {
		return next.Canonical
	}
	currentNonZero := current.Input > 0
	nextNonZero := next.Input > 0
	if currentNonZero != nextNonZero {
		// Prefer non-zero pricing data; this matches "cheapest non-zero" conflict policy.
		return nextNonZero
	}
	if nextNonZero && !nearlyEqual(next.Input, current.Input) {
		return next.Input < current.Input
	}
	// Stable tie-breaker for deterministic result.
	return next.Provider < current.Provider
}

// convertModelsDevToRatioData parses models.dev /api.json and converts
// provider pricing metadata into local ratio format.
// models.dev costs are USD per 1M tokens:
//
//	model_ratio = input_cost_per_1M / 2
//	completion_ratio = output_cost / input_cost
//	cache_ratio = cache_read_cost / input_cost
//
// Duplicate model keys across providers are resolved by preferring the entry
// whose provider owns the model (canonical_model_id prefix), i.e. the vendor's
// official list price. Only when no vendor entry exists does it fall back to
// the cheapest non-zero input cost. If only zero-priced candidates exist,
// a zero ratio is kept.
func convertModelsDevToRatioData(reader io.Reader) (map[string]any, error) {
	var upstreamData map[string]modelsDevProvider
	if err := common.DecodeJson(reader, &upstreamData); err != nil {
		return nil, fmt.Errorf("failed to decode models.dev response: %w", err)
	}
	if len(upstreamData) == 0 {
		return nil, fmt.Errorf("empty models.dev response")
	}

	providers := make([]string, 0, len(upstreamData))
	for provider := range upstreamData {
		providers = append(providers, provider)
	}
	sort.Strings(providers)

	selectedCandidates := make(map[string]modelsDevCandidate)
	for _, provider := range providers {
		providerData := upstreamData[provider]
		if len(providerData.Models) == 0 {
			continue
		}

		modelNames := make([]string, 0, len(providerData.Models))
		for modelName := range providerData.Models {
			modelNames = append(modelNames, modelName)
		}
		sort.Strings(modelNames)

		for _, modelName := range modelNames {
			candidate, ok := buildModelsDevCandidate(provider, providerData.Models[modelName])
			if !ok {
				continue
			}
			current, exists := selectedCandidates[modelName]
			if !exists || shouldReplaceModelsDevCandidate(current, candidate) {
				selectedCandidates[modelName] = candidate
			}
		}
	}

	if len(selectedCandidates) == 0 {
		return nil, fmt.Errorf("no valid models.dev pricing entries found")
	}

	modelRatioMap := make(map[string]any)
	completionRatioMap := make(map[string]any)
	cacheRatioMap := make(map[string]any)

	for modelName, candidate := range selectedCandidates {
		if candidate.Input == 0 {
			modelRatioMap[modelName] = 0.0
			continue
		}

		modelRatio := candidate.Input * float64(ratio_setting.USD) / modelsDevInputCostRatioBase
		modelRatioMap[modelName] = roundRatioValue(modelRatio)

		if candidate.Output != nil {
			completionRatio := *candidate.Output / candidate.Input
			completionRatioMap[modelName] = roundRatioValue(completionRatio)
		}

		if candidate.CacheRead != nil {
			cacheRatio := *candidate.CacheRead / candidate.Input
			cacheRatioMap[modelName] = roundRatioValue(cacheRatio)
		}
	}

	converted := make(map[string]any)
	if len(modelRatioMap) > 0 {
		converted["model_ratio"] = modelRatioMap
	}
	if len(completionRatioMap) > 0 {
		converted["completion_ratio"] = completionRatioMap
	}
	if len(cacheRatioMap) > 0 {
		converted["cache_ratio"] = cacheRatioMap
	}
	return converted, nil
}

func GetSyncableChannels(c *gin.Context) {
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	var syncableChannels []dto.SyncableChannel
	for _, channel := range channels {
		if channel.GetBaseURL() != "" {
			syncableChannels = append(syncableChannels, dto.SyncableChannel{
				ID:      channel.Id,
				Name:    channel.Name,
				BaseURL: channel.GetBaseURL(),
				Status:  channel.Status,
				Type:    channel.Type,
			})
		}
	}

	syncableChannels = append(syncableChannels, dto.SyncableChannel{
		ID:      officialRatioPresetID,
		Name:    officialRatioPresetName,
		BaseURL: officialRatioPresetBaseURL,
		Status:  1,
	})

	syncableChannels = append(syncableChannels, dto.SyncableChannel{
		ID:      modelsDevPresetID,
		Name:    modelsDevPresetName,
		BaseURL: modelsDevPresetBaseURL,
		Status:  1,
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    syncableChannels,
	})
}
