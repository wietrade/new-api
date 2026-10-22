# 鉴权与路径

## 401 Unauthorized

- 没带 `Authorization: Bearer <TOKEN>` 头
- Key 前后有空格、换行，或复制时被截断
- 令牌已过期、被禁用或额度用尽
- 协议与头部不匹配：Anthropic 客户端配了 OpenAI 端点（或反过来）

## 403 Forbidden

令牌有三层限制，任一不满足都会 403：

1. **模型白名单**没勾这个模型
2. **分组**不包含这个模型
3. **IP 白名单**不含你的出口 IP

## 404 Not Found

- 路径少了 `/v1`：`/chat/completions` → `/v1/chat/completions`
- Anthropic SDK 的 `base_url` 多写了 `/v1`
- 模型名不存在或拼写错误

## Base URL 正确写法

| 客户端 | Base URL |
| --- | --- |
| OpenAI SDK / Cline / Cherry Studio | `https://api.nowhub.org/v1` |
| Anthropic SDK / Claude Code | `https://api.nowhub.org` |
| Gemini SDK | `https://api.nowhub.org` |

## 一条命令自查

```bash
curl -sS "$BASE_URL/v1/models" -H "Authorization: Bearer $NEW_API_KEY" | head -c 300
```

- 200 且列出模型 → 鉴权没问题，问题在模型或参数
- 401 → 令牌问题
- 空列表 → 令牌没有可用分组
