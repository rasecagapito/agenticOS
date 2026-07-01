# Agente: [NOME DO PROJETO]
> Cérebro canônico — orquestrador central compartilhado por TODAS as IAs (Claude, Codex, Gemini, GLM, DeepSeek…).
> Mantém 100-200 linhas. Este é o único arquivo de orquestração; os outros (`CLAUDE.md`, `GEMINI.md`) apenas apontam para aqui.

## Protocolo de Arranque de Sessão (LER PRIMEIRO — qualquer IA)
Antes de qualquer trabalho, sempre nesta ordem:
1. Ler `memory/handoff.md` — estado vivo: último provedor, mudança ativa, narrativa.
2. Se há mudança ativa, abrir `changes/<nome>/` e ler `tasks.md`.
3. **Retomar na primeira tarefa `[ ]` não marcada** (o "cursor"). Não recomeçar do zero.
4. Ler os módulos de `context/` relevantes à tarefa (não todos — poupar tokens).
Ao terminar cada tarefa e ao fechar a sessão: seguir `automation/procedures/handoff.md` e `wrapup.md`.

## Identidade
- **Projeto**: [nome]
- **Stack**: [tecnologias]
- **Fase**: [MVP / BETA / PRODUÇÃO]

## Módulos de Conhecimento
Carregar apenas o necessário para a tarefa:
- @context/_global.md
- @context/produto.md
- @context/arquitetura.md
- @context/stack.md

## Workers Disponíveis
- **Developer** (@workers/developer.md) — implementação
- **Arquiteto** (@workers/arquiteto.md) — decisões técnicas, risco
- **QA** (@workers/qa.md) — revisão, testes, segurança

## Regras Operacionais
1. Consultar `context/` antes de responder sobre o negócio/arquitetura.
2. Consultar `memory/learnings/` antes de investigar um bug já visto.
3. Nunca deletar/mover arquivos sem confirmação humana.
4. Toda a mudança passa pelo ciclo: `/propose` → `/worker` → `/wrapup` (ver `automation/procedures/`).
5. Atualizar `memory/handoff.md` ao fechar cada tarefa (continuidade multi-IA).

## Ciclo de Trabalho (provider-neutro)
Os procedimentos vivem em `automation/procedures/` e são a **fonte única** da lógica.
No Claude há slash commands (`/propose`, `/worker`, `/wrapup`, `/status`, `/handoff`, `/conform`) que os invocam.
Noutras IAs (Codex, Gemini…) pede em linguagem natural ("faz o propose X", "faz o wrapup") e a IA lê o procedimento.

| Intenção | Slash (Claude) | Procedimento (todas) |
|----------|----------------|----------------------|
| Criar mudança | `/propose <nome>` | `automation/procedures/propose.md` |
| Executar mudança ativa | `/worker [nome]` | `automation/procedures/worker.md` |
| Consolidar sessão | `/wrapup` | `automation/procedures/wrapup.md` |
| Estado do projeto | `/status` | `automation/procedures/status.md` |
| Ler/gravar handoff | `/handoff` | `automation/procedures/handoff.md` |
| Auditar/corrigir conformidade | `/conform` | `automation/procedures/conform.md` |

## Provedores
Arquivo de entrada por IA e limitações em `providers/registry.md`.
Este `AGENTS.md` é o cérebro canônico. `CLAUDE.md` e `GEMINI.md` são ponteiros (`@`/import) para aqui — **não duplicar conteúdo neles**.

## Estado do Projeto
- **Fase**: [fase]
- **Última sessão**: [data] — ver `memory/handoff.md`
- **Próximo passo**: [ação] (ou "ver cursor da mudança ativa")
