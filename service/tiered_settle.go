package service

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

// TieredResultWrapper wraps billingexpr.TieredResult for use at the service layer.
type TieredResultWrapper = billingexpr.TieredResult

// BuildTieredTokenParams constructs billingexpr.TokenParams from a dto.Usage,
// normalizing P and C so they mean "tokens not separately priced by the
// expression". Sub-categories (cache, image, audio) are only subtracted
// when the expression references them via their own variable.
//
// GPT-format APIs report prompt_tokens / completion_tokens as totals that
// include all sub-categories (cache, image, audio). Claude-format APIs
// report them as text-only. This function normalizes to text-only when
// sub-categories are separately priced.
func BuildTieredTokenParams(usage *dto.Usage, isClaudeUsageSemantic bool, usedVars map[string]bool) billingexpr.TokenParams {
	// 上游（尤其二次转发渠道）可能上报负数 token。任何负值进入表达式都会
	// 压低成本，甚至把成本算成负数，而负成本在结算侧等同于退款（净贷记用户），
	// 所以这里在进入表达式之前统一钳制到非负。
	p := max(float64(usage.PromptTokens), 0)
	c := max(float64(usage.CompletionTokens), 0)
	cr := max(float64(usage.PromptTokensDetails.CachedTokens), 0)
	cc5m := max(float64(usage.PromptTokensDetails.CacheCreationTokensTotal()), 0)
	cc1h := float64(0)

	if usage.UsageSemantic == "anthropic" {
		cc1h = max(float64(usage.ClaudeCacheCreation1hTokens), 0)
		cc5m = max(float64(usage.ClaudeCacheCreation5mTokens), 0)
		// 上游只给聚合的 cache_creation_input_tokens、未给 5m/1h 分档时，
		// 上面的赋值会把聚合值清零，导致这部分用量在 anthropic 语义下整块免费。
		// 与 cacheCreationTokensForOpenAIUsage 保持一致：无分档则按 5m 档计。
		if cc5m == 0 && cc1h == 0 {
			cc5m = max(float64(usage.PromptTokensDetails.CacheCreationTokensTotal()), 0)
		}
	}

	img := max(float64(usage.PromptTokensDetails.ImageTokens), 0)
	imgCR := float64(0)
	if usedVars["img_cr"] && !isClaudeUsageSemantic {
		details := usage.PromptTokensDetails.CachedTokensDetails
		if details != nil && details.ImageTokens != nil {
			cachedImage := *details.ImageTokens
			cached := usage.PromptTokensDetails.CachedTokens
			image := usage.PromptTokensDetails.ImageTokens
			valid := cachedImage >= 0 && cached >= cachedImage && image >= cachedImage &&
				cached <= usage.PromptTokens && image <= usage.PromptTokens-(cached-cachedImage)
			if valid {
				remaining := cached - cachedImage
				for _, count := range []*int{details.TextTokens, details.AudioTokens} {
					if count == nil {
						continue
					}
					if *count < 0 || *count > remaining {
						valid = false
						break
					}
					remaining -= *count
				}
			}
			if valid {
				imgCR = float64(cachedImage)
				cr -= imgCR
				img -= imgCR
			} else {
				common.SysError(common.LogText("invalid image cache token breakdown; using aggregate cache billing"))
			}
		}
	}
	ai := max(float64(usage.PromptTokensDetails.AudioTokens), 0)
	imgO := max(float64(usage.CompletionTokenDetails.ImageTokens), 0)
	ao := max(float64(usage.CompletionTokenDetails.AudioTokens), 0)

	// len = total input context length for tier condition evaluation.
	// Non-Claude: prompt_tokens already includes everything.
	// Claude: input_tokens is text-only, so add cache read + cache creation.
	inputLen := p
	if isClaudeUsageSemantic {
		inputLen = p + cr + cc5m + cc1h
	}

	if isClaudeUsageSemantic {
		// Anthropic 的 input_tokens 既不包含缓存读、也不包含缓存写。
		// 某个子类目没有被表达式单独定价时，必须并回输入 p 按输入价计费，
		// 否则这部分用量会完全免费（GPT 语义的分支也是这个契约）。
		if !usedVars["cr"] {
			p += cr
		}
		if !usedVars["cc"] {
			p += cc5m
		}
		if !usedVars["cc1h"] {
			p += cc1h
		}
	} else {
		if usedVars["cr"] {
			p -= cr
		}
		if usedVars["cc"] {
			p -= cc5m
		}
		if usedVars["cc1h"] {
			p -= cc1h
		}
		if usedVars["img"] {
			p -= img
		}
		if usedVars["img_cr"] {
			p -= imgCR
		}
		if usedVars["ai"] {
			p -= ai
		}
		if usedVars["img_o"] {
			c -= imgO
		}
		if usedVars["ao"] {
			c -= ao
		}
	}

	// OpenAI cache-write usage reports unadjusted prefix counts, so cr + cc can
	// exceed the prompt and drive the remainder negative. Clamp at zero.
	if p < 0 {
		p = 0
	}
	if c < 0 {
		c = 0
	}
	if inputLen < 0 {
		inputLen = 0
	}

	return billingexpr.TokenParams{
		P:     p,
		C:     c,
		Len:   inputLen,
		CR:    cr,
		CC:    cc5m,
		CC1h:  cc1h,
		Img:   img,
		ImgCR: imgCR,
		ImgO:  imgO,
		AI:    ai,
		AO:    ao,
	}
}

