# new-api (NowHub) 代码审计报告

> 审计日期：2026-10-25
> 审计基线：`J:\hubapi\new-api` 工作区当前 HEAD（`0490d19 chore(ops): 修正 cron 脚本可执行位`）
> 审计方法：5 路并行深审（数据库 schema / 计费额度 / 渠道中继 / 安全认证 / git 历史+元数据脚本），全部基于真实源码逐行核实；git 提交段按 doubao-coding-review-code 方法学执行，只报"新引入、可触发、证据闭合"的缺陷。
> 文档读者：项目 owner / 资深全栈工程师。

---

## 0. 结论速览

| 维度 | Critical | Major | Minor |
|---|---:|---:|---:|
| 数据库 Schema | 3 | 7 | 9 |
| 计费 / 额度 / 表达式 | 0 | 5 | 5 |
| 渠道 / 中继 / 上游转发 | 1 | 5 | 4 |
| 安全 / 认证 / 中间件 | 0 | 4 | 5 |
| git 提交历史（80 条） | 0 | 3 | 4 |
| metadata / 运维脚本 | 0 | 3 | 3 |
| **合计（去重后）** | **4** | **25** | **30** |

**一句话结论**：核心资金安全链路（预扣走 Redis Lua / DB 条件更新、Refund 幂等、表达式沙箱无逃逸）是健康的；认证核心（JWT 钉死 HS256、Refresh 轮换重放检测、Argon2id、WebAuthn UV=required、OAuth state 一次性、Casbin 精确匹配）质量较高；近 80 条提交无 P0 级回退。**真正需要发版前处理的是 4 个 critical**：一个全新 MySQL/PG 二次启动必 fatal 的 schema 矛盾、一个 MySQL 下软删分组名永久占用的部分索引语法、一个 channels 热路径全表扫描、一个渠道自动恢复后内存路由表丢失。

---

## 1. 项目架构速览

```
客户端 ──► Gin router/ ──► middleware/(auth/rate-limit/cors/recover)
                              │
                              ▼
                  controller/  (业务 API)
                              │
              ┌───────────────┼─────────────────┐
              ▼               ▼                 ▼
         service/        model/ (GORM)      relay/ (上游转发)
       (计费/限流/权限)   (表+缓存)           40+ provider adaptor
              │               │                 │
              └──────► pkg/billingexpr ◄───────┘
                       (表达式引擎)
                              │
                              ▼
                  SQLite / MySQL / PG (主库)
                  + ClickHouse / 独立日志库
```

- Go 1.26（root + `tokenkit/`），Go 1.25.1（独立模块 `relaykit/`）；Gin + GORM v2。
- 三主库必须同时支持：SQLite、MySQL ≥ 5.7.8、PostgreSQL ≥ 9.6；日志库另支持 ClickHouse。
- 计费表达式引擎在 `pkg/billingexpr/`，运行时从 `options` 表读 `billing_setting.billing_mode` / `billing_expr`（JSON map）。
- `metadata/api/newapi/*.json` 是**人维护的事实源**，Go 运行时不读；由 `scripts/model_sync/*.py` 链生成 → `scripts/ops/apply_billing.py` 写入 options → 重启生效。

---

## 2. 数据库 Schema 审计

### 2.1 表清单（39 张业务表）

核心表分组：

| 域 | 表 |
|---|---|
| 账号 | `users`, `user_sessions`, `user_access_tokens`, `user_oauth_bindings`, `email_bindings`, `external_identity_claims`, `auth_flows`, `login_verifications` |
| 凭证 | `tokens`, `two_fas`, `twofa_enrollments`, `passkeys`, `passkey_options` |
| 渠道 | `channels`, `channel_constraints`, `channel_priorities`, `abilities`, `vendors`, `vendor_metas` |
| 模型 | `models`, `prefill_groups`, `prefill_group_items` |
| 计费 | `options`, `quota_reserves`, `redemptions`, `top_ups`, `user_quota_adjustments`, `subscription_plans`, `subscriptions` |
| 日志/审计 | `logs`, `usedata`, `usedata_flows`, `usedata_rankings`, `audit_logs`, `perf_metrics` |
| 任务 | `tasks`, `system_tasks`, `system_task_locks`, `task_plugins`, `midjourneys` |
| 权限 | `casbin_rules`, `authz_roles` |
| 其他 | `custom_oauth_providers`, `checkins`, `request_policies`, `system_instances` |

