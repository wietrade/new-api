# new-api / NowHub 认证授权整体结构图

> 审计视角：OWASP ASVS v4.0 / Authentication & Session Management
> 审计对象：`J:\hubapi\new-api`（Go 1.26 + Gin + GORM v2 + Casbin v2）

---

## 1. 凭证体系总览

系统同时存在 **四类** 凭证，中间件在 `middleware/auth.go:205 classifyDashboardCredential` 中按优先级分流：

| 凭证类型 | 格式 | 签发位置 | 校验位置 | 用途 |
|---|---|---|---|---|
| 浏览器 Session（Access JWT + Refresh Cookie） | `Bearer <JWT>` + HttpOnly Cookie `new_api_refresh` | `service/auth_session.go:63 createLoginSession` | `service/auth_token.go:85 ParseAccessToken` + `service/auth_session.go:130 ValidateLoginSession` | Web 控制台 |
| 个人访问令牌 PAT | `Bearer nap_<random>` | `controller/access_token.go CreateAccessToken` | `middleware/auth.go:249 lookupAccessToken`（SHA-256 指纹查 `user_access_tokens`） | 脚本化控制台访问 |
| 遗留 Opaque Token | `Bearer <32hex>` | 历史版本 | `model.ValidateAccessToken`（过渡期，已设退役日） | 兼容旧客户端 |
| 中继 API Key | `Bearer sk-<key>-<channel?>` | `controller/token.go AddToken` | `middleware/auth.go:528 TokenAuth` → `model.ValidateUserToken` | 上游 AI 推理调用 |

### 1.1 JWT（Access Token）

- **算法**：HS256（`service/auth_token.go:81`），解析时强制 `jwt.WithValidMethods([]string{"HS256"})`（`auth_token.go:194`），拒绝 `alg=none` 与 RS256 混淆。
- **密钥**：`authSigningKey("access") = HMAC-SHA256(common.SessionSecret, "new-api/auth/access/v1")`（`auth_token.go:54-58`）。Refresh token、Security Proof 各有独立 purpose 域分。
- **Claims**：`sub=userID, sid=sessionUUID, uv=userAuthVersion, sv=sessionVersion, exp=+15min, iat, nbf=-5s, jti=uuid, audience=new-api-dashboard, issuer=new-api`。
- **关键设计**：JWT 本身不携带 role/status/group；每次请求在 `ValidateLoginSession`（`auth_session.go:130`）里回查 DB/缓存，校验 session 未撤销、未过期、user 未封禁、`uv == user.AuthVersion`。改密码 / 改邮箱 / 删 2FA 都会 `BumpUserAuthVersion` 使全部旧 JWT 立即失效。

### 1.2 Refresh Cookie

- **名字**：`new_api_refresh`（`auth_session.go:16`）。
- **值**：`<sid>.<secret64>`，DB 只存 `HMAC(authSigningKey("refresh"), secret)`（`auth_session.go:447 hashRefreshSecret`）。
- **属性**（`auth_session.go:333-342`）：
  - `Path=/api/user/auth`（缩小发送范围）
  - `HttpOnly=true`
  - `SameSite=Strict`
  - `Secure=common.SessionCookieSecure`（默认 **false**，见 F-MINOR-2）
  - `MaxAge=30d`（与 `LoginSessionTTL` 对齐）
- **轮换**：每次 `/api/user/auth/refresh` 调 `deriveNextRefreshSecret = HMAC(authSigningKey("refresh-rotate"), sid+"."+current)`（`auth_session.go:451`），DB 事务 CAS 旧 hash→新 hash；检测到重放（旧 secret 再次被用）立即撤销整条 session（`auth_session.go:266-284`）。
- **同源守卫**：当 `SessionCookieSecure=true` 时，`middleware/auth_origin.go:18 SessionCookieOriginGuard` 强制校验 Origin/Referer，防止 CSRF。

### 1.3 PAT（nap_ 前缀）

- DB 存 `TokenHash = SHA-256(raw)`、`TokenHint`（前 8 位）、Scopes（JSON）、ExpiresAt。
- 中间件 `enforceAccessTokenRoute`（`middleware/auth.go:289`）按 `METHOD + FullPath` 查 `AccessTokenRouteRule` 白名单；未声明路由直接 403（fail-closed）。
- PAT 的 session 视图是 `pat:<id>` 虚拟 session，`UserAuthVersion` 跟随用户全局版本。

