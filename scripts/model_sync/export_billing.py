"""Export the committed price list as new-api billing options.

new-api reads ``billing_setting.billing_mode`` and ``billing_setting.billing_expr``
from the options table. This turns ``pricing.json`` into exactly those two maps,
so a price change is one command instead of hand-editing expressions in the UI.

Usage::

    python -m model_sync.export_billing                 # print JSON
    python -m model_sync.export_billing -o billing.json  # write file

``--alias live=source`` maps a model still deployed under an old name onto the
expression of the model that replaced it (for example a ``:free`` suffix that
was dropped after the model turned out to be paid).
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from .normalize import normalize_key


def load_prices(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def build_payload(prices, aliases=None):
    expressions = {}
    for row in prices.get("data") or []:
        expression = row.get("billing_expr")
        name = str(row.get("model_name") or "")
        if name and expression:
            expressions[name] = expression
    by_key = {normalize_key(name): name for name in expressions}
    for alias, source in (aliases or {}).items():
        target = expressions.get(source) or expressions.get(by_key.get(normalize_key(source)))
        if target is None:
            raise SystemExit(f"alias {alias}: no expression for {source}")
        expressions[alias] = target
    if not expressions:
        raise SystemExit("pricing file has no billing_expr rows")
    return {
        "billing_setting.billing_mode": {name: "tiered_expr" for name in expressions},
        "billing_setting.billing_expr": expressions,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-i",
        "--input",
        default=os.path.join("metadata", "api", "newapi", "pricing.json"),
    )
    parser.add_argument("-o", "--output")
    parser.add_argument(
        "--alias",
        action="append",
        default=[],
        metavar="LIVE=SOURCE",
        help="deployed model name that should reuse the expression of SOURCE",
    )
    args = parser.parse_args(argv)

    aliases = {}
    for item in args.alias:
        if "=" not in item:
            raise SystemExit(f"--alias expects LIVE=SOURCE, got {item!r}")
        live, source = item.split("=", 1)
        aliases[live.strip()] = source.strip()

    payload = build_payload(load_prices(args.input), aliases)
    encoded = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(encoded + "\n")
        count = len(payload["billing_setting.billing_expr"])
        print(f"wrote {count} expressions to {args.output}")
    else:
        print(encoded)


if __name__ == "__main__":
    sys.exit(main())
