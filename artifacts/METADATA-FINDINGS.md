# metadata 加载链路与脚本审计

## 一、架构事实（先讲清楚，避免后续误判）

**Go 运行时不直接读 `metadata/api/newapi/*.json`。**

- 仓库内 grep `metadata/api/newapi|pricing\.json|models\.json|overrides\.json` 在 Go 源码里只命中 `model/metadata_contract_test.go:26`（测试用）。
- 运行时计费读的是数据库 `options` 表的两行：
  - `billing_setting.billing_mode` → JSON map `{model: "tiered_expr"}`
  - `billing_setting.billing_expr` → JSON map `{model: "tier(\"standard\", p * 2 + c * 8)"}`
- 运行时模型元数据读的是 `models` 表（GORM Model struct，见 `model/model_meta.go:35-67`）。
- `metadata/api/newapi/*.json` 是**人维护的事实源**，由 Python 脚本链导出 → 落库 → 重启才生效。

```
┌─────────────────────────────────────────────────────────────┐
│  人维护（git 仓库）                                          │
│  metadata/api/newapi/                                       │
│    models.json             ← 模型清单（能力/模态/上下文）    │
│    pricing.json            ← 价格行（input/output/tiers/…）  │
│    pricing.official.json   ← 官方抄录原始价                  │
│    overrides.json          ← 人工覆写（如 gemini 上限）       │
│    vendors.json            ← 厂商字典                        │
│    sync.config.json        ← 同步配置                        │
└─────────────────────────────────────────────────────────────┘
                  │
                  │  scripts/model_sync/
                  │  merge.py → expr.py 生成 billing_expr
                  │  validate.py（CI 校验表达式可复现）
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  scripts/model_sync/export_billing.py                       │
│  输出 {billing_mode: {…}, billing_expr: {…}}              │
└─────────────────────────────────────────────────────────────┘
                  │
                  │  scripts/ops/apply_billing.py
                  │  （--dry-run 默认；先备份 SQLite）
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  线上 SQLite: options 表                                   │
│  billing_setting.billing_mode / billing_expr                │
└─────────────────────────────────────────────────────────────┘
                  │
                  │  systemctl restart new-api
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Go 运行时                                                   │
│  model/model_pricing_config.go: readModelPricingMaps       │
│  → billingexpr.RunExpr 按表达式计费                         │
└─────────────────────────────────────────────────────────────┘
```

## 二、Go 侧加载点（只读，无问题）

| 文件 | 职责 | 核验 |
|---|---|---|
| `model/model_pricing_config.go:96-120` | 从 options 表读 `billing_setting.billing_mode/billing_expr` 等 11 个 key，Unmarshal 到 map | 用 `common.UnmarshalJsonStr`，符合 AGENTS.md JSON 规范；解析失败即报错 |
| `model/model_pricing_config.go:66-70` | `modelPricingOptionKeys` 白名单 | 与 ops 脚本写的 key 完全对齐 |
| `model/model_meta.go:35-67` | Model 表 GORM struct | 与 models.json 字段对齐（model_name/tags/capabilities/…） |
| `model/pricing_refresh.go` | `RefreshPricing()` 强制重算缓存 | 持 `updatePricingLock`，无并发问题 |
| `model/missing_models.go` | 找已路由但无元数据的模型 | 只读 |
| `model/model_pricing_conversion.go` | 倍率 → 表达式转换（前端「Convert to expression」后端） | `cmd/pricing-expr-migrate` 复用同一函数 |

## 三、scripts/model_sync/ 脚本审计

### merge.py
- 从聚合源 + official 源合并价格行。
- **关键行为**：`attach_expression(row)`（行 448-461）对每行调用 `expr.build(row)` 生成 `billing_expr` 并写回。**任何手工改 pricing.json 里 billing_expr 的尝试都会在下次 sync 被覆盖**——这是设计意图（表达式必须由价格字段确定性生成），由 `validate.py` 强制。
- f2969d7 新增：`:free` 后缀强制 `is_free=True`。正确。
- **无注入风险**：表达式是字符串拼出来的，变量名是硬编码的，价格来自 JSON number。

### expr.py（f55fbce 引入）
- `build(row)` 优先级：free → time_tier → length_tier → flat token → image_meter。
- 不可表达的情况走 `unexpressible` 上报，不静默错算。
- **核验点**：
  - `token_terms` 里 `output` 与 `output_text/output_image` 共存时 pop `output`，避免双重计费。✅
  - `length_tier_expr` 嵌套 `len <= T ? L : rest`，阈值排序正确。✅
  - `image_meter_expr` 默认 meter 条件冗余但不错算。✅
  - DeepSeek 峰谷时间窗用 `weekday/hour("Asia/Shanghai")`，与 billingexpr 引擎对齐。✅

### validate.py（f2969d7 引入，CI）
- 校验：模型名去重、vendor_name 在 vendors.json、capability/modality 枚举合法、max_output_tokens ≤ context_length、:free 后缀必免费、price_kind=free 基础价必为 0、**billing_expr 可由价格字段复现**。
- 只读，CI 阻断。无问题。

### export_billing.py（fd962c0 引入）
- 把 pricing.json 的 `billing_expr` 字段导出成 options payload。
- `--alias LIVE=SOURCE` 复用 source 的表达式。
- 未知 alias source 直接 SystemExit。✅
- **不覆盖人工配置**：脚本只生成 payload，是否合并由 `apply_billing.py` 的 `--replace` 标志决定（默认 merge，保留未导出的模型）。

### normalize.py / sources.py / sync_models.py
- 未逐行审计，按命名与 merge.py 调用点推断为字段规范化与上游抓取。**未核实**，但本批提交里没有改它们的逻辑。

## 四、scripts/ops/ 运维脚本审计

