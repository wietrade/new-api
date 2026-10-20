package main

// pricing-expr-migrate 把仍然使用倍率（ratio）计费的模型批量转换为表达式计费。
//
// 用法（工作目录必须是数据库所在目录，默认 one-api.db）：
//   pricing-expr-migrate            # 只做试算，打印将要写入的内容
//   pricing-expr-migrate -apply     # 真正写入 billing_setting.billing_mode / billing_expr
//
// 转换复用 model.PreviewModelPricingConversion，与前端“Convert to expression”完全同一套规则。

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var pricingOptionKeys = []string{
	"ModelRatio", "CompletionRatio", "CacheRatio", "CreateCacheRatio",
	"ImageRatio", "AudioRatio", "AudioCompletionRatio", "ModelPrice",
}

func loadMap(key string) map[string]float64 {
	raw, ok := common.OptionMap[key]
	if !ok || raw == "" {
		return map[string]float64{}
	}
	result := map[string]float64{}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		fmt.Fprintf(os.Stderr, "warn: cannot parse option %s: %v\n", key, err)
	}
	return result
}

func main() {
	apply := flag.Bool("apply", false, "write billing_mode/billing_expr into the database")
	verbose := flag.Bool("v", false, "print every converted model")
	dumpDefaults := flag.String("dump-defaults", "", "write built-in default pricing tables to this JSON file and exit")
	flag.Parse()

	if *dumpDefaults != "" {
		tables := ratio_setting.GetDefaultPricingMaps()
		encoded, err := json.Marshal(tables)
		if err != nil {
			fmt.Fprintf(os.Stderr, "marshal defaults: %v\n", err)
			os.Exit(1)
		}
		if err := os.WriteFile(*dumpDefaults, encoded, 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "write defaults: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("defaults written to %s\n", *dumpDefaults)
		return
	}

	if err := model.InitDB(); err != nil {
		fmt.Fprintf(os.Stderr, "init db: %v\n", err)
		os.Exit(1)
	}
	model.InitOptionMap()

	maps := map[string]map[string]float64{}
	names := map[string]bool{}
	for _, key := range pricingOptionKeys {
		maps[key] = loadMap(key)
		for name := range maps[key] {
			names[name] = true
		}
	}

	sorted := make([]string, 0, len(names))
	for name := range names {
		sorted = append(sorted, name)
	}
	sort.Strings(sorted)

	modes := billing_setting.GetBillingModeCopy()
	exprs := billing_setting.GetBillingExprCopy()

	converted := map[string]string{}
	skipped := map[string]string{}
	for _, name := range sorted {
		if modes[name] == billing_setting.BillingModeTieredExpr {
			continue
		}
		draft := model.PricingValues{}
		for _, key := range pricingOptionKeys {
			if value, ok := maps[key][name]; ok {
				draft[key] = value
			}
		}
		// 只配了 completion/cache 的模型，输入价来自内置默认表；把默认值补进草稿，
		// 转换结果才与当前实际生效的价格一致（配置值优先）。
		defaults := ratio_setting.GetDefaultPricingMaps()
		for _, key := range pricingOptionKeys {
			if _, ok := draft[key]; ok {
				continue
			}
			if value, ok := defaults[key][name]; ok {
				draft[key] = value
			}
		}
		conv, err := model.PreviewModelPricingConversion(name, draft)
		if err != nil {
			skipped[name] = err.Error()
			continue
		}
		if conv.UnsupportedReason != "" {
			skipped[name] = conv.UnsupportedReason
			continue
		}
		if conv.Expression == "" {
			skipped[name] = "empty expression"
			continue
		}
		converted[name] = conv.Expression
	}

	fmt.Printf("models with pricing: %d, already expression: %d, convertible: %d, skipped: %d\n",
		len(sorted), len(exprs), len(converted), len(skipped))
	if *verbose || !*apply {
		shown := 0
		for _, name := range sorted {
			expr, ok := converted[name]
			if !ok {
				continue
			}
			if shown >= 15 && !*verbose {
				break
			}
			fmt.Printf("  %-45s %s\n", name, expr)
			shown++
		}
	}
	if len(skipped) > 0 && (*verbose || !*apply) {
		fmt.Println("skipped:")
		count := 0
		for name, reason := range skipped {
			if count >= 10 && !*verbose {
				fmt.Printf("  ... and %d more\n", len(skipped)-count)
				break
			}
			fmt.Printf("  %-45s %s\n", name, reason)
			count++
		}
	}

	if !*apply {
		fmt.Println("dry run only; re-run with -apply to write")
		return
	}
	if len(converted) == 0 {
		fmt.Println("nothing to do")
		return
	}

	for name, expr := range converted {
		modes[name] = billing_setting.BillingModeTieredExpr
		exprs[name] = expr
	}
	modeJSON, _ := json.Marshal(modes)
	exprJSON, _ := json.Marshal(exprs)

	if err := model.UpdateModelPricingOptions(map[string]string{
		"billing_setting." + billing_setting.BillingModeField: string(modeJSON),
		"billing_setting." + billing_setting.BillingExprField: string(exprJSON),
	}); err != nil {
		fmt.Fprintf(os.Stderr, "write failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("applied: %d models converted to expression billing\n", len(converted))
}
