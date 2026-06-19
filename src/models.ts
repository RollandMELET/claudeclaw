/**
 * Source unique de vérité des identifiants de modèles Anthropic.
 *
 * Les IDs étaient auparavant codés en dur et périmés dans ~13 endroits
 * (bot, dashboard, routeurs War Room, création d'agents, etc.). Toute
 * référence à un model ID DOIT désormais importer depuis ce fichier.
 *
 * IDs courants (issus du skill claude-api / catalogue Anthropic) :
 *   - opus   -> claude-opus-4-8
 *   - sonnet -> claude-sonnet-4-6
 *   - haiku  -> claude-haiku-4-5
 *
 * Ce module n'a AUCUN import : c'est une feuille du graphe de dépendances,
 * donc importable partout sans risque de cycle (y compris config.ts).
 */

/** Mapping label court -> identifiant de modèle complet. */
export const AVAILABLE_MODELS: Record<string, string> = {
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

/** Label du modèle par défaut (Opus via Max/OAuth). */
export const DEFAULT_MODEL_LABEL = 'opus';

/** Identifiant du modèle par défaut. */
export const DEFAULT_MODEL = AVAILABLE_MODELS[DEFAULT_MODEL_LABEL];

/** Liste des IDs valides — utilisée pour la validation côté dashboard. */
export const VALID_MODELS: string[] = Object.values(AVAILABLE_MODELS);

/** Constantes spécialisées pour les usages ciblés. */
export const OPUS_MODEL = AVAILABLE_MODELS.opus;
export const SONNET_MODEL = AVAILABLE_MODELS.sonnet;
/** Modèle bon marché pour les classifieurs (router, memory-ingest). */
export const HAIKU_MODEL = AVAILABLE_MODELS.haiku;

/**
 * Résout un label court ou un id vers un identifiant de modèle.
 *
 * - label connu ('opus', 'sonnet', 'haiku') -> l'id correspondant
 * - chaîne qui ressemble déjà à un id ('claude-...') -> renvoyée telle quelle
 * - sinon (undefined, vide, inconnu) -> DEFAULT_MODEL
 */
export function resolveModel(label?: string): string {
  if (!label) return DEFAULT_MODEL;
  const mapped = AVAILABLE_MODELS[label];
  if (mapped) return mapped;
  if (label.startsWith('claude-')) return label;
  return DEFAULT_MODEL;
}
