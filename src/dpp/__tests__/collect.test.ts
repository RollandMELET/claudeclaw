// T3 — F-02 Collecte multi-source. GREEN. Cible : src/dpp/collect.ts + collectors/*
import { describe, it, expect } from 'vitest';

import { collect, type HttpGet } from '../collect.js';
import { collectCircabc } from '../collectors/circabc.js';
import { collectEping, buildEpingHeaders } from '../collectors/eping.js';
import { collectEurlex } from '../collectors/eurlex.js';
import { collectEurlexCellar, parseCellarSeed } from '../collectors/eurlex-cellar.js';
import { collectInstitutional } from '../collectors/institutional.js';
import { contentHash } from '../dedup.js';
import type { Source } from '../types.js';

const EURLEX_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Acte delegue (UE) 2024/1234 - empreinte carbone batteries</title>
    <link>https://eur-lex.europa.eu/eli/reg_del/2024/1234</link>
    <pubDate>Wed, 15 May 2024 10:00:00 GMT</pubDate>
    <description><![CDATA[Methodologie de calcul de l empreinte carbone.]]></description>
  </item>
</channel></rss>`;

const EPING_JSON = JSON.stringify({
  results: [
    {
      title: 'TBT notification - battery labelling requirements',
      symbol: 'G/TBT/N/EU/1042',
      url: 'https://eping.wto.org/notification/EU-1042',
      distributionDate: '2024-04-02',
      summary: 'Draft requirements on battery labelling.',
    },
  ],
});

const INSTITUTIONAL_HTML = `<!doctype html><html><head>
  <title>CEN-CENELEC JTC 24</title>
  <meta name="description" content="Normalisation batteries et passeport numerique.">
  </head><body><h1>JTC 24 - Batteries</h1><p>Travaux en cours sur le DPP.</p></body></html>`;

// --- Fixtures CIRCABC (payloads reels API REST, confirmes en live 2026-06-21) ---
const CIRCABC_API = 'https://circabc.europa.eu/service/circabc';
const CIRCABC_GROUP_ID = '418195ae-4919-45fa-a959-3b695c9aab28';
const CIRCABC_LIB_ID = 'a4df4a82-4e6d-4cbe-b137-9f529da177de';
const CIRCABC_FOLDER_ID = '3515d050-0000-0000-0000-000000000001';
const CIRCABC_UI_URL = `https://circabc.europa.eu/ui/group/${CIRCABC_GROUP_ID}/library`;

const FOLDER_TYPE = '{http://www.alfresco.org/model/content/1.0}folder';
const CONTENT_TYPE = '{http://www.alfresco.org/model/content/1.0}content';

const CIRCABC_GROUP = JSON.stringify({ id: CIRCABC_GROUP_ID, libraryId: CIRCABC_LIB_ID, isPublic: true });

// Bibliotheque racine : 1 dossier + 1 document feuille.
const CIRCABC_LIB_CHILDREN = JSON.stringify({
  data: [
    { id: CIRCABC_FOLDER_ID, name: 'Working drafts', type: FOLDER_TYPE, hasSubFolders: true, parentId: CIRCABC_LIB_ID },
    {
      id: '018bde35-aaaa-bbbb-cccc-111111111111',
      name: 'ESPR delegated act overview.pdf',
      type: CONTENT_TYPE,
      parentId: CIRCABC_LIB_ID,
      properties: {
        modified: '2025-02-26T08:38Z',
        created: '2025-01-10T09:00Z',
        title: 'ESPR delegated act - overview',
        description: 'Synthese du projet d acte delegue ESPR.',
        versionLabel: '1.0',
        security_ranking: 'PUBLIC',
      },
    },
  ],
  total: 2,
});

// Sous-dossier : 1 document feuille SANS properties (doit ne pas planter).
const CIRCABC_FOLDER_CHILDREN = JSON.stringify({
  data: [
    {
      id: '018bde35-dddd-eeee-ffff-222222222222',
      name: 'Where to find draft ED EL regulations.ppt',
      type: CONTENT_TYPE,
      parentId: CIRCABC_FOLDER_ID,
    },
  ],
  total: 1,
});

