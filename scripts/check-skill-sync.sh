#!/usr/bin/env bash
# Falha se `agentic-os.skill` divergir de `skills/agentic-os/SKILL.md`.
# Garante a regra D5 (uma só fonte por lógica) também para o artefato empacotado.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="skills/agentic-os/SKILL.md"
OUT="agentic-os.skill"

[ -f "$OUT" ] || { echo "FAIL: $OUT não existe. Rode scripts/build-skill.sh"; exit 1; }

tmp="$(mktemp -d)"
unzip -qo "$OUT" -d "$tmp"
if diff -q "$tmp/agentic-os/SKILL.md" "$SRC" >/dev/null 2>&1; then
  rm -rf "$tmp"
  echo "OK: $OUT está sincronizado com $SRC"
else
  echo "FAIL: $OUT está DESATUALIZADO em relação a $SRC."
  echo "      Rode: scripts/build-skill.sh  e commite o resultado."
  rm -rf "$tmp"
  exit 1
fi
