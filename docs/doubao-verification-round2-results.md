# 第二轮核实结果（豆包 → 元数据）

> 交付文件：`verification-round2.json`（123 条，task_id `R2-lifecycle` / `R2-limits` / `R2-release` / `R2-cutoff` / `R2-cache`）
> 处理日期：2026-10-25　处理人：GitHub Copilot
> 原则：只采纳「官方原文可引用」的值；`official_value = null` 或仅有推断的一律留空，不按同系列比例推算。

## 1. 采纳与落库情况

共采纳 **44 项**（23 个模型），已写入：

- `metadata/api/newapi/models.json`（立即生效）
- `metadata/api/newapi/overrides.json`（固化为人工核对值，防止每日同步被 OpenRouter 的 `created` 时间戳回滚）

### 1.1 lifecycle（16 项，全部为 `ga`）

| 模型 | 依据 |
|:--|:--|
| `gemini-4-argon` | Google 模型页卡片 `Stable` + 单页 Versions `Stable: gemini-4-argon` |
| `gemini-3.1-flash-image` | 同上，`Stable: gemini-3.1-flash-image` |
| `deepseek-flash`、`deepseek-v4-pro`、`deepseek-v4.1-flash-1017` | DeepSeek 更新日志「正式版已上线」「列于当前模型阵容」 |
| `kimi-k3` | 「K3 正式通过开放平台 API 提供」（medium，措辞明确故采纳） |
| `MiniMax-M3`、`minimax-m3.1-flash` | MiniMax 发布记录「正式发布」 |
| `qwen3.8-flash` | 阿里云「模型大全」列为当前在架模型，无 preview/deprecated 标注（medium） |
| `gpt-5.4`、`gpt-5.5`、`gpt-5.6-luna/sol/terra`、`gpt-6-luna/sol/astra`、`gpt-6.1-sol` | OpenAI 模型页为现役生产模型、有公开定价、为默认快照（medium，属「current lineup → ga」口径） |
| `gpt-image-2.5-sunburst`、`gpt-image-2.5-sunburst-2026-09-08` | OpenAI 图像模型页现役，端点 Supported（medium） |

### 1.2 token 上限

| 模型 | 字段 | 旧值 | 新值 | 依据 |
|:--|:--|--:|--:|:--|
| `deepseek-flash` | context | 1048576 | 1000000 | 官方规格「上下文窗口 1M」 |
| `deepseek-flash` | max_output | 393216 | 384000 | 官方规格「最大输出 384K（384,000）」 |
| `deepseek-v4-pro` | context | 1048576 | 1000000 | 同上 |
| `deepseek-v4-pro` | max_output | 393216（已是 384000，未变） | 384000 | 同上 |
| `deepseek-v4.1-flash-1017` | context / max_output | 1048576 / 393216 | 1000000 / 384000 | 与 `deepseek-flash` 是同一模型版本（V4.1-Flash-1017），套用同一官方规格 |
| `gemini-4-argon` | context | 0 | 1048576 | 「1,048,576」 |
| `kimi-k3` | context | 0 | 1048576 | 「1M token 上下文」 |
| `grok-4.7` | context | 0 | 500000 | x.ai 模型页「500,000 tokens」 |
| `gpt-oss-120b` | context | 0 | 131072 | OpenAI 模型页「131,072 context window」 |
| `gpt-oss-120b` | max_output | 65536 | 131072 | 同页「131,072 max output tokens」（已复核原页） |

### 1.3 release_date（关键修正）

| 模型 | 旧值 | 新值 | 依据 |
|:--|:--|:--|:--|
| `deepseek-v4-pro` | 2026-04-24 | **2026-08-13** | 更新日志 2026-08-13 + 模型版本 `V4-Pro-0813`（旧值来自 OpenRouter `created`，错误） |
| `glm-5` | 2026-02-11 | 2026-02-12 | 智谱发布记录 |
| `gpt-5.5` | 2026-04-24 | 2026-04-23 | 默认快照 `gpt-5.5-2026-04-23`（medium） |
| `deepseek-flash` | 空 | 2026-09-10 | 更新日志「DeepSeek-V4.1-Flash 发布」 |
| `deepseek-v4.1-flash-1017` | 2026-10-17（已有） | 不变 | 同页确认 |
| `MiniMax-M3` / `minimax-m3.1-flash` | 空 | 2026-06-01 / 2026-10-19 | MiniMax 发布记录 |
| `qwen3.8-flash` | 空 | 2026-08-26 | 阿里云新模型发布页 |
| `gpt-image-2.5-sunburst(-2026-09-08)` | 空 | 2026-09-08 | 快照 ID 内含日期 |

