Carrega e ativa um worker especializado do projeto.

**Uso**: `/worker [nome]`

## Workers disponíveis
- `roteirista` — estrutura narrativa, ganchos, CTAs
- `pesquisador` — pesquisa externa, validação de fatos
- `analista` — métricas, padrões, recomendações

## Execução

1. Identificar worker pelo argumento:
   - `roteirista` → ler `workers/roteirista.md`
   - `pesquisador` ou `pesquisa` → ler `workers/pesquisador.md`
   - `analista` ou `analise` → ler `workers/analista.md`

2. Ler o arquivo do worker na íntegra.

3. Carregar contexto listado na seção "Contexto a Carregar" do worker.

3b. **Detectar mudança ativa**: se existe uma pasta em `changes/` (fora de `archive/`),
   carregar o `tasks.md` dessa mudança como contexto de trabalho. Durante a sessão,
   marcar tarefas concluídas com `[x]` em `tasks.md`. Ver `docs/CHANGE-WORKFLOW.md`.

4. Confirmar:
   > "Worker [nome] ativo. Contexto carregado: [lista]. Pronto para [função]."

5. Seguir processo e restrições do worker para o resto da sessão.

## Se nenhum argumento
Listar workers disponíveis com descrição de 1 linha.
