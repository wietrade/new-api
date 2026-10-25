#!/usr/bin/env python3
"""巡检 Claude 模型的路由协议。

Claude 的缓存写入（5m/1h）只在 Anthropic 原生协议下回传；一旦 Claude 模型被
非 Anthropic 渠道（如 type=59 sub2api）承载，这部分用量会静默变成免费。
本脚本只读数据库，发现以下情况时以退出码 1 结束，便于挂 cron 告警：

1. Claude 模型挂在非 Anthropic 渠道上；
2. 同一分组里同时存在 Anthropic 与非 Anthropic 的 Claude 渠道（请求会随机落点）。

用法::

    python3 scripts/ops/audit_claude_protocol.py
    python3 scripts/ops/audit_claude_protocol.py --db /path/to/one-api.db
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from collections import defaultdict

DEFAULT_DB = "/www/wwwroot/new-api/data/one-api.db"
ANTHROPIC_CHANNEL_TYPE = 14


def is_claude(model: str) -> bool:
    return (model or "").strip().lower().startswith("claude")


def audit(db_path: str) -> int:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    rows = conn.execute(
        """
        SELECT a.channel_id, a.model, a."group", a.enabled,
               c.name, c.type, c.status
          FROM abilities a
          JOIN channels c ON c.id = a.channel_id
         WHERE lower(a.model) LIKE 'claude%'
         ORDER BY a."group", a.model, a.channel_id
        """
    ).fetchall()
    if not rows:
        print("没有找到任何 Claude 模型的渠道绑定")
        return 0

    problems: list[str] = []
    per_group: dict[str, set[int]] = defaultdict(set)
    channels: dict[int, tuple[str, int, int]] = {}

    for channel_id, model, group, enabled, name, ctype, status in rows:
        channels[channel_id] = (name, ctype, status)
        if not enabled or status != 1:
            continue
        per_group[group].add(ctype)
        if ctype != ANTHROPIC_CHANNEL_TYPE:
            problems.append(
                f"渠道 {channel_id}「{name}」类型 {ctype} 承载 Claude 模型 {model}（分组 {group}）"
            )

    for group, types_ in per_group.items():
        if ANTHROPIC_CHANNEL_TYPE in types_ and len(types_) > 1:
            others = sorted(t for t in types_ if t != ANTHROPIC_CHANNEL_TYPE)
            problems.append(
                f"分组 {group} 同时存在 Anthropic 渠道与非 Anthropic 渠道（type {others}），"
                "请求会随机落到非原生渠道"
            )

    print(f"检查了 {len(channels)} 个渠道、{len(rows)} 条 Claude 模型绑定")
    for channel_id, (name, ctype, status) in sorted(channels.items()):
        mark = "OK  " if ctype == ANTHROPIC_CHANNEL_TYPE else "FAIL"
        print(f"  [{mark}] 渠道 {channel_id:>3} type={ctype:<3} status={status} {name}")

    if problems:
        print("\n发现 %d 个问题：" % len(problems))
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("\nClaude 模型全部走 Anthropic 原生渠道，无混跑。")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="巡检 Claude 模型的渠道协议")
    parser.add_argument("--db", default=DEFAULT_DB, help="SQLite 数据库路径")
    args = parser.parse_args(argv)
    try:
        return audit(args.db)
    except sqlite3.Error as exc:
        print(f"读取数据库失败: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
