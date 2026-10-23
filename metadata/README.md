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
