#!/usr/bin/env bash
#
# OpenPPM — installation on-prem NATIVE (sans Docker) sur Debian / Ubuntu.
#
# Installe Node.js 22 + pnpm, construit l'app, configure les services systemd
# (API NestJS + Web Next.js) et la base de données.
#
# Base de données : MariaDB, deux modes.
#   • Locale (défaut)  : MariaDB est installé sur CE serveur, base + utilisateur créés.
#   • Dédiée / externe : --db-url mysql://user:pass@hote:3306/openppm  (aucune install MariaDB).
#
# Usage :
#   sudo ./infra/onprem/install.sh [--app-url http://serveur:3000] \
#        [--db-url mysql://user:pass@hote:3306/openppm] [-y]
#
# Options :
#   --app-url URL   URL publique de l'app (sinon http://<ip-serveur>:<web-port>)
#   --db-url URL    Connexion MariaDB externe (dédiée). Sinon MariaDB local installé.
#   --web-port N    Port du web (défaut 3000)
#   --api-port  N   Port de l'API (défaut 4000)
#   -y, --yes       Non interactif
#   -h, --help      Aide
#
# Idempotent : relançable. Les secrets (/etc/openppm/openppm.env) ne sont générés
# qu'une seule fois.
#
set -euo pipefail

APP_URL="${APP_URL:-}"
DB_URL="${DB_URL:-}"
WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-4000}"
# Emplacement d'installation : hors /home (les répertoires personnels ne sont
# pas traversables par l'utilisateur de service). /opt est traversable (755).
INSTALL_DIR="${INSTALL_DIR:-/opt/openppm}"
ASSUME_YES=false

SERVICE_USER="openppm"
SERVICE_HOME="/var/lib/openppm"
STORAGE_DIR="/var/lib/openppm/storage"
ENV_FILE="/etc/openppm/openppm.env"
DB_NAME="openppm"

log()  { printf '\033[1;34m[openppm]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[openppm]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[openppm]\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --app-url) APP_URL="${2:-}"; shift 2 ;;
    --app-url=*) APP_URL="${1#*=}"; shift ;;
    --db-url) DB_URL="${2:-}"; shift 2 ;;
    --db-url=*) DB_URL="${1#*=}"; shift ;;
    --web-port) WEB_PORT="${2:-}"; shift 2 ;;
    --api-port) API_PORT="${2:-}"; shift 2 ;;
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --dir=*) INSTALL_DIR="${1#*=}"; shift ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Option inconnue : $1 (voir --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "À lancer en root : sudo ./infra/onprem/install.sh"
command -v apt-get >/dev/null 2>&1 || die "Distribution non Debian/Ubuntu (apt-get requis)."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
[ -f "$SRC_DIR/pnpm-workspace.yaml" ] || die "Monorepo introuvable dans $SRC_DIR"
REPO_DIR="$INSTALL_DIR"

LOCAL_DB=true
[ -n "$DB_URL" ] && LOCAL_DB=false

export DEBIAN_FRONTEND=noninteractive

# ── 1. Paquets système ─────────────────────────────────────────────────
log "Installation des paquets système…"
apt-get update -qq
apt-get install -y -qq curl git ca-certificates openssl build-essential python3 pkg-config rsync >/dev/null

# ── 1bis. Emplacement d'installation (hors /home, traversable par le service) ──
if [ "$SRC_DIR" != "$REPO_DIR" ]; then
  log "Installation dans $REPO_DIR (copie depuis $SRC_DIR)…"
  mkdir -p "$REPO_DIR"
  rsync -a --exclude node_modules --exclude .next --exclude .git/hooks "$SRC_DIR"/ "$REPO_DIR"/
fi
cd "$REPO_DIR"
[ -f "$REPO_DIR/pnpm-workspace.yaml" ] || die "Copie incomplète dans $REPO_DIR"

# ── 2. Node.js 22 + pnpm ────────────────────────────────────────────────
need_node=true
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 22 ] 2>/dev/null && need_node=false
fi
if $need_node; then
  log "Installation de Node.js 22 (NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
command -v pnpm >/dev/null 2>&1 || { log "Installation de pnpm…"; npm install -g pnpm@11.10.0 >/dev/null 2>&1; }
NODE_BIN="$(command -v node)"; PNPM_BIN="$(command -v pnpm)"
log "Node $(node -v) · pnpm $(pnpm -v)"

