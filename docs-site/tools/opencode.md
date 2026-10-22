# OpenCode 接入

[OpenCode](https://opencode.ai) 是终端里的开源 AI 编程助手，支持自定义 provider，走 OpenAI 兼容接口。

## 配置

编辑全局配置 `~/.config/opencode/opencode.json`（或项目根目录的 `opencode.json`）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "nowhub": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "NowHub",
      "options": {
        "baseURL": "https://api.nowhub.org/v1",
        "apiKey": "{env:NOWHUB_API_KEY}"
      },
      "models": {
        "<模型ID>": {}
      }
    }
  },
  "model": "nowhub/<模型ID>"
}
```

设置密钥后启动：

```bash
export NOWHUB_API_KEY="sk-你的令牌"
opencode
```

`{env:NOWHUB_API_KEY}` 表示从环境变量读取，**不要把 Key 明文写进配置文件**。

## 关键字段

| 字段 | 说明 |
| --- | --- |
| `npm` | 固定用 `@ai-sdk/openai-compatible`，走 Chat Completions |
| `options.baseURL` | 必须带 `/v1` |
| `options.apiKey` | `${env:...}` 形式引用环境变量 |
| `models` | 每个键是一个模型 ID，来自模型广场 |
| `model` | 默认模型，格式 `nowhub/<模型ID>` |

## 加第二个模型

`models` 里继续加键即可，之后用 `/models` 命令切换：

```json
"models": {
  "<模型ID-1>": {},
  "<模型ID-2>": { "name": "日常写代码" }
}
```

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 启动后模型列表为空 | `models` 里没写任何键，或 JSON 语法错误 |
| 404 | `baseURL` 少了 `/v1` |
| 401 | `NOWHUB_API_KEY` 没 export，或变量名拼错 |
| 工具调用失败 | 所选模型不支持 function calling，换模型 |

::: tip 模型与价格
模型 ID 与单价会调整，请到[模型与价格](/models)或模型广场确认，不要照抄文档里的旧名字。
:::
