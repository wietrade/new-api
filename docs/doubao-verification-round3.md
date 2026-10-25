# 模型数据核实任务 · 第三轮（收口轮）

> 本轮目标是**收口**，不是扩大范围。
> 规则：查不到就回 `null` 并注明「已翻过哪些页面」；**不要推断、不要按同系列比例估算**。
> 上一轮（`verification-round2.json`）成果：123 条中 44 条被采纳，其余因「官方无此信息」保持为空。

## 0. 为什么还有一轮

当前 53 个模型里仍有缺口，但性质分两类：

| 类别 | 数量 | 处理方式 |
|:--|--:|:--|
| **A. 可能是平台自造 ID，官方根本没这个模型** | 12 个 `:free` 模型 | 本轮判定身份；若确认为聚合平台命名 → 标记 `platform_only`，**永久不再核实** |
| **B. 官方有页面但我们还没拿到值** | 约 17 个字段 | 本轮补齐 |
| **C. 官方确认不公布** | 图像模型的 token 上限等 | **不再查**，见 §5 |

## 1. 任务 A：12 个 `:free` 模型的身份判定（最高优先级）

请逐个判断：**这个 ID 是厂商官方模型 ID，还是聚合平台（OpenRouter 等）自造的别名？**

```
dots-3-note-preview:free, gemma-4-26b-a4b-it:free, gemma-4-31b-it:free,
lfm-2.5-2.6b:free, nemotron-3.5-content-safety:free, nemotron-3.5-lightning:free,
nemotron-3.5-super-vl:free, laguna-s-2.1:free, laguna-xs-2.1:free,
inkling:free, inkling-small:free, xing4.0-29b-a4b:free
```

对每个模型输出：

- `platform_only`: `true`（官方无此 ID，仅聚合平台命名） / `false`（官方确有该模型）
- 若 `platform_only = false`：再补 `lifecycle`、`release_date`、`context_length`、`max_output_tokens`、`knowledge_cutoff`
- 若 `platform_only = true`：只需给出**判断依据**（例如"官方模型列表无此 ID，OpenRouter 页面标注为第三方提供"），其余字段留 `null`

> 说明：`:free` 后缀本身是我方命名约定，不代表厂商有免费版本；重点看**去掉 `:free` 后的 ID** 在官方是否存在。

## 2. 任务 B：预览版与正式版的取代关系

| 模型 | 需要回答 |
|:--|:--|
| `gemini-3-pro-image-preview` | `gemini-3-pro-image` 转正后，这个 preview 是否仍可调用？官方是否标注为 legacy/已停用？ |
| `gemini-3.1-flash-image-preview` | 同上，相对 `gemini-3.1-flash-image` |

输出 `lifecycle`（`preview` / `legacy` / `retired` / `null`）+ 官方原文措辞。

## 3. 任务 C：剩余 lifecycle（4 个）

| 模型 | 官方页 | 需要什么 |
|:--|:--|:--|
| `grok-4.7` | docs.x.ai | 是否为当前主力（现役）？页面有无 lifecycle/版本措辞 |
| `glm-5` | docs.bigmodel.cn | 是否已被 GLM-5.3 取代（旧款）？ |
| `glm-5.3-prime` | docs.bigmodel.cn | 现役还是预览？ |
| `gpt-oss-120b` | developers.openai.com | 开源权重的定位（现役/历史版本） |

## 4. 任务 D：剩余 token 上限与价格

| 模型 | 字段 | 说明 |
|:--|:--|:--|
| `dots-3-note-preview:free` | `max_output_tokens` | 官方模型卡 |
| `inkling:free` | `max_output_tokens` | 官方模型卡 |
| `qwen3.8-flash` | `cache_read`（缓存读取单价） | 阿里云百炼计费页；第一轮遗留项 |

## 5. 明确「不要再查」的事项（请勿重复）

这些已确认官方不公布，保持为空即可：

- `chatgpt-image-latest`、`gpt-image-2.5-sunburst`、`gpt-image-2.5-sunburst-2026-09-08` 的 `context_length` / `max_output_tokens`（OpenAI 图像模型页无 token 上限）
- Anthropic 旧款（fable-5 / opus-5 / opus-4.5 / 4.6 / 4.7 / 4-8 / sonnet-5）的 `knowledge_cutoff` —— **除非**官方页面明确有 "training data cut-off" 字段，否则直接 `null`
- DeepSeek / Kimi / MiniMax / Qwen / GLM 的 `knowledge_cutoff` —— 同上，官方未公布即 `null`，不要从第三方博客抄

## 6. 交付格式

```json
[
  {
    "task_id": "R3-identity",
    "model_name": "gemma-4-26b-a4b-it:free",
    "field": "identity",
    "platform_only": false,
    "official_value": null,
    "source_url": "https://ai.google.dev/gemma/docs/...",
    "quote": "官方页原句（必须逐字，不要转述）",
    "pages_checked": ["https://...", "https://..."],
    "retrieved_at": "2026-10-25T18:00:00+08:00",
    "confidence": "high",
    "notes": "官方 ID 为 gemma-4-26b-a4b-it，:free 为我方后缀"
  },
  {
    "task_id": "R3-lifecycle",
    "model_name": "grok-4.7",
    "field": "lifecycle",
    "official_value": "ga",
    "source_url": "https://docs.x.ai/docs/models",
    "quote": "页面原文",
    "pages_checked": ["https://docs.x.ai/docs/models"],
    "retrieved_at": "2026-10-25T18:00:00+08:00",
    "confidence": "high",
    "notes": ""
  }
]
```

约束：

- `field` 取值：`identity`、`lifecycle`、`release_date`、`knowledge_cutoff`、`context_length`、`max_output_tokens`、`cache_read`
- `quote` 必须是官方页面**原文**（可截断，但不得改写）；找不到原文就填 `null`
- `pages_checked` 必填：证明确实翻过，避免下一轮重复劳动
- `platform_only = true` 的模型不再进入后续核实队列

## 7. 本轮结束后的预期状态

- `:free` 模型：全部有明确身份标注（官方 or 平台命名），不再悬空
- 预览版：明确是否被正式版取代
- lifecycle 空缺：应从 18 个降到 ≤ 6 个（剩余都是 `platform_only`）
- 之后**不再安排第四轮**——剩余空值统一视为「官方未公布」，由展示层如实呈现
