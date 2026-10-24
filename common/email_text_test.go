package common

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBuildEmailTextStripsMarkup(t *testing.T) {
	previous := SystemName
	SystemName = "NowHub API"
	t.Cleanup(func() { SystemName = previous })

	text := BuildEmailText(`<p>您好，您正在进行 NowHub API 邮箱验证。</p>` +
		`<p>您的验证码</p><p><span class="email-code">482913</span></p>` +
		`<p>帮助：<a href="https://example.com/reset">重置链接</a></p>`)

	require.Contains(t, text, "482913")
	require.Contains(t, text, "重置链接 (https://example.com/reset)")
	require.NotContains(t, text, "<p>")
	require.NotContains(t, text, "email-code")
	require.Contains(t, text, "NowHub API")
}
