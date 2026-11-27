---
name: paridade
description: Exige paridade verificável (diff.json zerado) antes de concluir migrações ou reescritas.
globs: ["paridade/**/*", "tools/**/*"]
alwaysApply: false
---

# Regra de Paridade (Oracle Testing)

- Não declare a migração ou reescrita pronta enquanto `paridade/<alvo>/diff.json` não tiver `total_diferencas === 0` para todos os casos de `casos.csv`.
- Corrija **um grupo de diferenças por vez** de `diff.json` e reexecute o comparador após cada ajuste.
- Nunca edite, remova ou enfraqueça casos de `casos.csv` para zerar o diff sem aprovação explícita do usuário.