### 2.2 Critical

#### DB-C1　`users` 钱包列 struct tag 写 `type:int` 与启动校验要求 bigint 自相矛盾，全新 MySQL/PG 二次启动必 fatal

- 位置：`model/user.go:97-104`、`model/main.go:204, 279-311`
- 证据：
  ```go
  // user.go:97
  Quota           int `gorm:"type:int;default:0"`
  UsedQuota       int `gorm:"type:int;default:0"`
  AffQuota        int `gorm:"type:int;default:0"`
  AffHistoryQuota int `gorm:"type:int;default:0"`
  ```
  ```go
  // main.go:284 ensureUserQuotaColumns
  if !db.Migrator().HasTable(&User{}) { return nil }   // 首装表不存在 → 直接放行
  if !is64BitIntegerType(dbType, dataType) {
      return fmt.Errorf("users.%s uses %s; 32-bit is not supported", ...)
  }
  ```
- 触发：① 首装 MySQL/PG，`HasTable=false` → 校验跳过 → AutoMigrate 按 `type:int` 建 32 位列；② 第二次启动，表已存在 → 校验读到 INT → `InitDB` 返回 error → 进程拒绝启动。
- 全仓库无 `ALTER TABLE users MODIFY quota BIGINT` 迁移（已 grep）。
- 影响：全新 MySQL/PG 部署第二次重启即 fatal；即便不挂启动，INT 上限 ~21.4 亿 quota 单位，高净值用户批量赠送时静默截断。
- 备注：SQLite 因 `main.go:289` 显式跳过校验不受影响。

#### DB-C2　`prefill_groups.name` 的部分唯一索引 `where:deleted_at IS NULL` 是 PostgreSQL 专有语法，MySQL 下软删后名称永久占用

- 位置：`model/prefill_group.go:80`；迁移 `model/prefill_group_migration.go`
- 证据：
  ```go
  Name string `gorm:"type:varchar(64);not null;uniqueIndex:uk_prefill_name_delete_at,priority:1,where:deleted_at IS NULL"`
  ```
- `migratePrefillGroupUniqueness` 开头 `if db.Dialector.Name() != "postgres" { return nil }`——MySQL/SQLite 上完全没有补偿。
- MySQL 不支持部分索引，GORM 忽略 WHERE 子句，退化为 `UNIQUE(name)` 或 `UNIQUE(name, deleted_at)`；软删记录的 name 仍占唯一约束。
- 影响：MySQL 部署下软删一个分组后再建同名分组直接撞唯一约束。功能 bug，数据不丢。

#### DB-C3　`channels.status/type` 无索引，`group/models` 是 CSV 字符串无法走索引——路由热路径全表扫描

- 位置：`model/channel.go:25, 29, 40`
- 证据：
  ```go
  Type   int    `gorm:"default:0"`      // 无 index
  Status int    `gorm:"default:1"`      // 无 index
  Group  string `gorm:"type:varchar(64);default:'default'"`  // CSV，无 index
  Models string `gorm:"type:text"`      // CSV，无 index
  ```
- 每次路由都要 `WHERE status=1 AND type IN (...) AND group LIKE '%,groupname,%'`。
- 短期可加 `(status, type)` 复合索引；长期需拆 `channel_groups(channel_id, group)` 关联表（`abilities` 表已经做了 normalize，但主过滤仍落在 channels）。

### 2.3 Major

