package controller

import (
	"strings"
	"sync"
	"time"
)

// 回调 nonce 防重放：内存缓存（单实例部署足够）。
// 只在签名校验通过后才登记，避免被无效请求刷爆内存（另有容量上限）。
const (
	wxNonceTTL      = 10 * time.Minute
	wxNonceMaxItems = 20000
)

var (
	wxNonceMu   sync.Mutex
	wxNonceSeen = make(map[string]int64) // nonce -> 过期时间(Unix 秒)
)

// wxNonceAccept 在 TTL 内首次出现的 nonce 返回 true；重复出现返回 false。
func wxNonceAccept(nonce string) bool {
	now := time.Now().Unix()
	wxNonceMu.Lock()
	defer wxNonceMu.Unlock()

	if len(wxNonceSeen) > wxNonceMaxItems {
		for k, exp := range wxNonceSeen {
			if exp <= now {
				delete(wxNonceSeen, k)
			}
		}
		// 仍然超限（说明短时间涌入大量 nonce）：整体清空，宁可放过也不阻塞业务
		if len(wxNonceSeen) > wxNonceMaxItems {
			wxNonceSeen = make(map[string]int64)
		}
	}

	if exp, ok := wxNonceSeen[nonce]; ok && exp > now {
		return false
	}
	wxNonceSeen[nonce] = now + int64(wxNonceTTL/time.Second)
	return true
}

// wxClientIPAllowed 校验回调来源 IP 是否在白名单内（allow 为空表示不限制）。
func wxClientIPAllowed(clientIP string, allow string) bool {
	allow = strings.TrimSpace(allow)
	if allow == "" {
		return true
	}
	ip := strings.TrimSpace(clientIP)
	// 去掉可能的端口（部分代理会带上）
	if i := strings.LastIndex(ip, ":"); i > 0 && !strings.Contains(ip, "]") &&
		strings.Count(ip, ":") == 1 {
		ip = ip[:i]
	}
	ip = strings.Trim(ip, "[]")
	for _, item := range strings.Split(allow, ",") {
		if strings.TrimSpace(item) == ip {
			return true
		}
	}
	return false
}
