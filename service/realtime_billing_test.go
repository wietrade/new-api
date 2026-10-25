package service

import (
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const realtimeTestModel = "realtime-billing-test-model"

func realtimeSegment(tokens int) *dto.RealtimeUsage {
	usage := &dto.RealtimeUsage{TotalTokens: tokens, InputTokens: tokens}
	usage.InputTokenDetails.TextTokens = tokens
	return usage
}

// 与 PreWssConsumeQuota 相同的口径，算出一段 usage 的应计额度。
func realtimeSegmentQuota(t *testing.T, tokens int) int {
	t.Helper()
	modelRatio, _, _ := ratio_setting.GetModelRatio(realtimeTestModel)
	quota, clamp := calculateAudioQuota(QuotaInfo{
		InputDetails: TokenDetails{TextTokens: tokens},
		ModelName:    realtimeTestModel,
		ModelRatio:   modelRatio,
		GroupRatio:   ratio_setting.GetGroupRatio("default"),
	})
	require.Nil(t, clamp)
	require.Positive(t, quota)
	return quota
}

func newRealtimeRelayInfo(userID, tokenID, channelID int, tokenKey string) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		UserId:          userID,
		TokenId:         tokenID,
		TokenKey:        tokenKey,
		ChannelMeta:     &relaycommon.ChannelMeta{ChannelId: channelID},
		OriginModelName: realtimeTestModel,
		UsingGroup:      "default",
		UserGroup:       "default",
		StartTime:       time.Now(),
		PriceData: types.PriceData{
			ModelRatio:     2,
			GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
		},
	}
}

// PreWssConsumeQuota 按 key 查令牌，需要 model 已初始化列名；LOG_SQL_DSN 为空时 InitLogDB 只做这件事。
func initRealtimeTestColumns(t *testing.T) {
	t.Helper()
	require.Empty(t, os.Getenv("LOG_SQL_DSN"))
	require.NoError(t, model.InitLogDB())
}

func newRealtimeTestContext() *gin.Context {
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("GET", "/v1/realtime", nil)
	return ctx
}

// B-M4：会话已预扣 E，流中各段只能校验余额，不能再扣钱包；末尾按实际 A 结算一次。
func TestRealtimeStreamChargesOnlyOnceAtSettlement(t *testing.T) {
	truncate(t)
	initRealtimeTestColumns(t)
	const userID, tokenID, channelID = 801, 801, 801
	const start, reserved = 1_000_000, 5_000
	const tokenKey = "realtime-once"
	// 模拟 PreConsumeBilling 已完成的预扣。
	seedUser(t, userID, start-reserved)
	seedToken(t, tokenID, userID, tokenKey, start-reserved)
	seedChannel(t, channelID)

	info := newRealtimeRelayInfo(userID, tokenID, channelID, tokenKey)
	info.FinalPreConsumedQuota = reserved
	info.Billing = &BillingSession{
		relayInfo:        info,
		funding:          &WalletFunding{userId: userID, consumed: reserved},
		preConsumedQuota: reserved,
		tokenConsumed:    reserved,
	}
	ctx := newRealtimeTestContext()

	require.NoError(t, PreWssConsumeQuota(ctx, info, realtimeSegment(500)))
	require.NoError(t, PreWssConsumeQuota(ctx, info, realtimeSegment(500)))

	userQuota, err := model.GetUserQuota(userID, true)
	require.NoError(t, err)
	assert.Equal(t, start-reserved, userQuota, "流中不得扣钱包")
	var token model.Token
	require.NoError(t, model.DB.First(&token, tokenID).Error)
	assert.Equal(t, start-reserved, token.RemainQuota, "流中不得扣令牌")

	// 实际 A = 1000 输入 token × 模型倍率 2 × 分组倍率 1。
	const actual = 2_000
	PostWssConsumeQuota(ctx, info, info.OriginModelName, realtimeSegment(1000), nil)

	userQuota, err = model.GetUserQuota(userID, true)
	require.NoError(t, err)
	assert.Equal(t, start-actual, userQuota, "总扣费必须等于实际 A")
	require.NoError(t, model.DB.First(&token, tokenID).Error)
	assert.Equal(t, start-actual, token.RemainQuota)
}

// 不扣款后仍要按「累计应计」断流，防止余额不足的长连接无限透支。
func TestRealtimeStreamStopsWhenAccruedExceedsBalance(t *testing.T) {
	truncate(t)
	initRealtimeTestColumns(t)
	const userID, tokenID, channelID = 802, 802, 802
	const tokenKey = "realtime-stop"
	segment := realtimeSegmentQuota(t, 500)
	balance := segment + segment/2
	seedUser(t, userID, balance)
	seedToken(t, tokenID, userID, tokenKey, 10*segment)
	seedChannel(t, channelID)

	info := newRealtimeRelayInfo(userID, tokenID, channelID, tokenKey)
	ctx := newRealtimeTestContext()

	require.NoError(t, PreWssConsumeQuota(ctx, info, realtimeSegment(500)))
	require.Error(t, PreWssConsumeQuota(ctx, info, realtimeSegment(500)), "累计应计超过余额必须断流")

	userQuota, err := model.GetUserQuota(userID, true)
	require.NoError(t, err)
	assert.Equal(t, balance, userQuota, "断流前也不得在流中扣钱包")
}
