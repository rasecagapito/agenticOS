---
name: component
description: Componentes React — server-first, colocação e naming
globs: ["**/*.tsx"]
alwaysApply: false
---
- Padrão é **Server Component**. Só use `"use client"` quando houver estado, efeito,
  event handler ou API de browser. Na dúvida, comece server e refatore.
- Componente usado só nesta rota → `app/<rota>/_components`. Reusado em 2+ →
  promova para `components/shared` (ou `packages/ui`).
- Nomeie handlers com `handle*` (handleClick), booleanos com `is/has/can*`
  (isLoading), hooks com `use*` (useForm).
- Componente de UI é apresentacional: sem chamada de API nem regra de negócio dentro.
- Sem componentes monolíticos; sem estilo inline (use Tailwind/CSS modular).
