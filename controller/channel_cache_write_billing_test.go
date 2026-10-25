package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/config"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const cacheWriteBillingModel = "cache-write-billing"

// 同一份上游用量（输入 1000 / 缓存读 500 / 缓存写 2000 / 输出 10），
// 逐项验证缓存写入是否被计费。期望值按 p*4 + c*20 + cr*0.2 + cc*5 + cc1h*8 反算。
func TestCacheWriteTokensAreBilledPerChannelProtocol(t *testing.T) {
	for _, tc := range []struct {
		name      string
		channel   int
		wantPath  string
		stream    bool
		upstream  func(http.ResponseWriter, *http.Request)
		wantQuota int
		why       string
	}{
		{
			name: "anthropic aggregate only", channel: constant.ChannelTypeAnthropic, wantPath: "/v1/messages",
			upstream: claudeAggregateOnly, wantQuota: 7150,
			why: "上游只给聚合 cache_creation_input_tokens 时，2000 缓存写入必须按 cc 计费",
		},
		{
			name: "anthropic with cache_creation split", channel: constant.ChannelTypeAnthropic, wantPath: "/v1/messages",
			upstream: claudeWithSplit, wantQuota: 7900,
			why: "有分档时 cc=1500@5、cc1h=500@8，计费正确",
		},
		{
			name: "anthropic aggregate only stream", channel: constant.ChannelTypeAnthropic, wantPath: "/v1/messages",
			stream: true, upstream: claudeAggregateOnlyStream, wantQuota: 7150,
			why: "流式同样必须把聚合缓存写入按 cc 计费（当前已正确，需保持）",
		},
		{
			name: "openai compatible", channel: constant.ChannelTypeSub2API, wantPath: "/v1/chat/completions",
			upstream: openAICompatible, wantQuota: 6150,
			why: "OpenAI 格式没有缓存写入字段，2000 token 被当成普通输入按 4 计",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			runCacheWriteBillingCase(t, tc.channel, tc.wantPath, tc.stream, tc.upstream, tc.wantQuota, tc.why)
		})
	}
}

func claudeAggregateOnly(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"id":"msg_1","type":"message","role":"assistant","model":"claude-x","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn","usage":{"input_tokens":1000,"output_tokens":10,"cache_read_input_tokens":500,"cache_creation_input_tokens":2000}}`))
}

func claudeWithSplit(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"id":"msg_1","type":"message","role":"assistant","model":"claude-x","content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn","usage":{"input_tokens":1000,"output_tokens":10,"cache_read_input_tokens":500,"cache_creation_input_tokens":2000,"cache_creation":{"ephemeral_5m_input_tokens":1500,"ephemeral_1h_input_tokens":500}}}`))
}

func claudeAggregateOnlyStream(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	for _, event := range []string{
		`{"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-x","content":[],"stop_reason":null,"usage":{"input_tokens":1000,"output_tokens":1,"cache_read_input_tokens":500,"cache_creation_input_tokens":2000}}}`,
		`{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
		`{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}`,
		`{"type":"content_block_stop","index":0}`,
		`{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}`,
		`{"type":"message_stop"}`,
	} {
		_, _ = fmt.Fprintf(w, "data: %s\n\n", event)
	}
}

func openAICompatible(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"id":"chat_1","object":"chat.completion","created":1,"model":"claude-x","choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3500,"completion_tokens":10,"total_tokens":3510,"prompt_tokens_details":{"cached_tokens":500}}}`))
}

