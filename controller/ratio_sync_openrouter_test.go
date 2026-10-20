package controller

import (
	"strings"
	"testing"
)

func convertOpenRouterJSON(t *testing.T, body string) map[string]any {
	t.Helper()
	converted, err := convertOpenRouterToRatioData(strings.NewReader(body))
	if err != nil {
		t.Fatalf("convert: %v", err)
	}
	return converted
}

func openRouterExpr(t *testing.T, converted map[string]any, id string) (string, bool) {
	t.Helper()
	exprs, ok := converted["billing_expr"].(map[string]any)
	if !ok {
		t.Fatal("billing_expr map missing")
	}
	value, exists := exprs[id]
	if !exists {
		return "", false
	}
	text, _ := value.(string)
	return text, true
}

func assertExprs(t *testing.T, converted map[string]any, cases map[string]string) {
	t.Helper()
	for id, want := range cases {
		got, ok := openRouterExpr(t, converted, id)
		if !ok {
			t.Fatalf("%s: expression missing", id)
		}
		if got != want {
			t.Fatalf("%s:\n got: %s\nwant: %s", id, got, want)
		}
	}
}

func TestConvertOpenRouterEmitsBillingExpressions(t *testing.T) {
	body := `{"data":[
          {"id":"vendor/text","pricing":{"prompt":"0.000002","completion":"0.000008","input_cache_read":"0.0000005","input_cache_write":"0.0000025"}},
          {"id":"vendor/free","pricing":{"prompt":"0","completion":"0"}},
          {"id":"vendor/dynamic","pricing":{"prompt":"-1","completion":"-1"}},
          {"id":"vendor/per-request","pricing":{"prompt":"0","completion":"0","request":"0.001"}},
          {"id":"vendor/per-image","pricing":{"prompt":"0","completion":"0","image":"0.04"}},
          {"id":"vendor/text-with-request","pricing":{"prompt":"0.000001","completion":"0.000002","request":"0.001"}}
        ]}`

	converted := convertOpenRouterJSON(t, body)

	modes, ok := converted["billing_mode"].(map[string]any)
	if !ok {
		t.Fatal("billing_mode map missing")
	}
	if modes["vendor/text"] != "tiered_expr" {
		t.Fatalf("expected tiered_expr, got %v", modes["vendor/text"])
	}

	assertExprs(t, converted, map[string]string{
		"vendor/text":              `tier("standard", p * 2 + c * 8 + cr * 0.5 + cc * 2.5)`,
		"vendor/free":              `tier("standard", p * 0 + c * 0)`,
		"vendor/per-request":       `tier("request", fixed(0.001))`,
		"vendor/per-image":         `tier("image", fixed(0.04)) * image_count`,
		"vendor/text-with-request": `tier("standard", p * 1 + c * 2)`,
	})

	if _, ok := openRouterExpr(t, converted, "vendor/dynamic"); ok {
		t.Fatal("negative (dynamic) prices must be skipped")
	}
}

// 覆盖 2026-10 新增的定价字段：1 小时缓存写、音频输入/输出、折扣、数字型价格。
func TestConvertOpenRouterCoversNewPricingFields(t *testing.T) {
	body := `{"data":[
          {"id":"vendor/claude","pricing":{
              "prompt":"0.000001","completion":"0.000005",
              "input_cache_read":"0.0000001","input_cache_write":"0.00000125",
              "input_cache_write_1h":"0.000002"}},
          {"id":"vendor/audio","pricing":{
              "prompt":"0.0000006","completion":"0.0000024",
              "audio":"0.0000006","audio_output":"0.0000024"}},
          {"id":"vendor/discount","pricing":{
              "prompt":"0.00001","completion":"0.00005","discount":"0.5"}},
          {"id":"vendor/numeric","pricing":{
              "prompt":0.000002,"completion":0.000004}}
        ]}`

	converted := convertOpenRouterJSON(t, body)
	assertExprs(t, converted, map[string]string{
		"vendor/claude":   `tier("standard", p * 1 + c * 5 + cr * 0.1 + cc * 1.25 + cc1h * 2)`,
		"vendor/audio":    `tier("standard", p * 0.6 + c * 2.4 + ai * 0.6 + ao * 2.4)`,
		"vendor/discount": `tier("standard", p * 5 + c * 25)`,
		"vendor/numeric":  `tier("standard", p * 2 + c * 4)`,
	})
}

