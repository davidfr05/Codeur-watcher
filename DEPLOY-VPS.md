# Déployer Codeur Watcher sur un VPS OVH (fonctionnement continu)

Objectif : faire tourner le script en permanence sur ton VPS OVH toujours allumé,
avec le mode `--watch` (vérification toutes les 90 s). Cadence fiable, ~4 €/mois.

Particularité OVH : on ne se connecte PAS en `root`, mais avec l'utilisateur **`administrator`**,
et on utilise `sudo` pour les installations.

---

## 1. Récupérer tes identifiants OVH

Après la mise en service, OVH t'envoie un **email de livraison** contenant :
- l'**adresse IP** de ton VPS,
- le **nom d'utilisateur** (pour Ubuntu : `administrator`),
- un **lien sécurisé** vers ton **mot de passe temporaire**.

Regarde ta boîte mail (et les spams). Note l'IP et récupère le mot de passe via le lien.

---

## 2. Première connexion (changement de mot de passe forcé)

Depuis ton terminal (Windows : PowerShell) :

```bash
ssh administrator@ADRESSE_IP
```

Colle le mot de passe temporaire. OVH va t'obliger à en choisir un **nouveau** :
il redemande l'ancien, puis le nouveau (2 fois). La session se ferme ensuite
automatiquement — c'est normal. Reconnecte-toi avec ton **nouveau** mot de passe :

```bash
ssh administrator@ADRESSE_IP
```

---

## 3. Installer Node.js et git

```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
node -v   # doit afficher v20.x
```

---

## 4. Récupérer le code (dépôt public)

```bash
cd /home/administrator
git clone https://github.com/davidfr05/Codeur-watcher.git codeur-watcher
cd codeur-watcher
npm install
```

---

## 5. Créer le fichier .env (tes secrets)

Le `.env` n'est PAS sur GitHub : on le recrée sur le serveur.

```bash
nano .env
```

Colle ceci en remplaçant par TES valeurs (celles de ton .env local) :

```
ANTHROPIC_API_KEY=sk-ant-...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ton.email@gmail.com
SMTP_PASS=ton_mot_de_passe_application
NOTIFY_TO=ton.email@gmail.com
```

(Pour deux destinataires : `NOTIFY_TO=email1@x.com, email2@y.com`)

Enregistre : `Ctrl+O` puis `Entrée` ; quitte : `Ctrl+X`.

---

## 6. Tester avant de lancer en continu

```bash
node index.js --test-mail   # tu dois recevoir l'email de test
node index.js --seed        # marque le stock actuel comme vu (évite la rafale)
```

---

## 7. Installer le service (démarrage auto + redémarrage)

```bash
sudo cp codeur-watcher.service /etc/systemd/system/codeur-watcher.service
sudo systemctl daemon-reload
sudo systemctl enable codeur-watcher     # démarrage automatique au boot
sudo systemctl start codeur-watcher      # démarre maintenant
sudo systemctl status codeur-watcher     # doit afficher "active (running)"
```

(Quitter l'affichage du status : touche `q`.)

---

## 8. Voir les logs en direct

```bash
journalctl -u codeur-watcher -f
```

Tu verras les passages toutes les 90 s : "Nouvelles annonces à évaluer", verdicts, envois d'email.
Quitter l'affichage : `Ctrl+C` (ça n'arrête PAS le service, juste l'affichage).

---

## 9. IMPORTANT — désactiver GitHub Actions

Sinon le VPS ET GitHub tourneraient en parallèle → **emails en double**.
Sur GitHub : onglet **Actions** → "Codeur Watcher" → bouton **"..."** (haut droite) → **Disable workflow**.

---

## Commandes utiles ensuite

- Redémarrer après une modif : `sudo systemctl restart codeur-watcher`
- Arrêter : `sudo systemctl stop codeur-watcher`
- Mettre à jour le code : `cd /home/administrator/codeur-watcher && git pull && npm install && sudo systemctl restart codeur-watcher`
- Changer la fréquence : `nano config.js` → `intervalleSecondes` (défaut 90), puis `sudo systemctl restart codeur-watcher`

---

## En cas de souci

- `ssh administrator@IP` refuse le mot de passe → utilise bien le NOUVEAU mot de passe (après le changement forcé), et l'utilisateur `administrator` (pas `root`).
- Tu as perdu le mot de passe → réinitialise-le depuis l'espace client OVH (Manager → ton