# ── 3. Base de données MariaDB ──────────────────────────────────────────
if $LOCAL_DB; then
  command -v mariadb >/dev/null 2>&1 || command -v mysql >/dev/null 2>&1 || {
    log "Installation de MariaDB Server…"
    apt-get install -y -qq mariadb-server >/dev/null
  }
  systemctl enable --now mariadb >/dev/null 2>&1 || systemctl enable --now mysql >/dev/null 2>&1 || true
  DB_CLI="$(command -v mariadb || command -v mysql)"
  if [ -f "$ENV_FILE" ] && grep -q '^DATABASE_URL=' "$ENV_FILE"; then
    DB_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
    log "Base locale déjà configurée : réutilisation de DATABASE_URL existant."
  else
    dbpass="$(openssl rand -hex 24)"
    log "Création de la base « $DB_NAME » et de l'utilisateur applicatif…"
    "$DB_CLI" <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'openppm'@'localhost' IDENTIFIED BY '$dbpass';
CREATE USER IF NOT EXISTS 'openppm'@'127.0.0.1' IDENTIFIED BY '$dbpass';
ALTER USER 'openppm'@'localhost' IDENTIFIED BY '$dbpass';
ALTER USER 'openppm'@'127.0.0.1' IDENTIFIED BY '$dbpass';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO 'openppm'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO 'openppm'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
    DB_URL="mysql://openppm:${dbpass}@127.0.0.1:3306/${DB_NAME}"
  fi
else
  log "Base de données externe (dédiée) : $(echo "$DB_URL" | sed -E 's#(//[^:]+:)[^@]+@#\1***@#')"
  apt-get install -y -qq mariadb-client >/dev/null 2>&1 || true
fi

# ── 4. Utilisateur de service + arborescence ───────────────────────────
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  log "Création de l'utilisateur système « $SERVICE_USER »…"
  useradd --system --create-home --home-dir "$SERVICE_HOME" --shell /usr/sbin/nologin "$SERVICE_USER"
fi
mkdir -p "$STORAGE_DIR" "$(dirname "$ENV_FILE")"
chown -R "$SERVICE_USER:$SERVICE_USER" "$SERVICE_HOME"
chown -R "$SERVICE_USER:$SERVICE_USER" "$REPO_DIR"

run_as() { runuser -u "$SERVICE_USER" -- env HOME="$SERVICE_HOME" PATH="$PATH" "$@"; }

# ── 5. Dépendances + build ──────────────────────────────────────────────
log "Installation des dépendances (pnpm install)…"
run_as bash -lc "cd '$REPO_DIR' && '$PNPM_BIN' install --frozen-lockfile"
log "Construction de l'application (API + Web + client Prisma)…"
# API_PROXY_TARGET est figé au build par Next (rewrites) : on cible l'API locale.
run_as bash -lc "cd '$REPO_DIR' && API_PROXY_TARGET='http://127.0.0.1:$API_PORT' '$PNPM_BIN' run build"

# ── 6. Fichier d'environnement (secrets générés une fois) ──────────────
if [ -f "$ENV_FILE" ]; then
  log "$ENV_FILE déjà présent : conservé (secrets inchangés)."
  APP_URL="$(grep '^APP_URL=' "$ENV_FILE" | cut -d= -f2- || true)"
else
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$APP_URL" ] || APP_URL="http://${ip:-localhost}:${WEB_PORT}"
  jwt="$(openssl rand -hex 32)"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Configuration OpenPPM — généré par infra/onprem/install.sh le $(date -Iseconds)
NODE_ENV=production
PORT=${API_PORT}
DATABASE_URL=${DB_URL}
JWT_SECRET=${jwt}
JWT_ACCESS_TTL=900s
REFRESH_TTL_DAYS=30
APP_URL=${APP_URL}
CORS_ORIGIN=${APP_URL}
FILES_DIR=${STORAGE_DIR}
SMTP_FROM="OpenPPM <no-reply@openppm.local>"
# SMTP réel (sinon les emails sont journalisés) :
# SMTP_URL=smtp://utilisateur:motdepasse@smtp.exemple.fr:587
EOF
  chmod 640 "$ENV_FILE"
  chown root:"$SERVICE_USER" "$ENV_FILE"
  log "Secrets écrits dans $ENV_FILE."
fi

# ── 7. Migrations + seed de la base ────────────────────────────────────
# On n'exporte que DATABASE_URL (extrait, sans sourcer le fichier : certaines
# valeurs comme SMTP_FROM contiennent < > et casseraient un `source` bash).
db_url_val="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
log "Application des migrations de base de données…"
run_as bash -lc "cd '$REPO_DIR' && DATABASE_URL='$db_url_val' '$PNPM_BIN' --filter @openppm/db exec prisma migrate deploy"
log "Seed des données système (rôles, permissions)…"
run_as bash -lc "cd '$REPO_DIR' && DATABASE_URL='$db_url_val' '$PNPM_BIN' --filter @openppm/db run seed"

# ── 8. Services systemd ─────────────────────────────────────────────────
db_dep=""
$LOCAL_DB && db_dep="mariadb.service"

log "Écriture des services systemd…"
cat > /etc/systemd/system/openppm-api.service <<EOF
[Unit]
Description=OpenPPM API (NestJS)
After=network.target $db_dep
Wants=$db_dep

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$REPO_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN apps/api/dist/main.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$STORAGE_DIR $REPO_DIR

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/openppm-web.service <<EOF
[Unit]
Description=OpenPPM Web (Next.js)
After=network.target openppm-api.service
Wants=openppm-api.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$REPO_DIR/apps/web
Environment=NODE_ENV=production
Environment=PORT=$WEB_PORT
Environment=HOSTNAME=0.0.0.0
Environment=API_PROXY_TARGET=http://127.0.0.1:$API_PORT
ExecStart=$PNPM_BIN start
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable openppm-api.service openppm-web.service >/dev/null 2>&1 || true
systemctl restart openppm-api.service
systemctl restart openppm-web.service

# ── 8bis. Sauvegarde quotidienne de la base (timer systemd) ─────────────
log "Configuration de la sauvegarde quotidienne (timer systemd, rétention 14 jours)…"
cat > /etc/systemd/system/openppm-backup.service <<EOF
[Unit]
Description=OpenPPM — sauvegarde de la base de données
After=network.target $db_dep
Wants=$db_dep

[Service]
Type=oneshot
User=$SERVICE_USER
Group=$SERVICE_USER
Environment=OPENPPM_BACKUP_KEEP_DAYS=14
ExecStart=/usr/bin/env bash $REPO_DIR/infra/onprem/backup.sh $SERVICE_HOME/backups
EOF

cat > /etc/systemd/system/openppm-backup.timer <<EOF
[Unit]
Description=OpenPPM — sauvegarde quotidienne de la base de données

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF

install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$SERVICE_HOME/backups"
systemctl daemon-reload
systemctl enable --now openppm-backup.timer >/dev/null 2>&1 || true

# ── 9. Vérification ─────────────────────────────────────────────────────
log "Attente de la disponibilité de l'API…"
ok=false
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then ok=true; break; fi
  sleep 3
done
$ok || warn "L'API ne répond pas encore : journalctl -u openppm-api -e"

echo
log "Installation on-prem terminée."
echo "  • Application : ${APP_URL}"
echo "  • API (santé) : http://<serveur>:${API_PORT}/health"
echo "  • Base        : $([ "$LOCAL_DB" = true ] && echo "MariaDB locale ($DB_NAME)" || echo "MariaDB externe/dédiée")"
echo "  • Sauvegarde  : quotidienne à 02:30 → $SERVICE_HOME/backups (rétention 14 j)"
echo
echo "  Premier accès : ouvrez ${APP_URL} et créez votre organisation"
echo "  (le premier compte inscrit devient administrateur)."
echo
echo "  Services :"
echo "    systemctl status openppm-api openppm-web"
echo "    journalctl -u openppm-api -f      # journaux API"
echo "    journalctl -u openppm-web -f      # journaux Web"
echo "    sudo $REPO_DIR/infra/onprem/update.sh     # mise à jour"
echo "    sudo $REPO_DIR/infra/onprem/uninstall.sh  # désinstallation"
echo
echo "  L'application est installée dans $REPO_DIR."
