# Procedimento: WRAPUP (consolidar sessão)

> Provider-neutro. No Claude: `/wrapup`. Noutras IAs: "faz o wrapup".

## Execução (em ordem)
1. **Hora real**: `Get-Date -Format 'yyyy-MM-dd-HH'` (PowerShell) ou `date '+%Y-%m-%d-%H'` (POSIX).
2. **Ler contexto**: arquivo mais recente em `memory/history/`; `git diff --stat`; `git branch --show-current`.
3. **Registro** em `memory/history/YYYY-MM-DD-HH-sessao.md`: data/hora, **provedor(es) da sessão**, branch, resumo, arquivos alterados, decisões, pendências/próximos passos.
4. **Aprendizados** em `memory/learnings/YYYY-MM-DD-tema.md` se houve: bugs resolvidos (problema+solução), padrões, decisões de arquitetura.
5. **Fechar mudança ativa** (se há pasta em `changes/` fora de `archive/`):
   - Verificar tarefas de `tasks.md` concluídas.
   - **Sugerenciar deltas em `context/`** — analisar o que mudou e propor updates SEM aplicar sozinho.
     Notação: `+` ADICIONAR · `~` MODIFICAR · `-` REMOVER. Confirmar item a item.
     Se declara `## Módulo: <nome>`, mirar `context/<modulo>/` (e `_global.md` se afetar o compartilhado).
   - Aplicar **só** deltas confirmados. Mover a pasta → `changes/archive/YYYY-MM-DD-<nome>/`.
6. **Atualizar `AGENTS.md`** — seção "Estado do Projeto".
7. **Fechar o handoff**: atualizar `memory/handoff.md` — último provedor + hora, Mudança ativa = "nenhuma" (ou a próxima), narrativa final. Ver `procedures/handoff.md`.
8. Confirmar: "Sessão consolidada. Registro: [nome do arquivo]. Handoff atualizado."

> Nota multi-IA: o handoff já foi gravado incrementalmente pelo worker a cada tarefa; o wrapup só o finaliza e arquiva a mudança.
