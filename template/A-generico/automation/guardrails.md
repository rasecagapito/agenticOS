# Guardrails — Segurança Operacional

## Ações que Requerem Confirmação Humana
- Deletar qualquer ficheiro ou pasta
- Publicar conteúdo em plataformas externas
- Aceder APIs pagas (OpenAI, etc.)
- Modificar este ficheiro ou evaluation.json
- Enviar emails ou mensagens

## Permissões Automáticas (sem confirmação)
- Ler ficheiros em /context, /memory, /workers
- Escrever em /memory/learnings e /memory/history
- Escrever em /projects (entregáveis)
- Executar /wrapup

## Política de Dados
- Não enviar dados de clientes para APIs externas sem autorização
- Não armazenar credenciais em texto simples
- Logs de sessão em /memory/history são privados

## Escalação
Se em dúvida sobre uma ação: **parar e perguntar**.
