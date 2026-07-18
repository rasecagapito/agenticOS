# Perfil de Estrutura: next-app (Next.js App Router)

Colocação **C** (híbrida): o que é da rota vive colocado na rota; o compartilhado é
promovido. Monorepo por padrão (instanciado em `apps/<app>/`), com fallback standalone.

## Árvore-alvo (dentro de apps/<app>/ ou na raiz se standalone)
```
src/
  app/
    (grupo)/<rota>/
      page.tsx            # Server Component — busca dados + valida auth
      _components/        # componentes SÓ desta rota (privado, não vira rota)
        content.tsx       # Client Component principal ("use client")
      _actions/           # Server Actions ("use server") + Zod
      _data-access/       # DAL desta rota (server-only)
  components/{ui,layout,shared}/   # compartilhado (promovido de 2+ rotas)
  lib/                    # clients: db, auth, config
  hooks/                  # hooks compartilhados
  stores/                 # estado global (Zustand)
  types/                  # tipos globais
  tests/{unit,integration,e2e}/
```

## Regra de promoção (colocação C)
- Usado em **1 rota** → fica colocado em `app/<rota>/_components`.
- Reusado em **2+ rotas/módulos** → promove para `components/shared` (ou `packages/ui` no monorepo).
- Na dúvida, mantém colocado e pergunta antes de promover.

## Cérebro
- `AGENTS.md` canônico na raiz do app (aninhado no monorepo, "mais próximo vence").
- Ponteiros: `CLAUDE.md` → `@AGENTS.md`; `GEMINI.md` → aponta para `AGENTS.md`.
