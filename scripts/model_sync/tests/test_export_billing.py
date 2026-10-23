"""The exported options must be a pure function of the committed price list."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from model_sync import export_billing  # noqa: E402


class ExportBillingTest(unittest.TestCase):
    def test_every_row_with_expression_becomes_tiered_expr(self):
        prices = {
            "data": [
                {"model_name": "gpt-5.4", "billing_expr": 'tier("standard", p * 2.5)'},
                {"model_name": "unpriced", "billing_expr": None},
            ]
        }
        payload = export_billing.build_payload(prices)
        self.assertEqual(
            payload["billing_setting.billing_mode"], {"gpt-5.4": "tiered_expr"}
        )
        self.assertEqual(
            payload["billing_setting.billing_expr"], {"gpt-5.4": 'tier("standard", p * 2.5)'}
        )

    def test_alias_reuses_source_expression(self):
        prices = {
            "data": [
                {"model_name": "minimax-m3.1-flash", "billing_expr": 'tier("standard", p * 0.15 + c * 0.6)'}
            ]
        }
        payload = export_billing.build_payload(
            prices, {"minimax-m3.1-flash:free": "minimax-m3.1-flash"}
        )
        expressions = payload["billing_setting.billing_expr"]
        self.assertEqual(
            expressions["minimax-m3.1-flash:free"], 'tier("standard", p * 0.15 + c * 0.6)'
        )

    def test_unknown_alias_source_is_an_error(self):
        prices = {"data": [{"model_name": "a", "billing_expr": 'tier("standard", p * 1)'}]}
        with self.assertRaises(SystemExit):
            export_billing.build_payload(prices, {"b": "missing"})


if __name__ == "__main__":
    unittest.main()
