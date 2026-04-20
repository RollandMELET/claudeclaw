"""
Slice 7 — Settings & roster management (Python, RED).

Parallel to src/warroom-user-preferences.ts. The Python side is
consumed by warroom/server.py at boot to apply the user's roster
preferences before writing /tmp/warroom-agents.json.

Runs in any venv with pytest + pyyaml.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parent))


def test_load_agent_config_returns_empty_defaults_when_file_missing(tmp_path):
    from config_service import load_agent_config

    missing = tmp_path / "nope.yaml"
    prefs = load_agent_config(str(missing))
    assert prefs == {"disabled_agents": [], "order": [], "added_obsidian_agents": []}


def test_load_agent_config_returns_empty_defaults_on_empty_yaml(tmp_path):
    from config_service import load_agent_config

    empty = tmp_path / "empty.yaml"
    empty.write_text("")
    prefs = load_agent_config(str(empty))
    assert prefs == {"disabled_agents": [], "order": [], "added_obsidian_agents": []}


def test_load_agent_config_parses_valid_yaml(tmp_path):
    from config_service import load_agent_config

    y = tmp_path / "prefs.yaml"
    y.write_text(
        """disabled_agents:
  - research
  - qonto
order:
  - main
  - rc2
added_obsidian_agents:
  - id: rorworld-warroom
    name: RoRworld Admin
    description: compta
    vault_root: ~/Vault
    project_folder: Proj
    voice: kokoro
"""
    )
    prefs = load_agent_config(str(y))
    assert prefs["disabled_agents"] == ["research", "qonto"]
    assert prefs["order"] == ["main", "rc2"]
    assert len(prefs["added_obsidian_agents"]) == 1
    assert prefs["added_obsidian_agents"][0]["id"] == "rorworld-warroom"


def test_save_agent_config_round_trips(tmp_path):
    from config_service import load_agent_config, save_agent_config

    y = tmp_path / "rt.yaml"
    payload = {
        "disabled_agents": ["research"],
        "order": ["main", "rc2"],
        "added_obsidian_agents": [
            {
                "id": "custom",
                "name": "Custom",
                "description": "",
                "vault_root": "~/V",
                "project_folder": "P",
                "voice": "kokoro",
            }
        ],
    }
    save_agent_config(payload, str(y))
    assert y.exists()
    roundtripped = load_agent_config(str(y))
    assert roundtripped == payload


def test_apply_roster_preferences_filters_and_reorders(tmp_path):
    from config_service import apply_roster_preferences

    base = [
        {"id": "main", "name": "Main", "description": ""},
        {"id": "research", "name": "Research", "description": ""},
        {"id": "comms", "name": "Comms", "description": ""},
        {"id": "rc2", "name": "RC2", "description": ""},
    ]
    prefs = {
        "disabled_agents": ["research"],
        "order": ["rc2", "main"],
        "added_obsidian_agents": [],
    }
    out = apply_roster_preferences(base, prefs)
    assert [a["id"] for a in out] == ["rc2", "main", "comms"]


def test_apply_roster_preferences_appends_added_obsidian(tmp_path):
    from config_service import apply_roster_preferences

    base = [{"id": "main", "name": "Main", "description": ""}]
    prefs = {
        "disabled_agents": [],
        "order": [],
        "added_obsidian_agents": [
            {
                "id": "rorworld-warroom",
                "name": "RoRworld",
                "description": "obs",
                "vault_root": "~/V",
                "project_folder": "P",
                "voice": "kokoro",
            }
        ],
    }
    out = apply_roster_preferences(base, prefs)
    ids = [a["id"] for a in out]
    assert ids == ["main", "rorworld-warroom"]
    # Marker so downstream code can distinguish directory-backed vs YAML-added.
    assert out[-1].get("origin") == "obsidian"


def test_save_agent_config_is_noop_on_unwritable_path():
    """Never raises: a misconfigured path must not take down the server."""
    from config_service import save_agent_config

    save_agent_config(
        {"disabled_agents": [], "order": [], "added_obsidian_agents": []},
        "/nonexistent-root-xyz-8888/nested/x.yaml",
    )
