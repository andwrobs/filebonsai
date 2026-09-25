#!/usr/bin/env bash
set -euo pipefail

backend_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profiles="postgres,dev"
r2=false
bootstrap=false

usage() {
  printf 'Usage: %s [--r2] [--bootstrap]\n' "$0"
  printf 'Run the PostgreSQL backend with local development configuration.\n'
  printf '  --r2         Publish objects to the configured R2 test bucket.\n'
  printf '  --bootstrap  Create the initial local owner on this run only.\n'
}

for option in "$@"; do
  case "$option" in
    --r2) r2=true ;;
    --bootstrap) bootstrap=true ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$option" >&2; usage >&2; exit 2 ;;
  esac
done

require_config() {
  local path="$backend_root/config/application-$1.properties"
  if [[ ! -f "$path" ]]; then
    printf 'Missing %s. Copy its .example file and fill in the local values.\n' "$path" >&2
    exit 1
  fi
}

require_config dev
if "$r2"; then
  require_config r2-local
  profiles+=",r2-local"
fi
if "$bootstrap"; then
  require_config bootstrap-local
  profiles+=",bootstrap-local"
fi

cd "$backend_root"
unset FILEBONSAI_STORAGE_PROVIDER
unset FILEBONSAI_R2_ACCOUNT_ID FILEBONSAI_R2_BUCKET FILEBONSAI_R2_JURISDICTION
unset FILEBONSAI_R2_ACCESS_KEY_ID_FILE FILEBONSAI_R2_SECRET_ACCESS_KEY_FILE
exec ./mvnw spring-boot:run "-Dspring-boot.run.profiles=$profiles"
