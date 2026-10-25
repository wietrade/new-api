# 运维脚本（线上数据库）

价格和模型的**事实源**已拆到独立仓库 `model-data`（`api/newapi/*.json`），
但线上生效要落进 new-api 的 SQLite。本目录只保留**落库侧**脚本，让「线上最终状态」
可以从两个仓库的 git 完全复现，而不是靠记忆手工点后台。

所有脚本默认操作 `/www/wwwroot/new-api/data/one-api.db`，写入前自动备份为
`one-api.db.bak-<时间戳>`。写完都要重启进程，`options` 只在启动时读入内存。

## 改价的完整链路

```bash
# 1-2. 在 model-data 仓库里改价并导出（见该仓库 README）
#      python -m tools.model_sync.validate
#      python -m tools.model_sync.export_billing -o /tmp/billing.json

# 3. 确认将要发生的变更
python scripts/ops/apply_billing.py -i /tmp/billing.json --dry-run

# 4. 写入并重启
python scripts/ops/apply_billing.py -i /tmp/billing.json
systemctl restart new-api
```

## 脚本

| 脚本 | 用途 |
|:---|:---|
| `apply_billing.py` | 把 `export_billing.py` 的输出合并进 `billing_setting.*`；`--replace` 整体替换，`--dry-run` 只预览 |
| `drop_model.py` | 下线模型：默认软删（`deleted_at`，可恢复），同时清掉它的计费配置；`--hard` 物理删除 |
| `rename_model.py` | 改名并搬移计费配置；模型仍挂在渠道上时拒绝执行（除非 `--force`），避免改成无渠道状态 |

## 注意

- **改名必须搬计费键**。只改 `models.model_name` 会让模型掉回缺省 `ratio` 模式，
  线上直接报「模型倍率未配置」。
- **下线要清计费键**。否则同名模型日后重新引入会静默继承旧价。
- `channels.models` / `abilities` 不在脚本自动范围内；有渠道绑定时先处理渠道。
- 恢复：`cp one-api.db.bak-<时间戳> one-api.db && systemctl restart new-api`。
