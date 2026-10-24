package common

import (
	"strings"
	"testing"
)

func TestBuildEmailHTMLWrapsContent(t *testing.T) {
	previous := SystemName
	SystemName = "NowHub API"
	t.Cleanup(func() { SystemName = previous })

	body := `<p>您的验证码为：<span class="email-code">123456</span></p>`
	out := BuildEmailHTML("NowHub API 邮箱验证邮件", body)

	for _, want := range []string{
		"<!DOCTYPE html>",
		"background:#2e9c45", // 顶部品牌绿横条
		"NowHub API",
		body,
		"&copy;",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("email html missing %q", want)
		}
	}

	// 邮件客户端常默认屏蔽远程图片，模板里不应出现任何外链图片
	if strings.Contains(out, "<img") {
		t.Fatalf("email html should not reference external images")
	}
}

func TestBuildEmailHTMLKeepsFullDocument(t *testing.T) {
	doc := "<!DOCTYPE html><html><body>custom</body></html>"
	if got := BuildEmailHTML("subject", doc); got != doc {
		t.Fatalf("full html document should be returned unchanged")
	}
}
