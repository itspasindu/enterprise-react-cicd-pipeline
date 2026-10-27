#!/usr/bin/env bash
# Install PostgreSQL on a GitHub-hosted runner without a container service.
# Usage: ci-install-postgres.sh <database> <user> <password>
set -euo pipefail

DB_NAME="${1:?database name is required}"
DB_USER="${2:?database user is required}"
DB_PASSWORD="${3:?database password is required}"

if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || [[ ! "$DB_USER" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Database name and user must be simple identifiers" >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y postgresql
sudo service postgresql start

for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready; then
    break
  fi
  sleep 1
done
sudo -u postgres pg_isready

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi
