#!/bin/sh
# Official postgres entrypoint sources this file only for a fresh PGDATA.
# Never echo commands, the password, or SQL; no role creation on later starts.
set -eu
password=$(cat /run/secrets/postgres_app)
case "$password" in
  *[!a-zA-Z0-9]*|'') echo 'Invalid app password file' >&2; exit 1 ;;
esac
if [ "${#password}" -lt 32 ]; then echo 'Invalid app password file' >&2; exit 1; fi
# Scope DDL to the app-owned schema; the app role is NOT a database superuser.
# Suppress error-statement logging while the initial credential is in SQL input.
{
  printf 'SET log_min_error_statement = PANIC;\n'
  printf "CREATE ROLE elova_backend LOGIN PASSWORD '%s' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;\n" "$password"
  printf 'CREATE SCHEMA elova AUTHORIZATION elova_backend;\n'
  printf 'ALTER ROLE elova_backend IN DATABASE elova_vnext SET search_path = elova;\n'
} | psql --no-psqlrc -v ON_ERROR_STOP=1 --username postgres --dbname elova_vnext >/dev/null
unset password
