# Template E — Roteador de Modelos (opt-in)

Camada adicional para qualquer projeto (com ou sem as outras camadas do Agentic OS). Não copie à mão —
use o instalador, que faz merge seguro dos settings e do CLAUDE.md:

```bash
node scripts/install-router.mjs <pasta-do-projeto> [--dry-run]
```

Documentação completa: [`docs/ROUTER.md`](../../docs/ROUTER.md).

Fonte única dos agentes: `.claude/router/agent-body.md` + `tiers` em `config.json`
→ `node .claude/router/emit-agents.mjs` (gate: `scripts/check-agents-sync.sh`).
