"""一次性脚本：把 znbcode 多模态（按张计费）模型写入 pricing.json。

上游计价事实（2026-10-26 model-plaza + /usage 实扣核对）：
  组                upstream rate  1K 价（CNY）  2K/4K 价（CNY）
  gpt-image-原生          1.0            0.12          0.12
  gpt-image-1K特惠        1.0            0.06          0.06
  znb-grok-studio         0.15*          0.50          0.6875   (*image_rate_multiplier=0.16)
  znb-nano-banana         1.0            0.08          0.08

表达式只写结算单价（上游标价 ÷ 6.8），加价 1.5× 落在分组倍率上。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.model_sync import expr as expr_mod  # noqa: E402

PRICING = ROOT / "metadata" / "api" / "newapi" / "pricing.json"
RETRIEVED = "2026-10-26T03:00:00+08:00"

# 上游标价（CNY）/ 6.8 → 结算 USD 单价，6 位小数与既有行一致
USD = {
    "0.12": 0.017647,
    "0.5": 0.073529,
    "0.6875": 0.101103,
    "0.08": 0.011765,
}

GROK_SIZE_METERS = [
    # 默认档必须排在首位：客户端不传 size 时按 2K/4K 计价（上游默认更高）
    {"dim": "output_image", "price": USD["0.6875"], "unit": "image"},
    {"dim": "output_image", "price": USD["0.5"], "unit": "image", "when": {"size": "1024x1024"}},
]


def image_row(model: str, vendor: str, usd: float, cny: float, meters) -> dict:
    row = {
        "model_name": model,
        "vendor_name": vendor,
        "price_kind": "aggregator_reference",
        "source_kind": "aggregator",
        "source": "znbcode:model-plaza",
        "source_url": "https://znbcode.com/api/v1/model-plaza",
        "retrieved_at": RETRIEVED,
        "currency": "USD",
        "unit": "per_image",
        "per_image": usd,
        "per_image_cny": cny,
        "fx_to_usd": 6.8,
        "meters": meters,
        "billing_mode": "tiered_expr",
    }
    expression, skipped = expr_mod.build(row)
    if not expression:
        raise SystemExit(f"{model}: 无法生成表达式 {skipped}")
    row["billing_expr"] = expression
    return row


def flat(usd: float, cny: float):
    return [{"dim": "output_image", "price": usd, "unit": "image", "when": None}]


def main() -> int:
    payload = json.loads(PRICING.read_text(encoding="utf-8"))
    rows = payload["data"]
    existing = {row["model_name"] for row in rows}

    wanted = [
        image_row("gpt-image-2", "OpenAI", USD["0.12"], 0.12, [{"dim": "output_image", "price": USD["0.12"], "unit": "image"}]),
        image_row("gpt-image-2.5", "OpenAI", USD["0.12"], 0.12, [{"dim": "output_image", "price": USD["0.12"], "unit": "image"}]),
        image_row("gpt-image-2.5-flare", "OpenAI", USD["0.12"], 0.12, [{"dim": "output_image", "price": USD["0.12"], "unit": "image"}]),
        image_row("gpt-image-medium", "OpenAI", USD["0.12"], 0.12, [{"dim": "output_image", "price": USD["0.12"], "unit": "image"}]),
        image_row("grok-imagine-image", "xAI", USD["0.6875"], 0.6875, GROK_SIZE_METERS),
        image_row("grok-imagine-image-2.0", "xAI", USD["0.6875"], 0.6875, GROK_SIZE_METERS),
        image_row("grok-imagine-image-quality", "xAI", USD["0.6875"], 0.6875, GROK_SIZE_METERS),
        image_row("gemini-nano-banana-2.1", "Google", USD["0.08"], 0.08, [{"dim": "output_image", "price": USD["0.08"], "unit": "image"}]),
    ]

    added = 0
    for row in wanted:
        if row["model_name"] in existing:
            print(f"skip existing: {row['model_name']}")
            continue
        rows.append(row)
        added += 1
        print(f"+ {row['model_name']}: {row['billing_expr']}")

    payload["data"] = rows
    PRICING.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nadded {added} rows, total {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
