# Procedimento: STATUS (estado atual do projeto)

> Provider-neutro. No Claude: `/status`. Noutras IAs: "mostra o status".

## Execução
1. `git branch --show-current` — branch atual.
2. `git log --oneline -5` — últimos commits.
3. Ler `memory/handoff.md` — último provedor, mudança ativa, próxima intenção.
4. Ler `AGENTS.md` — secção "Estado do Projeto".
5. Ler ficheiro mais recente em `memory/history/`.
6. Ler `context/produto.md` — estado das features.

## Apresentar
---
**Branch**: [branch]
**Últimos commits**: [lista]
**Último provedor**: [IA] — [quando]  (de handoff.md)
**Mudança ativa**: [changes/<nome>/ ou nenhuma] — cursor: [primeira [ ] em tasks.md]
**Fase**: [MVP/BETA/PRODUÇÃO]

**Features**:
| Feature | Estado |
|---------|--------|
[tabela de context/produto.md]

**Próximos passos**:
1. [top 3 pendências]
---
