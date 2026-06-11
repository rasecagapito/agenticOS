Consolida a sessão atual. Executa em ordem:

1. **Obter hora real**: `powershell -command "Get-Date -Format 'yyyyMMdd_HHmm'"`

2. **Ler contexto**:
   - Ficheiro mais recente em `memory/history/`
   - `git diff --stat` + `git branch --show-current`

3. **Criar registo** em `memory/history/YYYY-MM-DD-HH-sessao.md`:
   - Data, hora, branch
   - Resumo do trabalho
   - Skills utilizadas na sessão
   - Ficheiros alterados/criados
   - Decisões tomadas
   - Pendências

4. **Registar aprendizados** em `memory/learnings/YYYY-MM-DD-tema.md`:
   - Bugs resolvidos
   - Padrões descobertos
   - Qual skill foi mais útil para cada tipo de tarefa

5. **Atualizar CLAUDE.md** — secção "Estado do Projeto".

6. **Invocar skill** `anthropic-skills:consolidate-memory` para consolidar memória global se houver aprendizados importantes sobre o projeto.

7. **Fechar mudança ativa** (se existe pasta em `changes/` fora de `archive/`):
   - Verificar se as tarefas em `tasks.md` estão concluídas.
   - **Sugerir deltas em `context/`** — analisar o que a mudança alterou e propor updates,
     SEM aplicar sozinho. Notação: `+` ADICIONAR · `~` MODIFICAR · `-` REMOVER.
     Apresentar cada ficheiro de context/ afetado e pedir confirmação item a item.
     - Se a mudança declara `## Módulo: <nome>` (projeto modular), mirar as sugestões de
       delta em `context/<modulo>/` (e `context/_global.md` se afetar o partilhado).
   - Aplicar **só** os deltas confirmados pelo humano.
   - Mover a pasta da mudança para `changes/archive/YYYY-MM-DD-<nome>/`.
   - Ver `docs/CHANGE-WORKFLOW.md` para o formato do delta.

8. Confirmar: "Sessão consolidada. Registo: [nome]. Skills usadas: [lista]."
