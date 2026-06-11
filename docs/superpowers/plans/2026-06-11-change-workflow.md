# Change Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma camada de mudança estruturada (`changes/`) ao plugin Agentic OS — comando `/propose`, ciclo propose→worker→wrapup com delta semi-automático em `context/`, e capacidade de reorganização brownfield segura — em todos os 3 templates, na skill e na documentação.

**Architecture:** Plugin baseado em ficheiros markdown (não código executável). Cada mudança vive em `changes/<nome>/` com proposal/tasks/design. `/propose` cria; `/worker` executa; `/wrapup` arquiva e sugere deltas em `context/`. Brownfield: nada existente é removido; movimentos só dentro de mudança aprovada. Fonte única de documentação em `docs/CHANGE-WORKFLOW.md`.

**Tech Stack:** Markdown, slash commands do Claude Code (`.claude/commands/*.md`), PowerShell (hooks/datas no Windows). Sem framework de testes — verificação é estrutural (ficheiro existe + conteúdo correto).

**Spec:** `docs/superpowers/specs/2026-06-11-change-workflow-design.md`

**Nota sobre commits:** O repositório NÃO é git. Os passos de commit abaixo são **opcionais** — executar só se `git status` funcionar (repo inicializado). Caso contrário, saltar o passo de commit e prosseguir.

---

## File Structure

**Novos ficheiros:**
- `docs/CHANGE-WORKFLOW.md` — documentação fonte-única do workflow
- `README.md` — visão geral do plugin + link p/ doc
- `template/{A-generico,B-saas-n8n,C-claude-integrado}/.claude/commands/propose.md` — comando novo (idêntico nos 3)
- `template/{A,B,C}/changes/.gitkeep` + `template/{A,B,C}/changes/archive/.gitkeep` — scaffolding da pasta

**Ficheiros modificados:**
- `template/{A,B,C}/.claude/commands/wrapup.md` — passo de archive + delta sync
- `template/{A,B,C}/.claude/commands/worker.md` — deteção de mudança ativa
- `template/{A,B,C}/CLAUDE.md` — linha `/propose` na tabela de comandos
- `template/{A,B,C}/AGENTIC-OS.md` — secção que referencia o doc
- `skill/agentic-os/SKILL.md` — MODO B (estrutura), MODO A (reorg brownfield), formatos de artefato

**Responsabilidade por ficheiro:** cada command tem uma responsabilidade (propose=criar, worker=executar, wrapup=arquivar+sync). O doc é a única fonte narrativa; AGENTIC-OS.md de cada template só referencia.

---

## Task 1: Documentação fonte-única (`docs/CHANGE-WORKFLOW.md`)

**Files:**
- Create: `docs/CHANGE-WORKFLOW.md`

- [ ] **Step 1: Criar o documento**

Criar `docs/CHANGE-WORKFLOW.md` com este conteúdo exato:

