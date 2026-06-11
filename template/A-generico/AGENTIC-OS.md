# Agentic OS — Template A (Genérico)

## Estrutura

| Peça | Estado |
|------|--------|
| `/context/` — canal, produtos, métricas, tom de voz | ✅ |
| `/workers/` — roteirista, pesquisador, analista | ✅ |
| `/automation/` — evaluation.json + guardrails | ✅ |
| `/memory/` — learnings + history | ✅ |
| `/wrapup` slash command | ✅ |
| `/status` slash command | ✅ |
| `/worker [nome]` slash command | ✅ |
| Hook Stop — lembrete automático ao fechar | ✅ |

## Comandos Disponíveis

| Comando | O que faz |
|---------|-----------|
| `/wrapup` | Consolida sessão → checkpoint em memory/history + aprendizados em memory/learnings |
| `/status` | Resumo: fase atual, última sessão, próximos passos |
| `/worker roteirista` | Activa worker de estrutura narrativa e CTAs |
| `/worker pesquisador` | Activa worker de pesquisa e validação de factos |
| `/worker analista` | Activa worker de métricas e padrões |

## Ciclo de Uso

```
1. Abrir Claude Code nesta pasta → CLAUDE.md carrega automático
2. "vamos começar" → Claude lê memory/history + estado do projeto
3. /worker [nome] → activa especialista com contexto carregado
4. [trabalho da sessão]
5. /wrapup → consolida sessão
6. Fechar → hook grava lembrete automático
```

## Módulos de Conhecimento (/context)

| Ficheiro | Conteúdo |
|----------|---------|
| `canal.md` | Nicho, plataformas, proposta de valor |
| `produtos.md` | Catálogo, posicionamento, modelo de receita |
| `metricas.md` | KPIs, benchmarks, análise de sucesso |
| `tom_de_voz.md` | Personalidade, diretrizes de escrita, exemplos |

## Workers (/workers)

| Worker | Função |
|--------|--------|
| `roteirista.md` | Estrutura narrativa, ganchos, CTAs |
| `pesquisador.md` | Pesquisa externa, validação de factos |
| `analista.md` | Métricas, padrões, recomendações |

## Change Workflow

Mudanças estruturadas vivem em `changes/<nome>/` (proposal + tasks + design opcional).

| Comando | Ação |
|---------|------|
| `/propose <nome>` | Criar mudança |
| `/worker [nome]` | Executar a mudança ativa |
| `/wrapup` | Arquivar + atualizar context/ via delta |

Documentação completa: ver `docs/CHANGE-WORKFLOW.md` (na raiz do repositório do plugin).
