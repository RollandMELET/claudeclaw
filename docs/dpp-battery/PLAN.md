# PLAN — DPP Battery Intelligence
*Méthode goal-backward — 2026-06-01 — dérivé de docs/dpp-battery/prd.md*

## Objectif final

Deux services vivants dans le daemon ClaudeClaw : une veille DPP batterie autonome (digest Obsidian quotidien + alerte Telegram signal fort) et un chatbot RAG qui répond avec citations et niveau de confiance, alimenté par le même corpus que la veille enrichit.

## Raisonnement goal-backward

Pour qu'un utilisateur reçoive une réponse sourcée et fiable (but B), il faut un index du corpus (F-07) interrogé par un retrieval (F-08) exposé sur Telegram (F-09).
Pour qu'un utilisateur reçoive un digest fiable chaque matin (but A), il faut écrire une note (F-05) à partir d'items scorés (F-04), dédupliqués (F-03), collectés (F-02) depuis des sources hiérarchisées (F-01), avec alerte (F-06) sur signal fort.
Tout repose sur le registre des sources (F-01) et la base SQLite (dédup + index). Donc on construit du socle vers les feuilles.

## Prérequis

- **Branche** : `feat/dpp-battery-intel`.
- **DB** : nouvelles tables SQLite (migration) :
  - `dpp_items(id, fingerprint UNIQUE, source_id, source_tier, title, url, published_at, excerpt, theme, relevance, confidence, strong_signal, content_hash, seen_at)`
  - `dpp_alerts(id, item_id, sent_at)` (dédup des alertes)
  - `dpp_index(id, note_path, chunk_text, embedding BLOB, offset, source_tier, indexed_at, note_mtime)`
- **Registre** : `config/dpp-sources.yaml` (versionné).
- **Dépendances optionnelles** (le MVP marche sans) : EU_compliance_MCP (source EUR-Lex T1), changedetection.io (diff sites institutionnels). Documentées, activables en Phase 3.
- **.env** : clés API si requises (EUR-Lex/ePing publics au MVP).

## Architecture des fichiers (src/dpp/)

```
src/dpp/
  sources.ts            # F-01 : charge + valide le registre (config/dpp-sources.yaml)
  collectors/
    eurlex.ts           # F-02 : CELLAR/RSS par CELEX
    eping.ts            # F-02 : API ePing OMC (TBT batteries)
    institutional.ts    # F-02 : fetch + extraction page (CEN, JRC, DIN, Battery Pass)
  collect.ts            # F-02 : orchestre les collecteurs, isole les erreurs
  dedup.ts              # F-03 : fingerprint + lookup SQLite
  scoring.ts            # F-04 : pertinence (LLM mockable) + confiance + signal fort
  digest.ts             # F-05 : rend la note Obsidian
  alert.ts              # F-06 : signal fort -> notify.sh (dédup)
  veille.ts             # entrypoint runVeilleDpp() (appelé par le scheduler)
  corpus-index.ts       # F-07 : chunk + embed + upsert dpp_index (incrémental)
  retrieval.ts          # F-08 : embed query -> cosineSimilarity top-k -> confiance
  answer.ts             # F-08 : génère réponse Claude sourcée (anti-hallucination)
  chat.ts               # F-09 : handler Telegram (commande/intent)
  db.ts                 # tables + accès
  types.ts              # DppItem, Source, Tier, ScoredItem, RetrievedChunk...
config/dpp-sources.yaml # F-01
```

## Phase 1 — Veille MVP (T1-T2 sources)

| Tâche | Feature | Détail | Test (RED -> GREEN) |
|---|---|---|---|
| **T1** | F-01 | `types.ts` + `sources.ts` : charge/valide le registre YAML, expose `getSources()`, `tierOf(sourceId)` | `sources.test.ts` : registre valide chargé, tier résolu, registre invalide rejeté |
| **T2** | F-03 | `dedup.ts` : `fingerprint(item)` stable, `isKnown()`, `markSeen()`, détection changement via content_hash | `dedup.test.ts` : même item -> known ; contenu changé -> nouvel événement |
| **T3** | F-02 | `collectors/*` + `collect.ts` : collecte normalisée, isolation des erreurs | `collect.test.ts` : fixtures HTTP -> items normalisés ; un collecteur en échec n'arrête pas les autres |
| **T4** | F-04 | `scoring.ts` : pertinence (moteur LLM injecté/mockable), fiabilité=tier, confiance, règle signal fort | `scoring.test.ts` : fixtures items + LLM mock -> scores attendus ; tier déterministe ; règle signal fort |
| **T5** | F-05 | `digest.ts` : rend la note Markdown (frontmatter + items groupés par pôle, source/tier/confiance/lien/extrait) | `digest.test.ts` : items -> markdown attendu ; jour vide -> note RAS ; pas d'écrasement |
| **T6** | F-06 | `alert.ts` : sélectionne signaux forts, formate, appelle notify (dédup via dpp_alerts) | `alert.test.ts` : signal fort -> 1 message ; item ordinaire -> 0 ; doublon -> 0 ; multiple -> groupé |
| **T7** | A | `veille.ts` : `runVeilleDpp()` enchaîne collect -> dedup -> score -> persist -> digest -> alert ; idempotent | `veille.test.ts` : run x2 même jour -> 0 doublon, 0 alerte en double |
| **T8** | A | Câblage scheduler : enregistrer la routine cron quotidienne (réutilise scheduler.ts) + CLI `dpp:veille` | `veille-cli.test.ts` : déclenchement manuel OK |
| **T9** | A | Migration DB (dpp_items, dpp_alerts) + intégration db.ts | `db.test.ts` : tables créées, contraintes UNIQUE |

