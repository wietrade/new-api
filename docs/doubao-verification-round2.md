# 模型数据核实任务 · 第二轮（生命周期与缺失字段）

> 目标：让目录里的每个字段都能追溯到官方原文。**凡是查不到官方依据的，一律留空**，不要按同系列比例推断。
> 交付格式与规则见文末，与第一轮一致。

## 0. 本轮重点

上一轮已确认价格基本正确（DeepSeek / Kimi / Grok / MiniMax / Gemini / OpenAI 图像计费均无误）。本轮补齐**新引入的生命周期字段**，以及一直空缺的 token 上限与发布日期。

我们已经给元数据加了三个结构化字段：

| 字段 | 含义 | 取值 |
|:--|:--|:--|
| `lifecycle` | 厂商声明的生命周期 | `ga`（正式）/ `preview` / `legacy`（旧款但在售）/ `deprecated`（官方弃用）/ `retired`（已关停）/ 空串（未知） |
| `release_date` | 官方发布日期 | `YYYY-MM-DD`，查不到留空 |
| `knowledge_cutoff` | 官方知识截止 | `YYYY-MM`，查不到留空 |

**判定口径（请严格遵守）**：官方原文写 "current lineup / generally available / 稳定版" → `ga`；写 "preview / 预览" → `preview`；写 "legacy / previous generation / 旧款（仍可用）" → `legacy`；写 "deprecated / 弃用" → `deprecated`；写 "retired / shut down / 已关停" → `retired`。**没有明确措辞就留空，不要推断。**

## 1. 已按官方确定，无需重复（但欢迎复核）

| 模型 | lifecycle | 依据 |
|:--|:--|:--|
| `claude-fable-5-1`、`claude-opus-5-5`、`claude-sonnet-5-5`、`claude-haiku-5-5` | ga | Models overview 的当前阵容表 |
| `claude-fable-5`、`claude-opus-5`、`claude-opus-4-8`、`claude-opus-4.5/4.6/4.7`、`claude-sonnet-5` | legacy | 同页 "Legacy models (still available)" 段 |
| `claude-haiku-4-5`、`claude-haiku-4-5-20251001` | legacy | 模型页 "Status: Active (legacy)"；release 2025-10-15；cutoff 2025-02 |
| `chatgpt-image-latest` | deprecated | OpenAI 模型页 "Status: Deprecated" |
| `gemini-3-pro-image` | ga | Google 模型页版本行「稳定版」 |

## 2. 待核实：`lifecycle` 为空的 38 个模型

请对每个模型给出官方页面的生命周期措辞；看不到措辞就回 `null`。

```
deepseek-flash, deepseek-v4-pro, deepseek-v4.1-flash-1017,
gpt-5.4, gpt-5.5, gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra,
gpt-6-luna, gpt-6-sol, gpt-6-astra, gpt-6.1-sol, gpt-oss-120b,
gpt-image-2.5-sunburst, gpt-image-2.5-sunburst-2026-09-08,
gemini-3-pro-image-preview, gemini-3.1-flash-image, gemini-3.1-flash-image-preview, gemini-4-argon,
glm-5, glm-5.3-prime, kimi-k3, grok-4.7, MiniMax-M3, minimax-m3.1-flash, qwen3.8-flash,
dots-3-note-preview:free, gemma-4-26b-a4b-it:free, gemma-4-31b-it:free,
inkling:free, inkling-small:free, lfm-2.5-2.6b:free,
laguna-s-2.1:free, laguna-xs-2.1:free, xing4.0-29b-a4b:free,
nemotron-3.5-content-safety:free, nemotron-3.5-lightning:free, nemotron-3.5-super-vl:free
```

> 说明：带 `:free` 后缀的是免费模型 ID；如果官方只提供产品名而没有该 ID，请注明"该 ID 为转售/聚合平台命名"。

## 3. 待核实：token 上限缺失

| 模型 | 当前 context | 当前 max_output | 需要什么 |
|:--|--:|--:|:--|
| `chatgpt-image-latest` | 0 | 0 | 官方未公布 → 若确认无公开值，回 `null` |
| `gpt-image-2.5-sunburst` | 0 | 0 | 同上 |
| `gpt-image-2.5-sunburst-2026-09-08` | 0 | 0 | 同上 |
| `dots-3-note-preview:free` | 524288 | 0 | 最大输出 |
| `inkling:free` | 1048576 | 0 | 最大输出 |

## 4. 待核实：发布日期与知识截止

当前 `release_date` 已有 36/53 条（多来自 OpenRouter 的 `created` 时间戳），**缺 17 条**；`knowledge_cutoff` 只有 6/53，**缺 47 条**。

**缺 `release_date` 的 17 个模型**（优先已上线渠道）：

```
deepseek-flash, MiniMax-M3, minimax-m3.1-flash, qwen3.8-flash, grok-4.7,
gpt-image-2.5-sunburst, gpt-image-2.5-sunburst-2026-09-08,
dots-3-note-preview:free, lfm-2.5-2.6b:free, laguna-s-2.1:free, laguna-xs-2.1:free,
inkling:free, inkling-small:free, xing4.0-29b-a4b:free,
nemotron-3.5-content-safety:free, nemotron-3.5-lightning:free, nemotron-3.5-super-vl:free
```

**缺 `knowledge_cutoff` 的 47 个模型**：除已确认的 6 条（Claude 四款 2026-06、haiku-4-5 系列 2025-02）外全部，清单即上表 §2 的 38 个 lifecycle 待核实模型 + Anthropic 旧款 7 个（fable-5 / opus-5 / opus-4.5 / opus-4.6 / opus-4.7 / opus-4-8 / sonnet-5）+ `chatgpt-image-latest` + `gemini-3-pro-image`。

## 5. 上一轮遗留、仍未解决

| 项 | 现状 | 需要什么 |
|:--|:--|:--|
| `qwen3.8-flash` 缓存价 | 无 `cr`（缓存命中按输入全价） | 阿里云百炼「上下文缓存」页的命中单价；若无缓存能力请明确写"不支持" |
| `gpt-oss-120b` 价格来源 | `0.15 / 0.60 / 0.075`，来源是托管方 | 注明具体托管方与页面；官方不定价则该行应标为"非官方价" |
| `chatgpt-image-latest` 按张价 | 已记录 low/medium/high 三档（0.009~0.2），但结算走 token | 确认 Images API 与 token 计费**不会重复计费**的官方说明 |
| `gemini-3-pro-image-preview` | 官方模型列表里已无该 ID（别名 404） | 确认是否仍可调用；不可调用则应下架 |

## 6. 交付格式

```json
[
  {
    "task_id": "R2-lifecycle",
    "model_name": "kimi-k3",
    "field": "lifecycle",
    "current_value": "",
    "official_value": "ga",
    "source_url": "https://platform.moonshot.cn/docs/pricing",
    "quote": "官方原文片段（含状态措辞）",
    "retrieved_at": "2026-10-26T10:00:00+08:00",
    "confidence": "high",
    "unresolved": []
  }
]
```

- `field` 取值范围：`lifecycle`、`release_date`、`knowledge_cutoff`、`context_length`、`max_output_tokens`、`cache_read`。
- 查不到就 `official_value: null` + 在 `unresolved` 写明查了哪些页面。
- 日期格式：`release_date` = `YYYY-MM-DD`；`knowledge_cutoff` = `YYYY-MM`。
- 不要改任何文件，只回结果。
