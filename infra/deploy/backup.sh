#!/usr/bin/env bash
#
# OpenPPM — sauvegarde de la base de données (conteneur MySQL local).
#
# Produit un dump SQL compressé horodaté dans ./backups/. La base tournant sur
# le même serveur, la sauvegarde se fait via le conteneur, sans client MySQL
# installé sur l'hôte.
#
# Usage :
#   sudo ./infra/deploy/backup.sh [dossier-de-sortie]
#
# Restauration :
#   gunzip -c backups/openppm-AAAAMMJJ-HHMMSS.sql.gz | \
#     docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" openppm
#
set -euo pipefail

log() { printf '\033[1;34m[openppm]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[openppm]\033[0m %s\n' "$*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"
[ -f .env ] || die ".env absent : lancez d'abord ./infra/deploy/install.sh"

# shellcheck disable=SC1091
set -a; . ./.env; set +a
: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD absent de .env}"
DB="${MYSQL_DATABASE:-openppm}"

OUT_DIR="${1:-$REPO_DIR/backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/openppm-$(date +%Y%m%d-%H%M%S).sql.gz"

log "Sauvegarde de la base « $DB »…"
docker compose exec -T mysql \
  mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick "$DB" \
  | gzip > "$FILE"

log "Sauvegarde écrite : $FILE ($(du -h "$FILE" | cut -f1))"