```markdown
# Change Workflow — Agentic OS

> Camada de mudança estruturada acima do fluxo worker/wrapup.
> Inspirado em [OpenSpec](https://github.com/Fission-AI/OpenSpec), adaptado à filosofia leve do Agentic OS.

## Conceito

Cada feature, correção ou reorganização é uma **mudança**: uma pasta em `changes/<nome>/`
com os artefatos que capturam *porquê*, *como* e *passos* antes de mexer no código.
A mudança é executada por um worker e, ao fechar, alimenta a memória e atualiza o
conhecimento (`context/`) via deltas confirmados pelo humano.

Princípios herdados: **fluido, não rígido** — dependências entre artefatos são
facilitadores, não portões. Qualquer artefato pode ser atualizado a qualquer momento.

## Estrutura de pastas

\`\`\`
changes/
├── <nome-da-mudanca>/
│   ├── proposal.md      # porquê + escopo + abordagem
│   ├── design.md        # decisões técnicas (só se não-trivial)
│   └── tasks.md         # checklist de implementação
└── archive/
    └── YYYY-MM-DD-<nome>/   # mudanças fechadas
\`\`\`

## Ciclo

\`\`\`
(explorar)        superpowers:brainstorming   → spec exploratória opcional
   ↓
/propose <nome>   cria changes/<nome>/ (proposal + tasks; design se preciso)
   ↓
/worker [nome]    executa dentro da mudança ativa (lê tasks.md, marca [x])
   ↓
/wrapup           arquiva a mudança + history/learnings
                  + sugere deltas em context/ (humano confirma item a item)
                  + atualiza CLAUDE.md "Estado do Projeto"
\`\`\`

Mapeamento com OpenSpec `core` (`propose·explore·apply·sync·archive`):
explore→brainstorming · propose→/propose · apply→/worker · sync+archive→/wrapup.

## Artefatos

**proposal.md**
\`\`\`markdown
# Mudança: <nome>
## Porquê
[1-3 frases]
## Escopo
- [entra]
- [NÃO entra]
## Abordagem
[1 parágrafo, alto nível]
\`\`\`

**tasks.md**
\`\`\`markdown
# Tarefas: <nome>
- [ ] 1. [tarefa]
- [ ] 2. [tarefa]
\`\`\`

**design.md** (opcional)
\`\`\`markdown
# Design técnico: <nome>
## Decisões
| Decisão | Motivo | Alternativas |
|---------|--------|--------------|
## Riscos
- [risco]
\`\`\`

## Ponte: brainstorming → artefatos

Se já existe uma spec de `superpowers:brainstorming` em
`docs/superpowers/specs/<topic>-design.md`, `/propose` lê-a e pré-preenche os artefatos
(referencia com link, não duplica). Se não existe, gera do zero a partir do nome/descrição.

## Delta semi-automático (no /wrapup)

Ao fechar uma mudança, `/wrapup` analisa o que mudou e **sugere** updates em `context/`,
sem aplicar sozinho. Notação: `+` ADICIONAR · `~` MODIFICAR · `-` REMOVER.

Exemplo (`add-dark-mode`):
\`\`\`
Mudança "add-dark-mode" concluída. Sugiro atualizar context/:
  + context/produto.md     ADICIONAR à tabela de features: | Dark Mode | DONE | P2 |
  ~ context/arquitetura.md MODIFICAR diagrama: adicionar [Theme Provider]
  + context/stack.md       ADICIONAR nota: preferência em localStorage
Confirmar? [1 s/n] [2 s/n] [3 s/n]
\`\`\`
Aprovados → editados em context/. Pasta → changes/archive/. Registo em memory/.

## Reorganização de projetos existentes (brownfield)

Reorganizar é uma mudança: `/propose reorganize-<alvo>`.

1. **Scan read-only** — mapeia pastas, docs soltos, duplicados, redundâncias. Nada é tocado.
2. **Plano** — proposal.md + tasks.md listando CADA movimento como uma linha:
   \`\`\`
   - [ ] MOVER  docs/old-api.md → docs/archive/old-api.md  (substituído por api-v2.md)
   - [ ] AGRUPAR notas-*.md (3) → docs/notas/             (dispersos na raiz)
   - [ ] MARCAR config.bak.json → redundante (idêntico a config.json)
   \`\`\`
3. **Aprovação humana** — todo o plano ou item a item.
4. **Execução segura** (`/worker`) — só itens aprovados.

### Regras de segurança (invioláveis)
- **Nunca deletar.** Redundantes vão para `_quarantine/` (ou `docs/archive/`), nunca apagados.
- **Nunca mover código sem verificar referências.** Procurar imports/links antes; atualizar todos ou não mover.
- **Verificar git primeiro.** Se for repo git, exigir working tree limpo — movimentos reversíveis.
- **Registar movimentos** em `changes/reorganize-<alvo>/MOVES.md` (mapa origem→destino) p/ rollback.
- **Dry-run por defeito.** Só `/worker` após aprovação move.
- **Em dúvida → parar e perguntar.**

### Redundância — critérios (sugestão; humano decide)
- Conteúdo idêntico (hash) a outro ficheiro
- Backup óbvio (`.bak`, `~`, `-copy`, `-old`, datado e superseded)
- Doc coberto integralmente por outro mais recente

Nunca marcar automaticamente: ficheiros referenciados por código, configs ativas,
ou qualquer coisa fora de `docs/`/notas sem análise de referências.
```

- [ ] **Step 2: Verificar o ficheiro**

Run: `powershell -command "Test-Path 'docs/CHANGE-WORKFLOW.md'; (Get-Content 'docs/CHANGE-WORKFLOW.md' | Measure-Object -Line).Lines"`
Expected: `True` e contagem de linhas > 100.

- [ ] **Step 3: Commit (opcional)**

