# new-api / NowHub 安全审计发现清单

> 审计基线：OWASP ASVS v4.0（V2 Authentication / V3 Session / V4 Access Control / V5 Input Validation / V7 Logging / V14 Configuration）
> 审计日期：2026-10-25
> 审计范围：middleware/、service/authz/、controller 认证相关、model 认证相关、router/、common/limiter/

---

## 分级说明

- **Critical**：可被远程未认证利用、导致账号接管、密钥泄露或 RCE。
- **Major**：越权、爆破无防护、可被已认证用户利用造成数据/权限损失，或部署后即可被利用的设计缺陷。
- **Minor**：加固建议、默认值不收敛、信息泄露有限。

---

## Critical

**本次审计未发现 Critical 级别问题。**

认证核心链路（JWT HS256 算法钉死、Refresh Token 轮换+重放检测、WebAuthn UV=required、OAuth state 一次性消费、Casbin 精确匹配、密码 Argon2id）实现质量较高。

---

## Major

### M-1 邮箱验证码为 6 位数字、内存存储、未一次性消费

**【位置】**
- `J:\hubapi\new-api\common\verification.go:26-56`
- `J:\hubapi\new-api\controller\user.go:343`（`GenerateVerificationCode(6)`）
- `J:\hubapi\new-api\controller\user.go:283-289`（Register 校验后未 `DeleteKey`）

**【证据】**
```go
// common/verification.go:26
func GenerateVerificationCode(length int) string {
    code := uuid.New().String()
    code = strings.Replace(code, "-", "", -1)
    if length == 0 { return code }
    return code[:length]   // 6 位 = 000000~999999，仅 10^6 空间
}

// controller/user.go:343
verificationCode := common.GenerateVerificationCode(6)

// controller/user.go:283（Register）
if !common.VerifyCodeWithKey(user.Email, user.VerificationCode, common.EmailVerificationPurpose) {
    common.ApiError(c, errors.New("verification code is incorrect"))
    return
}
// ↑ 校验通过后没有 common.DeleteKey(...)，同一验证码在 10 分钟内可重复使用
```

**【攻击步骤】**
1. 攻击者用受害者邮箱调用 `GET /api/verification?email=victim@x.com`，收到 6 位验证码。
2. 对 `POST /api/user/register` 用 `victim@x.com` + 不同用户名爆破验证码。
3. 限流为 CriticalRateLimit=20 次/20min/IP，理论需 5×10⁴ 分钟；但：
   - 验证码 **不一次性失效**，猜对后可继续用同验证码注册第二个账号。
   - 内存 map `verificationMapMaxSize=10`（`verification.go:23`）在多节点部署下节点间不共享，前端负载均衡到不同节点时验证码永远校验失败——功能缺陷，但也意味着只要 LB 粘滞会话，爆破窗口仍是 10 分钟。

**【影响】**
- 邮箱验证码可复用，降低爆破成本；
- 多节点部署下验证码功能不可用（运维事故面）。

**【建议改法】**
1. `Register` 校验成功后立即 `common.DeleteKey(user.Email, EmailVerificationPurpose)`；
2. 验证码改用 Redis 原子 `GETDEL`，并加 `INCR` 计数失败次数，5 次失败即作废；
3. `GenerateVerificationCode(6)` 改为 8 位数字或直接用 UUID 前 8 位（32^8 空间）。

**【OWASP ASVS 参考】** V2.2.3 / V2.2.4（验证码有效期与一次性）、V2.2.7（暴力破解防护）。

---

### M-2 注册/绑邮箱接口存在邮箱枚举

**【位置】** `J:\hubapi\new-api\controller\misc.go:176-181`

**【证据】**
```go
// SendEmailVerification
if common.IsEmailTaken(email) {
    common.ApiError(c, errors.New("Email address is already in use"))
    return
}
```

对比 `SendPasswordResetEmail`（`misc.go:234-253`）无论邮箱是否存在都返回成功，是正确的防枚举写法。但 `SendEmailVerification` 直接暴露"已被注册"。

**【攻击步骤】**
1. 攻击者遍历邮箱列表调 `GET /api/verification?email=<x>`。
2. 返回 "Email address is already in use" 的即为已注册账号。
3. 配合 `POST /api/user/login` 可针对性撞库。

**【影响】**
- 用户邮箱字典泄露，辅助定向钓鱼/撞库；
- 与 M-1 叠加：已注册邮箱可被用来"占用"——攻击者用受害者邮箱发验证码，受害者随后注册时会发现邮箱被自己的验证码流程锁住。

**【建议改法】**
- 无论邮箱是否已注册，都返回"验证码已发送"；若已注册，邮件正文写"该邮箱已注册，请直接登录"而不是 API 响应。

**【OWASP ASVS 参考】** V2.2.10 / V9.1.1（账号枚举防护）。

