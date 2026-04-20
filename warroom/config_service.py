"""
Slice 7 — User preferences & roster service (Python, RED stub).

Parallel to src/warroom-user-preferences.ts. Server uses this module at
boot to apply the user preferences (disabled agents, sidebar order,
added Obsidian agents) on top of the base roster built from the 8
directory-backed entries + config/obsidian-agents.yaml.

GREEN replaces the stubs with real YAML I/O.
"""

from __future__ import annotations

from typing import Any


def load_agent_config(yaml_path: str) -> dict[str, Any]:
    raise NotImplementedError("Slice 7 GREEN will implement load_agent_config")


def save_agent_config(prefs: dict[str, Any], yaml_path: str) -> None:
    raise NotImplementedError("Slice 7 GREEN will implement save_agent_config")


def apply_roster_preferences(
    base_roster: list[dict[str, Any]],
    prefs: dict[str, Any],
) -> list[dict[str, Any]]:
    raise NotImplementedError("Slice 7 GREEN will implement apply_roster_preferences")
