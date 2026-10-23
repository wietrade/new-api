# llm-metadata (self-hosted)

供 new-api 的「模型元数据同步」使用。目录结构必须与上游一致：

```
/api/newapi/models.json
/api/newapi/vendors.json
/api/i18n/<zh|en>/newapi/models.json
/api/i18n/<zh|en>/newapi/vendors.json
```

## 在 new-api 中启用

```
SYNC_UPSTREAM_BASE=https://raw.githubusercontent.com/wietrade/new-api/main/metadata
```

（raw 直连需要代理、较慢，故 `SYNC_HTTP_TIMEOUT_SECONDS=30`；
jsDelivr 备选 `https://cdn.jsdelivr.net/gh/wietrade/new-api@main/metadata`，但有约 12h 缓存）

## 模型字段

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `model_name` | string | 必填，模型 ID |
| `vendor_name` | string | 供应商名，需存在于 `vendors.json` |
| `description` | string | 展示文案 |
| `icon` | string | lobe-icons 名称，如 `Claude.Color` / `OpenAI` |
| `tags` | string | **纯展示标签**（逗号分隔），不参与筛选 |
| `capabilities` | string[] | **功能特性**（闭集，见下） |
| `input_modalities` | string[] | **输入模态**（闭集，见下） |
| `output_modalities` | string[] | **输出模态**（闭集，见下） |
| `context_length` | int | 上下文窗口（输入 token 数），如 `1100000` |
| `max_output_tokens` | int | 最大输出 token 数；0 表示未知 |
| `is_free` | bool | 是否免费（免计费模型） |
| `endpoints` | null / array / object | 显式协议端点；`null` 表示按渠道类型推断 |
| `name_rule` | int | 0=精确匹配，1=前缀，2=后缀，3=包含 |
| `status` | int | 1=上架，0=下架 |

## capabilities（功能特性，闭集）

| key | 含义 |
|:---|:---|
| `reasoning` | 推理（思维链 / 高算力档） |
| `tools` | 工具 / 函数调用 |
| `web_search` | 联网搜索 |
| `code_interpreter` | 代码执行 |
| `chat` | 对话（一般不需要写，由输出模态推导） |
| `vision` / `files` / `audio` | 旧值，等价信息请写进 `input_modalities` |
| `image_generation` / `video_generation` | 旧值，等价信息请写进 `output_modalities` |
| `embedding` / `rerank` | **用途判别键**：向量 / 重排模型必填其一 |

## modalities（模态，闭集）

- `input_modalities`：`text` / `image` / `audio` / `video` / `file`
- `output_modalities`：`text` / `image` / `audio` / `video`

> 生成类模型写 `output_modalities`，理解类模型写 `input_modalities`。
> 例：Claude = `["text","image","file"]` → `["text"]`；文生图 = `["text"]` → `["image"]`。

## 广场筛选器如何由字段推导（任务语义，互不排斥）

| 筛选项 | 判定 |
|:---|:---|
| 对话 | 输出含 `text`，且 `capabilities` 不含 `embedding`/`rerank` |
| 图像理解 | 输入含 `image` 且输出含 `text` |
| 图像生成 | 输出含 `image` |
| 音频 | 输入或输出含 `audio` |
| 视频 | 输入或输出含 `video` |
| 文件 | 输入含 `file` |
| 向量 | `capabilities` 含 `embedding` |
| 重排 | `capabilities` 含 `rerank` |
| 免费 | `is_free = true` |

> 一个模型可以同时命中多项（例如 Claude 同时属于「对话 / 图像理解 / 文件」），这是预期行为。

## 注意

- 同步只覆盖 `sync_official=1` 的模型；手工改过的（`sync_official=0`）不会被覆盖
- 同步按字段比对：预览里 upstream 为空/0 的字段不要勾选，否则会把本地值清空
- `tags` 不再承载上下文长度或能力；能力写 `capabilities`，类型写 `modalities`
- `max_output_tokens` 必须 ≤ `context_length`（双方都非 0 时校验）
- 新增能力 / 模态词需三处同步：本文件、`model/model_metadata_sync.go`、`web/src/features/pricing/constants.ts`

## 本仓库即官方元数据库

`metadata/` 由本仓库自行维护并发布到 GitHub，new-api 从这里同步，不再依赖单一上游项目：

