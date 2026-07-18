# STRUCTURE-SPEC — Estrutura da Aplicação (verificável)

Estende o `CONFORMANCE-SPEC.md` para o **código-fonte da aplicação** (não só o cérebro do
agente). O loop A/B audita estas regras; o Agente A classifica cada uma `CONFORME | FALTA |
DRIFT | WARN`.

## Regras base de estrutura (S)

- **S1 — Perfil declarado.** Existe um marcador de perfil (`.agentic/structure.json` ou campo
  no `AGENTS.md`) indicando `next-app | generico` (por app, no monorepo).
- **S2 — Cérebro canônico.** `AGENTS.md` presente na raiz (aninhado no monorepo), com ponteiros
  `CLAUDE.md` (`@AGENTS.md`) e `GEMINI.md`.
- **S3 — Regras emitidas e sincronizadas.** As regras com escopo do perfil estão emitidas para os
  agentes-alvo (`.cursor/rules/*.mdc`, `.github/instructions/*.instructions.md`) e **batem a fonte**
  (`structure-profiles/<perfil>/rules/`). Divergência → FAIL.
- **S4 — Colocação (next-app).** Código específico da rota em `_components/_actions/_data-access`;
  compartilhado (2+ rotas) promovido a `components/{ui,shared}` ou `packages/`.
- **S5 — Server-first (WARN).** Sem `"use client"` desnecessário (heurística: arquivo sem hook,
  handler ou API de browser não deveria ser client). É aviso, não bloqueio.
- **S6 — Validação.** `_actions` validam entrada com Zod (`*.schema`).
- **S7 — Auth em profundidade.** Autenticação/autorização verificada em `_actions` **e**
  `_data-access`.

## Regras anti-drift de estrutura (DS)

- **DS1 — Fonte única.** Regra emitida idêntica à fonte provider-neutra (checado por
  `scripts/check-rules-sync.sh`).
- **DS2 — Gate de build.** Em migração (Tier 2), `build` + `typecheck` + testes verdes são
  obrigatórios na re-auditoria; senão, **rollback automático** via `MOVES.md`.

## Critério de sucesso
NOVO: 100% de S1–S4, S6–S7 + zero DS. EXISTENTE (Tier 0): S1–S3 aplicados sem tocar código.
S5 nunca bloqueia — só reporta.
