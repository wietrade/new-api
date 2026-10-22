# Gemini 协议：generateContent

`POST /v1beta/models/{model}:generateContent`，请求体用 `contents`，角色是 `user` / `model`。

## 最小请求

```bash
curl "$BASE_URL/v1beta/models/gemini-3-flash:generateContent" \
  -H "x-goog-api-key: $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"你好"}]}]}'
```

`Authorization: Bearer` 同样可用。

## 请求结构

| 字段 | 说明 |
| --- | --- |
| `contents` | 消息数组，每条含 `role` 与 `parts` |
| `systemInstruction` | 系统提示，`{ parts: [{ text }] }` |
| `generationConfig` | `temperature`、`maxOutputTokens`、`topP`、`stopSequences`、`responseMimeType` |
| `tools` | `functionDeclarations` 或 `google_search` |

```json
{
  "systemInstruction": { "parts": [{ "text": "你是一个简洁的助手" }] },
  "contents": [{ "role": "user", "parts": [{ "text": "你好" }] }],
  "generationConfig": { "temperature": 0.7, "maxOutputTokens": 1024 }
}
```

## 读取结果

```json
{
  "candidates": [{
    "content": { "parts": [{ "text": "你好！" }] },
    "finishReason": "STOP"
  }],
  "usageMetadata": { "promptTokenCount": 5, "candidatesTokenCount": 4, "totalTokenCount": 9 }
}
```

文本在 `candidates[0].content.parts[*].text`，可能有多段需要拼接。`finishReason` 为 `MAX_TOKENS` 表示截断，`SAFETY` 表示被安全策略拦截。

## 多模态输入

```json
{
  "contents": [{
    "parts": [
      { "text": "描述这张图" },
      { "inlineData": { "mimeType": "image/png", "data": "<base64>" } }
    ]
  }]
}
```

视频、PDF 用 `inlineData` 传 base64，或用 `fileData` 传公网地址（取决于渠道支持）。

## SDK

```python
from google import genai

client = genai.Client(
    api_key="sk-...",
    http_options={"base_url": "https://api.nowhub.org"},
)

print(client.models.generate_content(model="gemini-3-flash", contents="你好").text)
```

## 流式

方法名换成 `streamGenerateContent`：

```bash
curl "$BASE_URL/v1beta/models/gemini-3-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"写一首四行诗"}]}]}'
```
