#!/usr/bin/env bash
#
# OpenPPM — sauvegarde de la base (on-prem natif, MariaDB locale ou dédiée).
#
# Lit DATABASE_URL dans /etc/openppm/openppm.env et produit un dump SQL
# compressé horodaté.
#
# Usage :
#   sudo ./infra/onprem/backup.sh [dossier-de-sortie]
#
# Restauration :
#   gunzip -c openppm-AAAAMMJJ-HHMMSS.sql.gz | \
#     mysql -h HOTE -P PORT -u UTILISATEUR -p BASE
#
set -euo pipefail

ENV_FILE="/etc/openppm/openppm.env"

log() { printf '\033[1;34m[openppm]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[openppm]\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE absent : lancez d'abord install.sh"
DB_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$DB_URL" ] || die "DATABASE_URL absent de $ENV_FILE"

# Parse mysql://user:pass@host:port/dbname
re='^mysql://([^:]+):([^@]*)@([^:/]+)(:([0-9]+))?/([^?]+)'
[[ "$DB_URL" =~ $re ]] || die "DATABASE_URL non reconnu : $DB_URL"
DB_USER="${BASH_REMATCH[1]}"
DB_PASS="${BASH_REMATCH[2]}"
DB_HOST="${BASH_REMATCH[3]}"
DB_PORT="${BASH_REMATCH[5]:-3306}"
DB_NAME="${BASH_REMATCH[6]}"

DUMP="$(command -v mariadb-dump || command -v mysqldump || true)"
[ -n "$DUMP" ] || die "mariadb-dump/mysqldump introuvable (apt install mariadb-client)."

OUT_DIR="${1:-/var/lib/openppm/backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/openppm-$(date +%Y%m%d-%H%M%S).sql.gz"

log "Sauvegarde de « $DB_NAME » ($DB_HOST:$DB_PORT)…"
MYSQL_PWD="$DB_PASS" "$DUMP" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --single-transaction --quick "$DB_NAME" | gzip > "$FILE"

log "Sauvegarde écrite : $FILE ($(du -h "$FILE" | cut -f1))"

# Rotation optionnelle : ne conserver que les N derniers jours.
# Fixé par le timer systemd via OPENPPM_BACKUP_KEEP_DAYS (0 = aucune purge).
if [ "${OPENPPM_BACKUP_KEEP_DAYS:-0}" -gt 0 ] 2>/dev/null; then
  find "$OUT_DIR" -maxdepth 1 -type f -name 'openppm-*.sql.gz' \
    -mtime +"$OPENPPM_BACKUP_KEEP_DAYS" -delete
  log "Rotation : sauvegardes de plus de ${OPENPPM_BACKUP_KEEP_DAYS} jours supprimées."
fi