func runCacheWriteBillingCase(t *testing.T, channelType int, wantPath string, stream bool, upstreamHandler func(http.ResponseWriter, *http.Request), wantQuota int, why string) {
	t.Helper()
	user, token := setupResponsesWSRequestTest(t)
	require.NoError(t, model.DB.Model(user).Updates(map[string]any{
		"quota":   1_000_000,
		"setting": `{"billing_preference":"wallet_only"}`,
	}).Error)
	require.NoError(t, model.DB.Model(token).Update("remain_quota", 1_000_000).Error)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}))
	require.NoError(t, model.LOG_DB.AutoMigrate(&model.Log{}))

	previousBatch, previousLogs, previousCount, previousQuota := common.BatchUpdateEnabled, common.LogConsumeEnabled, constant.CountToken, common.QuotaPerUnit
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	common.BatchUpdateEnabled, common.LogConsumeEnabled, constant.CountToken, common.QuotaPerUnit = false, true, false, 500000
	t.Cleanup(func() {
		common.BatchUpdateEnabled, common.LogConsumeEnabled, constant.CountToken, common.QuotaPerUnit = previousBatch, previousLogs, previousCount, previousQuota
		constant.StreamingTimeout = previousTimeout
	})
	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		switch key {
		case "billing_setting.billing_mode", "billing_setting.billing_expr", "group_ratio_setting.group_ratio":
			saved[key] = value
		}
		return nil
	}))
	t.Cleanup(func() { require.NoError(t, config.GlobalConfig.LoadFromDB(saved)) })
	modes, err := common.Marshal(map[string]string{cacheWriteBillingModel: "tiered_expr"})
	require.NoError(t, err)
	expressions, err := common.Marshal(map[string]string{cacheWriteBillingModel: `p * 4 + c * 20 + cr * 0.2 + cc * 5 + cc1h * 8`})
	require.NoError(t, err)
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode":    string(modes),
		"billing_setting.billing_expr":    string(expressions),
		"group_ratio_setting.group_ratio": `{"default":1}`,
	}))

	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		upstreamHandler(w, r)
	}))
	t.Cleanup(upstream.Close)

	baseURL := upstream.URL
	channel := &model.Channel{
		Name: "cache-write-upstream", Key: "upstream-key", Status: common.ChannelStatusEnabled,
		Type: channelType, Group: "default", Models: cacheWriteBillingModel, BaseURL: &baseURL,
	}
	mapping := `{"` + cacheWriteBillingModel + `":"claude-x"}`
	channel.ModelMapping = &mapping
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, model.DB.Create(&model.Ability{ChannelId: channel.Id, Model: cacheWriteBillingModel, Group: "default", Enabled: true}).Error)
	t.Cleanup(func() {
		require.NoError(t, model.LOG_DB.Where("user_id = ?", user.Id).Delete(&model.Log{}).Error)
		require.NoError(t, model.DB.Where("channel_id = ?", channel.Id).Delete(&model.Ability{}).Error)
		require.NoError(t, model.DB.Unscoped().Delete(channel).Error)
	})

	engine := gin.New()
	engine.POST("/v1/chat/completions", middleware.TokenAuth(), middleware.ModelRequestRateLimit(), middleware.Distribute(), func(c *gin.Context) {
		Relay(c, types.RelayFormatOpenAI)
	})
	gateway := httptest.NewServer(engine)
	t.Cleanup(gateway.Close)

	payload := `{"model":"` + cacheWriteBillingModel + `","max_tokens":64,"messages":[{"role":"user","content":"hi"}]`
	if stream {
		payload += `,"stream":true`
	}
	payload += `}`
	request, err := http.NewRequest(http.MethodPost, gateway.URL+"/v1/chat/completions", strings.NewReader(payload))
	require.NoError(t, err)
	request.Header.Set("Authorization", "Bearer sk-"+token.Key)
	request.Header.Set("Content-Type", "application/json")
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	require.NoError(t, err)
	body, _ := io.ReadAll(response.Body)
	_ = response.Body.Close()
	require.Equal(t, http.StatusOK, response.StatusCode, string(body))

	assert.Equal(t, wantPath, gotPath, "上游调用路径必须跟随渠道协议")
	if !stream {
		var converted map[string]any
		require.NoError(t, json.Unmarshal(body, &converted))
		assert.Contains(t, converted, "choices", "客户端始终拿到 OpenAI 格式响应")
	}

	var log model.Log
	require.Eventually(t, func() bool {
		return model.LOG_DB.Where("user_id = ?", user.Id).Take(&log).Error == nil
	}, 5*time.Second, 50*time.Millisecond)
	assert.Equal(t, wantQuota, log.Quota, why)

	var other map[string]any
	require.NoError(t, common.UnmarshalJsonStr(log.Other, &other))
	assert.Equal(t, float64(500), other["cache_tokens"], "缓存读取两种协议都应计入")
}
