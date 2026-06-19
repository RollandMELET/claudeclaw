/**
 * Portail de validation d'actions (action gate).
 *
 * Point de scoring unique pour les actions de l'agent sur le chemin
 * principal (Telegram -> agent). Repond a la critique securite « OpenClaw
 * fait n'importe quoi » : avant qu'un outil ne s'execute, on le classe en
 * trois verdicts.
 *
 *   - `allow`    : lecture seule -> autorise automatiquement.
 *   - `validate` : effet de bord -> demande une validation humaine.
 *   - `block`    : dangereux -> refuse purement et simplement.
 *
 * Le module est PUR (aucun effet de bord, aucune dependance runtime) pour
 * rester trivialement testable. Le cablage cote SDK vit dans cli-engine.ts.
 *
 * Opt-in strict via `ACTION_GATE_ENABLED` (defaut OFF), sur le meme patron
 * que `EXFILTRATION_GUARD_ENABLED` : tant que le flag n'est pas mis a ON,
 * le chemin principal est INCHANGE (bypassPermissions conserve).
 */

import { scanForSecrets } from './exfiltration-guard.js';

export type Verdict = 'allow' | 'validate' | 'block';

export interface ActionScore {
  /** Decision finale appliquee a l'outil. */
  verdict: Verdict;
  /** Explication courte et humaine du verdict. */
  reason: string;
  /** Niveau de risque estime. */
  risk: 'low' | 'medium' | 'high';
  /** Categorie de l'action (readonly, side_effect, dangerous, ...). */
  category: string;
}

// ── Catégorisation des outils ───────────────────────────────────────
// Reprend la frontiere de warroom-tool-policy.ts : lecture seule vs effet
// de bord. Garde la liste locale (et non importee) car warroom-tool-policy
// n'exporte pas ces tableaux, mais on conserve EXACTEMENT le meme contenu
// pour que les deux modules restent coherents.

const SAFE_READONLY_TOOLS = new Set<string>([
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'TodoWrite',
  // Variantes informatives parfois exposees par le SDK.
  'NotebookRead',
  'AskUserQuestion',
]);

const SIDE_EFFECT_TOOLS = new Set<string>([
  'Bash',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'ExitPlanMode',
  'Skill',
]);

// ── Motifs dangereux (verdict block) ────────────────────────────────

// Commandes shell destructrices ou irreversibles.
const DANGEROUS_BASH_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  // rm -rf (avec ou sans chemin), rm -fr, suppressions massives.
  { re: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-rf|-fr)\b/i, reason: 'suppression recursive forcee (rm -rf)' },
  // Suppression de la racine ou du home.
  { re: /\brm\b[^|;&\n]*\s(\/|~|\$HOME)(\s|\/|$)/i, reason: 'suppression a la racine ou du home' },
  // Bombe fork.
  { re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, reason: 'fork bomb' },
  // Ecrasement de disque / dd vers un device.
  { re: /\bdd\b[^|;&\n]*of=\/dev\//i, reason: 'ecriture brute sur un device (dd of=/dev/...)' },
  // mkfs / formatage.
  { re: /\bmkfs(\.\w+)?\b/i, reason: 'formatage de systeme de fichiers (mkfs)' },
  // Pipe curl|sh : execution de code distant.
  { re: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/i, reason: 'execution de code distant (curl | sh)' },
  // chmod/chown recursif a la racine.
  { re: /\bch(mod|own)\b[^|;&\n]*-R[^|;&\n]*\s(\/|~)(\s|$)/i, reason: 'permissions recursives a la racine' },
  // Kill massif de processus / services.
  { re: /\b(kill(all)?\s+-9|pkill\s+-9|killall)\b/i, reason: 'arret force de processus/services' },
  { re: /\b(launchctl|systemctl)\b[^|;&\n]*\b(unload|disable|stop|remove)\b/i, reason: 'arret/desactivation de service systeme' },
  // git destructeur (reset --hard, clean -fd, push --force).
  { re: /\bgit\b[^|;&\n]*\b(reset\s+--hard|clean\s+-[a-z]*f|push\s+[^|;&\n]*--force)\b/i, reason: 'operation git destructrice' },
];

