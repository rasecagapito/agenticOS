# Schema de Base de Dados

## Tabelas Principais

### users
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
email       text UNIQUE NOT NULL
name        text
plan        text DEFAULT 'free'  -- free | pro | enterprise
created_at  timestamptz DEFAULT now()
updated_at  timestamptz DEFAULT now()
```

### [TABELA 2]
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id     uuid REFERENCES users(id) ON DELETE CASCADE
-- adicionar campos aqui
created_at  timestamptz DEFAULT now()
```

## Convenções
- IDs: UUID v4 (`gen_random_uuid()`)
- Timestamps: `timestamptz` com `DEFAULT now()`
- Soft delete: coluna `deleted_at timestamptz NULL`
- Foreign keys: sempre com `ON DELETE CASCADE` ou `RESTRICT` explícito

## Row Level Security (RLS)
- RLS ativo em todas as tabelas com dados de usuários
- Policy padrão: usuário acessa apenas aos seus próprios registros

```sql
-- Template de policy RLS
CREATE POLICY "user_own_data" ON [tabela]
  FOR ALL USING (auth.uid() = user_id);
```

## Migrations
- Localização: `/supabase/migrations/`
- Naming: `YYYYMMDDHHMMSS_descricao.sql`
- Nunca alterar migrations já aplicadas em produção

## Índices Importantes
```sql
-- Adicionar conforme necessário
CREATE INDEX ON [tabela] ([coluna]);
```
