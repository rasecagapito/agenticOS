# Camada F — Governança GitHub (opt-in)

Cartão no GitHub Project → branch `feature|fix/{ID}-{desc}` → Supervisor → PR ligado → HOM → assinatura → merge → PRD → versão/release. Instalada pelo wizard (`/agentic-os`) via
`node <plugin>/scripts/install-governanca.mjs <projeto> --ficha-json <arquivo>`.

| Arquivo no projeto | Origem |
|---|---|
| `.agentic-os/governanca.json` | Ficha (respostas do wizard) |
| `.agentic-os/bin/` | Cópia de `scripts/github-setup.mjs`, `scripts/paridade.mjs` + `scripts/governanca/` |
| `automation/procedures/{cartao,versao,sprint,paridade}.md` | Este template |
| `.claude/commands/{cartao,versao,sprint,paridade,governanca-update}.md` | Este template (wrappers ≤ 6 linhas) |
| `.claude/agents/supervisor.md` | Agente Supervisor independente (Opus, sem edição) |
| `docs/tasks/README.md` | Este template (só se não existir) |
| Bloco em `automation/guardrails.md` | `guardrails-bloco.md` |
| Bloco em `.github/CODEOWNERS` | Analistas da ficha |

Docs: `docs/GOVERNANCA.md`.