function src(over: Partial<Source>): Source {
  return {
    id: 'x',
    nom: 'X',
    url: 'https://example.org',
    pole: 'reglementaire',
    tier: 'T1',
    methode: 'eurlex-rss',
    frequence: 'daily',
    ...over,
  };
}

const eurlexSource = src({ id: 'eurlex-32023R1542', methode: 'eurlex-rss', tier: 'T1' });
const epingSource = src({ id: 'eping-omc-batteries', methode: 'eping-api', tier: 'T1' });
const instSource = src({ id: 'cen-cenelec-jtc24', methode: 'institutional-scrape', tier: 'T2', pole: 'normalisation' });
const circabcSource = src({ id: 'circabc-espr', methode: 'circabc-api', tier: 'T1', pole: 'reglementaire', url: CIRCABC_UI_URL });

function fakeHttp(map: Record<string, string>): HttpGet {
  return async (url: string) => {
    if (url in map) return map[url];
    throw new Error(`no fixture for ${url}`);
  };
}

describe('F-02: Collecte multi-source', () => {
  describe('AC-01: items normalises {title, sourceId, tier, url, date, excerpt, theme}', () => {
    it('normalise un item EUR-Lex (fixture RSS)', async () => {
      const items = await collectEurlex(eurlexSource, async () => EURLEX_RSS);
      expect(items).toHaveLength(1);
      const i = items[0];
      expect(i.title).toContain('Acte delegue');
      expect(i.sourceId).toBe('eurlex-32023R1542');
      expect(i.sourceTier).toBe('T1'); // tier = registre, pas contenu
      expect(i.url).toBe('https://eur-lex.europa.eu/eli/reg_del/2024/1234');
      expect(i.publishedAt).toBe(new Date('2024-05-15T10:00:00Z').toISOString());
      expect(i.excerpt).toContain('empreinte carbone');
      expect(i.theme).toBe('reglementaire');
    });
  });

  describe('AC-02: un collecteur par methode MVP', () => {
    it('collecte ePing (fixture API)', async () => {
      const items = await collectEping(epingSource, async () => EPING_JSON);
      expect(items).toHaveLength(1);
      expect(items[0].title).toContain('battery labelling');
      expect(items[0].url).toBe('https://eping.wto.org/notification/EU-1042');
      expect(items[0].sourceTier).toBe('T1');
    });

    it('collecte une page institutionnelle (fixture HTML)', async () => {
      const items = await collectInstitutional(instSource, async () => INSTITUTIONAL_HTML);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('JTC 24 - Batteries');
      expect(items[0].excerpt).toContain('Normalisation batteries');
      expect(items[0].sourceTier).toBe('T2');
      expect(items[0].content).toContain('Travaux en cours'); // pour content_hash
    });
  });

  describe('AC-03: isolation des erreurs', () => {
    it('un collecteur en echec n arrete pas les autres', async () => {
      const http = fakeHttp({
        'https://eur-lex.example/rss': EURLEX_RSS,
        // pas de fixture pour la source institutionnelle -> throw
      });
      const sources = [
        src({ id: 'inst-ko', methode: 'institutional-scrape', url: 'https://down.example' }),
        src({ id: 'eurlex-ok', methode: 'eurlex-rss', url: 'https://eur-lex.example/rss' }),
      ];
      const { items, errors } = await collect(sources, { httpGet: http });
      expect(errors).toHaveLength(1);
      expect(errors[0].sourceId).toBe('inst-ko');
      expect(items).toHaveLength(1);
      expect(items[0].sourceId).toBe('eurlex-ok');
    });
  });

  describe('AC-05: collecteur CIRCABC (API REST, DFS borne)', () => {
    function circabcHttp(over: Record<string, string> = {}): HttpGet {
      return fakeHttp({
        [`${CIRCABC_API}/groups/${CIRCABC_GROUP_ID}`]: CIRCABC_GROUP,
        [`${CIRCABC_API}/spaces/${CIRCABC_LIB_ID}/children`]: CIRCABC_LIB_CHILDREN,
        [`${CIRCABC_API}/spaces/${CIRCABC_FOLDER_ID}/children`]: CIRCABC_FOLDER_CHILDREN,
        ...over,
      });
    }

    it('emet un DppItem par document feuille (crawl recursif)', async () => {
      const items = await collectCircabc(circabcSource, circabcHttp());
      // 1 doc dans la racine + 1 doc dans le sous-dossier, 0 pour le dossier lui-meme.
      expect(items).toHaveLength(2);
    });

    it('mappe les champs depuis properties (title/url/date/content/theme/tier)', async () => {
      const items = await collectCircabc(circabcSource, circabcHttp());
      const doc = items.find((i) => i.url.endsWith('/d/018bde35-aaaa-bbbb-cccc-111111111111'));
      expect(doc).toBeDefined();
      expect(doc!.title).toBe('ESPR delegated act - overview'); // properties.title prioritaire
      expect(doc!.url).toBe(
        `https://circabc.europa.eu/ui/group/${CIRCABC_GROUP_ID}/library/d/018bde35-aaaa-bbbb-cccc-111111111111`,
      );
      expect(doc!.publishedAt).toBe(new Date('2025-02-26T08:38Z').toISOString()); // format court gere
      expect(doc!.excerpt).toContain('acte delegue ESPR');
      expect(doc!.theme).toBe('reglementaire'); // = source.pole
      expect(doc!.sourceTier).toBe('T1'); // tier = registre
      expect(doc!.content).toContain('ESPR delegated act overview.pdf');
      expect(doc!.content).toContain('2025-02-26T08:38Z');
      expect(doc!.content).toContain('1.0');
    });

    it('ne plante pas sur un document sans properties (fallback name)', async () => {
      const items = await collectCircabc(circabcSource, circabcHttp());
      const leaf = items.find((i) => i.url.endsWith('/d/018bde35-dddd-eeee-ffff-222222222222'));
      expect(leaf).toBeDefined();
      expect(leaf!.title).toBe('Where to find draft ED EL regulations.ppt'); // fallback sur name
      expect(leaf!.excerpt).toBe('Where to find draft ED EL regulations.ppt');
      expect(leaf!.publishedAt).toBeUndefined();
      expect(leaf!.content).toBe('Where to find draft ED EL regulations.ppt||'); // props absentes -> vides
    });

    it('detecte un changement : un content different -> contentHash different', async () => {
      const base = await collectCircabc(circabcSource, circabcHttp());
      const doc = base.find((i) => i.url.endsWith('/d/018bde35-aaaa-bbbb-cccc-111111111111'))!;

      const movedChildren = JSON.parse(CIRCABC_LIB_CHILDREN);
      movedChildren.data[1].properties.modified = '2025-03-30T10:00Z'; // nouvelle version publiee
      const after = await collectCircabc(
        circabcSource,
        circabcHttp({ [`${CIRCABC_API}/spaces/${CIRCABC_LIB_ID}/children`]: JSON.stringify(movedChildren) }),
      );
      const doc2 = after.find((i) => i.url.endsWith('/d/018bde35-aaaa-bbbb-cccc-111111111111'))!;

      expect(contentHash(doc2)).not.toBe(contentHash(doc));
    });

    it('isolation par sous-dossier : un dossier en echec ne perd pas les docs sains', async () => {
      // Le sous-dossier throw, mais le doc de la racine doit quand meme remonter, SANS throw global.
      const http = fakeHttp({
        [`${CIRCABC_API}/groups/${CIRCABC_GROUP_ID}`]: CIRCABC_GROUP,
        [`${CIRCABC_API}/spaces/${CIRCABC_LIB_ID}/children`]: CIRCABC_LIB_CHILDREN,
        // pas de fixture pour le sous-dossier -> listChildren throw -> skip + warn
      });
      const items = await collectCircabc(circabcSource, http);
      expect(items).toHaveLength(1);
      expect(items[0].url).toContain('018bde35-aaaa-bbbb-cccc-111111111111');
    });

    it('anti-cycle : un parentId qui reboucle ne duplique pas et termine', async () => {
      // Le sous-dossier renvoie un enfant dossier qui pointe vers la bibliotheque (cycle).
      const looping = JSON.stringify({
        data: [{ id: CIRCABC_LIB_ID, name: 'boucle', type: FOLDER_TYPE, parentId: CIRCABC_FOLDER_ID }],
        total: 1,
      });
      const items = await collectCircabc(
        circabcSource,
        circabcHttp({ [`${CIRCABC_API}/spaces/${CIRCABC_FOLDER_ID}/children`]: looping }),
      );
      // racine deja visitee -> pas de re-crawl, pas de doublon. Seul le doc racine est emis.
      expect(items).toHaveLength(1);
      expect(items.filter((i) => i.url.endsWith('/d/018bde35-aaaa-bbbb-cccc-111111111111'))).toHaveLength(1);
    });

    it('noeud sans id : filtre, la source survit (pas de throw global)', async () => {
      // Un noeud content sans `id` ne doit ni etre emis ni faire planter le tri/la source.
      const withBadNode = JSON.stringify({
        data: [
          { name: 'noeud corrompu sans id', type: CONTENT_TYPE },
          JSON.parse(CIRCABC_LIB_CHILDREN).data[1], // le doc sain (avec id)
        ],
        total: 2,
      });
      const items = await collectCircabc(
        circabcSource,
        circabcHttp({ [`${CIRCABC_API}/spaces/${CIRCABC_LIB_ID}/children`]: withBadNode }),
      );
      expect(items).toHaveLength(1);
      expect(items[0].url).toContain('018bde35-aaaa-bbbb-cccc-111111111111');
    });

    it('corps qui parse a null : skip propre du sous-dossier, pas de throw', async () => {
      const items = await collectCircabc(
        circabcSource,
        circabcHttp({ [`${CIRCABC_API}/spaces/${CIRCABC_FOLDER_ID}/children`]: 'null' }),
      );
      // Le doc de la racine remonte ; le sous-dossier au corps null est skippe sans throw global.
      expect(items).toHaveLength(1);
      expect(items[0].url).toContain('018bde35-aaaa-bbbb-cccc-111111111111');
    });

    it('cap MAX_NODES : troncature deterministe a 200 documents (200 plus petits ids)', async () => {
      const big = JSON.stringify({
        data: Array.from({ length: 250 }, (_, i) => ({
          id: `doc-${String(i).padStart(3, '0')}-aaaa`,
          name: `Doc ${i}.pdf`,
          type: CONTENT_TYPE,
        })),
        total: 250,
      });
      const items = await collectCircabc(
        circabcSource,
        fakeHttp({
          [`${CIRCABC_API}/groups/${CIRCABC_GROUP_ID}`]: CIRCABC_GROUP,
          [`${CIRCABC_API}/spaces/${CIRCABC_LIB_ID}/children`]: big,
        }),
      );
      expect(items).toHaveLength(200); // cap
      // Tri par id => sous-ensemble garde = doc-000..doc-199, deterministe.
      expect(items[0].url).toContain('doc-000-aaaa');
      expect(items[199].url).toContain('doc-199-aaaa');
      expect(items.some((i) => i.url.includes('doc-200-aaaa'))).toBe(false);
    });

    it('borne maxDepth : les documents au-dela de la profondeur 4 ne sont pas emis', async () => {
      // Chaine library(0) -> f1(1) -> f2(2) -> f3(3) -> f4(4) -> f5(5), un doc par niveau.
      const fids = ['f1', 'f2', 'f3', 'f4', 'f5'];
      const map: Record<string, string> = {
        [`${CIRCABC_API}/groups/${CIRCABC_GROUP_ID}`]: CIRCABC_GROUP,
        [`${CIRCABC_API}/spaces/${CIRCABC_LIB_ID}/children`]: JSON.stringify({
          data: [{ id: 'f1', name: 'f1', type: FOLDER_TYPE }],
        }),
      };
      fids.forEach((fid, idx) => {
        const next = fids[idx + 1];
        const data: unknown[] = [{ id: `d-${fid}`, name: `doc ${fid}.pdf`, type: CONTENT_TYPE }];
        if (next) data.push({ id: next, name: next, type: FOLDER_TYPE });
        map[`${CIRCABC_API}/spaces/${fid}/children`] = JSON.stringify({ data });
      });
      const items = await collectCircabc(circabcSource, fakeHttp(map));
      const names = items.map((i) => i.title).sort();
      // f1..f4 listes (depth 1..4) -> docs d-f1..d-f4. f5 a depth 5 jamais liste -> d-f5 absent.
      expect(names).toEqual(['doc f1.pdf', 'doc f2.pdf', 'doc f3.pdf', 'doc f4.pdf']);
    });

    it('groupId introuvable dans l url -> throw, isole par collect()', async () => {
      const badSource = src({ id: 'circabc-espr', methode: 'circabc-api', url: 'https://circabc.europa.eu/ui/welcome' });
      const { items, errors } = await collect([badSource], { httpGet: circabcHttp() });
      expect(items).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].sourceId).toBe('circabc-espr');
      expect(errors[0].error).toMatch(/groupId/i);
    });
  });

  describe('AC-06: collecteur EUR-Lex CELLAR (SPARQL, multi-items)', () => {
    const SPARQL_PREFIX = 'http://publications.europa.eu/webapi/rdf/sparql';
    const cellarSource = src({
      id: 'eurlex-actes-delegues',
      methode: 'eurlex-cellar',
      tier: 'T1',
      pole: 'reglementaire',
      url: 'cellar:based-on:32023R1542',
    });

    // Reponse SPARQL reelle (shape sparql-results+json) : 2 actes + 1 binding sans celex.
    const SPARQL_JSON = JSON.stringify({
      head: { vars: ['celex', 'date', 'title'] },
      results: {
        bindings: [
          { celex: { value: '32025R2289' }, date: { value: '2025-11-13' }, title: { value: 'Reglement d execution (UE) 2025/2289' } },
          { celex: { value: '32025R0606' }, date: { value: '2025-03-21' } }, // sans title -> fallback celex
          { date: { value: '2024-01-01' } }, // sans celex -> filtre
        ],
      },
    });

    function sparqlHttp(payload: string): HttpGet {
      return async (url: string) => {
        if (url.startsWith(SPARQL_PREFIX)) return payload;
        throw new Error(`no fixture for ${url}`);
      };
    }

    it('parseCellarSeed extrait mode + celex, throw si invalide', () => {
      expect(parseCellarSeed('cellar:based-on:32023R1542')).toEqual({ mode: 'based-on', celex: '32023R1542' });
      expect(parseCellarSeed('cellar:family:32023R1542')).toEqual({ mode: 'family', celex: '32023R1542' });
      expect(() => parseCellarSeed('https://eur-lex.europa.eu/x')).toThrow(/seed cellar/i);
    });

    it('emet un DppItem par binding avec celex (les bindings sans celex sont filtres)', async () => {
      const items = await collectEurlexCellar(cellarSource, sparqlHttp(SPARQL_JSON));
      expect(items).toHaveLength(2); // le 3e binding (sans celex) est ecarte
    });

    it('mappe title/url/date/content/theme/tier et trie par celex (deterministe)', async () => {
      const items = await collectEurlexCellar(cellarSource, sparqlHttp(SPARQL_JSON));
      // tri localeCompare : 32025R0606 avant 32025R2289
      expect(items[0].url).toBe('https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32025R0606');
      expect(items[0].title).toBe('32025R0606'); // pas de title -> fallback celex
      expect(items[1].url).toContain('CELEX:32025R2289');
      expect(items[1].title).toBe('Reglement d execution (UE) 2025/2289');
      expect(items[1].publishedAt).toBe(new Date('2025-11-13').toISOString());
      expect(items[1].theme).toBe('reglementaire');
      expect(items[1].sourceTier).toBe('T1');
      expect(items[1].content).toBe('32025R2289|2025-11-13');
    });

    it('bindings vides -> [] (tolerant)', async () => {
      const empty = JSON.stringify({ results: { bindings: [] } });
      expect(await collectEurlexCellar(cellarSource, sparqlHttp(empty))).toHaveLength(0);
      const noResults = JSON.stringify({ head: {} });
      expect(await collectEurlexCellar(cellarSource, sparqlHttp(noResults))).toHaveLength(0);
    });

    it('reponse non-JSON -> throw isole par collect() (errors)', async () => {
      const { items, errors } = await collect([cellarSource], { httpGet: sparqlHttp('<html>oops</html>') });
      expect(items).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].sourceId).toBe('eurlex-actes-delegues');
    });

    it('family : un seed CELEX consolide (hyphene) derive la famille de base, pas une seule version', async () => {
      // Garde-fou anti echec-silencieux : sans strip du suffixe, la requete ne matcherait
      // qu'une version consolidee precise au lieu de toute la famille.
      let captured = '';
      const http: HttpGet = async (url) => {
        captured = url;
        return JSON.stringify({ results: { bindings: [] } });
      };
      const hyphenated = src({
        id: 'eurlex-32023R1542',
        methode: 'eurlex-cellar',
        tier: 'T1',
        url: 'cellar:family:02023R1542-20250731',
      });
      await collectEurlexCellar(hyphenated, http);
      const query = decodeURIComponent(captured.split('?query=')[1] ?? '');
      expect(query).toContain('2023R1542');
      expect(query).not.toContain('2023R1542-20250731'); // suffixe de consolidation strippe
    });
  });

  describe('AC-07: auth ePing API WTO (header injecte)', () => {
    it('buildEpingHeaders : Accept toujours, cle WTO seulement si env definie', () => {
      const prev = process.env.WTO_API_KEY;
      delete process.env.WTO_API_KEY;
      expect(buildEpingHeaders()).toEqual({ Accept: 'application/json' });

      process.env.WTO_API_KEY = 'test-wto-key';
      expect(buildEpingHeaders()).toEqual({
        Accept: 'application/json',
        'Ocp-Apim-Subscription-Key': 'test-wto-key',
      });

      if (prev === undefined) delete process.env.WTO_API_KEY;
      else process.env.WTO_API_KEY = prev;
    });

    it('collectEping reste compatible avec un httpGet 1-arg (pas de regression)', async () => {
      const items = await collectEping(epingSource, async () => EPING_JSON);
      expect(items).toHaveLength(1);
      expect(items[0].title).toContain('battery labelling');
    });
  });

  describe('AC-04: declenchable manuel + cron', () => {
    it('collect() agrege plusieurs sources a la demande', async () => {
      const http = fakeHttp({
        'https://eur-lex.example/rss': EURLEX_RSS,
        'https://eping.example/api': EPING_JSON,
        'https://cen.example': INSTITUTIONAL_HTML,
      });
      const sources = [
        src({ id: 'eurlex-32023R1542', methode: 'eurlex-rss', url: 'https://eur-lex.example/rss' }),
        src({ id: 'eping-omc-batteries', methode: 'eping-api', url: 'https://eping.example/api' }),
        src({ id: 'cen-cenelec-jtc24', methode: 'institutional-scrape', url: 'https://cen.example' }),
      ];
      const { items, errors } = await collect(sources, { httpGet: http });
      expect(errors).toHaveLength(0);
      expect(items).toHaveLength(3);
      expect(items.map((i) => i.sourceId).sort()).toEqual([
        'cen-cenelec-jtc24',
        'eping-omc-batteries',
        'eurlex-32023R1542',
      ]);
    });
  });
});
