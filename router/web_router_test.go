package router

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// 缺失的静态资源与文档页必须返回 404，不能把 SPA 首页当成 200 返回。
func TestMissingStaticAndDocsReturn404(t *testing.T) {
	gin.SetMode(gin.TestMode)
	outer := gin.New()
	SetWebRouter(outer, WebAssets{IndexPage: []byte("dashboard")}, func(c *gin.Context) { c.Next() })

	t.Run("missing static asset", func(t *testing.T) {
		response := performPluginRequest(outer, http.MethodGet, "/static/js/nope.123.js")
		assert.Equal(t, http.StatusNotFound, response.Code)
		// 不能保留 immutable，否则浏览器会把 404 缓存一年
		assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
		assert.NotContains(t, response.Body.String(), "dashboard")
	})

	t.Run("missing docs page", func(t *testing.T) {
		response := performPluginRequest(outer, http.MethodGet, "/docs/nope.html")
		assert.Equal(t, http.StatusNotFound, response.Code)
		assert.Equal(t, "no-cache", response.Header().Get("Cache-Control"))
		assert.NotContains(t, response.Body.String(), "dashboard")
	})

	t.Run("spa route still renders index", func(t *testing.T) {
		response := performPluginRequest(outer, http.MethodGet, "/pricing")
		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, "dashboard", response.Body.String())
		assert.Equal(t, "no-cache", response.Header().Get("Cache-Control"))
	})
}
