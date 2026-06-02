// F-09 — Interface chatbot Telegram (RAG DPP).
// Intent dedie (commande /dpp ou mot-cle), sans casser les autres usages du bot.
// Compose retrieval (F-08) + answer (F-08) et formate pour Telegram (citations + confiance).
import Database from 'better-sqlite3';

import { answerQuestion, type Answerer } from './answer.js';
import type { Embedder } from './corpus-index.js';
import { retrieve } from './retrieval.js';

export interface ChatDeps {
  db: Database.Database;
  embed: Embedder;
  llm: Answerer;
  k?: number;
  minSimilarity?: number;
  minConfidence?: number;
}

const DPP_COMMAND = /^\/dpp\b/i;
const DPP_HINT = /\b(dpp|passeport.{0,3}batterie|battery passport|2023\/1542)\b/i;

/** Vrai si le message doit etre route vers le RAG DPP (commande dediee ou mot-cle explicite). */
export function isDppQuestion(text: string): boolean {
  return DPP_COMMAND.test(text.trim()) || DPP_HINT.test(text);
}

/** Retire le prefixe de commande pour ne garder que la question. */
export function stripCommand(text: string): string {
  return text.trim().replace(DPP_COMMAND, '').trim();
}

function confidenceLabel(confidence: number, answered: boolean): string {
  if (!answered) return 'aucune (hors corpus)';
  const pct = Math.round(confidence * 100);
  if (pct >= 75) return `haute (${pct} %)`;
  if (pct >= 50) return `moyenne (${pct} %)`;
  return `faible (${pct} %)`;
}

/** Traite une question DPP et renvoie une reponse formatee Telegram. */
export async function handleDppChat(text: string, deps: ChatDeps): Promise<string> {
  const query = stripCommand(text);
  const chunks = await retrieve(deps.db, query, {
    embed: deps.embed,
    k: deps.k,
    minSimilarity: deps.minSimilarity,
  });
  const answer = await answerQuestion(query, chunks, { llm: deps.llm, minConfidence: deps.minConfidence });

  const lines = [answer.text, ''];
  if (answer.citations.length > 0) {
    lines.push(`Sources : ${answer.citations.join(', ')}`);
  }
  lines.push(`Confiance : ${confidenceLabel(answer.confidence, answer.answered)}`);
  return lines.join('\n');
}