### 1.4 中继 API Key（sk-）

- `TokenAuth`（`middleware/auth.go:528`）解析 `Authorization: Bearer sk-<key>`（也兼容 `x-api-key`、`x-goog-api-key`、query `?key=`、WebSocket subprotocol）。
- 查 `model.GetTokenByKey` → Redis 缓存 → DB；校验 status、过期、余额、IP CIDR 白名单、user 状态、group 可用性。
- 管理员可在 key 后接 `-<channelId>` pin 渠道；普通用户拒绝（`auth.go:703-721`）。

---

## 2. 密码存储

- **哈希**：`common.HashAccountPassword`（`common/account_password.go:44`）默认 Argon2id（`m=19456 KiB, t=2, p=1, keyLen=32, salt=16B`）；可通过 env `ACCOUNT_PASSWORD_HASH_ALGORITHM=bcrypt` 切到 bcrypt `DefaultCost=10`。
- **校验**：`common.ValidatePasswordAndHash`（`common/crypto.go:30`）按 hash 前缀分流，argon2 用 `subtle.ConstantTimeCompare`。
- **传输加密**：登录前浏览器用 RSA-2048-OAEP（v2 信封：AES-256-GCM wrapping）加密密码，服务端 `DecryptPassword`（`common/password_crypto.go:102`）。私钥持久化在 DB `login_encryption_keys` 表，集群节点 OnConflict DoNothing 收敛。
- **长度策略**：`MinAccountPasswordLength = 6`（提交 abd3fe1 放宽后）；上限 128。

---

## 3. MFA / Passkey / WebAuthn

- **TOTP**：`service/twofa.go` + `model/twofa.go`；登录时若 `UserVerificationState.HasTwoFA`，`service.StartLoginVerification`（`service/login_verification.go:45`）发一次性 `flow_token`（DB `auth_flows` 表，32 字节随机 token 的 HMAC 入库），5 分钟 TTL，`ConsumeAuthFlow` 原子 UPDATE `consumed_at` 防重放。
- **WebAuthn/Passkey**：`controller/passkey.go`
  - 注册：`PasskeyRegisterBegin` → `wa.BeginRegistration` → sessionData 存 `auth_flows`（purpose=`passkey_register`），`PopSessionDataFlow` 一次性取出。
  - 登录：`PasskeyLoginBegin` → discoverable login → `PasskeyLoginFinish` 通过 credentialID 反查用户；校验 RPID、userHandle、UV=required。
  - 所有敏感操作（注册/删除/step-up）前置 `RequireSecurityProof`（`service/security_verification.go`），需要 TOTP/Passkey/Email 完成 step-up 才放行。
- **备用码**：`common.GenerateBackupCodes`，哈希入库。

---

## 4. OAuth / OIDC

- **状态码**：`controller/oauth.go:46 GenerateOAuthCode` 创建 `auth_flows` 行（purpose=`oauth`，intent=login/bind/verify），返回 `flow_token`；回调 `HandleOAuth`（`oauth.go:146`）用 `ConsumeAuthFlow` 原子消费，绑定 userID+sessionID 防跨会话重放。
- **绑定流程**：`intent=bind` 要求当前已登录 session 与 flow 里 `UserId/SessionId` 完全一致，并通过 `ValidateFlowAuthorization` 校验 step-up proof。
- **账户接管防护**：legacy GitHub 绑定迁移时，若目标账号已开 2FA/Passkey 则强制走登录验证；否则要求 provider 返回的 verified email 与账号 email 匹配（`oauth.go:443-456`）。
- **自定义 OAuth provider**：`controller/custom_oauth.go` + `model/custom_oauth_provider.go`，Root 管理。

---

## 5. Casbin 授权

