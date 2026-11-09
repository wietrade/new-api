"""一次性脚本：把 pricing.json 里的上游价统一收进 billing_basis.json。

背景：上游结算价此前有两种落点
  1. ``billing_basis`` 行内副本（6 个 GPT + kimi-k3 + grok-4.7）
  2. 行内顶层 ``*_cny``（DeepSeek / Gemini3.8 / Kimi-k3.1-pro / GLM / Grok4.5-4.6 / 图片）
``price_records()`` 每次重算都会丢掉第 2 类、以及文件里没有的第 1 类。
本脚本把两者都写进 ``billing_basis.json``，让它成为上游价的唯一真源。

只处理「上游来源」的行（aggregator_reference 或已带行内 basis）；
官方牌价行（vendor_official）的 per_image / tiers 属于牌价，不能当结算价收进来。
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASIS = ROOT / "api" / "newapi" / "billing_basis.json"
PRICING = ROOT / "api" / "newapi" / "pricing.json"

TOKEN_PAIRS = (
    ("input", "input_cny"),
    ("output", "output_cny"),
    ("output_text", "output_text_cny"),
    ("output_image", "output_image_cny"),
    ("input_image", "input_image_cny"),
    ("cache_read", "cache_read_cny"),
    ("cache_read_image", "cache_read_image_cny"),
    ("cache_write", "cache_write_cny"),
    ("cache_write_1h", "cache_write_1h_cny"),
    ("cache_write_12h", "cache_write_12h_cny"),
)
AUDIT_KEYS = ("source", "source_url", "retrieved_at", "currency", "fx_to_usd")


def token_entry(row):
    entry = {}
    for usd_field, cny_field in TOKEN_PAIRS:
        cny = row.get(cny_field)
        if cny is None:
            continue
        entry[cny_field] = cny
        if row.get(usd_field) is not None:
            entry[usd_field] = row[usd_field]
    if entry and row.get("tiers"):
        entry["tiers"] = row["tiers"]
    return entry


def image_entry(row):
    if row.get("per_image") is None:
        return {}
    entry = {"per_image_cny": row.get("per_image_cny"), "per_image": row["per_image"]}
    if row.get("meters"):
        entry["meters"] = row["meters"]
    return entry


def main():
    basis_doc = json.loads(BASIS.read_text(encoding="utf-8"))
    data = basis_doc["data"]
    rows = json.loads(PRICING.read_text(encoding="utf-8"))["data"]

    added, conflict = [], []
    for row in rows:
        name = row["model_name"]
        inline = row.get("billing_basis")
        upstream = row.get("price_kind") == "aggregator_reference" or bool(inline)
        if not upstream:
            continue
        entry = image_entry(row) or token_entry(row)
        if not entry and inline:
            entry = {k: v for k, v in inline.items() if k not in AUDIT_KEYS}
        if not entry:
            continue
        # 行级来源与文件级不一致时（例如图片是另一天抓的），把行级信息随结算价一起存，
        # 让生成的 pricing.json 保留真实的取数时间。
        if row.get("price_kind") == "aggregator_reference":
            for key in ("source", "source_url", "retrieved_at"):
                value = row.get(key)
                if value and value != basis_doc.get(key):
                    entry[key] = value
        if name in data:
            if data[name] != entry:
                conflict.append(name)
            continue
        data[name] = entry
        added.append(name)

    basis_doc["data"] = dict(sorted(data.items()))
    BASIS.write_text(json.dumps(basis_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("added %d: %s" % (len(added), added))
    print("conflict (kept existing) %d: %s" % (len(conflict), conflict))
    print("total entries: %d" % len(data))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
