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

  it('finds global skills from ~/.claude/skills/ (>20 on this machine)', () => {
    initSkillRegistry();
    const all = getAllSkills();
    // Sanity floor: the user documented ~60 skills, require > 20 so the
    // test doesn't flake if skills are pruned.
    expect(all.length).toBeGreaterThan(20);
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
