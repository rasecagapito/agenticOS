# Padrões n8n
> Ver Template B para guia completo de patterns.

## Regras Base
- Trigger → Validate → Process → Error Handler → Output
- Error handler obrigatório em todos os workflows
- Sem credenciais hardcoded
- Nomenclatura: `domínio_ação_frequência`

## Skills n8n Disponíveis
Invocar via Claude Code antes de criar qualquer workflow:
- `anthropic-skills:n8n-workflow-patterns` — padrões estruturais
- `anthropic-skills:n8n-node-configuration` — config de nodes específicos
- `anthropic-skills:n8n-mcp-tools-expert` — uso das ferramentas MCP n8n
- `anthropic-skills:n8n-validation-expert` — validar workflows antes de publicar
