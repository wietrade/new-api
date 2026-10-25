# 审计问题修复记录（豆包 AUDIT-REPORT / OPTIMIZATION）

> 规则：先写失败测试证明缺陷存在 → 修复 → 复测转绿 → 跑受影响包的完整回归 → 部署冒烟。
> 每条都标注「代码是否属实」「对我们的实际影响」，不盲信审计结论。

## 一、已修复并验证（2026-10-25）

| 审计编号 | 问题 | 修复内容 | 验证 |
|:--|:--|:--|:--|
| B-M1 | 上游上报负 token 未钳制 → 负成本按退款净贷记用户 | `BuildTieredTokenParams` 对所有 token 计数钳制为非负（含 `cr/cc/cc1h/img/img_cr/img_o/ai/ao`），`inputLen` 同样钳制 | `TestBuildTieredTokenParams_ClampsNegativeCounts*`、`TestTryTieredSettle_NegativeUsageNeverProducesNegativeQuota`（修复前 quota = -50000） |
| B-M1（兜底） | 表达式本身产出负/非有限成本 | `ComputeTieredQuotaWithRequest` 对 `NaN/Inf/负值` 返回错误，上层回退「保留预扣」 | `TestComputeTieredQuota_RejectsNegativeCost` |
| B-M2 | Claude 格式下未被引用的 `cc/cc1h` 不进 `p`，缓存写免费 | Claude 分支按 GPT 语义把未引用的 `cc/cc1h` 并回输入价 | `TestBuildTieredTokenParams_MergesUnreferencedClaudeCacheCreation`（修复前 p=100，应为 3100） |
| S-M1 | 邮箱验证码可重复使用（有效期 10 分钟内） | 新增 `common.VerifyAndConsumeCode`（校验+删除同锁内完成），注册与重置密码改用一次性消费 | `common/verification_consume_test.go`（3 例） |
| S-M2 | `/api/verification` 可直接枚举已注册邮箱 | 已注册分支返回与未注册完全相同的 200 响应，仅记录日志、不发送注册验证码 | `controller/email_enumeration_test.go` |
| P1-7 | 上游请求用 `http.NewRequest`，客户端断连后上游继续计费 | 新增 `newUpstreamRequest`（`NewRequestWithContext`），主路径 + 重试路径 + 即梦 adapter 全部改用它 | `relay/channel/api_request_context_test.go`（2 例） |
| C4 | 渠道自动恢复后不回到内存路由表（最多 60s 不接流量） | 启用成功且开启内存缓存时重建路由表；`EnableChannelByTag` 同样处理 | `model/channel_cache_enable_test.go` |
| —（附带发现） | `InitChannelCache` 在 abilities 与 channels 的 group 不一致时对 nil map 赋值 panic | 循环前兜底建 map | 同上测试（修复前直接 panic） |
| —（附带发现） | 元数据同步向导 `FIELD_LABELS` / `MetadataSyncField` 缺 3 个新字段，契约测试失败 | 前端类型与标签补齐 + fr/ja/ru/vi/zh-TW 文案 | `TestFieldLabelsCoverEveryLocale` 转绿 |
| P1-3 | 表达式 smoke test 不覆盖 `hour()/weekday()` 的另一分支，坏分支可带病上线 | `RequestInput` 加 `Now *time.Time` 支持注入时钟；`timeInZone` 改用注入值；`smokeTestExpr` 用多时刻（周日 0/6/12/18/23 点、周一 0 点）扫分支 | `TestRunExprWithRequestHonorsInjectedClock`、`TestSmokeTestExprCoversTimeBranchOtherwiseUnreachable`、`TestSmokeTestExprCoversWeekendBranch`（修复前 `pkg/billingexpr` 编译失败） |
| B-M4 | Realtime **双重扣费**（审计只写了并发透支）：会话预扣 E + 流中 `PreWssConsumeQuota` 每段直接扣钱包 Σ + 末尾 `SettleBilling` 结 (A−E) → 总扣 ≈ 2A | `PreWssConsumeQuota` 不再扣款，只把每段应计累加到 `RelayInfo.RealtimeAccruedQuota`，超出预扣部分大于钱包/令牌余额时断流；扣款统一由末尾 `SettleBilling` 结算一次 | `TestRealtimeStreamChargesOnlyOnceAtSettlement`（修复前钱包多扣 37500）、`TestRealtimeStreamStopsWhenAccruedExceedsBalance` |

### 回归范围

`go test ./model/ ./B-M4 另跑 `./service/... ./relay/... ./model/... ./pkg/... ./controller/... ./setting/...`，除第三节列出的 6 个基线控制器失败外全绿；common/ ./service/ ./pkg/billingexpr/ ./relay/channel/...` 全绿；
`go build ./...` 通过；部署后 `/`、`/pricing`、`/pricing/<model>`、`/docs/`、`/api/status` 均 200。

## 二、经核实**不成立 / 分级过高**的审计结论

| 审计编号 | 豆包结论 | 实际情况 |
|:--|:--|:--|
| C3 | `channels` 无索引导致「路由热路径全表扫描」 | 路由走 `abilities` 表（`model/ability.go:108`），CSV `LIKE` 只出现在后台渠道**搜索**；应降为 P2 |
| C4 分级 | Critical | 我们线上未启用 `MEMORY_CACHE_ENABLED`（DB 模式），该缺陷不触发；修复后作为将来启用内存缓存的前置保障 |
| R-M2 | 同 priority 层重试直接跳到下一层、同层渠道不被尝试 | `retry` 参数本就是「优先级层级索引」，同层内按权重随机，属设计而非缺陷 |
| C1 / C2 | Critical，发版前必须处理 | 代码属实，但只影响 MySQL/PG 部署（线上 SQLite 显式跳过校验）；应在**迁移数据库前**处理 |

## 三、已知未修复项（需要单独排期）

| 项 | 原因 |
|:--|:--|
| C1 `users` 钱包列 `type:int` + bigint 校验矛盾 | 需要真实 MySQL/PG 实例验证 DDL 行为，且涉及 wallet 列类型迁移 |
| C2 `prefill_groups` 部分唯一索引在 MySQL 退化 | 同上，需要 MySQL 实测 |
| B-M5 图片空 usage | 空 usage 被强填 1 token；**且预扣端 `EstimatedCompletionTokens` 恒为 0，`img_o` 不参与预扣**，所以「保留预扣」也无法止血 | 先加告警（零计费变化）拿触发率，再定 fail-closed / 估算口径 |
| 审计基线已有的 6 个控制器测试失败 | 在 `0490d19` 上同样失败，与本次修复无关；其中 `PasswordPolicy/short` 是密码下限 8→6 后测试未同步（对应 S-M3 产品决策待定） |
