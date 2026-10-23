package perf_metrics_setting

import (
	"time"

	"github.com/QuantumNous/new-api/setting/config"
)

type PerfMetricsSetting struct {
	Enabled       bool   `json:"enabled"`
	FlushInterval int    `json:"flush_interval"`
	BucketTime    string `json:"bucket_time"`
	RetentionDays int    `json:"retention_days"`

	// Probe* 控制「主动探针」：定时对没有真实流量的模型发一条极小的请求，
	// 把真实上游延迟写进 perf_metrics，模型广场的延迟列才不会整列空着。
	ProbeEnabled         bool     `json:"probe_enabled"`
	ProbeIntervalMinutes int      `json:"probe_interval_minutes"`
	ProbeTimeoutSeconds  int      `json:"probe_timeout_seconds"`
	ProbeModels          []string `json:"probe_models"`
}

var perfMetricsSetting = PerfMetricsSetting{
	Enabled:              true,
	FlushInterval:        5,
	BucketTime:           "hour",
	RetentionDays:        0,
	ProbeEnabled:         false,
	ProbeIntervalMinutes: 30,
	ProbeTimeoutSeconds:  40,
}

func init() {
	config.GlobalConfig.Register("perf_metrics_setting", &perfMetricsSetting)
}

func GetSetting() PerfMetricsSetting {
	return perfMetricsSetting
}

func GetBucketSeconds() int64 {
	switch perfMetricsSetting.BucketTime {
	case "minute":
		return 60
	case "5min":
		return 300
	case "hour":
		return 3600
	default:
		return 3600
	}
}

func GetFlushIntervalMinutes() int {
	if perfMetricsSetting.FlushInterval < 1 {
		return 1
	}
	return perfMetricsSetting.FlushInterval
}

// GetProbeInterval returns the delay between two probe sweeps.
func GetProbeInterval() time.Duration {
	minutes := perfMetricsSetting.ProbeIntervalMinutes
	if minutes < 1 {
		minutes = 30
	}
	return time.Duration(minutes) * time.Minute
}

// GetProbeTimeout returns the per-model probe deadline.
func GetProbeTimeout() time.Duration {
	seconds := perfMetricsSetting.ProbeTimeoutSeconds
	if seconds < 1 {
		seconds = 40
	}
	return time.Duration(seconds) * time.Second
}
