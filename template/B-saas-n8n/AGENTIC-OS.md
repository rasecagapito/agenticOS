# Agentic OS — Template B (SaaS + n8n)

## Estrutura

| Peça | Estado |
|------|--------|
| `/context/` — produto, arquitetura, BD, n8n, stack | ✅ |
| `/workers/` — developer, workflow-designer, arquiteto, qa | ✅ |
| `/automation/` — evaluation.json + guardrails | ✅ |
| `/memory/` — learnings + history | ✅ |
| `/wrapup` slash command | ✅ |
| `/status` slash command | ✅ |
| `/worker [nome]` slash command | ✅ |
| Hook Stop — lembrete automático ao fechar | ✅ |

## Comandos Disponíveis

| Comando | O que faz |
|---------|-----------|
| `/wrapup` | Consolida sessão → registo em memory/history + aprendizados em memory/learnings |
| `/status` | Branch, últimos commits, features, próximos passos |
| `/worker dev` | Activa developer — React/Supabase/TypeScript |
| `/worker workflow` | Activa workflow designer — n8n, WhatsApp, Telegram |
| `/worker arquiteto` | Activa arquiteto — decisões técnicas, migrations |
| `/worker qa` | Activa revisor — segurança, testes, Notion flow |

## Ciclo de Uso

```
1. Abrir Claude Code nesta pasta → CLAUDE.md carrega automático
2. "vamos começar" → Claude lê memory/history + context/estado-sistema
3. /worker [nome] → activa especialista com contexto SaaS/n8n
4. [trabalho da sessão]
5. /wrapup → consolida sessão + actualiza context/estado-sistema
6. Fechar → hook grava lembrete automático
```

## Módulos de Conhecimento (/context)

| Ficheiro | Conteúdo |
|----------|---------|
| `produto.md` | Visão geral, features, modelo de negócio, roadmap |
| `arquitetura.md` | Stack, diagrama, Edge Functions, ADRs |
| `banco-de-dados.md` | Schema, tabelas, convenções, RLS, migrations |
| `n8n-patterns.md` | Padrões de workflow, triggers, error handling |
| `stack.md` | Dependências, infra, variáveis de ambiente |

## Workers (/workers)

| Worker | Função |
|--------|--------|
| `developer.md` | Implementação React/Supabase/TypeScript |
| `workflow-designer.md` | Automações n8n, WhatsApp, Telegram |
| `arquiteto.md` | Decisões técnicas, trade-offs, ADRs |
| `qa.md` | Revisão, segurança, RLS, testes |

## Gates de Qualidade (/automation/evaluation.json)

| Gate | Quando |
|------|--------|
| `deploy_hom` | Antes de deployar em homologação |
| `deploy_prd` | Antes de deployar em produção |
| `workflow_n8n` | Antes de activar workflow em produção |
| `migration_bd` | Antes de aplicar migration em produção |

## Change Workflow

Mudanças estruturadas vivem em `changes/<nome>/` (proposal + tasks + design opcional).

| Comando | Ação |
|---------|------|
| `/propose <nome>` | Criar mudança |
| `/worker [nome]` | Executar a mudança ativa |
| `/wrapup` | Arquivar + atualizar context/ via delta |

Documentação completa: ver `docs/CHANGE-WORKFLOW.md` (na raiz do repositório do plugin).
