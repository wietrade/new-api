# Cline / Cherry Studio 接入

这两个是图形客户端，配置项一致：Base URL + API Key + 模型 ID。

## Cline（VS Code 插件）

1. 打开 Cline 设置，API Provider 选 **OpenAI Compatible**
2. 填写：
   - Base URL：`https://api.nowhub.org/v1`
   - API Key：`sk-你的令牌`
   - Model ID：模型广场里的完整 ID，例如 `claude-sonnet-5`
3. 保存后发一条消息验证

## Cherry Studio（桌面客户端）

1. 设置 → 模型服务 → 添加提供商
2. 类型选 OpenAI，API 地址填 `https://api.nowhub.org/v1`，密钥填令牌
3. 点「获取模型列表」；如果拉不到，手动添加模型 ID
4. 在对话页选这个提供商与模型

## 通用排查

| 现象 | 原因 |
| --- | --- |
| 获取模型列表为空 | `/v1/models` 返回了空列表 → 令牌没有可用分组/模型 |
| 401 | 密钥前后有空格，或把「令牌名称」当成 Key 填了 |
| 404 | Base URL 少了 `/v1`（这类客户端自己不再补） |
| 工具调用报错 | 模型不支持 function calling，换模型 |

::: tip 客户端会拼什么
这类客户端把 `Base URL + /chat/completions` 作为请求地址，所以 Base URL 必须写全到 `/v1`。
:::
