# 文档站（VitePress）

中文文档，构建产物写入 `../web/dist/docs`，由 new-api 的静态文件服务同域提供：
`https://<你的域名>/docs/`。

## 本地开发

```bash
cd docs-site
bun install
bun run dev        # http://localhost:5173/docs/
```

## 构建

```bash
cd web   && bun run build          # 先构建主站（会清空 web/dist）
cd ../docs-site && bun run build   # 再构建文档，写入 web/dist/docs
cd ..    && go build -trimpath -o /tmp/na .
```

顺序不能反：主站构建会清空 `web/dist`。

## 新增页面

1. 在 `guide/` 下新建 `.md`
2. 在 `.vitepress/config.mts` 的 `sidebar` 里加一项
