---
name: agentic-os
description: |
  Configura e gere um Agentic OS — metodologia de organização de ficheiros para agentes IA operarem com memória persistente, contexto modular e workers especializados entre sessões.

  Usar SEMPRE quando o utilizador mencionar:
  - "agentic os", "sistema agêntico", "montar agentic os"
  - "analisar projeto" para ver se segue padrão de agente
  - "adaptar projeto" ao padrão de agente
  - "memória persistente entre sessões", "contexto modular"
  - "workers", "subagentes especializados" para projeto
  - "estrutura de pastas para agente IA"
  - Quer inicializar novo projeto com estrutura de agente

  Dois modos: ANALISAR projeto existente (gap analysis + adaptação) ou INICIALIZAR novo projeto do zero.
---

# Agentic OS

Metodologia de organização de ficheiros (não software) que permite a um agente IA operar com autonomia entre sessões. Elimina cold start, optimiza tokens, e constrói memória persistente.

## Determinar Modo

Antes de qualquer acção, identificar qual dos dois modos se aplica:

**MODO A — Analisar projeto existente**: utilizador tem projeto com código/ficheiros e quer verificar/adaptar ao padrão.
**MODO B — Inicializar novo projeto**: pasta nova ou vazia, montar estrutura do zero.

Se não for claro, perguntar: "Queres que eu analise um projeto existente ou montar a estrutura num projeto novo?"

---

## MODO A: Analisar e Adaptar Projeto Existente

### Regra de Ouro
**Só criar. Nunca mover, renomear ou deletar ficheiros existentes.**
O projeto continua a funcionar exactamente igual — adicionamos camadas em cima do que existe.

### Passo 1: Explorar estrutura

Listar ficheiros e pastas na raiz do projeto. Procurar:
- `CLAUDE.md` ou `ai.md` — orquestrador
- `/context/` — base de conhecimento modular
- `/memory/` com `/learnings/` e `/history/` — persistência
- `/workers/` — especialistas com role/função/schema
- `/automation/` com `evaluation.json` e `guardrails.md`
- Equivalentes funcionais: `checkpoint/`, `LICOES.md`, `PROD.md`, `AGENTS.md`, etc.
- Módulos de código separados (ex: `src/auth/`, `src/billing/`) — se existirem, considerar
  organização modular do `context/` (uma subpasta por módulo). Ver `docs/CHANGE-WORKFLOW.md`.

### Passo 2: Gap Analysis

Apresentar tabela com 5 camadas vs estado real:

| Camada | Agentic OS | Projeto | Estado |
|--------|-----------|---------|--------|
| Identity (CLAUDE.md) | 100-200 linhas, orquestrador | [o que existe] | ✅/⚠️/❌ |
| Knowledge (/context) | Módulos .md por tema | [o que existe] | ✅/⚠️/❌ |
| Memory (/memory) | /learnings + /history | [o que existe] | ✅/⚠️/❌ |
| Workers (/workers) | Role + Função + Schema | [o que existe] | ✅/⚠️/❌ |
| Automation (/automation) | evaluation.json + guardrails | [o que existe] | ✅/⚠️/❌ |

Legenda: ✅ completo | ⚠️ existe mas diferente | ❌ ausente

### Passo 3: Identificar equivalentes funcionais

Antes de criar, verificar se conteúdo já existe noutro formato:
- `PROD.md` enorme → extrair módulos para `/context/`
- `LICOES.md` → equivale a `/memory/learnings/`
- `checkpoint/` → equivale a `/memory/history/`
- `AGENTS.md` → verificar se define workers com role/função/schema

Conteúdo que já existe mas está disperso → criar ficheiros em `/context/` que **referenciam** os originais com `@` (não duplicar).

### Passo 4: Criar o que falta

Confirmar com utilizador antes de executar: "Vou criar X ficheiros novos. Nenhum ficheiro existente será tocado. Posso avançar?"

Criar apenas:
1. Pastas em falta (`/context/`, `/memory/learnings/`, `/memory/history/`, `/workers/`, `/automation/`)
2. Módulos `/context/` — resumo do conhecimento existente, com `@` para fonte original
3. `/workers/` — um ficheiro por especialista (ver formato abaixo)
4. `/automation/evaluation.json` — gates de qualidade
5. `/automation/guardrails.md` — acções que requerem confirmação
6. `/.claude/commands/` — slash commands (wrapup, status, worker)
6b. `/changes/` e `/changes/archive/` — pasta de mudanças estruturadas
6c. `/.claude/commands/propose.md` — comando /propose
7. Actualizar `/.claude/settings.json` ou `settings.local.json` — Stop hook
8. `AGENTIC-OS.md` na raiz — referência rápida do sistema

### Passo 5: Reorganização brownfield (opcional, via mudança aprovada)

A Regra de Ouro ("só criar") mantém-se como default. Reorganizar um projeto existente
(arrumar pastas, consolidar docs, agrupar redundâncias) só acontece **dentro de uma mudança
aprovada**, nunca silenciosamente:

