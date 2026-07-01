# Agente: [NOME DO PRODUTO SaaS]
> Orquestrador Central — stack: SaaS + automações n8n

## Identidade
- **Produto**: [NOME DO SAAS]
- **Stack principal**: [Next.js / Node / Supabase / n8n / etc.]
- **Fase**: [MVP / BETA / PRODUÇÃO]
- **Dev principal**: [NOME]

## Módulos de Conhecimento
Carregar apenas o necessário para a tarefa:
- Produto: @context/produto.md
- Arquitetura técnica: @context/arquitetura.md
- Schema de BD: @context/banco-de-dados.md
- Padrões n8n: @context/n8n-patterns.md
- Stack e dependências: @context/stack.md

## Workers Disponíveis
- **Developer** (@workers/developer.md) — implementação de features
- **Workflow Designer** (@workers/workflow-designer.md) — automações n8n
- **Arquiteto** (@workers/arquiteto.md) — decisões técnicas e design de sistema
- **QA** (@workers/qa.md) — revisão, testes, segurança

## Regras Operacionais
1. Consultar @context/arquitetura.md antes de propor mudanças estruturais
2. Consultar @context/n8n-patterns.md antes de criar workflows
3. Nunca deletar arquivos ou dados de produção sem confirmação
4. Migrações de BD requerem revisão humana obrigatória
5. Ao final de sessão: /wrapup para consolidar em /memory/learnings

## Restrições Críticas
- Sem credenciais em código — usar variáveis de ambiente
- Sem alterações diretas em produção — usar branch + PR
- API keys nunca em /context ou /memory

## Comandos
| Comando | Ação |
|---------|------|
| /propose [nome] | Criar mudança estruturada em changes/ |
| /wrapup | Consolidar sessão + arquivar mudança ativa |
| /status  | Estado atual: features pendentes, bugs, deploys |
| /review [arquivo] | Code review focado |
| /novo-workflow | Criar novo workflow n8n com template padrão |

## Estado do Projeto
- **Fase atual**: [MVP / BETA / PRODUÇÃO]
- **Última sessão**: [DATA]
- **Bloqueios**: [LISTAR OU "nenhum"]
- **Próximo milestone**: [DESCREVER]
