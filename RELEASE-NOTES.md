# Agentic OS v1.2.0

Camada opt-in **Multi-Provedor** — várias IAs (Claude, Codex, Gemini, GLM, DeepSeek…)
trabalham sincronizadas sobre o mesmo cérebro. Quando uma para, a próxima continua exatamente
do mesmo ponto, **sem drift** ("sem delírio").

## Novidades

- **Fonte única + ponteiros** — um só ficheiro cérebro é canónico (`AGENTS.md` em projetos novos); `CLAUDE.md`/`GEMINI.md` são ponteiros `@import`. Zero duplicação = zero drift.
- **Handoff** (`memory/handoff.md`) — estado vivo que a próxima IA lê para retomar. O cursor (próxima tarefa) é derivado da primeira `[ ]` em `tasks.md`; gravado incremental ao fechar cada tarefa (à prova de crash, sobrevive a sessão morta sem `/wrapup`).
- **Procedimentos provider-neutros** — `automation/procedures/{propose,worker,wrapup,status,handoff}.md` são a fonte única da lógica; `.claude/commands/` são wrappers finos. Codex/Gemini pedem em linguagem natural e leem o procedimento.
- **`providers/registry.md`** — que ficheiro cada IA lê + suporte a import + limitações; isola factos por provedor.
- **Novo template `D-multi-provedor/`** — exemplo completo pronto a copiar.
- **Skill atualizada** — deteta o cérebro em projetos existentes (regra de precedência), cria ponteiros em falta e adiciona a camada **sem tocar** nos comandos existentes.
- **Novo comando `/handoff`** — ler/gravar o estado vivo.

Tudo opt-in. Projetos single-IA (templates A/B/C) ficam inalterados.

Detalhes: [`docs/MULTI-PROVIDER.md`](docs/MULTI-PROVIDER.md).

---

# Agentic OS v1.1.0

Suporte opcional a **módulos / domínios** — organize o conhecimento por módulo de código
em projetos grandes, sem quebrar o modo flat (projetos pequenos continuam simples).

## Novidades

- **`context/<modulo>/`** — uma subpasta por módulo (ex: `auth/`, `folha-pagamento/`, `bem-estar/`) + `_global.md` para o que é compartilhado.
- **Mudanças prefixadas** — `changes/<modulo>-<feature>/` com o campo `## Módulo: <nome>` na proposal.
- **`/propose` detecta projeto modular** — se `context/` tem subpastas, pergunta o módulo e prefixa o nome da mudança.
- **Delta por módulo no `/wrapup`** — as sugestões de atualização miram só `context/<modulo>/` do módulo da mudança (economiza tokens, isola conhecimento).
- **Detecção flat vs modular** — automática, pela presença de subpastas em `context/`. Sem subpastas = comportamento atual, inalterado.

Tudo opt-in. Migração de projeto flat → modular é feita com segurança via `/propose reorganize-context-modular` (nunca deleta, usa quarentena + MOVES.md para rollback).

Detalhes: [`docs/CHANGE-WORKFLOW.md`](docs/CHANGE-WORKFLOW.md) → seção "Módulos / Domínios".

---

# Agentic OS v1.0.0

Primeiro release do plugin **Agentic OS** para Claude Code — metodologia de organização
de arquivos que permite a um agente IA operar com autonomia entre sessões: elimina cold
start, otimiza tokens e constrói memória persistente.

## Instalação

```
/plugin marketplace add rasecagapito/agenticOS
/plugin install agentic-os@agentic-os
```

Reiniciar o Claude Code após instalar.

> Plugins do Claude Code instalam via `/plugin`, **não** via `npm install`.

## Inclui

- **Skill `agentic-os`** — monta (projeto novo) ou adapta (projeto existente) ao padrão Agentic OS
- **3 templates**:
  - `A-generico` — conteúdo/marketing (workers: roteirista, pesquisador, analista)
  - `B-saas-n8n` — SaaS + automações n8n (workers: developer, workflow-designer, arquiteto, qa)
  - `C-claude-integrado` — SaaS integrado com Claude Code Superpowers
- **As 5 camadas**: Identity (`CLAUDE.md`) · Knowledge (`context/`) · Memory (`memory/`) · Workers (`workers/`) · Automation (`automation/`)
- **Change workflow**: `/propose` → `/worker` → `/wrapup`
  - cada mudança = pasta `changes/<nome>/` com proposal + tasks + design
  - delta semi-automático em `context/` (`+` adicionar · `~` modificar · `-` remover), humano confirma
  - ponte brainstorming → artefatos
- **Reorganização brownfield segura** (`/propose reorganize-<alvo>`): scan read-only → plano → aprovação → mover. Nunca deleta (quarentena), verifica referências, dry-run por defeito.
- **Docs**: [`docs/CHANGE-WORKFLOW.md`](docs/CHANGE-WORKFLOW.md) — ciclo completo com exemplo `add-dark-mode`

## Comandos

| Comando | Ação |
|---------|------|
| `/propose <nome>` | Criar mudança estruturada |
| `/worker [nome]` | Ativar especialista (executa a mudança ativa) |
| `/wrapup` | Arquivar mudança + atualizar `context/` (delta) + memória |
| `/status` | Estado atual do projeto |
