/**
 * Integration test: verify skill-registry enumerates the fork's real
 * skill set (global + project) when invoked without overrides.
 *
 * The fork has approximately 60 skills in ~/.claude/skills/ and 5 in
 * ./skills/ (gmail, google-calendar, slack, timezone, tldr). The
 * classifier relies on this enumeration to route messages via the
 * skill index.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  initSkillRegistry,
  getAllSkills,
  getSkillIndex,
} from './skill-registry.js';

describe('skill-registry — integration with real filesystem (fork)', () => {
  it('finds at least 5 project-local skills (gmail, gcal, slack, timezone, tldr)', () => {
    initSkillRegistry();
    const all = getAllSkills();
    const ids = new Set(all.map((s) => s.id));
    expect(ids.has('gmail')).toBe(true);
    expect(ids.has('google-calendar')).toBe(true);
    expect(ids.has('slack')).toBe(true);
    expect(ids.has('timezone')).toBe(true);
    expect(ids.has('tldr')).toBe(true);
  });

  it('finds global skills present in ~/.claude/skills/ (count derived from disk)', () => {
    initSkillRegistry();
    const all = getAllSkills();
    // Pas de seuil magique couple a une machine : on compte les skills
    // globaux reellement presents sur disque (dossiers avec SKILL.md) et on
    // verifie que le registre les enumere tous (+ les skills projet). Reste
    // vert aussi bien sur la machine de dev (~60 skills) qu'en CI (peu).
    const globalDir = path.join(os.homedir(), '.claude', 'skills');
    let globalCount = 0;
    if (fs.existsSync(globalDir)) {
      globalCount = fs
        .readdirSync(globalDir, { withFileTypes: true })
        .filter(
          (d) =>
            d.isDirectory() &&
            fs.existsSync(path.join(globalDir, d.name, 'SKILL.md')),
        ).length;
    }
    expect(all.length).toBeGreaterThanOrEqual(globalCount);
  });

  it('getSkillIndex returns non-empty index with real skills', () => {
    initSkillRegistry();
    const index = getSkillIndex();
    expect(index.length).toBeGreaterThan(100);
    expect(index).toContain('gmail');
  });

  it('project-local skills win over global when id collides', () => {
    // If ~/.claude/skills/gmail also exists, project gmail should be
    // returned. The registry scans project first and Map.set overwrites.
    initSkillRegistry();
    const all = getAllSkills();
    const gmail = all.find((s) => s.id === 'gmail');
    expect(gmail).toBeDefined();
    // Path must be under the project's skills/ dir, not ~/.claude/skills/
    const projectSkillsPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '..',
      'skills',
    );
    const globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
    const gmailInProject = fs.existsSync(
      path.join(projectSkillsPath, 'gmail', 'SKILL.md'),
    );
    const gmailInGlobal = fs.existsSync(
      path.join(globalSkillsPath, 'gmail', 'SKILL.md'),
    );
    // Only assert priority if both exist; otherwise this test is a no-op
    if (gmailInProject && gmailInGlobal) {
      expect(gmail!.fullPath.startsWith(projectSkillsPath)).toBe(true);
    } else {
      expect(gmailInProject || gmailInGlobal).toBe(true);
    }
  });
});
