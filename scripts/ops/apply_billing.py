"""把导出的计费表达式写进 new-api 的 options 表。

计费事实源在独立的 model-data 仓库（``api/newapi/pricing.json``），只有落到
``billing_setting.billing_mode`` / ``billing_setting.billing_expr`` 才对线上生效。
本脚本负责这一步，并在写入前备份数据库。

用法（在服务器上跑，DB 默认取运行时目录）::

    # 在 model-data 仓库里导出（需先 checkout）：
    python -m tools.model_sync.export_billing -o /tmp/billing.json
    python scripts/ops/apply_billing.py -i /tmp/billing.json
    systemctl restart new-api          # 进程只在启动时读 options

``--dry-run`` 只打印将要发生的变更。
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
import time

DEFAULT_DB = "/www/wwwroot/new-api/data/one-api.db"
KEYS = ("billing_setting.billing_mode", "billing_setting.billing_expr")


def load_payload(path):
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    missing = [key for key in KEYS if key not in payload]
    if missing:
        raise SystemExit(f"{path} missing keys: {', '.join(missing)}")
    return payload


def current_maps(conn):
    maps = {}
    for key in KEYS:
        row = conn.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
        maps[key] = json.loads(row[0]) if row and row[0] else {}
    return maps


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-i", "--input", required=True, help="export_billing.py 的输出")
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="用导出内容整体替换，而不是合并（会删除未导出的模型配置）",
    )
    args = parser.parse_args(argv)

    payload = load_payload(args.input)

    if args.dry_run:
        conn = sqlite3.connect(args.db)
        try:
            existing = current_maps(conn)
        finally:
            conn.close()
        for key in KEYS:
            new = payload[key]
            if args.replace:
                print(f"{key}: {len(existing[key])} -> {len(new)} (replace)")
                continue
            added = sorted(set(new) - set(existing[key]))
            changed = sorted(k for k in new if k in existing[key] and existing[key][k] != new[k])
            print(f"{key}: {len(existing[key])} -> {len(set(existing[key]) | set(new))}")
            print(f"  + {len(added)} added, ~ {len(changed)} changed")
            for name in added[:5]:
                print(f"    + {name}")
            for name in changed[:5]:
                print(f"    ~ {name}")
        return 0

    backup = f"{args.db}.bak-{time.strftime('%Y%m%d%H%M%S')}"
    shutil.copy2(args.db, backup)
    print("backup:", backup)

    conn = sqlite3.connect(args.db)
    try:
        for key in KEYS:
            raw = conn.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
            current = {} if args.replace or not raw or not raw[0] else json.loads(raw[0])
            merged = dict(payload[key]) if args.replace else {**current, **payload[key]}
            conn.execute(
                "INSERT OR REPLACE INTO options(key, value) VALUES(?, ?)",
                (key, json.dumps(merged, ensure_ascii=False, separators=(",", ":"))),
            )
            print(f"{key}: {len(merged)} models")
        conn.commit()

        for key in KEYS:
            raw = conn.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()[0]
            json.loads(raw)  # 回读校验，写坏了要立刻知道
            print(f"verified {key}: {len(json.loads(raw))} models")
    finally:
        conn.close()

    print("\nrestart new-api to load the new options: systemctl restart new-api")
    return 0


if __name__ == "__main__":
    sys.exit(main())
