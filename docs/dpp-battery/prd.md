# PRD — DPP Battery Intelligence (services ClaudeClaw)
*Version 1.0 — 2026-06-01*

## Résumé produit

Deux services intégrés au daemon ClaudeClaw qui transforment le corpus DPP batterie du vault Obsidian en système vivant. **Service A (Veille)** surveille en continu les évolutions du Passeport Numérique de Batterie (Règlement UE 2023/1542) sur toutes les natures de sources (réglementaire, normalisation, experts, social), score chaque information par pertinence et par fiabilité de la source, et livre un digest Obsidian quotidien plus une alerte Telegram sur signal fort. **Service B (Chatbot RAG)** répond à des questions précises sur le DPP batterie en s'appuyant sur le corpus du vault (bibliothèque 005 + atelier 002 + digests de veille), avec citations et niveau de confiance. Les deux partagent un socle : le vault comme source de vérité, un index SQLite, et un registre des sources hiérarchisé par fiabilité.

## Utilisateurs cibles

- **Primaire** : Rolland MELET, fondateur 360SmartConnect / RoRworld, en positionnement DPP Service Provider (DPPSP). Besoin : ne rater aucune évolution réglementaire/technique avant l'échéance du 18 février 2027, et interroger le corpus sans relire 17 notes.
- **Secondaire (Phase 4)** : prospects / partenaires DPPSP via une interface de démonstration (web app optionnelle).

## Contexte technique

Intégration dans `~/Dev/ClaudeClaw` (TypeScript/Node, vitest, SQLite, daemon Telegram multi-agent, scheduler cron). Réutilise `scheduler.ts`, `embeddings.ts`, `obsidian.ts`, `engines/cli-engine.ts`, `scripts/notify.sh`. Voir `docs/dpp-battery/prior-art.md`. Décision d'architecture : **hybride** (cœur TS maison + EU_compliance_MCP en dépendance + changedetection.io en service externe optionnel).

## Fonctionnalités MVP

### F-01 : Registre des sources hiérarchisé par fiabilité
**Description :** Une configuration déclarative listant les sources surveillées, chacune affectée à un pôle et à un tier de fiabilité. Pilote la collecte ET le scoring.
**Critères d'acceptation :**
- [ ] AC-01 : chaque source porte `{id, nom, url/endpoint, pole, tier (T1-T4), méthode de collecte, fréquence}`.
- [ ] AC-02 : tiers définis : T1 Officiel/juridique (fait), T2 Normalisation/institutionnel (haute), T3 Experts/cabinets (interprétation), T4 Social/presse (à corroborer).
- [ ] AC-03 : le registre est versionné dans le repo (YAML ou TS), modifiable sans toucher au code de collecte.
- [ ] AC-04 : sources MVP T1-T2 incluses : EUR-Lex (CELEX 32023R1542 + délégués), ePing OMC (TBT batteries), DG ENVI, CEN-CENELEC (JTC 24), JRC, DIN, Battery Pass.

### F-02 : Collecte multi-source
**Description :** Des collecteurs par pôle récupèrent les items récents de chaque source et les normalisent dans un format commun.
**Critères d'acceptation :**
- [ ] AC-01 : chaque item normalisé = `{title, sourceId, sourceTier, url, publishedAt, excerpt, theme}`.
- [ ] AC-02 : au moins un collecteur fonctionnel par méthode MVP (EUR-Lex/CELLAR, ePing API, scraping page institutionnelle).
- [ ] AC-03 : un collecteur en échec n'interrompt pas les autres (isolation des erreurs, log).
- [ ] AC-04 : la collecte est déclenchable manuellement (CLI) et automatiquement (routine cron).

### F-03 : Déduplication
**Description :** Ne traiter qu'une fois chaque information déjà vue.
**Critères d'acceptation :**
- [ ] AC-01 : empreinte stable par item (hash de `url` normalisée + `title`), stockée en SQLite.
- [ ] AC-02 : un item déjà connu est ignoré (pas de re-scoring, pas de re-notification).
- [ ] AC-03 : la modification d'un item déjà vu (changement de contenu sur même URL) est détectée comme un nouvel événement.

