# Prior Art — DPP Battery Watch & RAG Chatbot (ClaudeClaw services A & B)

> Veille réalisée le 2026-06-01 (Phase 2 du skill new-project). Périmètre : projets open source couvrant tout ou partie de SERVICE A (veille réglementaire DPP batterie, scoring fiabilité, digest) et SERVICE B (RAG sur vault Obsidian markdown, citations + confiance). Pertinence > exhaustivité.

## Contexte cible

Daemon TypeScript/Node existant (ClaudeClaw) : bot Telegram 24/7, mémoire SQLite 3 couches, scheduler cron, embeddings internes + `cosineSimilarity` déjà disponibles. On cherche des briques à forker / réutiliser comme dépendance, pas une plateforme à déployer à côté.

## Prior art INTERNE (déjà dans le repo ClaudeClaw)

| Brique | Emplacement | Réutilisation |
|---|---|---|
| Pattern surveillance + alerte | `scripts/surveillance-ted-dpp.sh` | Poll URL + marqueur anti-doublon (`/tmp/.marker`) + push Telegram. Modèle direct de l'alerte "signal fort". Généraliser en multi-source. |
| Notification Telegram | `scripts/notify.sh` | Canal d'alerte déjà câblé. Réutiliser tel quel pour F-06. |
| Scheduler cron | `src/scheduler.ts` | Tasks DB-backed (cron `schedule` + `prompt`), `setInterval(runDueTasks, 60s)`, `computeNextRun`, garde anti-refire, timeout 10 min, sortie Telegram. La veille = une routine planifiée ici. |
| Embeddings | `src/embeddings.ts` | `embedText()` + `cosineSimilarity()`. Cœur du RAG (Service B), zéro dépendance externe. |
| Intégration Obsidian | `src/obsidian.ts` | Lecture du vault. Écriture du digest au bon endroit. |
| Moteur Claude CLI | `src/engines/cli-engine.ts` | Exécution des appels de scoring et de génération. |
| Mémoire / DB | `src/memory.ts`, `src/db.ts` | SQLite pour la dédup et l'index vectoriel. |

## Tableau des candidats externes

| name | url | stars | last_commit | license | stack | description | covered (A/B) | verdict |
|------|-----|-------|-------------|---------|-------|-------------|---------------|---------|
| changedetection.io | github.com/dgtlmoon/changedetection.io | 31.8k | 2026-05-30 | Apache-2.0 | Python | Détection de changement de page web + règles LLM "alert only when X changed" | A (détection diff + alerte) | use-as-dep (service externe webhook) ou inspiration |
| EU_compliance_MCP | github.com/Ansvar-Systems/EU_compliance_MCP | 17 | 2026-05-29 | Apache-2.0 | TypeScript | MCP exposant 61 régulations EU full-text + freshness check vs EUR-Lex | A (source T1 + fraîcheur) | réutilisable comme dépendance (source EUR-Lex T1) |
| eur-lex-mcp | github.com/scimorph/eur-lex-mcp | 8 | 2025-06-13 | MIT | Python | MCP requête régulation EU à jour | A (accès T1) | inspiration |
| eurlex-parser | github.com/noworneverev/eurlex-parser | 20 | 2024-08-14 | MIT | Python | Fetch + parse EUR-Lex → JSON | A (parsing T1) | inspiration (porter en TS) |
| eu_corpus_compiler | github.com/seljaseppala/eu_corpus_compiler | 19 | 2021-12-03 | GPL-3.0 | Python | Pipeline SPARQL/CELLAR EUR-Lex | A (collecte CELLAR) | inspiration (pattern SPARQL CELLAR, ne pas importer le code GPL) |
| govllm | github.com/JehanneDussert/govllm | 19 | 2026-05-27 | custom | Python | Monitoring conformité LLM + LLM-as-judge | A (scoring profil) | inspiration (scoring profil-driven) |
| canary | github.com/velvetmonkey/canary | 0 | 2026-03-25 | custom | Python | Pipeline LangGraph veille ESG : fetch → detect → extract → verify → report | A (pipeline complet) | inspiration (blueprint pipeline) |
| regulatory-webhook-mcp | github.com/CSOAI-ORG/regulatory-webhook-mcp | 0 | 2026-05-31 | MIT | Python | MCP veille réglementaire + webhook | A (abonnement webhook) | inspiration |
| ObsidianRAG | github.com/Vasallo94/ObsidianRAG | 86 | 2026-05-19 | MIT | Python+TS | RAG vault Obsidian, attribution source + relevance scores, plugin TS | B (RAG + citations + scores) | fork / inspiration (porter citation+score en TS) |
| obsidian-rag | github.com/ParthSareen/obsidian-rag | 131 | 2024-10-28 | MIT | Python | "Talk to your Obsidian notes" Langchain RAG | B (RAG markdown) | inspiration |
| obsidianRAGsody | github.com/nicolaischneider/obsidianRAGsody | 35 | 2025-10-16 | MIT | Python | CLI RAG vault + conversion URL→markdown | B (RAG CLI) | inspiration |
| open-dpp | github.com/open-dpp/open-dpp | 16 | 2026-05-31 | AGPL-3.0 | TypeScript | Plateforme gestion DPP | domaine DPP | non pertinent (hors scope, AGPL) |
| BatteryPassDataModel | github.com/batterypass/BatteryPassDataModel | 58 | 2025-11-17 | none | HTML | Modèle de données Battery Passport (DIN DKE SPEC 99100) | référentiel domaine | inspiration + source à surveiller |
| eclipse-tractusx/digital-product-pass | github.com/eclipse-tractusx/digital-product-pass | 48 | 2025-09-18 | Apache-2.0 | Java | Implémentation référence DPP (Catena-X) | domaine DPP | non pertinent (archivé, Java) + source à surveiller |

