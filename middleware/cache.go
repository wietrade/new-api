package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// isImmutableAsset 判断请求是否指向带内容 hash 的构建产物：
// 这类文件改名即失效，可以长时间强缓存。
func isImmutableAsset(path string) bool {
	return strings.HasPrefix(path, "/static/") || strings.HasPrefix(path, "/docs/assets/")
}

func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		switch {
		case c.Request.RequestURI == "/":
			c.Header("Cache-Control", "no-cache")
		case isImmutableAsset(c.Request.URL.Path):
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		default:
			c.Header("Cache-Control", "max-age=604800") // one week
		}
		c.Header("Cache-Version", "b688f2fb5be447c25e5aa3bd063087a83db32a288bf6a4f35f2d8db310e40b14")
		c.Next()
	}
}
