# 客户端与工具总览

几乎所有客户端都只需要三样东西：**Base URL**、**API Key**、**模型 ID**。

## 通用规则

| 客户端类型 | Base URL 填什么 |
| --- | --- |
| OpenAI 兼容（绝大多数） | `https://api.nowhub.org/v1` |
| Anthropic 兼容（Claude Code 等） | `https://api.nowhub.org`（不要再加 `/v1`） |
| Gemini 原生 | `https://api.nowhub.org` |

模型 ID 请从[模型与价格](/models)复制，**不要用官方模型名去猜**（例如别写成 `gpt-4o`，要用站点里的实际 ID）。

## 一览表

| 客户端 | 类型 | 平台 | 推荐协议 |
| --- | --- | --- | --- |
| [Cherry Studio](/tools/desktop#cherry-studio) | 桌面聊天 | Windows / macOS / Linux | OpenAI |
| [Chatbox](/tools/desktop#chatbox) | 桌面 + 移动 | 全平台 | OpenAI |
| [LobeChat](/tools/desktop#lobe-chat) | 网页 / 自托管 | 浏览器 | OpenAI |
| [NextChat](/tools/desktop#nextchat) | 网页 / 自托管 | 浏览器 | OpenAI |
| [Open WebUI](/tools/desktop#open-webui) | 自托管 | 浏览器 / Docker | OpenAI |
| [SillyTavern](/tools/desktop#sillytavern) | 角色扮演 | 本地 | OpenAI |
| [沉浸式翻译](/tools/desktop#沉浸式翻译) | 浏览器扩展 | Chrome / Edge / Safari | OpenAI |
| [Cline](/tools/vscode#cline) | VS Code 编程助手 | VS Code | OpenAI |
| [Roo Code](/tools/vscode#roo-code) | VS Code 编程助手 | VS Code | OpenAI |
| [Continue](/tools/vscode#continue) | 代码补全 + 对话 | VS Code / JetBrains | OpenAI |
| [Kilo Code](/tools/vscode#kilo-code) | VS Code 编程助手 | VS Code | OpenAI |
| [Cursor](/tools/ide#cursor) | AI IDE | Windows / macOS / Linux | OpenAI |
| [Windsurf](/tools/ide#windsurf) | AI IDE | Windows / macOS / Linux | OpenAI |
| [Trae](/tools/ide#trae) | AI IDE | Windows / macOS | OpenAI |
| [Claude Code](/tools/claude-code) | 终端编程助手 | CLI | Anthropic |
| [Codex CLI](/tools/codex-cli) | 终端编程助手 | CLI | Responses |
| [Gemini CLI](/tools/cli#gemini-cli) | 终端编程助手 | CLI | Gemini |
| [Aider](/tools/cli#aider) | 终端编程助手 | CLI | OpenAI |
| [Dify / FastGPT](/tools/desktop#自托管应用) | 应用编排 | 自托管 | OpenAI |

## 三件套怎么找

1. **API Key**：控制台 → 令牌 → 新建。Key 只在创建时完整显示一次。
2. **Base URL**：见上表，注意 OpenAI 兼容要带 `/v1`，Anthropic 不带。
3. **模型 ID**：模型与价格页，点「查看模型详情」可以看到该模型支持哪些协议与分档价格。

## 配不上时先自查

- 报 404：Base URL 少了 `/v1`（OpenAI 系）或多写了 `/v1`（Anthropic 系）
- 报 401：Key 前后有空格，或把「令牌名称」当成 Key
- 模型列表为空：令牌没有可用分组，去控制台改令牌
- 工具调用报错：该模型不支持 function calling，换模型

细节看[鉴权与路径](/faq/auth)。
