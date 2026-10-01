#!/usr/bin/env bash
# Gate anti-drift do Roteador de Modelos (D5): os agentes rapido/padrao/profundo do template
# são gerados de uma só fonte (agent-body.md + config.json). Divergência = FAIL.
# Também roda os testes do roteador (decisão, hook, instalador, statusline).
set -euo pipefail
cd "$(dirname "$0")/.."

node template/E-roteador/.claude/router/emit-agents.mjs --check
node --test scripts/tests/router.test.mjs
