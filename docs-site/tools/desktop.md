# 桌面与网页客户端

## Cherry Studio

国内最常用的桌面客户端，支持 Windows / macOS / Linux。

1. 设置 → **模型服务** → 添加提供商
2. 类型选 **OpenAI**
3. API 地址填 `https://api.nowhub.org/v1`，密钥填令牌
4. 点「获取模型列表」；拉不到就手动添加模型 ID
5. 对话页左上角选中该提供商与模型

支持多助手、知识库、MCP。做知识库时注意向量模型是否在令牌可用范围内。

## Chatbox

1. 设置 → **模型提供方** → 添加自定义提供方
2. API 模式选 **OpenAI API 兼容**
3. API Host 填 `https://api.nowhub.org`，路径补 `/v1`（或直接填完整 `https://api.nowhub.org/v1`）
4. 填 Key 与模型 ID

Chatbox 有移动端，手机与电脑可以用同一个令牌。

## Lobe Chat

网页版或自托管：

1. 设置 → **语言模型** → OpenAI
2. **接口代理地址**填 `https://api.nowhub.org/v1`
3. 填 API Key
4. 在模型列表里手动添加模型 ID

自托管时也可以在 `.env` 里配 `OPENAI_PROXY_URL`，对所有用户生效。

## NextChat

1. 设置 → **自定义接口**
2. 接口地址 `https://api.nowhub.org`
3. 填 API Key
4. 自定义模型填模型 ID，用英文逗号分隔多个

## Open WebUI

自托管（Docker）常用：

1. 管理员设置 → **连接** → OpenAI API
2. Base URL 填 `https://api.nowhub.org/v1`
3. 填 Key，保存后点刷新拉取模型

如果容器里访问不到外网，注意给容器配代理；模型列表为空时先手填模型 ID。

## SillyTavern

1. 连接设置 → API 选 **OpenAI 兼容**（Chat Completion）
2. 反向代理 / 自定义端点填 `https://api.nowhub.org/v1`
3. 填 Key，模型 ID 手动填

## 沉浸式翻译

浏览器扩展，用于网页对照翻译：

1. 设置 → 翻译服务 → 添加 **OpenAI**
2. 自定义 API 地址填 `https://api.nowhub.org/v1`
3. 填 Key，模型选便宜的小模型（例如 haiku 系列）
4. 建议关掉「高级模型」逐段润色，避免翻译成本超出预期

## Bob（macOS 划词翻译）

1. 偏好设置 → 服务 → 添加 OpenAI 兼容服务
2. API 地址填 `https://api.nowhub.org/v1`
3. 填 Key 与模型 ID

## 自托管应用

**Dify / FastGPT / n8n / AnythingLLM** 等：在「模型供应商」里选 OpenAI 或 OpenAI 兼容，Base URL 填 `https://api.nowhub.org/v1`。Dify 需要在系统设置里先添加模型供应商，再在应用里引用。
