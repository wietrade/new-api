"""重命名一个模型，并把它名下的计费配置一起搬过去。

只改 ``models.model_name`` 而不搬 ``billing_setting`` 的键，模型会掉回缺省的
ratio 模式、报「模型倍率未配置」——名字改了、计费没了，是最难察觉的一类事故。

用法::

    python scripts/ops/rename_model.py --old minimax-m3.1-flash:free --new minimax-m3.1-flash

模型仍挂在渠道上时，``channels.models`` 与 ``abilities`` 也要一起改；本脚本会
先检查并拒绝执行，避免把在售模型改成无渠道状态。
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


def channels_referencing(conn, name):
    rows = conn.execute(
        "SELECT id, name FROM channels WHERE models LIKE ?", (f"%{name}%",)
    ).fetchall()
    # LIKE 会误命中子串，二次精确比对逗号分隔的模型列表。
    return [
        (channel_id, channel_name)
        for channel_id, channel_name in rows
        if name in {
            item.strip()
            for item in (
                conn.execute(
                    "SELECT models FROM channels WHERE id=?", (channel_id,)
                ).fetchone()[0]
                or ""
            ).split(",")
        }
    ]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--old", required=True)
    parser.add_argument("--new", required=True)
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="即使模型还挂在渠道上也执行")
    args = parser.parse_args(argv)

    conn = sqlite3.connect(args.db)
    try:
        row = conn.execute(
            "SELECT id, tags, is_free FROM models WHERE model_name=? AND deleted_at IS NULL",
            (args.old,),
        ).fetchone()
        if row is None:
            raise SystemExit(f"{args.old}: no live model row")

        clash = conn.execute(
            "SELECT id FROM models WHERE model_name=? AND deleted_at IS NULL", (args.new,)
        ).fetchone()
        if clash:
            raise SystemExit(f"{args.new}: already exists (id={clash[0]})")

        bound = channels_referencing(conn, args.old)
        if bound and not args.force:
            names = ", ".join(f"{cid}:{cname}" for cid, cname in bound)
            raise SystemExit(
                f"{args.old} is bound to channel(s) {names}; update those first or pass --force"
            )

        print(f"model id={row[0]} tags={row[1]!r} is_free={row[2]}")
        if args.dry_run:
            return 0

        backup = f"{args.db}.bak-{time.strftime('%Y%m%d%H%M%S')}"
        shutil.copy2(args.db, backup)
        print("backup:", backup)

        conn.execute(
            "UPDATE models SET model_name=?, updated_time=? WHERE id=?",
            (args.new, int(time.time()), row[0]),
        )
        print(f"renamed {args.old} -> {args.new}")

        for key in KEYS:
            current = conn.execute("SELECT value FROM options WHERE key=?", (key,)).fetchone()
            if not current or not current[0]:
                continue
            mapping = json.loads(current[0])
            if args.old not in mapping:
                continue
            value = mapping.pop(args.old)
            mapping.setdefault(args.new, value)
            conn.execute(
                "UPDATE options SET value=? WHERE key=?",
                (json.dumps(mapping, ensure_ascii=False, separators=(",", ":")), key),
            )
            print(f"{key}: moved, {len(mapping)} models")
        conn.commit()
    finally:
        conn.close()

    print("\nrestart new-api: systemctl restart new-api")
    return 0


if __name__ == "__main__":
    sys.exit(main())