| 编号 | 位置 | 问题 |
|---|---|---|
| DB-M1 | `model/subscription.go:160` | `Enabled bool gorm:"default:true"` 触发 AutoMigrate 每次启动反复 ALTER（AGENTS.md 明确警告）；`custom_oauth_provider.go:45` 同病 |
| DB-M2 | `model/token.go:23,28` | `RemainQuota/UsedQuota` 是 32 位 int，无 bigint 保护、无启动校验（与 C1 同类但无校验拦截） |
| DB-M3 | `channel.go:54`、`task.go:67/70/71`、`audit_log.go:45`、`prefill_group.go:82` | JSON 列 `type:json` 无 Text 回退；PG 下落到 `json` 而非 `jsonb`（无 GIN 索引、每次重序列化）；仓库里已有正确范式 `task_plugin.go:69 LongText` 未复用 |
| DB-M4 | `model/user.go:88, 388-395` | `email` 列无 UNIQUE、无 `LOWER(email)` 唯一索引；MySQL 靠原生 `FOR UPDATE` 串行化查重（已方言分支），PG/SQLite 并发注册可重复 |
| DB-M5 | `model_meta.go:37,54`、`vendor_meta.go:19,25` | `(name, deleted_at)` 唯一索引在 MySQL/PG 下因 NULL 语义形同虚设（活跃行 deleted_at IS NULL，两行 (name, NULL) 不冲突）；靠应用层 `IsVendorNameDuplicated` 兜底，存在 TOCTOU |
| DB-M6 | `model/casbin_rule.go:5-11` | 同一组 7 列同时建普通索引和唯一索引，纯冗余，双倍写放大 |
| DB-M7 | `midjourney.go:22`、`redemption.go:14-25` | `midjourneys.channel_id`、`redemptions.status/user_id` 无索引 |

### 2.4 已核实合规（不展开）

- 钱包扣减全部用 `gorm.Expr("quota + ?", delta)` 条件 UPDATE，未依赖 `FOR UPDATE`；行锁仅在 `AdjustUserQuota` / `Redeem` 里通过 `lockForUpdate(tx)` helper 使用，未发现 `tx.Set("gorm:query_option","FOR UPDATE")` 误用。
- 保留字 `group/key` 列走 `commonGroupCol/commonKeyCol` 方言引号，合规。
- ClickHouse 日志表 DDL 直建，按 `toYYYYMM(created_at)` 分区，TTL 可配。
- `option_primary_key_migration.go` 幂等迁移已核实。

---

## 3. 计费 / 额度 / 表达式审计

### 3.1 资金安全核心结论（好消息）

- 预扣走 Redis Lua + DB 条件 UPDATE（`model/quota_reserve.go TryReserveTokenQuota`），原子。
- Refund 三开关幂等（settled / refunded / fundingSettled）。
- 表达式沙箱无函数逃逸，默认配置下无普通用户可直接白嫖路径。
- 本次审计 **critical = 0**。

### 3.2 Major

#### B-M1　上游上报的负缓存/图片/音频 token 未做非负钳制 → 负结算净贷记用户（资损）

- 位置：`service/tiered_settle.go:26-137 BuildTieredTokenParams`
- 证据：行 117-122 只钳制 `p/c`，`CR/CC/CC1h/Img/AI/AO/ImgO` 全部未钳制。
  ```go
  if p < 0 { p = 0 }
  if c < 0 { c = 0 }
  return billingexpr.TokenParams{P:p, C:c, Len:inputLen, CR:cr, CC:cc5m, CC1h:cc1h, Img:img, ...}
  ```
- 触发：上游（reseller / 故障上游）返回 `cached_tokens:-100000`。表达式 `p*2.5 + c*10 + cr*0.5` 中 `cr*0.5 = -50` → 总成本为负 → `ComputeTieredQuotaWithRequest` 不报错 → `SettleBilling` 退款额 = preConsumed + |负quota| → 用户钱包净增加。
- 影响：一次小请求配上游负缓存上报即可净贷记 ~$50 量级；失陷上游渠道可被反复套现。
- 对比：行 40-69 对 imgCR 分解专门做了合法性校验，说明作者意识到该类风险，但 CR/CC 主体漏了。

#### B-M2　Claude 格式下 `cc/cc1h`（缓存写）未被表达式引用时完全不并入 p，该部分 token 免费

