# 快速开始

## 1. 创建令牌

登录控制台，进入「令牌」页面新建一个 API Key。创建时可以限定：

- 可用模型
- 可用分组
- IP 白名单
- 过期时间与额度上限

创建后只会显示一次完整 Key，请立即保存。

## 2. 设置基地址

下面所有示例都使用一个变量，替换成你自己的域名即可：

```bash
export BASE_URL="https://你的域名"
export NEW_API_KEY="sk-..."
```

::: tip 关于路径
基地址**不带** `/v1`。OpenAI 兼容接口是 `/v1/chat/completions`，Anthropic 兼容接口是 `/v1/messages`，Gemini 兼容接口是 `/v1beta/models/<model>:generateContent`。
:::

## 3. 发第一个请求

::: code-group

```bash [cURL]
curl "$BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "messages": [
      { "role": "user", "content": "用一句话解释什么是 TCP" }
    ]
  }'
```

```python [Python]
import os

from openai import OpenAI

client = OpenAI(
    base_url=f"{os.environ['BASE_URL']}/v1",
    api_key=os.environ["NEW_API_KEY"],
)

resp = client.chat.completions.create(
    model="claude-sonnet-5",
    messages=[{"role": "user", "content": "用一句话解释什么是 TCP"}],
)
print(resp.choices[0].message.content)
```

```ts [TypeScript]
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: `${process.env.BASE_URL}/v1`,
  apiKey: process.env.NEW_API_KEY,
})

const resp = await client.chat.completions.create({
  model: 'claude-sonnet-5',
  messages: [{ role: 'user', content: '用一句话解释什么是 TCP' }],
})
console.log(resp.choices[0]?.message.content)
```

:::

## 4. 流式返回

在请求体里加 `"stream": true`，服务端用 SSE 逐块返回：

```bash
curl -N "$BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "stream": true,
    "messages": [{ "role": "user", "content": "写一首四行诗" }]
  }'
```

## 5. 确认可用模型

```bash
curl "$BASE_URL/v1/models" -H "Authorization: Bearer $NEW_API_KEY"
```

返回值只包含你这个令牌有权限使用的模型；完整清单、分组与实时价格见[模型广场](/guide/models-and-groups)。
