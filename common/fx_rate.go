/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package common

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

// 实时汇率：用于把人民币到账金额换算成美元额度。
// 优先用环境变量 FX_API_URL 指定的接口，默认 exchangerate-api 的免费接口。
const (
	defaultFxAPIURL   = "https://open.er-api.com/v6/latest/USD"
	defaultFxCacheTTL = 1800 // 秒
	fxRequestTimeout  = 6 * time.Second
)

var (
	fxRateCNY   float64
	fxRateAt    int64
	fxRateMu    sync.Mutex
	fxLastError string
)

func fxAPIURL() string {
	if v := os.Getenv("FX_API_URL"); v != "" {
		return v
	}
	return defaultFxAPIURL
}

func fxCacheTTL() int64 {
	if v := os.Getenv("FX_CACHE_TTL"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return int64(n)
		}
	}
	return defaultFxCacheTTL
}

// USDCNYRate 返回 1 美元兑多少人民币（实时汇率，带缓存）。
// 失败时返回上一次成功的值（可能为 0），并记录日志，由调用方决定兜底。
func USDCNYRate() float64 {
	fxRateMu.Lock()
	defer fxRateMu.Unlock()

	now := time.Now().Unix()
	if fxRateCNY > 0 && now-fxRateAt < fxCacheTTL() {
		return fxRateCNY
	}

	url := fxAPIURL()
	client := &http.Client{Timeout: fxRequestTimeout}
	resp, err := client.Get(url)
	if err != nil {
		fxLastError = err.Error()
		SysError("fx: 获取汇率失败 " + url + " : " + err.Error())
		return fxRateCNY
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		SysError("fx: 读取汇率响应失败: " + err.Error())
		return fxRateCNY
	}

	// 兼容两种常见格式：
	// 1) {"rates":{"CNY":7.12}, ...}                 (open.er-api / exchangerate-api)
	// 2) {"rates":{"CNY":7.12}}                      (frankfurter)
	var payload struct {
		Rates map[string]float64 `json:"rates"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		SysError("fx: 汇率响应解析失败: " + err.Error())
		return fxRateCNY
	}
	rate := payload.Rates["CNY"]
	if rate <= 0 {
		SysError("fx: 汇率响应缺少 CNY: " + url)
		return fxRateCNY
	}

	fxRateCNY = rate
	fxRateAt = now
	fxLastError = ""
	SysLog("fx: USD/CNY = " + strconv.FormatFloat(rate, 'f', 6, 64) + " （来源 " + url + "）")
	return fxRateCNY
}

// FxLastError 返回最近一次汇率请求的错误（空字符串表示正常）
func FxLastError() string {
	fxRateMu.Lock()
	defer fxRateMu.Unlock()
	return fxLastError
}
