# Guide utilisateur War Room v2

Ce guide couvre les usages quotidiens de la War Room : démarrer une réunion, injecter du texte, brancher un agent Obsidian, configurer le roster, consulter les archives, reprendre une réunion passée.

L'installation et les prérequis vivent dans le README principal. Ici on parle uniquement d'usage.

## Sommaire

1. [Démarrer une réunion](#démarrer-une-réunion)
2. [Injecter du texte pendant une réunion](#injecter-du-texte-pendant-une-réunion)
3. [Ajouter un agent Obsidian](#ajouter-un-agent-obsidian)
4. [Configurer le roster (Settings)](#configurer-le-roster-settings)
5. [Consulter l'archive des réunions](#consulter-larchive-des-réunions)
6. [Reprendre une réunion passée](#reprendre-une-réunion-passée)
7. [Feature flags et fichiers de config](#feature-flags-et-fichiers-de-config)

## Démarrer une réunion

Ouvre `/warroom?token=...` dans le navigateur. Après l'intro cinématique, la War Room affiche :

- La sidebar **Your Team** avec les agents disponibles.
- Le panneau central qui tiendra le transcript.
- En bas, les contrôles : bouton **Start Meeting**, micro, champ texte, waveform.

### Flux vocal classique

1. Pick le mode **Direct** (tu parles à un agent précis) ou **Hand Up** (la team écoute, le mieux placé répond).
2. Click sur un agent dans la sidebar pour le pinner. Le rond à côté de son nom devient vert.
3. Click **Start Meeting**. Le bouton passe en rouge (Stop Meeting) et le micro s'active.
4. Parle. Gemini Live traite la voix en temps réel, l'agent répond en voix. Ta phrase apparaît dans le transcript avec le label `You`, la réponse apparaît avec le nom de l'agent.

Click **Stop Meeting** pour terminer. Le transcript et la durée sont persistés côté archive.

### Astuces

- Si le micro reste muet, vérifie que le navigateur a bien l'autorisation d'accès au mic.
- En mode Hand Up, les réponses sont courtes par design (1-2 phrases). Pour une réponse longue, repasse en mode Direct.
- La variable d'environnement `WARROOM_CHAT_ID` sépare les sessions si tu lances plusieurs War Rooms en parallèle (rare).

## Injecter du texte pendant une réunion

Le champ texte à droite du micro te laisse injecter un message sans parler. Utile quand tu as un mot précis à donner, un lien à coller, ou quand tu es en open space.

1. Meeting démarré (sinon le message part mais n'ira nulle part).
2. Tape ton message dans le champ `warroomTextInput`.
3. Press Entrée (ou click le bouton **Send**).

Le texte apparaît immédiatement dans le transcript avec le label `You`. En coulisses, le client envoie un message RTVI `type: "text-input"` au serveur Pipecat, qui le convertit en `LLMMessagesAppendFrame` pour Gemini. L'agent répond en voix, comme si tu avais parlé.

### Quand le texte est-il pertinent ?

- Donner un nom propre ou un acronyme que Whisper STT massacre à chaque fois.
- Coller un lien ou une référence (SIRET, numéro de PR, identifiant client).
- Changer de sujet rapidement sans couper la parole de l'agent.
- Interagir depuis un environnement où tu ne peux pas parler.

### Désactiver le champ texte

`WARROOM_TEXT_INPUT=0` dans `.env` cache le champ et désactive le handler Python côté serveur.

## Ajouter un agent Obsidian

Les agents Obsidian pointent vers un dossier d'un vault, pas vers un répertoire `agents/<id>/` du repo. Quand tu parles à un agent Obsidian, le SDK Claude Code tourne avec ce dossier comme `cwd`. Il lit donc le `CLAUDE.md` du projet, les skills, les MCPs que tu as configurés pour ce vault.

Deux méthodes : éditer le YAML ou passer par l'UI.

### Méthode 1 : édition directe du YAML

1. Copie le template :
   ```bash
   cp config/obsidian-agents.example.yaml config/obsidian-agents.yaml
   ```
2. Édite `config/obsidian-agents.yaml` :
   ```yaml
   obsidian_agents:
     rorworld-warroom:
       name: RoRworld Admin
       description: Administration RoRworld, compta, refacturation GS1
       vault_root: ~/Library/CloudStorage/GoogleDrive-rm@360sc.io/Mon Drive/OBSIDIAN/CHATTERS
       project_folder: 002 - Projets/SOCIETE/RoRworld
       voice: kokoro
       avatar: rorworld.png
       model: sonnet
   ```
3. Relance le serveur Pipecat pour qu'il relise le YAML. La sidebar affiche l'agent après refresh de la page.

### Méthode 2 : formulaire Settings

1. Click l'icône engrenage dans le header.
2. Scroll jusqu'à la section **Add Obsidian agent**.
3. Remplis le formulaire (id, name, description, vault_root, project_folder, voice). Le champ avatar est optionnel.
4. Click **Add to list** pour le queue, puis **Save** en bas du panneau.
5. Le serveur valide le chemin (path traversal, existence) et écrit `config/user-preferences.yaml`.

### Avatar

Par défaut l'agent hérite d'une image placeholder. Pour un avatar custom, dépose `warroom/avatars/<id>.png` dans le repo (pas committé, à ignorer côté gitignore si c'est perso).

### Sécurité des chemins

Le serveur refuse les `vault_root` dont le `project_folder` résolu sort du vault (tentative de path traversal via `../../`). Les dossiers inexistants sont également rejetés avec une erreur précise.

## Configurer le roster (Settings)

L'icône engrenage dans le header ouvre un panneau en trois sections.

### Active agents

Toggle chaque agent on/off. Les agents désactivés disparaissent de la sidebar et ne sont plus éligibles en mode Hand Up. Utile pour garder une UI lean quand tu as 8+ agents mais que tu n'en utilises que 3 sur ta session du jour.

### Add Obsidian agent

Formulaire décrit à la section précédente.

### Sidebar order

Les boutons ↑ et ↓ à côté de chaque agent remontent ou descendent la ligne. Pratique pour épingler tes 2-3 agents principaux en haut de la sidebar. Les agents non listés dans l'ordre explicite (y compris les Obsidian agents que tu viens d'ajouter) atterrissent à la fin, dans leur ordre initial.

### Save

Click **Save** en bas du panneau. Le serveur écrit `config/user-preferences.yaml` (atomique, write-rename), puis la sidebar se rafraîchit.

### Désactiver le panneau

`WARROOM_SETTINGS_ENABLED=0` dans `.env` cache l'icône engrenage et renvoie 403 sur les endpoints settings.

## Consulter l'archive des réunions

Le bouton **Past Meetings** dans le header ouvre un overlay avec toutes les réunions passées (les 20 plus récentes par défaut, ordre antéchronologique).

### Liste

Chaque ligne affiche la date, l'agent pinné, la durée, le mode (Direct ou Hand Up) et le nombre d'entrées du transcript.

### Détail

Click sur une ligne pour voir le transcript complet :

- Chaque entrée a deux timestamps : **absolu** (HH:MM:SS local) et **relatif** (MM:SS depuis le début de la réunion).
- Le speaker apparaît en majuscules colorées : `YOU` en bleu, les agents en vert, `SYSTEM` en gris.
- Le texte est lisible comme un échange chat.

### Back to Live

Le bouton en haut à droite du panneau ferme l'archive et revient à la vue live.

## Reprendre une réunion passée

Tu retrouves un sujet important d'une réunion d'hier, tu veux continuer sans reperdre le contexte ? Click **Resume**.

1. Ouvre l'archive (Past Meetings).
2. Click sur la réunion que tu veux reprendre.
3. Dans la vue détail, click le bouton **↻ Resume** à côté de la ligne meta.

Ce qui se passe :

- Le dashboard appelle `POST /api/warroom/meeting/:id/resume`.
- Le serveur écrit `/tmp/warroom-resume-session.json` avec le `session_id` Claude Code de la réunion + les 5 derniers tours.
- L'overlay archive se ferme, un badge bleu apparaît en haut à droite (`↻ Resuming: mtg-xxx...`).
- Démarre une nouvelle réunion et parle. Le serveur Pipecat consume le fichier, passe `--resume-session` au voice-bridge, et le SDK Claude Code reprend la conversation exacte.

### Fallback quand le session_id a été purgé

Si le `session_id` d'origine n'est plus exploitable (purge, rotation, etc.), le serveur passe `--resume-turns` avec les derniers tours en JSON. Le voice-bridge les injecte comme préfixe synthétique dans le prompt : l'agent voit le texte du contexte mais n'hérite pas du tool-state original. C'est un best-effort recall, pas une reprise parfaite.

### One-shot

Le fichier resume est consommé par le premier spawn du voice-bridge qui matche l'agent. Ensuite il disparaît. Tu ne risques pas qu'une question posée 10 min plus tard embarque par erreur le contexte de la réunion reprise.

### Désactiver Resume

`WARROOM_RESUME_ENABLED=0` cache le bouton et renvoie 403 sur le POST. Le handler Python devient un no-op même si un fichier traîne.

## Feature flags et fichiers de config

### Feature flags

Tous activés par défaut. Mets `0`, `false` ou `no` pour désactiver.

| Variable | Rôle |
|----------|------|
| `WARROOM_ENABLED` | Active la route `/warroom` et les endpoints associés |
| `WARROOM_TEXT_INPUT` | Champ texte dans la barre de contrôles + handler Pipecat |
| `WARROOM_RESUME_ENABLED` | Bouton Resume + endpoint POST |
| `WARROOM_SETTINGS_ENABLED` | Icône engrenage + endpoints settings |
| `WARROOM_PORT` | Port WebSocket Pipecat (default 7860) |
| `WARROOM_CHAT_ID` | Identifiant de chat pour la persistance de session (default `warroom`) |

### Fichiers de config

| Fichier | Rôle | Commité ? |
|---------|------|-----------|
| `config/obsidian-agents.example.yaml` | Template agents Obsidian | oui |
| `config/obsidian-agents.yaml` | Agents Obsidian actifs | non (gitignored) |
| `config/user-preferences.yaml.example` | Template préférences utilisateur | oui |
| `config/user-preferences.yaml` | État du panneau Settings | non (gitignored) |

### Fichiers runtime

| Fichier | Écrit par | Lu par | Rôle |
|---------|-----------|--------|------|
| `/tmp/warroom-agents.json` | Pipecat (boot) | Pipecat + `_generate_persona` | Roster final, base + Obsidian + prefs appliquées |
| `/tmp/warroom-current-meeting.txt` | Dashboard (meeting/start) | Pipecat (spawn) | `meeting_id` courant forwardé en `--meeting-id` |
| `/tmp/warroom-resume-session.json` | Dashboard (meeting/:id/resume) | Pipecat (spawn, one-shot) | Payload resume, consommé à la première lecture |

Les chemins par défaut sont overridables via `WARROOM_MEETING_FILE`, `WARROOM_RESUME_FILE`, `WARROOM_USER_PREFS_FILE`.

## Aller plus loin

- `docs/rfc-warroom-v2.md` : la spec technique qui a drivé le chantier.
- `CHANGELOG.md` : la liste des 8 slices + hashs.
- Sur le code : `src/warroom-html.ts` (UI), `src/dashboard.ts` (endpoints), `src/agent-voice-bridge.ts` (SDK spawn), `warroom/server.py` (pipeline Pipecat).
