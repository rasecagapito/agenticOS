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
falhou=0
for f in SKILL.md wizard.md; do
  if ! diff -q <(tr -d '\r' < "$tmp/agentic-os/$f") <(tr -d '\r' < "skills/agentic-os/$f") >/dev/null 2>&1; then
    echo "FAIL: $OUT está DESATUALIZADO em relação a skills/agentic-os/$f."
    falhou=1
  fi
done
rm -rf "$tmp"
if [ "$falhou" = 1 ]; then
  echo "      Rode: scripts/build-skill.sh  e commite o resultado."
  exit 1
fi
echo "OK: $OUT está sincronizado com skills/agentic-os/{SKILL,wizard}.md"