```
厂商官方 API（可选 key）┐
models.dev              ├─► scripts/model_sync ─► overrides.json ─► metadata/api/newapi/*.json ─► GitHub ─► new-api 同步
openrouter（tie-break）  ┘
```

- 事实字段（上下文 / 最大输出 / 模态 / 能力 / 免费标记）由多源合并；源下不一致时用
  `metadata/api/newapi/sync.config.json` 的 `tie_break`（当前 `openrouter`）裁决，裁决结果会打印在同步日志里。
- 人工核对过的值写入 `metadata/api/newapi/overrides.json`，优先级最高（请附官方文档链接与核对日期）。
- 发布地址（new-api 通过 `SYNC_UPSTREAM_BASE` 读取）：
  - `https://raw.githubusercontent.com/wietrade/new-api/main/metadata`
  - `https://cdn.jsdelivr.net/gh/wietrade/new-api@main/metadata`（约 12h 缓存）
- `api/newapi/pricing.json` 只是价格快照，**不参与** new-api 自动写库；后台能直接写库的仍是“上游倍率预设”与“models.dev 价格预设”两个虚拟渠道。
- 每日 02:17 UTC 的 GitHub Actions 会自动跑一遍并开 PR；合并前请重点看新增模型与价格涨跌。
## 价格文件

| 文件 | 内容 | 维护方式 |
|:---|:---|:---|
| `api/newapi/pricing.official.json` | 厂商官方定价页抄录，`price_kind: vendor_official`，逐条带 `source_url` 与 `quote` | 人工（官方页核对后导入） |
| `api/newapi/pricing.json` | 每个已发布模型当前采用的列表价，逐条 `price_kind` 标明来源 | `scripts/model_sync` 生成 |

优先级：**官方 > 聚合源 > 目录免费标记**。官方有条目的模型一律用官方价；聚合源（models.dev / OpenRouter）
补官方未覆盖的模型；目录里 `is_free: true` 但两边都没有报价的模型，直接写 `0`（`price_kind: free`）。
每条 `pricing.json` 记录都用 `price_kind` 标明来源。
这样「某个转售商的最低报价」不会在无人察觉时替掉厂商牌价。

字段语义（schema v2，USD / 每 1M tokens）：

| 字段 | 含义 |
|:---|:---|
| `input` / `output` | 基础价（未达第一个档位阈值时的价） |
| `input_image` / `cache_read_image` | 图像模态的输入 / 缓存读价；仅当与文本价不同才填（如 `chatgpt-image-latest`） |
| `output_text` / `output_image` | 文本 / 图像输出价；仅当与 `output` 不同才填（图像模型必填） |
| `cache_read` / `cache_write` | 缓存读 / 5 分钟缓存写入 |
| `cache_write_1h` | 1 小时缓存写入（Anthropic 等有 TTL 分档的厂商） |
| `cache_write_12h` | 12 小时缓存写入（OpenAI `prompt_cache_retention`）；计费引擎目前只有 30m/1h 两个缓存桶，此字段仅作参考 |
| `tiers[]` | 阈值触发的覆盖价：输入达到 `prompt_tokens_at_least` 时，整条请求按该档计价 |
| `effective_from` / `effective_to` | 该价格的有效期（`YYYY-MM-DD`），长期价写 `null` |
| `upcoming[]` | 已公布但尚未生效的价格（如 `gemini-4-argon` 2026-12-01 涨价） |
| `per_image` | 按张计价；仅当没有 token 价时作为 `fixed()` 兜底，否则只供展示 |
| `billing_mode` / `billing_expr` | 该模型实际结算用的计费表达式，由 `scripts/model_sync/expr.py` 从上面的价格字段确定性生成 |
| `billing_unexpressible` | 官方价里无法用引擎变量表达的收费项，逐条列出，绝不猜测 |
| `confidence` / `quote` | 抄录置信度与官方原文片段，用于复核 |

> `tiers` **不是「第 0 档」**：基础价是阈值以下的价，`tiers[i]` 是「达到阈值之后」的价。
> 例：`claude-haiku-5.5` 基础 `input: 0.1`，`tiers[0] = {prompt_tokens_at_least: 100000, input: 0.5}`。

### 非 token 计费：`meters[]`