- 位置：`service/tiered_settle.go:82-87`
- 证据：
  ```go
  if isClaudeUsageSemantic {
      if !usedVars["cr"] { p += cr }   // 只把缓存"读"加回 p
      // cc5m / cc1h 在此分支完全不处理：不引用 → 不并入 p → 不计费
  }
  ```
- Anthropic 的 `input_tokens` 本身不含 `cache_creation_input_tokens`。
- 触发：管理员为 Claude 模型写自定义表达式时漏了 `cc/cc1h`（照抄 GPT 风格 `p*3+c*15+cr*0.3`）→ 所有 cache_creation token 既不在表达式变量里，也没加回 p，直接消失。
- 与 `pkg/billingexpr/expr.md` 契约不一致（GPT 格式遵守"未引用变量按基础价留在 p/c"，Claude 格式不遵守）。
- 影响：缓存写用量 100% 漏收；Anthropic cache write ≈ 1.25×input 价，重度缓存场景资损可达输入侧同等量级。

#### B-M3　表达式 smoke test 分支覆盖缺口 + 结算侧无负数兜底，时间型/探针型三元的坏分支可带病上线

- 位置：`setting/billing_setting/tiered_billing.go:207-227, 357-367`、`pkg/billingexpr/settle.go:32-38`
- 证据：smoke 只跑当前时刻一次 + 2 个固定 request 探针；`hour()/weekday()` 只命中时间三元的一侧；`param()/header()` 条件只匹配写死的请求体。
- 触发：管理员保存 `PEAK ? tier("peak",p*3+c*15) : tier("off",p*0.5+c*1.2)` 时若 off 分支系数写错，保存时刻若命中 peak 分支，off 分支的负/NaN 结果不被发现；运行到对应时段即按 B-M1 路径贷记。
- 影响：单条坏分支 = 该时段/该探针条件下全部请求净贷记。

#### B-M4　Realtime(WSS) 预扣是"读-判-扣"非原子，并发长连接可集体透支

- 位置：`service/quota.go:88-155 PreWssConsumeQuota`
- 证据：
  ```go
  userQuota, _ := model.GetUserQuota(userId, false)   // 快照读
  if userQuota < quota { return error }               // 基于快照
  err = PostConsumeQuota(relayInfo, quota, 0, false)  // 无条件 Decrease
  ```
- 没走 `TryReserveUserQuota` 原子条件扣减。
- 触发：用户余额 Q，同时开 N 条 realtime 长连接，每条 segment 消耗 q < Q，所有连接读到同一 Q 后全部通过扣减，余额被打到负。

#### B-M5　图片上游空 usage 被强制填 1 token，token 型图片表达式少计全部图片 token 费

- 位置：`relay/image_handler.go:171-176`
  ```go
  if usage.TotalTokens == 0  { usage.TotalTokens = 1 }
  if usage.PromptTokens == 0 { usage.PromptTokens = 1 }
  ```
- 触发：token 型图片表达式（非 fixed）模型，上游 DoResponse 返回空 usage → P=1 → 按 1 token 结算。fixed 表达式不受影响。

### 3.3 Minor（5 条，摘要）

- 双路舍入差 1 quota（`text_quota.go` decimal vs `settle.go:38` float64，~$1/500000 可忽略）。
- `prompt_cache_retention` 全局硬剥离无 channel 级 opt-out（`relay/common/relay_info.go:1186`）。
- 任务结算 `actual<0` 静默 return 无审计日志（`service/task_billing.go:~311`）。
- 信任旁路 `trust_quota_usd` 对非图片请求 0 预扣，在途并发可透支（设计取舍）。
- estimate 阶段 C 恒为 0 靠结算补差（方向安全，偶发多扣）。

---

## 4. 渠道 / 中继审计

### 4.1 Critical

#### R-C1　自动恢复的渠道在内存路由表"消失"，直到下一次全量同步才被选中

- 位置：`model/channel_cache.go:251-274 CacheUpdateChannelStatus`、`model/channel.go:753-832 UpdateChannelStatus`、`service/channel.go:50-58 EnableChannel`
- 证据：
  ```go
  func CacheUpdateChannelStatus(id int, status int) {
      ...
      if status != common.ChannelStatusEnabled {
          // 只有"禁用"分支：从 group2model2channels 里删掉
          ...
      }
      // status == Enabled 时：什么都不做 —— 不会把 channel id 加回
  }
  ```