| 脚本 | dry-run | 备份 | 主要风险 |
|---|---|---|---|
| apply_billing.py | ✅ 默认预演 | ✅ `shutil.copy2` 到 `.bak-<ts>` | 无 busy_timeout，运行中写 SQLite 可能 locked；半失败漂移（见 COMMIT-REVIEW §A） |
| promote_upcoming_pricing.py | ✅ 默认预演 | 不备份（只改 pricing.json） | --apply 先写盘后落库，半失败时 git 与线上漂移 |
| drop_model.py | ✅ 默认预演 | ✅ | **F2: deleted_at=datetime('now') 时间格式未核实**，可能 GORM 不认 |
| rename_model.py | ✅ 默认预演 | ✅ | **F3: 不更新 abilities 表**，--force 后孤儿路由 |
| cron-promote-upcoming.sh | n/a | n/a | **A: set -e 半失败漂移**，promote 写盘后 apply 失败不会重试 |

## 五、cmd/ CLI 工具审计

### cmd/pricing-audit/main.go（c40317a）
- 只读。输入 `{model: expr}` JSON，编译 + 静态求系数，输出可疑项。
- 无副作用、无网络、无 DB。
- 小瑕疵：直接 `encoding/json`（cmd 工具，可接受）。

### cmd/pricing-expr-migrate/main.go
- 把倍率计费模型批量转成表达式计费。
- 默认 dry-run，`-apply` 才写。
- 通过 `model.UpdateModelPricingOptions` 走正式 mutation 路径（持 metadataMutationMu）。
- 小瑕疵：**写前无 DB 备份**（不像 apply_billing.py）。建议加 `cp one-api.db .bak-<ts>`。
- 小瑕疵：直接 `encoding/json`。

## 六、Findings 清单

### [P2 major] F1 — cron-promote-upcoming.sh 半失败漂移
- **位置**：`scripts/ops/cron-promote-upcoming.sh:13-24`
- **证据**：`promote_upcoming_pricing.py --apply` 先写 pricing.json；若后续 `apply_billing.py` 失败，`set -e` 退出，restart 不执行；下次 cron 因 PROMOTED=0 不再触发 apply。
- **影响**：git 仓库新价 vs 线上旧价静默漂移，下次改价时才暴露。
- **建议**：把 promote 的 --apply 推迟到 apply_billing 成功之后；或失败时保留 `/tmp/billing-upcoming.json` 并在日志里显式告警。

### [P2 major] F2 — drop_model.py 的 deleted_at 时间格式
- **位置**：`scripts/ops/drop_model.py:60`
- **证据**：`UPDATE models SET deleted_at=datetime('now')`。GORM `gorm.DeletedAt` 在 SQLite 由驱动序列化为 time.Time 字符串；`datetime('now')` 输出 `YYYY-MM-DD HH:MM:SS`，与 GORM 写入格式（通常 RFC3339 或带时区）可能不一致。
- **影响（未核实）**：若格式不匹配，GORM 的软删过滤 `WHERE deleted_at IS NULL` 会漏掉这些行——脚本以为软删了，运行时仍当 live 模型路由。
- **建议**：在测试 SQLite 上对比 `db.Delete(&Model{})` 产生的 deleted_at 字符串与 `datetime('now')` 输出，统一格式。

### [P2 major] F3 — rename_model.py 不同步 abilities 表
- **位置**：`scripts/ops/rename_model.py:86-105`
- **证据**：只 `UPDATE models SET model_name=?` 与搬 options billing 键；渠道绑定检查只查 `channels.models` 逗号字符串，不查 `abilities` 表。
- **影响**：若 abilities 表里有该模型路由行（且 channels.models 字符串漏列），rename 后旧名成孤儿，新名路由不可用。`--force` 模式更明显。
- **建议**：rename 事务内同步 `UPDATE abilities SET model=? WHERE model=?`，并在 dry-run 打印受影响行数。

### [P3 minor] M1 — apply_billing.py 无 busy_timeout
- **位置**：`scripts/ops/apply_billing.py:85`
- **证据**：`sqlite3.connect(args.db)` 默认 busy_timeout=0。new-api 运行中写日志时，options 写入会立刻 `database is locked`。
- **影响**：偶发失败，需人工重跑。
- **建议**：`conn = sqlite3.connect(args.db, timeout=10)`。

### [P3 minor] M2 — pricing-expr-migrate 写前无备份
- **位置**：`cmd/pricing-expr-migrate/main.go:163-176`
- **证据**：直接 `model.UpdateModelPricingOptions`，无 `.bak-<ts>`。
- **影响**：一次性迁移工具，跑错了只能靠 mysqldump/onedrive 备份恢复。
- **建议**：写前 `cp one-api.db one-api.db.bak-<ts>`，与 ops 脚本对齐。

### [P3 minor] M3 — ops 脚本硬编码生产 DB 路径
- **位置**：`scripts/ops/*.py:23` `DEFAULT_DB = "/www/wwwroot/new-api/data/one-api.db"`
- **证据**：所有脚本默认指向同一生产路径。
- **影响**：本地测试时若忘了 `--db`，会在错误路径建一个空 SQLite（不影响生产，但会误导）。
- **建议**：保留默认，但在 --dry-run 打印即将操作的 DB 绝对路径。

## 七、汇总

- Critical (P0)：0
- Major (P2)：3（F1 cron 漂移、F2 deleted_at 格式、F3 abilities 不同步）
- Minor (P3)：3（M1 busy_timeout、M2 无备份、M3 硬编码路径）
- 整体设计合理：表达式由价格字段确定性生成、validate.py 强制可复现、ops 脚本默认 dry-run + 先备份。主要风险集中在「半失败后无重试 / 无告警」与「跨表一致性盲点」。
