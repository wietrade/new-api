# new-api (NowHub) 优化建议文档

> 配套文档：`AUDIT-REPORT.md`（同目录）。本文只列**可落地**的改法，按优先级排序。
> 分级：
> - **P0**：发版前必须修——资损、启动 fatal、数据丢失、核心功能不可用。
> - **P1**：本迭代修——重要功能 bug、安全加固、明显性能热点。
> - **P2**：backlog——可维护性、长期架构债、默认值收敛。
>
> 每条给出：问题位置（文件:行号）、改法、收益、预估工作量（S=≤0.5d，M=0.5-2d，L=>2d）。

---

## P0 — 发版前必须处理（4 条）

### P0-1　修复 `users` 钱包列 `type:int` 与启动 bigint 校验的矛盾

- **位置**：`model/user.go:97-104`、`model/main.go:204, 279-311`
- **改法**：
  1. 把 struct tag 改为 `gorm:"type:bigint;default:0"`：
     ```go
     Quota           int64 `gorm:"type:bigint;default:0"`
     UsedQuota       int64 `gorm:"type:bigint;default:0"`
     AffQuota        int64 `gorm:"type:bigint;default:0"`
     AffHistoryQuota int64 `gorm:"type:bigint;default:0"`
     ```
  2. 在 `migrateDB()` 加一段幂等 ALTER（与 `migrateSubscriptionPlanPriceAmount` 同模式）：
     - MySQL：`ALTER TABLE users MODIFY COLUMN quota BIGINT NOT NULL DEFAULT 0`（4 列同理）
     - PostgreSQL：`ALTER COLUMN quota TYPE BIGINT`
     - SQLite：跳过
  3. 字段类型从 `int` 改 `int64`，同步编译所有用到 `user.Quota` 的地方（GORM 会自动处理，但 `int` 字面量赋值处可能需要显式转换）。
- **收益**：消除全新 MySQL/PG 部署二次启动 fatal；消除 32 位 INT 上限导致的高净值用户截断。
- **工作量**：M（改 tag + 加迁移 + 三库验证）。

### P0-2　修复 `prefill_groups.name` 部分唯一索引在 MySQL 下的退化

- **位置**：`model/prefill_group.go:80`、`model/prefill_group_migration.go`
- **改法**（二选一）：
  - **方案 A（推荐，应用层）**：删除时把 `name` 改写为不可复用值：
    ```go
    // DeletePrefillGroup(id):
    DB.Model(&PrefillGroup{}).Where("id = ?", id).
        Update("name", fmt.Sprintf("__deleted_%d__", id))
    ```
    然后把 struct tag 里的 `where:deleted_at IS NULL` 保留（PG/SQLite 继续用部分索引），MySQL 下靠改写后名字天然不冲突。
  - **方案 B**：MySQL 分支迁移时把唯一索引改为 `(name, deleted_at)` 并接受多 NULL 语义，靠应用层去重。
- **收益**：MySQL 部署下软删分组可立即重建同名分组。
- **工作量**：S。

### P0-3　给 `channels.status/type` 加复合索引；规划 group/models 拆表

- **位置**：`model/channel.go:25,29,40`
- **改法（短期）**：
  ```go
  Type   int    `gorm:"default:0;index:idx_channels_status_type,priority:2"`
  Status int    `gorm:"default:1;index:idx_channels_status_type,priority:1"`
  ```
- **改法（长期，列入 P2 backlog）**：拆 `channel_groups(channel_id, group)` 关联表，`abilities` 路由改 JOIN。当前 `abilities` 表已经做了 (group, model, channel_id) 归一化，但主过滤仍落在 channels 的 CSV 字段上，短期加索引即可，长期重构排期。
- **收益**：渠道数破千时后台搜索/路由预热延迟显著下降。
- **工作量**：S（短期）/ L（长期拆表）。

### P0-4　修复渠道自动恢复后内存路由表不重新加回

- **位置**：`model/channel_cache.go:251-274 CacheUpdateChannelStatus`
- **改法**：在 `status == ChannelStatusEnabled` 分支里，把 channel id 重新追加回 `group2model2channels`：
  ```go
  if status == common.ChannelStatusEnabled {
      ch := channelsIDM[id]
      for _, g := range strings.Split(ch.Group, ",") {
          for _, m := range strings.Split(ch.Models, ",") {
              // 去重后 append，按 priority 重排
              if !contains(group2model2channels[g][m], id) {
                  group2model2channels[g][m] = append(group2model2channels[g][m], id)
              }
          }
      }
      sort.Slice(...) // 按 channelsIDM[cid].Priority 重排
      return
  }
  ```
