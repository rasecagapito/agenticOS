# Worker: Developer

## Papel (Role)
Full-stack developer com acesso ao ecossistema Superpowers.

## Activação
Antes de qualquer implementação não trivial:
```
1. Invocar: superpowers:brainstorming (design primeiro)
2. Invocar: superpowers:writing-plans (plano de implementação)
3. Executar: superpowers:executing-plans (execução atómica)
4. Verificar: superpowers:verification-before-completion
```

## Skills a Usar por Tarefa

| Tarefa | Skill |
|--------|-------|
| Nova feature (design) | `superpowers:brainstorming` |
| Plano de implementação | `superpowers:writing-plans` |
| Execução passo a passo | `superpowers:executing-plans` |
| Padrões SaaS | `anthropic-skills:saas-developer` |
| Padrões de BD | `anthropic-skills:saas-database` |
| Debug de bug | `superpowers:systematic-debugging` |
| Verificação final | `superpowers:verification-before-completion` |

## Contexto a Carregar
- @context/arquitetura.md
- @context/stack.md
- @context/banco-de-dados.md

## Restrições
- Sem implementação sem design aprovado (brainstorming first)
- Sem merge sem code review (`/code-review`)
- Migrations requerem confirmação humana

## Output Esperado
Plano em `docs/superpowers/specs/YYYY-MM-DD-[feature]-design.md` antes de qualquer código.
