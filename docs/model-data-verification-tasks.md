# 模型数据「官方核实」任务单

> 用途：把 NowHub 模型元数据/价格数据中**尚未与厂商官方文档对齐**的项，交给外部调研方（豆包）逐条核实。
> 核实结果由仓库维护者写入 model-data 仓库的 `api/newapi/pricing.official.json` 与 `api/newapi/overrides.json`，
> 再经 `python -m scripts.model_sync.validate` 校验后发布。
> 数据口径：价格单位一律 **USD / 每 1M tokens**；token 上限指**输入**上限。

## 0. 通用规则（必须遵守）

1. **只认官方来源**：厂商定价页 / 模型规格页为准。聚合源（models.dev、OpenRouter）只能作旁证，`confidence` 最多给 `medium`，且不得覆盖官方值。
2. **禁止推算**：不得用"同系列通常是 x 倍"之类比例反推价格；官方没写就填 `null` 并写入 `unresolved`。
3. **必须贴证据**：每条结论给 `source_url` + 原文片段 `quote`（含具体数字）+ 抓取时间 `retrieved_at`（ISO 8601，带时区）。
4. **不改仓库文件**：只输出核实结果（JSON 或表格），由维护者落库，避免与每日自动同步冲突。
5. **区分模型 ID 与显示名**：官方文档里的名称（如 "Claude Haiku 5.5"）不等于 API ID（`claude-haiku-5-5`）。只登记能实际调用的 ID。

## 1. 已核实，无需重复（避免返工）

| 项 | 结论 | 官方依据 |
|:--|:--|:--|
| `claude-haiku-4-5` / `claude-haiku-4-5-20251001` | **真实存在**。前者是 Claude API 别名，解析到后者这个固定快照（2025-10-15 发布）；状态 Active (legacy)。价格 $1/$5、5m 写 $1.25、1h 写 $2、缓存读 $0.10；上下文 200K、最大输出 64K —— 与我方数据完全一致 | https://platform.claude.com/docs/en/models/haiku-4-5/overview ；https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions |
| `claude-haiku-5.5`（带点） | **不是有效模型 ID**，只是文档显示名；官方 ID 为 `claude-haiku-5-5`。已从数据中删除 | https://platform.claude.com/docs/en/models/overview |
| Claude 缓存读取折扣 | Fable 5.1 / Mythos 5.1 = **0.025×** 输入价；Opus 5.5 / Sonnet 5.5 = **0.05×**；其余 = **0.1×**。我方 `cr` 值已按此设置 | https://platform.claude.com/docs/en/about-claude/pricing |
| Claude Haiku 5.5 长上下文 | 官方按 100,000 token 分档，>100K 时输入 $0.50 / 输出 $2.50 / 缓存读 $0.05 / 写入 $0.625（5m）· $1.00（1h） | 同上 |
| `gemini-3-pro-image` / `-preview` token 上限 | 官方模型页：输入 **65,536**、输出 **32,768**；价格表的 >200K 档对本模型不可达，已用 overrides 固化 65,536/32,768 | https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image |
| `gemini-4-argon` 缓存价 | 官方 $0.10（至 2026-11-30）、$0.20（2026-12-01 起），即输入价的 5%，与我方 0.1/2 与 upcoming 一致 | https://ai.google.dev/gemini-api/docs/pricing |

## 2. 待核实任务

> 「当前值」取自 model-data 仓库的 `api/newapi/{models.json,pricing.json}`，核实后请给出建议值。

### T1 `chatgpt-image-latest` 关键字段全空 + 计费分项待校对

- 当前：`context_length=0`、`max_output_tokens=0`、`capabilities=[]`、`tags=""`
- 当前价格字段：`input=5`、`output_text=10`、`output_image=32`、`input_image=8`、`cache_read=1.25`、`cache_read_image=2`
- 需查：① 输入/输出 token 上限；② 能力集合（是否 image_generation / vision / tools）；③ 上述 6 个价格分项与官方"文本输入 / 图像输入 / 缓存读 / 文本输出 / 图像输出"的对应关系；④ 是否支持提示缓存（官方若无缓存折扣，`cache_read` / `cache_read_image` 应为 `null`）
- 官方入口：https://platform.openai.com/docs/models （图片生成模型页 + Pricing）

### T2 `free` 是否为真实模型

