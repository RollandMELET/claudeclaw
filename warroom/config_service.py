"""
Slice 7 — User preferences & roster service (Python).

Parallel to src/warroom-user-preferences.ts. Server uses this module at
boot to apply user preferences (disabled agents, sidebar order, added
Obsidian agents) on top of the base roster built from the directory
entries + config/obsidian-agents.yaml.

All helpers degrade gracefully: missing / malformed YAML → empty
defaults; unwritable target path → silent no-op with a warning.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

try:
    import yaml  # pyyaml
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore

logger = logging.getLogger(__name__)

_EMPTY: dict[str, Any] = {
    "disabled_agents": [],
    "order": [],
    "added_obsidian_agents": [],
}


def _sanitize_str_list(v: Any) -> list[str]:
    if not isinstance(v, list):
        return []
    return [x for x in v if isinstance(x, str)]


def _sanitize_added(v: Any) -> list[dict[str, Any]]:
    if not isinstance(v, list):
        return []
    out: list[dict[str, Any]] = []
    for e in v:
        if not isinstance(e, dict):
            continue
        aid = e.get("id")
        vault = e.get("vault_root")
        project = e.get("project_folder")
        if not isinstance(aid, str) or not aid:
            continue
        if not isinstance(vault, str) or not vault:
            continue
        if not isinstance(project, str) or not project:
            continue
        out.append({
            "id": aid,
            "name": e.get("name") if isinstance(e.get("name"), str) else aid,
            "description": e.get("description") if isinstance(e.get("description"), str) else "",
            "vault_root": vault,
            "project_folder": project,
            "voice": e.get("voice") if isinstance(e.get("voice"), str) else "kokoro",
            **({"avatar": e["avatar"]} if isinstance(e.get("avatar"), str) else {}),
            **({"model": e["model"]} if isinstance(e.get("model"), str) else {}),
        })
    return out


def load_agent_config(yaml_path: str) -> dict[str, Any]:
    """Parse config/user-preferences.yaml (or the given path) and
    return a normalized UserPreferences dict. Never raises.
    """
    if yaml is None:
        logger.warning("config_service: pyyaml unavailable; returning empty prefs")
        return dict(_EMPTY, disabled_agents=[], order=[], added_obsidian_agents=[])

    path = Path(yaml_path)
    if not path.exists():
        return {"disabled_agents": [], "order": [], "added_obsidian_agents": []}
    try:
        raw = path.read_text(encoding="utf-8")
    except Exception as exc:
        logger.warning("config_service: read %s failed: %s", yaml_path, exc)
        return {"disabled_agents": [], "order": [], "added_obsidian_agents": []}
    if not raw.strip():
        return {"disabled_agents": [], "order": [], "added_obsidian_agents": []}
    try:
        doc = yaml.safe_load(raw)
    except Exception as exc:
        logger.warning("config_service: YAML parse failed: %s", exc)
        return {"disabled_agents": [], "order": [], "added_obsidian_agents": []}
    if not isinstance(doc, dict):
        return {"disabled_agents": [], "order": [], "added_obsidian_agents": []}
    return {
        "disabled_agents": _sanitize_str_list(doc.get("disabled_agents")),
        "order": _sanitize_str_list(doc.get("order")),
        "added_obsidian_agents": _sanitize_added(doc.get("added_obsidian_agents")),
    }


def save_agent_config(prefs: dict[str, Any], yaml_path: str) -> None:
    """Persist prefs to yaml_path via write-then-rename. Never raises.
    Target directory is auto-created best-effort.
    """
    if yaml is None:
        logger.warning("config_service: pyyaml unavailable; save skipped")
        return
    payload = {
        "disabled_agents": _sanitize_str_list(prefs.get("disabled_agents")),
        "order": _sanitize_str_list(prefs.get("order")),
        "added_obsidian_agents": _sanitize_added(prefs.get("added_obsidian_agents")),
    }
    path = Path(yaml_path)
    try:
        if path.parent and not path.parent.exists():
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
            except Exception:
                pass
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(
            yaml.safe_dump(payload, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        os.replace(tmp, path)
    except Exception as exc:
        logger.warning("config_service: save %s failed: %s", yaml_path, exc)


def apply_roster_preferences(
    base_roster: list[dict[str, Any]],
    prefs: dict[str, Any],
) -> list[dict[str, Any]]:
    """Filter disabled, reorder, append added Obsidian agents.

    Mirrors the TypeScript applyUserPreferences so both surfaces
    produce the same final roster from the same inputs.
    """
    disabled = set(_sanitize_str_list(prefs.get("disabled_agents")))
    order = _sanitize_str_list(prefs.get("order"))
    added = _sanitize_added(prefs.get("added_obsidian_agents"))

    filtered = [a for a in base_roster if isinstance(a, dict) and a.get("id") not in disabled]

    if not order:
        ordered = filtered
    else:
        by_id = {a["id"]: a for a in filtered if a.get("id")}
        seen: set[str] = set()
        front: list[dict[str, Any]] = []
        for aid in order:
            if aid in by_id and aid not in seen:
                front.append(by_id[aid])
                seen.add(aid)
        rest = [a for a in filtered if a.get("id") not in seen]
        ordered = front + rest

    final_list = list(ordered)
    existing_ids = {a.get("id") for a in final_list}
    for extra in added:
        if extra["id"] in disabled:
            continue
        if extra["id"] in existing_ids:
            continue
        entry = {
            "id": extra["id"],
            "name": extra.get("name") or extra["id"],
            "description": extra.get("description") or "",
            "origin": "obsidian",
        }
        for k in ("vault_root", "project_folder", "voice", "avatar", "model"):
            if k in extra and extra[k] is not None:
                entry[k] = extra[k]
        final_list.append(entry)
        existing_ids.add(extra["id"])
    return final_list
