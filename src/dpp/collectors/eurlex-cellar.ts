// F-02 — Collecteur EUR-Lex CELLAR (SPARQL public, donnees structurees par CELEX).
// EUR-Lex ne fournit pas de RSS par requete sans login. On interroge l'endpoint SPARQL
// public de l'Office des publications (CELLAR), qui renvoie du JSON structure :
//   - mode `family`   : le reglement de base + ses versions consolidees (regex sur le CELEX)
//   - mode `based-on` : les actes delegues / d'execution bases sur le reglement (multi-items)
// Un DppItem est emis par acte (un CELEX). URL UI EUR-Lex stable construite depuis le CELEX.
import type { DppItem, Source } from '../types.js';

// Contrat elargi (cf. collect.ts) : 2e parametre optionnel pour porter l'en-tete Accept.
type HttpGet = (url: string, init?: { headers?: Record<string, string> }) => Promise<string>;

const SPARQL_ENDPOINT = 'http://publications.europa.eu/webapi/rdf/sparql';
// Langue des titres recuperes (veille FR). OPTIONAL : un acte sans expression FR retombe sur le CELEX.
const LANG_FR = 'http://publications.europa.eu/resource/authority/language/FRA';
const MAX_RESULTS = 50;

type CellarMode = 'family' | 'based-on';

interface SparqlBinding {
  celex?: { value?: string };
  date?: { value?: string };
  title?: { value?: string };
}

/** Parse l'url-seed `cellar:{mode}:{celex}`. Throw si forme invalide (isole par collect()). */
export function parseCellarSeed(url: string): { mode: CellarMode; celex: string } {
  const m = url.match(/^cellar:(family|based-on):([0-9A-Z][0-9A-Z-]*)$/i);
  if (!m) throw new Error(`Seed CELLAR invalide (attendu cellar:{family|based-on}:{CELEX}) : ${url}`);
  return { mode: m[1].toLowerCase() as CellarMode, celex: m[2] };
}

/** Normalise une date ISO (tolerant : renvoie le raw si non parsable). */
function isoDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? raw : new Date(t).toISOString();
}

/** Construit la requete SPARQL selon le mode. */
function buildQuery(mode: CellarMode, celex: string): string {
  const titleClause = `OPTIONAL {
      ?expr cdm:expression_belongs_to_work ?work .
      ?expr cdm:expression_uses_language <${LANG_FR}> .
      ?expr cdm:expression_title ?title }
    OPTIONAL { ?work cdm:work_date_document ?date }`;

  if (mode === 'based-on') {
    return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?date ?title WHERE {
  ?base cdm:resource_legal_id_celex "${celex}"^^<http://www.w3.org/2001/XMLSchema#string> .
  ?work cdm:resource_legal_based_on_resource_legal ?base .
  ?work cdm:resource_legal_id_celex ?celex .
  ${titleClause}
} ORDER BY DESC(?date) LIMIT ${MAX_RESULTS}`;
  }

  // family : le texte de base (3...) et ses consolidations (0...-YYYYMMDD) / corrigenda, via
  // regex de PREFIXE sur le CELEX (pas d'ancre de fin : on veut capter toutes les formes
  // derivees du numero, pas seulement les consolidations datees).
  // On derive le numero de famille en strippant d'abord un eventuel suffixe de consolidation
  // `-YYYYMMDD` (au cas ou le seed serait un CELEX consolide), PUIS le chiffre de secteur initial
  // (hypothese : un CELEX commence par un chiffre de secteur, ex 3 acte de base / 0 consolide ;
  // si ce n'etait pas un chiffre, le replace ne strippe rien et `\\d?` optionnel reste correct).
  const num = celex.replace(/-.*$/, '').replace(/^\d/, ''); // 02023R1542-20250731 -> 2023R1542
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?date ?title WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  ${titleClause}
  FILTER(regex(str(?celex), "^\\\\d?${num}"))
} ORDER BY DESC(?date) LIMIT ${MAX_RESULTS}`;
}

/** Mappe un binding SPARQL (un acte) vers un DppItem. */
function toItem(b: SparqlBinding, source: Source): DppItem {
  const celex = b.celex!.value!;
  const title = b.title?.value && b.title.value.trim() ? b.title.value : celex;
  const date = b.date?.value;
  return {
    title,
    sourceId: source.id,
    sourceTier: source.tier,
    // URL UI EUR-Lex stable : contient le CELEX -> fingerprint dedup unique par acte.
    url: `https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:${celex}`,
    publishedAt: isoDate(date),
    excerpt: b.title?.value || undefined,
    theme: source.pole,
    // Signal de changement stable (nouvelle version d'un CELEX = nouvelle date).
    content: `${celex}|${date ?? ''}`,
  } satisfies DppItem;
}

export async function collectEurlexCellar(source: Source, httpGet: HttpGet): Promise<DppItem[]> {
  const { mode, celex } = parseCellarSeed(source.url);
  const query = buildQuery(mode, celex);
  const endpoint = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;

  const body = await httpGet(endpoint, { headers: { Accept: 'application/sparql-results+json' } });
  const parsed = JSON.parse(body) as { results?: { bindings?: SparqlBinding[] } } | null;
  const bindings = Array.isArray(parsed?.results?.bindings) ? parsed!.results!.bindings! : [];

  // Ne garde que les bindings avec un CELEX (cle de l'url/dedup). Tri deterministe par CELEX
  // pour une troncature stable entre deux runs (la source est quotidienne).
  return bindings
    .filter((b): b is SparqlBinding & { celex: { value: string } } => Boolean(b.celex?.value))
    .sort((a, b) => a.celex.value.localeCompare(b.celex.value))
    .slice(0, MAX_RESULTS)
    .map((b) => toItem(b, source));
}
