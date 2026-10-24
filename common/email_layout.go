package common

import (
	"fmt"
	"html"
	"strings"
	"time"
)

// SiteAddress 与 system_setting.ServerAddress 保持同步，供邮件模板拼接绝对链接。
// setting/system_setting 依赖 common，反向引用会循环，因此这里做一份镜像。
var SiteAddress = ""

// emailSiteURL 返回站点主页的绝对地址，未配置时回退到主站域名。
func emailSiteURL() string {
	addr := strings.TrimSpace(SiteAddress)
	if !strings.HasPrefix(addr, "http://") && !strings.HasPrefix(addr, "https://") {
		return "https://www.nowhub.org/"
	}
	return strings.TrimRight(addr, "/") + "/"
}

// EmailCodeBlock 渲染「小字标签 + 居中验证码」区块，用于验证码类邮件。
// 标签与验证码分开渲染，保证数字在邮件里居中且易于复制。
func EmailCodeBlock(label, code string) string {
	return fmt.Sprintf(
		`<p style="margin:24px 0 8px;text-align:center;color:#5b6472;font-size:13px;line-height:1.5">%s</p>`+
			`<p style="margin:0 0 24px;text-align:center"><span class="email-code">%s</span></p>`,
		label, code)
}

// 邮件不使用任何外部图片（很多客户端默认不加载远程图片），
// 头部品牌标记用纯 CSS 方块 + 首字母渲染。
func emailBrandInitial() string {
	name := strings.TrimSpace(SystemName)
	if name == "" {
		return "A"
	}
	first := []rune(strings.ToUpper(name))[0]
	return string(first)
}

func emailBrandName() string {
	name := strings.TrimSpace(SystemName)
	if name == "" {
		return "API"
	}
	return name
}

// isFullHTMLDocument 判断内容是否已经是完整的 HTML 文档，避免重复包裹。
func isFullHTMLDocument(content string) bool {
	lower := strings.ToLower(content)
	return strings.Contains(lower, "<!doctype") || strings.Contains(lower, "<html")
}

// BuildEmailHTML 将正文片段包裹进统一的品牌邮件模板。
// 正文中已有的 <p>/<a>/<span class="email-code">/<a class="email-btn"> 会得到主题化样式。
func BuildEmailHTML(subject string, content string) string {
	if isFullHTMLDocument(content) {
		return content
	}

	brand := emailBrandName()
	safeBrand := html.EscapeString(brand)
	safeSubject := html.EscapeString(subject)
	year := time.Now().Year()

	brandMark := fmt.Sprintf(
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background:#ffffff;color:#2e9c45;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700">%s</td></tr></table>`,
		html.EscapeString(emailBrandInitial()))

	copyright := fmt.Sprintf(
		`&copy; %d <a href="%s" style="color:#5b6472;text-decoration:none">%s</a>`,
		year, html.EscapeString(emailSiteURL()), safeBrand)

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>%s</title>
<style type="text/css">
  body,table,td,a{-webkit-text-size-adjust:100%%;-ms-text-size-adjust:100%%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
  body{margin:0!important;padding:0!important;width:100%%!important;background:#ffffff}
  .email-body{color:#1f2328;font-size:14px;line-height:1.6}
  .email-body p{margin:0 0 12px}
  .email-body p:last-child{margin-bottom:0}
  .email-body a{color:#0969da;text-decoration:none;word-break:break-word}
  .email-body strong{font-weight:600;color:#1f2328}
  .email-code{display:inline-block;margin:0 auto;padding:10px 20px;background:#ffffff;border:1px solid #e3e6ea;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:24px;line-height:1.4;letter-spacing:4px;font-weight:600;color:#1f2328}
  .email-btn{display:inline-block;padding:9px 18px;background:#2e9c45;color:#ffffff!important;font-size:14px;line-height:20px;font-weight:500;text-decoration:none!important}
  @media (max-width:600px){
    .email-shell{padding:20px 12px!important}
    .email-card{padding:20px!important}
    .email-title{font-size:15px!important}
  }
  @media (prefers-color-scheme: dark){
    .email-page{background:#0d1117!important}
    .email-brandbar{background:#238636!important}
    .email-card{background:#161b22!important}
    .email-info{background:#161b22!important}
    .email-title,.email-brand,.email-body{color:#e6edf3!important}
    .email-body a{color:#4493f8!important}
    .email-info,.email-info a{color:#9198a1!important}
    .email-code{background:#0d1117!important;border-color:#30363d!important;color:#e6edf3!important}
    .email-btn{background:#238636!important}
  }
</style>
</head>
<body class="email-page" style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">%s</div>
<table role="presentation" class="email-page" width="100%%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#ffffff">
  <tr>
    <td class="email-shell" align="center" style="padding:28px 16px">
      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%%;max-width:600px">
        <tr>
          <td class="email-brandbar" style="background:#2e9c45;padding:14px 24px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr>
                <td style="padding-right:8px" valign="middle">%s</td>
                <td class="email-brand" valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;letter-spacing:0.2px">%s</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="email-card" style="background:#f6f7f8;padding:24px 26px">
            <h1 class="email-title" style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;font-weight:600;color:#1f2328">%s</h1>
            <div class="email-body" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2328;font-size:14px;line-height:1.6">%s</div>
          </td>
        </tr>
        <tr>
          <td height="12" style="height:12px;line-height:12px;font-size:0">&nbsp;</td>
        </tr>
        <tr>
          <td class="email-info" style="background:#eef1f4;padding:14px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#5b6472">
            %s
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`, safeSubject, safeSubject, brandMark, safeBrand, safeSubject, content, copyright)
}
