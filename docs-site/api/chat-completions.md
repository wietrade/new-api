# OpenAI 兼容：Chat Completions

`POST /v1/chat/completions` 是最通用的通道，OpenAI SDK 与绝大多数第三方工具默认走这里。

## 最小请求

```bash
curl "$BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 请求字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 必填，模型广场里的完整模型 ID |
| `messages` | array | 必填，`role` 为 `system` / `user` / `assistant` / `tool` |
| `temperature` | number | 0–2，越低越稳定 |
| `top_p` | number | 0–1，核采样 |
| `max_tokens` | integer | 输出上限；不填则用模型默认值 |
| `stream` | boolean | `true` 时用 SSE 逐块返回 |
| `stop` | string / array | 最多 4 个停止词 |
| `tools` | array | 函数调用声明，见[函数调用](/api/function-calling) |
| `tool_choice` | string | `auto` / `none` / `required` 或具体函数名 |
| `response_format` | object | 强制 JSON 输出（模型需支持） |

不同模型支持的可选参数不同，模型广场「支持的参数」一栏是实际列表；不支持的参数会被忽略或返回 400。

## 响应结构

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "你好！" },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 12, "completion_tokens": 5, "total_tokens": 17 }
}
```

`usage` 是计费依据。`finish_reason` 为 `length` 表示被 `max_tokens` 截断，为 `tool_calls` 表示模型要调用函数。

## 流式输出

```python
from openai import OpenAI

client = OpenAI(base_url="https://api.nowhub.org/v1", api_key="sk-...")

stream = client.chat.completions.create(
    model="claude-sonnet-5",
    messages=[{"role": "user", "content": "写一首四行诗"}],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
```

::: tip 流式注意
- 用 `curl` 调试加 `-N`，否则看不到逐块输出
- 客户端断开后上游可能仍在生成并计费，长任务请设置超时与取消
:::

## 常见错误

| 现象 | 原因 |
| --- | --- |
| 400 `model is required` | 忘了传 `model` |
| 404 | 路径缺 `/v1`，或模型名不存在 |
| 401 | 没带 `Authorization`，或 Key 失效 |
| 403 | 模型不在令牌白名单 / 分组 |
| 429 | 撞了 RPM / TPM / RPD，见[速率限制](/guide/rate-limits) |
