# Documentation de mon serveur (VPS OVH)

Vue d'ensemble de mon serveur, comment m'y connecter, et comment surveiller ce qui s'y passe.

---

## 1. Fiche d'identité

| Élément | Valeur |
|---|---|
| Hébergeur | OVH (VPS) |
| Système | Ubuntu 26.04 |
| Adresse IP (IPv4) | 85.190.101.185 |
| Nom d'hôte | cloud-server-10576446 |
| Utilisateur | administrator |
| Ressources | 2 vCPU · 4 Go RAM · 100 Go disque |
| Rôle actuel | Faire tourner en continu le script "Codeur Watcher" |

> Ce serveur n'héberge pas un site web public. Il exécute un programme en arrière-plan
> (Codeur Watcher) qui surveille codeur.com et envoie des emails. Rien n'est accessible
> depuis un navigateur : c'est un "ouvrier" qui tourne 24/7, pas une vitrine.

---

## 2. Se connecter au serveur

Depuis mon PC (PowerShell ou terminal) :

```
ssh administrator@85.190.101.185
```

Puis le **mot de passe du serveur** (pas celui du compte OVH).
Pour se déconnecter : taper `exit` (le serveur continue de tourner).

---

## 3. Ce qui tourne sur le serveur

Un seul programme "métier" tourne : le service **codeur-watcher**, géré par systemd
(le gestionnaire de services de Linux). Il se relance automatiquement en cas de plantage
ou de redémarrage du serveur.

Vérifier qu'il tourne :
```
sudo systemctl status codeur-watcher
```
- Vert `active (running)` = tout va bien.
- Voir son activité en direct : `journalctl -u codeur-watcher -f`  (quitter : Ctrl+C)

Le reste de ce qui tourne, ce sont les processus normaux du système Linux (réseau, SSH,
horloge, etc.) — je n'ai pas à m'en occuper.

---

## 4. Où sont mes fichiers

Tout mon projet est dans un seul dossier :

```
/home/administrator/codeur-watcher/
```

Y aller : `cd ~/codeur-watcher` (le `~` = mon dossier personnel).

Contenu principal :
| Fichier | Rôle |
|---|---|
| index.js | Le programme principal |
| scraper.js | Lecture des pages codeur |
| prompt.js | Le texte d'évaluation envoyé à l'IA |
| config.js | MES RÉGLAGES (fréquence, seuil, technos, tarifs) |
| .env | MES SECRETS (clé API, mot de passe mail) — jamais sur GitHub |
| seen.json | Mémoire des annonces déjà vues (anti-doublons) |
| package.json | Liste des dépendances |
| node_modules/ | Les dépendances installées (généré par npm) |

Le fichier de définition du service est ailleurs, géré par le système :
```
/etc/systemd/system/codeur-watcher.service
```

---

## 5. Explorer le serveur (commandes de base)

Toutes à taper une fois connecté en SSH.

**Voir les fichiers d'un dossier**
```
ls -la              # liste détaillée du dossier courant
cd ~/codeur-watcher # se déplacer dans mon projet
pwd                 # afficher où je suis
cat config.js       # afficher le contenu d'un fichier
nano config.js      # ouvrir un fichier pour l'éditer (Ctrl+O enregistre, Ctrl+X quitte)
```

**Voir les programmes qui tournent**
```
sudo systemctl list-units --type=service --state=running   # tous les services actifs
top                 # activité en temps réel (quitter : q)
```
(Optionnel, plus lisible : installer htop avec `sudo apt install -y htop`, puis `htop`.)

**Voir l'état des ressources**
```
free -h             # mémoire (RAM) utilisée / libre
df -h               # espace disque
uptime              # depuis combien de temps le serveur tourne + charge
```

**Voir les logs de mon script**
```
journalctl -u codeur-watcher -f              # en direct
journalctl -u codeur-watcher -n 100 --no-pager   # 100 dernières lignes
journalctl -u codeur-watcher --since "1 hour ago"   # depuis 1h
```

---

## 6. Gérer le service Codeur Watcher

```
sudo systemctl status codeur-watcher     # état (vert = OK)
sudo systemctl restart codeur-watcher    # redémarrer (après une modif)
sudo systemctl stop codeur-watcher       # arrêter (temporaire)
sudo systemctl start codeur-watcher      # relancer
sudo systemctl disable --now codeur-watcher  # arrêter ET empêcher au prochain reboot
sudo systemctl enable --now codeur-watcher   # relancer ET activer au démarrage
```

---

## 7. Mettre à jour le code (rappel)

Je modifie sur mon PC → je pousse sur GitHub → je mets à jour le serveur :
```
cd ~/codeur-watcher
git pull
sudo systemctl restart codeur-watcher
sudo systemctl status codeur-watcher
```
(Voir MEMO.md pour le détail.)

---

## 8. Entretien et sécurité (bon à savoir)

- **Mises à jour système** (de temps en temps, ~1x/mois) :
  ```
  sudo apt update && sudo apt upgrade -y
  ```
- **Mes secrets** vivent uniquement dans `.env` sur le serveur. Ne jamais les mettre
  dans le code ni sur GitHub.
- **Ne pas travailler en root** : je reste connecté en `administrator` et j'utilise `sudo`
  seulement quand c'est nécessaire.
- **Redémarrer le serveur** si besoin : `sudo reboot` (le service repart tout seul ensuite).

---

## 9. En cas de problème

| Symptôme | Quoi faire |
|---|---|
| Je ne reçois plus d'emails | `sudo systemctl status codeur-watcher` (est-il vert ?) puis regarder les logs |
| Le service est rouge / en erreur | `journalctl -u codeur-watcher -n 50 --no-pager` pour lire l'erreur |
| Je ne peux plus me connecter en SSH | Vérifier l'IP, le mot de passe ; sinon réinitialiser depuis l'espace OVH |
| Le serveur semble lent | `top` ou `free -h` et `df -h` pour voir RAM / disque |

En cas de doute, copier le message d'erreur et demander de l'aide.
