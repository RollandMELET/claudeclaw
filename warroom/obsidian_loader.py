"""
Slice 5 — Obsidian agents loader (Python, RED stub).

Reads config/obsidian-agents.yaml and validates each entry. Used at
War Room startup to merge Obsidian-backed agents into the shared
roster file (/tmp/warroom-agents.json) + extend VALID_AGENTS.

RED phase: both public functions raise NotImplementedError. GREEN
replaces them with the real implementation.
"""

from __future__ import annotations

from typing import Any


def load_agents(yaml_path: str) -> list[dict[str, Any]]:
    """Parse config/obsidian-agents.yaml and return the valid entries.

    Validation (to be implemented in GREEN):
      - ignore entries whose vault_root/project_folder does not exist
      - reject entries where the resolved path escapes vault_root
        (path traversal via ".." components)
    """
    raise NotImplementedError("Slice 5 GREEN will implement load_agents")


def merge_into_roster(
    base_agents: list[dict[str, Any]],
    obsidian_agents: list[dict[str, Any]],
    roster_path: str = "/tmp/warroom-agents.json",
) -> None:
    """Write base_agents + obsidian_agents (dedup by id) to roster_path."""
    raise NotImplementedError("Slice 5 GREEN will implement merge_into_roster")
