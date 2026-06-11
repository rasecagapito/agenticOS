Cria uma mudança estruturada em `changes/<nome>/`.

**Uso**: `/propose <nome-ou-descrição>`

Ver `docs/CHANGE-WORKFLOW.md` para o ciclo completo.

## Execução

1. **Determinar o nome** (kebab-case). Se o argumento for uma descrição, derivar um nome curto.
   Se o escopo estiver ambíguo, fazer 1 pergunta de clarificação antes de criar.

2. **Verificar ponte de brainstorming**: procurar em `docs/superpowers/specs/` uma spec
   recente sobre o tema (`*-<tema>-design.md`).
   - Se existe → ler e extrair Porquê/Escopo/Abordagem e critérios para pré-preencher os artefatos.
     `proposal.md` referencia a spec com link (não duplicar o conteúdo).
   - Se não existe → gerar os artefatos do zero a partir do nome/descrição.

3. **Criar a pasta** `changes/<nome>/` e os artefatos:

   `proposal.md`
   ```markdown
   # Mudança: <nome>
   ## Porquê
   [1-3 frases]
   ## Escopo
   - [entra]
   - [NÃO entra]
   ## Abordagem
   [1 parágrafo]
   ```

   `tasks.md`
   ```markdown
   # Tarefas: <nome>
   - [ ] 1. [tarefa]
   - [ ] 2. [tarefa]
   ```

   `design.md` — **criar apenas se** a mudança for técnica/não-trivial (decisões de arquitetura,
   migrations, risco). Caso contrário, omitir.

4. **Caso especial — reorganização** (`/propose reorganize-<alvo>`):
   - Fazer scan **read-only** da estrutura atual (NÃO mover nada).
   - Gerar `tasks.md` listando CADA movimento como uma linha `MOVER`/`AGRUPAR`/`MARCAR`.
   - Aplicar as Regras de Segurança de `docs/CHANGE-WORKFLOW.md` (nunca deletar, verificar
     referências, exigir git limpo, registar em MOVES.md, dry-run por defeito).

5. **Confirmar**:
   > "Mudança '<nome>' criada em changes/<nome>/. Artefatos: [lista]. Execute /worker para implementar."

## Se nenhum argumento
Listar mudanças ativas em `changes/` (excluindo `archive/`) com 1 linha cada.
