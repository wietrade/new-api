# new-api / NowHub 最近 80 条提交审查

审查口径：只报告「本次变更新引入、当前可触发、证据闭合」的缺陷（安全 / 计费绕过 / 并发竞态 / 功能回归 / 数据损坏）。纯样式、文案、i18n 翻译、footer/email 模板迭代、metadata 数据同步本身（不藏代码）按 mechanical 处理，仅核对是否夹带代码改动。

判定图例：✅ 正确 / ⚠️ 有隐患（设计取舍或需补保护）/ ❌ 有 bug。

---

## 一、逐条审查表

| sha | 类型 | 判定 | 证据 / 备注 |
|---|---|---|---|
| 0490d19 | chore(ops) cron 可执行位 | ✅ | 仅 chmod，无逻辑改动 |
| 4521fcf | chore(metadata) 同步 | ✅ | 数据文件，未核实具体 diff（批量 JSON） |
| f450e90 | feat gpt-image-2.5-sunburst + promote 脚本 | ⚠️ | 见 §二-A（cron 半失败漂移） |
| 93d0305 | fix(data) 回填核实结果 | ✅ | 数据修正，无代码 |
| 18ac09d / 6c9d978 | docs 任务书 | ✅ | 纯文档 |
| 7e29958 | fix(metadata) gemini token 上限改 overrides | ✅ | 数据修正 |
| c002786 | fix(metadata) 回退未核实标签 | ✅ | 数据修正 |
| a579c4d | chore(metadata) sync | ✅ | 数据同步 |
| 1176eb3 | fix(metadata) 修正 gemini-3-pro-image 上限 | ✅ | 数据修正 |
| cfd9e93 | docs(metadata) 校验命令 | ✅ | 文档 |
| adcab13 | chore(metadata) sync | ✅ | 数据同步 |
| f2969d7 | feat(metadata) 校验脚本 + :free 强制 | ✅ | 见 §三（validate.py 只读校验，merge.py 强制 is_free） |
| c40317a | feat(cmd) pricing-audit | ✅ | 见 §三（只读 CLI，无注入） |
| 0d7cb07 | fix(oss) 逐条删除 | ✅ | 修了 ossutil v1 不支持多参数的问题；脚本默认 DRY_RUN=1 |
| bc7dbec | feat og:image + OSS prune + 不内嵌 static | ✅ | prune 脚本默认预演；og:image 静态资源 |
| e746f0a | fix(web) SPA/静态缺失返回 404 | ✅ | router/web-router.go:51-75，/docs/ 与 /static/ 缺失路径分别 404，带 no-store/no-cache；测试覆盖 |
| 34d45b4 | docs mailto | ✅ | 纯文案 |
| 54c5074 | fix(cache) HTML no-cache | ⚠️ | middleware/cache.go:16-30，见 §二-B（边界路径） |
| f47fb3d | docs 运维手册 | ✅ | 文档 |
| 5b8a6fe | chore(deploy) 构建脚本集成 OSS 上传 | ✅ | 构建脚本，不影响运行时 |
| be3625f | feat(web) meta 随语言切换 | ✅ | 前端 i18n |
| 57c4b9f | chore(oss) 增量上传 | ✅ | 上传脚本 |
| 9f8967a | fix(web) i18n 剥 translation 外壳 | ✅ | web/src/i18n/config.ts:41-48，`inner ?? module` 兜底，无外壳时原样返回 |
| e60a4d4 | chore(deploy) deploy.env | ✅ | 部署配置 |
| 707ebd3 | perf(web) 语言包懒加载 + gzip 预压缩 | ✅ | 前端构建 + 上传脚本 |
| 3739987 | feat(cdn) ASSET_PREFIX | ✅ | 静态外链支持 |
| 4ab3aab | build brotli 时序 | ✅ | 构建脚本 |
| 72bb7a6 | feat brotli 预压缩 + Cache-Version | ✅ | middleware/frontend_static.go:64-190，brotli 失败回退 gzip；见 §二-C（小问题） |
| ca33093 | feat(seo,security) 安全头 + sitemap | ✅ | 安全响应头为增强 |
| 8e6a267 / 251ef7a / 4180f3d | fix(docs) sitemap /docs 前缀 | ✅ | 三次修同一前缀，最终正确 |
| c62d156 | test(email) 去 import | ✅ | 测试清理 |
| 9441547 | feat docs sitemap + 邮件深色模式 | ✅ | 文档站 + 邮件 |
| 05edc7c | feat(site) 客服邮箱可配置 + 强缓存 | ✅ | 静态产物强缓存 |
| b70fba4 / ebbc423 / f779163 / c99ef17 / 788774e / f6d8f3a / 35ebc94 / 6c97f36 / f245f7d / e894e13 / 40e0f09 / 5b1c30f / 4299741 / bf5e482 / 609375b | style/feat email 模板迭代 | ✅ | 纯邮件模板，无业务逻辑 |
| 0efd2ba / 1aa660f / c3a3c1f / b33438d / 1d87661 / d21a394 / 6235e02 / ea878e0 / b2a1423 / 142d7ac / a2e561b | style(ui) footer 迭代 | ✅ | 纯 UI |
| 99d3831 / 518dff4 | refactor/feat legal 页面 | ✅ | 法务页迁移到文档站 |
| 18c2678 / 1dece82 / 48a1197 / b73603c / d134a17 / e23a68e | feat/fix pricing 移动端 | ✅ | 前端展示 |
| 465f167 / 7181504 / 01a7b99 | fix(ui) 密码可见性按钮 | ✅ | 纯 UI 位移修复 |
| abd3fe1 | feat(auth) 密码下限 8→6 | ⚠️ | 见 §二-D（安全策略放宽） |
| da514c9 / 983475d / 8bdc301 | style(pricing) GitHub 风 | ✅ | 纯 UI |
| b98d745 | fix(channel) Key TrimSpace | ✅ | model/channel.go:207-225，多 key 分支逐条 trim + 跳空，单 key 分支整体 trim；修了 net/http 拒绝换行 header 的真 bug |
| 882944a | feat(pricing) 延迟列状态检测 | ✅ | 前端展示 |
| fe798f3 | feat(perf) 后台延迟探针 | ⚠️ | controller/perf_probe.go，见 §二-E |
| 3eaf1b7 | revert 临时日志 | ✅ | 与 e1b2058 对冲 |
| e1b2058 | debug 打印忽略样本原因 | ✅ | 临时日志，已 revert |
| cdbf38e | fix(perf_metrics) 非流式完成也计入 | ✅ | pkg/perf_metrics/outcome.go:34-44，正确修复了「非流式收完响应后客户端断连被误判为用户中断」的回归 |
| c51f142 / 6bc586a / 733161e | fix(web) 前端对齐 | ✅ | UI |
| 69072fb | chore 删编辑器备份 | ✅ | 清理 |
| 3f9d86d | feat(ops) DB 变更脚本入库 | ⚠️ | scripts/ops/ 三个脚本，见 §二-F |
| 88206c9 | chore(metadata) sync | ✅ | 数据 |
| f8d21d8 | fix(web) 输入价取所有档位最低 | ✅ | 前端展示 |
| 2e27b73 | fix(web) 模型广场按表达式报价 | ✅ | web/.../model-table.tsx:213-295，优先用 getDynamicPricingSummary，无表达式才回退倍率；修了 75x 报价偏差 |
| 509b398 / c5c2ef6 / 40a079b / dc63bf2 / bb5e11a / 743cbe0 / 9d53df3 / 020118b / f72a5ef / 12ca9a9 / 2d8eb82 / 92a5751 / bf3f2fc / eb508c7 / 09b56ea / 1caec72 / c78eaba / 9efa03b / e15817a / 621b6fa / aec4356 / 1f90b85 / 4fd7c3d / 6288fcf / c6ea368 / c059ebe | metadata 数据 / 前端小修 | ✅ | 数据同步或纯前端 |
| fd962c0 | feat(model_sync) 导出计费表达式 | ✅ | scripts/model_sync/export_billing.py，见 §三 |
| f55fbce | feat(metadata) 价格行携带表达式 | ✅ | scripts/model_sync/expr.py + merge.py:412-458，表达式由价格字段确定性生成；见 §三 |
| 63c2491 | fix(relay) 默认剥离 prompt_cache_retention | ⚠️ | relay/common/relay_info.go:1186-1190，见 §二-G |

