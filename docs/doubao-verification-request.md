# NowHub 模型数据核实任务（官方来源）

## 背景

我们维护一份对外展示的 AI 模型目录（当前 52 个模型），包含：上下文长度、最大输出 token、能力标签、输入/输出模态、价格（**USD / 每 1M tokens**）、以及计费表达式（如 `p * 2 + c * 10 + cr * 0.1`，其中 `p` 输入、`c` 输出、`cr` 缓存读、`cc` 5 分钟缓存写、`cc1h` 1 小时缓存写、`img` 图片输入、`img_o` 图片输出）。

下面 12 项数据尚未与厂商官方文档对齐，需要你逐条核实。

## 规则（请严格遵守）

1. **只认官方来源**：厂商定价页 / 模型规格页。聚合站（models.dev、OpenRouter 等）只能作旁证，`confidence` 最高给 `medium`，且不得覆盖官方值。
2. **禁止推算**：不要用"同系列通常是多少倍"反推价格。官方没写就填 `null`，并在 `unresolved` 说明。
3. **必须贴证据**：每条结论都要给 `source_url` + 原文片段 `quote`（需含具体数字与单位）+ 抓取时间 `retrieved_at`。
4. **区分模型 ID 与显示名**：文档里的产品名（如 "Claude Haiku 5.5"）不等于 API ID（`claude-haiku-5-5`）。只登记能实际调用的 ID。
5. **不要修改任何文件**，只输出核实结果。

## 已核实，请勿重复

| 项 | 结论 |
|:--|:--|
| `claude-haiku-4-5` / `claude-haiku-4-5-20251001` | 真实存在。前者是别名，解析到后者快照（2025-10-15 发布，Active (legacy)）；200K 上下文 / 64K 输出；$1 输入、$5 输出、5m 写 $1.25、1h 写 $2、缓存读 $0.10 |
| `claude-haiku-5.5`（带点） | 不是有效模型 ID，仅为显示名；官方 ID 是 `claude-haiku-5-5` |
| Claude 缓存读取折扣 | Fable 5.1 / Mythos 5.1 = 0.025× 输入价；Opus 5.5 / Sonnet 5.5 = 0.05×；其余 0.1× |
| `gemini-3-pro-image` / `-preview` | 输入上限 65,536、输出上限 32,768；价格表 >200K 档不可达 |
| `gemini-4-argon` 缓存价 | $0.10（至 2026-11-30），2026-12-01 起 $0.20，均为输入价的 5% |

---

## T1 `chatgpt-image-latest`：关键字段全空 + 计费分项待校对

**现状**：`context_length = 0`、`max_output_tokens = 0`、`capabilities = []`、`tags = ""`。
当前价格分项：文本输入 `5`、文本输出 `10`、图像输出 `32`、图像输入 `8`、缓存读 `1.25`、图像缓存读 `2`。

**需要确认**：
1. 输入 token 上限、输出 token 上限；
2. 能力集合（是否 `image_generation` / `vision` / `tools`）；
3. 上述 6 个价格分项与官方「文本输入 / 图像输入 / 缓存读 / 文本输出 / 图像输出」的对应关系；
4. 是否支持 prompt caching（若官方无缓存折扣，则 `cache_read` 与图像缓存读应为 `null`）。

**官方入口**：https://platform.openai.com/docs/models

## T2 `free`：是否为真实模型

**现状**：供应商 = 自建渠道，`context_length = 0`，`max_output_tokens = 0`，`capabilities = []`，`description = ""`，价格全 0。

**需要确认**：这是某个厂商的可调用模型 ID，还是我们内部的占位符？
**判定标准**：若能找到官方模型页 → 给出完整字段；若确认不是真实模型 → 结论写「非真实模型，建议移除」。

## T3 两个免费模型缺最大输出

| 模型 | 当前上下文 | 当前最大输出 |
|:--|--:|--:|
| `dots-3-note-preview:free` | 524,288 | **0（缺失）** |
| `inkling:free` | 1,048,576 | **0（缺失）** |

**需要确认**：官方/发布方给出的最大输出 token。

## T4 OpenAI 系表达式里的「缓存写入」项是否成立

**涉及模型**：`gpt-5.4`、`gpt-5.5`、`gpt-5.6-luna`、`gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-6-luna`、`gpt-6-sol`、`gpt-6-astra`、`gpt-6.1-sol`。
**现状**：表达式按 **1.25 × 输入价** 对「缓存写入」计费（`cc` 项，例：`gpt-6-sol` → `+ cc * 2.5`）。

