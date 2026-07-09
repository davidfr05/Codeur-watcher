# Mettre la veille en ligne avec GitHub Actions (tourne PC éteint, 2x/jour)

Le script s'exécutera sur les serveurs de GitHub, gratuitement, même ordinateur éteint.

## 1. Créer un dépôt GitHub

1. Va sur https://github.com/new
2. Nom : `codeur-watcher`. Mets-le en **Privé** (important : il contiendra ta logique, pas tes secrets).
3. Crée le dépôt (sans README).

## 2. Envoyer le code

Dans un terminal, depuis le dossier du projet :

```bash
git init
git add .
git commit -m "Codeur watcher"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/codeur-watcher.git
git push -u origin main
```

Le `.gitignore` empêche l'envoi de `.env`, `node_modules` et des logs. **Ta clé API et ton mot de passe mail ne partent PAS sur GitHub.**

## 3. Enregistrer les secrets (clé API + mail)

Sur GitHub : dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
Crée ces 6 secrets (mêmes valeurs que ton fichier `.env`) :

- `ANTHROPIC_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `NOTIFY_TO`

## 4. Éviter la rafale du premier run (recommandé)

Pour ne pas recevoir d'un coup les ~25 annonces déjà en ligne, initialise la mémoire **avant** d'activer :

```bash
node index.js --seed
git add seen.json
git commit -m "init seen"
git push
```

Ainsi seules les missions publiées **après** déclencheront un email.

## 5. Activer / tester

- Onglet **Actions** du dépôt → autorise les workflows si demandé.
- Tu peux lancer un test immédiat : Actions → **Codeur Watcher** → **Run workflow**.
- Ensuite, il tournera automatiquement **2x/jour** (~08h et ~18h, heure de Paris l'été).

## Changer la fréquence

Édite `.github/workflows/watch.yml`, ligne `cron:`.
Exemples (heures en UTC) :
- `"0 6,16 * * *"` → 2x/jour (par défaut)
- `"0 6-20/2 * * *"` → toutes les 2h en journée
- `"*/15 * * * *"` → toutes les 15 min (réactivité maximale, toujours gratuit)

Aide-mémoire : https://crontab.guru

## Réactivité : fréquence et quota (important)

Pour être alerté vite, on augmente la fréquence du cron dans `.github/workflows/watch.yml`.
Mais attention au quota GitHub Actions :

| Type de dépôt | Minutes gratuites | Fréquence conseillée |
|---------------|-------------------|----------------------|
| **Public**    | Illimitées        | `*/5 * * * *` (toutes les 5 min) |
| **Privé**     | 2000 min/mois     | `0 * * * *` (1x/heure) pour ne pas dépasser |

- Le fichier est réglé sur **toutes les 5 min** : idéal si ton dépôt est **public**.
- Si tu gardes le dépôt **privé**, remets `0 * * * *` (1x/heure) pour rester gratuit.
- GitHub peut retarder une exécution planifiée de 5-15 min : c'est normal, ça reste largement suffisant.
- Tes **secrets restent privés** même avec un dépôt public (ils sont dans GitHub Secrets, pas dans le code).

## Alternative : machine toujours allumée (mode --watch)

Si un jour tu veux du quasi-temps réel garanti (vérif toutes les 90 s), lance sur un PC/serveur
toujours allumé :

```bash
npm run watch
```

Le script tourne alors en boucle continue (intervalle réglable via `intervalleSecondes` dans config.js).
Ce mode n'est PAS pour GitHub Actions (qui lance le script ponctuellement), mais pour un VPS/PC/Raspberry Pi.
