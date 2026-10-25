package channel

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 上游请求必须继承客户端请求的 context：客户端断开后，上游连接要一起取消，
// 否则用户已经走了，上游还在继续生成并被计费。

func TestNewUpstreamRequestHonorsCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	req, err := newUpstreamRequest(ctx, http.MethodPost, "http://upstream.invalid/v1/chat/completions", strings.NewReader(`{}`))
	require.NoError(t, err)
	assert.ErrorIs(t, req.Context().Err(), context.Canceled, "请求 context 应随客户端一起取消")
}

func TestNewUpstreamRequestKeepsLiveContext(t *testing.T) {
	type ctxKey string
	ctx := context.WithValue(context.Background(), ctxKey("trace"), "abc")

	req, err := newUpstreamRequest(ctx, http.MethodGet, "http://upstream.invalid/v1/models", nil)
	require.NoError(t, err)
	assert.Equal(t, "abc", req.Context().Value(ctxKey("trace")), "context 透传，不应被替换成 Background")
	assert.NoError(t, req.Context().Err())
}
