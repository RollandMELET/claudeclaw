// F-08 — Reponse sourcee (anti-hallucination).
// Genere une reponse a partir des SEULS passages recuperes. Citations [[notes]] + confiance.
// Si aucun passage pertinent (corpus muet) : "je ne sais pas", SANS appeler le LLM (US-12).
import path from 'path';

import type { RetrievedChunk } from './retrieval.js';

/** Moteur de generation (Claude CLI en prod, mock en test) : passages -> reponse texte. */
export type Answerer = (prompt: string) => Promise<string>;

export interface AnswerDeps {
  llm: Answerer;
  /** Confiance minimale d'un passage pour juger le corpus competent. Defaut 0.35. */
  minConfidence?: number;
}

export interface Answer {
  text: string;
  citations: string[];
  confidence: number;
  answered: boolean;
}

const I_DONT_KNOW =
  "Je ne sais pas : le corpus DPP batterie ne contient pas d element permettant de repondre a cette question.";

/** Nom de note cite, en wikilink [[nom]] (sans extension ni dossier). */
export function citationOf(notePath: string): string {
  const base = path.basename(notePath).replace(/\.md$/i, '');
  return `[[${base}]]`;
}

function buildPrompt(query: string, chunks: RetrievedChunk[]): string {
  const passages = chunks
    .map((c, i) => `[Passage ${i + 1} | ${citationOf(c.notePath)}]\n${c.chunkText}`)
    .join('\n\n');
  return [
    'Tu reponds a une question sur le DPP et la reglementation produits de l UE (batteries 2023/1542, CPR produits de construction, ESPR ecoconception...) EN T APPUYANT UNIQUEMENT sur les passages ci-dessous.',
    'N invente rien. Si les passages ne suffisent pas, dis-le. Cite les notes sous la forme [[nom]].',
    '',
    passages,
    '',
    `Question : ${query}`,
  ].join('\n');
}

/**
 * Construit une reponse sourcee a partir des passages. Aucun passage au-dessus du seuil
 * -> aveu d'ignorance (pas d'appel LLM, pas d'hallucination).
 */
export async function answerQuestion(
  query: string,
  chunks: RetrievedChunk[],
  deps: AnswerDeps,
): Promise<Answer> {
  const minConfidence = deps.minConfidence ?? 0.35;
  const relevant = chunks.filter((c) => c.confidence >= minConfidence);

  if (relevant.length === 0) {
    return { text: I_DONT_KNOW, citations: [], confidence: 0, answered: false };
  }

  const text = (await deps.llm(buildPrompt(query, relevant))).trim();
  const citations = [...new Set(relevant.map((c) => citationOf(c.notePath)))];
  const confidence = Math.max(...relevant.map((c) => c.confidence));

  return { text, citations, confidence, answered: true };
}
