Carrega e activa um worker especializado do projeto SaaS + n8n.

**Uso**: `/worker [nome]`

## Workers disponíveis
- `developer` / `dev` — implementação React/Supabase/TypeScript
- `workflow` / `n8n` — automações n8n, WhatsApp, Telegram
- `arquiteto` / `arch` — decisões técnicas, migrations, risco
- `qa` / `revisor` — revisão, segurança, testes

## Execução

1. Identificar worker pelo argumento:
   - `developer` ou `dev` → ler `workers/developer.md`
   - `workflow` ou `n8n` → ler `workers/workflow-designer.md`
   - `arquiteto` ou `arch` → ler `workers/arquiteto.md`
   - `qa` ou `revisor` → ler `workers/qa.md`

2. Ler o ficheiro do worker na íntegra.

3. Carregar contexto listado na secção "Contexto a Carregar" do worker.

3b. **Detetar mudança ativa**: se existe uma pasta em `changes/` (fora de `archive/`),
   carregar o `tasks.md` dessa mudança como contexto de trabalho. Durante a sessão,
   marcar tarefas concluídas com `[x]` em `tasks.md`. Ver `docs/CHANGE-WORKFLOW.md`.

4. Confirmar:
   > "Worker [nome] activo. Contexto carregado: [lista]. Pronto para [função]."

5. Seguir processo e restrições do worker para o resto da sessão.

## Se nenhum argumento
Listar workers disponíveis com descrição de 1 linha.
