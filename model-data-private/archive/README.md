# archive/ —— 已执行完、仅供查证的东西

**这里的文件不要执行、不要 import、不要当成现行规则。** 保留原因只有一个：
以后问「当时这个价是怎么定的」，能翻到原始依据。

| 文件 | 何时执行 | 留下了什么后果 | 为什么放私有目录 |
|:---|:---|:---|:---|
| `_consolidate_billing_basis.py` | 2026-10-26 | 把散落在 `pricing.json` 行内的 `*_cny` 与行内 `billing_basis` 全部收进 `billing_basis.json`，使其成为唯一真源 | 脚本逻辑本身无害，但它读的上游价是采购成本 |
| `_add_image_pricing.py` | 2026-10-26 | 把按张计费的多模态模型结算价写进表达式 | **docstring 里直接写着上游 CNY 单价表** |
| `cheaperinference-full-20261023.json` | 2026-10-23 抓取 | 未脱敏原版（505 条），`model-data/raw/` 里那份是剔除价格字段后的版本 | 含 `ourInputPerM` / `ourOutputPerM` —— 我们自己的进货价 |

## 两个脚本已经跑不动了

它们写于 `pricing.json` 还有 `aggregator_reference` 行内价的时期，路径也指向
`api/newapi/billing_basis.json`（该位置已不存在，basis 只在私有目录）。
现在重跑只会报错或者写出被 `validate` 拒绝的字段——**需要迁移时请新写脚本，不要修这两个**。

`cheaperinference-full-20261023.json` 的精华（25 个模型的结算价）已经固化在
`../billing_basis.json` 里；这份快照只作为「我们确实从该站点取过这些数」的凭证。
