# Embeddings API：文本向量

`POST /v1/embeddings`，与 OpenAI 格式一致，常用于 RAG、语义检索与聚类。

## 请求

```bash
curl "$BASE_URL/v1/embeddings" \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"text-embedding-3-small","input":["第一段","第二段"]}'
```

```python
from openai import OpenAI

client = OpenAI(base_url="https://api.nowhub.org/v1", api_key="sk-...")
resp = client.embeddings.create(
    model="text-embedding-3-small",
    input=["第一段文本", "第二段文本"],
)
vectors = [d.embedding for d in resp.data]
```

## 响应

```json
{
  "object": "list",
  "data": [{ "object": "embedding", "index": 0, "embedding": [0.0023, -0.0091] }],
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}
```

## 注意

- **按 `index` 对齐**：批量返回顺序不保证与输入一致
- **维度**：换模型必须重建向量索引
- **可用性**：不是所有分组都开了向量模型，先在模型广场确认
