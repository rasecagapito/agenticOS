# Perfil de Estrutura: generico

Fallback para qualquer projeto (inclusive não-Next). Organização por feature, leve e opt-in.
Garante que todo projeto implantado receba pelo menos o Tier 0 (convenções + cérebro).

## Árvore-alvo (flexível)
```
src/
  <feature>/        # uma pasta por feature/domínio
  shared/           # utilitários e componentes compartilhados
  lib/              # clients e configuração
docs/
```

## Cérebro
- `AGENTS.md` canônico na raiz + ponteiros `CLAUDE.md` (@import) e `GEMINI.md`.