1. `/propose reorganize-<alvo>` → scan **read-only** + plano de movimentos em `tasks.md`.
2. Humano aprova o plano (todo ou item a item).
3. `/worker` executa só os itens aprovados.

**Regras invioláveis** (ver `docs/CHANGE-WORKFLOW.md`):
- Nunca deletar — redundantes vão para `_quarantine/` ou `docs/archive/`.
- Nunca mover código sem verificar referências (imports/links).
- Exigir working tree git limpo antes de mover.
- Registar movimentos em `changes/reorganize-<alvo>/MOVES.md` para rollback.
- Dry-run por defeito; em dúvida → parar e perguntar.

---

## MODO B: Inicializar Novo Projeto

### Estrutura a criar

```
/
├── CLAUDE.md                    # Orquestrador (100-200 linhas)
├── AGENTIC-OS.md               # Referência rápida do sistema
├── .claude/
│   ├── settings.json           # Permissões + Stop hook
│   └── commands/
│       ├── propose.md          # /propose
│       ├── wrapup.md           # /wrapup
│       ├── status.md           # /status
│       └── worker.md           # /worker [nome]
├── context/                    # Conhecimento modular
│   ├── produto.md
│   ├── arquitetura.md
│   ├── stack.md
│   └── [outros módulos]
├── memory/
│   ├── learnings/              # Aprendizados consolidados
│   └── history/                # Logs de sessão
├── workers/                    # Especialistas
│   └── [worker].md
├── automation/
│   ├── evaluation.json
│   └── guardrails.md
├── changes/                    # Mudanças estruturadas
│   └── archive/                # Mudanças fechadas
└── projects/                   # Entregáveis finais
```

**Variante modular (projetos com vários módulos de código):** `context/` pode usar subpastas
por módulo em vez de ficheiros soltos:

```
context/
├── _global.md           # stack + convenções partilhadas
├── auth/                # 1 pasta por módulo
│   ├── produto.md
│   └── arquitetura.md
└── billing/
    └── produto.md
```

Neste caso, as mudanças são prefixadas (`changes/<modulo>-<feature>/`) e cada `proposal.md`
declara `## Módulo: <nome>`. Ver `docs/CHANGE-WORKFLOW.md` secção "Módulos / Domínios".
É opt-in — projetos pequenos mantêm `context/` flat.

### Fase de descoberta (antes de criar ficheiros)

Perguntar ao utilizador (uma de cada vez se necessário):
1. Qual o tipo de projeto? (SaaS / n8n / conteúdo / consultoria / outro)
2. Qual o stack tecnológico principal?
3. Quem são os utilizadores/audiência?
4. Qual o objectivo principal do agente neste projecto?

Usar as respostas para popular os ficheiros com conteúdo real — não placeholders genéricos.

---

## Formatos de Ficheiro

### CLAUDE.md (orquestrador)
```markdown
# Agente: [NOME DO PROJETO]
> Orquestrador Central — manter entre 100-200 linhas

## Identidade
- **Projeto**: [nome]
- **Stack**: [tecnologias]
- **Fase**: [MVP/BETA/PRODUÇÃO]

## Módulos de Conhecimento
- @context/produto.md
- @context/arquitetura.md
- [outros conforme necessário]

## Workers Disponíveis
- **[Nome]** (@workers/[ficheiro].md) — [função em 1 linha]

## Regras Operacionais
1. Consultar /context antes de responder sobre negócio
2. Consultar /memory/learnings antes de investigar bug
3. Nunca deletar ficheiros sem confirmação
4. Ao final de sessão: /wrapup

## Comandos
| Comando | Ação |
|---------|------|
| /wrapup | Consolidar sessão |
| /status  | Estado atual do projeto |
| /worker [nome] | Activar especialista |

## Estado do Projeto
- **Fase**: [fase]
- **Última sessão**: [data]
- **Próximo passo**: [acção]
```

### Worker (formato obrigatório)
```markdown
# Worker: [Nome]

## Papel (Role)
[Descrição em 1 linha do especialista]

## Função Operacional
- [O que faz — lista de responsabilidades]

## Contexto a Carregar
- @context/[ficheiro relevante].md

## Esquema de Saída (Output Schema)
```json
{
  "campo_obrigatorio": "string",
  "outro_campo": "boolean"
}
```

## Restrições
- [O que nunca fazer]
```

### evaluation.json
```json
{
  "version": "1.0",
  "gates": {
    "deploy_producao": [
      "code review sem findings críticos",
      "testado em staging",
      "CLAUDE.md actualizado"
    ]
  },
  "schemas_output": {
    "[worker_nome]": ["campo1", "campo2"]
  }
}
```

### guardrails.md
Incluir sempre:
- Acções que requerem confirmação humana (deletar, deploy produção, APIs pagas)
- Acções automáticas permitidas (ler, escrever em /memory e /projects)
- Escalação: "Em dúvida → parar e perguntar"

---

## Slash Commands

