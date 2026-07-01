# Guardrails — Segurança Operacional

## Ações que Requerem Confirmação Humana
- Deletar qualquer arquivo ou pasta
- Publicar conteúdo em plataformas externas
- Acessar APIs pagas (OpenAI, etc.)
- Modificar este arquivo ou evaluation.json
- Enviar emails ou mensagens

## Permissões Automáticas (sem confirmação)
- Ler arquivos em /context, /memory, /workers
- Escrever em /memory/learnings e /memory/history
- Escrever em /projects (entregáveis)
- Executar /wrapup

## Política de Dados
- Não enviar dados de clientes para APIs externas sem autorização
- Não armazenar credenciais em texto simples
- Logs de sessão em /memory/history são privados

## Escalação
Se em dúvida sobre uma ação: **parar e perguntar**.
