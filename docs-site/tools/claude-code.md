# Claude Code 接入

Claude Code 走 Anthropic Messages 协议，改两个环境变量即可指向本站。

## 配置

编辑 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.nowhub.org",
    "ANTHROPIC_AUTH_TOKEN": "sk-你的令牌",
    "ANTHROPIC_MODEL": "<模型ID>",
    "ANTHROPIC_SMALL_FAST_MODEL": "claude-haiku-4-5-20251001"
  }
}
```

- `ANTHROPIC_BASE_URL` **不带** `/v1`，Claude Code 自己拼 `/v1/messages`
- 用 `ANTHROPIC_AUTH_TOKEN` 而不是 `ANTHROPIC_API_KEY`，避免它去走官方登录
- 小模型（用于生成标题、摘要）也要填成站点里有的模型，否则会 404

## 验证

```bash
claude -p "只回复 OK"
```

返回 `OK` 即通。会话里执行 `/status` 可以看到当前 base URL 与模型。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 401 / `invalid x-api-key` | 令牌填错，或误用了 `ANTHROPIC_API_KEY` |
| 404 | base URL 多写了 `/v1` |
| 报模型不存在 | `ANTHROPIC_MODEL` 用了官方模型名，改成模型广场里的 ID |
| 回复质量像别家 | 模型被映射到了其他上游，用 `/status` 确认实际模型 |

::: tip 与 cc-switch 之类工具共存
这类工具会**改写** `~/.claude/settings.json`。要么只用它管配置，要么只用文件配置，别两边同时改。具体配置见 [cc-switch](/tools/cc-switch)。
:::