func refreshTieredBillingGroup(relayInfo *relaycommon.RelayInfo) (*billingexpr.BillingSnapshot, error) {
	if relayInfo == nil {
		return nil, nil
	}
	snap := relayInfo.TieredBillingSnapshot
	if snap == nil || snap.BillingMode != "tiered_expr" {
		return nil, nil
	}

	groupRatio := relayInfo.PriceData.GroupRatioInfo.GroupRatio
	if snap.GroupRatio == groupRatio {
		return snap, nil
	}

	estimatedQuotaAfterGroup := snap.EstimatedQuotaBeforeGroup * groupRatio
	estimatedQuota, err := billingexpr.QuotaRoundStrict(estimatedQuotaAfterGroup)
	if err != nil {
		return nil, err
	}
	snap.GroupRatio = groupRatio
	snap.EstimatedQuotaAfterGroup = estimatedQuota
	return snap, nil
}

// PrepareTieredBillingForSelectedGroup refreshes routing-dependent billing
// state before an upstream attempt. An existing session reserves any higher
// estimate before sending. If the initial group was free and skipped
// pre-consume, switching to a paid group creates the session at that point.
func PrepareTieredBillingForSelectedGroup(c *gin.Context, relayInfo *relaycommon.RelayInfo) *types.NewAPIError {
	snap, err := refreshTieredBillingGroup(relayInfo)
	if err != nil {
		return types.NewErrorWithStatusCode(
			err,
			types.ErrorCodeModelPriceError,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}
	if snap == nil {
		return nil
	}
	if snap.GroupRatio == 0 {
		// Paid-to-free keeps FreeModel as-is: FreeModel means "pre-consume was
		// skipped", which is not true once a session exists, and settlement
		// already yields 0 for a zero group ratio.
		return nil
	}

	// The selected group is paid; clear a FreeModel flag frozen when the
	// initial group was free so downstream state stays consistent.
	relayInfo.PriceData.FreeModel = false

	if relayInfo.Billing == nil {
		return PreConsumeBilling(c, snap.EstimatedQuotaAfterGroup, relayInfo)
	}
	if err := relayInfo.Billing.Reserve(snap.EstimatedQuotaAfterGroup); err != nil {
		return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
	}
	relayInfo.FinalPreConsumedQuota = relayInfo.Billing.GetPreConsumedQuota()
	return nil
}

// TryTieredSettle checks if the request uses tiered_expr billing and, if so,
// computes the actual quota using the captured BillingSnapshot. Returns:
//   - ok=true, quota, result  when tiered billing applies
//   - ok=false, 0, nil        when it doesn't (caller should fall through to existing logic)
func TryTieredSettle(relayInfo *relaycommon.RelayInfo, params billingexpr.TokenParams) (ok bool, quota int, result *billingexpr.TieredResult) {
	snap := relayInfo.TieredBillingSnapshot
	if snap == nil || snap.BillingMode != "tiered_expr" {
		return false, 0, nil
	}

	requestInput := billingexpr.RequestInput{}
	if relayInfo.BillingRequestInput != nil {
		requestInput = *relayInfo.BillingRequestInput
	}
	if relayInfo.BillingImageCount != nil {
		requestInput.ImageCount = relayInfo.BillingImageCount
	} else if snap.EstimatedImageCount != nil {
		requestInput.ImageCount = snap.EstimatedImageCount
	}

	tr, err := billingexpr.ComputeTieredQuotaWithRequest(snap, params, requestInput)
	if err != nil {
		quota = relayInfo.FinalPreConsumedQuota
		if quota <= 0 {
			quota = snap.EstimatedQuotaAfterGroup
		}
		return true, quota, nil
	}

	// Surface any single-request saturation from settlement onto RelayInfo so the
	// consume log records it under admin_info, regardless of which caller
	// (text, audio, WSS) consumes the returned quota. First non-nil wins.
	noteQuotaClamp(relayInfo, tr.Clamp)

	return true, tr.ActualQuotaAfterGroup, &tr
}

// A failed evaluation retains the reservation and its estimated billing unit.
// Successful evaluations always use the actual branch, including zero prices.
func isFixedPriceSettlement(info *relaycommon.RelayInfo, result *billingexpr.TieredResult) bool {
	if result != nil {
		return result.BillingUnit == billingexpr.BillingUnitRequest
	}
	snap := info.TieredBillingSnapshot
	return snap != nil && snap.BillingMode == "tiered_expr" && snap.EstimatedBillingUnit == billingexpr.BillingUnitRequest
}
