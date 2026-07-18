# STRUCTURE-MIGRATION — Escada de 4 Tiers (brownfield)

Como levar um projeto **já implantado** ao formato sem quebrar produção. Default = Tier 0.
Regra de Ouro: nunca mover/renomear/apagar sem mudança aprovada (`/propose`).

## Tier 0 — Só convenções (risco zero) · DEFAULT
Instala `AGENTS.md` + regras com escopo (`.mdc`/`.instructions.md`). **Código existente
intocado**; todo código novo já nasce no formato. Entrega ~90% do valor com 0% de risco.

## Tier 1 — Auditoria (read-only)
Agente A mapeia a distância até o perfil-alvo e entrega **relatório de gap + backlog de
migração priorizado por módulo**. Nada é tocado.

## Tier 2 — Migração incremental (por módulo, aprovada, reversível)
Usa o fluxo brownfield (`/propose migrate-<módulo>`), **um módulo por vez**:
1. Scan read-only → plano em `tasks.md` + `MOVES.md`.
2. Gate humano aprova.
3. `/worker` executa: move **e** reescreve imports/refs (reference-safe).
4. **Gate de build (DS2)**: `build` + `typecheck` + testes. Verde → segue; vermelho → **rollback**.

## Tier 3 — Reorg completo
Só para projetos menores/menos críticos ou sob pedido explícito, com git limpo e testes decentes.

## Recomendação
Projeto implantado → **Tier 0** por padrão. Migração real (Tier 2) é opt-in, módulo a módulo,
sempre protegida pelo gate de build.