## Phase 2 — Chatbot MVP

| Tâche | Feature | Détail | Test |
|---|---|---|---|
| **T10** | F-07 | `corpus-index.ts` : chunk notes 005+002+digests, embed (embeddings.ts), upsert dpp_index ; incrémental via note_mtime | `corpus-index.test.ts` : note -> chunks indexés ; note inchangée -> pas de réindex |
| **T11** | F-08 | `retrieval.ts` : embed query, cosineSimilarity top-k, confiance = f(similarité, tier) | `retrieval.test.ts` : requête -> bons chunks ordonnés ; confiance cohérente |
| **T12** | F-08 | `answer.ts` : réponse Claude sur passages seuls, citations [[notes]], "je ne sais pas" hors corpus | `answer.test.ts` : question dans corpus -> réponse + citations ; hors corpus -> aveu d'ignorance |
| **T13** | F-09 | `chat.ts` : handler Telegram (commande/intent dédiée), formatage sources+confiance | `chat.test.ts` : message -> route vers RAG, n'affecte pas les autres usages |

## Phase 3 — Élargissement (post-MVP)
- Sources T3-T4 dans le registre (cabinets, LinkedIn via skill linkedin, presse). Pondération de fiabilité.
- Option : EU_compliance_MCP (dépendance) + changedetection.io (webhook) pour fiabiliser T1 et les sites institutionnels.

## Phase 4 — Boucle + démo (post-MVP)
- **F-10** : après écriture d'un digest (T7), déclencher `corpus-index.ts` incrémental. Test : nouveauté du jour interrogeable le jour même.
- Option : web app de démonstration DPPSP.

## Matrice de couverture PRD

| Feature | Tâche(s) | Fichier test |
|---|---|---|
| F-01 | T1 | sources.test.ts |
| F-02 | T3 | collect.test.ts |
| F-03 | T2 | dedup.test.ts |
| F-04 | T4 | scoring.test.ts |
| F-05 | T5 | digest.test.ts |
| F-06 | T6 | alert.test.ts |
| F-07 | T10 | corpus-index.test.ts |
| F-08 | T11, T12 | retrieval.test.ts, answer.test.ts |
| F-09 | T13 | chat.test.ts |
| F-10 | Phase 4 | (boucle, à spécifier) |

## Auto-revue adversariale (en remplacement de la Phase 7.5 Codex, absente)

- **Idempotence** : `runVeilleDpp()` relançable sans effet de bord (dédup avant scoring ET avant alerte). Couvert par T7.
- **Isolation des erreurs** : un collecteur HS (timeout, 404, parse) est loggé et n'interrompt pas le cycle. Couvert par T3.
- **Race condition scheduler** : la routine s'appuie sur la garde anti-refire existante de scheduler.ts (`runningTaskIds` + markTaskRunning). Ne pas lancer deux instances concurrentes ; respecter le verrou DB.
- **Rollback / versioning** : le registre de sources est versionné (git) ; un mauvais tier se corrige par édition YAML sans redeploy. La DB n'efface jamais (append-only sur dpp_items) ; un digest erroné se régénère sans écraser le vault (nouvelle note, pas overwrite).
- **Fiabilité non manipulable** : le tier ne provient jamais du contenu scrappé ni du LLM (sinon une source T4 pourrait se faire passer pour T1). Source de vérité = config/dpp-sources.yaml.
- **Anti-hallucination chatbot** : `answer.ts` ne reçoit que les passages récupérés ; seuil de similarité minimal sinon "je ne sais pas". Couvert par T12.
- **Coût LLM** : scoring batché et limité aux items NOUVEAUX (après dedup), pas à tout le flux. Indexation incrémentale (note_mtime), pas de réembedding complet.
- **Secrets** : clés API en .env, jamais committées.

## Définition de "terminé" (MVP Phases 1-2)
- Tous les tests T1-T13 GREEN.
- `npx vitest run src/dpp` vert, suite globale du daemon toujours verte.
- Veille lancée manuellement produit un digest réel daté dans 04-Veille.
- Chatbot répond aux 10 questions de référence (cf. métriques PRD) avec citations.
