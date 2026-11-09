# model-data-private —— 不进仓库的那部分数据

这个目录**不在 git 里**（`j:\hubapi\model-data-private`，与 `model-data` 平级）。
放的是「一旦公开就等于把进货价发给竞争对手」的东西。

## 顶层只有两样东西

| 文件 | 是什么 | 谁在用 |
|:---|:---|:---|
| `billing_basis.json` | **上游结算价，唯一真源**。25 个模型，人民币标价 + 汇率，折算成 USD/1M 后生成 `billing_expr` | `export_billing --basis` |
| `.env.local` | `GEMINI_API_KEY`，供 `harvest_official` 核对 Google 官方页 | 本地开发 |

```bash
# 载入环境变量（用法写在文件头）
set -a; . ../model-data-private/.env.local; set +a
```

`archive/` 里是已经跑完的一次性脚本和被取代的旧快照，**不要执行、不要引用**，
留着只为「当时为什么这么改」有据可查。

## billing_basis.json 的约定

```jsonc
{
  "currency": "CNY",
  "unit": "per_1m_tokens",
  "fx_to_usd": 6.8,
  "source": "znbcode:model-plaza",
  "data": {
    "<模型名>": { "input": 8.0, "output": 24.0, "cache_read": 2.0, ... }
  }
}
```

- **只放我们拿到的价**，不放厂商官方牌价。官方价在仓库的 `sources/pricing.official.json`。
- **条目必须写全 `BASIS_FIELDS`**：`expr.apply_billing_basis` 是先清空再覆盖，
  只写 `cache_read` 会让 input/output/写缓存全部归零（2026-10-26 在 `claude-sonnet-5-5` 上实测踩到）。
- **分组加价不写在这里**，由 new-api 的 `GroupRatio` 表达。
- 改完必须重新导出并核对，再落库：

```bash
python -m tools.model_sync.export_billing \
  --basis /opt/model-data-private/billing_basis.json \
  -o /opt/model-data-private/billing.json
python -m tools.ops.push_billing -i /opt/model-data-private/billing.json --dry-run
```

## 部署机上的同名目录多两个文件

`/opt/model-data-private/`（700 root）除上面两个之外还有：

| 文件 | 是什么 |
|:---|:---|
| `newapi.token` | `nap_...` 管理令牌，`push_billing` 用它调 `PUT /api/option/` |
| `billing.json` | `export_billing` 的产物（`billing_mode` + `billing_expr`），落库用 |

**本地改完 `billing_basis.json` 要传到服务器**，两边应当逐字节一致：

```bash
sha256sum billing_basis.json                                  # 本地
ssh root@<host> sha256sum /opt/model-data-private/billing_basis.json
```

## 不要往这里放

- 密钥、令牌的**唯一副本**——应在密码管理器里，这里只是运行期落地
- 一次性脚本（跑完就挪进 `archive/`，否则半年后没人知道还该不该跑）
- 从公开站点抓的快照（那是 `model-data/raw/` 的事；除非它含价格字段，那种必须分开存）
