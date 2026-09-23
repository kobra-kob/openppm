# Déploiement OpenPPM on-prem **natif** (sans Docker)

L'application tourne **directement sur le serveur** via des services **systemd**
(API NestJS + Web Next.js sur Node.js 22), et la base de données sur **MariaDB
natif** — locale sur le même serveur, ou sur un **serveur de base dédié**.

> Une variante Docker existe dans [`infra/deploy/`](../deploy/README.md) ; ce
> dossier-ci est le déploiement **on-prem full**, sans conteneurs.

## Prérequis

- **Debian 12+** ou **Ubuntu 22.04+**, accès **root** (sudo), Internet sortant.
- Ports libres : **3000** (web) et **4000** (API), ajustables (`--web-port`, `--api-port`).
- Base dédiée : **MariaDB 10.6+** (10.11 LTS recommandé) accessible depuis ce serveur.
- Le script installe automatiquement Node.js 22, pnpm et (mode local) MariaDB.

## Installation

### A. Base de données locale (tout sur un serveur)

```bash
git clone https://github.com/kobra-kob/openppm.git openppm && cd openppm
sudo ./infra/onprem/install.sh --app-url http://mon-serveur:3000
```

MariaDB est installé, la base `openppm` et son utilisateur sont créés, un mot de
passe et un `JWT_SECRET` aléatoires sont générés.

### B. Serveur de base **dédié** (base séparée)

Sur le serveur de base, créez au préalable la base et l'utilisateur :

```sql
CREATE DATABASE openppm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'openppm'@'%' IDENTIFIED BY 'un-mot-de-passe-fort';
GRANT ALL PRIVILEGES ON openppm.* TO 'openppm'@'%';
FLUSH PRIVILEGES;
```

(Assurez-vous que MariaDB écoute sur le réseau — `bind-address = 0.0.0.0` — et
que le pare-feu autorise le port 3306 depuis le serveur applicatif.)

Puis, sur le serveur applicatif :

```bash
git clone https://github.com/kobra-kob/openppm.git openppm && cd openppm
sudo ./infra/onprem/install.sh \
  --app-url http://mon-serveur:3000 \
  --db-url  mysql://openppm:un-mot-de-passe-fort@IP-SERVEUR-DB:3306/openppm
```

Aucun MariaDB n'est installé localement ; l'app se branche directement sur la
base dédiée. Les migrations et le seed sont appliqués sur cette base.

Ouvrez ensuite l'URL affichée et **créez votre organisation** (le premier compte
inscrit devient administrateur).

## Gestion des services

```bash
systemctl status openppm-api openppm-web
systemctl restart openppm-api openppm-web
journalctl -u openppm-api -f     # journaux API
journalctl -u openppm-web -f     # journaux Web
```

Les deux services démarrent au boot et redémarrent automatiquement en cas d'arrêt.

## Mise à jour

```bash
cd openppm
sudo ./infra/onprem/update.sh
```

`git pull` + rebuild + migrations + redémarrage. Données conservées.

## Sauvegarde / restauration

```bash
sudo ./infra/onprem/backup.sh                 # dump SQL compressé horodaté
# → /var/lib/openppm/backups/openppm-AAAAMMJJ-HHMMSS.sql.gz

# Restauration (adapter hôte/port/utilisateur/base) :
gunzip -c openppm-AAAAMMJJ-HHMMSS.sql.gz | \
  mysql -h 127.0.0.1 -P 3306 -u openppm -p openppm
```

Le script lit `DATABASE_URL` : il sauvegarde aussi bien une base locale qu'une
base dédiée.

## Désinstallation

```bash
sudo ./infra/onprem/uninstall.sh          # arrête les services, garde les données
sudo ./infra/onprem/uninstall.sh --purge  # + supprime config, stockage, base LOCALE
```

Une base **externe/dédiée** n'est jamais supprimée. Node.js et MariaDB Server ne
sont pas retirés (potentiellement partagés).

## Configuration — `/etc/openppm/openppm.env`

Généré à l'installation, lu par le service API (permissions `640`).

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion MariaDB (`mysql://user:pass@hôte:3306/openppm`) |
| `JWT_SECRET` | Secret des jetons (≥ 32 caractères, généré) |
| `APP_URL` / `CORS_ORIGIN` | URL publique de l'app |
| `PORT` | Port de l'API (défaut 4000) |
| `FILES_DIR` | Stockage des documents (défaut `/var/lib/openppm/storage`) |
| `SMTP_URL` | SMTP réel (optionnel ; sinon les emails sont journalisés) |

Après modification : `sudo systemctl restart openppm-api openppm-web`.
Le port web est fixé dans le service `openppm-web` (`Environment=PORT=`).

## HTTPS / nom de domaine

Placez un reverse proxy devant le port web. Exemple **Caddy** (TLS automatique) :

```
ppm.mondomaine.fr {
    reverse_proxy 127.0.0.1:3000
}
```

Puis mettez `APP_URL=https://ppm.mondomaine.fr` dans `/etc/openppm/openppm.env`
et redémarrez les services.

## Notes MariaDB / Prisma

Prisma utilise le connecteur `mysql`, compatible MariaDB (**10.6+**). Le seed et
les migrations sont du SQL standard. En base dédiée, seule la connectivité
réseau et les droits sur la base `openppm` sont à prévoir.