- **兜底**：`EnableChannel` 成功后可直接调 `InitChannelCache()`（成本更高但最简单，建议先做这个兜底，再补增量逻辑）。
- **收益**：健康检查自动恢复的渠道立即接流量，避免"半残"窗口。
- **工作量**：S-M。

---

## P1 — 本迭代处理（13 条）

### P1-1　计费：上游负 token 全字段钳制 + 结算侧负 cost 报错

- **位置**：`service/tiered_settle.go:117-135`、`pkg/billingexpr/settle.go:32-38`
- **改法**：
  1. 在 `BuildTieredTokenParams` 末尾统一钳制：
     ```go
     cr = math.Max(cr, 0); cc5m = math.Max(cc5m, 0); cc1h = math.Max(cc1h, 0)
     img = math.Max(img, 0); ai = math.Max(ai, 0); ao = math.Max(ao, 0); imgO = math.Max(imgO, 0)
     ```
  2. 在 `ComputeTieredQuotaWithRequest` 对 `cost < 0 || IsNaN(cost) || IsInf(cost)` 显式 return error，让上层走"保留预扣"的保守分支，不要让负 cost 流经 Settle。
- **收益**：关闭"上游负缓存上报 → 净贷记用户"的资损路径。
- **工作量**：S。

### P1-2　计费：Claude 格式 cc/cc1h 未引用时并入 p

- **位置**：`service/tiered_settle.go:82-87`
- **改法**：
  ```go
  if isClaudeUsageSemantic {
      if !usedVars["cr"]  { p += cr }
      if !usedVars["cc"]  { p += cc5m }
      if !usedVars["cc1h"]{ p += cc1h }
  }
  ```
  并在 `SmokeTestExpr` 里对 Claude 语义显式警告"未引用 cc/cc1h"。
- **收益**：关闭 Anthropic 缓存写用量漏收。
- **工作量**：S。

### P1-3　计费：表达式 smoke test 覆盖时间/探针另一侧分支

- **位置**：`setting/billing_setting/tiered_billing.go:207-227, 357-367`
- **改法**：
  1. 对 `hour()` 采样 0/6/12/18/23，`weekday()` 采样 1/7，跑两遍 smoke。
  2. 对 `param()/header()` 条件，除现有 2 个固定 request 外，再生成一个"反探针"request（service_tier!=fast、anthropic-beta 不带 fast-mode）。
  3. 配合 P1-1 的结算侧负 cost 报错，双保险。
- **收益**：时间型/探针型坏分支在保存时即被发现，不带病上线。
- **工作量**：M。

### P1-4　计费：Realtime(WSS) 预扣改原子

- **位置**：`service/quota.go:88-155 PreWssConsumeQuota`
- **改法**：改用 `TryReserveUserQuota` 原子条件扣减；或对单用户在途 realtime segment 做计数闸（Redis INCR + 过期）。
- **收益**：关闭长连接并发透支。
- **工作量**：M。

### P1-5　计费：图片空 usage 不再强填 1 token

- **位置**：`relay/image_handler.go:171-176`
- **改法**：token 型图片表达式在 usage 缺失时按 `EstimatedPromptTokens` 兜底或保留预扣，而不是人造 1。
- **收益**：按 token 报价的图片模型少计费问题修复。
- **工作量**：S。

### P1-6　渠道：重试排除已试渠道 + 同层先试完再降级

- **位置**：`model/channel_cache.go:117-217`、`service/channel_select.go:390-392`
- **改法**：
  1. `RetryParam` 加 `UsedChannelIDs map[int]struct{}`，在 `GetRandomSatisfiedChannel` 显式排除。
  2. 同 priority 层内维护"已试渠道集合"，同层重试先把同层其他渠道试完，再降级到下一层。
- **收益**：避免重复打坏渠道；高 priority 池冗余渠道真正参与重试。
- **工作量**：M。

### P1-7　渠道：上游请求绑定客户端 context

- **位置**：`relay/channel/api_request.go:321`
- **改法**：`http.NewRequest` → `http.NewRequestWithContext(c.Request.Context(), ...)`。
- 流式场景若担心长连接被客户端断连误伤，可对 stream 请求单独评估（流式已有 `c.Request.Context().Err()` 检查）。
- **收益**：客户端取消后上游不再继续计费；goroutine/连接及时释放。
- **工作量**：S。

### P1-8　渠道：自动禁用同步从内存路由表移除