---

### M-3 密码长度下限 6 位（提交 abd3fe1），无复杂度要求

**【位置】**
- `J:\hubapi\new-api\common\account_password.go:14` `MinAccountPasswordLength = 6`
- `J:\hubapi\new-api\model\user.go:24` `Password string `validate:"min=6,max=128"``

**【证据】**
```go
// common/account_password.go:14
const MinAccountPasswordLength = 6

// model/user.go:24
Password string `json:"password" validate:"required,min=6,max=128"`
```

**【攻击步骤】**
1. 攻击者撞库时密码字典可覆盖所有 6 位纯数字/纯字母组合（36^6 ≈ 21 亿，GPU 数小时跑完）。
2. 登录限流 20/20min/IP，但攻击者可切换 IP（代理池）或利用注册接口批量验证。

**【影响】**
- 弱密码易被爆破；与 M-2 邮箱枚举组合可形成定向撞库流水线。

**【建议改法】**
- 至少 `min=10`，并在 `HashAccountPassword` 前加 `common.ValidatePasswordComplexity`（要求至少 2 类字符）；
- 登录失败 5 次/账号/15min 即临时锁定（当前只有 IP 维度限流，无账号维度）。

**【OWASP ASVS 参考】** V2.1.1（密码复杂度策略）、V2.2.7（暴力破解）。

---

### M-4 CORS 配置 AllowAllOrigins=true + AllowCredentials=true

**【位置】** `J:\hubapi\new-api\middleware\cors.go:14-25`

**【证据】**
```go
func CORS() gin.HandlerFunc {
    config := cors.Config{
        AllowAllOrigins: true,           // ← 反射任意 Origin
        AllowCredentials: true,          // ← 同时允许凭证
        AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowHeaders: []string{"*"},
        MaxAge: 12,
    }
    return cors.New(config)
}
```

`gin-contrib/cors` 在 `AllowAllOrigins=true && AllowCredentials=true` 时会把请求 `Origin` 原样写回 `Access-Control-Allow-Origin`，并加 `Vary: Origin`。这是浏览器规范里"带凭证的跨域"配置。

**挂载范围**（`router/api-router.go`）：
```go
usageRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())   // GET /api/usage/token
logRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())     // GET /api/log/token
```

这两条路由走 `TokenAuthReadOnly()`（`Authorization: Bearer sk-xxx`），不依赖 cookie。

**【攻击步骤】**
1. 攻击者构造恶意页面，JS 里 `fetch("https://target/api/usage/token", {headers:{Authorization:"Bearer sk-leaked"}, credentials:"include"})`。
2. 若用户浏览器里存有该网关的 cookie（虽然这两条路由不用 cookie 鉴权，但 cookie 仍会被发送），响应可读。
3. 实际数据泄露面限于"用户已知自己的 sk- key"的场景——但 CORS 规范上这是错误配置，未来若有任何 cookie 鉴权路由误挂此中间件即变成灾难。

**【影响】**
- 当前影响有限（路由用 Bearer 鉴权），但属于配置错误，违反 ASVS V14.4。

**【建议改法】**
- 用 `AllowOrigins: common.SessionCookieTrustedURLs`（已有配置项），去掉 `AllowAllOrigins`；
- 或直接移除这两条路由上的 CORS——它们是 relay API，不该被浏览器跨域调用。

**【OWASP ASVS 参考】** V14.4.3（CORS 配置）、V14.4.1（安全响应头）。

---

## Minor

### m-1 Refresh Cookie 默认不带 Secure 属性

**【位置】** `J:\hubapi\new-api\common\constants.go:40`、`common/session_cookie.go:48`

**【证据】**
```go
var SessionCookieSecure = false   // 默认
// InitSessionCookieSettings: 只有显式设置 SESSION_COOKIE_SECURE_URLS 才置 true
```
`WriteRefreshCookie`（`service/auth_session.go:333`）直接读 `SessionCookieSecure`。

**【影响】** 默认部署下，若站点被降级到 HTTP（或中间代理剥离 TLS），refresh cookie 会明文传输。SameSite=Strict 已挡 CSRF，但挡不了网络嗅探。

**【建议改法】** 启动时若 `Listen` 是 HTTPS 或反代带 `X-Forwarded-Proto: https`，自动置 `SessionCookieSecure=true` 并打日志。

**【OWASP ASVS】** V3.4.2（Cookie Secure 属性）。

---

### m-2 SessionSecret 未配置时静默使用随机 UUID，多节点/重启即登出

**【位置】** `J:\hubapi\new-api\common\constants.go:36`、`common/init.go:60-70`

**【证据】**
```go
var SessionSecret = uuid.New().String()   // 启动时随机
// init.go 只在 SESSION_SECRET=="random_string" 时 fatal；未设置时静默用随机值
```

