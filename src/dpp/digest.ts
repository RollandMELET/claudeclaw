// F-05 — Digest Obsidian quotidien.
// renderDigest() est pur (testable sans FS). writeDigest() ecrit une NOUVELLE note datee,
// jamais d'ecrasement (negative-constraints : ecriture vault non destructive).
import fs from 'fs';
import path from 'path';

import type { ScoredItem } from './types.js';

/** Dossier cible dans le vault (atelier veille). */
export const VEILLE_SUBPATH = '002 - Projets/DPP/DPP-EU-Batteries/04-Veille';

/** Nom de fichier de la note du jour. */
export function digestFilename(date: string): string {
  return `${date}_VEILLE_DPP-Batterie.md`;
}

function confidencePct(c: number): string {
  return `${Math.round(c * 100)} %`;
}

function renderItem(item: ScoredItem): string {
  const flag = item.strongSignal ? '🔴 ' : '';
  const lines = [
    `### ${flag}[${item.title}](${item.url})`,
    `- Source : ${item.sourceId} (${item.reliability}) | Confiance : ${confidencePct(item.confidence)} | Pertinence : ${item.relevance}`,
  ];
  if (item.publishedAt) lines.push(`- Date : ${item.publishedAt}`);
  if (item.excerpt) lines.push(`- Extrait : ${item.excerpt}`);
  return lines.join('\n');
}

/** Rend la note Markdown du digest. Liste vide -> note RAS (jamais d'erreur). */
export function renderDigest(items: ScoredItem[], date: string): string {
  const strong = items.filter((i) => i.strongSignal).length;
  const frontmatter = [
    '---',
    'type: veille',
    'sujet: DPP Batterie',
    'tags: [dpp, batterie, veille, reglementation]',
    `created: ${date}`,
    `items: ${items.length}`,
    `signal_fort: ${strong}`,
    '---',
    '',
    `# Veille DPP Batterie - ${date}`,
    '',
  ];

  if (items.length === 0) {
    return [...frontmatter, 'RAS. Aucune nouveaute detectee aujourd hui.', ''].join('\n');
  }

  // Groupe par pole (theme), poles ordonnes, items par confiance decroissante.
  const byPole = new Map<string, ScoredItem[]>();
  for (const item of items) {
    const pole = item.theme ?? 'autres';
    const arr = byPole.get(pole) ?? [];
    arr.push(item);
    byPole.set(pole, arr);
  }

  const body: string[] = [];
  for (const pole of [...byPole.keys()].sort()) {
    body.push(`## ${pole}`, '');
    const sorted = [...byPole.get(pole)!].sort((a, b) => b.confidence - a.confidence);
    for (const item of sorted) {
      body.push(renderItem(item), '');
    }
  }

  return [...frontmatter, ...body].join('\n');
}

export interface WriteDigestResult {
  path: string;
  written: boolean;
}

/**
 * Ecrit la note du jour dans `dir`. Non destructif : si la note existe deja, elle n'est
 * PAS ecrasee (written=false). Cree le dossier au besoin.
 */
export function writeDigest(items: ScoredItem[], date: string, dir: string): WriteDigestResult {
  const filePath = path.join(dir, digestFilename(date));
  if (fs.existsSync(filePath)) {
    return { path: filePath, written: false };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, renderDigest(items, date), 'utf-8');
  return { path: filePath, written: true };
}
