#!/usr/bin/env bash
#
# OpenPPM — désinstallation.
#
# Par défaut : arrête et supprime les conteneurs et le réseau, mais CONSERVE
# les données (volume MySQL et fichiers). Réinstallable ensuite sans perte.
#
# Usage :
#   sudo ./infra/deploy/uninstall.sh            # arrêt, données conservées
#   sudo ./infra/deploy/uninstall.sh --purge    # EFFACE la base, les fichiers et les images
#   sudo ./infra/deploy/uninstall.sh --purge -y # idem, sans confirmation
#
# Options :
#   --purge      Supprime aussi les volumes (BASE DE DONNÉES + FICHIERS) et les images locales
#   -y, --yes    Ne demande pas de confirmation
#   -h, --help   Affiche cette aide
#
set -euo pipefail

PURGE=false
ASSUME_YES=false

log()  { printf '\033[1;34m[openppm]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[openppm]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[openppm]\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --purge) PURGE=true; shift ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Option inconnue : $1 (voir --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "À lancer en root : sudo ./infra/deploy/uninstall.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"
[ -f docker-compose.yml ] || die "docker-compose.yml introuvable dans $REPO_DIR"
docker compose version >/dev/null 2>&1 || die "docker compose introuvable."

if $PURGE && ! $ASSUME_YES; then
  warn "--purge va EFFACER DÉFINITIVEMENT la base de données, les fichiers et les images."
  printf '\033[1;33m[openppm]\033[0m Confirmer ? Tapez « supprimer » : '
  read -r answer
  [ "$answer" = "supprimer" ] || die "Annulé."
fi

if $PURGE; then
  log "Arrêt et suppression des conteneurs, volumes et images…"
  docker compose down --volumes --rmi local --remove-orphans
  log "Désinstallation complète effectuée (données effacées)."
else
  log "Arrêt et suppression des conteneurs (données conservées)…"
  docker compose down --remove-orphans
  log "Conteneurs arrêtés. Les données MySQL et fichiers sont conservés dans leurs volumes."
  echo "  Pour tout effacer, relancez avec --purge."
fi

echo "  Docker Engine n'est pas désinstallé (utilisé par d'autres applications éventuelles)."
