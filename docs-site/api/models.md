# Models API：查询可用模型

`GET /v1/models` 返回当前令牌**有权限使用**的模型。价格与分组不在这个接口里，见模型广场。

## 请求

```bash
curl "$BASE_URL/v1/models" -H "Authorization: Bearer $NEW_API_KEY"
```

```python
from openai import OpenAI

client = OpenAI(base_url="https://api.nowhub.org/v1", api_key="sk-...")
for m in client.models.list().data:
    print(m.id)
```

## 响应

```json
{
  "object": "list",
  "data": [
    { "id": "claude-sonnet-5", "object": "model", "owned_by": "anthropic" }
  ]
}
```

## 为什么和模型广场的清单不同？

模型广场列的是**平台已开通**的模型；`/v1/models` 列的是**你这个令牌能用**的模型。差异来自令牌的模型白名单、分组与 IP 白名单。

排查顺序：

1. `GET /v1/models` 里有没有它
2. 模型广场里它属于哪些分组，令牌是不是那个分组
3. 令牌的模型白名单有没有勾上它