// Chemins du propre noyau de code de l'agent : toute MODIFICATION de ces
// cibles est bloquee (auto-modification du code source / du depot).
const SELF_CODE_PATH_PATTERNS: RegExp[] = [
  /(^|[\s'"=/])src\//i,          // src/ du depot lui-meme
  /(^|[\s'"=/])\.git(\/|$|\s)/i, // .git
  /package\.json/i,
  /package-lock\.json/i,
  /bun\.lock/i,
  /tsconfig\.json/i,
];

// Outils MCP mutateurs reconnus par mot-cle dans leur nom (mcp__serveur__action).
const MCP_MUTATING_KEYWORDS = [
  'create', 'update', 'delete', 'send', 'write', 'modify', 'remove',
  'insert', 'add', 'set', 'manage', 'import', 'share', 'rename', 'move',
  'copy', 'batch_update', 'label', 'unlabel', 'respond', 'schedule',
];

function isMcpTool(name: string): boolean {
  return name.startsWith('mcp__');
}

function isMutatingMcpTool(name: string): boolean {
  const lower = name.toLowerCase();
  return MCP_MUTATING_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Extrait une chaine de commande exploitable depuis l'input d'un outil
 * Bash (`{ command: string }`), sinon une representation textuelle.
 */
function bashCommand(input: unknown): string {
  if (input && typeof input === 'object' && 'command' in input) {
    const c = (input as { command?: unknown }).command;
    if (typeof c === 'string') return c;
  }
  return '';
}

/**
 * Extrait le chemin cible d'un outil d'ecriture (Write/Edit/NotebookEdit).
 */
function targetPath(input: unknown): string {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    for (const key of ['file_path', 'filePath', 'path', 'notebook_path']) {
      if (typeof o[key] === 'string') return o[key] as string;
    }
  }
  return '';
}

function touchesSelfCode(text: string): boolean {
  return SELF_CODE_PATH_PATTERNS.some((re) => re.test(text));
}

/**
 * Score une action proposee par l'agent.
 *
 * @param input.toolName  Nom de l'outil SDK (Read, Bash, Write, mcp__...).
 * @param input.toolInput Input brut de l'outil (forme dependante du tool).
 * @param input.message   Message utilisateur d'origine (optionnel, contexte).
 */
export function scoreAction(input: {
  toolName?: string;
  toolInput?: unknown;
  message?: string;
}): ActionScore {
  const { toolName, toolInput } = input;

  // Sans nom d'outil, on ne peut rien decider de sur : on demande validation.
  if (!toolName) {
    return {
      verdict: 'validate',
      reason: 'action sans outil identifie',
      risk: 'medium',
      category: 'unknown',
    };
  }

  // ── 1. Motifs dangereux -> block ──────────────────────────────────

  // Bash : inspecter la commande pour les motifs destructeurs.
  if (toolName === 'Bash') {
    const cmd = bashCommand(toolInput);
    for (const { re, reason } of DANGEROUS_BASH_PATTERNS) {
      if (re.test(cmd)) {
        return { verdict: 'block', reason, risk: 'high', category: 'dangerous' };
      }
    }
    // Modification du propre noyau via shell (echo > src/..., sed -i, mv ...).
    if (touchesSelfCode(cmd) && /(>|>>|\btee\b|\bsed\s+-i|\bmv\b|\bcp\b|\brm\b)/i.test(cmd)) {
      return {
        verdict: 'block',
        reason: 'modification du noyau de code de l\'agent via shell',
        risk: 'high',
        category: 'self_modification',
      };
    }
  }

  // Ecriture/edition ciblant le propre code source du depot.
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'NotebookEdit') {
    const p = targetPath(toolInput);
    if (p && touchesSelfCode(p)) {
      return {
        verdict: 'block',
        reason: 'modification du noyau de code de l\'agent (src/, package.json, .git)',
        risk: 'high',
        category: 'self_modification',
      };
    }
  }

  // Exfiltration : un input qui contient des secrets reconnus est bloque
  // (check leger reutilisant le scanner existant).
  if (toolInput !== undefined) {
    let serialized = '';
    try {
      serialized = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
    } catch {
      serialized = '';
    }
    if (serialized && scanForSecrets(serialized).length > 0) {
      return {
        verdict: 'block',
        reason: 'l\'action manipule des secrets/credentials (exfiltration potentielle)',
        risk: 'high',
        category: 'exfiltration',
      };
    }
  }

  // ── 2. Lecture seule -> allow ─────────────────────────────────────
  if (SAFE_READONLY_TOOLS.has(toolName)) {
    return {
      verdict: 'allow',
      reason: 'outil en lecture seule',
      risk: 'low',
      category: 'readonly',
    };
  }

  // MCP en lecture seule (pas de mot-cle mutateur) -> allow.
  if (isMcpTool(toolName) && !isMutatingMcpTool(toolName)) {
    return {
      verdict: 'allow',
      reason: 'outil MCP en lecture seule',
      risk: 'low',
      category: 'readonly_mcp',
    };
  }

  // ── 3. Effet de bord -> validate ──────────────────────────────────
  if (SIDE_EFFECT_TOOLS.has(toolName)) {
    return {
      verdict: 'validate',
      reason: 'outil a effet de bord, validation humaine requise',
      risk: 'medium',
      category: 'side_effect',
    };
  }

  if (isMcpTool(toolName)) {
    return {
      verdict: 'validate',
      reason: 'outil MCP mutateur, validation humaine requise',
      risk: 'medium',
      category: 'side_effect_mcp',
    };
  }

  // Outil inconnu : deni securitaire par defaut -> validate.
  return {
    verdict: 'validate',
    reason: 'outil non classe, validation humaine requise',
    risk: 'medium',
    category: 'unknown_tool',
  };
}

// ── Flag opt-in ──────────────────────────────────────────────────────

/**
 * True si le portail de validation est active.
 *
 * Lit `ACTION_GATE_ENABLED` (process.env prioritaire). DEFAUT OFF : la
 * variable doit valoir explicitement true/1/yes/on pour activer le gate.
 * Tant qu'elle n'est pas mise, le chemin principal reste inchange.
 */
export function isActionGateEnabled(): boolean {
  const raw = process.env.ACTION_GATE_ENABLED;
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on' || v === 'enabled';
}
