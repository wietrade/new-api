package common

import (
	"strings"

	xhtml "golang.org/x/net/html"
)

// htmlToText 把正文 HTML 片段转成可读的纯文本：
// <br>/块级标签换行、列表加前缀、链接在文字后补上目标地址。
func htmlToText(fragment string) string {
	tokenizer := xhtml.NewTokenizer(strings.NewReader(fragment))
	var out strings.Builder
	var pendingHrefs []string
	skipDepth := 0

	for {
		tokenType := tokenizer.Next()
		if tokenType == xhtml.ErrorToken {
			break
		}
		switch tokenType {
		case xhtml.TextToken:
			if skipDepth == 0 {
				out.WriteString(xhtml.UnescapeString(string(tokenizer.Text())))
			}
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken:
			name, hasAttr := tokenizer.TagName()
			switch string(name) {
			case "script", "style":
				if tokenType == xhtml.StartTagToken {
					skipDepth++
				}
			case "br":
				out.WriteString("\n")
			case "li":
				out.WriteString("\n- ")
			case "p", "div", "tr", "h1", "h2", "h3", "blockquote", "table":
				out.WriteString("\n")
			case "a":
				href := ""
				for hasAttr {
					var key, value []byte
					key, value, hasAttr = tokenizer.TagAttr()
					if string(key) == "href" {
						href = string(value)
					}
				}
				pendingHrefs = append(pendingHrefs, href)
			}
		case xhtml.EndTagToken:
			name, _ := tokenizer.TagName()
			switch string(name) {
			case "script", "style":
				if skipDepth > 0 {
					skipDepth--
				}
			case "p", "div", "tr", "h1", "h2", "h3", "blockquote", "table":
				out.WriteString("\n")
			case "a":
				if len(pendingHrefs) > 0 {
					href := pendingHrefs[len(pendingHrefs)-1]
					pendingHrefs = pendingHrefs[:len(pendingHrefs)-1]
					if href != "" && !strings.HasPrefix(href, "mailto:") {
						out.WriteString(" (" + href + ")")
					}
				}
			}
		}
	}

	lines := strings.Split(out.String(), "\n")
	cleaned := make([]string, 0, len(lines))
	blankLines := 0
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			blankLines++
			if blankLines > 1 {
				continue
			}
		} else {
			blankLines = 0
		}
		cleaned = append(cleaned, line)
	}
	return strings.TrimSpace(strings.Join(cleaned, "\n"))
}

// BuildEmailText 生成与 HTML 版对应的纯文本正文（multipart/alternative 的 text/plain 部分）。
func BuildEmailText(content string) string {
	body := htmlToText(content)
	if body == "" {
		body = strings.TrimSpace(content)
	}
	body = strings.ReplaceAll(body, "\r\n", "\n")
	body = strings.ReplaceAll(body, "\n", "\r\n")
	return body + "\r\n\r\n-- \r\n" + emailBrandName() + "\r\n" + emailSiteURL()
}
