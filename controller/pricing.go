package controller

import (
	"maps"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func filterPricingByUsableGroups(pricing []model.Pricing, usableGroup map[string]string) []model.Pricing {
	if len(pricing) == 0 {
		return pricing
	}
	if len(usableGroup) == 0 {
		return []model.Pricing{}
	}

	filtered := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		if common.StringsContains(item.EnableGroup, "all") {
			filtered = append(filtered, item)
			continue
		}
		for _, group := range item.EnableGroup {
			if _, ok := usableGroup[group]; ok {
				filtered = append(filtered, item)
				break
			}
		}
	}
	return filtered
}

// lifecycleFilterStates 是 /api/pricing?lifecycle= 允许的取值。
// unknown 代表元数据里 lifecycle 为空（官方未声明），与 ga 区分开。
var lifecycleFilterStates = map[string]bool{
	"ga":         true,
	"preview":    true,
	"legacy":     true,
	"deprecated": true,
	"retired":    true,
	"unknown":    true,
}

// parseLifecycleFilter 解析逗号分隔的 lifecycle 查询参数。
// 空值、all 或全部非法时返回 nil，表示不过滤。
func parseLifecycleFilter(raw string) map[string]bool {
	out := make(map[string]bool)
	for _, part := range strings.Split(raw, ",") {
		key := strings.ToLower(strings.TrimSpace(part))
		if key == "" || key == "all" {
			continue
		}
		if lifecycleFilterStates[key] {
			out[key] = true
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// filterPricingByLifecycle 只保留 lifecycle 命中请求状态的模型。
func filterPricingByLifecycle(pricing []model.Pricing, states map[string]bool) []model.Pricing {
	if len(states) == 0 {
		return pricing
	}
	filtered := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		state := item.Lifecycle
		if state == "" {
			state = "unknown"
		}
		if states[state] {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func GetPricing(c *gin.Context) {
	pricing := model.GetPricing()
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	maps.Copy(groupRatio, ratio_setting.GetGroupRatioCopy())
	var group string
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
			for g := range groupRatio {
				ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
				if ok {
					groupRatio[g] = ratio
				}
			}
		}
	}

	usableGroup = service.GetUserUsableGroups(group)
	pricing = filterPricingByUsableGroups(pricing, usableGroup)
	pricing = filterPricingByLifecycle(pricing, parseLifecycleFilter(c.Query("lifecycle")))
	// check groupRatio contains usableGroup
	for group := range ratio_setting.GetGroupRatioCopy() {
		if _, ok := usableGroup[group]; !ok {
			delete(groupRatio, group)
		}
	}

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroup(group),
		"pricing_version":    "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccessT(c, "Model ratios reset", nil)
}
