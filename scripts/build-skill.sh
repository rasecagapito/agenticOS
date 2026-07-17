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
cp "$SRC" "$tmp/agentic-os/SKILL.md"
rm -f "$OUT"
( cd "$tmp" && zip -qr -X "agentic-os.skill" "agentic-os" )
mv "$tmp/agentic-os.skill" "$OUT"
rm -rf "$tmp"
echo "build ok: $OUT (a partir de $SRC)"
