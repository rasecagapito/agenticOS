#!/usr/bin/env bash
# Gate anti-drift das regras de estrutura (DS1). Para cada perfil:
#  - toda rules/*.md tem frontmatter valido com globs e description
#  - toda rules/*.md aparece no globs.md do perfil
#  - o transpiler emite .mdc + .instructions.md nao-vazios para todas as regras
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
for prof in structure-profiles/*/; do
  name="$(basename "$prof")"
  rules="$prof/rules"
  globsdoc="$prof/globs.md"
  [ -d "$rules" ] || continue
  [ -f "$globsdoc" ] || { echo "FAIL[$name]: falta globs.md"; fail=1; }
  for r in "$rules"/*.md; do
    rn="$(basename "$r" .md)"
    head -1 "$r" | grep -q '^---$' || { echo "FAIL[$name/$rn]: sem frontmatter"; fail=1; }
    grep -q "$rn" "$globsdoc" 2>/dev/null || { echo "FAIL[$name/$rn]: nao mapeado em globs.md"; fail=1; }
  done
  tmp="$(mktemp -d)"
  if bash scripts/emit-rules.sh "$name" "$tmp" >/dev/null 2>&1; then
    for r in "$rules"/*.md; do
      rn="$(basename "$r" .md)"
      [ -s "$tmp/.cursor/rules/$rn.mdc" ] || { echo "FAIL[$name/$rn]: .mdc vazio"; fail=1; }
      [ -s "$tmp/.github/instructions/$rn.instructions.md" ] || { echo "FAIL[$name/$rn]: .instructions.md vazio"; fail=1; }
    done
  else
    echo "FAIL[$name]: emit-rules.sh quebrou"; fail=1
  fi
  rm -rf "$tmp"
done

[ "$fail" -eq 0 ] && echo "OK: todos os perfis emitem regras sincronizadas" || { echo "-> ha divergencias"; exit 1; }
