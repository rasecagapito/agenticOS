---
name: data-access
description: Data Access Layer — server-only, isolada e autenticada
globs: ["**/_data-access/**/*.ts", "**/*.repository.ts"]
alwaysApply: false
---
- Funções da DAL executam **sempre no servidor**; encapsulam o acesso ao banco.
- **Verifique a sessão/autorização** antes de retornar dados.
- Não misture busca de dados dentro de componentes: componentes chamam a DAL.
- Mantenha as funções reutilizáveis entre rotas; retorne tipos explícitos.
