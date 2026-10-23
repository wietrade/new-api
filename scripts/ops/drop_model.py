"""下线一个模型：软删除 models 行，并清掉它的计费配置。

模型下线后如果表达式还留在 ``billing_setting.billing_expr`` 里，同名模型被重新
引入时会静默继承旧价。所以两步一起做。

用法::

    python scripts/ops/drop_model.py Qwen3-235B-A22B-Thinking-2507
    python scripts/ops/drop_model.py --hard SomeModel        # 物理删除

软删除是默认行为：new-api 用 gorm 的 ``deleted_at``，恢复只需把它置空。
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


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("models", nargs="+")
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--hard", action="store_true", help="物理删除，不可恢复")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--keep-billing", action="store_true", help="保留计费配置")
    args = parser.parse_args(argv)

    if args.dry_run:
        conn = sqlite3.connect(args.db)
        try:
            for name in args.models:
                rows = conn.execute(
                    "SELECT id, model_name, deleted_at FROM models WHERE model_name=?",
                    (name,),
                ).fetchall()
                print(name, "->", rows or "not found")
        finally:
            conn.close()
        return 0

    backup = f"{args.db}.bak-{time.strftime('%Y%m%d%H%M%S')}"
    shutil.copy2(args.db, backup)
    print("backup:", backup)

    conn = sqlite3.connect(args.db)
    try:
        for name in args.models:
            if args.hard:
                count = conn.execute("DELETE FROM models WHERE model_name=?", (name,)).rowcount
            else:
                count = conn.execute(
                    "UPDATE models SET deleted_at=datetime('now')"
                    " WHERE model_name=? AND deleted_at IS NULL",
                    (name,),
                ).rowcount
            print(f"{'deleted' if args.hard else 'soft-deleted'} {name}: {count} row(s)")

            if args.keep_billing:
                continue
            for key in KEYS:
                row = conn.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
                if not row or not row[0]:
                    continue
                mapping = json.loads(row[0])
                if mapping.pop(name, None) is None:
                    continue
                conn.execute(
                    "UPDATE options SET value=? WHERE key=?",
                    (json.dumps(mapping, ensure_ascii=False, separators=(",", ":")), key),
                )
                print(f"  {key}: removed, {len(mapping)} models left")

        conn.commit()
        live = conn.execute(
            "SELECT count(*) FROM models WHERE deleted_at IS NULL"
        ).fetchone()[0]
        print("live models:", live)
    finally:
        conn.close()

    print("\nrestart new-api: systemctl restart new-api")
    return 0


if __name__ == "__main__":
    sys.exit(main())
