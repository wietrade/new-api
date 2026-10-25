package service

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

// isClaudeModelName 判断模型是否属于 Claude 家族（用于计费口径检查）。
func isClaudeModelName(name string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(name)), "claude")
}

// claudeProtocolMismatch 报告 Claude 模型是否走了非 Claude 协议出站。
func claudeProtocolMismatch(modelName string, finalFormat types.RelayFormat) bool {
	return isClaudeModelName(modelName) && finalFormat != types.RelayFormatClaude
}

// warnClaudeProtocolMismatch 在结算前记录协议不一致告警。
// OpenAI 协议没有 cache_write 字段，Claude 模型走该格式时上游的 5m/1h 缓存写入
// 会在转换中丢失，这部分用量计不到 cc/cc1h。这里只告警，不改变扣费金额。
func warnClaudeProtocolMismatch(ctx *gin.Context, info *relaycommon.RelayInfo) {
	if info == nil {
		return
	}
	format := info.GetFinalRequestRelayFormat()
	if !claudeProtocolMismatch(info.OriginModelName, format) {
		return
	}
	common.SysError(common.LogText(
		"claude model %s left upstream as %q instead of claude: cache write will be unbilled (channel %d)",
		info.OriginModelName, string(format), info.ChannelId))
}
