#!/usr/bin/env bash
#
# OpenPPM — installation tout-en-un sur Debian / Ubuntu.
#
# Installe Docker (si absent), génère les secrets, puis démarre la pile
# complète sur CE serveur : web + API + base de données MySQL + Mailpit.
# La base de données tourne dans un conteneur local et ses données sont
# conservées dans un volume Docker (openppm_mysql-data).
#
# Usage :
#   sudo ./infra/deploy/install.sh [--app-url https://ppm.mondomaine.fr] [--yes]
#
# Options :
#   --app-url URL   URL publique de l'application (sinon http://<ip-serveur>:<port>)
#   -y, --yes       Ne pose aucune question (installation non interactive)
#   -h, --help      Affiche cette aide
#
# Idempotent : relançable sans risque. Un .env existant est conservé.
#
set -euo pipefail

APP_URL="${APP_URL:-}"
ASSUME_YES="${ASSUME_YES:-false}"

log()  { printf '\033[1;34m[openppm]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[openppm]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[openppm]\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --app-url) APP_URL="${2:-}"; shift 2 ;;
    --app-url=*) APP_URL="${1#*=}"; shift ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Option inconnue : $1 (voir --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "À lancer en root : sudo ./infra/deploy/install.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"
[ -f docker-compose.yml ] || die "docker-compose.yml introuvable dans $REPO_DIR"

# ── 1. Prérequis système ───────────────────────────────────────────────
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  log "Installation des prérequis (curl, git, openssl, ca-certificates)…"
  apt-get update -qq
  apt-get install -y -qq curl git ca-certificates openssl >/dev/null
else
  warn "apt-get introuvable : distribution non Debian/Ubuntu, étape prérequis ignorée."
fi

# ── 2. Docker Engine + plugin Compose ──────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installation de Docker Engine (script officiel get.docker.com)…"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 \
  || die "Le plugin « docker compose » (v2) est requis. Installez docker-compose-plugin."

# ── 3. Fichier .env (secrets générés une seule fois) ───────────────────
if [ -f .env ]; then
  log ".env déjà présent : conservé tel quel (secrets inchangés)."
else
  log "Génération de .env avec des secrets aléatoires…"
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$APP_URL" ] || APP_URL="http://${ip:-localhost}:3000"
  jwt="$(openssl rand -hex 32)"
  dbpass="$(openssl rand -hex 24)"
  umask 077
  cat > .env <<EOF
# Généré par infra/deploy/install.sh le $(date -Iseconds)
# NE PAS committer ce fichier (déjà ignoré par .gitignore).

# Base de données MySQL (conteneur local)
MYSQL_ROOT_PASSWORD=$dbpass
MYSQL_DATABASE=openppm

# Secrets API
JWT_SECRET=$jwt
JWT_ACCESS_TTL=900s
REFRESH_TTL_DAYS=30

# URL publique de l'application
APP_URL=$APP_URL
API_PUBLIC_URL=$APP_URL

# Ports exposés sur le serveur
WEB_PORT=3000
API_PORT=4000
MAILPIT_UI_PORT=8025

# Expéditeur des emails (Mailpit capture tout par défaut ; brancher un vrai SMTP en prod)
SMTP_FROM="OpenPPM <no-reply@openppm.local>"
EOF
  chmod 600 .env
  log "Secrets écrits dans $REPO_DIR/.env (permissions 600)."
fi

get_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
APP_URL="$(get_env APP_URL)"
WEB_PORT="$(get_env WEB_PORT)"; WEB_PORT="${WEB_PORT:-3000}"
API_PORT="$(get_env API_PORT)"; API_PORT="${API_PORT:-4000}"
MAILPIT_UI_PORT="$(get_env MAILPIT_UI_PORT)"; MAILPIT_UI_PORT="${MAILPIT_UI_PORT:-8025}"

# ── 4. Construction + démarrage ────────────────────────────────────────
log "Construction des images (plusieurs minutes au premier lancement)…"
docker compose build
log "Démarrage de la pile (web + API + MySQL + Mailpit)…"
docker compose up -d

# ── 5. Attente de disponibilité de l'API ───────────────────────────────
log "Attente de la disponibilité de l'API…"
ok=false
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    ok=true; break
  fi
  sleep 3
done
$ok || warn "L'API ne répond pas encore : « docker compose logs -f api » pour diagnostiquer."

echo
log "Installation terminée."
echo "  • Application  : ${APP_URL}"
echo "  • API (santé)  : http://<serveur>:${API_PORT}/health"
echo "  • Mailpit (mails de test) : http://<serveur>:${MAILPIT_UI_PORT}"
echo
echo "  Premier accès : ouvrez ${APP_URL} et créez votre organisation (le premier"
echo "  compte inscrit devient administrateur)."
echo
echo "  Commandes utiles :"
echo "    docker compose ps            # état des services"
echo "    docker compose logs -f api   # journaux de l'API"
echo "    ./infra/deploy/update.sh     # mise à jour (git pull + rebuild)"
echo "    ./infra/deploy/uninstall.sh  # désinstallation"
