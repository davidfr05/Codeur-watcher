# Codeur Watcher

Surveille les nouvelles missions sur **codeur.com**, va lire la **page complète** de chaque annonce, la qualifie automatiquement avec Claude selon ton profil freelance, et t'envoie un email **uniquement pour les bons plans** (« SUPER PLAN » ou « À RÉPONDRE »). Anti-doublons intégré : une annonce n'est jamais évaluée deux fois.

## Comment ça marche

1. **Détection** — lecture du flux RSS de codeur (`/projects.rss`) pour repérer les nouvelles annonces.
2. **Anti-doublons** — les annonces déjà vues sont mémorisées dans `seen.json`.
3. **Enrichissement** — pour chaque nouvelle annonce, ouverture de sa **page publique** afin de récupérer la description **complète**, le budget exact, le nombre d'offres/vues, le **montant moyen des devis concurrents** et le **délai estimé** par la plateforme. (Aucune connexion requise : ces infos sont publiques.)
4. **Évaluation** — Claude note correspondance, complexité, charge, ratio prix/travail, niveau de concurrence, et rédige un brouillon de proposition.
5. **Notification** — UN seul email récapitulatif par exécution, avec 2 sections : « À traiter en priorité » (SUPER PLAN / À RÉPONDRE) et « À regarder quand même » (MOYEN). Chaque mission a son compte rendu et son brouillon. Rien n'est envoyé s'il n'y a aucune mission intéressante.

## Fichiers

- `config.js` — **ton profil** (technos, tarifs 65/45 €/h, red flags) et les réglages. Le seul fichier à ajuster au quotidien.
- `prompt.js` — le prompt de qualification (utilise toutes les données enrichies).
- `scraper.js` — récupération + parsing de la page détail publique.
- `index.js` — orchestration (détection → enrichissement → éval → email).

## Installation

Prérequis : **Node.js 18+**.

```bash
cd codeur-watcher
npm install
cp .env.example .env   # puis remplis .env
```

Dans `.env` :
- `ANTHROPIC_API_KEY` — clé sur https://console.anthropic.com/
- identifiants SMTP pour l'email (avec Gmail : **mot de passe d'application**, pas ton mot de passe habituel).

## Utilisation

Test à blanc (évalue et affiche dans la console, **sans email**, sans marquer comme vus) :

```bash
npm run dry
```

Exécution réelle :

```bash
npm start
```

## Automatisation (cron)

Lance le script toutes les ~10 min pour la réactivité.

**Linux / macOS** — `crontab -e` :

```
*/10 * * * * cd /chemin/vers/codeur-watcher && /usr/bin/node index.js >> watcher.log 2>&1
```

**Windows** — Planificateur de tâches : action « Démarrer un programme », programme `node`, argument `index.js`, dossier de départ = le dossier du projet, déclencheur toutes les 10 min.

## Réglages utiles (`config.js`)

- `rssUrl` — tout (`/projects.rss`) ou une catégorie (`https://www.codeur.com/developpeur/web.rss`).
- `verdictsAlertes` — quels verdicts déclenchent un email.
- `maxParRun` — plafond d'évaluations par exécution (coût/temps). Chaque annonce = 1 requête page + 1 appel Claude.
- `modele` — modèle Claude utilisé.
- `retentionJours` — durée de mémoire des annonces vues.

## Notes

- Le scraper repère la description comme le **plus long paragraphe** de la page (résilient) et lit les champs par étiquette (« Budget indicatif », « Montant moyen des devis… », « Estimation du délai »). Si codeur change fortement sa page, ajuste les expressions dans `scraper.js`.
- Une pause de 1,5 s est respectée entre deux pages (politesse, éviter tout blocage).
- La proposition reste un **brouillon** : relis-la et envoie-la toi-même depuis codeur (l'envoi automatique nécessiterait ton compte connecté et n'est pas inclus).
- Coût : quelques centimes/jour, seules les nouvelles annonces étant évaluées.
