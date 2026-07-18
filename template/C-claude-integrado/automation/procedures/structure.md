# Procedimento: STRUCTURE (montar/auditar estrutura da app)

> Provider-neutro. No Claude: `/structure`. Noutras IAs: "monta a estrutura" / "audita a estrutura".
> Specs: `docs/STRUCTURE-SPEC.md` (regras S/DS) · `docs/STRUCTURE-MIGRATION.md` (tiers).
> Perfis: `structure-profiles/<perfil>/` (blueprint + rules fonte). Emissão: `scripts/emit-rules.sh`.

## Execução
1. **Detectar contexto**: monorepo (turbo.json / pnpm-workspace / apps/) vs standalone;
   projeto NOVO (vazio) vs IMPLANTADO (tem código).
2. **Escolher perfil** por app: `next-app` (App Router) ou `generico`. Gravar marcador (S1).
3. **Cérebro (S2)**: criar/atualizar `AGENTS.md` canônico + ponteiros `CLAUDE.md`/`GEMINI.md`.
4. **Emitir regras (S3)**: rodar `emit-rules.sh <perfil> <raiz>` → `.cursor/rules/*.mdc` +
   `.github/instructions/*.instructions.md`. Nunca duplicar a lógica; a fonte é o perfil.
5. **NOVO** → montar a árvore do blueprint (respeitando a Regra de Ouro: só criar).
   **IMPLANTADO** → **Tier 0**: parar aqui (código intocado). Migração só via `/propose migrate-*`.
6. **Auditar (loop A/B)** contra `docs/STRUCTURE-SPEC.md`. S5 é WARN. Em migração, aplicar o
   gate de build (DS2): sem build/testes verdes, rollback.
7. **Fechar**: reportar perfil, o que foi criado/emitido e pendências do backlog.

## Sem argumento
Só auditar (passo 6) e mostrar o relatório de gap, sem tocar em nada.
