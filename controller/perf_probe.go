package controller

import (
	"context"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// 主动探针：模型广场的「延迟」列只统计真实请求，没有流量的模型会一直显示「—」。
// 这里定时对每个上架模型发一条 max_tokens=16 的请求，把真实上游延迟写进
// perf_metrics（与用户请求同一张表、同一个聚合口径），广场就能显示实测延迟。
//
// 开关与频率见 options 里的 perf_metrics_setting：
//
//	probe_enabled / probe_interval_minutes / probe_timeout_seconds / probe_models
//
// probe_models 为空表示自动覆盖 /api/pricing 里的全部模型。

const probeInterModelDelay = 300 * time.Millisecond

type probeTarget struct {
	model string
	group string
}

var perfProbeOnce sync.Once

// StartPerfProbeLoop 启动后台探针循环；重复调用无副作用。
func StartPerfProbeLoop() {
	perfProbeOnce.Do(func() {
		go func() {
			// 等渠道缓存与用户缓存就绪，避免冷启动时误判失败。
			time.Sleep(2 * time.Minute)
			for {
				runPerfProbeSweep()
				time.Sleep(perf_metrics_setting.GetProbeInterval())
			}
		}()
	})
}

func runPerfProbeSweep() {
	setting := perf_metrics_setting.GetSetting()
	if !setting.ProbeEnabled {
		return
	}
	targets := buildProbeTargets(setting.ProbeModels)
	if len(targets) == 0 {
		return
	}
	userID, err := resolveChannelTestUserID(nil)
	if err != nil {
		common.SysError(common.LogText("perf probe: failed to resolve probe user: %s", err.Error()))
		return
	}
	sampled := 0
	for _, target := range targets {
		if probeOneModel(userID, target) {
			sampled++
		}
		time.Sleep(probeInterModelDelay)
	}
	common.SysLog(common.LogText("perf probe: sampled %d/%d models", sampled, len(targets)))
}

// buildProbeTargets 选出「一个模型一条探针」的目标列表。
// 每个模型只取倍率最低的可用分组，与广场展示的最优价保持一致。
func buildProbeTargets(only []string) []probeTarget {
	pricing := model.GetPricing()
	if len(pricing) == 0 {
		return nil
	}
	ratios := ratio_setting.GetGroupRatioCopy()
	allow := make(map[string]struct{}, len(only))
	for _, name := range only {
		if name != "" {
			allow[name] = struct{}{}
		}
	}

	targets := make([]probeTarget, 0, len(pricing))
	seen := make(map[string]struct{}, len(pricing))
	for _, row := range pricing {
		if row.ModelName == "" {
			continue
		}
		if len(allow) > 0 {
			if _, ok := allow[row.ModelName]; !ok {
				continue
			}
		}
		if _, ok := seen[row.ModelName]; ok {
			continue
		}
		group := cheapestProbeGroup(row.EnableGroup, ratios)
		if group == "" {
			continue
		}
		seen[row.ModelName] = struct{}{}
		targets = append(targets, probeTarget{model: row.ModelName, group: group})
	}
	return targets
}

func cheapestProbeGroup(groups []string, ratios map[string]float64) string {
	best := ""
	bestRatio := 0.0
	for _, group := range groups {
		ratio, ok := ratios[group]
		if !ok {
			continue
		}
		if best == "" || ratio < bestRatio {
			best = group
			bestRatio = ratio
		}
	}
	return best
}

// probeOneModel 复用渠道测试链路发一条最小请求，返回是否成功采样。
func probeOneModel(userID int, target probeTarget) bool {
	channel, err := model.GetRandomSatisfiedChannel(target.group, target.model, 0, nil)
	if err != nil {
		common.SysError(common.LogText("perf probe: channel lookup failed model=%s group=%s err=%s", target.model, target.group, err.Error()))
		return false
	}
	if channel == nil {
		return false
	}

	ctx, cancel := context.WithTimeout(context.Background(), perf_metrics_setting.GetProbeTimeout())
	defer cancel()

	started := time.Now()
	result := testChannel(ctx, channel, userID, target.model, "", false, testChannelOptions{silent: true})
	elapsed := time.Since(started).Milliseconds()
	if elapsed <= 0 {
		elapsed = 1
	}

	success := result.localErr == nil && result.newAPIError == nil
	perfmetrics.Record(perfmetrics.Sample{
		Model:        target.model,
		Group:        target.group,
		LatencyMs:    elapsed,
		Success:      success,
		GenerationMs: elapsed,
	})
	if !success {
		errText := "unknown error"
		if result.newAPIError != nil {
			errText = result.newAPIError.Error()
		} else if result.localErr != nil {
			errText = result.localErr.Error()
		}
		common.SysError(common.LogText("perf probe: model=%s group=%s channel=#%d failed: %s", target.model, target.group, channel.Id, errText))
	}
	return success
}