```bash
git add docs/CHANGE-WORKFLOW.md
git commit -m "docs: add change workflow source-of-truth doc"
```

---

## Task 2: README do repositório

**Files:**
- Create: `README.md`

- [ ] **Step 1: Criar README**

Criar `README.md` com este conteúdo exato:

```markdown
# Agentic OS

Metodologia de organização de ficheiros que permite a um agente IA operar com
autonomia entre sessões: elimina cold start, otimiza tokens e constrói memória persistente.

## Estrutura do repositório

- `skill/agentic-os/SKILL.md` — a skill que monta/adapta projetos ao padrão Agentic OS
- `template/A-generico/` — template para conteúdo/marketing
- `template/B-saas-n8n/` — template para SaaS + automações n8n
- `template/C-claude-integrado/` — template SaaS integrado com Claude Code Superpowers
- `docs/CHANGE-WORKFLOW.md` — **[Change Workflow](docs/CHANGE-WORKFLOW.md)**: ciclo de mudança estruturada
- `docs/superpowers/` — specs e planos de desenvolvimento do próprio plugin

## As 5 camadas

| Camada | Pasta | Função |
|--------|-------|--------|
| Identity | `CLAUDE.md` | Orquestrador central |
| Knowledge | `context/` | Conhecimento modular do projeto |
| Memory | `memory/` | Persistência: learnings + history |
| Workers | `workers/` | Especialistas com role/função/schema |
| Automation | `automation/` | Gates de qualidade + guardrails |

## Ciclo de mudança

\`\`\`
/propose <nome>  → cria changes/<nome>/ com proposal + tasks
/worker [nome]   → executa as tarefas da mudança
/wrapup          → arquiva + atualiza context/ (delta) + memória
\`\`\`

Detalhes em **[docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md)**.

## Comandos

| Comando | Ação |
|---------|------|
| `/propose <nome>` | Criar uma nova mudança estruturada |
| `/worker [nome]` | Ativar especialista (executa a mudança ativa) |
| `/wrapup` | Consolidar sessão: arquivar mudança + memória + deltas |
| `/status` | Estado atual do projeto |
```

- [ ] **Step 2: Verificar**

Run: `powershell -command "Test-Path 'README.md'"`
Expected: `True`.

- [ ] **Step 3: Commit (opcional)**

```bash
git add README.md
git commit -m "docs: add repository README"
```

---

## Task 3: Comando `/propose` (idêntico nos 3 templates)

**Files:**
- Create: `template/A-generico/.claude/commands/propose.md`
- Create: `template/B-saas-n8n/.claude/commands/propose.md`
- Create: `template/C-claude-integrado/.claude/commands/propose.md`

- [ ] **Step 1: Criar o comando nos 3 caminhos**

Criar **o mesmo conteúdo** nos três ficheiros acima:

```markdown
Cria uma mudança estruturada em `changes/<nome>/`.

**Uso**: `/propose <nome-ou-descrição>`

Ver `docs/CHANGE-WORKFLOW.md` para o ciclo completo.

## Execução

1. **Determinar o nome** (kebab-case). Se o argumento for uma descrição, derivar um nome curto.
   Se o escopo estiver ambíguo, fazer 1 pergunta de clarificação antes de criar.

2. **Verificar ponte de brainstorming**: procurar em `docs/superpowers/specs/` uma spec
   recente sobre o tema (`*-<tema>-design.md`).
   - Se existe → ler e extrair Porquê/Escopo/Abordagem e critérios para pré-preencher os artefatos.
     `proposal.md` referencia a spec com link (não duplicar o conteúdo).
   - Se não existe → gerar os artefatos do zero a partir do nome/descrição.

3. **Criar a pasta** `changes/<nome>/` e os artefatos:

   `proposal.md`
   \`\`\`markdown
   # Mudança: <nome>
   ## Porquê
   [1-3 frases]
   ## Escopo
   - [entra]
   - [NÃO entra]
   ## Abordagem
   [1 parágrafo]
   \`\`\`

   `tasks.md`
   \`\`\`markdown
   # Tarefas: <nome>
   - [ ] 1. [tarefa]
   - [ ] 2. [tarefa]
   \`\`\`

   `design.md` — **criar apenas se** a mudança for técnica/não-trivial (decisões de arquitetura,
   migrations, risco). Caso contrário, omitir.

4. **Caso especial — reorganização** (`/propose reorganize-<alvo>`):
   - Fazer scan **read-only** da estrutura atual (NÃO mover nada).
   - Gerar `tasks.md` listando CADA movimento como uma linha `MOVER`/`AGRUPAR`/`MARCAR`.
   - Aplicar as Regras de Segurança de `docs/CHANGE-WORKFLOW.md` (nunca deletar, verificar
     referências, exigir git limpo, registar em MOVES.md, dry-run por defeito).

5. **Confirmar**:
   > "Mudança '<nome>' criada em changes/<nome>/. Artefatos: [lista]. Execute /worker para implementar."

## Se nenhum argumento
Listar mudanças ativas em `changes/` (excluindo `archive/`) com 1 linha cada.
```

