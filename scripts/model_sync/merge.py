"""Merge source data into the committed metadata documents.

Merge policy (deliberate, keeps hand-maintained content alive):

* factual fields are refreshed from sources: vendor, capabilities, modalities,
  context window, max output, free flag
* local fields are never overwritten: description, icon, tags, endpoints,
  name_rule, status  (`tags` is user-owned by design)
* existing models missing from every source are kept as-is
* new models are only created with ``--allow-new`` (plus optional release-date
  floor), so an aggregator adding hundreds of models cannot flood the plaza
* ambiguous matches (same normalized key, several candidates) are reported and
  left untouched
"""

from __future__ import annotations

from .normalize import normalize_key

FACTUAL_FIELDS = (
    "vendor_name",
    "capabilities",
    "input_modalities",
    "output_modalities",
    "context_length",
    "max_output_tokens",
    "is_free",
)

DEFAULT_MODEL = {
    "vendor_name": "",
    "description": "",
    "icon": "",
    "name_rule": 0,
    "status": 1,
    "tags": "",
    "capabilities": [],
    "input_modalities": [],
    "output_modalities": [],
    "context_length": 0,
    "max_output_tokens": 0,
    "is_free": False,
    "endpoints": None,
}


def index_incoming(incoming):
    """Group sources by normalized key, in source-priority order.

    Multiple entries for one key are kept (models.dev and openrouter disagree
    often enough that dropping them would hide real conflicts).
    """
    index = {}
    duplicates = 0
    for model in incoming:
        key = model.key
        if not key:
            continue
        bucket = index.setdefault(key, [])
        if bucket:
            duplicates += 1
        bucket.append(model)
    return index, duplicates


def pick_incoming(candidates, model_name):
    """Choose the candidate that best matches a concrete model name.

    1. identical model name (``gpt-5.6-sol`` == ``gpt-5.6-sol``)
    2. source id ending with the name (``anthropic/claude-haiku-4-5``)
    3. highest-priority source (first in ``--sources`` order)
    """
    if not candidates:
        return None
    for candidate in candidates:
        if candidate.model_name == model_name:
            return candidate
    for candidate in candidates:
        if candidate.source_id.endswith("/" + model_name) or candidate.source_id == model_name:
            return candidate
    return candidates[0]


CONFLICT_FIELDS = ("context_length", "max_output_tokens")


def detect_conflicts(index):
    """Report keys where sources disagree on a factual field.

    Silent "first source wins" is how a 1.05M context window becomes 1.31M
    in production, so disagreements are surfaced explicitly.
    """
    conflicts = []
    for key, candidates in index.items():
        if len(candidates) < 2:
            continue
        for field in CONFLICT_FIELDS:
            values = {}
            for candidate in candidates:
                value = int(getattr(candidate, field) or 0)
                if value > 0:
                    values.setdefault(value, []).append(candidate.source)
            if len(values) > 1:
                conflicts.append(
                    {
                        "key": key,
                        "field": field,
                        "values": {
                            value: sorted(set(sources))
                            for value, sources in values.items()
                        },
                    }
                )
    return conflicts


def _incoming_values(model):
    return {
        "vendor_name": model.vendor_name,
        "capabilities": list(model.capabilities or []),
        "input_modalities": list(model.input_modalities or []),
        "output_modalities": list(model.output_modalities or []),
        "context_length": int(model.context_length or 0),
        "max_output_tokens": int(model.max_output_tokens or 0),
        "is_free": model.is_free,
    }


def _new_record(model, name=None, skip=None):
    skip = skip or set()
    record = {
        "model_name": name or model.model_name,
        "vendor_name": model.vendor_name,
        "description": model.description or "",
        "icon": model.icon or "",
        "name_rule": DEFAULT_MODEL["name_rule"],
        "status": DEFAULT_MODEL["status"],
        "tags": DEFAULT_MODEL["tags"],
        "capabilities": list(model.capabilities or []),
        "input_modalities": list(model.input_modalities or []),
        "output_modalities": list(model.output_modalities or []),
        "context_length": 0 if (model.key, "context_length") in skip
        else int(model.context_length or 0),
        "max_output_tokens": 0 if (model.key, "max_output_tokens") in skip
        else int(model.max_output_tokens or 0),
        "is_free": bool(model.is_free),
        "endpoints": None,
    }
    return record


