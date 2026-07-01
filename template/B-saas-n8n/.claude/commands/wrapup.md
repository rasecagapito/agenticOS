Consolida a sessão atual do projeto SaaS. Executa em ordem:

1. **Obter hora real**: `powershell -command "Get-Date -Format 'yyyyMMdd_HHmm'"`

2. **Ler contexto da sessão**:
   - Arquivo mais recente em `memory/history/`
   - `git diff --stat` — arquivos alterados
   - `git branch --show-current` — branch atual

3. **Criar registro** em `memory/history/YYYY-MM-DD-HH-sessao.md` com:
   - Data e hora real
   - Branch atual
   - Resumo do que foi feito
   - Arquivos criados/alterados
   - Migrations criadas (se houver)
   - Decisões técnicas tomadas
   - Pendências e próximos passos

4. **Registrar aprendizados** em `memory/learnings/YYYY-MM-DD-tema.md` se houve:
   - Bugs resolvidos (problema + solução)
   - Padrões descobertos no stack
   - Decisões de arquitetura

5. **Atualizar context/estado-sistema.md** se estado de features mudou.

6. **Atualizar CLAUDE.md** — seção "Estado do Projeto".

7. **Fechar mudança ativa** (se existe pasta em `changes/` fora de `archive/`):
   - Verificar se as tarefas em `tasks.md` estão concluídas.
   - **Sugerenciar deltas em `context/`** — analisar o que a mudança alterou e propor updates,
     SEM aplicar sozinho. Notação: `+` ADICIONAR · `~` MODIFICAR · `-` REMOVER.
     Apresentar cada arquivo de context/ afetado e pedir confirmação item a item.
     - Se a mudança declara `## Módulo: <nome>` (projeto modular), mirar as sugestões de
       delta em `context/<modulo>/` (e `context/_global.md` se afetar o compartilhado).
   - Aplicar **só** os deltas confirmados pelo humano.
   - Mover a pasta da mudança para `changes/archive/YYYY-MM-DD-<nome>/`.
   - Ver `docs/CHANGE-WORKFLOW.md` para o formato do delta.

8. Confirmar: "Sessão consolidada. Registro: [nome do arquivo]"
