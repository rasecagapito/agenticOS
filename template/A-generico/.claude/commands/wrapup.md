Consolida a sessão atual do projeto. Executa em ordem:

1. **Obter hora real**: `powershell -command "Get-Date -Format 'yyyyMMdd_HHmm'"`

2. **Ler contexto da sessão**:
   - Arquivo mais recente em `memory/history/`
   - `CLAUDE.md` — próximo passo registrado
   - Arquivos alterados nesta sessão

3. **Criar checkpoint** em `memory/history/YYYY-MM-DD-HH-sessao.md` com:
   - Data e hora real
   - Resumo do que foi feito
   - Arquivos criados/alterados
   - Decisões tomadas
   - Pendências e próximos passos

4. **Registrar aprendizados** em `memory/learnings/YYYY-MM-DD-tema.md` se houve:
   - Problemas resolvidos
   - Padrões descobertos
   - Decisões relevantes

5. **Atualizar CLAUDE.md** — seção "Estado do Projeto": fase atual, data, próximo passo.

6. **Fechar mudança ativa** (se existe pasta em `changes/` fora de `archive/`):
   - Verificar se as tarefas em `tasks.md` estão concluídas.
   - **Sugerenciar deltas em `context/`** — analisar o que a mudança alterou e propor updates,
     SEM aplicar sozinho. Notação: `+` ADICIONAR · `~` MODIFICAR · `-` REMOVER.
     Apresentar cada arquivo de context/ afetado e pedir confirmação item a item.
     - Se a mudança declara `## Módulo: <nome>` (projeto modular), mirar as sugestões de
       delta em `context/<modulo>/` (e `context/_global.md` se afetar o compartilhado).
   - Aplicar **só** os deltas confirmados pelo humano.
   - Mover a pasta da mudança para `changes/archive/YYYY-MM-DD-<nome>/`.
   - Ver `docs/CHANGE-WORKFLOW.md` para o formato do delta.

7. Confirmar: "Sessão consolidada. Registro criado: [nome do arquivo]"