- **模型**（`service/authz/enforcer.go:19-31`）：`r=sub,obj,act`，`e=some(where p.eft==allow)`，**无通配符匹配**——`m = r.sub == p.sub && r.obj == p.obj && r.act == p.act`。
- **角色**：`root`（Superuser，短路 allow）、`admin`（按 registry 基线）。
- **覆盖**：`user:<id>` 级别的 allow/deny 覆盖在 role 基线之上；deny 优先（`resolver.go:64-69`）。
- **路由挂载**：`middleware/RequirePermission(permission)`（`auth.go:410`），用于 `/api/task_plugin_options`、`/api/audit` 等细粒度接口；其余 admin 路由统一靠 `AdminAuth()`（role≥10）/`RootAuth()`（role≥100）粗粒度拦截。

---

## 6. 路由中间件挂载清单（关键分组）

| 路由组 | 中间件链 | 说明 |
|---|---|---|
| `POST /api/user/login` | `CriticalRateLimit` + `DisableCache` + `anonymousRequestBodyLimit` + `TurnstileCheck` | 登录 |
| `POST /api/user/register` | `CriticalRateLimit` + `anonymousRequestBodyLimit` + `TurnstileCheck` | 注册 |
| `GET /api/verification` | `EmailVerificationRateLimit`（2 次/30s）+ `TurnstileCheck` | 发邮件验证码 |
| `GET /api/reset_password` / `POST /api/user/reset` | `CriticalRateLimit` | 忘记密码 |
| `POST /api/oauth/state` / `GET /api/oauth/:provider` | `CriticalRateLimit` + `DisableCache` + `TryUserAuth` | OAuth 发起/回调 |
| `POST /api/user/auth/refresh` / `logout` | `SessionCookieOriginGuard` + `CriticalRateLimit` + `DisableCache` | 刷新/登出 |
| `selfRoute /api/user/*`（GET/POST/PUT/DELETE） | `UserAuth()`（role≥1） | 个人设置 |
| `accessTokenRoute /api/user/access_tokens` | `UserAuth()` + `DisableCache` + `UserCriticalRateLimit("access-token")` | PAT 管理 |
| `adminRoute /api/user/*`（CRUD） | `AdminAuth()`（role≥10） | 用户管理 |
| `optionRoute /api/option/*` | `RootAuth()`（role≥100） | 系统设置 |
| `customOAuthRoute /api/custom-oauth-provider/*` | `RootAuth()` | 自定义 OAuth |
| `redemptionRoute /api/redemption/*` | `AdminAuth()` | 兑换码 |
| `logRoute /api/log/*`（非 self） | `AdminAuth()` | 全量日志 |
| `logRoute /api/log/self*` / `usageRoute /api/log/token` | `UserAuth()` / `TokenAuthReadOnly()` | 个人日志 |
| `relayRouter /v1/*` | `TokenAuth()` + `Distribute()` | 上游推理 |
| `perfRoute /api/performance/*`、`systemTaskRoute`、`systemInfoRoute`、`taskPluginRoute` | `RootAuth()` | Root 专属 |

### 6.1 全局中间件（`main.go:197-201`）
- `RequestId` → `SecurityHeaders` → `Version` → `I18n` → 日志
- `ConfigureTrustedProxies`（默认信任 loopback/RFC1918/ULA，可 env `TRUSTED_PROXIES=none` 关闭）

---

## 7. 限流体系

| Limiter | Key 维度 | 默认值 | 用途 |
|---|---|---|---|
| `GlobalWebRateLimit` | IP | 120 / window | 前端页面 |
| `GlobalAPIRateLimit` | IP | 可配 | API 兜底 |
| `CriticalRateLimit` | IP | **20 / 20 min** | 登录/注册/重置/发邮件/改密码等敏感操作 |
| `UserCriticalRateLimit(scope)` | userID | 同 Critical | 登录后敏感操作（access_token 创建、2FA、aff 转账） |
| `EmailVerificationRateLimit` | IP | **2 / 30 s** | 发邮件验证码 |
| `SearchRateLimit` | userID | 可配 | 搜索接口 |
| Redis 固定窗口 Lua | — | — | 集群模式；内存兜底单机 |

---

## 8. 安全响应头（`middleware/security_headers.go`）

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=31536000   （仅 HTTPS 生效）
```
**未设置**：`Content-Security-Policy`、`X-XSS-Protection`。
