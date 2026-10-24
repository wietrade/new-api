package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders 为所有响应补齐基础安全响应头。
// 反向代理层（nginx）也可能设置这些头，这里重复设置不会产生副作用，
// 但能让容器化部署、直连端口等场景保持一致。
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.Writer.Header()
		setIfEmpty := func(key, value string) {
			if header.Get(key) == "" {
				header.Set(key, value)
			}
		}

		setIfEmpty("X-Content-Type-Options", "nosniff")
		setIfEmpty("Referrer-Policy", "strict-origin-when-cross-origin")
		// 文档站会被主站的同源 iframe 嵌入，因此不允许跨站嵌套
		setIfEmpty("X-Frame-Options", "SAMEORIGIN")
		setIfEmpty("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		// 只对 HTTPS 生效（浏览器会忽略 http 下的 HSTS），暂不开启 preload
		setIfEmpty("Strict-Transport-Security", "max-age=31536000")

		c.Next()
	}
}
