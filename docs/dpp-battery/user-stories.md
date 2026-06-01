# User Stories — DPP Battery Intelligence
*Générées depuis docs/dpp-battery/prd.md — Version 1.0*

## F-01 : Registre des sources hiérarchisé

### US-01 : Déclarer les sources et leur fiabilité
**En tant que** veilleur DPP,
**je veux** un registre où chaque source porte un tier de fiabilité,
**afin de** savoir, pour toute information, si c'est un fait juridique ou une interprétation.
**Critères d'acceptation :**
- [ ] Le registre est un fichier versionné, éditable sans toucher au code.
- [ ] Chaque source a pôle + tier (T1-T4) + méthode de collecte.
**Notes :** socle partagé veille + chatbot.

## F-02 : Collecte multi-source

### US-02 : Collecter les nouveautés des sources officielles
**En tant que** veilleur,
**je veux** que le système récupère automatiquement les items récents d'EUR-Lex, ePing et des sites institutionnels,
**afin de** ne pas avoir à visiter chaque site manuellement.
**Critères d'acceptation :**
- [ ] Items normalisés `{title, source, tier, url, date, excerpt, theme}`.
- [ ] Un collecteur en panne n'arrête pas les autres.

### US-03 : Lancer la collecte à la demande
**En tant que** veilleur,
**je veux** déclencher une collecte manuelle depuis le CLI,
**afin de** tester ou rafraîchir hors du cycle quotidien.

## F-03 : Déduplication

### US-04 : Ne pas revoir deux fois la même info
**En tant que** veilleur,
**je veux** que les items déjà vus soient ignorés,
**afin de** ne pas être noyé sous les répétitions.
**Critères d'acceptation :**
- [ ] Empreinte stable stockée en base.
- [ ] Un changement de contenu sur une URL connue compte comme un nouvel événement.

## F-04 : Scoring pertinence + confiance + signal fort

### US-05 : Filtrer le pertinent du bruit
**En tant que** veilleur,
**je veux** que chaque item soit noté en pertinence contre le périmètre DPP batterie,
**afin de** prioriser ma lecture.

### US-06 : Connaître la fiabilité de chaque info
**En tant que** veilleur,
**je veux** voir le tier de fiabilité et un score de confiance pour chaque item,
**afin de** pondérer ce que je lis (fait vs signal faible).
**Critères d'acceptation :**
- [ ] Fiabilité déterministe (issue du tier de la source).
- [ ] Confiance = tier + pertinence + accord inter-sources.

### US-07 : Repérer immédiatement un événement majeur
**En tant que** veilleur,
**je veux** qu'un "signal fort" soit détecté par des règles explicites,
**afin de** réagir vite (ex : un acte délégué publié).

## F-05 : Digest Obsidian quotidien

### US-08 : Recevoir un digest quotidien dans mon vault
**En tant que** veilleur,
**je veux** une note datée résumant les nouveautés, classées et sourcées,
**afin de** avoir une trace cherchable et un point d'entrée chaque matin.
**Critères d'acceptation :**
- [ ] Note dans `04-Veille/`, frontmatter conforme, items groupés par pôle.
- [ ] Chaque item : source, tier, confiance, date, lien, extrait.
- [ ] Écriture non destructive.

## F-06 : Alerte Telegram signal fort

### US-09 : Être alerté sur Telegram uniquement sur l'important
**En tant que** veilleur,
**je veux** un push Telegram seulement sur signal fort,
**afin de** ne pas être spammé tout en ne ratant rien de critique.
**Critères d'acceptation :**
- [ ] Réutilise notify.sh / sender existant.
- [ ] Anti-spam : pas d'alerte sur item ordinaire, dédup des alertes, groupage si multiple.

## F-07 : Indexation du corpus

### US-10 : Indexer le corpus DPP pour l'interrogation
**En tant que** utilisateur du chatbot,
**je veux** que mes notes 005 + 002 + digests soient indexées,
**afin de** pouvoir les interroger sémantiquement.
**Critères d'acceptation :**
- [ ] Embeddings via embeddings.ts, vecteurs en SQLite avec chemin de note + tier.
- [ ] Réindexation incrémentale.

## F-08 : Retrieval + réponse sourcée

### US-11 : Obtenir une réponse précise et sourcée
**En tant que** utilisateur,
**je veux** poser une question pointue et recevoir une réponse citée avec niveau de confiance,
**afin de** faire confiance à la réponse et remonter à la source.
**Critères d'acceptation :**
- [ ] Réponse basée uniquement sur les passages récupérés.
- [ ] Citations `[[notes]]` + niveau de confiance.

### US-12 : Savoir quand le corpus ne sait pas
**En tant que** utilisateur,
**je veux** que le bot dise explicitement quand l'info n'est pas dans le corpus,
**afin de** ne jamais être induit en erreur par une hallucination.

## F-09 : Interface chatbot Telegram

### US-13 : Interroger le DPP depuis Telegram
**En tant que** utilisateur,
**je veux** poser mes questions DPP dans ClaudeClaw sur Telegram,
**afin de** y accéder partout sans nouvelle interface.
**Critères d'acceptation :**
- [ ] Commande/intent dédiée, sans casser les autres usages du bot.
- [ ] Réponse formatée avec sources et confiance.

## F-10 : Boucle veille → chatbot

### US-14 : Interroger les nouveautés du jour
**En tant que** utilisateur,
**je veux** que les digests de veille soient interrogeables le jour même,
**afin de** poser des questions sur l'actualité fraîche.
**Critères d'acceptation :**
- [ ] Réindexation incrémentale après écriture d'un digest.

## Découpage en phases (rappel PRD)

- **Phase 1 (Veille MVP)** : US-01 à US-09 sur sources T1-T2.
- **Phase 2 (Chatbot MVP)** : US-10 à US-13.
- **Phase 3 (Élargissement)** : sources T3-T4 (cabinets, LinkedIn, presse).
- **Phase 4 (Boucle + démo)** : US-14, option web app DPPSP.
