# Codex CLI 接入

Codex CLI 默认走 OpenAI Responses 接口，用自定义 provider 指向本站即可。

## 配置

编辑 `~/.codex/config.toml`：

```toml
model = "gpt-6-sol"
model_provider = "nowhub"

[model_providers.nowhub]
name = "NowHub"
base_url = "https://api.nowhub.org/v1"
env_key = "NOWHUB_API_KEY"
wire_api = "responses"
```

然后设置密钥：

```bash
export NOWHUB_API_KEY="sk-你的令牌"
codex "列出当前目录的文件"
```

## 参数说明

| 键 | 说明 |
| --- | --- |
| `base_url` | 必须带 `/v1` |
| `env_key` | 从这个环境变量读密钥，不写进配置文件 |
| `wire_api` | `responses` 走 `/v1/responses`；`chat` 走 `/v1/chat/completions` |

如果模型只支持 Chat Completions，把 `wire_api` 改成 `chat`。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 404 / 405 | `wire_api` 与端点不匹配，或 `base_url` 少了 `/v1` |
| 401 | `env_key` 指向的变量没有 export |
| 工具调用失败 | 该模型不支持工具调用，换一个支持工具调用的模型 |
