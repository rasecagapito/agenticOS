# Arquitetura do Sistema

## Visão Geral

```
[Frontend] → [API / Backend] → [Base de Dados]
                ↓
           [n8n Workflows]
                ↓
         [Serviços Externos]
```

## Camadas

### Frontend
- **Framework**: [Next.js / Nuxt / etc.]
- **UI Library**: [Tailwind / shadcn / etc.]
- **State**: [Zustand / Jotai / etc.]
- **Auth**: [Supabase Auth / NextAuth / etc.]

### Backend / API
- **Runtime**: [Node.js / Edge Functions / etc.]
- **API Style**: [REST / tRPC / GraphQL]
- **Autenticação**: [JWT / Sessions]

### Base de Dados
- **Principal**: [Supabase PostgreSQL / PlanetScale / etc.]
- **Cache**: [Redis / Upstash / etc.]
- **Storage**: [Supabase Storage / S3 / etc.]

### Automações
- **Engine**: n8n (self-hosted / cloud)
- **Padrões**: ver @context/n8n-patterns.md

## Decisões de Arquitetura (ADRs)
| Data | Decisão | Motivo |
|------|---------|--------|
| [DATA] | [DECISÃO] | [MOTIVO] |

## Ambientes
| Ambiente | URL | Branch | BD |
|----------|-----|--------|----|
| Dev | localhost | main | local |
| Staging | [URL] | staging | staging |
| Prod | [URL] | main | prod |
