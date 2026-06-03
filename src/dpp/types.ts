// Types partagés du module DPP Battery Intelligence.
// Source de vérité de la fiabilité = le tier du registre (jamais le LLM).

/** Niveaux de fiabilité d'une source (déterministes, issus du registre). */
export type Tier = 'T1' | 'T2' | 'T3' | 'T4';

export const TIERS: readonly Tier[] = ['T1', 'T2', 'T3', 'T4'] as const;

/** Méthodes de collecte supportées (une méthode = un collecteur). */
export type CollectMethod = 'eurlex-rss' | 'eping-api' | 'institutional-scrape';

/** Une source surveillée, déclarée dans config/dpp-sources.yaml. */
export interface Source {
  /** Identifiant stable et unique (ex: eurlex-32023R1542). */
  id: string;
  /** Nom lisible. */
  nom: string;
  /** URL ou endpoint de collecte. */
  url: string;
  /** Pôle thématique (reglementaire, normalisation, institutionnel, experts, social). */
  pole: string;
  /** Tier de fiabilité (déterministe). */
  tier: Tier;
  /** Méthode de collecte. */
  methode: CollectMethod;
  /** Fréquence de collecte (ex: daily, weekly). */
  frequence: string;
}

/** Item normalisé issu d'un collecteur (avant scoring). */
export interface DppItem {
  title: string;
  sourceId: string;
  sourceTier: Tier;
  url: string;
  publishedAt?: string;
  excerpt?: string;
  theme?: string;
  /** Contenu brut servant à détecter un changement (optionnel). */
  content?: string;
}

/** Item après scoring (pertinence LLM + fiabilité tier + confiance). */
export interface ScoredItem extends DppItem {
  relevance: number;
  reliability: Tier;
  confidence: number;
  strongSignal: boolean;
}