### F-04 : Scoring pertinence + confiance + signal fort
**Description :** Chaque item nouveau reçoit un score de pertinence DPP batterie, un score de confiance, le tier de fiabilité de sa source, et un drapeau "signal fort".
**Critères d'acceptation :**
- [ ] AC-01 : pertinence évaluée par le moteur Claude CLI contre un "profil DPP batterie" (articles, annexes, mots-clés du 2023/1542).
- [ ] AC-02 : la fiabilité provient du tier de la source (F-01), pas du LLM (déterministe).
- [ ] AC-03 : le score de confiance combine tier + pertinence + accord inter-sources.
- [ ] AC-04 : un item est "signal fort" selon des règles explicites (ex : acte publié au JO, norme finalisée, T1/T2 + pertinence haute).
- [ ] AC-05 : le scoring est testable de façon déterministe (fixtures d'items → scores attendus, avec moteur LLM mockable).

### F-05 : Digest Obsidian quotidien
**Description :** Une note datée résumant les nouveautés du jour, classées et sourcées, écrite dans le vault.
**Critères d'acceptation :**
- [ ] AC-01 : note écrite dans `002 - Projets/DPP/DPP-EU-Batteries/04-Veille/` au format `YYYY-MM-DD_VEILLE_DPP-Batterie.md`.
- [ ] AC-02 : frontmatter conforme (type: veille, tags, created) + items groupés par pôle/thème.
- [ ] AC-03 : chaque item affiche source, tier de fiabilité, score de confiance, date, lien direct, extrait.
- [ ] AC-04 : un jour sans nouveauté produit une note "RAS" (ou pas de note, selon config), jamais une erreur.
- [ ] AC-05 : écriture non destructive (jamais d'écrasement d'une note existante du vault).

### F-06 : Alerte Telegram sur signal fort
**Description :** Push Telegram immédiat uniquement quand un signal fort est détecté.
**Critères d'acceptation :**
- [ ] AC-01 : réutilise le canal `scripts/notify.sh` / le sender du daemon.
- [ ] AC-02 : message = titre, source + tier, pourquoi c'est un signal fort, lien direct.
- [ ] AC-03 : pas d'alerte pour les items ordinaires (anti-spam) ; dédup des alertes (marqueur).
- [ ] AC-04 : si plusieurs signaux forts le même cycle, un seul message groupé.

### F-07 : Indexation du corpus (embeddings)
**Description :** Indexer les notes du vault pertinentes pour le chatbot.
**Critères d'acceptation :**
- [ ] AC-01 : périmètre = `005/REGLEMENTS EU/Batteries/` + `002/DPP/DPP-EU-Batteries/` + digests de veille.
- [ ] AC-02 : chunking des notes + embedding via `embeddings.ts`, vecteurs stockés en SQLite avec `{notePath, chunkText, offset, sourceTier}`.
- [ ] AC-03 : indexation incrémentale (ne réindexe que les notes modifiées).

### F-08 : Retrieval sémantique + réponse sourcée
**Description :** Pour une question, récupérer les passages pertinents et générer une réponse citée avec niveau de confiance.
**Critères d'acceptation :**
- [ ] AC-01 : recherche par `cosineSimilarity` top-k sur l'index.
- [ ] AC-02 : réponse générée par Claude CLI à partir des seuls passages récupérés (pas d'invention hors corpus).
- [ ] AC-03 : réponse affiche les citations `[[notes]]` et le niveau de confiance (dérivé du tier des sources citées + similarité).
- [ ] AC-04 : si le corpus ne contient pas la réponse, le bot le dit explicitement (pas d'hallucination).

### F-09 : Interface chatbot Telegram
**Description :** Poser des questions au chatbot DPP via ClaudeClaw sur Telegram.
**Critères d'acceptation :**
- [ ] AC-01 : une commande/intent dédiée route la question vers le RAG DPP (sans casser les autres usages du bot).
- [ ] AC-02 : réponse formatée Telegram (citations cliquables ou références de notes).
- [ ] AC-03 : la réponse inclut systématiquement le niveau de confiance et les sources.

### F-10 : Boucle veille → chatbot (réindexation)
**Description :** Quand la veille ajoute un digest, le chatbot le prend en compte.
**Critères d'acceptation :**
- [ ] AC-01 : après écriture d'un digest (F-05), l'index (F-07) est mis à jour de façon incrémentale.
- [ ] AC-02 : une question portant sur une nouveauté du jour est répondable le jour même.

## Stack technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Runtime | TypeScript / Node (daemon ClaudeClaw) | Existant, intégration native cron + Telegram |
| Tests | vitest | Stack de test du repo, TDD |
| BDD | SQLite (better-sqlite3) | Dédup + index vectoriel, déjà utilisé |
| Embeddings | `src/embeddings.ts` interne | Zéro dépendance lourde |
| LLM | Claude CLI via `engines/cli-engine.ts` | Scoring + génération |
| Planif | `src/scheduler.ts` (cron) | Routine veille quotidienne |
| Alertes | `scripts/notify.sh` / sender Telegram | Canal existant |
| Source EUR-Lex (option) | EU_compliance_MCP (dépendance) | Source T1 + freshness check |
| Détection sites (option) | changedetection.io (service externe) | Diff sémantique des pages institutionnelles |

## Hors scope MVP

- Web app de démonstration DPPSP (Phase 4, optionnelle).
- Sources T3-T4 (cabinets, LinkedIn, presse) : Phase 3.
- Multi-utilisateurs / multi-secteurs (autres DPP que batterie).
- Génération automatique de synthèses longues (au-delà du digest).
- Réponse vocale du chatbot (Whisper existe dans ClaudeClaw, mais hors MVP).

## Métriques de succès (Phase 1-2)

- La veille tourne en autonomie quotidienne et produit un digest daté exploitable sans intervention.
- Zéro doublon dans les digests sur 7 jours consécutifs.
- Une alerte Telegram se déclenche sur un vrai signal fort (test : republication d'un acte) et pas sur du bruit.
- Le chatbot répond correctement à 10 questions de référence sur le DPP batterie, avec citations vérifiables vers les notes, et dit "je ne sais pas" sur une question hors corpus.
- Chaque information de veille porte un tier de fiabilité lisible.
