// Command pricing-audit 对一个「模型 -> 计费表达式」的 JSON 映射做静态体检：
// 编译每条表达式、按变量求系数、比较阶梯前后单价，并给出可疑项。
//
// 用法（在仓库根目录）：
//
//	go run ./cmd/pricing-audit -file /tmp/expr.json
//
// 输入文件格式：{"gpt-5.6-sol":"tier(\"standard\", p * 4 + c * 20)", ...}
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
)

var lenThresholdRe = regexp.MustCompile(`len\s*<=\s*(\d+)`)

var vars = []string{"p", "c", "cr", "cc", "cc1h", "img", "img_cr", "img_o", "ai", "ao"}

func paramsFor(name string, value, length float64) billingexpr.TokenParams {
	tp := billingexpr.TokenParams{P: 0, C: 0, Len: length}
	switch name {
	case "p":
		tp.P = value
	case "c":
		tp.C = value
	case "cr":
		tp.CR = value
	case "cc":
		tp.CC = value
	case "cc1h":
		tp.CC1h = value
	case "img":
		tp.Img = value
	case "img_cr":
		tp.ImgCR = value
	case "img_o":
		tp.ImgO = value
	case "ai":
		tp.AI = value
	case "ao":
		tp.AO = value
	}
	return tp
}

func eval(expr string, tp billingexpr.TokenParams) (float64, error) {
	cost, _, err := billingexpr.RunExpr(expr, tp)
	return cost, err
}

type report struct {
	model   string
	length  float64
	coef    map[string]float64
	base    float64 // 零用量时的固定费用
	notes   []string
	failure string
}

func main() {
	file := flag.String("file", "", "表达式 JSON 文件")
	flag.Parse()
	if *file == "" {
		fmt.Fprintln(os.Stderr, "需要 -file")
		os.Exit(2)
	}
	raw, err := os.ReadFile(*file)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var exprs map[string]string
	if err := json.Unmarshal(raw, &exprs); err != nil {
		fmt.Fprintln(os.Stderr, "解析 JSON 失败:", err)
		os.Exit(1)
	}

	models := make([]string, 0, len(exprs))
	for m := range exprs {
		models = append(models, m)
	}
	sort.Strings(models)

	var problems int
	fmt.Printf("%-38s %-9s %8s %8s %8s %8s %8s %8s %s\n",
		"model", "ctx", "p", "c", "cr", "cc", "cc1h", "other", "notes")
	for _, model := range models {
		expr := exprs[model]
		if _, err := billingexpr.CompileFromCache(expr); err != nil {
			fmt.Printf("%-38s COMPILE_ERROR: %v\n", model, err)
			problems++
			continue
		}
		lengths := []float64{1000}
		for _, m := range lenThresholdRe.FindAllStringSubmatch(expr, -1) {
			if n, err := strconv.ParseFloat(m[1], 64); err == nil {
				lengths = append(lengths, n+1)
			}
		}
		if strings.Contains(expr, "hour(") || strings.Contains(expr, "weekday(") {
			lengths = lengths[:1] // 时间相关表达式只取当前时刻
		}

		for _, length := range lengths {
			base, err := eval(expr, paramsFor("p", 0, length))
			if err != nil {
				fmt.Printf("%-38s len=%-8.0f EVAL_ERROR: %v\n", model, length, err)
				problems++
				continue
			}
			coef := map[string]float64{}
			for _, v := range vars {
				hi, err := eval(expr, paramsFor(v, 1e6, length))
				if err != nil {
					fmt.Printf("%-38s len=%-8.0f EVAL_ERROR(%s): %v\n", model, length, v, err)
					problems++
					continue
				}
				coef[v] = hi - base
			}

			var notes []string
			if math.IsNaN(base) || math.IsInf(base, 0) {
				notes = append(notes, "固定费用非有限值")
				problems++
			}
			if base < 0 {
				notes = append(notes, "负的固定费用")
				problems++
			}
			for _, v := range vars {
				if coef[v] < 0 {
					notes = append(notes, fmt.Sprintf("%s 系数为负", v))
					problems++
				}
			}
			if coef["p"] == 0 && coef["c"] == 0 && base > 0 {
				notes = append(notes, "仅固定价（按次计费）")
			}
			if coef["c"] > 0 && coef["p"] > 0 && (coef["c"]/coef["p"] < 3 || coef["c"]/coef["p"] > 10) {
				notes = append(notes, fmt.Sprintf("c/p=%.2fx", coef["c"]/coef["p"]))
			}
			if coef["cr"] > 0 && coef["p"] > 0 && (coef["cr"]/coef["p"] < 0.05 || coef["cr"]/coef["p"] > 0.3) {
				notes = append(notes, fmt.Sprintf("cr/p=%.3fx", coef["cr"]/coef["p"]))
			}
			if coef["cc"] > 0 && coef["p"] > 0 && math.Abs(coef["cc"]/coef["p"]-1.25) > 0.05 {
				notes = append(notes, fmt.Sprintf("cc/p=%.3fx", coef["cc"]/coef["p"]))
			}
			if coef["cc1h"] > 0 && coef["p"] > 0 && math.Abs(coef["cc1h"]/coef["p"]-2) > 0.1 {
				notes = append(notes, fmt.Sprintf("cc1h/p=%.3fx", coef["cc1h"]/coef["p"]))
			}
			other := ""
			for _, v := range []string{"img", "img_cr", "img_o", "ai", "ao"} {
				if coef[v] != 0 {
					other += fmt.Sprintf("%s=%.3g ", v, coef[v])
				}
			}
			fmt.Printf("%-38s %-9.0f %8.3f %8.3f %8.3f %8.3f %8.3f %8s %s\n",
				model, length, coef["p"], coef["c"], coef["cr"], coef["cc"], coef["cc1h"], other, strings.Join(notes, "; "))
		}
	}
	fmt.Printf("\n可疑项合计: %d\n", problems)
}
