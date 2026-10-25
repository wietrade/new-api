# 第三轮核实结果（豆包 → 元数据）

> 交付文件：`verification-round3.json`（73 条，task_id `R3-identity` / `R3-lifecycle` / `R3-context` / `R3-maxout` / `R3-cutoff` / `R3-release` / `R3-legacy` / `R3-cache`）
> 处理日期：2026-10-25　处理人：GitHub Copilot
> 原则不变：只采纳官方原文可引用的值；推断、缺失一律留空。

## 1. 本轮最大收获：12 个 `:free` 模型全部验明身份

任务书要求先判定「官方 ID 还是平台命名」。结论：

| 判定 | 数量 | 模型 |
|:--|--:|:--|
| 官方确有此模型（`platform_only=false`） | 12 | `dots-3-note-preview`、`gemma-4-26b-a4b-it`、`gemma-4-31b-it`、`lfm-2.5-2.6b`、`nemotron-3.5-content-safety/lightning/super-vl`、`laguna-s-2.1`、`laguna-xs-2.1`、`inkling`、`inkling-small`、`xing4.0-29b-a4b` |
| 平台/转售命名（`platform_only=true`） | 1 | `glm-5.3-prime`（智谱官方只有 GLM-5.3 / -Flash / -FlashX / -FlashX-Legal） |

处置：

- 12 个官方开源模型**保留核实队列**，本轮已补到可核实的全部字段；
- `glm-5.3-prime` 在 `overrides.json` 标记 `platform_only: true`，并在 `tags` 加「平台命名」，**永久不再核实**（仍按管理员意愿决定是否上架）。

## 2. 采纳项（7 个字段）

| 模型 | 字段 | 旧值 → 新值 | 依据 |
|:--|:--|:--|:--|
| `lfm-2.5-2.6b:free` | `context_length` | 65536 → **131072** | docs.liquid.ai 规格表「Context Length 131K」 |
| `grok-4.7` | `lifecycle` | 空 → **ga** | docs.x.ai 模型页列于 frontier / Latest 现役 |
| `dots-3-note-preview:free` | `release_date` | 空 → 2026-08-14 | HF `dots-studio/dots3-note-prev`，集合更新时间 |
| `lfm-2.5-2.6b:free` | `release_date` | 空 → 2026-08-04 | Liquid AI 发布记录 |
| `nemotron-3.5-content-safety:free` | `release_date` | 空 → 2026-06-02 | NVIDIA 发布公告 |
| `inkling:free` | `release_date` | 空 → 2026-07-15 | Thinking Machines Lab 发布日 |
| `xing4.0-29b-a4b:free` | `release_date` | 空 → 2026-09-17 | 中国电信星辰发布日 |

同步固化进 `overrides.json`（含依据 note），防止每日同步回滚。

## 3. 未采纳项与原因

| 交付结论 | 未采纳原因 |
|:--|:--|
| `gemini-3-pro-image-preview` → `retired`<br>`gemini-3.1-flash-image-preview` → `retired` | 交付自己写明「官方未单列 Shut down 行，系从现行表中消失判定」= **推断**。按数据确定性原则保持空；如需标 `legacy` 必须有官方下架措辞 |
| `lifecycle = open-weights`（gemma×2、inkling×2、gpt-oss-120b） | 「开源权重」是**分发方式**，不是生命周期，强行塞进 `ga/preview/legacy/...` 会污染枚举语义。改为写入 `tags`「开源权重」供展示，`lifecycle` 保持空 |
| `dots-3-note-preview:free` context → 512000 | 官方写「512K」，而模型卡给出的 SGLang 启动参数是 `--context-length 524288`。现值为 524288（512×1024），与其它「1M=1048576」口径一致，**不改** |
| `gemma-4-26b/31b`、`nemotron-*` 的 context | 交付明确标注「README 未取回，不按同系列估算」→ 保持空/现值 |
| 全部 `max_output_tokens`（12 条 null） | 官方未公布，保持不变 |
| 全部 `knowledge_cutoff`（12 条 null） | 官方未公布，保持不变 |
| `glm-5` lifecycle | 交付结论为 null（官方无 legacy/deprecated 措辞）→ 保持空 |
| `qwen3.8-flash` `cache_read` | null（官方无缓存读单价）→ 保持空 |

## 4. 数据结构上的两个小决定

1. **`tags` 新增两个约定值**（纯展示，不参与同步与计费）：
   - `开源权重`：可自托管，官方无 API 生命周期口径；
   - `平台命名`：聚合/转售平台自造 ID，官方无对应模型。
2. **`overrides.json` 新增 `platform_only: true`**：仅作为治理标记（不进入 `MetadataSyncFields`，不会下发给运行时），用于「不再进入核实队列」的机器可读记录。

## 5. 收口状态

| 字段 | 覆盖 | 剩余 |
|:--|--:|:--|
| `lifecycle` | 36/53 | 17 个空：12 个开源权重模型（官方无 lifecycle 口径，已用 tags 标注）+ 2 个 `*-preview`（无官方下架措辞）+ `glm-5`、`gpt-oss-120b`（同上）+ `glm-5.3-prime`（平台命名） |
| `release_date` | 47/53 | 6 个模型官方未给具体日期 |
| `knowledge_cutoff` | 17/53 | 官方普遍不公布 |
| `context_length` | 50/53 | 3 个 OpenAI 图像模型（官方不公布） |

**结论：核实队列到此收口，不再安排第四轮。** 后续只需在官方发布新模型/改价时增量核对。
