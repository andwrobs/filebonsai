#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f client-tests/typescript/catalog.test.ts ]] || [[ ! -d client-tests/swift-contract/Tests ]]; then
  echo "Client test harnesses are not implemented in this checkpoint; see VERIFICATION.md." >&2
  exit 1
fi
(cd client-tests/typescript && npm ci --cache ../../target/npm-cache && npm test)
(cd client-tests/swift-contract && \
  CLANG_MODULE_CACHE_PATH=../../target/clang-module-cache \
  swift test --disable-sandbox --scratch-path ../../target/swift-contract-tests)
