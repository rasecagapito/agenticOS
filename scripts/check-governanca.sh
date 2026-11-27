#!/usr/bin/env bash
# Gate da camada F (Governança GitHub): testes do script, travas, PRD, versões, paridade, sprints e instalador.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs scripts/tests/hom.test.mjs scripts/tests/identidade.test.mjs scripts/tests/merge.test.mjs scripts/tests/prd.test.mjs scripts/tests/versao.test.mjs scripts/tests/paridade.test.mjs scripts/tests/sprint.test.mjs scripts/tests/nomes-reais.test.mjs
