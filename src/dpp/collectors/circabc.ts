// F-02 — Collecteur CIRCABC (API REST, groupe officiel Commission ESPR/DPP, tier T1).
// CIRCABC = app Angular : pas de scrape classique possible. On interroge l'API REST :
//   1) GET /groups/{groupId}            -> objet groupe, champ cle `libraryId`
//   2) GET /spaces/{nodeId}/children    -> { data: [...] } (DFS borne sur les dossiers)
// Un DppItem est emis par DOCUMENT feuille (type `content`) ; les dossiers sont traverses.
// Lecture anonyme via Basic `guest:` (mot de passe vide), override possible par env.
import { logger } from '../../logger.js';
import type { DppItem, Source } from '../types.js';

// Contrat elargi (cf. collect.ts) : 2e parametre optionnel pour porter les en-tetes d'auth.
type HttpGet = (url: string, init?: { headers?: Record<string, string> }) => Promise<string>;

const API_BASE = 'https://circabc.europa.eu/service/circabc';
const MAX_DEPTH = 4;
const MAX_NODES = 200;

interface CircabcProps {
  modified?: string;
  created?: string;
  title?: string;
  description?: string;
  versionLabel?: string;
}

interface CircabcNode {
  id: string;
  name?: string;
  parentId?: string;
  hasSubFolders?: boolean;
  type?: string;
  properties?: CircabcProps;
}

/**
 * En-tetes d'auth Basic pour l'API CIRCABC. Defaut `guest:` (mot de passe vide, lecture
 * anonyme) ; override via env `CIRCABC_USER` / `CIRCABC_PASS`. `Accept: application/json`
 * explicite : sans ca, CIRCABC peut negocier du HTML et casser le `JSON.parse`.
 */
export function buildAuthHeaders(): Record<string, string> {
  const user = process.env.CIRCABC_USER ?? 'guest';
  const pass = process.env.CIRCABC_PASS ?? '';
  const token = Buffer.from(`${user}:${pass}`).toString('base64');
  return { Authorization: `Basic ${token}`, Accept: 'application/json' };
}

/** Extrait le groupId d'une url UI CIRCABC (.../ui/group/{uuid}/library). Throw si absent. */
export function extractGroupId(url: string): string {
  const m = url.match(/\/ui\/group\/([0-9a-f-]{36})/i);
  if (!m) throw new Error(`groupId CIRCABC introuvable dans l'url : ${url}`);
  return m[1];
}

/** Normalise une date ISO (gere le format court `2025-02-26T08:38Z` sans secondes). */
function isoDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? raw : new Date(t).toISOString();
}

function isFolder(node: CircabcNode): boolean {
  return (node.type ?? '').includes('}folder');
}

function isContent(node: CircabcNode): boolean {
  return (node.type ?? '').includes('}content');
}

async function getJson(url: string, httpGet: HttpGet): Promise<unknown> {
  const body = await httpGet(url, { headers: buildAuthHeaders() });
  return JSON.parse(body);
}

/** Liste les enfants d'un noeud (tolerant : `[]` si `data`/corps absent, null ou mal forme). */
async function listChildren(nodeId: string, httpGet: HttpGet): Promise<CircabcNode[]> {
  const parsed = (await getJson(`${API_BASE}/spaces/${nodeId}/children`, httpGet)) as
    | { data?: CircabcNode[] }
    | null;
  return Array.isArray(parsed?.data) ? parsed!.data : [];
}

/** Mappe un noeud document (type `content`) vers un DppItem. */
function toItem(node: CircabcNode, source: Source, groupId: string): DppItem {
  const props = node.properties;
  const name = node.name ?? '(document CIRCABC)';
  const title = props?.title && props.title.trim() ? props.title : name;
  const excerpt = props?.description && props.description.trim() ? props.description : name;
  return {
    title,
    sourceId: source.id,
    sourceTier: source.tier,
    // url UI stable : contient l'`id` du noeud -> fingerprint dedup unique (jamais name/parentId).
    url: `https://circabc.europa.eu/ui/group/${groupId}/library/d/${node.id}`,
    publishedAt: isoDate(props?.modified),
    excerpt,
    theme: source.pole,
    // Signal de changement stable. Optional chaining : `properties` peut etre absent.
    content: `${name}|${props?.modified ?? ''}|${props?.versionLabel ?? ''}`,
  } satisfies DppItem;
}

export async function collectCircabc(source: Source, httpGet: HttpGet): Promise<DppItem[]> {
  const groupId = extractGroupId(source.url);
  const group = (await getJson(`${API_BASE}/groups/${groupId}`, httpGet)) as { libraryId?: string };
  if (!group.libraryId) throw new Error(`libraryId absent pour le groupe CIRCABC ${groupId}`);

  const items: DppItem[] = [];
  const visited = new Set<string>(); // anti-cycle : ids de dossiers deja visites
  let truncated = false;

  function noteTruncation(detail: Record<string, unknown>): void {
    if (truncated) return;
    truncated = true;
    logger.warn({ sourceId: source.id, ...detail }, 'CIRCABC : cap atteint, collecte tronquee');
  }

  async function walk(nodeId: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    if (visited.has(nodeId)) return; // un parentId qui reboucle ne duplique ni n'epuise le cap
    // Borne la TRAVERSEE (nombre de dossiers listes = appels HTTP), pas seulement les items
    // emis : un arbre de dossiers vides ne doit pas generer des milliers de requetes.
    if (visited.size >= MAX_NODES) {
      noteTruncation({ cap: MAX_NODES, kind: 'noeuds-traverses' });
      return;
    }
    visited.add(nodeId);

    let children: CircabcNode[];
    try {
      children = await listChildren(nodeId, httpGet);
    } catch (err) {
      // Isolation au niveau SOUS-DOSSIER : un dossier en 401/timeout/404 est skippe (warn nomme),
      // les documents des dossiers sains sont quand meme emis. Jamais de throw global.
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ sourceId: source.id, nodeId, error: message }, 'CIRCABC : sous-dossier ignore');
      return;
    }

    // Filtre les noeuds sans `id` (API partielle/noeud corrompu) AVANT le tri : sinon
    // `localeCompare` jette et le throw remonterait HORS de l'isolation sous-dossier (= throw
    // global interdit). Tri par `id` ensuite = troncature deterministe, sous-ensemble stable.
    const sorted = children
      .filter((c): c is CircabcNode & { id: string } => typeof c.id === 'string' && c.id.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const node of sorted) {
      if (items.length >= MAX_NODES) {
        noteTruncation({ cap: MAX_NODES, kind: 'documents-emis' });
        return;
      }
      if (isContent(node)) {
        items.push(toItem(node, source, groupId));
      } else if (isFolder(node)) {
        await walk(node.id, depth + 1);
      }
    }
  }

  await walk(group.libraryId, 0);
  return items;
}
