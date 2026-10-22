# AI IDE（Cursor / Windsurf / Trae）

这类 IDE 内置了自己的 AI 客户端，多数允许把「OpenAI 请求」转发到你自己的地址。

## Cursor

1. `Settings` → `Models`
2. 找到 **OpenAI API Key**，填入令牌
3. 打开 **Override OpenAI Base URL**，填 `https://api.nowhub.org/v1`
4. 在模型列表里点 **Add model**，手动输入模型 ID
5. 保存后新建对话，选刚加的模型

::: warning 关于校验
Cursor 会尝试用官方接口验证 Key，自定义地址下这一步可能失败。只要对话能正常返回内容，就不影响使用。
:::

## Windsurf

不同版本入口略有差异，一般在：

`Settings` → `Model Providers`（或 `AI Provider`）→ 选择 OpenAI 兼容 → 填 Base URL `https://api.nowhub.org/v1` 与 Key。

如果当前版本没有自定义地址入口，就改用 Cline / Continue 插件——它们更稳定，功能也覆盖 Windsurf 的常用场景。

## Trae

1. 设置 → 模型 → 添加自定义模型
2. 提供商选 `OpenAI`（兼容模式）
3. Base URL 填 `https://api.nowhub.org/v1`，填 Key
4. 手动添加要用的模型 ID

## JetBrains 系（IntelliJ / PyCharm / GoLand）

JetBrains 自带 AI Assistant 不支持改地址，改用插件：

- **Continue**：配置方式见 [Continue](/tools/vscode#continue)
- **CodeGPT**：Provider 选 `Custom OpenAI`，URL 填 `https://api.nowhub.org/v1`

## 怎么选

| 需求 | 建议 |
| --- | --- |
| 想省钱、能接受自己配 | Cline / Roo Code + 特惠分组 |
| 要最稳的补全体验 | Continue（补全用小模型，对话用大模型） |
| 团队统一配置 | Continue 的 `config.json` 可以纳入仓库 |
