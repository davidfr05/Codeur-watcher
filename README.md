# Codeur Watcher

Surveille les nouvelles missions sur **codeur.com**, va lire la **page complète** de chaque annonce, la qualifie automatiquement avec Claude selon ton profil freelance, et t'envoie un email **uniquement pour les bons plans** (« SUPER PLAN » ou « À RÉPONDRE »), avec les « MOYEN » regroupés à part. Anti-doublons intégré : une annonce n'est jamais évaluée deux fois.

## Comment ça marche

1. **Détection** — lecture du flux RSS de codeur (`/projects.rss`) pour repérer les nouvelles annonces.
2. **Pré-filtre gratuit** — les titres contenant un mot clé hors périmètre (CMS, cybersécurité, non-dev...) sont écartés avant tout appel IA (`preFiltreMotsCles`).
3. **Anti-doublons** — les annonces déjà vues sont mémorisées dans `seen.json`.
4. **Enrichissement** — pour chaque nouvelle annonce, ouverture de sa **page publique** afin de récupérer la description **complète**, le budget exact, le nombre d'offres/vues, le **montant moyen des devis concurrents** et le **délai estimé** par la plateforme. (Aucune connexion requise : ces infos sont publiques.)
5. **Filet de sécurité** — si la description complète révèle une techno hors périmètre non visible dans le titre (`motsExclusionDescription`), l'annonce est écartée sans appel IA.
6. **Évaluation (Claude Haiku)** — note correspondance, complexité, charge, ratio prix/travail, niveau de concurrence, verdict.
7. **Rédaction (Claude Sonnet)** — uniquement pour les annonces retenues : un message de premier contact court + une proposition détaillée.
8. **Notification** — UN seul email récapitulatif par passage, avec 2 sections : « À traiter en priorité » (SUPER PLAN / À RÉPONDRE) et « À regarder quand même » (MOYEN). Rien n'est envoyé s'il n'y a aucune mission intéressante.

## Fichiers

- `config.js` — **ton profil** (technos, TJM cible/plancher par jour, charge max, red flags) et les réglages. Le seul fichier à ajuster au quotidien.
- `prompt.js` — les deux prompts : évaluation (Haiku) et rédaction des messages client (Sonnet).
- `scraper.js` — récupération + parsing de la page détail publique.
- `index.js` — orchestration (détection → filtres → enrichissement → éval → rédaction → email).
- `.env` — tes secrets (jamais publiés, voir `.env.example`).

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
- `NOTIFY_TO` — adresse(s) qui reçoivent les alertes.

## Utilisation

```bash
npm run dry        # évalue et écrit un aperçu (apercu-email.html), SANS email ni mémorisation
npm run testmail    # envoie un email récap d'EXEMPLE, pour vérifier le format et le SMTP
npm start           # exécution normale : évalue les nouvelles annonces et envoie 1 email récap
npm run watch        # surveillance continue (boucle), pour un serveur toujours allumé — c'est le mode utilisé en prod
```

Autres commandes utiles (pas de script npm dédié) :
```bash
node index.js --seed              # marque TOUT le stock actuel comme déjà vu (1x avant la prod)
node index.js --debug <url>       # affiche ce que le scraper extrait d'une annonce précise, pour diagnostiquer scraper.js
```

## Mise en production

Le mode réel utilisé en prod est `--watch` (boucle continue), tournant sur un VPS via un service **systemd** — pas un cron ponctuel. Voir `MEMO.md` (usage quotidien) et `SERVEUR.md` (accès et administration du serveur) pour le détail.

Si tu préfères une exécution périodique plutôt qu'une boucle continue (ex. sur un PC qui n'est pas allumé en permanence), une alternative par tâche planifiée reste possible :

**Linux / macOS** — `crontab -e` :
```
*/10 * * * * cd /chemin/vers/codeur-watcher && /usr/bin/node index.js >> watcher.log 2>&1
```

**Windows** — Planificateur de tâches : action « Démarrer un programme », programme `node`, argument `index.js`, dossier de départ = le dossier du projet, déclencheur toutes les 10 min.

## Réglages utiles (`config.js`)

- `rssUrl` — tout (`/projects.rss`) ou une catégorie (`https://www.codeur.com/developpeur/web.rss`).
- `seuilCorrespondance` — note minimale (0-10) à partir de laquelle une mission est jugée « à répondre ».
- `verdictsAlertes` / `verdictsSecondaires` — quels verdicts déclenchent un email, et lesquels vont en section secondaire.
- `modeleEvaluation` / `modeleProposition` — modèles Claude utilisés (Haiku pour évaluer toutes les annonces, Sonnet pour rédiger celles retenues, afin de limiter le coût).
- `maxParRun` — plafond d'évaluations par exécution (coût/temps). Chaque annonce = 1 requête page + 1 appel Claude.
- `intervalleSecondes` — intervalle entre deux passages en mode `--watch`.
- `retentionJours` — durée de mémoire des annonces vues.

## Notes

- Le scraper repère la description comme le **plus long paragraphe** de la page (résilient) et lit les champs par étiquette (« Budget indicatif », « Montant moyen des devis… », « Estimation du délai »). Si codeur change fortement sa page, ajuste les expressions dans `scraper.js` (utilise `node index.js --debug <url>` pour diagnostiquer).
- Une pause de 1,5 s est respectée entre deux pages (politesse, éviter tout blocage).
- La proposition reste un **brouillon** : relis-la et envoie-la toi-même depuis codeur (l'envoi automatique nécessiterait ton compte connecté et n'est pas inclus).
- Une annonce dont l'évaluation IA échoue est tout de même marquée « vue » (pas de retry) : choix assumé pour privilégier la réactivité, puisqu'une mission ratée est de toute façon probablement déjà prise à ce stade.
- Coût : quelques centimes/jour, seules les nouvelles annonces étant évaluées.
