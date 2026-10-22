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
| `capabilities` | string[] | **结构化能力**（闭集，见下），参与筛选 |
| `context_length` | int | **上下文窗口（输入 token 数）**，如 `1100000` |
| `max_output_tokens` | int | 最大输出 token 数；0 表示未知 |
| `endpoints` | null / array / object | 显式协议端点；`null` 表示按渠道类型推断 |
| `name_rule` | int | 0=精确匹配，1=前缀，2=后缀，3=包含 |
| `status` | int | 1=上架，0=下架 |

## capabilities 枚举（闭集）

| key | 含义 |
|:---|:---|
| `chat` | 对话 |
| `reasoning` | 推理 |
| `tools` | 工具 / 函数调用 |
| `vision` | 图像理解（多模态输入） |
| `files` | 文件 / 文档 |
| `audio` | 音频 |
| `image_generation` | 图像生成 |
| `video_generation` | 视频生成 |
| `embedding` | 向量 |
| `rerank` | 重排 |
| `web_search` | 联网搜索 |
| `code_interpreter` | 代码执行 |

> 该枚举需三处保持一致：
> `model/model_metadata_sync.go: MetadataCapabilityVocabulary`、
> `web/src/features/pricing/constants.ts: MODEL_CAPABILITIES`、
> 本文件。新增能力时同步修改，否则同步会报 `unsupported model capability`。

## 注意

- 同步只覆盖 `sync_official=1` 的模型；手工改过的（`sync_official=0`）不会被覆盖
- 同步按字段比对：预览里 upstream 为空/0 的字段不要勾选，否则会把本地值清空
- `tags` 不再承载上下文长度；`1M` / `200K` 这类信息必须写进 `context_length`
- `max_output_tokens` 必须 ≤ `context_length`（双方都非 0 时校验）
