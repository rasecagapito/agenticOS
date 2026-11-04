#!/usr/bin/env bash
# Gate da camada F (Governança GitHub): testes do script, travas e instalador.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test scripts/tests/governanca.test.mjs
