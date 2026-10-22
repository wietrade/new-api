# cc-switch（Claude Code 多配置切换）

## 它解决什么问题

Claude Code 的 provider 配置只有一份（`~/.claude/settings.json`），在几个中转站之间来回切就得手改 JSON、记 key、改模型名，很容易改错。

cc-switch 是一个本地小工具（托盘常驻）：把多套 provider 存起来，点一下就把配置写进 Claude Code（也可以管 Codex CLI），并且可以起一个本地代理让多个客户端共用同一份上游。

## 添加本站作为 provider

1. 打开 cc-switch → 新建 provider，类型选 **Claude**
2. 填写：

| 字段 | 值 |
| --- | --- |
| 名称 | `NowHub` |
| Base URL | `https://api.nowhub.org`（**不要**加 `/v1`） |
| API Key | 你的令牌 `sk-...` |
| 主模型 | 模型广场里的模型 ID |
| 小模型 / 快速模型 | 另一个便宜模型 ID（生成标题、摘要用） |

3. 保存，然后**切换到这个 provider**

模型名必须填站点里真实存在的 ID；写官方型号（例如站点没开通的某款）会直接 404 或 403。

## 验证

```bash
claude -p "只回复 OK"
```

返回 `OK` 即可。会话里执行 `/status` 能看到当前 base URL 与模型——这是确认"真的切过去了"最可靠的方式。

## 两种工作模式

| 模式 | `settings.json` 里的 `ANTHROPIC_BASE_URL` | 说明 |
| --- | --- | --- |
| 直连 | `https://api.nowhub.org` | cc-switch 直接把地址和 key 写进去 |
| 代理 | `http://127.0.0.1:<端口>` | 请求先到本机，再由 cc-switch 转发到你填的上游 |

两种都是正常的。**代理模式下看到 `127.0.0.1` 不代表配错**，上游地址取自 provider 里填的 Base URL。

## 六个坑

1. **它会接管 `settings.json`**：cc-switch 运行时会按自己的 provider 重写配置，手改的内容会被覆盖。想手改就先退出它，二选一。
2. **Base URL 别带 `/v1`**：Claude Code 自己拼 `/v1/messages`，多写一层就是 404。
3. **模型 ID 用站点里的**：`ANTHROPIC_MODEL` 写成官方名会找不到模型。
4. **关窗口 ≠ 退出进程**：托盘常驻，切换后别只看界面，用 `/status` 或 `claude -p` 验证。
5. **别和 `/login` 混用**：已经用第三方 key 时再登录官方账号会覆盖配置。
6. **代理端口只监听本机**：不要改成 `0.0.0.0`，否则你的令牌等于对局域网开放。

## 不想用 cc-switch？

直接改 `~/.claude/settings.json`，效果一样：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.nowhub.org",
    "ANTHROPIC_AUTH_TOKEN": "sk-你的令牌",
    "ANTHROPIC_MODEL": "<模型ID>",
    "ANTHROPIC_SMALL_FAST_MODEL": "<小模型ID>"
  }
}
```

细节见 [Claude Code 接入](/tools/claude-code)。

## 顺便管 Codex CLI

cc-switch 也能管 Codex 的配置，注意两边的 `base_url` 规则不同：

| 工具 | Base URL |
| --- | --- |
| Claude Code | `https://api.nowhub.org`（不带 `/v1`） |
| Codex CLI | `https://api.nowhub.org/v1`（带 `/v1`） |

填错的表现都是 404，见 [Codex CLI 接入](/tools/codex-cli)。
