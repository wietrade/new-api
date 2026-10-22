# Claude 协议：Anthropic Messages

`POST /v1/messages` 是 Anthropic 原生格式：`system` 是顶层字段，`content` 用 block 数组表达。

## 最小请求

```bash
curl "$BASE_URL/v1/messages" \
  -H "x-api-key: $NEW_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<模型ID>",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

`Authorization: Bearer $NEW_API_KEY` 同样可用，两种头二选一。

## 与 OpenAI 格式的差异

| 项目 | OpenAI Chat | Anthropic Messages |
| --- | --- | --- |
| 系统提示 | `messages` 里 `role: system` | 顶层 `system` 字段 |
| 输出上限 | `max_tokens` 可选 | `max_tokens` **必填** |
| 内容格式 | `content` 字符串 | 字符串或 block 数组 |
| 必带头 | 无 | `anthropic-version` |
| 停止原因 | `finish_reason` | `stop_reason` |

## 内容块

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "这张图里是什么？" },
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "..." } }
  ]
}
```

## SDK

```python
import anthropic

client = anthropic.Anthropic(
    base_url="https://api.nowhub.org",   # 不要带 /v1
    api_key="sk-...",
)

msg = client.messages.create(
    model="<模型ID>",
    max_tokens=1024,
    system="你是一个简洁的助手",
    messages=[{"role": "user", "content": "你好"}],
)
print(msg.content[0].text)
```

## 流式

```python
with client.messages.stream(
    model="<模型ID>",
    max_tokens=1024,
    messages=[{"role": "user", "content": "写一段 100 字的介绍"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

## 响应要点

```json
{
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "..." }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 12, "output_tokens": 5 }
}
```

`stop_reason` 为 `max_tokens` 表示截断；`usage` 中的 `cache_read_input_tokens` / `cache_creation_input_tokens` 表示命中或写入提示词缓存，按对应单价计费。
