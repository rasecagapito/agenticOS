#!/usr/bin/env bash
# Reempacota o artefato Codex `agentic-os.skill` a partir da fonte única
# `skills/agentic-os/SKILL.md`. Fonte da verdade = o .md; o .skill é derivado.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="skills/agentic-os/SKILL.md"
OUT="agentic-os.skill"

[ -f "$SRC" ] || { echo "erro: $SRC não encontrado"; exit 1; }

tmp="$(mktemp -d)"
mkdir -p "$tmp/agentic-os"
tr -d '\r' < "$SRC" > "$tmp/agentic-os/SKILL.md"  # LF sempre (igual ao repo/CI)
if command -v zip >/dev/null 2>&1; then
  ( cd "$tmp" && zip -qr -X "agentic-os.skill" "agentic-os" )
else
  # fallback (ex.: Git Bash no Windows sem zip)
  ( cd "$tmp" && python -c "import shutil; shutil.make_archive('agentic-os', 'zip', '.', 'agentic-os')" && mv agentic-os.zip agentic-os.skill )
fi
rm -f "$OUT"
mv "$tmp/agentic-os.skill" "$OUT"
rm -rf "$tmp"
echo "build ok: $OUT (a partir de $SRC)"
