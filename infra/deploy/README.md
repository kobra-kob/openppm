# Déploiement OpenPPM sur un serveur Debian / Ubuntu

Pile **tout-en-un** sur un seul serveur : interface web, API et **base de
données MySQL** (dans un conteneur local, données persistées dans le volume
`openppm_mysql-data`). Un catcher d'emails (Mailpit) est inclus pour les tests.

## Prérequis

- Serveur **Debian 12+** ou **Ubuntu 22.04+**, accès **root** (sudo).
- Accès Internet sortant (installation de Docker et des images).
- Ports libres : **3000** (web), **4000** (API), **8025** (Mailpit). Ajustables via `.env`.
- Les scripts installent Docker automatiquement s'il est absent.

## Installation en quelques commandes

```bash
# 1. Récupérer le code (remplacez par l'URL de votre dépôt)
git clone https://github.com/kobra-kob/openppm.git openppm
cd openppm

# 2. Installer et démarrer (Docker, secrets, base de données, services)
sudo ./infra/deploy/install.sh --app-url http://ADRESSE-OU-DOMAINE:3000
```

C'est tout. Le script :

1. installe Docker Engine + le plugin Compose si nécessaire ;
2. génère un fichier `.env` avec des **secrets aléatoires** (mot de passe MySQL,
   `JWT_SECRET`) — créé une seule fois, jamais committé ;
3. construit les images et démarre la pile (web + API + MySQL + Mailpit) ;
4. applique les **migrations de base de données** au démarrage de l'API.

Puis ouvrez l'URL affichée et **créez votre organisation** : le premier compte
inscrit devient administrateur.

> Sans `--app-url`, l'URL publique par défaut est `http://<ip-du-serveur>:3000`.
> Renseignez-la si vous passez par un nom de domaine ou un reverse proxy.

## Mise à jour

```bash
cd openppm
sudo ./infra/deploy/update.sh
```

`git pull` + reconstruction + redémarrage. Les migrations s'appliquent seules et
les données sont conservées.

## Désinstallation

```bash
# Arrêt des services, DONNÉES CONSERVÉES (réinstallable ensuite)
sudo ./infra/deploy/uninstall.sh

# Tout effacer : conteneurs, volumes (base + fichiers) et images
sudo ./infra/deploy/uninstall.sh --purge
```

Docker Engine n'est pas retiré (il peut servir à d'autres applications).

## Base de données (sur le même serveur)

MySQL 8.4 tourne dans le conteneur `mysql`, données dans le volume
`openppm_mysql-data`. Aucun client MySQL n'est requis sur l'hôte.

```bash
# Sauvegarde (dump SQL compressé horodaté dans ./backups/)
sudo ./infra/deploy/backup.sh

# Restauration
gunzip -c backups/openppm-AAAAMMJJ-HHMMSS.sql.gz | \
  docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" openppm
```

Pensez à copier régulièrement le dossier `backups/` hors du serveur.

## Configuration (`.env`)

Généré à l'installation. Variables principales :

| Variable | Rôle | Défaut |
|---|---|---|
| `APP_URL` | URL publique de l'app (et CORS) | `http://<ip>:3000` |
| `WEB_PORT` / `API_PORT` | Ports exposés | `3000` / `4000` |
| `MYSQL_ROOT_PASSWORD` | Mot de passe MySQL (généré) | — |
| `JWT_SECRET` | Secret des jetons (généré) | — |
| `SMTP_FROM` | Expéditeur des emails | `OpenPPM <no-reply@openppm.local>` |

Après modification de `.env` : `docker compose up -d`.

### SMTP réel (production)

Par défaut, Mailpit **capture** les emails (rien n'est envoyé). Pour un vrai
serveur SMTP, ajoutez dans `.env` puis redéployez :

```bash
SMTP_URL=smtp://utilisateur:motdepasse@smtp.exemple.fr:587
```

et remplacez `SMTP_URL: smtp://mailpit:1025` par `${SMTP_URL}` dans le service
`api` de `docker-compose.yml`.

### HTTPS / nom de domaine

Placez un reverse proxy (Caddy, Nginx, Traefik) devant le port web et pointez
`APP_URL` sur `https://votre-domaine`. Exemple minimal avec Caddy :

```
ppm.mondomaine.fr {
    reverse_proxy 127.0.0.1:3000
}
```

## Diagnostic

```bash
docker compose ps            # état des services
docker compose logs -f api   # journaux de l'API
docker compose logs -f web   # journaux du web
```
