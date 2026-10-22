# 文档更新

记录文档站本身的变更。模型上线与价格调整请看[模型广场](https://nowhub.org/pricing)。

## 2026-10-22

- 文档站上线：`https://nowhub.org/docs/`
- 新增 API 参考：Chat Completions、Anthropic Messages、Gemini、Models、Embeddings、函数调用
- 新增工具接入：Claude Code、Codex CLI、Cline / Cherry Studio、LangChain
- 新增故障排查：鉴权与路径、余额与额度、超时、max_tokens、提示词缓存
- 新增 `llms.txt`，便于 AI 编程助手直接读取

## 2026-10-22（续）

- 新增「模型与价格」页：运行时拉取 `/api/pricing`，支持搜索与分组筛选，逐行跳转模型详情
- 每页新增「复制为 Markdown」按钮；构建时同步产出同名 `.md`
- 新增 `llms-full.txt`（全站正文合并，约 40 KB），供 AI 编程助手一次读完
- 域名落地：站点 `nowhub.org`、API `api.nowhub.org`

## 2026-10-22（客户端）

- 新增「客户端接入」：总览 + VS Code（Cline / Roo Code / Continue / Kilo Code）+ AI IDE（Cursor / Windsurf / Trae）+ 桌面与网页客户端（Cherry Studio / Chatbox / LobeChat / NextChat / Open WebUI / SillyTavern / 沉浸式翻译）+ 终端 CLI（Gemini CLI / Aider）
- 模型与价格页：价格列改为「查看模型详情」，不再暗示文档内可查单价

## 2026-10-22（去写死）

- 全站示例不再写死模型名：统一用 `<模型ID>`，模型与价格一律以模型广场为准
- 新增 OpenCode 接入（`opencode.json` 自定义 provider）

## 2026-10-22（VS Code BYOK）

- 补充 VS Code 内置 BYOK 接入（Chat → Manage Models → OpenAI Compatible）

## 2026-10-22（Kilo Code / cc-switch）

- Kilo Code 扩写：完整配置、与 Cline/Roo Code 的差异对照、常见报错
- 新增 cc-switch：多 provider 切换、直连与代理两种模式、六个坑

## 待补充

- 图像 / 视频模型接入
- 余额查询与日志查询 API
- 各模型的单独选型页