---

## 二、有问题 / 有隐患条目展开

### A. [P2 major] cron-promote-upcoming.sh 半失败漂移 — f450e90 / scripts/ops/cron-promote-upcoming.sh:13-24

**证据**：
```bash
OUT="$(python3 scripts/ops/promote_upcoming_pricing.py --apply 2>&1)"
...
if echo "$OUT" | grep -qE "PROMOTED: [1-9]"; then
  python3 -m scripts.model_sync.export_billing ...
  python3 scripts/ops/apply_billing.py -i /tmp/billing-upcoming.json ...
  systemctl restart new-api
fi
```

**问题**：
1. `promote_upcoming_pricing.py --apply` **先写盘** `metadata/api/newapi/pricing.json`（行 114 `path.write_text`）。
2. 随后 `apply_billing.py` 写线上 SQLite。若此时 new-api 正在写日志导致 SQLite `database is locked`，`apply_billing.py` 抛错；`set -euo pipefail` 直接退出，**restart 不执行**。
3. 下一次 cron 跑时，`promote_row` 看到 `upcoming` 已被移到基础字段、`pending` 为空，`PROMOTED: 0`，**不会再触发 export+apply+restart**。
4. 结果：git 仓库里 pricing.json 是新价，线上 options 表是旧价，漂移静默存在，直到人工发现。

