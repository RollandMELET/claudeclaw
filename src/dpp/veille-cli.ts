// T8 — CLI `dpp:veille` + enregistrement de la routine cron quotidienne.
// Declenchable manuel (cette CLI) et automatique (scheduler.ts, via une tache planifiee
// qui execute cette meme CLI). Pas de second runtime : on reutilise scheduler + db + notify.
import path from 'path';
import { fileURLToPath } from 'url';

import { agentObsidianConfig, OBSIDIAN_VAULT } from './../config.js';
import { createScheduledTask, getAllScheduledTasks, getDatabase, initDatabase } from './../db.js';
import { logger } from './../logger.js';
import { computeNextRun } from './../scheduler.js';

import { defaultNotify } from './alert.js';
import { defaultHttpGet } from './collect.js';
import { VEILLE_SUBPATH } from './digest.js';
import { claudeRelevance } from './relevance.js';
import { runVeilleDpp, type VeilleDeps, type VeilleResult } from './veille.js';

/** Identifiant stable de la routine cron de veille (pour eviter le double enregistrement). */
export const VEILLE_TASK_ID = 'dpp-veille-daily';
/** Cron par defaut : tous les jours a 07:00. */
export const VEILLE_DEFAULT_CRON = '0 7 * * *';
/** Prompt de la tache planifiee : ordonne au daemon de lancer cette CLI. */
export const VEILLE_TASK_PROMPT =
  'Lance la veille DPP batterie : depuis la racine du projet, execute `NODE_EXTRA_CA_CERTS=config/certs/globalsign-rsa-ov-ssl-ca-2018.pem node dist/dpp/veille-cli.js` et rapporte le resume.';

/** Resume lisible d'un cycle de veille. */
export function formatSummary(r: VeilleResult): string {
  const parts = [
    `Veille DPP : ${r.collected} collectes, ${r.fresh} nouveautes`,
    r.digestWritten ? `digest ecrit (${path.basename(r.digestPath)})` : 'digest deja present (non ecrase)',
    `${r.alertsSent} alerte(s)`,
  ];
  if (r.errors.length > 0) parts.push(`${r.errors.length} source(s) en echec`);
  return parts.join(' | ');
}

/** Coeur de la CLI : execute un cycle et retourne le resume. Deps injectables (test). */
export async function runVeilleCli(deps: VeilleDeps): Promise<string> {
  const result = await runVeilleDpp(deps);
  return formatSummary(result);
}

/** Construit les deps reelles (prod) depuis l'environnement du daemon. */
export function buildVeilleDeps(): VeilleDeps {
  const vault = agentObsidianConfig?.vault || OBSIDIAN_VAULT;
  if (!vault) {
    throw new Error('Vault non configure (agentObsidianConfig.vault ou OBSIDIAN_VAULT dans .env) : impossible de localiser le vault pour le digest.');
  }
  return {
    db: getDatabase(),
    httpGet: defaultHttpGet,
    relevance: claudeRelevance,
    notify: defaultNotify,
    digestDir: path.join(vault, VEILLE_SUBPATH),
  };
}

/**
 * Enregistre la routine cron quotidienne dans le scheduler existant. Idempotent :
 * ne recree pas la tache si elle existe deja (garde anti double enregistrement).
 */
export function registerVeilleRoutine(cron: string = VEILLE_DEFAULT_CRON, agentId = 'main'): boolean {
  const exists = getAllScheduledTasks(agentId).some((t) => t.id === VEILLE_TASK_ID);
  if (exists) return false;
  createScheduledTask(VEILLE_TASK_ID, VEILLE_TASK_PROMPT, cron, computeNextRun(cron), agentId);
  logger.info({ taskId: VEILLE_TASK_ID, cron }, 'Routine veille DPP enregistree');
  return true;
}

/** Point d'entree CLI. */
async function main(): Promise<void> {
  initDatabase();
  const summary = await runVeilleCli(buildVeilleDeps());
  // eslint-disable-next-line no-console
  console.log(summary);
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((err) => {
    logger.error({ err }, 'dpp:veille CLI a echoue');
    process.exit(1);
  });
}
