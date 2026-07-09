# Codeur Watcher — Récapitulatif du projet

## Objectif
Surveiller automatiquement codeur.com, repérer les nouvelles missions qui te correspondent
(React, Node, Python, Supabase, IA, fullstack), les analyser, et te prévenir par email
uniquement pour celles qui valent le coup — avec un compte rendu et un brouillon de
proposition déjà rédigé. Fini de relire toutes les annonces et de retomber sur les mêmes.

## Ce qui a été fait (terminé)

### La logique métier
- **Détection** des nouvelles annonces via le flux RSS de codeur.
- **Anti-doublons** : chaque annonce est mémorisée (seen.json) et n'est jamais retraitée.
- **Lecture complète** de chaque annonce sur sa page publique (pas seulement l'extrait) :
  description entière, budget, nombre d'offres concurrentes, montant moyen des devis,
  délai estimé. L'évaluation se base donc sur de vraies données.
- **Évaluation par Claude** selon ton profil : correspondance (note /10), complexité,
  charge en jours, ratio prix/travail (avec ton TJM 65 €/45 €), niveau de concurrence.
- **Compte rendu** clair par mission : « ça vaut le coup ? oui / mitigé / non » + pourquoi.
- **Brouillon de proposition** personnalisé, prêt à copier-coller.

### Le tri
- Seuil réglé à **5/10** : au-dessus, la mission est retenue.
- **À traiter en priorité** : bon fit + bon prix + concurrence raisonnable.
- **À regarder quand même** (MOYEN) : bon fit mais un bémol (prix bas, forte concurrence,
  brief flou) — affiché pour que tu décides, plus jeté en silence.
- **À éviter** : hors profil ou note trop basse — ignoré.

### Les notifications
- **Un seul email récapitulatif** par exécution, avec les 2 sections ci-dessus.
- Aucun email s'il n'y a rien d'intéressant.

### Les commandes de test disponibles
- `npm run dry` : montre les évaluations dans la console, sans email.
- `npm run testmail` : envoie un email d'exemple pour vérifier le format et le SMTP.
- `node index.js --seed` : marque le stock actuel comme déjà vu (à faire 1x avant la prod).

### État technique
- Code validé (syntaxe, parsing, format email testés).
- Ta config (.env) est renseignée : clé Anthropic + accès mail.
- Prêt pour un hébergement cloud (GitHub Actions) : fichiers déjà en place.

## Ce qu'il reste à faire pour passer en production

Le script marche, mais il tourne encore à la main sur ton PC. Pour qu'il tourne tout seul,
2x/jour, même PC éteint, il faut le mettre sur GitHub Actions (gratuit). Étapes :

1. **Vérifier l'email de test** : lance `npm run testmail`, confirme qu'il arrive et que
   le format te convient. (Si Gmail bloque : créer un « mot de passe d'application ».)

2. **Créer un dépôt GitHub privé** `codeur-watcher`.

3. **Envoyer le code** dessus avec git (le .gitignore protège ta clé et ton mot de passe,
   qui ne montent PAS sur GitHub).

4. **Enregistrer les 6 secrets** dans les réglages du dépôt (Settings → Secrets → Actions) :
   ANTHROPIC_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_TO.

5. **Initialiser la mémoire** : `node index.js --seed` puis pousser seen.json,
   pour ne pas recevoir d'un coup les ~25 annonces déjà en ligne.

6. **Activer** dans l'onglet Actions et faire un « Run workflow » de test.

→ Le détail pas à pas est dans **SETUP-GITHUB.md**.

## Réglages faciles plus tard (dans config.js)
- Fréquence : dans .github/workflows/watch.yml (2x/jour par défaut ; possible toutes les 15 min).
- Seuil d'acceptation (actuellement 5), tarifs, charge max, catégorie surveillée.

## Points d'attention honnêtes
- **Réactivité** : 2x/jour ne fait pas de toi le 1er à répondre sur les missions très chaudes.
  Si besoin, on augmente la fréquence (toujours gratuit).
- **Budget parfois absent** du flux : le script le récupère sur la page ; s'il manque vraiment,
  Claude le signale et met une question à poser au client.
- **Envoi de la proposition** : reste manuel (depuis ton compte codeur). Le script prépare tout,
  toi tu valides et tu envoies — plus sûr.
- **Robustesse du scraping** : si codeur refond son site, il faudra ajuster scraper.js.

## Fichiers du projet
- index.js — le programme principal (détection, éval, email).
- prompt.js — le prompt d'évaluation (utilise ton profil).
- scraper.js — lecture de la page détail.
- config.js — ton profil et tes réglages.
- .env — tes secrets (jamais publiés).
- README.md — installation et usage.
- SETUP-GITHUB.md — mise en ligne pas à pas.
- .github/workflows/watch.yml — la planification cloud.
