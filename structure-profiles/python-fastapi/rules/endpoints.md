---
name: endpoints
description: Padrão de routers FastAPI, schemas Pydantic e isolamento de camada de serviço.
globs: ["app/**/*.py"]
alwaysApply: false
---

# Endpoints FastAPI (python-fastapi)

- Tipar entradas e saídas com Pydantic (`schemas.py`) em todo endpoint.
- Isolar regras de negócio em `service.py` e acesso a dados fora do `router.py`.
- Nunca retornar stack traces internos ou credenciais em respostas HTTP.
