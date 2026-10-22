# 图片与多模态输入

三家协议传图的方式完全不同，但前提一致：**所选模型必须支持图片输入**（模型广场的「模态」一栏会标）。

## OpenAI Chat Completions

`content` 从字符串改成数组，图片用 `image_url`：

```json
{
  "model": "<模型ID>",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "这张图里有什么？" },
      { "type": "image_url", "image_url": { "url": "https://example.com/a.jpg" } }
    ]
  }]
}
```

本地图片转 base64 时用 data URL：

```python
import base64

with open("a.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

data_url = f"data:image/png;base64,{b64}"
```

## Anthropic Messages

用 `image` block：

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "这张图里有什么？" },
    {
      "type": "image",
      "source": { "type": "base64", "media_type": "image/png", "data": "<base64>" }
    }
  ]
}
```

## Gemini generateContent

`parts` 里混排文本与 `inlineData`：

```json
{
  "contents": [{
    "parts": [
      { "text": "这张图里有什么？" },
      { "inlineData": { "mimeType": "image/png", "data": "<base64>" } }
    ]
  }]
}
```

也可以用 `fileData: { mimeType, fileUri }` 传公网地址，是否可用取决于渠道。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| `400 image not supported` | 模型不支持图片输入，换多模态模型 |
| `400 invalid image` | base64 少了前缀、或 media_type 与实际格式不符 |
| 图片 URL 拉取失败 | 地址不可公网访问，或需要鉴权；改成 base64 直传 |
| 响应很慢 / 扣费高 | 图片按像素折算 token，图越大越贵 |

::: tip 控制成本
传图前把长边压到 1024–1568 像素通常够用；同一张图反复问，考虑先让它生成一段文字描述再复用。
:::
