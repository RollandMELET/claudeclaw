# Contraintes négatives — DPP Battery Intelligence

## Spécifiques au projet
- NE PAS laisser le LLM décider de la fiabilité d'une source. La fiabilité = le tier du registre (déterministe). Le LLM ne fait que la pertinence et le résumé.
- NE PAS faire répondre le chatbot hors corpus. Pas de connaissance générale injectée : uniquement les passages récupérés. Dire "je ne sais pas" si absent (US-12).
- NE PAS écraser ou modifier une note existante du vault. La veille écrit de NOUVELLES notes datées. Enrichissement non destructif uniquement (règle vault CHATTERS).
- NE PAS spammer Telegram. Alerte seulement sur signal fort, avec dédup (marqueur, comme surveillance-ted-dpp.sh).
- NE PAS dupliquer les items de veille. Dédup par empreinte stable avant tout scoring/notification.
- NE PAS coder les sources en dur dans la logique de collecte. Tout passe par le registre versionné (config/dpp-sources.yaml).

## Intégration ClaudeClaw
- NE PAS casser les tests existants du daemon. Le module vit dans `src/dpp/`, isolé.
- NE PAS introduire un second bot ni un runtime parallèle. Réutiliser scheduler, sender Telegram, embeddings, obsidian existants.
- NE PAS committer le WIP non lié déjà présent dans le working tree (cli-engine.ts, index.ts modifiés). Committer seulement les fichiers du module dpp.
- NE PAS ajouter de dépendance lourde de RAG (LangChain, FastAPI). Les embeddings + cosineSimilarity internes suffisent.

## Architecture
- NE PAS ajouter de dépendance sans justification dans PLAN.md (EU_compliance_MCP et changedetection.io sont optionnels, le MVP doit fonctionner sans eux via fetch direct).
- NE PAS introduire d'abstractions prématurées (YAGNI). Un collecteur = une fonction.
- NE PAS importer de code sous licence contaminante (eu_corpus_compiler GPL-3, repos sans licence). Réécrire les patterns, ne pas copier le code.

## Code
- NE PAS écrire du code sans test correspondant écrit en premier (TDD).
- NE PAS utiliser `any` en TypeScript sans commentaire justificatif.
- NE PAS rendre le scoring non testable. Le moteur LLM doit être mockable (fixtures items → scores attendus).

## Sécurité / robustesse
- NE PAS stocker de secrets dans le code (clés API EUR-Lex/ePing dans .env).
- NE PAS laisser un collecteur en échec faire tomber tout le cycle (isolation des erreurs).
- NE PAS faire d'écriture non idempotente. Relancer la veille deux fois le même jour ne doit pas créer de doublons ni de fausses alertes.

## Style (contenu généré, digests, réponses chatbot en français)
- NE PAS utiliser de tirets longs (— ou –). Tiret court, virgule, parenthèses.
- NE PAS oublier les accents français.
- NE PAS employer de connecteurs lourds ("En somme", "Par conséquent", "En outre").
