#!/usr/bin/env bash
# Verificação de ponteiros (anti-drift): em cada pasta com cérebro canônico AGENTS.md,
# os ponteiros (CLAUDE.md/GEMINI.md) devem importar o canônico com @, e o canônico deve
# ter conteúdo real (Protocolo de Arranque). Ponteiro a apontar para cérebro vazio = FAIL.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
found=0
while IFS= read -r canonical; do
  found=1
  dir="$(dirname "$canonical")"
  # 1) Canônico com conteúdo real: protocolo de arranque presente
  if ! grep -q "Protocolo de Arranque" "$canonical"; then
    echo "FAIL: $canonical sem 'Protocolo de Arranque' (cérebro vazio por trás do ponteiro)"
    fail=1
  fi
  # 2) Ponteiros existentes importam o canônico (linha @AGENTS.md)
  for pointer in "$dir/CLAUDE.md" "$dir/GEMINI.md"; do
    [ -f "$pointer" ] || continue
    if grep -Eq '^@AGENTS\.md' "$pointer"; then
      :
    else
      echo "FAIL: $pointer não importa o canônico (@AGENTS.md em falta)"
      fail=1
    fi
  done
done < <(find template -type f -name AGENTS.md | sort)

if [ "$found" -eq 0 ]; then
  echo "OK: nenhum cérebro canônico para verificar (nada a ponteiro)"
elif [ "$fail" -eq 0 ]; then
  echo "OK: ponteiros íntegros (importam o canônico; canônicos com protocolo)"
else
  exit 1
fi
