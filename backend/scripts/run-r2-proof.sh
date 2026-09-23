#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--live-disposable-bucket" || "$#" -ne 1 ]]; then
  echo "Usage: backend/scripts/run-r2-proof.sh --live-disposable-bucket" >&2
  exit 2
fi

required=(
  FILEBONSAI_R2_PROOF_ACCOUNT_ID
  FILEBONSAI_R2_PROOF_JURISDICTION
  FILEBONSAI_R2_PROOF_BUCKET
  FILEBONSAI_R2_PROOF_ACCESS_KEY_ID_FILE
  FILEBONSAI_R2_PROOF_SECRET_ACCESS_KEY_FILE
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required setting: $name" >&2
    exit 2
  fi
done
for name in FILEBONSAI_R2_PROOF_ACCESS_KEY_ID_FILE FILEBONSAI_R2_PROOF_SECRET_ACCESS_KEY_FILE; do
  if [[ ! -f "${!name}" || ! -r "${!name}" ]]; then
    echo "Credential file is not readable: $name" >&2
    exit 2
  fi
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir/.."
exec ./mvnw -q -Dfilebonsai.r2.proof=true -Dtest=RealR2CompatibilityProofTest test