def _refresh(record, model, changes, skip=None, skipped=None):
    """Apply factual fields, ignoring empty/unknown source values.

    Fields listed in ``skip`` (source disagreement) are left untouched: a
    guessed context window is worse than an unknown one.
    """
    skip = skip or set()
    values = _incoming_values(model)
    for field in FACTUAL_FIELDS:
        if (model.key, field) in skip:
            if skipped is not None and record.get(field) is not None:
                skipped.append({"model": record.get("model_name", ""), "field": field})
            continue
        new = values[field]
        old = record.get(field)

        if new is None or new == "" or new == []:
            continue
        if field in ("context_length", "max_output_tokens") and new <= 0:
            continue

        if field == "max_output_tokens":
            context = record.get("context_length") or 0
            if context and new > context:
                new = context

        if old != new:
            changes.append(
                {
                    "model": record.get("model_name", ""),
                    "field": field,
                    "from": old,
                    "to": new,
                }
            )
            record[field] = new


def merge_metadata(existing, index, allow_new=False, min_release_date="",
                   allowed_new=None, skip_fields=None):
    """Return (records, changes, added, ambiguous, missing).

    ``allowed_new`` restricts creation to an explicit set of model names, so
    补全 can be reviewed model by model instead of trusting every aggregator row.
    ``skip_fields`` is a set of ``(normalized_key, field)`` that sources
    disagree on; those fields are never written.
    """
    changes = []
    added = []
    ambiguous = []
    matched_keys = set()
    skip_fields = set(skip_fields or ())

    # exact names first, then normalized keys (only when unambiguous)
    by_name = {str(item.get("model_name", "")): item for item in existing}

    for record in existing:
        name = str(record.get("model_name", ""))
        candidates = index.get(normalize_key(name)) or []
        if not candidates:
            continue
        model = pick_incoming(candidates, name)
        ambiguous_names = {c.model_name for c in candidates}
        if len(ambiguous_names) > 1 and model.model_name != name:
            ambiguous.append(name)
            continue
        matched_keys.add(model.key)
        _refresh(record, model, changes, skip=skip_fields)

    if allow_new:
        pending = {
            normalize_key(name): name for name in (allowed_new or ()) if name
        }
        existing_names = {str(item.get("model_name", "")) for item in existing}
        for key, candidates in sorted(
            index.items(),
            key=lambda item: (item[1][0].vendor_name, item[1][0].model_name),
        ):
            desired = pending.get(key) if pending else None
            if pending and desired is None:
                continue
            if desired is not None and desired in existing_names:
                continue
            if key in matched_keys and desired is None:
                continue
            model = pick_incoming(candidates, desired or "")
            if min_release_date and (model.release_date or "") < min_release_date:
                continue
            name = desired or model.model_name
            if not name:
                continue
            existing.append(_new_record(model, name, skip_fields))
            existing_names.add(name)
            added.append(name)
            matched_keys.add(key)

    missing = sorted(
        name
        for name in by_name
        if normalize_key(name) not in index
    )
    return existing, changes, added, ambiguous, missing


def price_records(existing, index):
    """Build the pricing.json rows for models we actually publish."""
    rows = []
    seen = set()
    for record in existing:
        name = str(record.get("model_name", ""))
        key = normalize_key(name)
        if key in seen:
            continue
        candidates = index.get(key) or []
        model = pick_incoming(candidates, name)
        if model is None or not model.price:
            continue
        seen.add(key)
        row = {
            "model_name": name,
            "vendor_name": record.get("vendor_name") or model.vendor_name,
            "source": model.source,
            "source_model_id": model.source_id,
            "currency": "USD",
            "unit": "per_1m_tokens",
        }
        for component in ("input", "output", "cache_read", "cache_write"):
            value = model.price.get(component)
            if value is not None:
                row[component] = value
        rows.append(row)

    rows.sort(key=lambda item: (item["vendor_name"], item["model_name"]))
    return rows


def ensure_vendors(vendors, models):
    """Append vendor entries referenced by models but missing from vendors.json."""
    known = {str(item.get("name", "")) for item in vendors}
    added = []
    for record in sorted(models, key=lambda item: str(item.get("vendor_name", ""))):
        name = str(record.get("vendor_name", ""))
        if not name or name in known:
            continue
        known.add(name)
        vendors.append(
            {
                "name": name,
                "description": "",
                "icon": str(record.get("icon", "")),
                "status": 1,
            }
        )
        added.append(name)
    return added
