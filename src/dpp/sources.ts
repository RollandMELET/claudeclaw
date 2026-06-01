// F-01 — Registre des sources hierarchise par fiabilite.
// Charge config/dpp-sources.yaml, valide le schema, expose getSources() et tierOf().
// Le tier est la seule source de verite de la fiabilite (jamais le LLM).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

import { TIERS, type CollectMethod, type Source, type Tier } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/dpp/sources.ts -> racine repo -> config/dpp-sources.yaml
const DEFAULT_REGISTRY = path.resolve(__dirname, '../../config/dpp-sources.yaml');

const VALID_METHODS: readonly CollectMethod[] = [
  'eurlex-rss',
  'eping-api',
  'institutional-scrape',
];

const REQUIRED_FIELDS: (keyof Source)[] = [
  'id',
  'nom',
  'url',
  'pole',
  'tier',
  'methode',
  'frequence',
];

/** Parse + valide un texte YAML de registre. Throw sur registre malforme. */
export function loadRegistry(yamlText: string): Source[] {
  const parsed = yaml.load(yamlText) as { sources?: unknown };
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sources)) {
    throw new Error('Registre DPP invalide : cle "sources" (liste) manquante.');
  }

  const seen = new Set<string>();
  const sources = parsed.sources.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Registre DPP invalide : source #${i} n'est pas un objet.`);
    }
    const s = raw as Record<string, unknown>;

    for (const field of REQUIRED_FIELDS) {
      if (s[field] === undefined || s[field] === null || s[field] === '') {
        throw new Error(`Registre DPP invalide : champ "${field}" manquant (source #${i}).`);
      }
    }
    if (!TIERS.includes(s.tier as Tier)) {
      throw new Error(`Registre DPP invalide : tier inconnu "${String(s.tier)}" (source ${String(s.id)}).`);
    }
    if (!VALID_METHODS.includes(s.methode as CollectMethod)) {
      throw new Error(`Registre DPP invalide : methode inconnue "${String(s.methode)}" (source ${String(s.id)}).`);
    }
    if (seen.has(s.id as string)) {
      throw new Error(`Registre DPP invalide : id duplique "${String(s.id)}".`);
    }
    seen.add(s.id as string);

    return {
      id: s.id as string,
      nom: s.nom as string,
      url: s.url as string,
      pole: s.pole as string,
      tier: s.tier as Tier,
      methode: s.methode as CollectMethod,
      frequence: s.frequence as string,
    } satisfies Source;
  });

  return sources;
}

let cache: Source[] | null = null;

/** Charge le registre par defaut (config/dpp-sources.yaml), avec cache. */
export function getSources(registryPath: string = DEFAULT_REGISTRY): Source[] {
  if (registryPath === DEFAULT_REGISTRY && cache) return cache;
  const text = fs.readFileSync(registryPath, 'utf-8');
  const sources = loadRegistry(text);
  if (registryPath === DEFAULT_REGISTRY) cache = sources;
  return sources;
}

/** Resout le tier de fiabilite d'une source. Throw si l'id est inconnu. */
export function tierOf(sourceId: string, sources: Source[] = getSources()): Tier {
  const src = sources.find((s) => s.id === sourceId);
  if (!src) throw new Error(`Source inconnue dans le registre : "${sourceId}".`);
  return src.tier;
}

/** Vide le cache (tests). */
export function _resetSourcesCache(): void {
  cache = null;
}
