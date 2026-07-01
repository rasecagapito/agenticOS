---
name: agentic-os
description: |
  Configura e gerencia um Agentic OS — metodologia de organização de arquivos para agentes IA operarem com memória persistente, contexto modular e workers especializados entre sessões.

  Usar SEMPRE quando o usuário mencionar:
  - "agentic os", "sistema agêntico", "montar agentic os"
  - "analisar projeto" para ver se segue padrão de agente
  - "adaptar projeto" ao padrão de agente
  - "memória persistente entre sessões", "contexto modular"
  - "workers", "subagentes especializados" para projeto
  - "estrutura de pastas para agente IA"
  - Quer inicializar novo projeto com estrutura de agente
  - "multi-provedor", "várias IAs", "Claude e Codex juntos", "cérebro compartilhado entre IAs"
  - "continuar de onde o Claude/Codex parou", "handoff entre IAs", "sincronizar IAs"
  - "auditar agentic os", "conformidade", "auto-corrigir estrutura", "loop A/B", "pôr no padrão"

  Dois modos: ANALISAR projeto existente (gap analysis + adaptação) ou INICIALIZAR novo projeto do zero.
  Camada opt-in Multi-Provedor: cérebro compartilhado + handoff para várias IAs (ver docs/MULTI-PROVIDER.md).
  Execução via loop de conformidade auto-corretivo Agente A/B (ver docs/CONFORMANCE-LOOP.md).
---

# Agentic OS

Metodologia de organização de arquivos (não software) que permite a um agente IA operar com autonomia entre sessões. Elimina cold start, otimiza tokens, e constrói memória persistente.

## Determinar Modo

Antes de qualquer ação, identificar qual dos dois modos se aplica:

**MODO A — Analisar projeto existente**: usuário tem projeto com código/arquivos e quer verificar/adaptar ao padrão.
**MODO B — Inicializar novo projeto**: pasta nova ou vazia, montar estrutura do zero.

Se não for claro, perguntar: "Queres que eu analise um projeto existente ou montar a estrutura num projeto novo?"

---

## Loop de Conformidade A/B (modelo de execução)

Ambos os modos correm sob um **loop auto-corretivo** que só termina quando o projeto bate
**exatamente** o padrão de [`docs/CONFORMANCE-SPEC.md`](../../docs/CONFORMANCE-SPEC.md).
Spec completa do loop: [`docs/CONFORMANCE-LOOP.md`](../../docs/CONFORMANCE-LOOP.md).

- **Agente A — Auditor (read-only)**: detecta o modo, compara o estado com a SPEC, classifica cada
  item `CONFORME | FALTA | DRIFT`, marca as correções **estritamente necessárias**, emite o
  *instruction set* e **pede autorização ao humano**.
- **Gate humano**: aprova tudo ou item-a-item. Existente = default conservador (guardrails).
- **Agente B — Executor**: aplica **só** o aprovado, exatamente (sem scope creep).
- **Agente A — Re-auditar**: verifica o resultado real no disco. `PASS` → sucesso. Senão → re-instrui
  B com o delta. Máx. **3 ciclos**, depois escala ao humano.

**Híbrido/portável:** no Claude Code, A e B são **subagentes reais** (A = tipo `Explore` read-only;
B = `general-purpose`). Em Codex/Gemini/outras, **um só agente** faz role-switch A→B→A seguindo
`automation/procedures/conform.md`. No Claude: comando `/conform`.

> Não confundir com o comando `/loop` de um projeto (runner de execução por objetivo). Este loop
> **constrói/adapta o próprio Agentic OS**; o `/loop` executa tarefas dentro de um projeto já montado.

---

## MODO A: Analisar e Adaptar Projeto Existente

### Regra de Ouro
**Só criar. Nunca mover, renomear ou deletar arquivos existentes.**
O projeto continua a funcionar exatamente igual — adicionamos camadas em cima do que existe.

### Passo 1: Explorar estrutura

Listar arquivos e pastas na raiz do projeto. Procurar:
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

Conteúdo que já existe mas está disperso → criar arquivos em `/context/` que **referenciam** os originais com `@` (não duplicar).

### Passo 4: Criar o que falta

Este passo é o **loop A/B**: o gap analysis (Passo 2) é a auditoria do **Agente A**; a confirmação
abaixo é o **gate humano**; a criação é o **Agente B**; e no fim **A re-audita** contra
[`docs/CONFORMANCE-SPEC.md`](../../docs/CONFORMANCE-SPEC.md) até `PASS` (máx. 3 ciclos).

