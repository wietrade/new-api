package common

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestBuildEmailHTMLSnapshotStructure 锁定统一邮件模板的骨架，
// 避免调整样式时误删顶栏、正文卡、版权卡或重新引入圆角/外链图片。
func TestBuildEmailHTMLSnapshotStructure(t *testing.T) {
	previous := SystemName
	SystemName = "NowHub API"
	t.Cleanup(func() { SystemName = previous })

	out := BuildEmailHTML("NowHub API 邮箱验证邮件", `<p>您的验证码：</p><p><span class="email-code">482913</span></p>`)

	for _, want := range []string{
		`<body class="email-page"`,
		`class="email-brandbar"`,
		`class="email-card"`,
		`class="email-info"`,
		`<span class="email-code">482913</span>`,
		`href="https://www.nowhub.org/"`,
		`@media (prefers-color-scheme: dark)`,
	} {
		require.Contains(t, out, want)
	}

	require.NotContains(t, out, "border-radius")
	require.NotContains(t, out, "<img")
}
