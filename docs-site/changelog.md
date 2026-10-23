# 文档更新

记录文档站本身的变更。模型上线与价格调整请看[模型广场](https://nowhub.org/pricing)。

## 2026-10-23

- 修正「接口兼容性」页：OpenAI 兼容小节的 TypeScript 示例误用了 `@anthropic-ai/sdk`，改为 `openai`（baseURL 带 `/v1`）
- 同一页补充「Anthropic 兼容」的 TypeScript 示例（baseURL 不带 `/v1`），与 Python 示例对照
- 修正「错误码」页表格顺序：按状态码升序排列（`402` 原先排在 `404` 之后）
- 修正「客户端接入」总览页指向 VS Code 页面的锚点（`#vs-code-内置-byok-copilot-chat`）
- 「后续计划」小节标题由「待补充」改写，避免被误读为未完成内容
- 新增 ChatWise 接入说明（支持任一 OpenAI / Anthropic 兼容服务），客户端总览表同步补行
- NextChat 补充 `/v1` 路径歧义提示（报 404 时改用带 `/v1` 的地址）
- 桌面页补充手机端可用客户端说明
- `cli`、`quick-start`、`faq/network` 补充 Windows PowerShell / CMD 环境变量写法
- cc-switch 页：介绍改为「开源跨平台」，并补上 GitHub Releases 下载地址
- 顶部导航新增「主站 ↗」，一键回到 `https://www.nowhub.org`（蓝底白字按钮，新窗口打开）
- 主站（首页导航与页脚）指向文档站的链接统一改为新窗口打开

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

## 2026-10-22（复查）

- 修掉两处漏改的写死模型名（Claude Code 的小模型、函数调用示例）
- Gemini Python SDK 改用 `types.HttpOptions(base_url=...)`
- Claude Code 补充新版 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 说明
- 新增：图片与多模态、网络与代理、Token 估算与成本预估

## 2026-10-22（分组定位）

- 明确分组定位：满血为官方直连，其余为高性价比线路
- 补充各分组可能遇到的情况（限流、服务波动、缓存失效）与按场景选型
- 同步更新简介、定价、关于本站与首页 FAQ

## 2026-10-22（缓存与线路）

- 说明高性价比线路的缓存可能冷启动：线路切换后缓存失效，会重新产生缓存写入费用
- 缓存页新增线路缓存说明与四条降本做法；定价页注明扣费含 cache_creation

## 后续计划

- 图像 / 视频模型接入
- 余额查询与日志查询 API
- 各模型的单独选型页
