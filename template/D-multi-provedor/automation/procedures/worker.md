# Procedimento: WORKER (executar a mudança ativa)

> Provider-neutro. No Claude: `/worker [nome]`. Noutras IAs: "ativa o worker <nome>".

## Workers disponíveis
- `developer` / `dev` — implementação
- `arquiteto` / `arch` — decisões técnicas, risco
- `qa` / `revisor` — revisão, segurança, testes

## Execução
1. Identificar o worker pelo argumento e ler `workers/<worker>.md` na íntegra.
2. Carregar o contexto listado na seção "Contexto a Carregar" do worker.
3. **Detectar mudança ativa**: se há pasta em `changes/` (fora de `archive/`), carregar o `tasks.md` dela.
   Localizar a primeira `[ ]` (o cursor, do `procedures/handoff.md`) e validar:
   - Se o handoff tem secção `## Orquestração`: o cursor **não pode ultrapassar o `Limite aprovado`**.
     Cursor já além do limite → parar e reportar (nunca executar).
4. Confirmar: "Worker [nome] ativo. Contexto: [lista]. A retomar na tarefa [N] (limite aprovado: [M])."
5. Trabalhar seguindo processo e restrições do worker. Gotcha ou dúvida fora do lote → **parar**,
   registar no handoff (Gotchas) e aguardar a coordenação/humano; nunca improvisar além do aprovado.
6. **Ao fechar cada tarefa** (uma de cada vez):
   - Marcar `[x]` em `tasks.md`.
   - Gravar o commit (`git rev-parse --short HEAD`) e atualizar `memory/handoff.md`
     (narrativa + último provedor + hora) — **incremental, à prova de crash**. Ver `procedures/handoff.md`.
   - Chegar ao `Limite aprovado` (fim do lote) → **parar** e registar "aguardando aprovação"
     na narrativa. Só a coordenação, com gate humano, avança o limite.

## Sem argumento
Listar workers disponíveis com descrição de 1 linha.
