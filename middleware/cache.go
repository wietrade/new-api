package middleware

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// isImmutableAsset 判断请求是否指向带内容 hash 的构建产物：
// 这类文件改名即失效，可以长时间强缓存。
func isImmutableAsset(path string) bool {
	return strings.HasPrefix(path, "/static/") || strings.HasPrefix(path, "/docs/assets/")
}

// isFrontendDocument 判断请求是否返回 HTML 文档：
// 文档站页面（/docs/*.html、/docs/）与 SPA 路由（/pricing、/dashboard 等无扩展名路径）。
// 这类响应必须每次回源校验，否则发版后用户与 CDN 会拿到一周前的页面。
func isFrontendDocument(path string) bool {
	if strings.HasSuffix(path, ".html") {
		return true
	}
	for _, prefix := range []string{"/api/", "/v1/", "/pg/"} {
		if strings.HasPrefix(path, prefix) {
			return false
		}
	}
	last := path[strings.LastIndex(path, "/")+1:]
	return !strings.Contains(last, ".")
}

func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		switch {
		case isFrontendDocument(c.Request.URL.Path):
			// HTML 不缓存：内容随发版变化，且 CDN 不应缓存页面本体
			c.Header("Cache-Control", "no-cache")
		case isImmutableAsset(c.Request.URL.Path):
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		default:
			c.Header("Cache-Control", "max-age=604800") // one week
		}
		version := common.BuildID
		if version == "" {
			version = common.Version
		}
		c.Header("Cache-Version", version)
		c.Next()
	}
}
