#!/usr/bin/env bash
#
# OpenPPM — mise à jour d'une installation existante.
#
# Récupère la dernière version (git pull), reconstruit les images et redémarre
# la pile. Les migrations de base de données sont appliquées automatiquement au
# démarrage de l'API. Les données sont conservées.
#
# Usage :
#   sudo ./infra/deploy/update.sh
#
set -euo pipefail

log()  { printf '\033[1;34m[openppm]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[openppm]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "À lancer en root : sudo ./infra/deploy/update.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"
[ -f docker-compose.yml ] || die "docker-compose.yml introuvable dans $REPO_DIR"
[ -f .env ] || die ".env absent : lancez d'abord ./infra/deploy/install.sh"

if [ -d .git ]; then
  log "Récupération de la dernière version (git pull)…"
  git pull --ff-only || die "git pull impossible (modifications locales ?)."
fi

log "Reconstruction des images…"
docker compose build
log "Redémarrage de la pile (migrations appliquées au démarrage de l'API)…"
docker compose up -d

log "Mise à jour terminée. État :"
docker compose ps
