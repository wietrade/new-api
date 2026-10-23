# 接口兼容性

同一个令牌可以调用多种协议，通常只需要改 `base_url` 和协议对应的 SDK。

## 支持的协议

| 协议 | 端点 | 典型 SDK |
| --- | --- | --- |
| OpenAI Chat Completions | `POST /v1/chat/completions` | `openai` |
| OpenAI Responses | `POST /v1/responses` | `openai` |
| Anthropic Messages | `POST /v1/messages` | `@anthropic-ai/sdk`、`anthropic` |
| Gemini generateContent | `POST /v1beta/models/{model}:generateContent` | `@google/genai` |

具体某个模型支持哪些协议，见模型广场的「API 协议」一栏。

## 鉴权

```http
Authorization: Bearer <TOKEN>
```

Anthropic 格式的端点也接受：

```http
x-api-key: <TOKEN>
```

## OpenAI 兼容

```python
from openai import OpenAI

client = OpenAI(base_url="https://api.nowhub.org/v1", api_key="sk-...")
```

```ts
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: 'https://api.nowhub.org/v1',
  apiKey: 'sk-...',
})
```

::: tip 模型名
`model` 直接填模型广场里的模型名，不要加厂商前缀（除非模型名本身带前缀）。
:::

## Anthropic 兼容

```python
import anthropic

client = anthropic.Anthropic(
    base_url="https://api.nowhub.org",
    api_key="sk-...",
)
```

```ts
import Anthropic from '@anthropic-ai/sdk'

// 注意：Anthropic SDK 的 baseURL 不带 /v1，SDK 会自己拼 /v1/messages
const client = new Anthropic({
  baseURL: 'https://api.nowhub.org',
  apiKey: 'sk-...',
})
```

## Gemini 兼容

```bash
curl "https://api.nowhub.org/v1beta/models/<模型ID>:generateContent" \
  -H "x-goog-api-key: sk-..." \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"你好"}]}]}'
```

## 不支持的能力

以下能力取决于上游渠道，不一定可用，请先在模型广场确认：

- 文件上传与批量任务
- 部分厂商的私有参数（例如 thinking budget）
- 音频、视频输入
- 结构化输出的严格 schema 校验
