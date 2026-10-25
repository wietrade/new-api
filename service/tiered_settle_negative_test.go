package service

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 上游（尤其是二次转发渠道）可能上报负数 token。负数子类目会直接压低
// 表达式成本，甚至把成本算成负数——结算侧会把它当成退款处理（净贷记用户）。
// 这些测试锁定两条不变量：
//  1. 进入表达式的所有 token 计数都必须是非负的；
//  2. 结算结果绝不可能是负数。

func negativeUsage() *dto.Usage {
	return &dto.Usage{
		PromptTokens:     1000,
		CompletionTokens: 500,
		PromptTokensDetails: dto.InputTokenDetails{
			CachedTokens:    -100000,
			CachedCreationTokens: -2000,
			ImageTokens:     -300,
			AudioTokens:     -40,
		},
		CompletionTokenDetails: dto.OutputTokenDetails{
			ImageTokens: -10,
			AudioTokens: -5,
		},
	}
}

func TestBuildTieredTokenParams_ClampsNegativeCounts(t *testing.T) {
	// 全部子类目都被表达式引用（不再并回 p/c），负数必须被钳制成 0。
	params := BuildTieredTokenParams(
		negativeUsage(),
		false,
		map[string]bool{"cr": true, "cc": true, "cc1h": true, "img": true, "img_cr": true, "ai": true, "img_o": true, "ao": true},
	)

	assert.GreaterOrEqual(t, params.P, float64(0), "P 不能为负")
	assert.GreaterOrEqual(t, params.C, float64(0), "C 不能为负")
	assert.GreaterOrEqual(t, params.Len, float64(0), "Len 不能为负")
	assert.GreaterOrEqual(t, params.CR, float64(0), "缓存读 token 不能为负")
	assert.GreaterOrEqual(t, params.CC, float64(0), "缓存写 token 不能为负")
	assert.GreaterOrEqual(t, params.CC1h, float64(0), "缓存写(1h) token 不能为负")
	assert.GreaterOrEqual(t, params.Img, float64(0), "图片输入 token 不能为负")
	assert.GreaterOrEqual(t, params.ImgCR, float64(0), "图片缓存 token 不能为负")
	assert.GreaterOrEqual(t, params.ImgO, float64(0), "图片输出 token 不能为负")
	assert.GreaterOrEqual(t, params.AI, float64(0), "音频输入 token 不能为负")
	assert.GreaterOrEqual(t, params.AO, float64(0), "音频输出 token 不能为负")

	// 文本本体保持原值，不能被负数子类目反向放大。
	assert.Equal(t, float64(1000), params.P)
	assert.Equal(t, float64(500), params.C)
}

func TestBuildTieredTokenParams_ClampsNegativeCountsWhenUnused(t *testing.T) {
	// 未被表达式引用时，子类目应并回 p/c；负数不能被并回（否则等于放大计费口径）。
	params := BuildTieredTokenParams(negativeUsage(), false, map[string]bool{})

	assert.Equal(t, float64(1000), params.P, "负数缓存读不能并回 p 变成加成")
	assert.Equal(t, float64(500), params.C)
	assert.Equal(t, float64(0), params.CR)
	assert.GreaterOrEqual(t, params.Len, float64(0))
}

func TestTryTieredSettle_NegativeUsageNeverProducesNegativeQuota(t *testing.T) {
	// 表达式只按缓存读计费：上游上报 -100000 时，修复前会得到负 quota（= 净退款）。
	exprStr := `tier("default", cr * 1)`
	info := makeRelayInfo(exprStr, 1.0, 1000, 0)
	params := BuildTieredTokenParams(negativeUsage(), false, map[string]bool{"cr": true})

	ok, quota, _ := TryTieredSettle(info, params)
	require.True(t, ok, "表达式合法，应当走 tiered 结算")
	assert.GreaterOrEqual(t, quota, 0, "结算额度不能为负（负值会被当成退款净贷记用户）")
}

// Claude 的 input_tokens 不包含 cache_creation，因此当表达式没有引用
// cc/cc1h 时，这部分 token 必须并回 p 按输入价计费，否则整段缓存写免费。
func TestBuildTieredTokenParams_MergesUnreferencedClaudeCacheCreation(t *testing.T) {
	usage := &dto.Usage{
		PromptTokens:                    100,
		UsageSemantic:                   "anthropic",
		ClaudeCacheCreation5mTokens:     1000,
		ClaudeCacheCreation1hTokens:     2000,
		PromptTokensDetails:             dto.InputTokenDetails{},
	}

	params := BuildTieredTokenParams(usage, true, map[string]bool{"cr": true})

	assert.Equal(t, float64(3100), params.P, "未引用的 cc/cc1h 应并回输入 p")
	assert.Equal(t, float64(1000), params.CC)
	assert.Equal(t, float64(2000), params.CC1h)
	assert.Equal(t, float64(3100), params.Len, "len 仍是完整输入上下文")
}

func TestBuildTieredTokenParams_KeepsClaudeInputWhenCacheCreationPriced(t *testing.T) {
	usage := &dto.Usage{
		PromptTokens:                100,
		UsageSemantic:               "anthropic",
		ClaudeCacheCreation5mTokens: 1000,
		ClaudeCacheCreation1hTokens: 2000,
		PromptTokensDetails:         dto.InputTokenDetails{CachedTokens: 50},
	}

	params := BuildTieredTokenParams(
		usage,
		true,
		map[string]bool{"cr": true, "cc": true, "cc1h": true},
	)

	// 全部子类目都被单独定价时，p 只保留纯文本输入，避免重复计费。
	assert.Equal(t, float64(100), params.P)
	assert.Equal(t, float64(50), params.CR)
	assert.Equal(t, float64(1000), params.CC)
	assert.Equal(t, float64(2000), params.CC1h)
}
