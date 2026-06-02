# Apprentissages — DPP Battery Intelligence

*L'agent documente ici chaque erreur rencontrée et chaque décision de cadrage non triviale.*

## Format
**Date :** YYYY-MM-DD
**Problème :** [description]
**Cause racine :** [pourquoi]
**Correction :** [ce qui a été fait]
**Leçon :** [règle à retenir]

---

## 2026-06-01 — Codex Adversarial Pass (Phase 7.5) skippée
**Décision :** Phase 7.5 du skill new-project non exécutée.
**Cause :** `which codex` → "codex not found" sur le Mac Mini. Le plugin Codex n'est pas installé.
**Correction :** PLAN.md non passé en revue adversariale par un second LLM. À la place, une section "Auto-revue adversariale" a été ajoutée au PLAN.md (rollback, idempotence, isolation des erreurs, race conditions du scheduler, versioning du registre de sources).
**Leçon :** Si l'on veut la passe Codex sur ce projet, installer Codex CLI + plugin sur le Mac Mini (`npm i -g @openai/codex` + `/plugin install codex@openai-codex`), puis relancer `codex review --commit HEAD` sur PLAN.md avant de figer.

## 2026-06-01 — Squelettes TDD placés hors de src/ au cadrage
**Décision :** Les squelettes RED (Phase 8) sont écrits dans `docs/dpp-battery/tests-skeleton/`, pas directement dans `src/dpp/`.
**Cause :** Le cadrage est fait depuis le MacBook ; l'implémentation est déferrée à une session sur le Mac Mini (choix utilisateur). Déposer des tests RED dans `src/` ferait échouer le suite vitest du daemon en production, et l'état RED ne peut pas être vérifié en SSH (node hors PATH en shell non interactif).
**Correction :** T0 de l'implémentation = déplacer les squelettes vers `src/dpp/__tests__/` et vérifier RED via `npx vitest run src/dpp` sur le Mac Mini.
**Leçon :** Ne pas introduire de tests RED dans un repo en production tant que l'implémentation n'a pas démarré dans le même environnement. Garder l'artefact TDD prêt, mais isolé.

## 2026-06-01 — Scoring via Claude CLI one-shot, pas via CliEngine
**Décision :** La pertinence (T4 prod, `relevance.ts`) appelle `claude -p` en one-shot (`makeClaudeRelevance`), au lieu de réutiliser `engines/cli-engine.ts`.
**Cause :** `CliEngine` est la boucle agent du daemon (streaming, liée à une session, WIP non committé interdit de toucher). Le scoring est un appel pur `item -> nombre [0,1]`, déterministe et mockable. Forcer le streaming engine couplerait au WIP et compliquerait le mock.
**Correction :** `relevance.ts` autonome, `runner` injectable, `parseScore` fail-safe (0 si sortie illisible, donc jamais de faux signal fort). Le scoring (`scoring.ts`) ne reçoit qu'un `RelevanceScorer`, mockable en test.
**Leçon :** "Réutiliser cli-engine" vaut pour la boucle agent. Pour un appel LLM pur et déterministe, un one-shot CLI dédié est plus testable et découple du WIP.

## 2026-06-01 — Routine scheduler : tâche-prompt, pas câblage index.ts
**Décision :** `registerVeilleRoutine()` crée une `scheduled_tasks` dont le prompt ordonne au daemon d'exécuter `node dist/dpp/veille-cli.js`. Pas de modification de `index.ts` (WIP interdit).
**Cause :** Le scheduler existant exécute des prompts via `runAgent`, pas des callbacks TS. Câbler un appel direct exigerait de toucher index.ts/scheduler.ts.
**Correction :** Réutilisation telle quelle du scheduler (prompt -> agent -> bash CLI). `registerVeilleRoutine` idempotent (garde sur l'id `dpp-veille-daily`). L'enregistrement reste à déclencher par l'utilisateur (appel au démarrage ou création de tâche).
**Leçon :** Pour brancher une routine déterministe sur un scheduler prompt-based sans toucher au WIP, passer par une tâche-prompt qui appelle la CLI.

## 2026-06-01 — Tables DPP via createSchema, pas via bump version.json
**Décision :** `createDppSchema()` est appelé depuis le `createSchema()` principal de `src/db.ts`, sans bumper `migrations/version.json`.
**Cause :** Le repo crée toutes ses tables en `CREATE TABLE IF NOT EXISTS` dans `createSchema` (lancé à chaque startup). Bumper `version.json` sans mettre à jour `.applied.json` ferait échouer le garde `checkPendingMigrations` au démarrage du daemon (exit 1, "pending migrations"), donc casserait la prod.
**Correction :** Tables additives DPP ajoutées en `createSchema` (idempotent), cohérent avec la convention du repo. `runMigrations()` reste réservé aux ALTER de colonnes.
**Leçon :** Pour des tables neuves additives, suivre le pattern `createSchema`. Ne réserver `version.json`/`runMigrations` qu'aux changements de colonnes sur tables existantes.

## 2026-06-01 — fingerprint vs content_hash (F-03 AC-03)
**Décision :** `fingerprint = hash(url normalisée + title)` (identité) ; `content_hash` séparé pour la détection de changement. `markSeen()` fait un UPSERT par fingerprint.
**Cause :** AC-03 veut qu'un même URL+title dont le contenu change soit un "nouvel événement", mais AC-01 impose une empreinte stable sur url+title. Les deux coexistent : une ligne par fingerprint, `content_hash` rafraîchi au changement, `hasContentChanged()` compare l'incoming au stocké.
**Leçon :** Ne pas mettre le contenu dans le fingerprint (sinon dédup cassée). Identité et version séparées.

## 2026-06-01 — node absent en SSH non interactif
**Problème :** `node --version` et `npx vitest` échouent via `ssh macmini '...'`.
**Cause :** PATH nvm/homebrew chargé seulement en shell interactif (login).
**Correction :** Pour exécuter node/vitest en SSH, préfixer par le chargement du profil (`source ~/.zshrc` ou chemin absolu de node), ou utiliser une session interactive.
**Leçon :** Toute commande node lancée à distance doit sourcer l'environnement.