- 当前：vendor=`自建渠道`、`context_length=0`、`max_output_tokens=0`、`capabilities=[]`、`description=""`、价格为 0
- 需查：这是某个厂商的可调用模型 ID，还是我方内部占位符？
- 判定：若为占位符 → 建议从目录中排除（加入 `overrides.excluded`）；若真实 → 给官方页与完整字段。

### T3 两个免费模型缺最大输出

| 模型 | 当前 context | 当前 max_output |
|:--|--:|--:|
| `dots-3-note-preview:free` | 524,288 | **0** |
| `inkling:free` | 1,048,576 | **0** |

- 需查：官方/发布方给出的最大输出 token。

### T4 OpenAI 系表达式里的「缓存写入」项是否成立

- 涉及模型：`gpt-5.4`、`gpt-5.5`、`gpt-5.6-luna/sol/terra`、`gpt-6-luna/sol/astra`、`gpt-6.1-sol`
- 当前表达式对缓存写入按 **1.25 × 输入价** 计费（`cc` 项，如 `gpt-6-sol` 的 `+ cc * 2.5`）
- 需查：OpenAI 是否对 **prompt cache 写入**单独收费、并在 usage 中上报 cache write token？
  - 若**不收费/不上报** → 应删除 `cc` 项（当前 token 恒为 0，虽无实际收费，但属误导性配置）
  - 若收费 → 请给出官方倍率与上报字段名
- 官方入口：https://platform.openai.com/docs/guides/prompt-caching 、各模型页 Pricing

### T5 DeepSeek 缓存命中价与时段策略

- 当前 `cr`：`deepseek-flash` = 0.006（2.0%）、`deepseek-v4.1-flash-1017` = 0.006（2.0%）、`deepseek-v4-pro` = 0.044（3.3%）
- 当前时段：表达式把**工作日 09:00–12:00、14:00–18:00（Asia/Shanghai）** 视为原价（peak），其余时间 5 折
- 需查：① 官方「缓存命中」单价（应为输入价的固定比例？）；② 官方优惠时段的**准确区间与时区**

> **2026-10-25 已核实**：官方页明确「北京时间周一至周五（不含法定节假日）9:00-12:00、14:00-18:00 为高峰时段，
> 其余（含周末与节假日）为空闲半价」，与我方表达式一致；缓存命中价 flash ¥0.04 / v4-pro ¥0.30，
> 对应输入未命中的 2% / 3.33%，与我方 0.006 / 0.044 一致，**无需修改**。
- 官方入口：https://api-docs.deepseek.com/quick_start/pricing

### T6 MiniMax 两档缓存价不一致

| 模型 | 当前 `cr` | 占输入价 |
|:--|--:|--:|
| `minimax-m3.1-flash` | 0.015 | 10% |
| `MiniMax-M3` | 0.06 | 20% |

- 需查：两者官方缓存命中价，判断哪个需修正。

### T7 `qwen3.8-flash` 是否需要缓存项

- 当前：`input=0.15`、`output=0.47`，**无 `cr`** → 缓存命中 token 会按输入全价计费
- 需查：官方是否提供上下文缓存及缓存命中价；若有，给出单价与是否默认开启。

### T8 `gpt-oss-120b` 缓存价

- 当前：`input=0.15`、`output=0.60`、`cr=0.075`（50%）
- 需查：官方 cached input 价，确认 50% 是否正确。

### T9 `kimi-k3` 缓存写入价

- 当前：`input=3`、`output=15`、`cr=0.3`（10%）、`cc=3`（1×）、`cc1h=6`（2×）
- 需查：官方 5 分钟 / 1 小时缓存写入价，确认是否等于输入价。

### T10 `grok-4.7` 缓存价

- 当前：`input=2`、`output=6`、`cr=0.5`（25%）
- 需查：官方 cached input 价。

### T11 Gemini 图像模型的「按张」与「按 token」偏差

- `gemini-3.1-flash-image`：当前 `input=0.5`、`output_text=3`、`output_image=60`、`per_image=0.067`
- `gemini-3-pro-image`：当前 `input=2`、`output_text=12`、`output_image=120`、`per_image=0.134`（4K 0.24）
- 我方结算表达式只用 token 变量（`img_o`），按张价仅作展示。官方按分辨率分档收费（0.5K/1K/2K/4K 不同单价）
- 需查：① 各分辨率对应的 token 消耗是否固定（我方按 60/120 USD per 1M image tokens 折算）；② 是否存在官方"按张"上限或最低消费；③ 是否支持 Batch（官方标 5 折）——我方表达式未区分 batch

