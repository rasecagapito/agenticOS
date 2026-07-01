# Procedimento: WORKER (executar a mudança ativa)

> Provider-neutro. No Claude: `/worker [nome]`. Noutras IAs: "ativa o worker <nome>".

## Workers disponíveis
- `developer` / `dev` — implementação
- `arquiteto` / `arch` — decisões técnicas, risco
- `qa` / `revisor` — revisão, segurança, testes

## Execução
1. Identificar o worker pelo argumento e ler `workers/<worker>.md` na íntegra.
2. Carregar o contexto listado na secção "Contexto a Carregar" do worker.
3. **Detetar mudança ativa**: se há pasta em `changes/` (fora de `archive/`), carregar o `tasks.md` dela.
   Localizar a primeira `[ ]` (o cursor, do `procedures/handoff.md`) e retomar aí.
4. Confirmar: "Worker [nome] ativo. Contexto: [lista]. A retomar na tarefa [N]."
5. Trabalhar seguindo processo e restrições do worker.
6. **Ao fechar cada tarefa**:
   - Marcar `[x]` em `tasks.md`.
   - Atualizar `memory/handoff.md` (narrativa + último provedor + hora) — **incremental, à prova de crash**.
     Ver `procedures/handoff.md`. Isto garante que outra IA retoma exato mesmo sem `/wrapup`.

## Sem argumento
Listar workers disponíveis com descrição de 1 linha.
