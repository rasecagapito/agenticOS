#!/usr/bin/env bash
# Transpila as regras provider-neutras de um perfil para os formatos nativos de cada agente.
# Fonte única: structure-profiles/<perfil>/rules/*.md (com frontmatter YAML).
# Uso: scripts/emit-rules.sh <perfil> <dir-de-saida>
#   ex.: scripts/emit-rules.sh next-app ./_emitted
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="${1:-}"; OUT="${2:-}"
[ -n "$PROFILE" ] && [ -n "$OUT" ] || { echo "uso: emit-rules.sh <perfil> <dir-saida>"; exit 1; }
SRC="structure-profiles/$PROFILE/rules"
[ -d "$SRC" ] || { echo "erro: perfil '$PROFILE' nao encontrado ($SRC)"; exit 1; }

python3 - "$PROFILE" "$SRC" "$OUT" <<'PYEOF'
import sys, os, re, json
profile, src, out = sys.argv[1], sys.argv[2], sys.argv[3]

def parse(path):
    t = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", t, re.S)
    if not m: raise SystemExit(f"FAIL: sem frontmatter em {path}")
    fm, body = m.group(1), m.group(2).strip()
    d = {}
    for line in fm.splitlines():
        if ":" not in line: continue
        k, v = line.split(":", 1); k, v = k.strip(), v.strip()
        if v.startswith("["):
            d[k] = [x.strip().strip('"') for x in v[1:-1].split(",") if x.strip()]
        elif v in ("true","false"):
            d[k] = (v == "true")
        else:
            d[k] = v.strip('"')
    return d, body

cur = os.path.join(out, ".cursor", "rules")
cop = os.path.join(out, ".github", "instructions")
os.makedirs(cur, exist_ok=True); os.makedirs(cop, exist_ok=True)

count = 0
for fn in sorted(os.listdir(src)):
    if not fn.endswith(".md"): continue
    d, body = parse(os.path.join(src, fn))
    name = d.get("name", fn[:-3])
    globs = d.get("globs", [])
    desc = d.get("description", "")
    always = d.get("alwaysApply", False)

    # Cursor .mdc
    mdc = "---\n"
    mdc += f"description: {desc}\n"
    mdc += f"globs: {', '.join(globs)}\n"
    mdc += f"alwaysApply: {str(always).lower()}\n"
    mdc += "---\n\n" + body + "\n"
    open(os.path.join(cur, f"{name}.mdc"), "w", encoding="utf-8").write(mdc)

    # Copilot .instructions.md
    ins = "---\n"
    ins += f"applyTo: \"{','.join(globs)}\"\n"
    ins += f"description: {desc}\n"
    ins += "---\n\n" + body + "\n"
    open(os.path.join(cop, f"{name}.instructions.md"), "w", encoding="utf-8").write(ins)
    count += 1

print(f"emit ok: perfil '{profile}' -> {count} regra(s) em {out} (.cursor/rules + .github/instructions)")
PYEOF
