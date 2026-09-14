#!/bin/bash
# Crée la base de test mysyndic_test (copie du schéma+seeds de mysyndic_db).
# Exécuté au premier démarrage par docker-entrypoint-initdb.d,
# APRÈS mysyndic_db.sql (ordre alphabétique).

set -e

DB_TEST="${POSTGRES_DB}_test"

if psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_TEST}'" | grep -q 1; then
  echo ">> ${DB_TEST} existe deja — skip"
  exit 0
fi

echo ">> Creation ${DB_TEST} depuis template ${POSTGRES_DB}"
createdb -U "$POSTGRES_USER" -T "$POSTGRES_DB" "$DB_TEST"
echo ">> ${DB_TEST} creee"