### 1.4 knowledge_cutoff（7 项）

| 模型 | 新值 | 依据 |
|:--|:--|:--|
| `gpt-5.4` | 2025-08 | Aug 31, 2025 |
| `gpt-5.5` | 2025-12 | Dec 01, 2025 |
| `gpt-5.6-luna/sol/terra` | 2026-02 | Feb 16, 2026 |
| `gpt-6-luna` | 2026-05 | May 18, 2026 |
| `gpt-6-sol`、`gpt-6-astra`、`gpt-6.1-sol` | 2026-04 | Apr 20 / 30, 2026 |
| `grok-4.7` | 2026-05 | x.ai「knowledge cut-off date of Grok 4.7 is May 2026」 |
| `gpt-oss-120b` | 2024-06 | Jun 01, 2024（本次由我复核原页面补充，豆包未覆盖） |

## 2. 未采纳（保持为空）

| 字段 | 数量 | 原因 |
|:--|--:|:--|
| `lifecycle` | 17 | 官方页无 lifecycle 措辞：`gemini-3-pro-image-preview`、`gemini-3.1-flash-image-preview`、`grok-4.7`、`glm-5`、`glm-5.3-prime`、gemma / nemotron / dots / inkling / lfm / laguna / xing 等 `:free` 模型 |
| `release_date` | 11 | 官方仅给到月份：`gemini-4-argon`（Latest update October 2026）、`gemini-3.1-flash-image`、`grok-4.7`、`kimi-k3`、全部 gpt-5.6 / gpt-6 系列 |
| `knowledge_cutoff` | 18 | 官方未公布：全部 DeepSeek、Kimi、GLM、Gemini 图像、Anthropic 旧款、`chatgpt-image-latest` |
| `context_length` / `max_output_tokens` | 3 / 5 | 图像模型官方未公布 token 上限 |
| `cache_read` | 1 | `qwen3.8-flash` 无官方缓存单价 |

## 3. 复核记录（我抽查的原页）

| 页面 | 结论 |
|:--|:--|
| `api-docs.deepseek.com/quick_start/pricing` | 上下文 1M、最大输出 384K、模型版本 `V4-Pro-0813`，与交付一致 |
| `docs.x.ai/docs/models` | `grok-4.7` 500k 上下文；知识截止 May 2026 |
| `developers.openai.com/api/docs/models/gpt-5.6-luna.md` | 1,050,000 上下文、128,000 输出、Feb 16 2026 cutoff |
| `developers.openai.com/api/docs/models/gpt-6-astra.md` | Apr 30 2026 cutoff |
| `developers.openai.com/api/docs/models/gpt-oss-120b` | 131,072 上下文 / 131,072 输出 / Jun 01 2024 cutoff |
| `developers.openai.com/api/docs/models/gpt-image-2.5-sunburst.md` | 快照 `gpt-image-2.5-sunburst-2026-09-08`，未公布 token 上限 |

## 4. 仍未闭环（留待第三轮）

1. `gpt-image-2.5-sunburst` 系列、`chatgpt-image-latest` 的 token 上限：官方确认「未公布」，保持 0 即可，无需再查。
2. `dots-3-note-preview:free`、`inkling:free` 的 `max_output_tokens`：需找模型卡原文。
3. `qwen3.8-flash` 的缓存读单价（上一轮遗留）。
4. `gemini-3-pro-image-preview` / `gemini-3.1-flash-image-preview` 是否已被正式版取代（是否应标 `legacy`）。
5. 免费模型（`:free` 后缀）的 lifecycle 归属：这批 ID 多为聚合平台命名，需先确认是否有官方对应物。
