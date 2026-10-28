package controller

import (
	"bytes"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// ================= 微信收款网关 · 管理员查看/处理（代理到网关） =================
//
// 浏览器不直接碰网关（避免 CORS、也不把网关 KEY 暴露到前端）：
// newapi 后端带 X-Api-Key 去访问网关的 /adminapi/* 与 /receipt/*，再把结果转给管理后台。

func wxGatewayAdminCall(method, path string, body []byte) (int, []byte, error) {
	addr := strings.TrimSpace(operation_setting.WxGatewayAddress)
	key := strings.TrimSpace(operation_setting.WxGatewayKey)
	if addr == "" || key == "" {
		return 0, nil, common.NewMessage("Payment gateway is not configured")
	}
	url := strings.TrimRight(addr, "/") + path
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("X-Api-Key", key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, raw, nil
}

// AdminListWxGatewayOrders 网关订单列表（转发 status/q/page/limit）
func AdminListWxGatewayOrders(c *gin.Context) {
	qs := []string{}
	for _, k := range []string{"status", "q", "page", "limit"} {
		if v := strings.TrimSpace(c.Query(k)); v != "" {
			qs = append(qs, k+"="+urlQueryEscape(v))
		}
	}
	path := "/adminapi/orders"
	if len(qs) > 0 {
		path += "?" + strings.Join(qs, "&")
	}
	code, raw, err := wxGatewayAdminCall(http.MethodGet, path, nil)
	if err != nil {
		logger.LogWarn(c.Request.Context(), common.LogText("wxgateway admin orders failed: %s", err.Error()))
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.Data(code, "application/json; charset=utf-8", raw)
}

// AdminWxGatewayReceipts 某单（或全部）上传的付款截图
func AdminWxGatewayReceipts(c *gin.Context) {
	path := "/receipts"
	if tn := strings.TrimSpace(c.Query("trade_no")); tn != "" {
		path += "?trade_no=" + urlQueryEscape(tn)
	}
	code, raw, err := wxGatewayAdminCall(http.MethodGet, path, nil)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.Data(code, "application/json; charset=utf-8", raw)
}

// AdminWxGatewayReceiptImage 截图原图（前端 <img src> 直接指向这里）
func AdminWxGatewayReceiptImage(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.Status(http.StatusBadRequest)
		return
	}
	code, raw, err := wxGatewayAdminCall(http.MethodGet, "/receipt/"+strconv.Itoa(id), nil)
	if err != nil || code != http.StatusOK {
		c.Status(http.StatusNotFound)
		return
	}
	ctype := "image/png"
	if http.DetectContentType(raw) != "" {
		ctype = http.DetectContentType(raw)
	}
	c.Data(http.StatusOK, ctype, raw)
}

// AdminConfirmWxGatewayOrder 人工确认入账（= 用户在结果页点「确认无误」）
func AdminConfirmWxGatewayOrder(c *gin.Context) {
	tradeNo := strings.TrimSpace(c.Param("trade_no"))
	if tradeNo == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "trade_no required"})
		return
	}
	code, raw, err := wxGatewayAdminCall(http.MethodPost, "/payconfirm/"+urlQueryEscape(tradeNo), nil)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.Data(code, "application/json; charset=utf-8", raw)
}

// AdminRejectWxGatewayOrder 标记信息有误（转人工/作废）
func AdminRejectWxGatewayOrder(c *gin.Context) {
	tradeNo := strings.TrimSpace(c.Param("trade_no"))
	if tradeNo == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "trade_no required"})
		return
	}
	code, raw, err := wxGatewayAdminCall(http.MethodPost, "/payreject/"+urlQueryEscape(tradeNo), nil)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.Data(code, "application/json; charset=utf-8", raw)
}

// urlQueryEscape 只转义会破坏 query 的字符，避免多引入依赖
func urlQueryEscape(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case ' ', '+', '&', '=', '?', '#', '%':
			b.WriteString("%" + strings.ToUpper(strconv.FormatInt(int64(r), 16)))
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}