## Top 5 classé

1. **ObsidianRAG** — le plus proche de Service B : citations + relevance score + lien note, plugin TS. Modèle à porter.
2. **EU_compliance_MCP** — seule brique TS branchée EUR-Lex avec freshness check. Dépendance pour la source T1.
3. **changedetection.io** — moteur de diff le plus mature, règles LLM. Service externe webhook pour les sites institutionnels.
4. **canary** — blueprint pipeline A (fetch → detect → extract → verify → report). À recopier en TS.
5. **eurlex-parser** — logique de parsing EUR-Lex → JSON, à porter en TS.

## Briques réutilisables (pattern → intégration daemon TS)

- **EU_compliance_MCP** (dépendance MCP locale) : récupérer le texte consolidé du 2023/1542 + freshness check. Stack TS, intégration directe.
- **changedetection.io** (service externe + webhook) : surveille les URLs institutionnelles (CEN-CENELEC, JRC, DIN, Battery Pass, GBA). Reçoit le webhook → score → digest. Évite de réimplémenter le diff sémantique.
- **Pattern CELLAR SPARQL** (eu_corpus_compiler) : récupérer un acte EUR-Lex et ses versions consolidées par CELEX. Réécrire en TS (fetch + SPARQL).
- **Pattern citation+score** (ObsidianRAG) : réponse "answer + sources[] {note, score, lineRange}". Trivial avec embeddings + cosineSimilarity : top-k chunks → seuil de similarité = confiance, chaque chunk garde chemin de note + offset.
- **Pattern LLM-as-judge profil-driven** (govllm) : définir un "profil DPP batterie" (mots-clés, articles, annexes du 2023/1542) comme grille de notation de la pertinence.
- **Patterns n8n RSS+LLM+scoring** : scoring High/Medium/Low + dédup par hash, transposables (sans adopter n8n comme runtime, le daemon a déjà cron + Telegram).

## Recommandation : HYBRIDE

- **Service A** : aucun projet ne couvre l'ensemble (multi-source officiel + social, scoring fiabilité par tier, digest Obsidian, alerte signal fort). → Construire le cœur en TS dans le daemon (orchestration cron, scoring tier, digest), réutiliser EU_compliance_MCP (dépendance, source EUR-Lex T1), brancher changedetection.io (service externe) pour les sites institutionnels. Recopier le blueprint de canary.
- **Service B** : build-from-scratch léger en TS. Les embeddings + cosineSimilarity internes rendent une dépendance RAG lourde (LangChain/FastAPI) contre-productive. Porter la logique citations+confiance d'ObsidianRAG (pas le code Python). Un RAG markdown tient en ~200 lignes TS quand l'indexation existe.

Pas de fork de plateforme complète (toutes Python ou Java = friction avec un daemon Node unique).

## Différentiateurs vs l'existant

1. **Scoring de fiabilité par tier de source (T1 officiel → T4 social)** : absent de tous les candidats. Le couplage pertinence × fiabilité-par-tier appliqué au DPP batterie est inédit.
2. **Intégration native daemon Telegram + cron + vault** : zéro infra additionnelle, alerte poussée directement dans Telegram.
3. **Corpus = vault Obsidian déjà structuré** : le RAG répond avec des `[[wikilinks]]` natifs, et la veille écrit ses notes au bon endroit (boucle veille → corpus → RAG fermée).
4. **Spécialisation domaine** : aucun candidat ne combine veille + RAG + ciblage 2023/1542 + DPP. Les repos batterie (BatteryPassDataModel, tractusx) deviennent des sources à surveiller, pas des concurrents.

## Risques d'avoir manqué un projet

- **WTO ePing / TBT** : aucun OSS pertinent trouvé. Traiter via l'API officielle ePing.
- Recherche limitée à GitHub (GitLab/Codeberg non explorés ; CIRPASS/Catena-X hébergent parfois ailleurs).
- Outils SaaS propriétaires exclus volontairement (Regology, FiscalNote).
- Frameworks RAG TS génériques (LlamaIndex.TS, transformers.js, Vectra, @xenova) non détaillés : briques B possibles si on veut une lib d'indexation plutôt que du code maison.