LLM 的 token 价继续用上面的标量字段；**按张 / 按秒 / 按次 / 按 credit** 的模型用 `meters[]`
记录官方原文里的单价。`meters[]` 是**审计与展示用的事实记录，不参与表达式生成**：
计费引擎能表达的只有 token 变量（含 `img` / `img_o` / `img_cr` / `ai` / `ao`）与
`image_count`，所以图片模型的计费表达式一律走 token 变量。

```json
"meters": [
  { "dim": "output_image", "price": 0.134, "unit": "image",
    "when": { "resolution": "1K-2K" } },
  { "dim": "output_image", "price": 0.24, "unit": "image",
    "when": { "resolution": "4K" } },
  { "dim": "input_image", "price": 0.0011, "unit": "image" }
]
```

| 键 | 含义 |
|:---|:---|
| `dim` | 计量维度：`input_tokens` / `output_tokens` / `cache_read_tokens` / `input_image` / `output_image` / `input_second` / `output_second` / `request` / `credit` |
| `price` | 单价（USD） |
| `unit` | 单位：`1m_tokens` / `image` / `second` / `request` / `credit` |
| `when` | 生效条件，全部命中才算（可为空）：`prompt_tokens_at_least` / `prompt_tokens_below` / `resolution` / `mode` |
| `free` | 免费额度（前 N 张 / 前 N 秒），可选 |
| `note` | 补充说明，可选 |

规则：

- `meters[]` **不生成计费表达式**：引擎的图片费用走 `output_image` → `img_o` token 变量，
  `input_image` 按张与 `resolution` 条件都没有可观测变量，宁可留在 `billing_unexpressible`；
- 同一 `dim` 的多条 rate 用不同 `when` 区分，条件不得重叠；
- token 与按张价可以并存（例如 Gemini 图像模型既有 `$120/1M image tokens`，又有按分辨率的每张价），
  但两者各自来自官方原文，**不得互相推导覆盖**；
- `meters` 只描述可直接标价的维度；没有 `meters` 的模型表示只按 token 计费。

> `unresolved[]` 记录官方提到但未给出具体数值的项（例：`gpt-5.5` 高档缓存价未明确），
> 这些字段一律留 `null`，不得按倍率推算填入。

### 从数据源到线上

`pricing.json` 里的 `billing_expr` 只是数据。真正生效要写进 new-api 的 options：

```bash
python scripts/model_sync/sync_models.py --only pricing
python -m scripts.model_sync.export_billing -o /tmp/billing.json
python scripts/ops/apply_billing.py -i /tmp/billing.json --dry-run
python scripts/ops/apply_billing.py -i /tmp/billing.json
systemctl restart new-api
```

模型的增删改名同理，见 `scripts/ops/README.md`。每一步都可重复执行，线上状态
因此能从 git 复现，而不依赖谁还记得后台点过什么。

## 原始第三方快照（metadata/raw/）

`raw/` 存放**未合并**的第三方抓取快照，供人工比对后决定是否并入 `api/newapi/models.json`：

| 文件 | 来源 | 内容 |
|:---|:---|:---|
| `cheaperinference.json` | `platform.cheaperinference.com/markets` | 模型事实字段（上下文、最大输出、模态、能力标记），**已剔除全部价格字段** |

抓取：`python scripts/model_sync/fetch_cheaperinference.py`（走 `HTTPS_PROXY`，只取首屏内嵌数据）。

`derived` 块由 `fetch_cheaperinference.derive()` 生成，规则只有它一处实现，合并脚本会重新推导而不是直接读快照里的 `derived`：

- `kind` 为 `text` / `decision` 时，`image` 模态只信 `vision` 布尔；`image` / `video` / `retrieval` 仍信 `image-input` token（图生视频、多模态 embedding 的 `vision` 常为 false）
- 输出模态不含 `text` 时丢弃 `structured-output`（站点对图片 / 语音 / 转写模型也一律打了这个 token）
- `context-128k` / `context-1m` 只是尺寸提示，`image-edit` 我方词表暂无对应项，三者都不写入目录

合并：`python scripts/model_sync/merge_cheaperinference.py`（dry-run）→ 确认后 `--write`。

合并前先跑一次对比，确认差异是针对模型事实（context / modalities / capabilities），价格一律不采用。