### T12 `gemini-4-argon` 到期切换

- 当前 `effective_to=2026-11-30`，`upcoming` 已记录 12-01 起：输入 $4、输出 $20、缓存 $0.20
- 需确认：该日期是否有变化；到期后我方表达式需从 `p*2 + c*10 + cr*0.1` 切到 `p*4 + c*20 + cr*0.2`

## 3. 交付格式

每条任务输出一个 JSON 对象（可多条打包成数组）：

```json
{
  "task_id": "T5",
  "model_name": "deepseek-flash",
  "field": "cache_read",
  "current_value": 0.006,
  "official_value": 0.03,
  "unit": "USD / 1M tokens",
  "source_url": "https://api-docs.deepseek.com/quick_start/pricing",
  "quote": "Cache hit: $0.03 per 1M input tokens",
  "retrieved_at": "2026-10-25T10:00:00+08:00",
  "confidence": "high",
  "unresolved": []
}
```

- `official_value` 查不到时填 `null`，并在 `unresolved` 写明查过哪些页面、为何没有结论。
- 一个任务涉及多个字段时，按字段拆成多条（`field` 用 `models.json` / `pricing.json` 的字段名）。
- `quote` 必须是原文（可截断，但要含数字与单位），不要转述。

## 5. 核实结果（2026-10-25，外部核实回填）

| 任务 | 结论 | 落地动作 |
|:--|:--|:--|
| T1 `chatgpt-image-latest` | 官方 **Deprecated**（建议改用 `gpt-image-2.5-sunburst`）；输入 text/image、输出 image/text；价格分项与我方完全一致；官方未公布 token 上限 | 已补 `capabilities=[image_generation,vision]`、`output_modalities=[image,text]`、`tags=已弃用`（写入 overrides 固化） |
| T2 `free` | 无任何厂商收录，判定为内部占位模型 | 已加入 `overrides.excluded`，并从元数据/价格目录/数据库下线 |
| T3 `dots-3-note-preview:free` / `inkling:free` | 官方无公开 max output | 保持 0（已知空缺） |
| T4 OpenAI `cc` 项 | **成立**：缓存写入是独立输入 token 类别（1.25×），非额外加费 | 无需修改 |
| T5 DeepSeek | 高峰时段 **9-12/14-18（北京时间工作日）** 与缓存命中 2% / 3.33% 均与我方一致 | 无需修改；官方抄录补复核记录 |
| T6 MiniMax | 两个值都正确（M3.1-Flash 10%、M3 20%），非同一模型 | 无需修改 |
| T7 `qwen3.8-flash` | 未查到官方缓存单价 | 保持无 `cr`，待补 |
| T8 `gpt-oss-120b` | OpenAI 不托管该模型，价格来自托管方 | 保留 `aggregator_reference`，不视为官方价 |
| T9 `kimi-k3` | 5m 写 = 1× 输入、1h 写 = 2× 输入 | 无需修改 |
| T10 `grok-4.7` | cached input $0.50（25%） | 无需修改 |
| T11 Gemini 图像 | 按张价随分辨率固定映射，无最低收费；Batch 5 折同样适用于图像输出 | 保留 token 表达式，`meters`/notes 记录按张价 |
| T12 `gemini-4-argon` | 2026-12-01 涨价计划未变 | 保留 `upcoming`，到期切换表达式（需排期） |

## 4. 核实完成后的落地流程（维护者执行）

> 以下命令在独立的 **model-data** 仓库根目录执行（2026-10-26 起元数据与价格已拆出本仓库）。

```bash
# 1. 把结论写入官方抄录/覆盖文件
#    pricing.official.json  <- 官方价格（含 quote/retrieved_at/confidence）
#    overrides.json         <- 官方事实字段（context_length / max_output_tokens / capabilities 等）
# 2. 校验
python -m tools.model_sync.validate
# 3. 生成 + 发布（会开 PR）
python -m tools.model_sync.sync_models --only pricing
python -m tools.model_sync.sync_models --only metadata --official
# 4. 部署后核对线上是否与 catalog 一致
python -m tools.model_sync.validate --live /tmp/expr.json
```

> 任何改价都必须先在 model-data 里改 catalog，再按该仓库 README 导出并走 new-api 的 `scripts/ops/apply_billing.py`，**不要直接调用后台接口改库**，否则 `--live` 校验会报漂移。
