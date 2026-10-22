# LangChain 接入

用 `langchain-openai` 的 OpenAI 兼容实现，改 `base_url` 即可。

## 安装

```bash
pip install -U langchain-openai
```

## Chat

```python
import os

from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="<模型ID>",
    base_url="https://api.nowhub.org/v1",
    api_key=os.environ["NEW_API_KEY"],
    temperature=0.2,
)

print(llm.invoke("用一句话解释什么是向量数据库").content)
```

## 流式

```python
for chunk in llm.stream("写一段 100 字的自我介绍"):
    print(chunk.content, end="", flush=True)
```

## 工具调用

```python
from langchain_core.tools import tool


@tool
def add(a: int, b: int) -> int:
    # 两数相加
    return a + b


print(llm.bind_tools([add]).invoke("3 加 5 等于几？"))
```

## 向量

```python
from langchain_openai import OpenAIEmbeddings

emb = OpenAIEmbeddings(
    model="<向量模型ID>",
    base_url="https://api.nowhub.org/v1",
    api_key=os.environ["NEW_API_KEY"],
)
```

## 注意

- `base_url` 要带 `/v1`
- 用 `bind_tools` 时模型必须支持工具调用，否则会报 400
- 需要 Responses 接口的模型，把 `use_responses_api=True` 打开（`langchain-openai` 新版本支持）
