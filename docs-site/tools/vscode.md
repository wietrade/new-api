# VS Code 编程助手

VS Code 里主流的几个 AI 编程插件都支持「OpenAI 兼容」，配置项名字不同但内容一致：

- **Base URL / API 地址**：`https://api.nowhub.org/v1`
- **API Key**：`sk-...`
- **Model ID**：模型与价格页里的完整 ID

## Cline

1. 安装扩展 **Cline**（原 Claude Dev）
2. 打开设置 → **API Provider** 选择 `OpenAI Compatible`
3. 填写：
   - Base URL：`https://api.nowhub.org/v1`
   - API Key：你的令牌
   - Model ID：例如 `claude-sonnet-5`
4. 关掉 `Enable streaming` 以外的默认选项，先发一句「你好」验证

::: tip 工具调用
Cline 依赖 function calling。选模型时优先挑模型详情里「能力」标了**工具**的模型，否则它无法读写文件。
:::

## Roo Code

Roo Code 是 Cline 的分支，配置位置几乎相同：

1. 设置 → **Provider** 选 `OpenAI Compatible`
2. Base URL 填 `https://api.nowhub.org/v1`，粘贴 Key
3. Model 手动填模型 ID（下拉列表可能拉不到自定义模型）
4. 需要视觉能力时，勾选模型支持图片输入

## Continue

Continue 用配置文件，支持 VS Code 与 JetBrains。

1. 安装扩展后打开 `~/.continue/config.json`
2. 在 `models` 里加一项：

```json
{
  "models": [
    {
      "title": "NowHub",
      "provider": "openai",
      "model": "claude-sonnet-5",
      "apiBase": "https://api.nowhub.org/v1",
      "apiKey": "sk-你的令牌"
    }
  ]
}
```

3. 保存后重载窗口，在侧边栏选中该模型

自动补全（tab 补全）用的是单独的 `tabAutocompleteModel` 字段，配置方式相同，建议选便宜的小模型。

## Kilo Code

1. 设置 → API Provider → `OpenAI Compatible`
2. Base URL `https://api.nowhub.org/v1`，填 Key 与 Model ID
3. 其余（自动批准、上下文长度）按需调整

## 通用排查

| 现象 | 原因 |
| --- | --- |
| `404` / `Not Found` | Base URL 漏了 `/v1` |
| `401` | Key 错误或已禁用 |
| 模型下拉为空 | 插件调用 `/v1/models` 拿不到 → 手动输入模型 ID |
| 一直转圈无输出 | 模型不支持流式或上游超时，换模型试 |
| 读写文件失败 | 模型不支持工具调用 |
