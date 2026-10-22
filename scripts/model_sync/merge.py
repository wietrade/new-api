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

from .normalize import CAPABILITY_ORDER, normalize_key

MODALITY_ORDER = ("text", "image", "file", "audio", "video")

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


def _new_record(model, name=None, values=None, skip=None):
    skip = skip or set()
    values = values or _incoming_values(model)
    record = {
        "model_name": name or model.model_name,
        "vendor_name": model.vendor_name,
        "description": model.description or "",
        "icon": model.icon or "",
        "name_rule": DEFAULT_MODEL["name_rule"],
        "status": DEFAULT_MODEL["status"],
        "tags": DEFAULT_MODEL["tags"],
        "capabilities": _ordered_list("capabilities", values.get("capabilities") or ()),
        "input_modalities": _ordered_list(
            "input_modalities", values.get("input_modalities") or ()
        ),
        "output_modalities": _ordered_list(
            "output_modalities", values.get("output_modalities") or ()
        ),
        "context_length": 0 if (model.key, "context_length") in skip
        else int(values.get("context_length") or 0),
        "max_output_tokens": 0 if (model.key, "max_output_tokens") in skip
        else int(values.get("max_output_tokens") or 0),
        "is_free": bool(values.get("is_free")),
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
    _apply_values(record, values, model.key, changes, skip, skipped)


def _meaningful(field, value):
    """Normalize a candidate value; ``None`` means "source has no opinion"."""
    if field == "is_free":
        return None if value is None else bool(value)
    if field in ("context_length", "max_output_tokens"):
        number = int(value or 0)
        return number if number > 0 else None
    if isinstance(value, (list, tuple)):
        return tuple(sorted(value)) if value else None
    return value or None


def _ordered_list(field, values):
    """Restore a deterministic order after set-based comparison."""
    if field == "capabilities":
        return [cap for cap in CAPABILITY_ORDER if cap in values]
    if field in ("input_modalities", "output_modalities"):
        return [mod for mod in MODALITY_ORDER if mod in values]
    return list(values)


def agreed_values(candidates):
    """Per-field values that every candidate agrees on.

    Dated snapshots of one model (``deepseek-v4-pro-20260813`` and
    ``...-20260423``) often agree on the context window but not on max output;
    taking field-level agreement keeps the trustworthy half instead of
    discarding the whole model.
    """
    agreed = {}
    conflicts = set()
    prepared = [_incoming_values(candidate) for candidate in candidates]
    for field in FACTUAL_FIELDS:
        seen = {}
        for values in prepared:
            value = _meaningful(field, values[field])
            if value is not None:
                seen[value] = True
        if len(seen) == 1:
            agreed[field] = next(iter(seen))
        elif len(seen) > 1:
            conflicts.add(field)
    return agreed, conflicts


def _apply_values(record, values, model_key, changes, skip, skipped=None):
    for field in FACTUAL_FIELDS:
        if (model_key, field) in skip:
            if skipped is not None and record.get(field) not in (None, 0, [], "", False):
                skipped.append({"model": record.get("model_name", ""), "field": field})
            continue
        new = _meaningful(field, values.get(field))
        old = record.get(field)
        if new is None:
            continue
        if field == "max_output_tokens":
            context = record.get("context_length") or 0
            if context and new > context:
                new = context
        if field == "is_free":
            new = bool(new)
        elif isinstance(new, tuple):
            new = _ordered_list(field, new)
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


def resolve_values(candidates, tie_break=None, model_name=""):
    """Resolve one model's fact values from all candidate records.

    Agreement wins; when sources disagree, ``tie_break`` (usually
    ``openrouter``, whose limits are the ones actually enforced in serving)
    provides the value and the field is reported as tie-broken. Conflicts with
    no usable tie-break value stay unknown.
    """
    if len(candidates) == 1:
        return _incoming_values(candidates[0]), set(), {}
    values, conflicts = agreed_values(candidates)
    tie_broken = {}
    if tie_break:
        def rank(candidate):
            if candidate.model_name == model_name:
                return 0
            if model_name and (
                candidate.source_id == model_name
                or candidate.source_id.endswith("/" + model_name)
            ):
                return 1
            return 2

        prepared = [
            (c, _incoming_values(c))
            for c in sorted(candidates, key=rank)
        ]
        for field in sorted(conflicts):
            for candidate, candidate_values in prepared:
                if candidate.source != tie_break:
                    continue
                value = _meaningful(field, candidate_values[field])
                if value is not None:
                    values[field] = value
                    tie_broken[field] = tie_break
                    break
        conflicts -= set(tie_broken)
    return values, conflicts, tie_broken


def merge_metadata(existing, index, allow_new=False, min_release_date="",
                   allowed_new=None, skip_fields=None, tie_break=None):
    """Return (records, changes, added, ambiguous, missing).

    ``allowed_new`` restricts creation to an explicit set of model names, so
    补全 can be reviewed model by model instead of trusting every aggregator row.
    ``skip_fields`` is a set of ``(normalized_key, field)`` that sources
    disagree on; those fields are never written.
    """
    changes = []
    added = []
    ambiguous = []
    tie_broken = []
    matched_keys = set()
    skip_fields = set(skip_fields or ())

    # exact names first, then normalized keys (only when unambiguous)
    by_name = {str(item.get("model_name", "")): item for item in existing}

    for record in existing:
        name = str(record.get("model_name", ""))
        model_key = normalize_key(name)
        candidates = index.get(model_key) or []
        if not candidates:
            continue
        if len(candidates) == 1:
            values = _incoming_values(candidates[0])
            conflicts = set()
        else:
            values, conflicts, resolved = resolve_values(candidates, tie_break, name)
            for field, source in resolved.items():
                tie_broken.append({"model": name, "field": field, "source": source})
            if conflicts:
                ambiguous.append(
                    "%s (%s)" % (name, ",".join(sorted(conflicts)))
                )
        conflict_fields = conflicts | {
            field for (key, field) in skip_fields if key == model_key
        }
        matched_keys.add(model_key)
        _apply_values(record, values, model_key, changes, conflict_fields)

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
            if len(candidates) == 1:
                values = _incoming_values(candidates[0])
                conflicts = set()
            else:
                values, conflicts, resolved = resolve_values(
                    candidates, tie_break, name or ""
                )
                for field, source in resolved.items():
                    tie_broken.append(
                        {"model": name, "field": field, "source": source}
                    )
            conflict_fields = conflicts | {
                field for (candidate_key, field) in skip_fields if candidate_key == key
            }
            existing.append(_new_record(model, name, values, conflict_fields))
            existing_names.add(name)
            added.append(name)
            matched_keys.add(key)

    missing = sorted(
        name
        for name in by_name
        if normalize_key(name) not in index
    )
    return existing, changes, added, ambiguous, missing, tie_broken


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


OVERRIDABLE_FIELDS = set(FACTUAL_FIELDS) | {
    "description",
    "icon",
    "tags",
    "endpoints",
    "name_rule",
    "status",
}


def apply_overrides(records, overrides, changes=None):
    """Apply human-verified values on top of every automatic source.

    ``overrides.json`` exists so a conflict between aggregators can be settled
    once, with a link to the vendor doc and the date it was checked, instead of
    leaving the field unknown forever.
    """
    changes = changes if changes is not None else []
    by_name = {str(record.get("model_name", "")): record for record in records}
    applied = 0
    missing = []
    for item in (overrides or {}).get("models", []):
        name = str(item.get("model_name") or "")
        record = by_name.get(name)
        if record is None:
            missing.append(name)
            continue
        for field, value in (item.get("fields") or {}).items():
            if field not in OVERRIDABLE_FIELDS:
                continue
            if record.get(field) == value:
                continue
            changes.append(
                {
                    "model": name,
                    "field": field,
                    "from": record.get(field),
                    "to": value,
                    "via": "override",
                }
            )
            record[field] = value
            applied += 1
    return applied, missing


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
