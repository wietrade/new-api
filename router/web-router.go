package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")
	compress := gzip.Gzip(gzip.DefaultCompression)

	// 文档站：VitePress 产物落在 web/dist/docs。目录索引必须走显式路由，
	// 否则 NoRoute + http.FileServer 会在 "/docs" 与 "/docs/" 之间来回重定向。
	if docsIndex, err := assets.BuildFS.ReadFile("web/dist/docs/index.html"); err == nil {
		router.GET("/docs", func(c *gin.Context) {
			c.Redirect(http.StatusMovedPermanently, "/docs/")
		})
		router.GET("/docs/", func(c *gin.Context) {
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", docsIndex)
		})
	}

	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		func(c *gin.Context) {
			// ServeFrontendFiles sends build files already compressed.
			if !frontendFS.Exists("/", c.Request.URL.Path) {
				compress(c)
			}
		},
		middleware.AccessTokenAudit(),
		middleware.GlobalWebRateLimit(frontendFS),
		middleware.Cache(),
		middleware.ServeFrontendFiles(frontendFS),
		func(c *gin.Context) {
			urlPath := c.Request.URL.Path
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
				controller.RelayNotFound(c)
				return
			}

			// 文档站是静态站点：缺失页面返回真正的 404 页，而不是 SPA 首页，
			// 否则搜索引擎会把不存在的页面当成有效页面收录。
			if strings.HasPrefix(urlPath, "/docs/") {
				c.Header("Cache-Control", "no-cache")
				if page, err := assets.BuildFS.ReadFile("web/dist/docs/404.html"); err == nil {
					c.Data(http.StatusNotFound, "text/html; charset=utf-8", page)
					return
				}
				c.Status(http.StatusNotFound)
				return
			}

			// 带扩展名的静态资源缺失时必须 404：返回 HTML 会触发 MIME 报错，
			// 且 middleware.Cache 给的 immutable 头会让浏览器把这次失败缓存一年。
			if strings.HasPrefix(urlPath, "/static/") {
				c.Header("Cache-Control", "no-store")
				c.Status(http.StatusNotFound)
				return
			}

			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.IndexPage)
		},
	)
}
