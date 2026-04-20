"""
Slice 5 — Obsidian agents wrapper (Python, RED).

Parallel to src/warroom-obsidian-agents.ts. The Python side is consumed
by warroom/server.py at boot to:
  1. Merge Obsidian agents into the /tmp/warroom-agents.json roster so
     personas._generate_persona() can pick them up via the existing
     fallback mechanism (no change to AGENT_PERSONAS required).
  2. Extend VALID_AGENTS so answer_as_agent_handler accepts them.

Runs under pytest in warroom/.venv/ (from the sibling clone or any venv
with pytest + pyyaml). No pipecat dependency.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parent))


@pytest.fixture
def fake_vault(tmp_path):
    """Create a tiny vault layout so path validation has something real."""
    vault = tmp_path / "VAULT"
    (vault / "Projects" / "RoR").mkdir(parents=True)
    (vault / "Projects" / "Other").mkdir(parents=True)
    return vault


def test_load_agents_returns_empty_when_file_missing(tmp_path):
    from obsidian_loader import load_agents

    missing = tmp_path / "nope.yaml"
    assert load_agents(str(missing)) == []


def test_load_agents_returns_empty_on_empty_yaml(tmp_path):
    from obsidian_loader import load_agents

    empty = tmp_path / "empty.yaml"
    empty.write_text("")
    assert load_agents(str(empty)) == []


def test_load_agents_parses_valid_yaml(tmp_path, fake_vault):
    from obsidian_loader import load_agents

    yaml_path = tmp_path / "obsidian-agents.yaml"
    yaml_path.write_text(
        f"""obsidian_agents:
  rorworld-warroom:
    name: RoRworld Admin
    description: Administration RoRworld, compta, refacturation GS1
    vault_root: {fake_vault}
    project_folder: Projects/RoR
    voice: kokoro
    avatar: rorworld.png
    model: sonnet
"""
    )
    agents = load_agents(str(yaml_path))
    assert len(agents) == 1
    a = agents[0]
    assert a["id"] == "rorworld-warroom"
    assert a["name"] == "RoRworld Admin"
    assert a["description"].startswith("Administration RoRworld")
    # cwd is absolute and lands inside the vault.
    assert os.path.isabs(a["cwd"])
    assert a["cwd"] == str(fake_vault / "Projects" / "RoR")


def test_load_agents_rejects_path_traversal(tmp_path, fake_vault):
    from obsidian_loader import load_agents

    yaml_path = tmp_path / "evil.yaml"
    yaml_path.write_text(
        f"""obsidian_agents:
  evil:
    name: Evil
    description: tries to escape
    vault_root: {fake_vault}
    project_folder: ../../../etc
    voice: kokoro
    avatar: evil.png
"""
    )
    assert load_agents(str(yaml_path)) == []


def test_load_agents_skips_missing_project_folder(tmp_path, fake_vault):
    from obsidian_loader import load_agents

    yaml_path = tmp_path / "ghost.yaml"
    yaml_path.write_text(
        f"""obsidian_agents:
  ghost:
    name: Ghost
    description: folder does not exist
    vault_root: {fake_vault}
    project_folder: Projects/Nonexistent
    voice: kokoro
    avatar: ghost.png
"""
    )
    assert load_agents(str(yaml_path)) == []


def test_load_agents_expands_tilde(tmp_path, monkeypatch):
    from obsidian_loader import load_agents

    # Create a vault under HOME to exercise ~ expansion.
    home = tmp_path / "home"
    (home / "Vault" / "Project").mkdir(parents=True)
    monkeypatch.setenv("HOME", str(home))

    yaml_path = tmp_path / "tilde.yaml"
    yaml_path.write_text(
        """obsidian_agents:
  tilde-test:
    name: Tilde Test
    description: ~ expansion
    vault_root: ~/Vault
    project_folder: Project
    voice: kokoro
    avatar: t.png
"""
    )
    agents = load_agents(str(yaml_path))
    assert len(agents) == 1
    assert agents[0]["cwd"] == str(home / "Vault" / "Project")


def test_merge_into_roster_deduplicates_by_id(tmp_path, fake_vault):
    from obsidian_loader import merge_into_roster

    roster_path = tmp_path / "roster.json"
    base_agents = [
        {"id": "main", "name": "Main", "description": "orchestrator"},
        {"id": "rc2", "name": "RC2", "description": "dev agent"},
    ]
    obsidian_agents = [
        {
            "id": "rorworld-warroom",
            "name": "RoRworld Admin",
            "description": "comptable",
            "cwd": str(fake_vault / "Projects" / "RoR"),
        },
        # Duplicate id (already in base): must not appear twice.
        {
            "id": "rc2",
            "name": "RC2 override (should be ignored)",
            "description": "ignored",
            "cwd": str(fake_vault / "Projects" / "Other"),
        },
    ]
    merge_into_roster(base_agents, obsidian_agents, roster_path=str(roster_path))

    written = json.loads(roster_path.read_text())
    ids = [a["id"] for a in written]
    # main, rc2, rorworld-warroom exactly — no duplicate rc2.
    assert sorted(ids) == sorted(["main", "rc2", "rorworld-warroom"])
    # Base rc2 entry is preserved verbatim (not overridden by Obsidian).
    rc2 = [a for a in written if a["id"] == "rc2"][0]
    assert rc2["name"] == "RC2"


def test_merge_into_roster_includes_cwd_for_obsidian_agents(tmp_path, fake_vault):
    from obsidian_loader import merge_into_roster

    roster_path = tmp_path / "roster.json"
    base_agents = [{"id": "main", "name": "Main", "description": "orchestrator"}]
    obsidian_agents = [
        {
            "id": "rorworld-warroom",
            "name": "RoRworld Admin",
            "description": "comptable",
            "cwd": str(fake_vault / "Projects" / "RoR"),
        }
    ]
    merge_into_roster(base_agents, obsidian_agents, roster_path=str(roster_path))

    written = json.loads(roster_path.read_text())
    obs = [a for a in written if a["id"] == "rorworld-warroom"][0]
    # cwd is carried through so server.py can pass --cwd at spawn time.
    assert obs["cwd"] == str(fake_vault / "Projects" / "RoR")