Confirmar com usuário antes de executar: "Vou criar X arquivos novos. Nenhum arquivo existente será tocado. Posso avançar?"

Critério de sucesso (EXISTENTE): itens necessários aplicados, **zero** arquivos pré-existentes
movidos/apagados/renomeados sem aprovação, integridade intacta, poder do plugin presente. Remover um
`DRIFT` (ex.: `commands/` na raiz) só dentro de uma mudança aprovada (Passo 5), nunca em silêncio.

Criar apenas:
1. Pastas em falta (`/context/`, `/memory/learnings/`, `/memory/history/`, `/workers/`, `/automation/`)
2. Módulos `/context/` — resumo do conhecimento existente, com `@` para fonte original
3. `/workers/` — um arquivo por especialista (ver formato abaixo)
4. `/automation/evaluation.json` — gates de qualidade
5. `/automation/guardrails.md` — ações que requerem confirmação
6. `/.claude/commands/` — slash commands (wrapup, status, worker)
6b. `/changes/` e `/changes/archive/` — pasta de mudanças estruturadas
6c. `/.claude/commands/propose.md` — comando /propose
7. Atualizar `/.claude/settings.json` ou `settings.local.json` — Stop hook
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
- Registrar movimentos em `changes/reorganize-<alvo>/MOVES.md` para rollback.
- Dry-run por padrão; em dúvida → parar e perguntar.

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
por módulo em vez de arquivos soltos:

```
context/
├── _global.md           # stack + convenções compartilhadas
├── auth/                # 1 pasta por módulo
│   ├── produto.md
│   └── arquitetura.md
└── billing/
    └── produto.md
```

Neste caso, as mudanças são prefixadas (`changes/<modulo>-<feature>/`) e cada `proposal.md`
declara `## Módulo: <nome>`. Ver `docs/CHANGE-WORKFLOW.md` seção "Módulos / Domínios".
É opt-in — projetos pequenos mantêm `context/` flat.

### Fase de descoberta (antes de criar arquivos)

Perguntar ao usuário (uma de cada vez se necessário):
1. Qual o tipo de projeto? (SaaS / n8n / conteúdo / consultoria / outro)
2. Qual o stack tecnológico principal?
3. Quem são os usuários/audiência?
4. Qual o objetivo principal do agente neste projeto?

Usar as respostas para popular os arquivos com conteúdo real — não placeholders genéricos.

### Gate de conformidade (obrigatório, estrito)

MODO B é determinístico — por isso a barra é alta. Após B criar a estrutura, o **Agente A re-audita**
contra [`docs/CONFORMANCE-SPEC.md`](../../docs/CONFORMANCE-SPEC.md). **Não declarar sucesso** enquanto:
- Camadas base B1–B6 (+ multi-provedor M1–M7 se opt-in) não estiverem **100% `CONFORME`**; e
- Existir **qualquer** violação anti-drift D1–D5 (com destaque para **D1 — sem `commands/` na raiz**
  duplicando `.claude/commands/` + `automation/procedures/`).

Se a re-auditoria falhar, A re-instrui B e repete (máx. 3 ciclos). Só com `PASS` completo o skill
confirma ao usuário que o projeto está no padrão.

---

## Formatos de Arquivo

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
- **[Nome]** (@workers/[arquivo].md) — [função em 1 linha]

## Regras Operacionais
1. Consultar /context antes de responder sobre negócio
2. Consultar /memory/learnings antes de investigar bug
3. Nunca deletar arquivos sem confirmação
4. Ao final de sessão: /wrapup

## Comandos
| Comando | Ação |
|---------|------|
| /wrapup | Consolidar sessão |
| /status  | Estado atual do projeto |
| /worker [nome] | Ativar especialista |

## Estado do Projeto
- **Fase**: [fase]
- **Última sessão**: [data]
- **Próximo passo**: [ação]
```

### Worker (formato obrigatório)
```markdown
# Worker: [Nome]

## Papel (Role)
[Descrição em 1 linha do especialista]

## Função Operacional
- [O que faz — lista de responsabilidades]

