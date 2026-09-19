#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=7.25.0
jar="${OPENAPI_GENERATOR_JAR:-.tools/openapi-generator-cli-$version.jar}"
if [[ ! -f "$jar" ]]; then
  mkdir -p "$(dirname "$jar")"
  curl -fSL --retry 2 "https://repo.maven.apache.org/maven2/org/openapitools/openapi-generator-cli/$version/openapi-generator-cli-$version.jar" -o "$jar"
fi
python3 - "$jar" <<'CHECK'
import hashlib,sys
assert hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest() == '41ce4f6b07f196676439d710759fa1ced7a08066d06ff1bf314681470289efae', 'Generator checksum mismatch'
CHECK
java -jar "$jar" validate -i contract/openapi.json
# These two directories contain generated output only; hand-written tests live elsewhere.
rm -rf clients/typescript clients/swift
java -jar "$jar" generate -i contract/openapi.json -g typescript-fetch -o clients/typescript -c scripts/typescript-generator.json
java -jar "$jar" generate -i contract/openapi.json -g swift5 -o clients/swift -c scripts/swift-generator.json
