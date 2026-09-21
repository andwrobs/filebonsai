#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./mvnw -B -ntp test
mkdir -p contract/fixtures
cp target/contract/openapi-postgres.json contract/openapi.json
cp target/contract/fixtures/*.json contract/fixtures/
