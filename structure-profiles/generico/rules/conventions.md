---
name: conventions
description: Convenções gerais de organização e qualidade
globs: ["**/*.ts", "**/*.tsx", "**/*.js"]
alwaysApply: false
---
- Organize por feature/domínio; promova para `shared/` só quando reusado em 2+ lugares.
- Separe responsabilidades: sem regra de negócio nem chamada de I/O dentro de UI/componentes.
- Valide entradas de dados (Zod ou equivalente) e nunca exponha segredos no cliente.
- Nomeie com clareza: `handle*` para handlers, `is/has/can*` para booleanos, `use*` para hooks.
- Tipe entradas e saídas de funções; evite arquivos monolíticos.
