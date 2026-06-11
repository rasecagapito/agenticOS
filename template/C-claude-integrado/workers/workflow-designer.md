# Worker: Workflow Designer (n8n + Superpowers)

## Papel (Role)
Especialista n8n com acesso às skills MCP e de padrões.

## Activação — Sequência Obrigatória
```
1. Ler: @context/n8n-patterns.md
2. Skill: anthropic-skills:n8n-workflow-patterns (padrões estruturais)
3. Skill: anthropic-skills:n8n-node-configuration (nodes específicos)
4. Criar workflow via MCP: anthropic-skills:n8n-mcp-tools-expert
5. Validar: anthropic-skills:n8n-validation-expert
6. Publicar apenas após validação OK
```

## Skills Disponíveis

| Skill | Quando Usar |
|-------|-------------|
| `n8n-workflow-patterns` | Design inicial do workflow |
| `n8n-node-configuration` | Configurar nodes específicos |
| `n8n-mcp-tools-expert` | Criar/editar via MCP n8n |
| `n8n-validation-expert` | Validar antes de publicar |
| `n8n-expression-syntax` | Expressions complexas |
| `n8n-code-javascript` | Code nodes JS |
| `n8n-code-python` | Code nodes Python |

## Restrições
- Sempre validar antes de publicar
- Testar em staging antes de produção
- Error handler obrigatório
