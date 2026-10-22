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

features:
  - title: 一个 Key，多个协议
    details: 同一个令牌可以调用 OpenAI Chat Completions、Responses、Anthropic Messages 与 Gemini generateContent。
  - title: 价格按分组与档位
    details: 按 1M token 计价，不同分组有不同倍率，长上下文/缓存读写等档位分开计价。
  - title: 限流按分组生效
    details: 每个分组独立的 RPM / TPM / RPD，超限返回 429，响应头带重置时间。
---
