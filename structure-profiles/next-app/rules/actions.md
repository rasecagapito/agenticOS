---
name: actions
description: Server Actions — use server, validação Zod e autenticação
globs: ["**/_actions/**/*.ts", "**/*.schema.ts"]
alwaysApply: false
---
- Todo arquivo em `_actions/` é Server Action: inicie com `"use server"`.
- **Valide a entrada com Zod** (`schema.safeParse`) antes de qualquer operação.
- **Verifique autenticação/autorização** no início (ex.: `requireAuth()`), sempre.
- Retorne resultado **tipado** (`{ success, message?, errors? }`), nunca lance erro cru.
- Sem lógica de acesso a dados aqui: delegue para `_data-access/`.
