# Spec: Suporte a Módulos / Domínios no Agentic OS

**Data**: 2026-06-11
**Estado**: Aprovado para planejamento
**Depende de**: [Change Workflow](2026-06-11-change-workflow-design.md)
**Inspiração**: conceito "Domain" do OpenSpec

---

## Problema

O Agentic OS é **flat**: `context/` tem arquivos soltos por tema, `changes/` é plano.
Projetos com vários módulos de código (auth, billing, pagamentos…) misturam conhecimento
num só nível — carregam contexto irrelevante (desperdício de tokens) e perdem isolamento.

## Objetivo

Formalizar um padrão **opcional** de organização por módulo/domínio, sem quebrar o modo
flat (projetos pequenos continuam simples). Brownfield: nada existente é forçado a migrar.

## Não-objetivos (YAGNI)

- NÃO tornar módulos obrigatórios — flat continua o default para projetos simples.
- NÃO criar Agentic OS aninhado por módulo (sem `modules/<x>/{context,changes}` completo).
- NÃO migrar automaticamente templates existentes para modular.
- Workers permanecem globais (não há worker por módulo).

---

## Design

### Estrutura modular (opcional)

```
context/
├── _global.md           # stack + convenções compartilhadas por todos os módulos
├── auth/
│   ├── produto.md        # o que o módulo faz
│   └── arquitetura.md    # como funciona
└── billing/
    └── produto.md

changes/
├── auth-add-2fa/         # nome PREFIXADO com o módulo
│   ├── proposal.md       # campo "Módulo: auth"
│   └── tasks.md
└── billing-add-invoices/

workers/                  # globais — worker lê só o context/<modulo>/ relevante
```

### Regras por peça

| Peça | Regra modular |
|------|---------------|
| `context/<modulo>/` | 1 subpasta por módulo. Conhecimento isolado. `_global.md` para o compartilhado. |
| `changes/<modulo>-<feature>/` | Nome prefixado pelo módulo. `proposal.md` tem linha `## Módulo: <nome>`. |
| Delta no `/wrapup` | Sugestões de update miram `context/<modulo>/` do módulo declarado na mudança. |
| `workers/` | Globais. Worker carrega só `context/_global.md` + `context/<modulo>/` da tarefa. |
| `CLAUDE.md` | Lista módulos: `@context/auth/`, `@context/billing/`. Carrega só o módulo ativo. |

### Detecção flat vs modular

- Se `context/` tem subpastas → projeto modular. Comandos aplicam regras de módulo.
- Se `context/` só tem arquivos `.md` soltos → projeto flat. Comportamento atual, inalterado.
- `/propose` detecta: se modular e o nome não tem prefixo de módulo conhecido, pergunta qual módulo.

### Exemplo: `/propose add-2fa` num projeto modular

```
/propose add-2fa
→ detecta projeto modular (context/auth/, context/billing/ existem)
→ pergunta: "Que módulo? [auth/billing/novo]"  (usuário: auth)
→ cria changes/auth-add-2fa/ com proposal.md contendo "## Módulo: auth"
```

No `/wrapup`, o delta sugere updates só em `context/auth/`.

---

## Alterações no plugin

| Alvo | Alteração |
|------|-----------|
| `docs/CHANGE-WORKFLOW.md` | Nova seção "Módulos / Domínios": estrutura, regras, detecção, exemplo |
| `skills/agentic-os/SKILL.md` | MODO B: opção modular na estrutura. MODO A: detectar módulos existentes. `/propose`: detecção + prefixo + campo Módulo. Ciclo: nota de módulo |
| `template/{A,B,C}/.claude/commands/propose.md` | Passo: detectar projeto modular → perguntar módulo → prefixar nome → declarar `## Módulo:` na proposal |
| `template/{A,B,C}/.claude/commands/wrapup.md` | Delta mira `context/<modulo>/` quando a mudança declara módulo |

(Templates `context/` NÃO são reestruturados — modular é opt-in documentado.)

## Critérios de sucesso

1. `docs/CHANGE-WORKFLOW.md` explica o padrão modular com exemplo `auth-add-2fa`.
2. Num projeto com subpastas em `context/`, `/propose` detecta modular e pergunta/prefixa o módulo.
3. `proposal.md` de uma mudança modular contém `## Módulo: <nome>`.
4. `/wrapup` mira deltas em `context/<modulo>/` do módulo declarado.
5. Projetos flat (sem subpastas) mantêm comportamento atual, sem mudanças.
6. SKILL.md MODO A detecta módulos existentes ao adaptar projeto brownfield.
