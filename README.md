# Agentic OS

Metodologia de organização de arquivos que permite a um agente IA operar com
autonomia entre sessões: elimina cold start, otimiza tokens e constrói memória persistente.

## Instalação

O repositório distribui o mesmo núcleo do Agentic OS para Codex e Claude Code. A instalação é
feita uma vez no perfil da ferramenta; depois, a skill pode ser usada em qualquer projeto.

### Claude Code

```text
/plugin marketplace add rasecagapito/agenticOS
/plugin install agentic-os@agentic-os
```

Reiniciar o Claude Code após instalar.

### Codex

Adicionar o repositório como marketplace:

```powershell
codex plugin marketplace add rasecagapito/agenticOS
```

Depois, abrir **Plugins** no Codex, selecionar **Agentic OS**, instalar o plugin e iniciar uma nova
tarefa para carregar a skill. Não é necessário instalar novamente ao trocar de projeto usando o
mesmo perfil do Codex.

### Gemini e outros provedores

Gemini e as demais IAs continuam suportados pela camada multi-provedor criada dentro de cada
projeto: `AGENTS.md`, `GEMINI.md`, `providers/registry.md`, `memory/handoff.md` e
`automation/procedures/`. Eles não dependem de um manifesto nativo neste repositório.

Depois da instalação, pedir para montar ou adaptar um projeto ao padrão Agentic OS ativa a skill
`agentic-os` automaticamente.

## Estrutura do repositório

- `.codex-plugin/plugin.json` — manifesto oficial do plugin para Codex
- `.agents/plugins/marketplace.json` — catálogo Git do plugin para Codex
- `.claude-plugin/` — manifesto e marketplace do plugin para Claude Code
- `skills/agentic-os/SKILL.md` — skill compartilhada e provider-neutra
- `template/A-generico/` — template para conteúdo/marketing
- `template/B-saas-n8n/` — template para SaaS + automações n8n
- `template/C-claude-integrado/` — template SaaS integrado com Claude Code Superpowers
- `template/D-multi-provedor/` — cérebro compartilhado entre várias IAs (Claude, Codex, Gemini…)
- `docs/CHANGE-WORKFLOW.md` — **[Change Workflow](docs/CHANGE-WORKFLOW.md)**: ciclo de mudança estruturada
- `docs/MULTI-PROVIDER.md` — **[Multi-Provedor](docs/MULTI-PROVIDER.md)**: cérebro compartilhado + handoff entre IAs
- `docs/superpowers/` — specs e planos de desenvolvimento do próprio plugin

## As 5 camadas

| Camada | Pasta | Função |
|--------|-------|--------|
| Identity | `CLAUDE.md` | Orquestrador central |
| Knowledge | `context/` | Conhecimento modular do projeto |
| Memory | `memory/` | Persistência: learnings + history |
| Workers | `workers/` | Especialistas com role/função/schema |
| Automation | `automation/` | Gates de qualidade + guardrails |

## Multi-Provedor (opt-in)

Várias IAs (Claude, Codex, Gemini, GLM, DeepSeek…) sobre o **mesmo cérebro**. Quando uma para,
a próxima continua exatamente do mesmo ponto — **sem drift**. Duas peças: **fonte única + ponteiros**
(um `AGENTS.md` canônico; `CLAUDE.md`/`GEMINI.md` são `@import`) e **handoff** (`memory/handoff.md`,
estado vivo que a próxima IA lê). Template: `template/D-multi-provedor/`. Detalhes em
**[docs/MULTI-PROVIDER.md](docs/MULTI-PROVIDER.md)**.

## Ciclo de mudança

```
/propose <nome>  → cria changes/<nome>/ com proposal + tasks
/worker [nome]   → executa as tarefas da mudança
/wrapup          → arquiva + atualiza context/ (delta) + memória
```

Detalhes em **[docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md)**.

## Comandos

| Comando | Ação |
|---------|------|
| `/propose <nome>` | Criar uma nova mudança estruturada |
| `/worker [nome]` | Ativar especialista (executa a mudança ativa) |
| `/wrapup` | Consolidar sessão: arquivar mudança + memória + deltas |
| `/status` | Estado atual do projeto |