- `group2model2channels` 只在 `InitChannelCache()`（全量重建）时写入；`EnableChannel` 路径不调用它。
- 触发：① 上游 5xx → `DisableChannel` → id 从路由表删；② 后台健康检查 → `EnableChannel` → `channelsIDM[id].Status=Enabled` 但路由表里没这个 id；③ 下次 `SyncChannelCache` tick 之前，`GetRandomSatisfiedChannel` 永远选不到。
- 影响：若该 group/model 下只有这一个渠道，恢复期间所有请求返回 "no available channel"；多渠道时该渠道在窗口期内完全不接流量。

### 4.2 Major

| 编号 | 位置 | 问题 |
|---|---|---|
| R-M1 | `model/channel_cache.go:117-217`、`service/channel_select.go:390-392` | 重试不会排除已试渠道；`filterCandidateIDs` 不读 `use_channel`，auto-ban 不触发时可能反复打同一个坏渠道 |
| R-M2 | `model/channel_cache.go:165-182` | 同 priority 层内重试直接跳到下一个 priority 层，同层其他健康渠道不被尝试；高 priority 池的冗余渠道形同虚设 |
| R-M3 | `relay/channel/api_request.go:321` | 上游 HTTP 用 `http.NewRequest` 而非 `NewRequestWithContext`，客户端断连后上游继续生成并计费（对比 task 路径 line 630 正确用了 WithContext） |
| R-M4 | `service/relay_error.go:71-73`、`controller/relay.go:211-217` | 自动禁用在 goroutine 异步执行，主循环下一轮 retry 可能在禁用 goroutine 跑完前再次选中刚坏的渠道 |
| R-M5 | `model/ability.go:194-199` | `filterAbilitiesByConstraints` 在 DB 查询失败时"失败开放"（非 task-plugin identity filter 路径直接返回未过滤 abilities），DB 闪断期间渠道约束被绕过 |

### 4.3 Minor（4 条，摘要）

- `EditChannelByTag` 批量改 priority/weight 后内存路由不重排（`model/channel.go:865-919`）。
- Header override 的 `{client_header:<name>}` 占位符无黑名单，管理员误配 `{client_header:authorization}` 会把用户原始 Key 透传给上游（`relay/channel/api_request.go:155-186`）。
- 流式中途上游断流被记为成功（HTTP 200），不重试也不告警（`relay/channel/openai/relay-openai.go:104-198`）。
- 多 key 轮询索引在内存缓存模式下不落库，重启后归零（`model/channel.go:276-285`）。

### 4.4 已核实合规

- 渠道 Key trim（b98d745）已正确生效（单 key 整体 trim + 多 key 逐条 trim 跳空）。
- 二次转发渠道（sub2api / newapi / submodel）均用渠道自身 ApiKey，不透传用户 Key。
- 流式已吐一半不重试（符合正确行为）。
- 元数据同步用进程互斥锁 + DB 行锁 + 事务 + 乐观锁 `RecordVersion`，防覆盖人工 override。

---

## 5. 安全 / 认证审计

审计基线：OWASP ASVS v4.0。**本次未发现 Critical。** 认证核心实现质量较高。

### 5.1 Major

#### S-M1　邮箱验证码 6 位数字、内存存储、未一次性消费

- 位置：`common/verification.go:26-56`、`controller/user.go:343`（`GenerateVerificationCode(6)`）、`controller/user.go:283-289`
- 证据：`Register` 校验通过后未 `DeleteKey`，同一验证码在 10 分钟内可重复使用；`verificationMapMaxSize=10` 内存 map，多节点不共享。
- 影响：邮箱验证码可复用，降低爆破成本；多节点部署下 LB 不粘滞时验证码功能完全不可用。
- OWASP：V2.2.3 / V2.2.4 / V2.2.7。