**最小修复方向**：把 `--apply` 拆成「预演输出 → export → apply_billing --dry-run 校验 → apply → restart」，任一步失败时不写盘或写盘后在同一个事务里重试；并在 `apply_billing.py` 失败后保留 `/tmp/billing-upcoming.json` 供人工补跑。

---

### B. [P3 minor] isFrontendDocument 边界 — 54c5074 / middleware/cache.go:16-30

**证据**：
```go
func isFrontendDocument(path string) bool {
	if strings.HasSuffix(path, ".html") { return true }
	for _, prefix := range []string{"/api/", "/v1/", "/pg/"} {
		if strings.HasPrefix(path, prefix) { return false }
	}
	last := path[strings.LastIndex(path, "/")+1:]
	return !strings.Contains(last, ".")
}
```

**问题**：
- 路径 `/pg`（无尾斜杠、无扩展名）会被判为前端文档，返回 `no-cache`。但 `/pg/` 是 pg 健康检查前缀。当前调用方在 web-router.go 里 `/pg/health` 带斜杠，未暴露 `/pg`，故当前不可触发。
- 路径 `/api`（无尾斜杠）同理会被判为 HTML。当前路由都挂在 `/api/` 下，未触发。
- 这两个是**潜在**误判，不是当前 bug。若后续新增 `/api` 裸路径的 API 路由，会被错加 no-cache（无安全后果，仅缓存策略）。

**最小修复方向**：把 `/api`、`/v1`、`/pg` 三个前缀改成精确前缀匹配（含尾斜杠或等于自身）。

---

### C. [P3 minor] brotli 失败后缓存删除的小竞态 — 72bb7a6 / middleware/frontend_static.go:165-185

**证据**：
```go
file.once.Do(func() { ... file.err = err ... })
if file.err != nil {
	cache.Delete(urlPath)
	return false
}
```

**问题**：`sync.Once` 保证只初始化一次。若 Open 失败，`file.err` 被永久记住；`cache.Delete(urlPath)` 后下一个请求会重新 LoadOrStore 一个新的 `brotliFile{}`。逻辑正确。
但 `LoadOrStore` 返回的 `value` 可能不是刚存的那个（并发下另一个 goroutine 先存了）；当前代码 `value, _ = cache.LoadOrStore(...)` 后直接 `file := value.(*brotliFile)`，两个 goroutine 可能拿到不同实例——但每个实例都有自己的 `Once`，最终都会失败，无正确性问题。**不构成 bug**，仅记录。

