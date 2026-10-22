# 终端编程助手

Claude Code 与 Codex CLI 有单独页面，这里补其余常见 CLI。

## Gemini CLI

用两个环境变量即可：

```bash
export GEMINI_API_KEY="sk-你的令牌"
export GOOGLE_GEMINI_BASE_URL="https://api.nowhub.org"

gemini -p "用一句话解释 TCP 三次握手"
```

模型通过 `--model` 指定，例如 `gemini -p "..." --model <模型ID>`。

## Aider

Aider 走 OpenAI 兼容接口：

```bash
export OPENAI_API_BASE="https://api.nowhub.org/v1"
export OPENAI_API_KEY="sk-你的令牌"

aider --model openai/<模型ID>
```

`--model` 里的 `openai/` 前缀表示"用 OpenAI 兼容协议"，后面的名字是站点里的模型 ID。写代码建议用支持工具调用的模型。

## 通用环境变量对照

| 工具 | Base URL 变量 | Key 变量 |
| --- | --- | --- |
| Claude Code | `ANTHROPIC_BASE_URL` | `ANTHROPIC_AUTH_TOKEN` |
| Codex CLI | `config.toml` 里 `base_url` | `env_key` 指向的变量 |
| Gemini CLI | `GOOGLE_GEMINI_BASE_URL` | `GEMINI_API_KEY` |
| Aider | `OPENAI_API_BASE` | `OPENAI_API_KEY` |

## 放到 shell 配置里

临时用可以 `export`，长期用建议写进 `~/.bashrc` / `~/.zshrc`：

```bash
export NOWHUB_BASE="https://api.nowhub.org/v1"
export NOWHUB_KEY="sk-你的令牌"
```

::: warning 不要把 Key 提交到仓库
`.env` 要进 `.gitignore`；CI 里用 Secrets，不要写进代码。泄露的 Key 请立刻在控制台禁用并重建。
:::
