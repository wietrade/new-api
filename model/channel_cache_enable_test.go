package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 内存路由表只记录启用中的渠道；自动禁用会把渠道摘掉，但"重新启用"过去只在
// channelsIDM 里改状态、不把 id 加回 group2model2channels，导致恢复后的渠道
// 要等到下一次 SYNC_FREQUENCY（默认 60s）全量重建才会重新接流量。

func setupChannelCacheTest(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.Exec("DELETE FROM abilities").Error)
	require.NoError(t, DB.Exec("DELETE FROM channels").Error)

	previous := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() {
		common.MemoryCacheEnabled = previous
		channelSyncLock.Lock()
		group2model2channels = nil
		channelsIDM = nil
		channelSyncLock.Unlock()
	})
	InitChannelCache()
}

func TestReEnableChannelRestoresMemoryRouting(t *testing.T) {
	setupChannelCacheTest(t)

	channel := Channel{
		Name:   "recoverable",
		Key:    "sk-test",
		Status: common.ChannelStatusEnabled,
		Group:  "default",
		Models: "recover-model",
	}
	require.NoError(t, DB.Create(&channel).Error)
	InitChannelCache()

	require.NotNil(t, pickRoutingChannel(t, "default", "recover-model"), "启用状态下应能路由到该渠道")

	require.True(t, UpdateChannelStatus(channel.Id, "", common.ChannelStatusAutoDisabled, "upstream 5xx"))
	assert.Nil(t, pickRoutingChannel(t, "default", "recover-model"), "禁用后应从路由表移除")

	require.True(t, UpdateChannelStatus(channel.Id, "", common.ChannelStatusEnabled, ""))
	require.Eventually(t, func() bool {
		return pickRoutingChannel(t, "default", "recover-model") != nil
	}, 2*time.Second, 25*time.Millisecond, "重新启用后应立即恢复路由")
}

func pickRoutingChannel(t *testing.T, group string, modelName string) *Channel {
	t.Helper()
	channel, err := GetRandomSatisfiedChannel(group, modelName, 0, nil)
	if err != nil {
		return nil
	}
	return channel
}
