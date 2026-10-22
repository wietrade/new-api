---
layout: home

hero:
  name: NowHub API
  text: 一个 API 接入主流大模型
  tagline: 兼容 OpenAI / Anthropic / Gemini 协议，按 token 计费，价格透明。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quick-start
    - theme: alt
      text: API 参考
      link: /api/chat-completions
---

## 热门入口

<div class="entry-grid">

<a class="entry" href="/docs/api/chat-completions.html">
  <strong>OpenAI 协议</strong>
  <span>Chat Completions 的请求格式、参数与响应字段</span>
</a>

<a class="entry" href="/docs/api/messages.html">
  <strong>Claude 协议</strong>
  <span>Anthropic Messages：认证头、content 结构与流式</span>
</a>

<a class="entry" href="/docs/api/gemini.html">
  <strong>Gemini 协议</strong>
  <span>原生 generateContent 与 Google Gen AI SDK</span>
</a>

<a class="entry" href="/docs/tools/claude-code.html">
  <strong>Claude Code 接入</strong>
  <span>改 settings.json，用中转站跑 Claude Code</span>
</a>

<a class="entry" href="/docs/tools/codex-cli.html">
  <strong>Codex CLI 接入</strong>
  <span>config.toml 自定义 provider，走 Responses 接口</span>
</a>

<a class="entry" href="/pricing" target="_blank">
  <strong>模型与价格</strong>
  <span>在线模型、分组倍率与实时单价</span>
</a>

</div>

## 关键信息

| 项目 | 内容 |
| --- | --- |
| API 域名 | `https://api.nowhub.org`（OpenAI SDK 用 `https://api.nowhub.org/v1`） |
| 文档站 | `https://nowhub.org/docs/` |
| OpenAI SDK Base URL | `https://api.nowhub.org/v1` |
| Anthropic SDK Base URL | `https://api.nowhub.org`（SDK 自己拼 `/v1/messages`） |
| 支持的协议 | OpenAI 兼容、Anthropic Messages、Gemini 原生 |
| 鉴权 | `Authorization: Bearer <TOKEN>`；Anthropic 端点也接受 `x-api-key` |
| 计费 | 预付额度，按 token 或按次扣费，见[定价与计费](/guide/pricing) |

## 三步接通

1. **创建令牌**：控制台 → 令牌 → 新建，限定模型 / 分组 / IP / 过期时间。
2. **选模型**：在模型广场确认模型 ID 与所属分组。
3. **发请求**：

```bash
export BASE_URL="https://api.nowhub.org"
export NEW_API_KEY="sk-..."

curl "$BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "messages": [{"role": "user", "content": "请只回复：连接成功"}]
  }'
```

回复文本位于 `choices[0].message.content`。

## 让 AI 编程助手读这份文档

把 `https://nowhub.org/docs/llms.txt` 交给 AI 编程助手，再说明要用哪个模型、做什么任务。密钥仍放在本地环境变量里，不要粘贴到对话中。

## 常见问题

### 需要注册各厂商的官方账号吗？

不需要。一个本站密钥即可调用所有已开通渠道的模型，可用范围以令牌配置和模型广场为准。

### 已有的 OpenAI 应用怎么切过来？

保留调用代码，改三处：`api_key` 换成本站令牌、`base_url` 换成 `https://api.nowhub.org/v1`、`model` 换成模型广场里的完整 ID。

### 怎么收费，在哪看价格？

预付额度，按实际用量扣费。单价见模型广场，扣费明细在控制台「日志」。规则见[定价与计费](/guide/pricing)。

### 为什么余额还有却调用失败？

常见原因是**预扣费**超过剩余额度、令牌额度用尽、模型不在令牌白名单，或分组没开通该模型。排查顺序见[余额不足](/faq/quota)。
