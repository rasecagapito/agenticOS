# Agente: [NOME DO PROJETO]
> Orquestrador Central — integrado com Claude Code Superpowers

## Identidade
- **Produto**: [NOME]
- **Stack**: [STACK PRINCIPAL]
- **Dev**: [NOME]

## Módulos de Conhecimento
- Produto: @context/produto.md
- Arquitetura: @context/arquitetura.md
- Schema BD: @context/banco-de-dados.md
- Padrões n8n: @context/n8n-patterns.md
- Stack: @context/stack.md

## Skills Disponíveis (Claude Code Superpowers)

### Planejamento e Design
- `/gsd-plan-phase` — planejar fase de implementação
- `/gsd-new-project` — criar roadmap de novo projeto
- `superpowers:brainstorming` — explorar ideias antes de implementar
- `superpowers:writing-plans` — escrever plano de implementação

### Implementação
- `superpowers:executing-plans` — executar planos passo a passo
- `superpowers:test-driven-development` — TDD quando aplicável
- `anthropic-skills:saas-developer` — padrões SaaS
- `anthropic-skills:saas-database` — padrões de BD

### Qualidade e Revisão
- `/code-review` — revisão de código do diff atual
- `superpowers:verification-before-completion` — verificar antes de marcar como done
- `superpowers:systematic-debugging` — debug estruturado

### n8n
- `anthropic-skills:n8n-mcp-tools-expert` — uso do MCP n8n
- `anthropic-skills:n8n-workflow-patterns` — padrões de workflow
- `anthropic-skills:n8n-node-configuration` — configuração de nodes

### Memória e Sessão
- `anthropic-skills:consolidate-memory` — consolidar memória da sessão
- `superpowers:finishing-a-development-branch` — finalizar branch

## Workers Disponíveis
- **Developer** (@workers/developer.md) → usa `saas-developer` + `executing-plans`
- **Workflow Designer** (@workers/workflow-designer.md) → usa skills n8n
- **Arquiteto** (@workers/arquiteto.md) → usa `brainstorming` + `writing-plans`
- **Revisor** (@workers/revisor.md) → usa `/code-review` + `verification-before-completion`

## Regras Operacionais
1. Verificar skills disponíveis antes de implementar — não reinventar o que já existe
2. Usar `brainstorming` antes de qualquer implementação não trivial
3. Usar `verification-before-completion` antes de marcar tarefa como concluída
4. Consultar @context/arquitetura.md antes de mudanças estruturais
5. Fin de sessão: `consolidate-memory` → /wrapup

## Comandos
| Comando | Ação |
|---------|------|
| /propose [nome] | Criar mudança estruturada em changes/ |
| /wrapup | Consolidar sessão + arquivar mudança ativa |
| /status  | Estado: features, bugs, próximo passo |
| /review  | Code review do diff atual |
| /plan [feature] | Planejar implementação de feature |

## Estado do Projeto
- **Fase**: [MVP / BETA / PRODUÇÃO]
- **Última sessão**: [DATA]
- **Próximo passo**: [AÇÃO]
