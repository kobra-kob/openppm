#!/bin/sh
# Démarrage API : applique les migrations puis seed (idempotent), puis lance
# le process passé en CMD. Prisma attend/retente la connexion MySQL lui-même.
set -e

echo "[entrypoint] Application des migrations…"
attempt=0
until pnpm --filter @openppm/db exec prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 10 ]; then
    echo "[entrypoint] MySQL injoignable après 10 tentatives, abandon." >&2
    exit 1
  fi
  echo "[entrypoint] Base indisponible, nouvelle tentative dans 5 s ($attempt/10)…"
  sleep 5
done

echo "[entrypoint] Seed des données système…"
pnpm --filter @openppm/db run seed

echo "[entrypoint] Démarrage de l'API…"
exec "$@"