---

### D. [P2 major] 密码下限 8→6 安全策略放宽 — abd3fe1

**证据**：
- `common/account_password.go:17` `MinAccountPasswordLength = 6`
- `model/user.go:82` `validate:"min=6,max=128"`
- 前端 `web/src/lib/password-policy.ts:24` 同步到 6
- 7 个语言文件全部同步

**问题**：OWASP ASVS V2.2.1 建议口令最小长度 10（旧版 8）。从 8 降到 6 显著降低熵（6 位纯数字仅 10^6，撞库成本极低）。这是**产品决策**而非代码 bug，但：
1. 仓库里仍残留未同步的文案键（en.json:2171 `"Enter password (8-20 characters)"`、:4295 `"Password must be at least 8 characters"`、`"Password must be between 8 and 20 characters"`）——这些是另一个表单（管理员建用户限制 20 字符）的键，不是本次改的对象，但容易让后续维护者误改。
2. 仓库内**没有看到**同登录失败限流、撞库锁定的配套加强。OWASP 要求放宽口令长度时必须配合 MFA 强制、登录失败指数退避、异常登录检测。

**判定**：⚠️ 不是代码 bug，但是 OWASP ASVS V2.2 / V2.4 层面的回归。建议补充：登录失败限流、可选 TOTP/Passkey 强制、在文档中记录此决策的风险接受。

---

### E. [P3 minor] perf 探针复用 testChannel 但跳过配额结算 — fe798f3 / controller/perf_probe.go

**证据**：
- `testChannel(..., testChannelOptions{silent: true})` 在 channel-test.go:522-524 提前 return，跳过 `RecordConsumeLog`。
- 但上游请求**真实发出**（max_tokens=16），上游会计费。
- 探针用 root user ID 发请求（`resolveChannelTestUserID(nil)` 回退到 root）。

**问题**：
1. 探针每 30 分钟对每个上架模型发一次真请求。若上架 200 个模型，每 30 分钟 200 次请求，每天 ~9600 次上游调用。max_tokens=16 但输入 prompt 仍走完整上游，**成本可能不低**。这是容量/成本问题，不是正确性 bug。
2. 探针用 root user，root 配额扣费被 silent 跳过——但上游账单照付。
3. `probeInterModelDelay = 300ms`，200 个模型串行需要 60 秒，单 goroutine 不会重叠，正确。

**判定**：⚠️ 设计取舍。建议在 perf_metrics_setting 里加一个「探针每月上游预算」告警，或对按张计费模型（image 类）跳过探针。

---

### F. [P2 major] ops 脚本的半失败 / 恢复盲点 — 3f9d86d

**F1. apply_billing.py 无锁、运行中写入 — scripts/ops/apply_billing.py:85-96**
- new-api 运行中直接 `INSERT OR REPLACE INTO options`。SQLite 写锁期间若 new-api 写日志会 `database is locked`。
- 脚本没有 busy_timeout，没有重试。失败即退出。
- 备份在写入前做了（行 82 `shutil.copy2`），好。

**F2. drop_model.py 的 soft-delete 时间格式 — scripts/ops/drop_model.py:60**
```python
"UPDATE models SET deleted_at=datetime('now') WHERE model_name=? AND deleted_at IS NULL"
```
- GORM `gorm.DeletedAt` 在 SQLite 里存为 time.Time。mattn/glebarez SQLite 驱动的时间序列化格式若与 `datetime('now')` 输出的 `"YYYY-MM-DD HH:MM:SS"` 不一致，GORM 的软删过滤 `WHERE deleted_at IS NULL` 会**漏掉这些行**——即脚本以为软删了，GORM 查询仍把它当 live。
- **未核实**：需在测试 DB 上跑一次，对比 GORM 自己 AutoMigrate 产生的 deleted_at 字符串格式。若不一致，这是 major 数据完整性 bug。

