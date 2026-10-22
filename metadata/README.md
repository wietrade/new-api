# llm-metadata (self-hosted)

供 new-api 的「模型元数据同步」使用。目录结构必须与上游一致：

```
/api/newapi/models.json
/api/newapi/vendors.json
/api/i18n/<zh|en>/newapi/models.json
/api/i18n/<zh|en>/newapi/vendors.json
```

## 在 new-api 中启用

```
SYNC_UPSTREAM_BASE=https://cdn.jsdelivr.net/gh/wietrade/new-api@main/metadata
```

（jsDelivr 国内可直连；也可用 raw.githubusercontent.com，但需要代理）

## tags 词表（自定）

- 能力：推理 / 工具 / 文件 / 多模态 / 图像 / 视频 / 向量 / 重排
- 上下文：`200K` / `1M` / `1.1M`（单个 token，形如 `<数字><K|M>`）

## 注意

- `name_rule`: 0=精确匹配, 1=前缀, 2=后缀, 3=包含
- 同步只覆盖 `sync_official=1` 的模型；手工改过的（`sync_official=0`）不会被覆盖
- 未来可扩展结构化字段（context_length / capabilities），需同步修改 new-api 的 `upstreamModel` 结构
