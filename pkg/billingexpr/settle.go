package billingexpr

import (
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
)

// quotaConversion converts raw expression output to quota based on the
// expression version. This is the central dispatch point for future versions
// that may use a different conversion formula.
func quotaConversion(exprOutput float64, snap *BillingSnapshot) float64 {
	if snap.TaskUsageBilling {
		return exprOutput * snap.QuotaPerUnit
	}
	switch snap.ExprVersion {
	default: // v1: coefficients are $/1M tokens prices
		return exprOutput / 1_000_000 * snap.QuotaPerUnit
	}
}

// ComputeTieredQuota runs the Expr from a frozen BillingSnapshot against
// actual token counts and returns the settlement result.
func ComputeTieredQuota(snap *BillingSnapshot, params TokenParams) (TieredResult, error) {
	return ComputeTieredQuotaWithRequest(snap, params, RequestInput{})
}

func ComputeTieredQuotaWithRequest(snap *BillingSnapshot, params TokenParams, request RequestInput) (TieredResult, error) {
	if snap.TaskUsageBilling && UsesFixedPricingByHash(snap.ExprString, snap.ExprHash) {
		return TieredResult{}, fmt.Errorf("fixed pricing is not supported for task usage expressions")
	}
	cost, trace, err := RunExprByHashWithRequest(snap.ExprString, snap.ExprHash, params, request)
	if err != nil {
		return TieredResult{}, err
	}
	// 负成本在结算链路上等同退款：BillingSession.Settle 会用「实际 - 预扣」
	// 的负差值调用 IncreaseUserQuota。表达式产出负值永远不是合法计费结果，
	// 直接报错让上层回退到保守的「保留预扣」分支。
	if math.IsNaN(cost) || math.IsInf(cost, 0) {
		return TieredResult{}, fmt.Errorf("billing expression produced non-finite cost")
	}
	if cost < 0 {
		return TieredResult{}, fmt.Errorf("billing expression produced negative cost")
	}

	quotaBeforeGroup := quotaConversion(cost, snap)
	afterGroup, clamp := common.QuotaRoundChecked(quotaBeforeGroup * snap.GroupRatio)
	crossed := trace.MatchedTier != snap.EstimatedTier

	result := TieredResult{
		ImageCount:             trace.ImageCount,
		BillingUnit:            trace.BillingUnit,
		FixedPrice:             trace.FixedPrice,
		ActualQuotaBeforeGroup: quotaBeforeGroup,
		ActualQuotaAfterGroup:  afterGroup,
		MatchedTier:            trace.MatchedTier,
		RequestRules:           trace.RequestRules,
		CrossedTier:            crossed,
		Clamp:                  clamp,
	}
	if trace.BillingUnit == BillingUnitToken && UsedVarsByHash(snap.ExprString, snap.ExprHash)["img_cr"] {
		result.BillingTokens = &params
	}
	return result, nil
}