**【影响】**
- 每次重启所有用户被强制登出（运维事故面）；
- 多节点部署时节点间 session 不互通（功能缺陷）；
- 无启动日志提醒运维"当前用的是临时密钥"。

**【建议改法】** 未设置 `SESSION_SECRET` 时打 `WARN` 日志，列出影响；master 节点启动时强制要求该 env。

**【OWASP ASVS】** V14.2.5（密钥管理）、V3.5.1（会话生命周期）。

---

### m-3 未设置 Content-Security-Policy

**【位置】** `J:\hubapi\new-api\middleware\security_headers.go:12-27`

**【证据】** 已设置 nosniff / Referrer-Policy / X-Frame-Options / Permissions-Policy / HSTS，但无 CSP。

**【影响】** 网关控制台若未来出现 XSS（富文本展示模型返回内容），无 CSP 兜底。

**【建议改法】** 至少加 `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'`，并按前端实际资源调整。

**【OWASP ASVS】** V14.4.1。

---

### m-4 RelayPanicRecover 把内部错误文本回给客户端

**【位置】** `J:\hubapi\new-api\middleware\recover.go:22-37`

**【证据】**
```go
if err, ok := recovered.(string); ok {
    common.LogError(c, err)
    c.JSON(http.StatusInternalServerError, gin.H{"error": err})   // ← 内部字符串外发
}
```
对比全局 `gin.CustomRecovery`（`main.go:186`）只返回通用 "Internal Server Error"，是对的。

**【影响】** panic 时可能把内部路径、SQL 错误、第三方 API 报错回给调用方，辅助攻击者摸清内部结构。

**【建议改法】** 对外统一 `{"error": "Internal Server Error"}`，详细错误只写日志。

**【OWASP ASVS】** V7.4.1 / V14.2.3（错误信息不泄露内部细节）。

---

### m-5 邮件验证码内存 map 不跨节点、容量仅 10

**【位置】** `J:\hubapi\new-api\common\verification.go:22-23`

**【证据】**
```go
var verificationMap map[string]verificationValue
var verificationMapMaxSize = 10
```

**【影响】** 多副本部署下 LB 不粘滞时验证码功能完全不可用；单机下 10 个验证码上限意味着第 11 个用户发邮件时会触发 `removeExpiredPairs`，未过期的旧验证码被挤掉。

**【建议改法】** 迁移到 Redis（项目已有 `common.RedisEnabled`），key=`email_verify:<purpose>:<email>`，TTL=10min。

**【OWASP ASVS】** V2.2.4 / V14.2.6（集群一致性）。

---

## 已核实的"非问题"（避免误报）

| 检查项 | 结论 | 证据 |
|---|---|---|
| JWT 算法混淆（alg=none） | 安全 | `service/auth_token.go:194` 强制 `ValidMethods: ["HS256"]` |
| Refresh Token 重放 | 安全 | `auth_session.go:266-284` 检测旧 secret 即撤销整条 session |
| 登出是否真正失效 | 安全 | `model.RevokeUserSession` + `RevokeByRefreshToken` 双写，JWT 靠 uv/sv 版本号短路 |
| 会话固定 | 安全 | 登录即 `createLoginSession` 发新 SID（UUID），不沿用前端传入值 |
| 并发登录 | 安全 | session 表多行 + `ListLoginSessions` + `RevokeOtherLoginSessions` |
| 密码哈希 | 安全 | Argon2id m=19456/t=2/p=1（或 bcrypt cost=10） |
| WebAuthn Origin/RPID | 安全 | `middleware/auth_origin.go` 同源守卫 + `passkey.go` 校验 RPID |
| OAuth state 重放 | 安全 | `auth_flows` 表 `ConsumedAt` 原子 UPDATE + unique index on token_hash |
| OAuth 开放重定向 | 安全 | 回调走固定 `/api/oauth/:provider`，无前端传入 redirect_uri |
| Casbin 通配符 | 安全 | model 用 `==` 精确匹配，无 `.*` |
| SQL 注入（sort 字段） | 安全 | `model/user.go:38 userSortColumns` 白名单，非白名单回退 `id` |
| IDOR（token 管理） | 安全 | `GetTokenByIds(id, userId)` 双 where；`UpdateToken`/`DeleteToken` 均带 user_id |
| IDOR（access token PAT） | 安全 | `requireBrowserSession` 强制 Web session，PAT 按 scopes 白名单 fail-closed |
| 错误信息带栈 | 安全 | `gin.CustomRecovery` 不回栈；审计日志只存 fingerprint |
| 日志打印 token/password | 安全 | `model/audit_log.go:61 AccessTokenFingerprint` 只存 SHA-256；`common.SysLog` 不打印 body |
| 管理路由暴露公开 | 安全 | `AdminAuth()`/`RootAuth()` 粗粒度拦截 + `RequirePermission` 细粒度 |
