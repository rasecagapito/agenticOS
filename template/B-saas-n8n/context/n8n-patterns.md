# Padrões n8n — Guia de Workflow Design

## Estrutura Padrão de Workflow

```
Trigger → Validate Input → Process → Error Handler → Output
```

## Convenções de Nomenclatura
- **Workflows**: `[domínio]_[ação]_[frequência]`
  - Ex: `users_welcome_email_trigger`, `billing_invoice_monthly`
- **Nodes**: Verbo + Objeto em PascalCase
  - Ex: `FetchUserData`, `SendSlackAlert`, `UpdateDatabase`

## Patterns Obrigatórios

### Error Handling
Todo workflow deve ter um node de erro conectado ao início:
```
Trigger → [Lógica principal]
              ↓ (on error)
         [Error Handler] → Slack Alert / Log
```

### Idempotência
- Verificar se registo já existe antes de criar
- Usar `upsert` em vez de `insert` quando possível
- Workflows com webhook: validar `execution_id` para evitar duplicados

### Variáveis de Ambiente
- Nunca hardcode de credenciais ou URLs
- Usar n8n Credentials para serviços externos
- Configurações de ambiente via `$env.VARIAVEL`

## Tipos de Trigger Comuns

| Trigger | Caso de Uso |
|---------|-------------|
| Webhook | Eventos de terceiros (Stripe, GitHub) |
| Schedule | Jobs periódicos (relatórios, sync) |
| n8n Form | Input manual com validação |
| Database | Mudanças em tabelas Supabase |

## Integração com Supabase
```javascript
// Node: Supabase — padrão de query
{
  "operation": "select",
  "table": "users",
  "filters": [{ "field": "id", "value": "={{ $json.user_id }}" }]
}
```

## Limites e Performance
- Timeout máximo por execução: 30s (cloud) / configurável (self-hosted)
- Dados grandes: usar streaming ou paginação
- Paralelismo: usar "Split In Batches" para listas > 100 itens
