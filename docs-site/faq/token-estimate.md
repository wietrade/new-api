# Token 估算与成本预估

## 计费看的是 usage，不是字数

每次响应都带实际用量，这是唯一准确的数字：

| 协议 | 字段 |
| --- | --- |
| OpenAI Chat | `usage.prompt_tokens` / `usage.completion_tokens` |
| Anthropic | `usage.input_tokens` / `usage.output_tokens` |
| Gemini | `usageMetadata.promptTokenCount` / `candidatesTokenCount` |

## 粗略估算

- 英文：约 **4 个字符 ≈ 1 token**
- 中文：约 **1 个汉字 ≈ 0.6–1 token**（不同 tokenizer 有差异）
- 代码：比自然语言更"碎"，按 3 字符 ≈ 1 token 估更保险

精确一点可以用 `tiktoken`（OpenAI 的分词器，对 Claude/Gemini 只是近似）：

```python
import tiktoken

enc = tiktoken.get_encoding("cl100k_base")
print(len(enc.encode("你好，世界")))
```

## 单次请求成本

```text
费用 ≈ 输入 token / 1M × 输入单价
     + 输出 token / 1M × 输出单价
```

单价 = 模型广场里该模型、该分组的**折后价**（已含分组倍率）。缓存命中的部分按缓存读取单价算，便宜很多。

## 批量任务怎么控成本

1. 先用最小样本（10 条）跑一遍，看日志里的实际扣费
2. 用便宜模型做初筛 / 分类，只把难样本交给贵模型
3. 合并请求：同一段长上下文复用（利用提示词缓存），比每次重传便宜
4. 给令牌设额度上限，避免脚本跑飞

::: tip 拿不准就先小额试
先用 `max_tokens` 很小的请求跑 10 次，去控制台日志看真实扣费，再推算全量成本。
:::
