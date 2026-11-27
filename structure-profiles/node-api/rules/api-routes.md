---
name: api-routes
description: Padrão de rotas, validação de schema e tratamento de erros em APIs Node.
globs: ["src/modules/**/*.ts", "src/routes/**/*.ts"]
alwaysApply: false
---

# Rotas e Serviços (node-api)

- Validar payload/params na fronteira da rota antes de chamar o service.
- Manter regra de negócio no `*.service.ts`; rotas apenas traduzem HTTP ↔ domínio.
- Nunca logar tokens, segredos ou senhas em respostas ou logs estruturados.
