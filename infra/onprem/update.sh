#!/usr/bin/env bash
#
# OpenPPM — mise à jour on-prem NATIVE.
#
# git pull → dépendances → build → migrations → redémarrage des services.
# Les données sont conservées.
#
# Usage : sudo ./infra/onprem/update.sh
#
set -euo pipefail

ENV_FILE="/etc/openppm/openppm.env"
SERVICE_USER="openppm"
SERVICE_HOME="/var/lib/openppm"

log() { printf '\033[1;34m[openppm]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[openppm]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "À lancer en root : sudo ./infra/onprem/update.sh"
[ -f "$ENV_FILE" ] || die "$ENV_FILE absent : lancez d'abord install.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Emplacement réel de l'installation : lu depuis le service (robuste, quel que
# soit l'endroit d'où l'on lance ce script), avec repli sur le dossier courant.
REPO_DIR="$(systemctl show -p WorkingDirectory --value openppm-api.service 2>/dev/null || true)"
[ -n "$REPO_DIR" ] && [ -d "$REPO_DIR" ] || REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PNPM_BIN="$(command -v pnpm)" || die "pnpm introuvable"

chown -R "$SERVICE_USER:$SERVICE_USER" "$REPO_DIR"
run_as() { runuser -u "$SERVICE_USER" -- env HOME="$SERVICE_HOME" PATH="$PATH" "$@"; }

if [ -d "$REPO_DIR/.git" ]; then
  log "Récupération de la dernière version (git pull)…"
  run_as bash -lc "cd '$REPO_DIR' && git pull --ff-only" || die "git pull impossible (modifications locales ?)."
fi

# Extraction sans sourcer le fichier (valeurs contenant < > : SMTP_FROM…).
strip() { sed -e 's/^"//' -e 's/"$//'; }
api_port_val="$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2- | strip)"; api_port_val="${api_port_val:-4000}"
db_url_val="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | strip)"

log "Dépendances + build…"
# API_PROXY_TARGET figé au build : cible l'API locale.
run_as bash -lc "cd '$REPO_DIR' && '$PNPM_BIN' install --frozen-lockfile && API_PROXY_TARGET='http://127.0.0.1:$api_port_val' '$PNPM_BIN' run build"

log "Migrations de base de données…"
run_as bash -lc "cd '$REPO_DIR' && DATABASE_URL='$db_url_val' '$PNPM_BIN' --filter @openppm/db exec prisma migrate deploy"

log "Redémarrage des services…"
systemctl restart openppm-api.service
systemctl restart openppm-web.service
sleep 2
systemctl --no-pager --lines=0 status openppm-api openppm-web | grep -E "openppm-|Active:" || true
log "Mise à jour terminée."
