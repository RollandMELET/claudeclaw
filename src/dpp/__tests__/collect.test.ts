// T3 — F-02 Collecte multi-source. GREEN. Cible : src/dpp/collect.ts + collectors/*
import { describe, it, expect } from 'vitest';

import { collect, type HttpGet } from '../collect.js';
import { collectEping } from '../collectors/eping.js';
import { collectEurlex } from '../collectors/eurlex.js';
import { collectInstitutional } from '../collectors/institutional.js';
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
