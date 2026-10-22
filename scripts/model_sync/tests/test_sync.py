"""Unit tests for the metadata sync helpers (stdlib unittest, no deps)."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from model_sync import merge  # noqa: E402
from model_sync.normalize import (  # noqa: E402
    capabilities_from_flags,
    is_free_price,
    model_name_from_id,
    normalize_key,
    normalize_modalities,
)
from model_sync.sources import SourceModel  # noqa: E402


class NormalizeTest(unittest.TestCase):
    def test_model_name_from_id(self):
        self.assertEqual(
            model_name_from_id("anthropic/claude-haiku-4-5:free"), "claude-haiku-4-5"
        )
        self.assertEqual(model_name_from_id("gpt-6.1-sol"), "gpt-6.1-sol")

    def test_normalize_key_matches_aliases(self):
        self.assertEqual(
            normalize_key("claude-haiku-4-5-20251001"), normalize_key("anthropic/claude-haiku-4.5")
        )
        self.assertEqual(normalize_key("claude-opus-5-latest"), "claude-opus-5")
        self.assertEqual(normalize_key("gpt-5.6-sol"), "gpt-5-6-sol")

    def test_modalities_map_pdf_to_file(self):
        self.assertEqual(
            normalize_modalities(["text", "image", "pdf", "pdf"]),
            ["text", "image", "file"],
        )

    def test_capabilities_only_keeps_decision_keys(self):
        caps = capabilities_from_flags(
            {"reasoning": True, "tool_call": True, "attachment": True},
            "claude-opus",
        )
        self.assertEqual(caps, ["reasoning", "tools"])
        self.assertEqual(capabilities_from_flags({}, "text-embedding-3"), ["embedding"])
        self.assertEqual(capabilities_from_flags({}, "bge-reranker"), ["rerank"])

    def test_is_free_price(self):
        self.assertTrue(is_free_price({"input": 0, "output": 0}))
        self.assertFalse(is_free_price({"input": 1, "output": 0}))
        self.assertIsNone(is_free_price({}))


def source(model_name, **kwargs):
    payload = {
        "vendor_key": "anthropic",
        "source": "test",
        "source_id": "anthropic/" + model_name,
        "model_name": model_name,
        "vendor_name": "Anthropic",
        "icon": "Claude.Color",
    }
    payload.update(kwargs)
    return SourceModel(**payload)


class MergeTest(unittest.TestCase):
    def setUp(self):
        self.existing = [
            {
                "model_name": "claude-haiku-4-5-20251001",
                "vendor_name": "Anthropic",
                "description": "本地文案",
                "icon": "Claude.Color",
                "name_rule": 0,
                "status": 1,
                "tags": "自定义标签",
                "capabilities": ["reasoning"],
                "input_modalities": ["text"],
                "output_modalities": ["text"],
                "context_length": 200000,
                "max_output_tokens": 0,
                "is_free": False,
                "endpoints": ["anthropic"],
            }
        ]

    def test_refreshes_factual_fields_only(self):
        index, _ = merge.index_incoming(
            [
                source(
                    "claude-haiku-4-5",
                    capabilities=["reasoning", "tools"],
                    input_modalities=["text", "image", "file"],
                    context_length=200000,
                    max_output_tokens=64000,
                )
            ]
        )
        records, changes, added, ambiguous, missing = merge.merge_metadata(
            self.existing, index
        )
        record = records[0]
        self.assertEqual(record["capabilities"], ["reasoning", "tools"])
        self.assertEqual(record["input_modalities"], ["text", "image", "file"])
        self.assertEqual(record["max_output_tokens"], 64000)
        # local fields survive
        self.assertEqual(record["description"], "本地文案")
        self.assertEqual(record["tags"], "自定义标签")
        self.assertEqual(record["endpoints"], ["anthropic"])
        self.assertEqual(added, [])
        self.assertEqual(ambiguous, [])
        self.assertEqual(missing, [])

    def test_empty_source_values_do_not_wipe_local(self):
        index, _ = merge.index_incoming(
            [source("claude-haiku-4-5", context_length=0, input_modalities=[])]
        )
        records, changes, *_ = merge.merge_metadata(self.existing, index)
        self.assertEqual(records[0]["context_length"], 200000)
        self.assertEqual(records[0]["input_modalities"], ["text"])
        self.assertEqual(changes, [])

    def test_new_models_require_opt_in(self):
        incoming = [source("claude-sonnet-5-new", release_date="2026-05-01")]
        index, _ = merge.index_incoming(incoming)

        records, _, added, *_ = merge.merge_metadata(list(self.existing), index)
        self.assertEqual(added, [])
        self.assertEqual(len(records), 1)

        records, _, added, *_ = merge.merge_metadata(
            list(self.existing), index, allow_new=True, min_release_date="2026-01-01"
        )
        self.assertEqual(added, ["claude-sonnet-5-new"])
        self.assertEqual(records[-1]["tags"], "")
        self.assertEqual(records[-1]["status"], 1)

    def test_max_output_clamped_to_context(self):
        index, _ = merge.index_incoming(
            [source("claude-haiku-4-5", context_length=1000, max_output_tokens=5000)]
        )
        records, *_ = merge.merge_metadata(self.existing, index)
        self.assertEqual(records[0]["max_output_tokens"], 1000)

    def test_price_rows_follow_published_models(self):
        index, _ = merge.index_incoming(
            [
                source(
                    "claude-haiku-4-5",
                    price={"input": 1.0, "output": 5.0, "cache_read": 0.1},
                ),
                source("not-published", price={"input": 9.0, "output": 9.0}),
            ]
        )
        rows = merge.price_records(self.existing, index)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["model_name"], "claude-haiku-4-5-20251001")
        self.assertEqual(rows[0]["input"], 1.0)
        self.assertNotIn("cache_write", rows[0])


if __name__ == "__main__":
    unittest.main()
