#!/usr/bin/env bash
# Transpila as regras provider-neutras de um perfil para os formatos nativos de cada agente.
# Delega para scripts/emit-rules.mjs (Node puro, portável).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/emit-rules.mjs "$@"