- [ ] **Step 2: Verificar os 3 ficheiros**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | ForEach-Object { Test-Path \"template/$_/.claude/commands/propose.md\" }"`
Expected: `True` três vezes.

- [ ] **Step 3: Commit (opcional)**

```bash
git add template/*/.claude/commands/propose.md
git commit -m "feat: add /propose command to all templates"
```

---

## Task 4: Scaffolding da pasta `changes/` (3 templates)

**Files:**
- Create: `template/A-generico/changes/.gitkeep`
- Create: `template/A-generico/changes/archive/.gitkeep`
- Create: `template/B-saas-n8n/changes/.gitkeep`
- Create: `template/B-saas-n8n/changes/archive/.gitkeep`
- Create: `template/C-claude-integrado/changes/.gitkeep`
- Create: `template/C-claude-integrado/changes/archive/.gitkeep`

- [ ] **Step 1: Criar os ficheiros `.gitkeep`**

Cada `.gitkeep` tem como conteúdo uma única linha:

```
# Pasta de mudanças estruturadas — ver docs/CHANGE-WORKFLOW.md
```

(O mesmo conteúdo nos 6 ficheiros.)

- [ ] **Step 2: Verificar**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | ForEach-Object { Test-Path \"template/$_/changes/archive/.gitkeep\" }"`
Expected: `True` três vezes.

- [ ] **Step 3: Commit (opcional)**

```bash
git add template/*/changes
git commit -m "feat: scaffold changes/ folder in all templates"
```

---

## Task 5: Atualizar `worker.md` — deteção de mudança ativa (3 templates)

**Files:**
- Modify: `template/A-generico/.claude/commands/worker.md`
- Modify: `template/B-saas-n8n/.claude/commands/worker.md`
- Modify: `template/C-claude-integrado/.claude/commands/worker.md`

O bloco a inserir é o **mesmo** nos três. Difere apenas o ponto de inserção (depois do passo
que carrega o contexto do worker, antes do passo de confirmação).

- [ ] **Step 1: A-generico — inserir bloco de deteção**

Em `template/A-generico/.claude/commands/worker.md`, depois da linha
`3. Carregar contexto listado na secção "Contexto a Carregar" do worker.`
inserir:

```markdown
3b. **Detetar mudança ativa**: se existe uma pasta em `changes/` (fora de `archive/`),
   carregar o `tasks.md` dessa mudança como contexto de trabalho. Durante a sessão,
   marcar tarefas concluídas com `[x]` em `tasks.md`. Ver `docs/CHANGE-WORKFLOW.md`.
```

- [ ] **Step 2: B-saas-n8n — inserir o mesmo bloco**

Em `template/B-saas-n8n/.claude/commands/worker.md`, depois da linha
`3. Carregar contexto da secção "Contexto a Carregar".` inserir o **mesmo bloco** do Step 1
(renumerar para `3b` mantendo o texto idêntico).

- [ ] **Step 3: C-claude-integrado — inserir o mesmo bloco**

Em `template/C-claude-integrado/.claude/commands/worker.md`, depois da linha
`3. Carregar contexto da secção "Contexto a Carregar".` inserir o **mesmo bloco** do Step 1
(renumerar para `3b`).

- [ ] **Step 4: Verificar**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | ForEach-Object { Select-String -Path \"template/$_/.claude/commands/worker.md\" -Pattern 'Detetar mudança ativa' -Quiet }"`
Expected: `True` três vezes.

- [ ] **Step 5: Commit (opcional)**

```bash
git add template/*/.claude/commands/worker.md
git commit -m "feat: worker detects active change folder"
```

---

## Task 6: Atualizar `wrapup.md` — archive + delta sync (3 templates)

**Files:**
- Modify: `template/A-generico/.claude/commands/wrapup.md`
- Modify: `template/B-saas-n8n/.claude/commands/wrapup.md`
- Modify: `template/C-claude-integrado/.claude/commands/wrapup.md`

O bloco inserido é o **mesmo** nos três. Inserir como passo novo **antes** do passo final
de confirmação (o passo "Confirmar: ...").

- [ ] **Step 1: Definir o bloco a inserir**

Bloco (texto idêntico nos 3 ficheiros):

```markdown
N. **Fechar mudança ativa** (se existe pasta em `changes/` fora de `archive/`):
   - Verificar se as tarefas em `tasks.md` estão concluídas.
   - **Sugerir deltas em `context/`** — analisar o que a mudança alterou e propor updates,
     SEM aplicar sozinho. Notação: `+` ADICIONAR · `~` MODIFICAR · `-` REMOVER.
     Apresentar cada ficheiro de context/ afetado e pedir confirmação item a item.
   - Aplicar **só** os deltas confirmados pelo humano.
   - Mover a pasta da mudança para `changes/archive/YYYY-MM-DD-<nome>/`.
   - Ver `docs/CHANGE-WORKFLOW.md` para o formato do delta.
```

(`N` = próximo número livre antes do passo "Confirmar".)

- [ ] **Step 2: A-generico**

Em `template/A-generico/.claude/commands/wrapup.md`, inserir o bloco como passo **6**
(antes do atual passo 6 "Confirmar", que passa a 7). Atualizar a numeração.

- [ ] **Step 3: B-saas-n8n**

Em `template/B-saas-n8n/.claude/commands/wrapup.md`, inserir o bloco como passo **7**
(antes do atual passo 7 "Confirmar", que passa a 8).

- [ ] **Step 4: C-claude-integrado**

Em `template/C-claude-integrado/.claude/commands/wrapup.md`, inserir o bloco como passo **7**
(antes do atual passo 7 "Confirmar", que passa a 8).

- [ ] **Step 5: Verificar**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | ForEach-Object { Select-String -Path \"template/$_/.claude/commands/wrapup.md\" -Pattern 'Fechar mudança ativa' -Quiet }"`
Expected: `True` três vezes.

- [ ] **Step 6: Commit (opcional)**

```bash
git add template/*/.claude/commands/wrapup.md
git commit -m "feat: wrapup archives change and suggests context deltas"
```

---

## Task 7: Atualizar tabelas de comandos em `CLAUDE.md` (3 templates)

**Files:**
- Modify: `template/A-generico/CLAUDE.md`
- Modify: `template/B-saas-n8n/CLAUDE.md`
- Modify: `template/C-claude-integrado/CLAUDE.md`

- [ ] **Step 1: A-generico**

Em `template/A-generico/CLAUDE.md`, na secção "Comandos Disponíveis", substituir:

```
| Comando | Ação |
|---------|------|
| /wrapup | Consolidar aprendizados em /memory/learnings |
```
por:
```
| Comando | Ação |
|---------|------|
| /propose [nome] | Criar mudança estruturada em changes/ |
| /wrapup | Consolidar aprendizados + arquivar mudança ativa |
```

- [ ] **Step 2: B-saas-n8n**

Em `template/B-saas-n8n/CLAUDE.md`, na secção "Comandos", substituir:

```
| Comando | Ação |
|---------|------|
| /wrapup | Consolidar sessão em /memory/learnings |
```
por:
```
| Comando | Ação |
|---------|------|
| /propose [nome] | Criar mudança estruturada em changes/ |
| /wrapup | Consolidar sessão + arquivar mudança ativa |
```

- [ ] **Step 3: C-claude-integrado**

Em `template/C-claude-integrado/CLAUDE.md`, na secção "Comandos", substituir:

```
| Comando | Ação |
|---------|------|
| /wrapup | Consolidar sessão — memória + history |
```
por:
```
| Comando | Ação |
|---------|------|
| /propose [nome] | Criar mudança estruturada em changes/ |
| /wrapup | Consolidar sessão + arquivar mudança ativa |
```

- [ ] **Step 4: Verificar**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | ForEach-Object { Select-String -Path \"template/$_/CLAUDE.md\" -Pattern '/propose' -Quiet }"`
Expected: `True` três vezes.

- [ ] **Step 5: Commit (opcional)**

```bash
git add template/*/CLAUDE.md
git commit -m "docs: add /propose to command tables"
```

---

## Task 8: Referenciar o doc em `AGENTIC-OS.md` (3 templates)

**Files:**
- Modify: `template/A-generico/AGENTIC-OS.md`
- Modify: `template/B-saas-n8n/AGENTIC-OS.md`
- Modify: `template/C-claude-integrado/AGENTIC-OS.md`

- [ ] **Step 1: Ler o final de cada AGENTIC-OS.md**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | ForEach-Object { Write-Output \"--- $_ ---\"; Get-Content \"template/$_/AGENTIC-OS.md\" -Tail 5 }"`
Expected: ver as últimas linhas de cada ficheiro para inserir a secção no fim.

- [ ] **Step 2: Acrescentar secção ao fim dos 3 ficheiros**

Acrescentar (append) ao final de cada `AGENTIC-OS.md` o **mesmo bloco**:

```markdown

## Change Workflow

Mudanças estruturadas vivem em `changes/<nome>/` (proposal + tasks + design opcional).

| Comando | Ação |
|---------|------|
| `/propose <nome>` | Criar mudança |
| `/worker [nome]` | Executar a mudança ativa |
| `/wrapup` | Arquivar + atualizar context/ via delta |

Documentação completa: ver `docs/CHANGE-WORKFLOW.md` (na raiz do repositório do plugin).
```

- [ ] **Step 3: Verificar**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | ForEach-Object { Select-String -Path \"template/$_/AGENTIC-OS.md\" -Pattern 'Change Workflow' -Quiet }"`
Expected: `True` três vezes.

- [ ] **Step 4: Commit (opcional)**

```bash
git add template/*/AGENTIC-OS.md
git commit -m "docs: reference change workflow in AGENTIC-OS quick refs"
```

---

## Task 9: Atualizar a skill (`SKILL.md`)

**Files:**
- Modify: `skill/agentic-os/SKILL.md`

Quatro edições: (a) estrutura do MODO B inclui `changes/`; (b) lista de criação do MODO A
inclui changes/ + propose; (c) nova subsecção de reorganização brownfield no MODO A;
(d) nova secção de comando `/propose` na zona de Slash Commands.

- [ ] **Step 1: MODO B — adicionar `changes/` à árvore de estrutura**

Na secção "MODO B", na árvore de estrutura ASCII, depois do bloco `automation/` e antes de
`projects/`, inserir:

```
├── changes/                    # Mudanças estruturadas
│   └── archive/                # Mudanças fechadas
```

E na lista `.claude/commands/`, adicionar `propose.md` ao lado de `wrapup.md`/`status.md`/`worker.md`:

```
│       ├── propose.md          # /propose
```

- [ ] **Step 2: MODO A — adicionar à lista "Criar apenas"**

Na secção "MODO A > Passo 4: Criar o que falta", na lista numerada "Criar apenas", adicionar
um item novo após o item 6 (slash commands):

```
6b. `/changes/` e `/changes/archive/` — pasta de mudanças estruturadas
6c. `/.claude/commands/propose.md` — comando /propose
```

- [ ] **Step 3: MODO A — nova subsecção de reorganização brownfield**

No fim da secção "MODO A" (antes de "MODO B"), acrescentar:

```markdown
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
```

- [ ] **Step 4: Documentar o comando `/propose` na zona de Slash Commands**

Na secção "Slash Commands", antes de `### /.claude/commands/wrapup.md`, inserir:

```markdown
### /.claude/commands/propose.md
Instruções para Claude:
1. Determinar nome kebab-case (clarificar se ambíguo).
2. Verificar ponte de brainstorming em `docs/superpowers/specs/` — se há spec do tema, pré-preencher artefatos (referenciar, não duplicar).
3. Criar `changes/<nome>/` com `proposal.md` + `tasks.md` (+ `design.md` se não-trivial).
4. Caso `reorganize-*`: scan read-only + plano de movimentos com regras de segurança.
5. Confirmar com nome da mudança e próximos passos.
6. Sem argumento: listar mudanças ativas em `changes/`.

Ver `docs/CHANGE-WORKFLOW.md` para o ciclo completo.
```

- [ ] **Step 5: Atualizar o "Ciclo de Operação" no fim da skill**

Na secção "Ciclo de Operação", substituir o bloco do ciclo por:

```
1. Abrir Claude Code na pasta → CLAUDE.md carrega automático
2. "vamos começar" → Claude lê memory/history + estado do projeto
3. /propose [nome] → cria a mudança estruturada (proposal + tasks)
4. /worker [nome] → executa a mudança ativa com contexto carregado
5. /wrapup → arquiva mudança + delta em context/ + learnings
6. Fechar Claude Code → Stop hook grava lembrete automático
```

- [ ] **Step 6: Verificar todas as edições**

Run: `powershell -command "$f='skill/agentic-os/SKILL.md'; @('changes/','propose.md','Reorganização brownfield','reorganize-') | ForEach-Object { \"$_ => \" + (Select-String -Path $f -Pattern $_ -Quiet) }"`
Expected: cada padrão retorna `True`.

- [ ] **Step 7: Commit (opcional)**

```bash
git add skill/agentic-os/SKILL.md
git commit -m "feat: skill teaches change workflow + brownfield reorg"
```

---

## Task 10: Verificação final integrada

**Files:** (nenhum — só verificação)

- [ ] **Step 1: Confirmar todos os artefatos novos existem**

Run:
```
powershell -command "$ok=$true; @('docs/CHANGE-WORKFLOW.md','README.md') | %{ if(!(Test-Path $_)){$ok=$false; Write-Output \"FALTA: $_\"} }; @('A-generico','B-saas-n8n','C-claude-integrado') | %{ @(\"template/$_/.claude/commands/propose.md\",\"template/$_/changes/.gitkeep\",\"template/$_/changes/archive/.gitkeep\") | %{ if(!(Test-Path $_)){$ok=$false; Write-Output \"FALTA: $_\"} } }; if($ok){Write-Output 'TODOS OS FICHEIROS OK'}"
```
Expected: `TODOS OS FICHEIROS OK`.

- [ ] **Step 2: Confirmar todas as edições aplicadas**

Run:
```
powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | %{ $t=$_; @(\".claude/commands/worker.md|Detetar mudança ativa\",\".claude/commands/wrapup.md|Fechar mudança ativa\",\"CLAUDE.md|/propose\",\"AGENTIC-OS.md|Change Workflow\") | %{ $p=$_.Split('|'); $hit=Select-String -Path \"template/$t/$($p[0])\" -Pattern $p[1] -Quiet; if(!$hit){Write-Output \"FALTA EDIT: $t/$($p[0])\"} } }; Write-Output 'CHECK CONCLUIDO'"
```
Expected: `CHECK CONCLUIDO` sem linhas `FALTA EDIT`.

- [ ] **Step 3: Verificação manual da experiência**

Ler `docs/CHANGE-WORKFLOW.md` de ponta a ponta e confirmar que o exemplo `add-dark-mode`
e a secção de reorganização brownfield estão coerentes com os comandos criados.

- [ ] **Step 4: Commit final (opcional)**

```bash
git add -A
git commit -m "chore: change workflow rollout complete"
```

---

## Self-Review (preenchido)

**Spec coverage:**
- `changes/` + artefatos (proposal/tasks/design) → Tasks 3, 4
- Ciclo propose→worker→wrapup → Tasks 3, 5, 6
- Delta semi-automático + exemplo add-dark-mode → Tasks 1, 6
- Ponte brainstorming→artefatos → Tasks 1, 3, 9
- Reorganização brownfield + regras de segurança → Tasks 1, 9
- Mapeamento OpenSpec core → Task 1 (doc)
- Rollout 3 templates + skill + docs → Tasks 1-9
- Documentação fonte-única → Tasks 1, 2, 8
- Critérios de sucesso 1-7 → cobertos por Tasks 3,5,6,7 + verificação Task 10

**Placeholder scan:** sem TODO/TBD; todo o conteúdo de ficheiro está mostrado integralmente.

**Type/naming consistency:** `changes/`, `changes/archive/YYYY-MM-DD-<nome>/`, `/propose`,
`proposal.md`/`tasks.md`/`design.md`, `MOVES.md`, `_quarantine/`, notação `+`/`~`/`-`
— consistentes em todas as tasks e no doc.
