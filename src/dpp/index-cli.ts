// F-07 / F-10 — Entrypoint d'indexation du corpus RAG DPP.
// Lit config/dpp-corpus.yaml, balaie les dossiers du vault (recursif, .md), puis
// chunk + embed + upsert dans dpp_index via corpus-index.ts (incremental, note_mtime).
// Lancable a la main (npm run dpp:index) ; reutilisable par F-10 (boucle veille->reindex).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import yaml from 'js-yaml';

import { agentObsidianConfig, OBSIDIAN_VAULT } from './../config.js';
import { getDatabase, initDatabase } from './../db.js';
import { embedText } from './../embeddings.js';
import { logger } from './../logger.js';

import { indexCorpus, type CorpusFile } from './corpus-index.js';
import { TIERS, type Tier } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/dpp/index-cli.ts -> racine repo -> config/dpp-corpus.yaml
const DEFAULT_CORPUS_CONFIG = path.resolve(__dirname, '../../config/dpp-corpus.yaml');

export interface CorpusFolder {
  path: string;
  tier: Tier;
}

export interface CorpusConfig {
  folders: CorpusFolder[];
  exclude: string[];
}

/** Parse + valide config/dpp-corpus.yaml. Throw si malforme. */
export function loadCorpusConfig(yamlText: string): CorpusConfig {
  const parsed = yaml.load(yamlText) as { corpus?: unknown; exclude?: unknown };
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.corpus)) {
    throw new Error('Config corpus DPP invalide : cle "corpus" (liste) manquante.');
  }
  const folders = parsed.corpus.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Config corpus DPP invalide : entree #${i} n'est pas un objet.`);
    }
    const c = raw as Record<string, unknown>;
    if (typeof c.path !== 'string' || c.path === '') {
      throw new Error(`Config corpus DPP invalide : "path" manquant (entree #${i}).`);
    }
    const tier = (c.tier as Tier) ?? 'T2';
    if (!TIERS.includes(tier)) {
      throw new Error(`Config corpus DPP invalide : tier inconnu "${String(c.tier)}" (entree #${i}).`);
    }
    return { path: c.path, tier } satisfies CorpusFolder;
  });
  const exclude = Array.isArray(parsed.exclude) ? (parsed.exclude as string[]) : ['_archive'];
  return { folders, exclude };
}

/** Resout la racine du vault (meme logique que la veille : config agent puis OBSIDIAN_VAULT). */
function resolveVault(): string {
  const vault = agentObsidianConfig?.vault || OBSIDIAN_VAULT;
  if (!vault) {
    throw new Error('Vault non configure (agentObsidianConfig.vault ou OBSIDIAN_VAULT dans .env).');
  }
  return vault;
}

/** Liste recursive des .md d'un dossier, en ignorant dossiers exclus et caches. */
export function walkMarkdown(dir: string, exclude: string[]): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // dossier absent : ignore (logge par l'appelant)
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (exclude.includes(e.name)) continue;
      out.push(...walkMarkdown(full, exclude));
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/** Rassemble les CorpusFile a partir du vault + de la config (tier herite du dossier). */
export function gatherCorpus(vault: string, folders: CorpusFolder[], exclude: string[]): CorpusFile[] {
  const files: CorpusFile[] = [];
  for (const folder of folders) {
    const abs = path.join(vault, folder.path);
    const mds = walkMarkdown(abs, exclude);
    if (mds.length === 0) {
      logger.warn({ folder: folder.path }, 'DPP index : dossier vide ou absent, ignore');
    }
    for (const file of mds) {
      try {
        const stat = fs.statSync(file);
        const content = fs.readFileSync(file, 'utf-8');
        files.push({ path: file, content, mtime: Math.floor(stat.mtimeMs), tier: folder.tier });
      } catch (err) {
        logger.warn({ file, err: String(err) }, 'DPP index : fichier illisible, ignore');
      }
    }
  }
  return files;
}

/** Point d'entree CLI. */
async function main(): Promise<void> {
  initDatabase();
  const vault = resolveVault();
  const cfg = loadCorpusConfig(fs.readFileSync(DEFAULT_CORPUS_CONFIG, 'utf-8'));
  const files = gatherCorpus(vault, cfg.folders, cfg.exclude);
  logger.info({ folders: cfg.folders.length, files: files.length }, 'DPP index : corpus rassemble');
  const result = await indexCorpus(getDatabase(), files, { embed: embedText });
  const summary =
    `Indexation DPP : ${result.indexed} note(s) (re)indexee(s), ` +
    `${result.skipped} inchangee(s), ${result.chunks} chunk(s) ecrits.`;
  // eslint-disable-next-line no-console
  console.log(summary);
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((err) => {
    logger.error({ err }, 'dpp:index a echoue');
    process.exit(1);
  });
}
