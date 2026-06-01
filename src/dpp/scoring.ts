// F-04 — Scoring : pertinence (LLM injecte, mockable), fiabilite (tier, deterministe),
// confiance (tier + pertinence + accord inter-sources), drapeau signal fort (regles explicites).
// La fiabilite ne provient JAMAIS du LLM (negative-constraints) : c'est le tier du registre.
import type { DppItem, ScoredItem, Tier } from './types.js';

/** Evalue la pertinence DPP batterie d'un item, dans [0,1]. Injecte (Claude CLI en prod, mock en test). */
export type RelevanceScorer = (item: DppItem) => Promise<number>;

export interface ScoreDeps {
  relevance: RelevanceScorer;
}

const TIER_WEIGHT: Record<Tier, number> = {
  T1: 1.0,
  T2: 0.75,
  T3: 0.5,
  T4: 0.25,
};

/** Poids de fiabilite d'un tier (deterministe). */
export function tierWeight(tier: Tier): number {
  return TIER_WEIGHT[tier];
}

/** Marqueurs d'evenement reglementaire fort (publication, entree en vigueur, norme finalisee). */
const STRONG_EVENT = /journal officiel|\bJO\b|entr[ée]e en vigueur|adopt[ée]|publi[ée]|norme\s+(finalis[ée]e|publi[ée]e|adopt[ée]e)/i;

/** Borne une valeur dans [0,1]. */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Arrondi a 3 decimales pour des scores reproductibles. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Accord inter-sources : proportion de corroboration d'un item au sein du lot.
 * 0 si seul sur son theme ; 1 si >= 2 sources DISTINCTES partagent le meme theme.
 */
export function agreementOf(item: DppItem, batch: DppItem[]): number {
  const theme = item.theme;
  if (!theme) return 0;
  const sources = new Set(batch.filter((b) => b.theme === theme).map((b) => b.sourceId));
  return clamp01((sources.size - 1) / 1); // 1 autre source distincte suffit a saturer
}

/** Confiance = 0.5*tier + 0.35*pertinence + 0.15*accord inter-sources. Deterministe. */
export function computeConfidence(args: { tier: Tier; relevance: number; agreement: number }): number {
  const { tier, relevance, agreement } = args;
  return round3(clamp01(0.5 * tierWeight(tier) + 0.35 * clamp01(relevance) + 0.15 * clamp01(agreement)));
}

/**
 * Regle signal fort (explicite, deterministe) :
 *  - source T1 et pertinence >= 0.7 (acte/juridique fort), OU
 *  - source T2 et pertinence >= 0.85 (norme finalisee), OU
 *  - marqueur d'evenement reglementaire (JO, entree en vigueur, norme finalisee) sur source T1/T2.
 */
export function isStrongSignal(tier: Tier, relevance: number, text: string): boolean {
  if (tier === 'T1' && relevance >= 0.7) return true;
  if (tier === 'T2' && relevance >= 0.85) return true;
  if ((tier === 'T1' || tier === 'T2') && STRONG_EVENT.test(text)) return true;
  return false;
}

/** Score un item dans le contexte de son lot (pour l'accord inter-sources). */
export async function scoreItem(item: DppItem, batch: DppItem[], deps: ScoreDeps): Promise<ScoredItem> {
  const relevance = clamp01(await deps.relevance(item));
  const reliability = item.sourceTier; // tier du registre, jamais le LLM
  const agreement = agreementOf(item, batch);
  const confidence = computeConfidence({ tier: reliability, relevance, agreement });
  const text = `${item.title} ${item.excerpt ?? ''}`;
  const strongSignal = isStrongSignal(reliability, relevance, text);
  return { ...item, relevance: round3(relevance), reliability, confidence, strongSignal };
}

/** Score un lot d'items nouveaux (dedup en amont). Le LLM n'est appele que sur les nouveautes. */
export async function scoreItems(items: DppItem[], deps: ScoreDeps): Promise<ScoredItem[]> {
  return Promise.all(items.map((item) => scoreItem(item, items, deps)));
}
