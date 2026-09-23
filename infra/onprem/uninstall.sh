#!/usr/bin/env bash
#
# OpenPPM — désinstallation on-prem NATIVE.
#
# Par défaut : arrête et retire les services systemd. CONSERVE la base de
# données, la configuration et le code.
#
# --purge : supprime aussi la config (/etc/openppm), le stockage
# (/var/lib/openppm), l'utilisateur de service et, si la base est LOCALE,
# supprime la base « openppm » et ses utilisateurs. (Une base externe/dédiée
# n'est jamais touchée.)
#
# Usage :
#   sudo ./infra/onprem/uninstall.sh            # arrêt, données conservées
#   sudo ./infra/onprem/uninstall.sh --purge    # efface config, stockage, base locale
#   sudo ./infra/onprem/uninstall.sh --purge -y
#
set -euo pipefail

PURGE=false
ASSUME_YES=false
ENV_FILE="/etc/openppm/openppm.env"
SERVICE_USER="openppm"
SERVICE_HOME="/var/lib/openppm"
DB_NAME="openppm"

log()  { printf '\033[1;34m[openppm]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[openppm]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[openppm]\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --purge) PURGE=true; shift ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Option inconnue : $1 (voir --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "À lancer en root : sudo ./infra/onprem/uninstall.sh"

log "Arrêt et désactivation des services…"
systemctl disable --now openppm-backup.timer >/dev/null 2>&1 || true
systemctl disable --now openppm-web.service >/dev/null 2>&1 || true
systemctl disable --now openppm-api.service >/dev/null 2>&1 || true
rm -f /etc/systemd/system/openppm-api.service \
      /etc/systemd/system/openppm-web.service \
      /etc/systemd/system/openppm-backup.service \
      /etc/systemd/system/openppm-backup.timer
systemctl daemon-reload

if ! $PURGE; then
  log "Services retirés. Base, configuration et code conservés."
  echo "  Pour tout effacer (base locale incluse) : relancez avec --purge."
  exit 0
fi

if ! $ASSUME_YES; then
  warn "--purge va SUPPRIMER la configuration, le stockage et (si locale) la base « $DB_NAME »."
  printf '\033[1;33m[openppm]\033[0m Confirmer ? Tapez « supprimer » : '
  read -r answer
  [ "$answer" = "supprimer" ] || die "Annulé."
fi

# Base locale uniquement (jamais une base externe/dédiée)
if [ -f "$ENV_FILE" ]; then
  db_url="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)"
  if echo "$db_url" | grep -qE '@(127\.0\.0\.1|localhost)[:/]'; then
    DB_CLI="$(command -v mariadb || command -v mysql || true)"
    if [ -n "$DB_CLI" ]; then
      log "Suppression de la base locale « $DB_NAME » et de ses utilisateurs…"
      "$DB_CLI" <<SQL || warn "Suppression de la base impossible (à faire manuellement)."
DROP DATABASE IF EXISTS \`$DB_NAME\`;
DROP USER IF EXISTS 'openppm'@'localhost';
DROP USER IF EXISTS 'openppm'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
    fi
  else
    warn "Base externe/dédiée détectée : non supprimée (à gérer sur son serveur)."
  fi
fi

log "Suppression de la configuration et du stockage…"
rm -rf /etc/openppm "$SERVICE_HOME"
if id "$SERVICE_USER" >/dev/null 2>&1; then
  userdel "$SERVICE_USER" >/dev/null 2>&1 || true
fi

log "Désinstallation complète effectuée."
echo "  Node.js et MariaDB Server ne sont pas retirés (potentiellement partagés)."
echo "  Le code source (dépôt git) est conservé ; supprimez-le manuellement si besoin."