- **位置**：`service/relay_error.go:71-73`、`controller/relay.go:211-217`
- **改法**：在 `ProcessChannelError` 里同步先把 channel id 从内存路由表移除（轻量、无 DB），再异步做 DB 更新和通知。或在重试选渠道时把本次失败的 channel id 加入临时排除集合。
- **收益**：避免高并发下多个请求同时打到刚坏的渠道。
- **工作量**：S。

### P1-9　渠道：`filterAbilitiesByConstraints` 失败时 fail-closed

- **位置**：`model/ability.go:194-199`
- **改法**：DB 查询失败时返回 error 让上层走 "no channel available"，而不是放行未过滤 abilities。至少对 `request_path` / `responses_websocket` 这类 filter 也 fail-closed。
- **收益**：DB 故障期间渠道约束不被绕过。
- **工作量**：S。

### P1-10　安全：邮箱验证码一次性消费 + Redis 化

- **位置**：`common/verification.go:26-56`、`controller/user.go:283-289`
- **改法**：
  1. `Register` 校验成功后立即 `common.DeleteKey(user.Email, EmailVerificationPurpose)`。
  2. 验证码改存 Redis（项目已有 `common.RedisEnabled`），key=`email_verify:<purpose>:<email>`，TTL=10min，`GETDEL` 原子消费。
  3. 加 `INCR` 失败计数，5 次失败即作废。
  4. `GenerateVerificationCode(6)` 改 8 位数字或 UUID 前 8 位。
- **收益**：关闭验证码复用爆破；支持多节点部署。
- **工作量**：M。

### P1-11　安全：消除邮箱枚举

- **位置**：`controller/misc.go:176-181 SendEmailVerification`
- **改法**：无论邮箱是否已注册，API 都返回"验证码已发送"；若已注册，邮件正文写"该邮箱已注册，请直接登录"而不是 API 响应。
- **收益**：关闭账号枚举面。
- **工作量**：S。

### P1-12　安全：密码策略回收或加配套防护

- **位置**：`common/account_password.go:14`、`model/user.go:24`
- **改法（二选一）**：
  - **方案 A（推荐）**：把下限收回 `min=10`，加 `ValidatePasswordComplexity`（至少 2 类字符），登录失败 5 次/账号/15min 临时锁定。
  - **方案 B（若 6 位是产品决策）**：保留 6 位，但在文档记录风险接受，并强制 TOTP/Passkey、加账号维度失败锁定、加异常登录检测。
  - 同时清理 `en.json:2171, :4295` 等残留 "8-20 characters" 文案键。
- **收益**：OWASP ASVS V2.1.1 合规。
- **工作量**：S-M。

### P1-13　ops 脚本：修复 cron 半失败漂移 + deleted_at 格式 + abilities 同步

- **位置**：
  - `scripts/ops/cron-promote-upcoming.sh:13-24`
  - `scripts/ops/drop_model.py:60`
  - `scripts/ops/rename_model.py:86-105`
  - `scripts/ops/apply_billing.py:85`
- **改法**：
  1. **cron 漂移**：把 `promote_upcoming_pricing.py --apply` 拆成"预演输出 → export → apply_billing --dry-run 校验 → apply → restart"；任一步失败时不写盘或写盘后保留 `/tmp/billing-upcoming.json` 供人工补跑并显式告警。
  2. **deleted_at 格式**：在测试 SQLite 上对比 `db.Delete(&Model{})` 产生的字符串与 `datetime('now')` 输出，统一格式（推荐用 Python 侧生成与 GORM 一致的 RFC3339 时间戳）。
  3. **abilities 同步**：`rename_model.py` 事务内 `UPDATE abilities SET model=? WHERE model=?`，dry-run 打印受影响行数。
  4. **busy_timeout**：`sqlite3.connect(args.db, timeout=10)`。
- **收益**：消除 git 与线上价格静默漂移；消除软删模型路由残留；消除 rename 后孤儿路由。
- **工作量**：M。

---

## P2 — Backlog（12 条）

