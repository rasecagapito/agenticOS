# Stack Tecnológica

## Dependências Principais

### Frontend
```json
{
  "framework": "[next / nuxt]@[versão]",
  "ui": "[tailwindcss / shadcn-ui]@[versão]",
  "state": "[zustand / jotai]@[versão]",
  "forms": "[react-hook-form / zod]@[versão]"
}
```

### Backend / API
```json
{
  "runtime": "[Node.js v20 / Bun]",
  "api": "[tRPC / Hono / Express]@[versão]",
  "auth": "[supabase-js]@[versão]",
  "email": "[resend / nodemailer]@[versão]"
}
```

### Infraestrutura
| Serviço | Provider | Plano |
|---------|----------|-------|
| BD | Supabase | [Free/Pro] |
| Deploy Frontend | Vercel | [Hobby/Pro] |
| Deploy API | [Railway/Fly.io] | [PLANO] |
| Automações | n8n | [Self-hosted/Cloud] |
| Email | Resend | [PLANO] |
| Monitorização | [Sentry/Axiom] | [PLANO] |

## Variáveis de Ambiente

### Obrigatórias
```env
# Base de dados
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# n8n
N8N_WEBHOOK_URL=
N8N_API_KEY=
```

## Scripts Disponíveis
```bash
npm run dev          # desenvolvimento local
npm run build        # build produção
npm run db:migrate   # aplicar migrations
npm run db:studio    # abrir Supabase Studio
```