**需要确认**：OpenAI 是否对 **prompt cache 写入**单独收费，并在 usage 中上报 cache write token？
- 若不收费 / 不上报 → 应删除 `cc` 项；
- 若收费 → 给出官方倍率与 usage 字段名。

**官方入口**：https://platform.openai.com/docs/guides/prompt-caching

## T5 DeepSeek：缓存命中价与优惠时段

**现状**：
- 缓存读：`deepseek-flash` = 0.006（输入价 0.3 的 2.0%）、`deepseek-v4.1-flash-1017` = 0.006（2.0%）、`deepseek-v4-pro` = 0.044（输入价 1.32 的 3.3%）；
- 时段：把**工作日 09:00–12:00、14:00–18:00（北京时间）**视为原价，其余时间 5 折。

**需要确认**：
1. 官方「缓存命中」单价（是否为输入价的固定比例？具体数值）；
2. 官方优惠时段的**准确区间与时区**（公开资料为 00:30–08:30 北京时间折扣），与我们自定义的时段不一致，请确认应以哪套为准。

**官方入口**：https://api-docs.deepseek.com/quick_start/pricing

## T6 MiniMax：两个模型的缓存价不一致

| 模型 | 当前缓存读 | 占输入价 |
|:--|--:|--:|
| `minimax-m3.1-flash` | 0.015 | 10% |
| `MiniMax-M3` | 0.06 | 20% |

**需要确认**：两者官方缓存命中价分别是多少，哪一个是错的。

## T7 `qwen3.8-flash`：是否需要缓存项

**现状**：输入 0.15、输出 0.47，**无缓存读价** → 缓存命中 token 会按输入全价计费。
**需要确认**：官方是否提供上下文缓存及其命中价；若有，写明单价与是否默认开启。

## T8 `gpt-oss-120b`：缓存价

**现状**：输入 0.15、输出 0.60、缓存读 0.075（输入的 50%）。
**需要确认**：官方 cached input 价，50% 是否正确。

## T9 `kimi-k3`：缓存写入价

**现状**：输入 3、输出 15、缓存读 0.3（10%）、5 分钟写入 3（1× 输入价）、1 小时写入 6（2× 输入价）。
**需要确认**：官方 5 分钟 / 1 小时缓存写入价，是否与输入价同价或存在倍率。

## T10 `grok-4.7`：缓存价

**现状**：输入 2、输出 6、缓存读 0.5（25%）。
**需要确认**：官方 cached input 价。

## T11 Gemini 图像模型：按张价与按 token 价的偏差

**现状**：

| 模型 | 输入 | 文本输出 | 图像输出（每 1M image tokens） | 展示用按张价 |
|:--|--:|--:|--:|:--|
| `gemini-3.1-flash-image` | 0.50 | 3 | 60 | 0.067 / 张（1K） |
| `gemini-3-pro-image` | 2.00 | 12 | 120 | 0.134 / 张（1K-2K）、0.24 / 张（4K） |

**需要确认**：
1. 各分辨率（0.5K/1K/2K/4K）对应的 token 消耗是否固定（我们按 60 / 120 USD per 1M image tokens 折算）；
2. 是否存在「按张」的最低收费或上限；
3. Batch 档（官方标 5 折）是否适用于图片输出 —— 我们目前未区分 batch。

## T12 `gemini-4-argon`：到期切换

**现状**：当前记录 `effective_to = 2026-11-30`，`upcoming` 记录 2026-12-01 起：输入 4、输出 20、缓存读 0.20；当前表达式仍是 `p*2 + c*10 + cr*0.1`。

**需要确认**：该涨价日期与价格是否仍然有效，是否有延期或调整。

---

## 交付格式

每个字段一条 JSON，可合并为数组：

```json
[
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
]
```

- `field` 用我方字段名：`context_length`、`max_output_tokens`、`capabilities`、`tags`、`input`、`output`、`output_text`、`output_image`、`input_image`、`cache_read`、`cache_write`、`cache_write_1h`。
- 查不到时 `official_value` 填 `null`，并在 `unresolved` 写清"查了哪些页面、为什么没有结论"。
- 一个任务涉及多个字段时拆成多条。
- `quote` 必须是原文（可截断，但必须包含数字与单位），不要转述或翻译后再引用。
