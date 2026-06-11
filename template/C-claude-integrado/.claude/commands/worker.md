Carrega worker especializado com skills Superpowers integradas.

**Uso**: `/worker [nome]`

## Workers disponíveis
- `developer` / `dev` — implementação + skills saas-developer, executing-plans
- `workflow` / `n8n` — automações + skills n8n-mcp-tools-expert, n8n-workflow-patterns
- `arquiteto` / `arch` — decisões técnicas + skills brainstorming, saas-architect
- `revisor` / `qa` — qualidade + skills /code-review, verification-before-completion

## Execução

1. Identificar worker:
   - `developer` ou `dev` → ler `workers/developer.md`
   - `workflow` ou `n8n` → ler `workers/workflow-designer.md`
   - `arquiteto` ou `arch` → ler `workers/arquiteto.md`
   - `revisor` ou `qa` → ler `workers/revisor.md`

2. Ler ficheiro do worker na íntegra.

3. Carregar contexto da secção "Contexto a Carregar".

3b. **Detetar mudança ativa**: se existe uma pasta em `changes/` (fora de `archive/`),
   carregar o `tasks.md` dessa mudança como contexto de trabalho. Durante a sessão,
   marcar tarefas concluídas com `[x]` em `tasks.md`. Ver `docs/CHANGE-WORKFLOW.md`.

4. Confirmar:
   > "Worker [nome] activo. Contexto: [lista]. Skills disponíveis: [lista]. Pronto para [função]."

5. Seguir sequência de activação definida no worker — incluindo skills obrigatórias antes de implementar.

## Se nenhum argumento
Listar workers com skills associadas.
