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
    """First source wins for duplicate normalized keys."""
    index = {}
    duplicates = 0
    for model in incoming:
        key = model.key
        if not key:
            continue
        if key in index:
            duplicates += 1
            continue
        index[key] = model
    return index, duplicates


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


def _new_record(model):
    record = {
        "model_name": model.model_name,
        "vendor_name": model.vendor_name,
        "description": model.description or "",
        "icon": model.icon or "",
        "name_rule": DEFAULT_MODEL["name_rule"],
        "status": DEFAULT_MODEL["status"],
        "tags": DEFAULT_MODEL["tags"],
        "capabilities": list(model.capabilities or []),
        "input_modalities": list(model.input_modalities or []),
        "output_modalities": list(model.output_modalities or []),
        "context_length": int(model.context_length or 0),
        "max_output_tokens": int(model.max_output_tokens or 0),
        "is_free": bool(model.is_free),
        "endpoints": None,
    }
    return record


def _refresh(record, model, changes):
    """Apply factual fields, ignoring empty/unknown source values."""
    values = _incoming_values(model)
    for field in FACTUAL_FIELDS:
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


def merge_metadata(existing, index, allow_new=False, min_release_date=""):
    """Return (records, changes, added, ambiguous, missing)."""
    changes = []
    added = []
    ambiguous = []
    matched_keys = set()

    # exact names first, then normalized keys (only when unambiguous)
    by_name = {str(item.get("model_name", "")): item for item in existing}
    by_key = {}
    for item in existing:
        by_key.setdefault(normalize_key(str(item.get("model_name", ""))), []).append(item)

    for record in existing:
        name = str(record.get("model_name", ""))
        model = index.get(normalize_key(name))
        if model is not None:
            candidates = by_key.get(model.key) or []
            if len(candidates) > 1 and name != model.model_name:
                ambiguous.append(name)
                continue
            matched_keys.add(model.key)
            _refresh(record, model, changes)

    if allow_new:
        for key, model in sorted(
            index.items(), key=lambda item: (item[1].vendor_name, item[1].model_name)
        ):
            if key in matched_keys:
                continue
            if min_release_date and (model.release_date or "") < min_release_date:
                continue
            if not model.model_name:
                continue
            existing.append(_new_record(model))
            added.append(model.model_name)
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
        model = index.get(key)
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
