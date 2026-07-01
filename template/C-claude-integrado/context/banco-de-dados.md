# Schema BD — ver Template B para referência completa

## Tabelas
```sql
-- Definir tabelas aqui
-- Seguir convenções: UUID, timestamptz, RLS ativo
```

## Convenções
- IDs: UUID via `gen_random_uuid()`
- Timestamps: `timestamptz DEFAULT now()`
- RLS: ativo em todas as tabelas de usuários