| # | 位置 | 建议 | 工作量 |
|---|---|---|---|
| P2-1 | `model/subscription.go:160`、`custom_oauth_provider.go:45` | 去掉 bool `default:true/false` 标签，在 BeforeCreate 里补默认值，消除 AutoMigrate 反复 ALTER | S |
| P2-2 | `model/token.go:23,28` | `RemainQuota/UsedQuota` 改 `int64` + `type:bigint`，与 C1 同批迁移 | S |
| P2-3 | `channel.go:54`、`task.go:67/70/71`、`audit_log.go:45`、`prefill_group.go:82` | JSON 列统一改自定义 `JSONText` 类型（MySQL→json/text，PG→jsonb，SQLite→text），复用 `task_plugin.go:69 LongText` 范式 | M |
| P2-4 | `model/user.go:88` | PG 加 `CREATE UNIQUE INDEX ON users (LOWER(email)) WHERE deleted_at IS NULL`；MySQL 用生成列 `email_lower` | M |
| P2-5 | `model_meta.go:37,54`、`vendor_meta.go:19,25` | 唯一索引改部分索引 `WHERE deleted_at IS NULL`（PG/SQLite），MySQL 用生成列 | M |
| P2-6 | `model/casbin_rule.go:5-11` | 删掉冗余普通索引 `idx_casbin_rule`，只保留 uniqueIndex | S |
| P2-7 | `midjourney.go:22`、`redemption.go:14-25` | 加 `(user_id, status)`、`(channel_id, status)` 复合索引 | S |
| P2-8 | `middleware/cors.go:14-25` | 用 `AllowOrigins: common.SessionCookieTrustedURLs`，去掉 `AllowAllOrigins`；或直接移除 relay 路由上的 CORS | S |
| P2-9 | `common/constants.go:40`、`common/init.go:60-70` | 未配置 `SESSION_SECRET` 时打 WARN 日志；HTTPS 部署自动置 `SessionCookieSecure=true` | S |
| P2-10 | `middleware/security_headers.go:12-27` | 加 CSP：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'` | S |
| P2-11 | `middleware/recover.go:22-37` | `RelayPanicRecover` 对外统一 `{"error":"Internal Server Error"}`，详细错误只写日志 | S |
| P2-12 | `relay/common/relay_info.go:1186-1190` | `prompt_cache_retention` 加 channel 级 `AllowPromptCacheRetention` 开关（与 service_tier 对齐），默认 false | S |
| P2-13 | `controller/perf_probe.go` | perf 探针加上游预算告警；对按张计费的 image 类模型跳过探针 | S |
| P2-14 | `cmd/pricing-expr-migrate/main.go:163-176` | 写前 `cp one-api.db one-api.db.bak-<ts>`，与 ops 脚本对齐 | S |
| P2-15 | `model/channel.go:865-919` | `EditChannelByTag` 成功后对受影响渠道调 `CacheUpdateChannel` + 重排，或直接 `InitChannelCache()` | S |
| P2-16 | `relay/channel/api_request.go:155-186` | `{client_header:<name>}` 占位符加黑名单（authorization/x-api-key/x-goog-api-key/cookie） | S |
| P2-17 | `relay/channel/openai/relay-openai.go:104-198` | 流式断流在写出第一个 chunk 前返回 error 让主循环重试；已写出部分内容时至少写 warning 日志 + 半额退款 | M |

---

## 长期架构债（建议立项，不排期）

1. **channels.group/models 拆关联表**（与 P0-3 长期方案一致）：当前 CSV 字符串 `LIKE '%,x,%'` 无法走索引，是路由热路径最大的架构债。
2. **钱包/额度统一用 int64**：C1/M2 都是 32 位 int 残留，建议一次性把所有 quota 列改 int64 + bigint，并加启动校验。
3. **验证码/限流全部 Redis 化**：当前内存 map（verification、perf probe、限流计数）在多节点部署下都有一致性问题，项目已有 Redis，建议统一迁移。
4. **ops 脚本与 Go 迁移统一**：`scripts/ops/*.py` 直接写 SQLite 绕过了 GORM，时间格式/跨表一致性都靠人保证（O-F2/O-F3）。建议把这些运维操作收编为 Go 迁移或管理 API，走正式事务路径。
5. **前端审计**：本次未做完整前端代码审计，建议补一轮 React 前端的 XSS / 权限渲染 / 敏感信息泄露面审计。

---

## 建议的修复顺序

1. **第 1 周**：P0-1（启动 fatal）、P0-4（渠道恢复不接流量）、P1-1（负 token 资损）、P1-7（context 绑定）。这四个都是"上线即可能踩"的高危项。
2. **第 2 周**：P0-2/P0-3（DB schema）、P1-2/P1-3（计费表达式）、P1-10/P1-11/P1-12（安全认证三件套）。
3. **第 3 周**：P1-4/P1-5/P1-6/P1-8/P1-9（渠道重试与并发）、P1-13（ops 脚本）。
4. **下季度**：P2 批次 + 长期架构债。
