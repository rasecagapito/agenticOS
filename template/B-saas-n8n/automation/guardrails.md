# Guardrails — SaaS + n8n

## Ações de Alto Impacto (Confirmação Obrigatória)
- Executar migrations em produção
- Deletar dados de utilizadores
- Alterar schema de tabelas existentes
- Ativar workflows n8n em produção
- Alterar configurações de RLS
- Modificar variáveis de ambiente de produção
- Remover dependências do package.json

## Ações Automáticas Permitidas
- Ler qualquer ficheiro do projeto
- Escrever código em desenvolvimento
- Criar migrations (não aplicar)
- Criar/editar workflows n8n em staging
- Escrever em /memory/learnings e /memory/history
- Escrever entregáveis em /projects

## Regras de Segurança
- Credenciais: sempre via variáveis de ambiente, nunca em código
- RLS: obrigatório em tabelas com dados de utilizadores
- Webhooks n8n: validar assinatura HMAC quando disponível
- Logs: nunca incluir dados sensíveis (passwords, tokens, PII)

## Política de Produção
- Toda mudança: branch → PR → review → merge
- Sem hotfixes diretos em main/production
- Migrations: sempre testar rollback antes de aplicar

## Escalação
Se em dúvida: **parar, documentar a dúvida, perguntar**.
Melhor pergunta desnecessária do que acção irreversível.