### /.claude/commands/propose.md
Instruções para Claude:
1. Determinar nome kebab-case (clarificar se ambíguo).
2. Verificar ponte de brainstorming em `docs/superpowers/specs/` — se há spec do tema, pré-preencher artefatos (referenciar, não duplicar).
3. Criar `changes/<nome>/` com `proposal.md` + `tasks.md` (+ `design.md` se não-trivial).
- **Projeto modular**: se `context/` tem subpastas, detetar projeto modular. Se o nome da
  mudança não começa por um módulo conhecido, perguntar qual módulo. Prefixar o nome
  (`<modulo>-<feature>`) e incluir `## Módulo: <nome>` no `proposal.md`.
4. Caso `reorganize-*`: scan read-only + plano de movimentos com regras de segurança.
5. Confirmar com nome da mudança e próximos passos.
6. Sem argumento: listar mudanças ativas em `changes/`.

Ver `docs/CHANGE-WORKFLOW.md` para o ciclo completo.

### /.claude/commands/wrapup.md
Instruções para Claude:
1. Obter hora real do sistema
2. Ler ficheiros alterados na sessão (git diff ou equivalente)
3. Criar registo em `memory/history/YYYY-MM-DD-HH-sessao.md` com: data, resumo, ficheiros, decisões, pendências
4. Registar aprendizados novos em `memory/learnings/YYYY-MM-DD-tema.md`
5. Actualizar CLAUDE.md secção "Estado do Projeto"
6. Confirmar ao utilizador com nome do ficheiro criado

### /.claude/commands/status.md
Instruções para Claude:
1. Branch atual (git) se aplicável
2. Ficheiro mais recente em `memory/history/` — resumo e próximos passos
3. Estado de features do projeto (de context/produto.md ou equivalente)
4. Top 3 pendências
5. Apresentar em tabela compacta

### /.claude/commands/worker.md
Instruções para Claude:
1. Identificar worker pelo argumento do comando
2. Ler ficheiro do worker em `/workers/`
3. Carregar contexto listado na secção "Contexto a Carregar"
4. Confirmar activação com lista de contexto carregado
5. Seguir processo e restrições do worker pelo resto da sessão
6. Se sem argumento: listar workers disponíveis com descrição de 1 linha

---

## Stop Hook (settings.json)

Adicionar ao `.claude/settings.json` ou `settings.local.json` (preservar permissões existentes):

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "shell": "powershell",
            "command": "$date = Get-Date; $fileName = $date.ToString('yyyy-MM-dd-HH') + '-sessao.md'; $content = '# Sessao ' + $date.ToString('yyyy-MM-dd HH:mm') + \"`n`nSessao encerrada automaticamente.`nExecutar /wrapup para consolidar aprendizados.\"; $dir = Join-Path $PSScriptRoot '../memory/history'; if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }; Set-Content -Path (Join-Path $dir $fileName) -Value $content -Encoding UTF8"
          }
        ]
      }
    ]
  }
}
```

**Explicar ao utilizador** o que o hook faz antes de adicionar — requer confirmação explícita por ser modificação de settings.

---

## AGENTIC-OS.md (referência rápida)

Criar na raiz do projeto com:
- Tabela de estrutura com estado ✅ de cada peça
- Tabela de comandos disponíveis com descrição de 1 linha
- Ciclo de uso em formato de lista numerada
- Tabela de módulos /context com conteúdo de cada ficheiro
- Tabela de workers com função e contexto que carregam

---

## Workers Típicos por Tipo de Projeto

### SaaS + n8n
- `developer.md` — implementação frontend/backend/BD
- `workflow-designer.md` — automações n8n, WhatsApp, Telegram
- `arquiteto.md` — decisões técnicas, migrations, risco
- `qa.md` — revisão, segurança, RLS, testes

### Conteúdo / Marketing
- `roteirista.md` — estrutura narrativa, ganchos, CTAs
- `pesquisador.md` — pesquisa externa, validação de factos
- `analista.md` — métricas, padrões, recomendações

### Consultoria / Projecto de Cliente
- `consultor.md` — análise, recomendações, relatórios
- `gestor.md` — milestones, riscos, comunicação cliente
- `documentador.md` — specs, entregáveis, documentação técnica

Adaptar ao contexto real do projeto — não forçar workers que não fazem sentido.

---

## Ciclo de Operação (explicar ao utilizador no final)

```
1. Abrir Claude Code na pasta → CLAUDE.md carrega automático
2. "vamos começar" → Claude lê memory/history + estado do projeto
3. /propose [nome] → cria a mudança estruturada (proposal + tasks)
4. /worker [nome] → executa a mudança ativa com contexto carregado
5. /wrapup → arquiva mudança + delta em context/ + learnings
6. Fechar Claude Code → Stop hook grava lembrete automático
```

Memory/learnings cresce com o tempo via /wrapup.
Context/ e workers/ actualizados manualmente quando projecto evolui.
CLAUDE.md mantém-se estável — é as regras, não a memória.

Em projetos modulares, as mudanças são prefixadas pelo módulo (`auth-add-2fa`) e o delta do
`/wrapup` mira `context/<modulo>/`. Ver `docs/CHANGE-WORKFLOW.md`.
