"""
Slice 5 — Obsidian agents loader (Python).

Reads config/obsidian-agents.yaml and validates each entry, then merges
the valid agents into the shared roster file (/tmp/warroom-agents.json)
so the existing personas._generate_persona() fallback picks them up
without any change to AGENT_PERSONAS.

Validation mirrors src/warroom-obsidian-agents.ts:
  - missing / empty / malformed YAML → []
  - missing vault_root or project_folder → drop entry
  - path traversal (../..) → drop entry with warning
  - resolved cwd not on disk → drop entry with warning
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

try:
    import yaml  # pyyaml
except ImportError as _exc:  # pragma: no cover — dep comes with pipecat venv
    yaml = None  # type: ignore
    _YAML_IMPORT_ERROR: Exception | None = _exc
else:
    _YAML_IMPORT_ERROR = None

logger = logging.getLogger(__name__)


def _expand_tilde(p: str) -> str:
    """Expand leading ~ via os.path.expanduser."""
    return os.path.expanduser(p)


def load_agents(yaml_path: str) -> list[dict[str, Any]]:
    """Parse config/obsidian-agents.yaml and return validated entries.

    Returns [] on any error (missing file, parse error, no entries).
    Never raises — the voice path must not break on a YAML typo.
    """
    if yaml is None:
        logger.warning(
            "obsidian_loader: pyyaml not installed (%s); skipping load",
            _YAML_IMPORT_ERROR,
        )
        return []

    path = Path(yaml_path)
    if not path.exists():
        return []
    try:
        raw = path.read_text(encoding="utf-8")
    except Exception as exc:
        logger.warning("obsidian_loader: read %s failed: %s", yaml_path, exc)
        return []
    if not raw.strip():
        return []

    try:
        doc = yaml.safe_load(raw)
    except Exception as exc:
        logger.warning("obsidian_loader: YAML parse failed on %s: %s", yaml_path, exc)
        return []

    if not isinstance(doc, dict):
        return []
    entries = doc.get("obsidian_agents")
    if not isinstance(entries, dict):
        return []

    out: list[dict[str, Any]] = []
    for agent_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        vault_root = entry.get("vault_root")
        project_folder = entry.get("project_folder")
        if not vault_root or not project_folder:
            logger.warning(
                "obsidian_loader: %s missing vault_root or project_folder", agent_id
            )
            continue

        vault = Path(_expand_tilde(vault_root)).resolve()
        candidate = (vault / project_folder).resolve()

        # Path traversal guard: candidate must be inside (or equal to) vault.
        try:
            candidate.relative_to(vault)
        except ValueError:
            logger.warning(
                "obsidian_loader: %s project_folder escapes vault_root (traversal), skipping",
                agent_id,
            )
            continue

        if not candidate.is_dir():
            logger.warning(
                "obsidian_loader: %s resolved cwd %s missing, skipping",
                agent_id,
                candidate,
            )
            continue

        out.append({
            "id": agent_id,
            "name": entry.get("name") or agent_id,
            "description": entry.get("description") or "",
            "cwd": str(candidate),
            "voice": entry.get("voice"),
            "avatar": entry.get("avatar"),
            "model": entry.get("model"),
        })
    return out


def merge_into_roster(
    base_agents: list[dict[str, Any]],
    obsidian_agents: list[dict[str, Any]],
    roster_path: str = "/tmp/warroom-agents.json",
) -> None:
    """Write base_agents + obsidian_agents (dedup by id) to roster_path.

    Base entries always win on id collision — an Obsidian YAML can't
    override / hide a hardcoded agent. Obsidian entries are appended in
    iteration order after the base list.

    Also preserves the `cwd` field on Obsidian entries so warroom/server.py
    can forward it to agent-voice-bridge via --cwd at spawn time.
    """
    seen = {a.get("id") for a in base_agents if a.get("id")}
    merged: list[dict[str, Any]] = list(base_agents)
    for obs in obsidian_agents:
        aid = obs.get("id")
        if not aid or aid in seen:
            continue
        merged.append(obs)
        seen.add(aid)

    try:
        Path(roster_path).write_text(
            json.dumps(merged, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("obsidian_loader: write roster %s failed: %s", roster_path, exc)
