// F-04 (cote prod) — Pertinence DPP batterie via Claude CLI, en appel one-shot non interactif.
// Volontairement decouple du CliEngine (boucle agent du daemon, liee a une session) : le scoring
// est un appel pur item -> note [0,1], deterministe et mockable. La fiabilite reste le tier (jamais ici).
import { execFile } from 'child_process';
import { promisify } from 'util';

import { logger } from '../logger.js';

import type { DppItem } from './types.js';
import type { RelevanceScorer } from './scoring.js';

const execFileAsync = promisify(execFile);

/** Lanceur du CLI Claude (injectable pour test). Retourne la sortie texte. */
export type ClaudeRunner = (prompt: string) => Promise<string>;

const PROFILE = [
  'Profil DPP batterie : Reglement (UE) 2023/1542, passeport numerique de batterie,',
  'empreinte carbone, contenu recycle, etiquetage, due diligence, actes delegues et',
  'd execution, normes CEN-CENELEC JTC 24, echeance 18 fevrier 2027.',
].join(' ');

function buildPrompt(item: DppItem): string {
  return [
    'Tu notes la PERTINENCE d un item de veille par rapport au profil ci-dessous.',
    PROFILE,
    '',
    `Titre : ${item.title}`,
    `Extrait : ${item.excerpt ?? '(aucun)'}`,
    '',
    'Reponds UNIQUEMENT par un nombre entre 0 et 1 (ex: 0.82). Rien d autre.',
  ].join('\n');
}

/** Parse un score [0,1] dans la sortie LLM. 0 si illisible (fail-safe, pas de faux signal). */
export function parseScore(out: string): number {
  const m = out.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Appel one-shot non interactif du CLI Claude. Reutilise par le scoring et le chatbot RAG. */
export async function runClaude(prompt: string): Promise<string> {
  const { stdout } = await execFileAsync('claude', ['-p', prompt], { timeout: 60_000 });
  return stdout;
}

const defaultRunner: ClaudeRunner = runClaude;

/** Construit un RelevanceScorer base sur le CLI Claude. */
export function makeClaudeRelevance(runner: ClaudeRunner = defaultRunner): RelevanceScorer {
  return async (item: DppItem) => {
    try {
      return parseScore(await runner(buildPrompt(item)));
    } catch (err) {
      logger.warn({ err, title: item.title }, 'DPP relevance : echec CLI Claude, score 0');
      return 0;
    }
  };
}

/** RelevanceScorer prod par defaut. */
export const claudeRelevance: RelevanceScorer = makeClaudeRelevance();
