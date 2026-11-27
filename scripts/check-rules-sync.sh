#!/usr/bin/env bash
# Gate anti-drift das regras de estrutura (DS1). Delega para scripts/check-rules-sync.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/check-rules-sync.mjs
