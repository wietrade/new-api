# max_tokens 与截断

`max_tokens` 限制的是**输出**长度，不包含输入。

## 各协议的字段

| 协议 | 字段 | 是否必填 |
| --- | --- | --- |
| OpenAI Chat Completions | `max_tokens`（新模型也接受 `max_completion_tokens`） | 否 |
| OpenAI Responses | `max_output_tokens` | 否 |
| Anthropic Messages | `max_tokens` | **是** |
| Gemini | `generationConfig.maxOutputTokens` | 否 |

## 怎么判断被截断

- OpenAI：`finish_reason` = `length`
- Anthropic：`stop_reason` = `max_tokens`
- Gemini：`finishReason` = `MAX_TOKENS`

## 设多少合适

- 对话：512–2048
- 长文写作：4096–8192
- 代码生成：与文件规模同量级，宁大勿小

设得太小会让模型「话说一半」，尤其推理模型会在中途被切断，表现为答案不完整但没有任何报错。

## 和计费的关系

`max_tokens` 只影响上限，实际扣费按真实输出 token 数计算；但它会影响**预扣**额度，设得过大可能触发额度不足。