## Contexto a Carregar
- @context/[arquivo relevante].md

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
      "CLAUDE.md atualizado"
    ]
  },
  "schemas_output": {
    "[worker_nome]": ["campo1", "campo2"]
  }
}
```

### guardrails.md
Incluir sempre:
- Ações que requerem confirmação humana (deletar, deploy produção, APIs pagas)
- Ações automáticas permitidas (ler, escrever em /memory e /projects)
- Escalação: "Em dúvida → parar e perguntar"

---

## Slash Commands

### /.claude/commands/propose.md
Instruções para Claude:
1. Determinar nome kebab-case (clarificar se ambíguo).
2. Verificar ponte de brainstorming em `docs/superpowers/specs/` — se há spec do tema, pré-preencher artefatos (referenciar, não duplicar).
3. Criar `changes/<nome>/` com `proposal.md` + `tasks.md` (+ `design.md` se não-trivial).
- **Projeto modular**: se `context/` tem subpastas, detectar projeto modular. Se o nome da
  mudança não começa por um módulo conhecido, perguntar qual módulo. Prefixar o nome
  (`<modulo>-<feature>`) e incluir `## Módulo: <nome>` no `proposal.md`.
4. Caso `reorganize-*`: scan read-only + plano de movimentos com regras de segurança.
5. Confirmar com nome da mudança e próximos passos.
6. Sem argumento: listar mudanças ativas em `changes/`.

Ver `docs/CHANGE-WORKFLOW.md` para o ciclo completo.

### /.claude/commands/wrapup.md
Instruções para Claude:
1. Obter hora real do sistema
2. Ler arquivos alterados na sessão (git diff ou equivalente)
3. Criar registro em `memory/history/YYYY-MM-DD-HH-sessao.md` com: data, resumo, arquivos, decisões, pendências
4. Registrar aprendizados novos em `memory/learnings/YYYY-MM-DD-tema.md`
5. Atualizar CLAUDE.md seção "Estado do Projeto"
6. Confirmar ao usuário com nome do arquivo criado

### /.claude/commands/status.md
Instruções para Claude:
1. Branch atual (git) se aplicável
2. Arquivo mais recente em `memory/history/` — resumo e próximos passos
3. Estado de features do projeto (de context/produto.md ou equivalente)
4. Top 3 pendências
5. Apresentar em tabela compacta

### /.claude/commands/worker.md
Instruções para Claude:
1. Identificar worker pelo argumento do comando
2. Ler arquivo do worker em `/workers/`
3. Carregar contexto listado na seção "Contexto a Carregar"
4. Confirmar ativação com lista de contexto carregado
5. Seguir processo e restrições do worker pelo resto da sessão
6. Se sem argumento: listar workers disponíveis com descrição de 1 linha

### /.claude/commands/conform.md
Loop de conformidade A/B (ver `automation/procedures/conform.md` e `docs/CONFORMANCE-LOOP.md`).
Instruções para Claude:
1. Detectar modo (NOVO/EXISTENTE).
2. **Agente A** audita contra `docs/CONFORMANCE-SPEC.md` → relatório `CONFORME|FALTA|DRIFT` + instruction set.
3. Pedir autorização ao humano (tudo ou item-a-item).
4. **Agente B** aplica só o aprovado, exato. No Claude Code, A e B podem ser subagentes reais (Task/Agent).
5. **Agente A** re-audita o disco → `PASS` termina; senão re-instrui B (máx. 3 ciclos, depois escala).
6. Sem argumento: só auditar (dry-run), sem gate nem execução.

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

**Explicar ao usuário** o que o hook faz antes de adicionar — requer confirmação explícita por ser modificação de settings.

---

## AGENTIC-OS.md (referência rápida)

Criar na raiz do projeto com:
- Tabela de estrutura com estado ✅ de cada peça
- Tabela de comandos disponíveis com descrição de 1 linha
- Ciclo de uso em formato de lista numerada
- Tabela de módulos /context com conteúdo de cada arquivo
- Tabela de workers com função e contexto que carregam

---

## Camada Multi-Provedor (opt-in)

Torna o cérebro e o workflow **provider-neutros** para várias IAs (Claude, Codex, Gemini,
GLM, DeepSeek…) trabalharem sincronizadas sobre o mesmo cérebro. Quando uma IA para, a próxima
continua exatamente do mesmo ponto — **sem drift**. É **opt-in**; projetos single-IA ignoram.
Template pronto: `template/D-multi-provedor/`. Detalhes: `docs/MULTI-PROVIDER.md`.

