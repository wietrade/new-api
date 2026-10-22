# 函数调用（Tool Calling）

三家协议的写法不同，但思路一致：先声明工具，模型返回要调用的函数与参数，你执行后再把结果回传。

## OpenAI Chat Completions

```json
{
  "model": "<模型ID>",
  "messages": [{ "role": "user", "content": "北京现在几点？" }],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_time",
      "description": "查询指定城市的当前时间",
      "parameters": {
        "type": "object",
        "properties": { "city": { "type": "string" } },
        "required": ["city"]
      }
    }
  }]
}
```

模型返回 `finish_reason: tool_calls`：

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_1",
        "type": "function",
        "function": { "name": "get_time", "arguments": "{\"city\":\"北京\"}" }
      }]
    }
  }]
}
```

你把结果作为 `role: tool` 的消息回传，`tool_call_id` 必须对应：

```json
{ "role": "tool", "tool_call_id": "call_1", "content": "14:30" }
```

## Anthropic Messages

工具定义用顶层 `tools`（含 `input_schema`），结果以 `user` 消息里的 `tool_result` block 回传：

```json
{
  "role": "user",
  "content": [{
    "type": "tool_result",
    "tool_use_id": "toolu_1",
    "content": "14:30"
  }]
}
```

## Gemini

工具声明用 `tools: [{ functionDeclarations: [...] }]`，结果以 `functionResponse` part 回传：

```json
{
  "role": "user",
  "parts": [{ "functionResponse": { "name": "get_time", "response": { "result": "14:30" } } }]
}
```

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 模型不调用工具 | 模型不支持，或 `tool_choice` 设为 `none` |
| 参数解析失败 | `arguments` 是 JSON **字符串**，需要先 `json.loads` |
| 404 / 400 | 该模型不支持工具调用，换模型或改用纯文本 |

模型广场「能力」一栏标注了是否支持工具调用。
