# Progression — DPP Battery Intelligence

*Mis à jour après chaque tâche complétée.*

## [2026-06-01] — Initialisation (cadrage depuis le MacBook)
- [x] Interview (Phase 1) : consolidée depuis le brief utilisateur (décisions actées : RAG maison, Telegram/ClaudeClaw, toutes sources + scoring fiabilité, digest quotidien + alerte signal fort, TDD durci).
- [x] Veille existant (Phase 2) : `prior-art.md` (verdict hybride) + prior art interne repéré (surveillance-ted-dpp.sh, notify.sh, scheduler, embeddings, obsidian).
- [x] PRD (Phase 3) : `prd.md` (10 features, métriques de succès).
- [x] User stories (Phase 4) : `user-stories.md` (14 US) validées par l'utilisateur.
- [~] Design UI (Phase 5) : SKIP (pas d'interface, chatbot Telegram + veille Obsidian).
- [x] Scaffold (Phase 6) : negative-constraints.md, progress.md, learnings.md, CLAUDE.md module.
- [x] PLAN.md (Phase 7) : généré (méthode goal-backward).
- [~] Codex Adversarial Pass (Phase 7.5) : SKIP (Codex non installé sur le Mac Mini). Voir learnings.md. Section auto-adversariale ajoutée au PLAN à la place.
- [x] Squelettes TDD (Phase 8) : `tests-skeleton/` (état RED, à déplacer dans src/dpp/ au démarrage de l'implémentation).

## À faire au démarrage de l'implémentation (session Mac Mini)
- [ ] T0 : `git checkout -b feat/dpp-battery-intel` ; déplacer `docs/dpp-battery/tests-skeleton/*` vers `src/dpp/__tests__/` ; vérifier état RED via `npx vitest run src/dpp`.
- [ ] Phase 1 (Veille MVP) : suivre PLAN.md tâches T1 → T9.
- [ ] Phase 2 (Chatbot MVP) : T10 → T13.

## [2026-06-01] — Socle implémenté (T1, T2, T9) — Mac Mini
- [x] T0 : squelettes RED en place dans `src/dpp/__tests__/`, état RED vérifié (33 fail).
- [x] **T9** (DB) : `src/dpp/db.ts` — `createDppSchema()` crée `dpp_items` (fingerprint UNIQUE), `dpp_alerts` (item_id UNIQUE), `dpp_index`. Câblé dans `src/db.ts createSchema()` (additif, idempotent). `db.test.ts` GREEN (4).
- [x] **T1** (registre) : `src/dpp/types.ts` + `src/dpp/sources.ts` + `config/dpp-sources.yaml` (8 sources MVP T1-T2). `getSources()`, `tierOf()`, `loadRegistry()` avec validation (tier/méthode/champ manquant/id dupliqué). `sources.test.ts` GREEN (10).
- [x] **T2** (dédup) : `src/dpp/dedup.ts` — `fingerprint()` (url normalisée + title), `contentHash()`, `isKnown()`, `markSeen()` (upsert), `hasContentChanged()` (détection changement AC-03). `dedup.test.ts` GREEN (7).
- Vérifs : socle 21/21 GREEN ; suite core daemon (db/migrations/scheduler) 101/101 GREEN ; `tsc --noEmit` clean.
- WIP non lié (cli-engine.ts, index.ts) non touché.
- **STOP socle** — en attente de validation utilisateur avant T3 (collecte) → T8.

## [2026-06-01] — T3 Collecte multi-source (F-02)
- [x] **T3** : `src/dpp/collectors/eurlex.ts` (RSS/Atom), `eping.ts` (API JSON), `institutional.ts` (snapshot HTML pour content_hash), + `src/dpp/collect.ts` (route par méthode, `httpGet` injecté, isolation des erreurs par source, `defaultHttpGet` via fetch). `collect.test.ts` GREEN (5).
- Tier toujours issu du registre (jamais du contenu scrappé). `tsc` clean. Socle+T3 : 26/26 GREEN.
- Reste Phase 1 : T4 scoring → T5 digest → T6 alerte → T7 veille → T8 scheduler.

## [2026-06-01] — T4 Scoring (F-04)
- [x] **T4** : `src/dpp/scoring.ts` — `RelevanceScorer` injecté (mockable), `tierWeight`, `agreementOf` (accord inter-sources), `computeConfidence` (0.5·tier + 0.35·pertinence + 0.15·accord), `isStrongSignal` (règles explicites : T1≥0.7, T2≥0.85, ou marqueur JO/entrée en vigueur/norme finalisée sur T1-T2), `scoreItem`/`scoreItems`. `scoring.test.ts` GREEN (9).
- Fiabilité = `item.sourceTier` (jamais le LLM). Scores arrondis 3 décimales = reproductibles. `tsc` clean. T1-T4 : 35/35 GREEN.
- Reste Phase 1 : T5 digest → T6 alerte → T7 veille → T8 scheduler.

## [2026-06-01] — T5 Digest Obsidian (F-05)
- [x] **T5** : `src/dpp/digest.ts` — `renderDigest()` pur (frontmatter type:veille + items groupés par pôle, triés par confiance ; source/tier/confiance/date/lien/extrait ; 🔴 signal fort ; liste vide → note RAS), `digestFilename()`, `writeDigest()` non destructif (jamais d'écrasement, written:false si la note existe). `VEILLE_SUBPATH` = `002 - Projets/DPP/DPP-EU-Batteries/04-Veille`. `digest.test.ts` GREEN (6, dont anti-tirets-longs).
- `tsc` clean. T1-T5 : 41/41 GREEN.
- Reste Phase 1 : T6 alerte → T7 veille → T8 scheduler.

## [2026-06-01] — T6 Alerte Telegram (F-06)
- [x] **T6** : `src/dpp/alert.ts` — `sendAlerts()` (filtre signaux forts NON déjà notifiés via `dpp_alerts` item_id UNIQUE, un seul message groupé, transaction d'insertion), `formatAlert()`, `strongReason()` (raison explicite), `defaultNotify` (délègue à scripts/notify.sh). `notify` injecté/mockable. `alert.test.ts` GREEN (5 : envoi, ordinaire→0, dédup→0, groupé, anti-tirets-longs).
- `AlertItem = ScoredItem & { id }` (id SQLite issu de markSeen). Idempotent. `tsc` clean. T1-T6 : 46/46 GREEN.
- Reste Phase 1 : T7 veille (orchestration) → T8 scheduler.

## [2026-06-01] — T7 Orchestration veille (Service A)
- [x] **T7** : `src/dpp/veille.ts` — `runVeilleDpp(deps)` enchaîne collect → dedup (avant scoring) → score (LLM sur nouveautés seules) → persist (UPDATE relevance/confidence/strong_signal en transaction) → digest (non destructif) → alert (dédup dpp_alerts). Tout injectable (db, sources, httpGet, relevance, notify, digestDir, date, now). `veille.test.ts` GREEN (2 : flux complet + idempotence run×2 → 0 doublon, 0 alerte double, digest non écrasé).
- `tsc` clean. T1-T7 : 48/48 GREEN.
- Reste Phase 1 : T8 câblage scheduler + CLI `dpp:veille`.

## [2026-06-01] — T8 CLI + câblage scheduler (Service A complet)
- [x] **T8** : `src/dpp/veille-cli.ts` — `runVeilleCli(deps)` (cœur testable), `formatSummary()`, `buildVeilleDeps()` (deps prod : getDatabase, defaultHttpGet, claudeRelevance, defaultNotify, digestDir = vault + 04-Veille), `registerVeilleRoutine(cron)` (createScheduledTask idempotent, id `dpp-veille-daily`, cron défaut `0 7 * * *`), `main()` gardé par entrypoint. Script npm `dpp:veille`. `veille-cli.test.ts` GREEN (3 : déclenchement manuel, formatSummary, registration idempotente).
- [x] `src/dpp/relevance.ts` — `makeClaudeRelevance(runner)` + `claudeRelevance` : pertinence via Claude CLI one-shot (`claude -p`), `parseScore` fail-safe (0 si illisible). Découplé du CliEngine WIP (voir learnings).
- **Phase 1 (Veille MVP) COMPLÈTE** : T1-T9 GREEN (51 tests dpp). Daemon core 124/124 GREEN. `tsc` clean.
- Restent RED (Phase 2 chatbot, hors scope) : answer, chat, corpus-index, retrieval (8 tests).
- WIP non lié (cli-engine.ts, index.ts) non touché. Scheduler/index startup NON câblé automatiquement (registerVeilleRoutine à appeler au démarrage par l'utilisateur, ou tâche créée via CLI).

## [2026-06-01] — Phase 2 Chatbot RAG (T10-T13) COMPLÈTE
- [x] **T10** (F-07) : `src/dpp/corpus-index.ts` — `chunkText` (fenêtres chevauchantes), `embeddingToBlob`/`blobToEmbedding` (Float32), `indexNote`/`indexCorpus` (chunk + embed via `Embedder` injecté + upsert dpp_index), incrémental via `note_mtime` (note inchangée → skip, pas de re-embed ; mtime changé → remplace les chunks). `corpus-index.test.ts` GREEN (6).
- [x] **T11** (F-08) : `src/dpp/retrieval.ts` — `retrieve` (embed query + `cosineSimilarity` réutilisé + top-k ordonné + filtre minSimilarity), `retrievalConfidence` = 0.7·sim + 0.3·tierWeight, bornée [0,1]. `retrieval.test.ts` GREEN (3).
- [x] **T12** (F-08) : `src/dpp/answer.ts` — `answerQuestion` sur passages SEULS, citations `[[notes]]`, confiance = max des passages ; hors corpus / sous seuil → "je ne sais pas" SANS appel LLM (anti-hallucination). `Answerer` injecté. `answer.test.ts` GREEN (4).
- [x] **T13** (F-09) : `src/dpp/chat.ts` — `isDppQuestion` (commande `/dpp` ou mot-clé, n'attrape pas les messages ordinaires), `stripCommand`, `handleDppChat` (retrieval + answer + format Telegram sources + niveau de confiance). `chat.test.ts` GREEN (4).
- **MVP COMPLET** : suite dpp 13 fichiers / 68 tests GREEN. Daemon core 101/101 GREEN. `tsc` clean.
- WIP non lié (cli-engine.ts, index.ts) non touché. Rien committé.
- Reste hors-MVP : F-10 (boucle veille→réindex, Phase 4), branchement Telegram réel de `handleDppChat` dans le routeur du bot (nécessite de toucher index/bot, à valider).

## [2026-06-01] — Branchement daemon (index.ts + bot.ts)
- [x] **Scheduler** : `index.ts` (bloc `AGENT_ID === 'main'` + `ALLOWED_CHAT_ID`) appelle `registerVeilleRoutine()` au démarrage (import dynamique, idempotent, try/catch). La tâche `dpp-veille-daily` (cron `0 7 * * *`) exécute la CLI via le scheduler prompt-based.
- [x] **Chatbot** : `bot.ts` commande `/dpp <question>` → `handleDppChat({ db: getDatabase(), embed: embedText, llm: runClaude })`, typing indicator, try/catch. Ajoutée au menu Telegram. Intent dédiée : n'affecte pas les autres handlers.
- [x] `relevance.ts` : `runClaude()` exporté (one-shot `claude -p`), réutilisé comme Answerer du chatbot et runner par défaut du scoring.
- **Vérifs** : `tsc` clean. **Suite complète 620/620 GREEN** (59 fichiers), dont bot 27, dpp 68, db 55, scheduler.
- WIP existant de index.ts (drop_pending_updates) préservé ; ajout additif uniquement. Rien committé.

## En cours
*(rempli au fil de l'implémentation)*
