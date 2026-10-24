#!/usr/bin/env python3
"""校验 metadata/ 下发数据的内部一致性与可复现性。

覆盖三类问题：
  1. 元数据本身（模型清单 / 枚举 / 字段合法性 / 免费标记 / 阶梯阈值）
  2. 价格快照（覆盖完整性 / 表达式可由价格字段复现 / 与官方抄录一致）
  3. 线上漂移（给出 --live 时，对比 new-api options 里实际生效的 billing_expr）

用法：
    python -m scripts.model_sync.validate
    python -m scripts.model_sync.validate --live /tmp/expr.json   # {model: expr}
    python -m scripts.model_sync.validate --strict                # 警告也算失败

日志分三级：ERROR（数据错误，退出码 1）、WARN（应尽快修，不阻断）、INFO。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in (None, ""):  # 允许直接 python scripts/model_sync/validate.py
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from scripts.model_sync import expr as expr_mod
    from scripts.model_sync.normalize import CAPABILITY_ORDER
else:
    from . import expr as expr_mod
    from .normalize import CAPABILITY_ORDER

ROOT = Path(__file__).resolve().parents[2]
META = ROOT / "metadata" / "api"

INPUT_MODALITIES = {"text", "image", "audio", "video", "file"}
OUTPUT_MODALITIES = {"text", "image", "audio", "video"}
PRICE_KINDS = {"vendor_official", "aggregator_reference", "free"}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.infos: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def info(self, msg: str) -> None:
        self.infos.append(msg)

    def print(self) -> None:
        for title, items in (("ERROR", self.errors), ("WARN", self.warnings), ("INFO", self.infos)):
            if not items:
                continue
            print(f"\n{title} ({len(items)})")
            for item in items:
                print(f"  - {item}")


def load(path: Path):
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("data", data) if isinstance(data, dict) else data


def check_metadata(models, vendors, report: Report):
    vendor_names = {v.get("name") or v.get("vendor_name") for v in vendors}
    seen: dict[str, int] = {}
    caps_allowed = set(CAPABILITY_ORDER)

    for item in models:
        name = str(item.get("model_name") or "")
        seen[name] = seen.get(name, 0) + 1
        if not name:
            report.error("存在没有 model_name 的记录")
            continue

        vendor = item.get("vendor_name")
        if not vendor:
            report.error(f"{name}: vendor_name 为空")
        elif vendor not in vendor_names:
            report.error(f"{name}: vendor_name「{vendor}」不在 vendors.json 中")

        for cap in item.get("capabilities") or []:
            if cap not in caps_allowed:
                report.error(f"{name}: 未知 capability「{cap}」（不在 normalize.CAPABILITY_ORDER）")
        for value in item.get("input_modalities") or []:
            if value not in INPUT_MODALITIES:
                report.error(f"{name}: 未知 input_modality「{value}」")
        for value in item.get("output_modalities") or []:
            if value not in OUTPUT_MODALITIES:
                report.error(f"{name}: 未知 output_modality「{value}」")

        ctx = item.get("context_length") or 0
        out = item.get("max_output_tokens") or 0
        if ctx and out and out > ctx:
            report.error(f"{name}: max_output_tokens {out} 大于 context_length {ctx}")
        if not ctx:
            report.warn(f"{name}: context_length 缺失（0）")
        if not out:
            report.warn(f"{name}: max_output_tokens 缺失（0）")
        if not (item.get("capabilities") or []):
            report.warn(f"{name}: capabilities 为空")
        if not item.get("tags"):
            report.warn(f"{name}: tags 为空")
        if not item.get("description"):
            report.warn(f"{name}: description 为空")
        if not item.get("icon"):
            report.warn(f"{name}: icon 为空")

        if name.endswith(":free") and not item.get("is_free"):
            report.error(f"{name}: 名称以 :free 结尾，但 is_free 不是 true")
        status = item.get("status", 1)
        if status not in (0, 1):
            report.error(f"{name}: status 只能是 0/1，实际 {status}")
        rule = item.get("name_rule", 0)
        if rule not in (0, 1, 2, 3):
            report.error(f"{name}: name_rule 只能是 0-3，实际 {rule}")

    for name, count in seen.items():
        if count > 1:
            report.error(f"model_name 重复 {count} 次: {name}")


def check_i18n(base_models, report: Report):
    base = {m["model_name"]: m for m in base_models}
    for locale in ("en", "zh"):
        path = META / "i18n" / locale / "newapi" / "models.json"
        if not path.exists():
            report.warn(f"缺少 {locale} 语言包: {path.relative_to(ROOT)}")
            continue
        rows = {m["model_name"]: m for m in load(path)}
        if set(rows) != set(base):
            report.error(
                f"{locale} 语言包模型与基准不一致: 多 {sorted(set(rows) - set(base))[:5]} / 少 {sorted(set(base) - set(rows))[:5]}"
            )
        same = [
            name
            for name in rows
            if name in base and rows[name].get("description") == base[name].get("description")
        ]
        if same:
            report.warn(
                f"{locale} 语言包有 {len(same)} 条描述与基准完全相同（未翻译），例如 {same[:3]}"
            )


def check_pricing(models, pricing, official, context_by_name, report: Report):
    model_names = {m["model_name"] for m in models}
    rows = {row["model_name"]: row for row in pricing}
    official_by_name = {row["model_name"]: row for row in official}

    missing = model_names - set(rows)
    extra = set(rows) - model_names
    if missing:
        report.error(f"已发布模型缺价格行: {sorted(missing)[:8]}")
    if extra:
        report.error(f"价格行没有对应模型（死配置）: {sorted(extra)[:8]}")

    for name, row in rows.items():
        kind = row.get("price_kind")
        if kind not in PRICE_KINDS:
            report.error(f"{name}: 未知 price_kind「{kind}」")

        # 表达式必须能由价格字段确定性复现，否则快照与字段已经漂移
        expected, _ = expr_mod.build(row)
        if expected != row.get("billing_expr"):
            report.error(
                f"{name}: billing_expr 无法由价格字段复现\n      字段生成: {expected}\n      文件内容: {row.get('billing_expr')}"
            )

        # 阶梯阈值应当落在上下文窗口内，否则该档永远不会触发。
        # 这里只报警告：context_length 与官方档位孰对孰错需要人工确认。
        ctx = context_by_name.get(name) or 0
        for tier in row.get("tiers") or []:
            threshold = tier.get("prompt_tokens_at_least") or 0
            if ctx and threshold >= ctx:
                report.warn(
                    f"{name}: 阶梯阈值 {threshold} 不小于 context_length {ctx}"
                    "（长档不会触发，请核对上下文或阈值）"
                )

        if kind == "free" and any((row.get(k) or 0) > 0 for k in ("input", "output")):
            report.error(f"{name}: price_kind=free 但基础价不为 0")

        # 官方抄录是最高优先级，快照必须与之一致
        listed = official_by_name.get(name)
        if listed:
            for field in ("input", "output", "cache_read", "cache_write", "cache_write_1h"):
                want = listed.get(field)
                if want is None:
                    continue
                got = row.get(field)
                if got is None or abs(float(got) - float(want)) > 1e-9:
                    report.error(f"{name}: {field} 与官方抄录不一致（官方 {want} / 快照 {got}）")


def check_live(pricing, live, report: Report):
    catalog = {row["model_name"]: row.get("billing_expr") for row in pricing}
    drift = [name for name, value in live.items() if catalog.get(name) != value]
    if drift:
        report.error(
            f"线上生效价格与 catalog 不一致 {len(drift)} 条: {drift[:6]}"
            "（改价必须走 scripts/ops/apply_billing.py，不要直接改库）"
        )
    unknown = set(live) - set(catalog)
    if unknown:
        report.warn(f"线上存在 catalog 未登记的价格: {sorted(unknown)[:6]}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="校验 metadata 与价格快照")
    parser.add_argument("--live", help="线上 billing_expr JSON（{model: expr}），用于检测漂移")
    parser.add_argument("--strict", action="store_true", help="把 WARN 也计为失败")
    args = parser.parse_args(argv)

    models = load(META / "newapi" / "models.json")
    vendors = load(META / "newapi" / "vendors.json")
    pricing = load(META / "newapi" / "pricing.json")
    official = load(META / "newapi" / "pricing.official.json")

    report = Report()
    check_metadata(models, vendors, report)
    check_i18n(models, report)

    context = {m["model_name"]: m.get("context_length") or 0 for m in models}
    check_pricing(models, pricing, official, context, report)

    if args.live:
        with open(args.live, encoding="utf-8") as handle:
            check_live(pricing, json.load(handle), report)

    print(
        f"models={len(models)} vendors={len(vendors)} pricing={len(pricing)} "
        f"official={len(official)}"
    )
    report.print()
    if report.errors or (args.strict and report.warnings):
        print(f"\n失败：{len(report.errors)} 个错误 / {len(report.warnings)} 个警告")
        return 1
    print(f"\n通过：0 个错误 / {len(report.warnings)} 个警告")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
