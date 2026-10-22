# 简介

NowHub API 是一个大模型 API 中转服务：把不同厂商的模型统一到一组兼容接口后面，按 token 用量计费。

## 你能得到什么

- **统一入口**：不同厂商的模型都用同一个域名、同一套鉴权方式访问。
- **协议兼容**：OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini generateContent 都能用，通常只需要替换 `base_url`。
- **按量计费**：输入、输出、缓存读写分别计价，价格按每 1M token 显示。
- **分组可选**：同一模型可能有多个分组（例如稳定性更高或价格更低的通道），各自有独立的倍率与限流。

## 基本概念

| 概念 | 说明 |
| --- | --- |
| 令牌（Token） | 你在控制台「令牌」页面创建的 API Key，请求时放在 `Authorization` 头里 |
| 分组（Group） | 令牌所属的线路分类：官方 API（满血）或上游账号池（稳定 / 特惠 / 越狱），决定可用模型、价格与限流 |
| 模型（Model） | 请求里 `model` 字段的取值，以模型广场里的实际 ID 为准 |
| 档位（Tier） | 同一模型内按上下文长度或缓存命中情况划分的计价档位 |
| 额度（Quota） | 账户可用余额，单位是内部额度；余额不足时返回 402 |

## 下一步

- 想马上跑通第一个请求：看 [快速开始](/guide/quick-start)
- 想确认某个模型归哪个分组、多少钱：看 [模型与分组](/guide/models-and-groups)
- 想看具体接口长什么样：见 [接口兼容性](/guide/compatibility)