// 长上下文阶梯价（min_prompt_tokens）逐字段覆盖：后出现的 entry 优先。
func TestConvertOpenRouterRestoresLongContextOverrides(t *testing.T) {
	body := `{"data":[
          {"id":"vendor/long-context","pricing":{
              "prompt":"0.000001","completion":"0.000002",
              "overrides":[
                {"min_prompt_tokens":100000,"prompt":"0.000002","completion":"0.000004"}
              ]}},
          {"id":"vendor/two-tiers","pricing":{
              "prompt":"0.000001","completion":"0.000001",
              "overrides":[
                {"min_prompt_tokens":100000,"completion":"0.000002"},
                {"min_prompt_tokens":200000,"prompt":"0.000003","completion":"0.000004"}
              ]}}
        ]}`

	converted := convertOpenRouterJSON(t, body)
	assertExprs(t, converted, map[string]string{
		"vendor/long-context": `tier("standard", p * ((len > 100000) ? 2 : 1) + c * ((len > 100000) ? 4 : 2))`,
		// prompt 只有 200000 档设置；completion 两档都有，高阈值必须在外层。
		"vendor/two-tiers": `tier("standard", p * ((len > 200000) ? 3 : 1) + c * ((len > 200000) ? 4 : ((len > 100000) ? 2 : 1)))`,
	})
}

// 时段价（utc_days / utc_start / utc_end）应还原为 weekday/hour/minute("UTC") 条件。
func TestConvertOpenRouterRestoresTimeWindowOverrides(t *testing.T) {
	body := `{"data":[
          {"id":"vendor/weekend","pricing":{
              "prompt":"0.000001","completion":"0.000002",
              "overrides":[{"utc_days":["saturday"],"prompt":"0.0000005","completion":"0.000001"}]}},
          {"id":"vendor/hours","pricing":{
              "prompt":"0.0000003","completion":"0.0000012",
              "overrides":[
                {"utc_days":["monday","tuesday"],"utc_start":0,"utc_end":100,"prompt":"0.00000015","completion":"0.0000006"},
                {"utc_days":["monday","tuesday"],"utc_start":1000,"utc_end":0,"prompt":"0.0000003"}
              ]}},
          {"id":"vendor/wrap-around","pricing":{
              "prompt":"0.000001",
              "overrides":[{"utc_start":2200,"utc_end":600,"prompt":"0.0000005"}]}}
        ]}`

	converted := convertOpenRouterJSON(t, body)
	assertExprs(t, converted, map[string]string{
		"vendor/weekend":     `tier("standard", p * ((weekday("UTC") == 6) ? 0.5 : 1) + c * ((weekday("UTC") == 6) ? 1 : 2))`,
		"vendor/hours":       `tier("standard", p * (((weekday("UTC") == 1 || weekday("UTC") == 2) && (hour("UTC") * 100 + minute("UTC")) >= 1000) ? 0.3 : (((weekday("UTC") == 1 || weekday("UTC") == 2) && (hour("UTC") * 100 + minute("UTC")) < 100) ? 0.15 : 0.3)) + c * (((weekday("UTC") == 1 || weekday("UTC") == 2) && (hour("UTC") * 100 + minute("UTC")) < 100) ? 0.6 : 1.2))`,
		"vendor/wrap-around": `tier("standard", p * ((((hour("UTC") * 100 + minute("UTC")) >= 2200 || (hour("UTC") * 100 + minute("UTC")) < 600)) ? 0.5 : 1))`,
	})
}

// 无法表达的收费项不能导致模型被跳过；未知字段要保留可观测性。
func TestConvertOpenRouterKeepsModelsWithUnexpressibleFees(t *testing.T) {
	body := `{"data":[
          {"id":"vendor/web-search","pricing":{
              "prompt":"0.000008","completion":"0.000015","web_search":"0.01"}},
          {"id":"vendor/image-output","pricing":{
              "prompt":"0.000008","completion":"0.000015","image_output":"0.00003"}},
          {"id":"vendor/brand-new-field","pricing":{
              "prompt":"0.000001","completion":"0.000002","future_fee":"0.5"}},
          {"id":"vendor/unknown-condition","pricing":{
              "prompt":"0.000001","completion":"0.000002",
              "overrides":[{"some_future_condition":"x","prompt":"0.000003"}]}}
        ]}`

	converted := convertOpenRouterJSON(t, body)
	assertExprs(t, converted, map[string]string{
		"vendor/web-search":        `tier("standard", p * 8 + c * 15)`,
		"vendor/image-output":      `tier("standard", p * 8 + c * 15)`,
		"vendor/brand-new-field":   `tier("standard", p * 1 + c * 2)`,
		"vendor/unknown-condition": `tier("standard", p * 1 + c * 2)`,
	})
}
