# Guardrails — Claude Code Integrado

## Ações de Alto Impacto (Confirmação Obrigatória)
- Migrations em produção
- Deletar dados de usuários
- Push para main/production
- Ativar workflows n8n em produção
- Modificar `.claude/settings.json`
- Alterar permissões de segurança ou RLS

## Ações Automáticas Permitidas
- Ler qualquer arquivo
- Escrever em /memory, /projects
- Invocar qualquer skill de análise ou revisão
- Criar branches e commits

## Regras de Integração com Superpowers
- Nunca implementar sem brainstorming em tarefas não triviais
- Nunca marcar como done sem `verification-before-completion`
- Sempre executar `/code-review` antes de merge
- Sessão encerrada → `consolidate-memory` + /wrapup

## Política de Produção
- Main branch protegida — só via PR
- Sem `--force` push
- Sem `--no-verify` em commits

## Escalação
Dúvida em decisão irreversível → parar e perguntar.
