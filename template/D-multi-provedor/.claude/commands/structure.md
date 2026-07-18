Executa o procedimento de estrutura em `automation/procedures/structure.md`.

**Uso**: `/structure`  (sem argumento = auditar/dry-run; com aprovação = monta/emite)

Monta e audita a estrutura da **aplicação** (não só o cérebro): detecta perfil
(`next-app`/`generico`), grava o `AGENTS.md` canônico, emite as regras com escopo para cada
agente (Cursor `.mdc`, Copilot `.instructions.md`) a partir da fonte única, e audita contra
`docs/STRUCTURE-SPEC.md` pelo loop A/B. Projeto implantado = Tier 0 (código intocado); migração
real é opt-in via `/propose migrate-<módulo>` com gate de build.
