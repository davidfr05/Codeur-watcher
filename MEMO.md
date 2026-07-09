# MÉMO — utiliser et modifier Codeur Watcher au quotidien

## Faire une modification (l'ordre à respecter)

Toujours : modifier en LOCAL → pousser sur GitHub → mettre à jour le SERVEUR.

### 1. Sur mon PC (dossier local)
Modifier le fichier voulu (souvent `config.js`), puis :
```
git add -A
git commit -m "ce que j'ai changé"
git push
```

### 2. Sur le serveur (en SSH : ssh administrator@85.190.101.185)
```
cd ~/codeur-watcher
git pull
sudo systemctl restart codeur-watcher
sudo systemctl status codeur-watcher      # doit être vert : active (running)
```
> Si j'ai ajouté une dépendance (nouvelle ligne dans package.json) :
> faire `npm install` avant le restart.

---

## Quoi changer, et où (dans config.js)

- **Fréquence de vérification** : `intervalleSecondes`
  (90 = toutes les 90 s ; 60 = chaque minute ; 300 = 5 min)

- **Être moins/plus sélectif** : `seuilCorrespondance`
  (5 par défaut ; 4 = plus de missions retenues ; 7 = plus strict)

- **Trop de nouveautés d'un coup non traitées** : `maxParRun`
  (25 par défaut ; monter à 40 si besoin)

- **Cibler une catégorie précise** : `rssUrl`
  (tout : https://www.codeur.com/projects.rss
   dev web : https://www.codeur.com/developpeur/web.rss)

- **Mes technos / tarifs / red flags** : bloc `profil`

- **Verdicts qui déclenchent un email** : `verdictsAlertes`

- **Destinataires de l'email** : dans le fichier `.env` (SUR LE SERVEUR),
  variable NOTIFY_TO (plusieurs adresses séparées par des virgules).
  Le .env n'est pas sur GitHub : le modifier directement sur le serveur avec `nano .env`, puis restart.

---

## Commandes de surveillance (sur le serveur)

- Voir si ça tourne :        `sudo systemctl status codeur-watcher`
- Voir l'activité en direct : `journalctl -u codeur-watcher -f`   (quitter : Ctrl+C)
- Voir les 50 dernières lignes : `journalctl -u codeur-watcher -n 50 --no-pager`
- Redémarrer :               `sudo systemctl restart codeur-watcher`
- Arrêter (temporaire) :     `sudo systemctl stop codeur-watcher`
- Relancer après arrêt :     `sudo systemctl start codeur-watcher`

> Ctrl+C pendant l'affichage des logs n'arrête PAS le service, juste l'affichage.

---

## Tester un changement AVANT de le laisser tourner

Sur le serveur, on peut lancer un passage unique à la main (sans toucher au service) :
```
cd ~/codeur-watcher
node index.js --dry        # montre les évaluations, sans email ni mémorisation
node index.js --test-mail  # envoie un email d'exemple pour vérifier le format
```
