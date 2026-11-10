#!/usr/bin/env bash
# Gate da camada F (Governança GitHub): testes do script, travas e instalador.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs scripts/tests/hom.test.mjs scripts/tests/identidade.test.mjs scripts/tests/merge.test.mjs scripts/tests/nomes-reais.test.mjs
