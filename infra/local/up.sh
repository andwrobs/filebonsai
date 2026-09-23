#!/bin/sh
set -eu

cd "$(dirname "$0")"
umask 077

if [ ! -f .env ]; then
  {
    printf 'FILEBONSAI_DB_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'FILEBONSAI_CURSOR_SECRET_BASE64=%s\n' "$(openssl rand -base64 32)"
    printf 'AUTHENTIK_DB_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'AUTHENTIK_SECRET_KEY=%s\n' "$(openssl rand -hex 60)"
    printf 'AUTHENTIK_BOOTSTRAP_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'FILEBONSAI_OIDC_CLIENT_SECRET=%s\n' "$(openssl rand -hex 32)"
  } > .env
fi

if ! grep -q '^FILEBONSAI_CURSOR_SECRET_BASE64=' .env; then
  printf 'FILEBONSAI_CURSOR_SECRET_BASE64=%s\n' "$(openssl rand -base64 32)" >> .env
fi

if [ ! -f secrets/owner-password ]; then
  mkdir -p secrets
  openssl rand -hex 24 > secrets/owner-password
fi

wait_healthy() {
  service="$1"
  attempts=0
  while [ "$attempts" -lt 90 ]; do
    container="$(docker compose --profile bootstrap ps -q "$service")"
    if [ -n "$container" ]; then
      status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || true)"
      if [ "$status" = healthy ]; then
        return 0
      fi
      if [ "$status" = unhealthy ]; then
        echo "$service is unhealthy" >&2
        return 1
      fi
    fi
    attempts=$((attempts + 1))
    sleep 3
  done
  echo "Timed out waiting for $service" >&2
  return 1
}

docker compose up -d authentik-server authentik-worker
wait_healthy authentik-server
wait_healthy authentik-worker

if ! docker compose exec -T authentik-worker ak apply_blueprint /blueprints/filebonsai.yaml \
  >/dev/null 2>&1; then
  echo "Authentik could not apply the Filebonsai OIDC blueprint" >&2
  exit 1
fi

admin_subject="$(docker compose exec -T authentik-db psql -U authentik -d authentik -Atqc \
  "select uuid from authentik_core_user where username = 'akadmin'")"
if [ -z "$admin_subject" ]; then
  echo "Authentik administrator was not initialized" >&2
  exit 1
fi
if grep -q '^FILEBONSAI_OIDC_OWNER_SUBJECT=' .env; then
  configured_subject="$(grep '^FILEBONSAI_OIDC_OWNER_SUBJECT=' .env | cut -d= -f2-)"
  if [ "$configured_subject" != "$admin_subject" ]; then
    echo "The configured Authentik owner does not match this Authentik database" >&2
    exit 1
  fi
else
  printf 'FILEBONSAI_OIDC_OWNER_SUBJECT=%s\n' "$admin_subject" >> .env
fi

attempts=0
until curl --silent --show-error --fail --resolve authentik.localhost:9000:127.0.0.1 \
  http://authentik.localhost:9000/application/o/filebonsai/.well-known/openid-configuration \
  -o /dev/null 2>/dev/null; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 60 ]; then
    echo "Filebonsai OIDC provider was not provisioned by Authentik" >&2
    exit 1
  fi
  sleep 3
done

docker compose up -d --build backend web
wait_healthy backend
wait_healthy web

owner_count="$(docker compose exec -T postgres psql -U filebonsai -d filebonsai -Atqc \
  'select count(*) from access_local_owner')"
if [ "$owner_count" = 0 ]; then
  docker compose --profile bootstrap up -d backend-bootstrap
  wait_healthy backend-bootstrap
  docker compose --profile bootstrap stop backend-bootstrap
  docker compose --profile bootstrap rm -sf backend-bootstrap >/dev/null
fi

echo "Filebonsai local stack is ready."
echo "Web: http://localhost:15173/"
echo "API: http://localhost:18080/"
echo "Authentik: http://authentik.localhost:9000/"
