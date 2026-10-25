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

`go test ./model/ ./common/ ./service/ ./pkg/billingexpr/ ./relay/channel/...` 全绿；
`go build ./...` 通过；B-M4 另跑 `./service/... ./relay/... ./model/... ./pkg/... ./controller/... ./setting/...`，除第三节列出的 6 个基线控制器失败外全绿；
部署后 `/`、`/pricing`、`/pricing/<model>`、`/docs/`、`/api/status` 均 200。

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

## 四、渠道协议与缓存写入计费（2026-10-25）

### 现象

`claude-opus-5-5` 两小时内 77 次成功调用，我们记录 9.19M token（输入 9,125,389 + 输出 63,186），上游报表 9.34M / ¥10.60，差额约 151K —— 正是缓存写入。

用表达式反算即可确认我方 `cc` 为 0：`p*4 + c*20 + cr*0.2` 的结果与记录 quota 1,581,662 分毫不差，说明缓存写入完全没有进入计费。

### 根因

渠道类型 59（sub2api）继承 newapi 适配器，转发地址直接取入站路径（`relay_info.go:639` → `newapi/adaptor.go:36`）。客户端用 OpenAI 协议时上游也收到 OpenAI 请求，而 **OpenAI 协议没有 cache_write 字段**，上游在转换时把 `cache_creation_input_tokens` 丢掉了，我方无从计费。

### 处置

znbcode 的 Claude 分组本身是 Anthropic 原生，全部改为渠道类型 14（`/v1/messages` 固定出站），与客户端协议无关：

| 渠道 | 上游分组 | 上游倍率 | 我方分组 | 我方倍率 | 覆盖倍数 |
|:---|:---|:---:|:---|:---:|---:|
| `znb-cc-稳定` | znb-cc-稳定 | 0.8 | Claude稳定 | 0.25 | 2.1× |
| `znb-cc-特惠` | znb-cc-特惠 | 0.3 | Claude特惠 | 0.12 | 2.7× |
| `znb-cc-max-满血` | znb-cc-max-满血 | 1.5 | Claude满血 | 0.40 | 1.8× |
| `znb-cc-max-正价20` | znb-cc-max-正价20 | 2.0 | Claude正价 | 0.60 | 2.0× |

> 上游计价单位是人民币（充值 ¥1 = 1 个计价单位），我方按美元计费。按 1 USD = 6.8 CNY，保本倍率 = 上游倍率 ÷ 6.8，故各分组均有 1.8~2.7 倍覆盖。

### 实测验证

| 场景 | 上游返回 | 入账 | quota | 手算 |
|:---|:---|:---|:---:|:---|
| 稳定组 5m 写入 | `cw=17,519` | `cc=17519`、`cc5m=17519` | 10,955 | $(6×4+1×20+17519×5)/10^6×5×10^5×0.25$ ✅ |
| 稳定组缓存命中 | `cr=17,519` | `cr=17519` | 443 | ✅ |
| 正价组 1h 写入 | `ephemeral_1h=12,631` | `cc=12631`、`cc1h=12631` | 30,348 | $(8×4+4×20+12631×8)/10^6×5×10^5×0.6$ ✅ |

结论：Anthropic 原生 + 分档齐全时，5m 按 `cc`、1h 按 `cc1h` 计费，与上游口径一致。

### 聚合值兜底（已修复）

`BuildTieredTokenParams` 在 anthropic 语义下用分档值覆盖聚合值（`tiered_settle.go:37-38`），而 `GetCacheCreation5mTokens()` 在上游未返回 `cache_creation` 分档对象时返回 0。实测非流式路径因此把一整块缓存写入丢弃（应 7150，实收 2150），且日志里 `cache_creation_tokens` 仍正常记录，属于**静默漏收**。

修复：分档 5m / 1h 全为 0 时用 `CacheCreationTokensTotal()` 按 5m 档兜底，与 `cacheCreationTokensForOpenAIUsage` 的语义一致。

回归测试 `TestCacheWriteTokensAreBilledPerChannelProtocol` 覆盖四个场景：

| 用例 | 期望 quota | 说明 |
|:---|:---:|:---|
| `anthropic_aggregate_only` | 7150 | 修复前 2150，聚合值被丢弃 |
| `anthropic_with_cache_creation_split` | 7900 | 5m=1500@5 + 1h=500@8 |
| `anthropic_aggregate_only_stream` | 7150 | 流式路径本来就走规范化，保持正确 |
| `openai_compatible` | 6150 | OpenAI 协议无缓存写字段，只能按输入价计 |