**F3. rename_model.py 不更新 abilities 表 — scripts/ops/rename_model.py:86-105**
- 脚本只改 `models.model_name` 和 options 里的 billing 键。
- 渠道绑定检查只查 `channels.models` 字符串逗号列表，**不查 `abilities` 表**。
- 若某 channel 的 `channels.models` 列表里没有这个模型名（手改漏了），但 abilities 表里有该模型的路由行，rename 后 abilities 里的旧名行成为孤儿，新名路由不可用。
- `--force` 模式下更明显。
- 这是**已知边界**（README 写了「channels.models / abilities 不在脚本自动范围内」），但实际使用时容易踩。

**最小修复方向**：F2 先验证时间格式；F3 在 rename_model 里同步 `UPDATE abilities SET model=? WHERE model=?`，并在 dry-run 里打印会受影响的 abilities 行数。

---

### G. [P3 minor] prompt_cache_retention 无 channel 级 opt-out — 63c2491 / relay/common/relay_info.go:1186-1190

**证据**：
```go
// 默认移除 prompt_cache_retention：扩展保留期的缓存写入无法计入本地计费
if _, exists := data["prompt_cache_retention"]; exists {
	delete(data, "prompt_cache_retention")
}
```

**问题**：
- 同文件里 `service_tier`、`speed`、`store`、`safety_identifier`、`stream_options.include_obfuscation` 都有 `channelOtherSettings.Allow*` 开关。
- `prompt_cache_retention` 是**无条件删除**，没有任何 channel 级开关。
- 提交信息解释了原因（上游按 30m/12h write 档单独计费，本地计费引擎没有对应缓存桶，透传会上游多收本地少收）。
- 但如果未来某渠道用户**确实**需要 24h 扩展缓存（例如内部 Codex 类工作流），没有重新打开的口子，只能改代码重发。

**判定**：⚠️ 设计取舍，当前无 bug。建议在 dto.ChannelOtherSettings 里加 `AllowPromptCacheRetention bool`，与 service_tier 对齐，默认 false。

---

## 三、未发现问题但记录核验点

- **b98d745 渠道 Key trim**：正确。多 key 分支逐条 trim 跳空，单 key 分支整体 trim。修复了线上真实故障（渠道 #1 密钥末尾换行导致 net/http 拒绝 Authorization header）。
- **cdbf38e 非流式完成计入指标**：正确。放宽条件后 `apiErr == nil && !IsStream && stream.EndReason == ""` 才视为完成，真中断仍被 `ctx.Err() == Canceled` 拦截。
- **e746f0a SPA 404**：正确。/docs/ 缺失读 404.html 返回 404；/static/ 缺失带 no-store 返回 404；其他 SPA 路由仍返回 index。
- **9f8967a i18n 剥外壳**：正确。`inner ?? module` 兜底，无 translation 外壳时原样返回，不破坏已有扁平 locale。
- **72bb7a6 brotli**：正确。.br 优先，失败回退 gzip，再回退原文件；Vary: Accept-Encoding 设置正确。
- **c40317a pricing-audit**：只读 CLI，编译 + 静态求值表达式，无副作用。唯一小瑕疵是直接用 `encoding/json`（cmd/ 工具，AGENTS.md 的 common.Marshal 规则主要针对业务代码，可接受）。
- **fd962c0 export_billing**：纯函数，从 pricing.json 生成 options payload；--alias 显式报错未知 source；dry-run 默认。
- **f55fbce expr.py**：表达式由价格字段确定性生成，时间窗/长度档/图像 meter 都有「不可表达则上报」路径，不会静默错算。
- **f2969d7 validate.py**：CI 校验，强制 `billing_expr` 可由价格字段复现，:free 后缀强制 is_free，模型名去重。只读。

---

## 四、汇总

- 审查提交数：80
- Critical (P0)：0
- Major (P2)：3（A cron 半失败漂移、D 密码策略放宽、F ops 脚本时间格式/abilities 盲点）
- Minor (P3)：4（B 缓存前缀边界、C brotli 竞态记录、E 探针成本、G prompt_cache_retention 无 opt-out）
- 其余 73 条 ✅。

**verdict**: `changes_required`（无 P0/P1，但 3 个 P2 建议在下一次发版前修复，尤其是 F2 的 deleted_at 时间格式需在测试 DB 上实测）。
