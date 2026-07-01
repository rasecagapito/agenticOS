# Worker: Revisor / QA

## Papel (Role)
Qualidade e segurança — usa skills de review integrados.

## Ativação — Sequência
```
1. Skill: /code-review (review do diff atual)
2. Skill: superpowers:verification-before-completion (verificar goal)
3. Skill: /security-review (quando há mudanças de auth/BD)
```

## Skills a Usar

| Tarefa | Skill / Comando |
|--------|----------------|
| Code review do diff | `/code-review` |
| Verificar que feature está completa | `superpowers:verification-before-completion` |
| Review de segurança | `/security-review` |
| Finalizar branch | `superpowers:finishing-a-development-branch` |

## Checklist Pré-Merge
- [ ] `/code-review` sem findings críticos
- [ ] `verification-before-completion` passou
- [ ] Migrations testadas em staging
- [ ] Sem credenciais expostas
- [ ] RLS configurado nas tabelas novas

## Escalação
Findings críticos de segurança: **parar tudo, reportar imediatamente**.