#### S-M2　注册/绑邮箱接口存在邮箱枚举

- 位置：`controller/misc.go:176-181 SendEmailVerification`
- 证据：直接返回 "Email address is already in use"。对比 `SendPasswordResetEmail`（line 234-253）是正确的静默写法。
- 影响：攻击者遍历邮箱调 `/api/verification?email=<x>` 即可枚举出已注册账号，辅助撞库/钓鱼。
- OWASP：V2.2.10 / V9.1.1。

#### S-M3　密码长度下限 6 位（提交 abd3fe1 从 8 放宽），无复杂度要求、无账号维度锁定

- 位置：`common/account_password.go:14`、`model/user.go:24`
- 证据：
  ```go
  const MinAccountPasswordLength = 6
  Password string `validate:"required,min=6,max=128"`
  ```
- 6 位纯数字仅 10^6 空间，GPU 数小时跑完。当前只有 IP 维度限流（20/20min），无账号维度失败锁定。
- 仓库里残留未同步文案键（`en.json:2171 "Enter password (8-20 characters)"` 等）。
- OWASP：V2.1.1 / V2.2.7。

#### S-M4　CORS `AllowAllOrigins=true` + `AllowCredentials=true`

- 位置：`middleware/cors.go:14-25`
- 证据：
  ```go
  AllowAllOrigins: true,
  AllowCredentials: true,
  AllowHeaders: []string{"*"},
  ```
- 当前挂在 `/api/usage/token`、`/api/log/token`（Bearer 鉴权，影响有限），但属配置错误；未来任何 cookie 鉴权路由误挂此中间件即灾难。
- OWASP：V14.4.3。

### 5.2 Minor（5 条，摘要）

- Refresh Cookie 默认不带 `Secure`（`common/constants.go:40`）。
- `SessionSecret` 未配置时静默用随机 UUID，重启/多节点即登出，无 WARN 日志。
- 未设置 CSP（安全头已设 nosniff/HSTS/X-Frame-Options/Permissions-Policy/Referrer-Policy）。
- `RelayPanicRecover` 把内部错误字符串回给客户端（`middleware/recover.go:22-37`）。
- 验证码内存 map 容量仅 10，第 11 个用户发邮件会挤掉未过期旧验证码。

### 5.3 已核实合规（避免误报）

| 检查项 | 结论 |
|---|---|
| JWT 算法混淆（alg=none） | 安全，`ValidMethods: ["HS256"]` 钉死 |
| Refresh Token 重放 | 安全，检测旧 secret 即撤销整条 session |
| 登出真正失效 | 安全，双写 + uv/sv 版本号短路 |
| 密码哈希 | 安全，Argon2id m=19456/t=2/p=1（或 bcrypt cost=10） |
| WebAuthn Origin/RPID | 安全，同源守卫 + UV=required |
| OAuth state 重放/开放重定向 | 安全，`ConsumedAt` 原子 UPDATE + 固定回调路径 |
| Casbin 通配符 | 安全，`==` 精确匹配无 `.*` |
| SQL 注入（sort 字段） | 安全，`userSortColumns` 白名单回退 id |
| IDOR（token / PAT） | 安全，双 where + scopes fail-closed |
| 日志打印 token/password | 安全，审计日志只存 SHA-256 指纹 |

---

## 6. Git 提交历史审计（最近 80 条）

审查口径：只报"新引入、可触发、证据闭合"的缺陷；纯样式/文案/i18n/邮件模板/metadata 数据同步按 mechanical 处理。

### 6.1 判定汇总

- 审查 80 条提交，**73 条 ✅ 正确，4 条 ⚠️ 有隐患，0 条 ❌ 有 bug**。
- Critical：0；Major：3；Minor：4。

### 6.2 有问题/有隐患条目

