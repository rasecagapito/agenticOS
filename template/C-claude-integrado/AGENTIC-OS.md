# Agentic OS — Template C (Claude Code Integrado)

## Estrutura

| Peça | Estado |
|------|--------|
| `/context/` — produto, arquitetura, BD, n8n, stack | ✅ |
| `/workers/` — developer, workflow-designer, arquiteto, revisor | ✅ |
| `/automation/` — evaluation.json + guardrails | ✅ |
| `/memory/` — learnings + history | ✅ |
| `/.claude/settings.json` — Stop hook automático | ✅ |
| `/wrapup` slash command | ✅ |
| `/status` slash command | ✅ |
| `/worker [nome]` slash command | ✅ |
| Hook Stop — lembrete automático ao fechar | ✅ |

## Comandos Disponíveis

| Comando | O que faz |
|---------|-----------|
| `/wrapup` | Consolida sessão + invoca `consolidate-memory` |
| `/status` | Branch, features, skills recomendadas para próxima sessão |
| `/worker dev` | Developer — usa `saas-developer`, `executing-plans` |
| `/worker workflow` | Workflow designer — usa skills n8n completas |
| `/worker arquiteto` | Arquiteto — usa `brainstorming`, `saas-architect` |
| `/worker qa` | Revisor — usa `/code-review`, `verification-before-completion` |

## Ciclo de Uso

```
1. Abrir Claude Code → CLAUDE.md carrega automático
2. "vamos começar" → Claude lê memory/history + context
3. /worker [nome] → activa especialista + skills Superpowers associadas
4. [trabalho — skills invocadas automaticamente pelo worker]
5. /wrapup → consolida + consolidate-memory
6. Fechar → hook grava lembrete automático
```

## Skills Superpowers por Worker

| Worker | Skills Obrigatórias |
|--------|-------------------|
| `developer` | `brainstorming` → `writing-plans` → `executing-plans` → `verification-before-completion` |
| `workflow` | `n8n-workflow-patterns` → `n8n-node-configuration` → `n8n-mcp-tools-expert` → `n8n-validation-expert` |
| `arquiteto` | `brainstorming` → `saas-architect` → `writing-plans` |
| `revisor` | `/code-review` → `verification-before-completion` → `/security-review` |

## Gates de Qualidade (/automation/evaluation.json)

| Gate | Skills Obrigatórias |
|------|-------------------|
| `implementacao` | `brainstorming` aprovado, `verification-before-completion` passou |
| `code_review` | `/code-review` sem findings críticos |
| `deploy_producao` | Todos os gates anteriores + testado em staging |
| `workflow_n8n` | `n8n-validation-expert` passou |

## Change Workflow

Mudanças estruturadas vivem em `changes/<nome>/` (proposal + tasks + design opcional).

| Comando | Ação |
|---------|------|
| `/propose <nome>` | Criar mudança |
| `/worker [nome]` | Executar a mudança ativa |
| `/wrapup` | Arquivar + atualizar context/ via delta |

Documentação completa: ver `docs/CHANGE-WORKFLOW.md` (na raiz do repositório do plugin).
