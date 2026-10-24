package common

import (
	"fmt"
	"html"
	"strings"
	"time"
)

// SiteAddress 与 system_setting.ServerAddress 保持同步，供邮件模板拼接绝对链接。
// 之所以复制一份，是因为 setting/system_setting 依赖 common，反向引用会造成循环依赖。
var SiteAddress = ""

// emailSiteLink 返回用于页脚展示的站点地址（去掉协议与结尾斜杠）。
func emailSiteLink() string {
	addr := strings.TrimSpace(SiteAddress)
	if addr == "" {
		return ""
	}
	if !strings.HasPrefix(addr, "http://") && !strings.HasPrefix(addr, "https://") {
		return ""
	}
	addr = strings.TrimRight(addr, "/")
	addr = strings.TrimPrefix(addr, "https://")
	addr = strings.TrimPrefix(addr, "http://")
	return addr
}

// emailLogoURL 把站点 Logo 配置解析成邮件可用的绝对地址，无法解析时返回空。
func emailLogoURL() string {
	logo := strings.TrimSpace(Logo)
	if logo == "" {
		return ""
	}
	if strings.HasPrefix(logo, "http://") || strings.HasPrefix(logo, "https://") {
		return logo
	}
	base := strings.TrimSpace(SiteAddress)
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		return ""
	}
	if !strings.HasPrefix(logo, "/") {
		logo = "/" + logo
	}
	return strings.TrimRight(base, "/") + logo
}

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

	var brandMark string
	if logo := emailLogoURL(); logo != "" {
		brandMark = fmt.Sprintf(
			`<img src="%s" width="32" height="32" alt="%s" style="display:block;width:32px;height:32px;border-radius:8px;object-fit:contain" />`,
			html.EscapeString(logo), safeBrand)
	} else {
		brandMark = fmt.Sprintf(
			`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background:#111827;border-radius:8px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600">%s</td></tr></table>`,
			html.EscapeString(emailBrandInitial()))
	}

	var footerParts []string
	footerParts = append(footerParts, fmt.Sprintf("© %d %s", year, safeBrand))
	if site := emailSiteLink(); site != "" {
		href := html.EscapeString(strings.TrimRight(strings.TrimSpace(SiteAddress), "/") + "/")
		footerParts = append(footerParts, fmt.Sprintf(
			`<a href="%s" style="color:#8a94a6;text-decoration:none">%s</a>`,
			href, html.EscapeString(site)))
	}
	footer := strings.Join(footerParts, ` &nbsp;·&nbsp; `)

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>%s</title>
<style type="text/css">
  body,table,td,a{-webkit-text-size-adjust:100%%;-ms-text-size-adjust:100%%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
  body{margin:0!important;padding:0!important;width:100%%!important;background:#f4f5f7}
  .email-body{color:#1f2733;font-size:15px;line-height:1.75}
  .email-body p{margin:0 0 14px}
  .email-body p:last-child{margin-bottom:0}
  .email-body a{color:#2563eb;text-decoration:underline;word-break:break-word}
  .email-body strong{color:#0f172a}
  .email-code{display:inline-block;margin:6px 0 0;padding:10px 18px;background:#f1f3f7;border:1px solid #e2e6ee;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:22px;line-height:1.4;letter-spacing:3px;font-weight:600;color:#0f172a}
  .email-btn{display:inline-block;padding:12px 26px;background:#111827;border-radius:10px;color:#ffffff!important;font-size:15px;font-weight:600;letter-spacing:0;text-decoration:none!important}
  @media (max-width:600px){
    .email-shell{padding:20px 12px!important}
    .email-pad{padding:22px 20px!important}
    .email-title{font-size:19px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f5f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">%s</div>
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#f4f5f7">
  <tr>
    <td class="email-shell" align="center" style="padding:36px 16px">
      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%%;max-width:600px;background:#ffffff;border:1px solid #e6e9ef;border-radius:16px;overflow:hidden">
        <tr>
          <td class="email-pad" style="padding:22px 32px;border-bottom:1px solid #eef1f5">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr>
                <td style="padding-right:10px" valign="middle">%s</td>
                <td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:600;color:#0f172a;letter-spacing:-0.2px">%s</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:30px 32px 32px">
            <h1 class="email-title" style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:21px;line-height:1.4;font-weight:600;color:#0f172a;letter-spacing:-0.2px">%s</h1>
            <div class="email-body" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2733;font-size:15px;line-height:1.75">%s</div>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:16px 32px;background:#fafbfc;border-top:1px solid #eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.7;color:#8a94a6">
            %s
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`, safeSubject, safeSubject, brandMark, safeBrand, safeSubject, content, footer)
}
