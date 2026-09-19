#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/export-contract.sh
./scripts/generate-clients.sh
./scripts/check-clients.sh
