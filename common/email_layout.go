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
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background:#1f883d;border-radius:6px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600">%s</td></tr></table>`,
		html.EscapeString(emailBrandInitial()))

	metaLinks := make([]string, 0, 2)
	if site := emailSiteLink(); site != "" {
		href := html.EscapeString(strings.TrimRight(strings.TrimSpace(SiteAddress), "/") + "/")
		metaLinks = append(metaLinks, fmt.Sprintf(
			`<a href="%s" style="color:#5b6472;text-decoration:none">%s</a>`,
			href, html.EscapeString(site)))
	}
	metaLinks = append(metaLinks, `<a href="mailto:support@nowhub.org" style="color:#5b6472;text-decoration:none">support@nowhub.org</a>`)
	metaLine := strings.Join(metaLinks, ` &nbsp;·&nbsp; `)
	copyright := fmt.Sprintf("&copy; %d %s", year, safeBrand)

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
  body{margin:0!important;padding:0!important;width:100%%!important;background:#ffffff}
  .email-body{color:#1f2328;font-size:14px;line-height:1.6}
  .email-body p{margin:0 0 12px}
  .email-body p:last-child{margin-bottom:0}
  .email-body a{color:#0969da;text-decoration:none;word-break:break-word}
  .email-body strong{font-weight:600;color:#1f2328}
  .email-code{display:inline-block;margin:4px 0 0;padding:8px 14px;background:#ffffff;border:1px solid #e3e6ea;border-radius:8px;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:20px;line-height:1.5;letter-spacing:2px;font-weight:600;color:#1f2328}
  .email-btn{display:inline-block;padding:9px 18px;background:#1f883d;border-radius:8px;color:#ffffff!important;font-size:14px;line-height:20px;font-weight:500;text-decoration:none!important}
  @media (max-width:600px){
    .email-shell{padding:20px 12px!important}
    .email-card{padding:20px!important}
    .email-title{font-size:15px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">%s</div>
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#ffffff">
  <tr>
    <td class="email-shell" align="center" style="padding:28px 16px">
      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%%;max-width:600px">
        <tr>
          <td style="padding:0 4px 16px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr>
                <td style="padding-right:8px" valign="middle">%s</td>
                <td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;color:#1f2328">%s</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="email-card" style="background:#f6f7f8;border-radius:14px;padding:24px 26px">
            <h1 class="email-title" style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;font-weight:600;color:#1f2328">%s</h1>
            <div class="email-body" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2328;font-size:14px;line-height:1.6">%s</div>
          </td>
        </tr>
        <tr>
          <td height="12" style="height:12px;line-height:12px;font-size:0">&nbsp;</td>
        </tr>
        <tr>
          <td style="background:#eef1f4;border-radius:14px;padding:16px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#5b6472">
            %s
          </td>
        </tr>
        <tr>
          <td style="padding:14px 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280">
            %s
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`, safeSubject, safeSubject, brandMark, safeBrand, safeSubject, content, metaLine, copyright)
}
