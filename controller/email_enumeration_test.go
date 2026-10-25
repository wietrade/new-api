package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// 发送注册验证码的接口不能泄露"邮箱是否已注册"：已注册与未注册必须返回
// 完全相同的响应，否则可以被用来批量枚举账号（辅助撞库/钓鱼）。

func setupEmailEnumerationTest(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/enumeration.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
	})

	require.NoError(t, db.Create(&model.User{
		Username: "existing-owner",
		Password: "hashed",
		Email:    "owner@example.com",
		Status:   common.UserStatusEnabled,
		Group:    "default",
		AffCode:  "enum-aff",
	}).Error)
}

func callSendEmailVerification(t *testing.T, email string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/verification?email="+email, nil)
	// 关闭真实发信：本测试只关心"已注册"分支的响应是否泄露信息。
	SendEmailVerification(c)
	return recorder
}

func TestSendEmailVerificationHidesRegisteredAddress(t *testing.T) {
	setupEmailEnumerationTest(t)

	response := callSendEmailVerification(t, "owner@example.com")

	assert.Equal(t, http.StatusOK, response.Code, "已注册邮箱也应返回成功，不能返回错误")
	body := response.Body.String()
	assert.Contains(t, strings.ToLower(body), "\"success\":true")
	assert.NotContains(t, strings.ToLower(body), "already")
	assert.NotContains(t, body, "已注册")
}
