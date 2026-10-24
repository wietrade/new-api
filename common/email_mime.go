package common

import (
	"bytes"
	"fmt"
	"mime/quotedprintable"
	"strings"
	"time"
)

// encodeQuotedPrintable 按 RFC 2045 编码正文（含软换行），保证 SMTP 每行不超过 76 字符。
func encodeQuotedPrintable(content string) string {
	var buffer bytes.Buffer
	writer := quotedprintable.NewWriter(&buffer)
	if _, err := writer.Write([]byte(content)); err != nil {
		return content
	}
	if err := writer.Close(); err != nil {
		return content
	}
	return buffer.String()
}

// buildEmailMessage 组装 multipart/alternative 报文：纯文本在前、HTML 在后。
// 纯文本部分让不支持 HTML 的客户端、以及部分反垃圾策略的检查器都能正常识别内容。
func buildEmailMessage(receiver, encodedSubject, textBody, htmlBody, messageID string) []byte {
	boundary := fmt.Sprintf("==NowHub_%s==", GetRandomString(24))

	var builder strings.Builder
	builder.WriteString("To: " + receiver + "\r\n")
	builder.WriteString("From: " + SystemName + " <" + SMTPFrom + ">\r\n")
	builder.WriteString("Subject: " + encodedSubject + "\r\n")
	builder.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	builder.WriteString("Message-ID: " + messageID + "\r\n")
	builder.WriteString("Auto-Submitted: auto-generated\r\n")
	builder.WriteString("MIME-Version: 1.0\r\n")
	builder.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n")
	builder.WriteString("\r\n")

	builder.WriteString("--" + boundary + "\r\n")
	builder.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	builder.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
	builder.WriteString(encodeQuotedPrintable(textBody))
	builder.WriteString("\r\n")

	builder.WriteString("--" + boundary + "\r\n")
	builder.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	builder.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
	builder.WriteString(encodeQuotedPrintable(htmlBody))
	builder.WriteString("\r\n")

	builder.WriteString("--" + boundary + "--\r\n")
	return []byte(builder.String())
}