| sha | 判定 | 问题 |
|---|---|---|
| f450e90 | ⚠️ Major | `cron-promote-upcoming.sh` 半失败漂移：promote 先写盘 pricing.json，若 apply_billing 失败则 `set -e` 退出、不 restart；下次 cron 因 PROMOTED=0 不再触发，git 新价与线上旧价静默漂移 |
| abd3fe1 | ⚠️ Major | 密码下限 8→6（与 S-M3 同条），无配套登录限流/MFA 强制；残留未同步 8-20 文案键 |
| 3f9d86d | ⚠️ Major | ops 脚本跨表盲点：`drop_model.py` 用 `datetime('now')` 写 deleted_at 与 GORM 时间格式未核实；`rename_model.py` 不同步 abilities 表，`--force` 后产生孤儿路由 |
| 54c5074 | ⚠️ Minor | `isFrontendDocument` 裸路径边界（`/api`、`/pg` 无尾斜杠会被误判为 HTML 返回 no-cache）；当前不可触发 |
| 72bb7a6 | 记录 | brotli 失败后缓存删除的小竞态，分析后不构成 bug |
| fe798f3 | ⚠️ Minor | perf 探针每 30 分钟对每个上架模型发真请求（max_tokens=16），200 模型 = 每天 ~9600 次上游调用，root 配额被 silent 跳过但上游账单照付 |
| 63c2491 | ⚠️ Minor | `prompt_cache_retention` 全局硬剥离无 channel 级 opt-out（与 B-minor m2 同条） |

### 6.3 重点提交核验结论（正确，记录在案）

- **b98d745 渠道 Key trim**：正确修复线上真故障（Key 末尾换行导致 net/http 拒绝 Authorization header）。
- **cdbf38e 非流式完成计入指标**：正确修复"非流式收完响应后客户端断连被误判为用户中断"的回归。
- **e746f0a SPA 404**：正确。/docs/ 缺失读 404.html；/static/ 缺失带 no-store 返回 404；其他 SPA 路由仍回 index。
- **9f8967a i18n 剥 translation 外壳**：`inner ?? module` 兜底，无外壳时原样返回。
- **72bb7a6 brotli 预压缩**：.br 优先，失败回退 gzip 再回退原文件，Vary 设置正确。
- **2e27b73 模型广场按表达式报价**：修了 75x 报价偏差，优先用 getDynamicPricingSummary。
- **c40317a pricing-audit CLI**：只读，无副作用。
- **f55fbce / fd962c0 / f2969d7**：表达式由价格字段确定性生成，validate.py CI 强制可复现，`:free` 后缀强制免费。

---

## 7. Metadata / 运维脚本审计

### 7.1 架构事实（重要）

**Go 运行时不直接读 `metadata/api/newapi/*.json`。**

```
人维护（git）  metadata/api/newapi/{models,pricing,pricing.official,overrides,vendors}.json
        │
        ▼  scripts/model_sync/merge.py → expr.py 生成 billing_expr → validate.py CI
        │
        ▼  scripts/model_sync/export_billing.py 生成 options payload
        │
        ▼  scripts/ops/apply_billing.py（--dry-run 默认，先备份 SQLite）
        │
        ▼  线上 SQLite: options 表 billing_setting.billing_mode / billing_expr
        │
        ▼  systemctl restart new-api
        │
        ▼  Go 运行时 model/model_pricing_config.go: readModelPricingMaps → billingexpr.RunExpr
```

任何手工改 pricing.json 里 `billing_expr` 的尝试都会在下次 sync 被 `attach_expression(row)` 覆盖——这是设计意图（表达式必须由价格字段确定性生成），由 `validate.py` 强制。

### 7.2 Major

- **O-F1** `cron-promote-upcoming.sh:13-24` 半失败漂移（见 §6.2）。
- **O-F2** `scripts/ops/drop_model.py:60` `UPDATE models SET deleted_at=datetime('now')`：GORM `gorm.DeletedAt` 在 SQLite 由驱动序列化为 time.Time 字符串，格式若与 `datetime('now')` 输出的 `YYYY-MM-DD HH:MM:SS` 不一致，GORM 软删过滤 `WHERE deleted_at IS NULL` 会漏掉这些行——脚本以为软删了，运行时仍当 live 路由。**需在测试 DB 上实测 GORM 写入格式后再上线。**
- **O-F3** `scripts/ops/rename_model.py:86-105` 只改 `models.model_name` 和 options billing 键，不同步 `abilities` 表；渠道绑定检查只查 `channels.models` 逗号字符串，不查 abilities。--force 模式下孤儿路由更明显。

