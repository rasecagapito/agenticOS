# Camada F — Governança GitHub (opt-in)

Cartão no GitHub Project → branch `feature|fix/{ID}-{desc}` → PR ligado → `main` protegida com
revisão obrigatória do analista. Instalada pelo wizard (`/agentic-os`) via
`node <plugin>/scripts/install-governanca.mjs <projeto> --ficha-json <arquivo>`.

| Arquivo no projeto | Origem |
|---|---|
| `.agentic-os/governanca.json` | Ficha (respostas do wizard) |
| `.agentic-os/bin/` | Cópia de `scripts/github-setup.mjs` + `scripts/governanca/` |
| `automation/procedures/cartao.md` | Este template |
| `.claude/commands/cartao.md` | Este template (wrapper) |
| `docs/tasks/README.md` | Este template (só se não existir) |
| Bloco em `automation/guardrails.md` | `guardrails-bloco.md` |
| Bloco em `.github/CODEOWNERS` | Analistas da ficha |

Docs: `docs/GOVERNANCA.md`.
