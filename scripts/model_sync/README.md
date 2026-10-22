# 模型元数据 / 官方价格自动同步

一个入口、两个产物，共用同一套抓取、vendor 归一化与合并逻辑：

| 产物 | 用途 | 是否被 new-api 自动消费 |
|:---|:---|:---|
| `metadata/api/newapi/models.json`、`vendors.json`（含 `i18n/zh`、`i18n/en`） | 模型元数据（描述、能力、模态、上下文、最大输出、免费标记） | 是，走「模型元数据同步」（预览 + 字段级应用） |
| `metadata/api/newapi/pricing.json` | 官方列表价（USD / 每 1M tokens） | **否**，仅生成 diff 供人工确认后再改 `model_ratio` 等 |

分开的原因：元数据变更风险低、可自动应用；价格变更直接影响实收，必须人工过目，
且厂商调价频率远高于新模型发布。两者失败也互不影响。

## 用法

```bash
# 只看会发生什么（不写文件）
python3 scripts/model_sync/sync_models.py --dry-run

# 只刷新已有模型 + 生成 pricing.json（默认行为，不新增模型）
python3 scripts/model_sync/sync_models.py

# CI 守卫：有未提交变更则 exit 1
python3 scripts/model_sync/sync_models.py --check

# 只同步元数据 / 只同步价格
python3 scripts/model_sync/sync_models.py --only metadata
python3 scripts/model_sync/sync_models.py --only pricing

# 允许新增最近发布的模型（避免把厂商历史模型全量灌进广场）
python3 scripts/model_sync/sync_models.py --allow-new --min-release-date 2026-01-01

# 同时查询厂商官方 API（存在对应环境变量才生效）
OPENAI_API_KEY=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=... \
  python3 scripts/model_sync/sync_models.py --official
```

单元测试：

```bash
python3 -m unittest discover -s scripts/model_sync/tests -t . -v
```

## 数据源

| 类型 | 源 | 提供 | 凭证 |
|:---|:---|:---|:---|
| 聚合 | `models.dev` | 上下文、最大输出、模态、能力布尔值、单价（每 1M） | 无 |
| 聚合 | `openrouter` | 上下文、最大输出、模态、supported_parameters、单价（每 token，脚本已换算） | 无 |
| 官方 | OpenAI `/v1/models` | 模型 ID 存在性 | `OPENAI_API_KEY` |
| 官方 | Anthropic `/v1/models` | 模型 ID + display name | `ANTHROPIC_API_KEY` |
| 官方 | Gemini `generativelanguage/models` | 模型 ID + 输入/输出 token 上限 | `GEMINI_API_KEY` |

优先级：`--sources` 的书写顺序（默认 `models.dev,openrouter`），官方 API 最后兜底。
聚合源用于拿到「事实字段」，官方 API 用于发现聚合源漏掉的新模型、以及提示
「本地有但官方列表里没有」的过期条目。厂商价格页 HTML **不在**抓取范围内（改版即断，维护成本过高）。

## 合并规则

- 只刷新事实字段：`vendor_name`、`capabilities`、`input_modalities`、`output_modalities`、
  `context_length`、`max_output_tokens`、`is_free`
- 本地字段永不覆盖：`description`、`icon`、`tags`（用户自定义）、`endpoints`、`name_rule`、`status`
- 源里为空 / 0 的值不写入，避免把本地值清空
- `max_output_tokens > context_length` 时按 `context_length` 截断
- 源里找不到的已有模型**保留原样**，只在输出里提示 `not in sources`
- 同一归一化 key 命中多条本地记录时报 `ambiguous` 并跳过（安全优先）
- 新模型必须显式 `--allow-new`，可再用 `--min-release-date` 收窄

模型名归一化：去掉 vendor 前缀、`:free`/`:nitro`、`-latest`、日期后缀，
`.` 与 `_` 统一成 `-` ⇒ `claude-haiku-4-5-20251001` ≡ `anthropic/claude-haiku-4.5`。

## 与后台「上游价格同步」的关系

new-api 后台已经内置两个可直接写库的换算源（虚拟渠道）：

| 虚拟渠道 | ID | 数据 | 语义 |
|:---|:---|:---|:---|
| 官方定价预设 | -100 | `basellm.github.io/llm-metadata/api/newapi/ratio_config-v1-base.json` | 上游项目维护的倍率配置，已是 new-api 倍率语义 |
| models.dev 定价预设 | -101 | `https://models.dev/api.json` | 第三方聚合价，后台换算成倍率 |

二者都能直接改库，所以**本脚本的 `pricing.json` 只是 Git 里的价格快照**，
用于 review 涨跌与追溯（后台预设是实时拉取，没有历史），不参与任何自动写库，
避免出现第三个价格来源。

## GitHub Actions

`.github/workflows/sync-model-metadata.yml`：

- 每天 02:17 UTC 跑一次，也支持手动触发（可勾选「允许新增模型」）
- 先跑单测，再分别执行 `--only metadata` 与 `--only pricing`
- 有差异时推到固定分支 `chore/model-metadata-sync` 并开/更新 PR，
  由人审阅 diff 后合并；**不会**直接推到 `main`
- Fork 仓库需要先在 Actions 页面启用 workflow，并按需配置上述三个 API key secret