### 7.3 Minor

- `apply_billing.py` 无 `busy_timeout`（`sqlite3.connect` 默认 0，运行中写 SQLite 易 `database is locked`）。
- `cmd/pricing-expr-migrate/main.go` 写前无 DB 备份（不像 apply_billing.py）。
- ops 脚本硬编码 `DEFAULT_DB = /www/wwwroot/new-api/data/one-api.db`，本地测试易误操作。

---

## 8. 问题汇总分级表

### 8.1 Critical（4 条，发版前必须处理）

| # | 模块 | 位置 | 一句话 |
|---|---|---|---|
| C1 | DB | `model/user.go:97-104` + `model/main.go:284-311` | users 钱包列 `type:int` 与启动 bigint 校验矛盾，新 MySQL/PG 二次启动 fatal |
| C2 | DB | `model/prefill_group.go:80` | 部分唯一索引 `where:deleted_at IS NULL` 是 PG 专有，MySQL 下软删分组名永久占用 |
| C3 | DB | `model/channel.go:25,29,40` | channels.status/type 无索引，group/models CSV 无法走索引，路由热路径全表扫描 |
| C4 | 渠道 | `model/channel_cache.go:251-274` | 渠道自动恢复后内存路由表不重新加回，下次全量同步前不接流量 |

### 8.2 Major（25 条，下一迭代处理）

见 §2.3（DB 7 条）、§3.2（计费 5 条）、§4.2（渠道 5 条）、§5.1（安全 4 条）、§6.2 + §7.2（git/ops 4 条，其中密码策略与 S-M3 合并）。

### 8.3 Minor（30 条）

分散在各模块摘要段，详见对应章节。

---

## 9. 未核实项与限制

1. **DB-C1/C2 的 GORM 实际 DDL 行为**未在真实 MySQL 5.7/8.0 / PG 实例上跑 AutoMigrate 验证；结论基于 GORM v2 默认行为推断，建议测试环境首装一次确认。
2. **O-F2 的 deleted_at 时间格式**未实测；必须在测试 SQLite 上对比 `db.Delete(&Model{})` 与 `datetime('now')` 输出后再决定改法。
3. `scripts/model_sync/normalize.py`、`sources.py`、`sync_models.py` 未逐行审计（按命名与调用点推断为字段规范化与上游抓取，本批提交未改其逻辑）。
4. 前端 `web/` 仅做了路由/中间件挂载与文案键核对，未做完整前端代码审计（用户原始范围以 Go 后端为主）。
5. 审计期间未运行 `go build` / 单测；所有结论基于源码静态阅读。

---

## 附录：审计工件索引

| 文件 | 路径 |
|---|---|
| 数据库表清单 | `<agent-ws>/s_000p7ztnhEw/artifacts/DB-MODEL-MAP.md` |
| 数据库详细 findings | `<agent-ws>/s_000p7ztnhEw/artifacts/DB-FINDINGS.md` |
| 计费数据流 | `<agent-ws>/s_000p7ztPILO/artifacts/BILLING-DATAFLOW.md` |
| 计费详细 findings | `<agent-ws>/s_000p7ztPILO/artifacts/BILLING-FINDINGS.md` |
| 渠道中继数据流 | `J:\hubapi\new-api\artifacts\RELAY-DATAFLOW.md` |
| 渠道中继详细 findings | `J:\hubapi\new-api\artifacts\RELAY-FINDINGS.md` |
| 认证结构图 | `J:\hubapi\new-api\artifacts\AUTH-MAP.md` |
| 安全详细 findings | `J:\hubapi\new-api\artifacts\SECURITY-FINDINGS.md` |
| Git 80 条逐条审查表 | `J:\hubapi\new-api\artifacts\COMMIT-REVIEW.md` |
| Metadata/脚本 findings | `J:\hubapi\new-api\artifacts\METADATA-FINDINGS.md` |