**Duas peças:**
1. **Fonte única + ponteiros** — um só arquivo cérebro é canônico; os outros são `@import` dele
   (nunca duplicar conteúdo → sem "delírio").
2. **Handoff** (`memory/handoff.md`) — estado vivo que a próxima IA lê para retomar. O **cursor**
   (próxima tarefa) é **derivado** da primeira `[ ]` em `changes/<ativa>/tasks.md`, nunca
   recodificado. Gravado **incremental** ao fechar cada tarefa (à prova de crash).

A lógica dos comandos vive em `automation/procedures/{propose,worker,wrapup,status,handoff}.md`
(fonte única, provider-neutra). As `.claude/commands/` são wrappers finos. Codex/Gemini pedem em
linguagem natural e leem o procedimento.

### Caminho — projeto novo
Cérebro canônico = **`AGENTS.md`** (standard cross-provider; Codex lê-o nativamente). Criar:
- `AGENTS.md` (orquestrador + protocolo de arranque de sessão) + ponteiros finos `CLAUDE.md`
  (`@AGENTS.md`) e `GEMINI.md` (import de `AGENTS.md`).
- `automation/procedures/` (5 procedimentos) + `.claude/commands/` wrappers finos (incl. `/handoff`).
- `memory/handoff.md` (estado vivo) + `providers/registry.md` (arquivo de entrada por IA).

### Caminho — projeto existente
Regra de ouro do Modo A mantém-se: **só criar/ponteirar; nunca mover/renomear/apagar comandos ou arquivos existentes.**
1. **Detectar o cérebro** e aplicar precedência:
   - Existe orquestrador ativo (`CLAUDE.md`/`GEMINI.md`/`AGENTS.md` com conteúdo real) → **mantém-se canônico**.
   - Vários → o **maior/efetivamente orquestrador** vence; os outros viram ponteiros.
   - Empate/ambíguo → **perguntar** ao humano.
   - Nenhum → `AGENTS.md` canônico.
2. Criar **ponteiros** `@<canônico>` para os provedores em falta.
3. Adicionar `automation/procedures/` + `memory/handoff.md` + `providers/registry.md`.
4. **Não tocar** nos `.claude/commands/` existentes (UX do Claude fica idêntica).

### Formato de `memory/handoff.md`
```markdown
# Handoff — estado vivo da sessão
## Último provedor
- IA: [Claude|Codex|Gemini|…] · Quando: [YYYY-MM-DD HH:mm]
## Mudança ativa
- Pasta: changes/<nome>/   (ou "nenhuma")
- Cursor: primeira [ ] em tasks.md  (derivar — não copiar aqui)
## Narrativa
- Feito: … · Decidido: … · Gotchas: … · Próxima intenção: …
```

---

## Workers Típicos por Tipo de Projeto

### SaaS + n8n
- `developer.md` — implementação frontend/backend/BD
- `workflow-designer.md` — automações n8n, WhatsApp, Telegram
- `arquiteto.md` — decisões técnicas, migrations, risco
- `qa.md` — revisão, segurança, RLS, testes

### Conteúdo / Marketing
- `roteirista.md` — estrutura narrativa, ganchos, CTAs
- `pesquisador.md` — pesquisa externa, validação de fatos
- `analista.md` — métricas, padrões, recomendações

### Consultoria / Projeto de Cliente
- `consultor.md` — análise, recomendações, relatórios
- `gestor.md` — milestones, riscos, comunicação cliente
- `documentador.md` — specs, entregáveis, documentação técnica

Adaptar ao contexto real do projeto — não forçar workers que não fazem sentido.

---

## Ciclo de Operação (explicar ao usuário no final)

```
1. Abrir Claude Code na pasta → CLAUDE.md carrega automático
2. "vamos começar" → Claude lê memory/history + estado do projeto
3. /propose [nome] → cria a mudança estruturada (proposal + tasks)
4. /worker [nome] → executa a mudança ativa com contexto carregado
5. /wrapup → arquiva mudança + delta em context/ + learnings
6. Fechar Claude Code → Stop hook grava lembrete automático
```

Memory/learnings cresce com o tempo via /wrapup.
Context/ e workers/ atualizados manualmente quando projeto evolui.
CLAUDE.md mantém-se estável — é as regras, não a memória.

Em projetos modulares, as mudanças são prefixadas pelo módulo (`auth-add-2fa`) e o delta do
`/wrapup` mira `context/<modulo>/`. Ver `docs/CHANGE-WORKFLOW.md`.
