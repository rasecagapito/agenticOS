# Agentic OS — Guia de Uso Completo

> Documentação de uso do plugin **agentic-os** (v1.4.0+): instalação, conceitos, todos os
> comandos com exemplos, e um capítulo dedicado ao **handoff e à orquestração de agentes**.
>
> Documentos relacionados: [CHANGE-WORKFLOW](CHANGE-WORKFLOW.md) · [MULTI-PROVIDER](MULTI-PROVIDER.md) ·
> [CONFORMANCE-SPEC](CONFORMANCE-SPEC.md) · [CONFORMANCE-LOOP](CONFORMANCE-LOOP.md) ·
> [STRUCTURE-SPEC](STRUCTURE-SPEC.md) · [STRUCTURE-MIGRATION](STRUCTURE-MIGRATION.md)

---

## Índice

1. [O que é o Agentic OS](#1-o-que-é-o-agentic-os)
2. [Instalação](#2-instalação)
3. [Conceitos: as 5 camadas e as fontes únicas](#3-conceitos-as-5-camadas-e-as-fontes-únicas)
4. [Templates — qual escolher](#4-templates--qual-escolher)
5. [Montar ou adaptar um projeto (a skill)](#5-montar-ou-adaptar-um-projeto-a-skill)
6. [Comandos — referência completa](#6-comandos--referência-completa)
7. [Handoff e Orquestração de Agentes (capítulo dedicado)](#7-handoff-e-orquestração-de-agentes)
8. [Loop de Conformidade A/B](#8-loop-de-conformidade-ab)
9. [Motor de Estrutura da Aplicação](#9-motor-de-estrutura-da-aplicação)
10. [Ciclo diário — do zero ao wrapup](#10-ciclo-diário--do-zero-ao-wrapup)
11. [Stop hook (lembrete automático de fim de sessão)](#11-stop-hook-lembrete-automático-de-fim-de-sessão)
12. [Regras invioláveis e orçamentos](#12-regras-invioláveis-e-orçamentos)
13. [FAQ / gotchas](#13-faq--gotchas)

---

## 1. O que é o Agentic OS

Metodologia de **organização de arquivos** (não é software) que permite a um agente IA operar com
autonomia entre sessões:

- **Elimina cold start** — ao abrir o projeto, o agente lê o cérebro e sabe quem é, o que existe e o que falta.
- **Otimiza tokens** — conhecimento modular carregado sob demanda; orçamentos rígidos nos arquivos quentes.
- **Memória persistente** — aprendizados e histórico de sessões ficam no disco, não na janela de contexto.
- **Multi-IA** — várias IAs (Claude, Codex, Gemini…) sobre o mesmo cérebro, com handoff exato.
- **Verificável** — a conformidade é auditada por regras checáveis (não prosa de orientação).

A Regra de Ouro em qualquer intervenção: **só criar. Nunca mover, renomear ou apagar arquivos
existentes sem mudança aprovada** (`/propose` + gate humano).

---

## 2. Instalação

### Claude Code

```text
/plugin marketplace add rasecagapito/agenticOS
/plugin install agentic-os@agentic-os
```

Reiniciar o Claude Code após instalar.

### Codex

```powershell
codex plugin marketplace add rasecagapito/agenticOS
```

Depois, em **Plugins** no Codex: selecionar **Agentic OS**, instalar e iniciar nova tarefa para
carregar a skill. Instalação por perfil — não repetir por projeto.

### Gemini e outros provedores

Não há manifesto nativo: essas IAs entram via **camada multi-provedor** criada dentro do projeto
(`AGENTS.md` + `GEMINI.md` + `providers/registry.md` + `memory/handoff.md` +
`automation/procedures/`). Ver capítulo [7](#7-handoff-e-orquestração-de-agentes).

### Verificação pós-instalação

Numa pasta de teste, pedir: *"analisa este projeto no padrão Agentic OS"*. A skill `agentic-os`
ativa automaticamente ao mencionar: agentic os, memória persistente, contexto modular, workers,
multi-provedor, handoff, conformidade, estrutura para agentes IA.

---

## 3. Conceitos: as 5 camadas e as fontes únicas

| Camada | Pasta/Arquivo | Função |
|--------|---------------|--------|
| **Identity** | `CLAUDE.md` (ou `AGENTS.md` canônico) | Orquestrador: identidade, regras, workers, comandos |
| **Knowledge** | `context/` | Conhecimento modular por tema (ou por módulo de código) |
| **Memory** | `memory/` | `history/` (logs de sessão) + `learnings/` (aprendizados) |
| **Workers** | `workers/` | Especialistas com Papel · Função · Contexto · Schema · Restrições |
| **Automation** | `automation/` | `evaluation.json` (gates) + `guardrails.md` (ações que exigem humano) |

Peças transversais:

- `changes/` — mudanças estruturadas ativas (`changes/archive/` para as fechadas).
- `AGENTIC-OS.md` — referência rápida do sistema na raiz.
- `.claude/commands/` — wrappers finos dos comandos (a lógica vive em `automation/procedures/`).

**Princípio das fontes únicas** (o coração do sistema):

1. Uma lógica existe **uma vez** — comandos são wrappers de `automation/procedures/*.md`.
2. Um cérebro existe **uma vez** — os outros arquivos de IA são ponteiros `@import`.
3. Progresso existe **uma vez** — `tasks.md`; o handoff deriva, nunca copia (D3).
4. Estado dinâmico existe **uma vez** — `memory/handoff.md` (D6).

---

## 4. Templates — qual escolher

| Template | Para quem | Workers incluídos |
|----------|-----------|-------------------|
| `A-generico` | Conteúdo / marketing / consultoria leve | roteirista, pesquisador, analista |
| `B-saas-n8n` | SaaS + automações n8n | developer, workflow-designer, arquiteto, qa |
| `C-claude-integrado` | SaaS usando Claude Code Superpowers | developer, workflow-designer, arquiteto, revisor |
| `D-multi-provedor` | Várias IAs no mesmo projeto (Claude, Codex, Gemini…) | developer, arquiteto, qa + camada de handoff/orquestração |

Todos incluem as 5 camadas + change workflow + `/conform`. O **D** acrescenta a camada
multi-provedor completa (handoff com Orquestração, procedures provider-neutras, registry).

---

## 5. Montar ou adaptar um projeto (a skill)

A skill opera em dois modos, sempre sob o **loop de conformidade A/B** (auditoria → gate humano →
execução → re-auditoria até `PASS`, máx. 3 ciclos):

### MODO B — projeto novo

1. Fase de descoberta (tipo de projeto, stack, audiência, objetivo) — respostas viram conteúdo real, nunca placeholders.
2. Criação da estrutura completa do template escolhido.
3. Re-auditoria estrita: 100% dos itens (B1–B6 + M1–M8 se multi-provedor), zero violações D1–D7, orçamentos respeitados.
4. Só declara sucesso com `PASS` completo.

### MODO A — projeto existente

1. **Explorar** estrutura e procurar equivalentes funcionais (`PROD.md` → `context/`, `LICOES.md` → `learnings/`, `checkpoint/` → `history/`…).
2. **Gap analysis** — tabela das 5 camadas vs estado real (✅/⚠️/❌).
3. **Gate humano** — "vou criar X arquivos novos; nenhum existente será tocado".
4. **Criar só o que falta**, referenciando conteúdo original com `@` (não duplicar).
5. Re-auditoria. Violações D1–D7 só corrigidas dentro de mudança aprovada (`/propose`), nunca em silêncio.

---

## 6. Comandos — referência completa

> No Claude Code: slash commands. Em Codex/Gemini/outras IAs: pedir em linguagem natural e a IA
> lê o procedimento provider-neutro equivalente (coluna "Pedido neutro"). Os wrappers do Claude
> têm ≤ 6 linhas por design (M4/D5).

| Comando | Pedido neutro (outras IAs) | Procedimento |
|---------|----------------------------|--------------|
| `/propose <nome>` | "faz o propose <nome>" | `automation/procedures/propose.md` |
| `/worker [nome]` | "ativa o worker <nome>" | `automation/procedures/worker.md` |
| `/wrapup` | "faz o wrapup" | `automation/procedures/wrapup.md` |
| `/status` | "mostra o status" | `automation/procedures/status.md` |
| `/conform` | "corre o conform" | `automation/procedures/conform.md` |
| `/handoff` | "lê/atualiza o handoff" | `automation/procedures/handoff.md` |
| `/structure` | "monta/audita a estrutura" | `automation/procedures/structure.md` |

### 6.1 `/propose <nome>` — criar mudança estruturada

Cria `changes/<nome>/` com os artefatos que capturam porquê/como/passos **antes** de mexer no código.

**Uso:**
```text
/propose add-dark-mode          → cria changes/add-dark-mode/
/propose                        → lista mudanças ativas
```

**O que faz:**
1. Nome kebab-case (clarifica se ambíguo).
2. Ponte de brainstorming: se existe spec em `docs/superpowers/specs/*-<tema>-design.md`, pré-preenche os artefatos (referencia, não duplica).
3. Cria `proposal.md` (Porquê + Escopa entra/NÃO entra + Abordagem), `tasks.md` (checklist), `design.md` (só se não-trivial).
4. Projeto modular (`context/` com subpastas): pergunta o módulo e prefixa — `/propose add-2fa` → `changes/auth-add-2fa/` com `## Módulo: auth` no proposal.
5. `reorganize-<alvo>`: scan read-only + plano de movimentos (ver CHANGE-WORKFLOW § brownfield).
6. Marca a mudança como ativa no handoff (multi-provedor).

**Saída esperada:**
```text
Mudança 'add-dark-mode' criada.
Artefatos: proposal.md (Porquê/Escopo/Abordagem), tasks.md (6 tarefas).
Executar /worker para implementar.
```

### 6.2 `/worker [nome]` — ativar especialista e executar

**Uso:**
```text
/worker developer     → ativa o developer na mudança ativa
/worker               → lista workers disponíveis
```

Aliases por template: `developer/dev` · `arquiteto/arch` · `qa/revisor` · `roteirista` · `pesquisador` · `analista` · `workflow-designer`.

**O que faz:**
1. Lê `workers/<nome>.md` na íntegra (Papel, Função, Contexto a Carregar, Schema de Saída, Restrições).
2. Carrega **só** o contexto listado no worker (economia de tokens).
3. Detecta a mudança ativa; localiza a primeira `[ ]` em `tasks.md` (o **cursor**) e retoma aí.
4. Com Orquestração ativa: valida cursor ≤ `Limite aprovado`; além do limite → para e reporta.
5. Confirma ativação: `"Worker developer ativo. Contexto: [arquitetura, produto]. Retomando na tarefa 3 (limite: 5)."`
6. **Ao fechar cada tarefa**: marca `[x]`; grava commit sha + handoff incremental (à prova de crash); ao atingir o fim do lote → para com "aguardando aprovação".

### 6.3 `/wrapup` — consolidar a sessão

Fecha o ciclo: memória + arquivamento + deltas de conhecimento.

**O que faz (em ordem):**
1. Hora real; `git diff --stat`; branch atual.
2. Registro em `memory/history/YYYY-MM-DD-HHMM-sessao.md` (data, provedores, resumo, arquivos, decisões, pendências).
3. Aprendizados novos → `memory/learnings/YYYY-MM-DD-tema.md` (bugs resolvidos, padrões, decisões).
4. Fecha a mudança ativa: verifica tarefas; **sugere** deltas em `context/` (`+` adicionar · `~` modificar · `-` remover) — confirma item a item; aplica só o confirmado; move a pasta → `changes/archive/YYYY-MM-DD-<nome>/`.
5. Atualiza estado **estático** do cérebro (fase). Estado dinâmico → `memory/handoff.md` (D6).
6. Finaliza o handoff e confirma: `"Sessão consolidada. Registro: 2026-08-05-1430-sessao.md. Handoff atualizado."`

**Exemplo de delta sugerido:**
```text
Mudança "add-dark-mode" concluída. Sugiro atualizar context/:
  + context/produto.md     ADICIONAR à tabela de features: | Dark Mode | DONE | P2 |
  ~ context/arquitetura.md MODIFICAR diagrama: adicionar [Theme Provider]
Confirmar? [1 s/n] [2 s/n]
```

> Com Orquestração ativa, `/wrapup` é exclusivo da **coordenação**.

### 6.4 `/status` — estado do projeto

**Saída:**
```text
Branch: feat/dark-mode
Últimos commits: 90e4b56 …, 402010f …
Último provedor: Claude — 2026-08-05 14:30   (de handoff.md)
Mudança ativa: changes/add-dark-mode/ — cursor: tarefa 3
Orquestração (se ativa): limite aprovado 5 · executor Codex · aguardando aprovação? não
Fase: MVP

Features:
| Feature    | Estado |
| Dark Mode  | WIP    |

Próximos passos:
1. tarefa 3 — toggle no header
2. …
```

### 6.5 `/conform` — loop de conformidade A/B

Leva o projeto ao padrão de [CONFORMANCE-SPEC](CONFORMANCE-SPEC.md).

```text
/conform        → auditoria dry-run (read-only, sem tocar em nada)
/conform        (com aprovação) → loop completo até PASS
```

Ciclo: **A audita** (read-only) → instruction set + **gate humano** → **B aplica só o aprovado** →
**A re-audita o disco** → `PASS` ou re-instrui (máx. 3 ciclos, depois escala ao humano).
No Claude Code, A e B podem ser subagentes reais (Task/Agent); noutras IAs, um agente faz
role-switch A→B→A. Detalhes no capítulo [8](#8-loop-de-conformidade-ab).

### 6.6 `/handoff` — estado vivo multi-provedor

```text
/handoff        → LER o estado atual (última sessão, mudança ativa, narrativa)
/handoff grava  → GRAVAR o estado atual no memory/handoff.md
```

É a peça que permite a outra IA continuar exatamente onde esta parou. Capitulo completo: [7](#7-handoff-e-orquestração-de-agentes).

### 6.7 `/structure` — Motor de Estrutura da Aplicação

Organiza e audita a estrutura do **código-fonte** (não só do cérebro), de forma verificável.

```text
/structure      → auditar (dry-run): relatório de gap contra docs/STRUCTURE-SPEC.md
/structure      (com aprovação) → monta/emite a estrutura do perfil escolhido
```

**O que faz:**
1. Detecta monorepo vs standalone; projeto NOVO vs IMPLANTADO.
2. Escolhe perfil por app: `next-app` (App Router, colocação híbrida) ou `generico` (por feature). Grava o marcador (S1).
3. Cérebro: cria/atualiza `AGENTS.md` canônico + ponteiros (S2).
4. Emite regras com escopo por glob para cada agente (S3): `.cursor/rules/*.mdc` e `.github/instructions/*.instructions.md` — transpiladas de `structure-profiles/<perfil>/rules/` por `scripts/emit-rules.sh` (fonte única, zero duplicação).
5. NOVO → monta a árvore do blueprint. IMPLANTADO → **Tier 0** por padrão (código intocado); migração real opt-in via `/propose migrate-<módulo>` com gate de build.
6. Audita pelo loop A/B contra as regras S1–S7 + DS1–DS2.

---

## 7. Handoff e Orquestração de Agentes

Este é o capítulo central para projetos com **várias IAs**. A camada multi-provedor resolve dois
problemas com uma peça cada:

| Problema | Causa | Solução |
|----------|-------|---------|
| Arquivo de entrada difere por IA | Claude lê `CLAUDE.md`, Codex lê `AGENTS.md`, Gemini lê `GEMINI.md` | **Fonte única + ponteiros** |
| Não há continuidade entre sessões/IAs | Cada IA arranca "fria" | **Handoff** (`memory/handoff.md`) |
| Várias IAs avançam sem coordenação | Decisões paralelas, trabalho duplicado | **Orquestração com fronteira de aprovação** |

### 7.1 Fonte única + ponteiros

```text
              AGENTS.md   ← cérebro canônico (orquestrador, regras, ciclo, estado estático)
             /    |     \
      CLAUDE.md GEMINI.md (Codex lê AGENTS.md nativo)
       @AGENTS   @AGENTS
```

- Ponteiro é **import real** (`@AGENTS.md`), nunca prosa "por favor lê o AGENTS.md".
- Ponteiro **nunca duplica conteúdo** (D2). A integridade é verificada por `scripts/check-pointers.sh` + CI (`pointer-check`): todo ponteiro importa o canônico e o canônico nunca está vazio.
- Projeto novo → `AGENTS.md` canônico. Projeto existente → regra de precedência: cérebro ativo mantém-se; vários → o maior vence e os outros viram ponteiros; ambíguo → perguntar; nenhum → `AGENTS.md`.
- `providers/registry.md` isola COMO cada IA lê o cérebro (entrada, import suportado, limitações) — com estado "verificado" por provedor.

### 7.2 O handoff (`memory/handoff.md`)

Estado vivo lido **primeiro** por qualquer IA que arranca. Formato v1.4.0:

```markdown
# Handoff — estado vivo da sessão
> Lê isto PRIMEIRO. Validação: mudança ativa não existe, ou cursor ≠ 1ª [ ] em tasks.md,
> ou cursor além do Limite aprovado → parar e perguntar. Não improvisar. (≤ 20 linhas.)

## Sessão
- IA: [Claude|Codex|Gemini|…] · Quando: [YYYY-MM-DD HH:mm]

## Orquestração
- Orquestrador: humano (gate final) · Coordenação: [IA]
- Limite aprovado: tarefa N de tasks.md · Executor: [IA] · Aprovado por humano em: [data/hora]
- Âncora: commit <sha> da última aprovação

## Mudança ativa
- Pasta: changes/<nome>/ (ou "nenhuma")
- Cursor: 1ª [ ] em tasks.md, ≤ Limite aprovado (derivar — não copiar aqui)

## Narrativa (1 linha por campo)
- Feito: … · Decidido: … · Gotchas: … · Próxima intenção: …
```

**Princípios (anti-drift e anti-tokens):**

1. **Cursor derivado** — a próxima tarefa é a 1ª `[ ]` de `changes/<ativa>/tasks.md`. Nunca copiar a lista de tarefas para o handoff (D3): duas fontes de verdade = drift.
2. **Estado dinâmico único (D6)** — sessão/cursor/próximo passo vivem **só** aqui. O cérebro guarda apenas estado estático (fase do projeto).
3. **Âncora git** — cada tarefa fechada grava `commit <sha>`. "O que aconteceu desde então" deriva de `git diff <sha>..HEAD`, não de prosa: a narrativa encolhe porque o git já regista.
4. **Teto rígido** — ≤ 20 linhas; narrativa 1 linha por campo; **substituir, nunca acumular**. O handoff é o 2º arquivo lido em toda sessão — crescimento aqui é custo recorrente.
5. **Validação co-localizada** — a instrução de arranque vive no próprio header (custo zero no cérebro). Conflito (mudança sumiu, cursor diverge, limite violado) → **parar e perguntar**, nunca improvisar.
6. **À prova de crash** — grava **incremental ao fechar cada tarefa**, não só no wrapup. Sessão morreu sem wrapup? A próxima IA retoma na mesma a partir de `changes/` + `handoff.md`.

### 7.3 Protocolo de arranque (toda IA, sempre)

No topo do cérebro canônico, qualquer IA executa:

1. Ler `memory/handoff.md` e aplicar a validação do header (conflito → parar).
2. Abrir a mudança ativa em `changes/` e ler `tasks.md`.
3. Retomar na primeira `[ ]` (o cursor) — respeitando o `Limite aprovado` se Orquestração ativa.
4. Carregar **só** os módulos de `context/` relevantes à tarefa.

### 7.4 Orquestração — o humano como orquestrador final

**Papéis:**

| Papel | Quem | O que faz | O que NÃO faz |
|-------|------|-----------|---------------|
| **Orquestrador final** | **Humano** | Aprova lotes; palavra final sobre avançar o limite, trocar executor ou bloquear | — |
| **Coordenação** | 1 IA (registada no handoff) | `/propose`, propõe lotes (3–5 tarefas), revê via git diff, recomenda, `/wrapup` | Aprovar-se a si própria |
| **Executores** | Outras IAs | Executam **apenas** tarefas ≤ `Limite aprovado`; gravam sha + handoff por tarefa | Avançar além do lote; `/propose`/`/wrapup`; improvisar em gotcha |

**Ciclo de um lote (exemplo real):**

```text
┌ Coordenação (Claude) ────────────────────────────────────────────────────────┐
│ 1. /propose add-dark-mode → tasks.md com 8 tarefas                           │
│ 2. Propõe lote: "tarefas 1–4 para o Codex"                                   │
│ 3. Regista no handoff: Limite aprovado: 4 · Executor: Codex · Âncora: a1b2c3 │
└──────────────────────────────────────────────────────────────────────────────┘
         ↓ pedido de aprovação
┌ Humano ──────────────────────────────┐
│ 4. "Aprovado."                        │
│    → aprovação registada no handoff   │
│      ("Aprovado por humano em: …")    │
└───────────────────────────────────────┘
         ↓
┌ Executor (Codex) ────────────────────────────────────────────────────────────┐
│ 5. /worker developer → retoma na tarefa 1 (cursor)                           │
│ 6. Fecha tarefa: marca [x], grava sha, atualiza narrativa. Repete.           │
│ 7. Tarefa 4 concluída = fim do lote → PARA: "aguardando aprovação".          │
└──────────────────────────────────────────────────────────────────────────────┘
         ↓
┌ Coordenação (Claude) ────────────────────────────────────────────────────────┐
│ 8. Revê: git diff a1b2c3..HEAD  (barato — o git conta a história)            │
│ 9. Recomenda: "aprovar lote; próximo lote 5–8 para Gemini"                   │
└──────────────────────────────────────────────────────────────────────────────┘
         ↓
┌ Humano ──────────────────────────────┐
│ 10. Aprova → limite avança para 8    │
│     (nova âncora registada)          │
└──────────────────────────────────────┘
```

**Regras invioláveis da Orquestração:**

1. `Limite aprovado` **só avança com aprovação humana registada** no handoff (D7). Tarefa `[x]` além do limite = DRIFT auditável.
2. Executor nunca improvisa além do lote; **gotcha → parar e registar**, nunca contornar.
3. `/propose` e `/wrapup` exclusivos da coordenação; executores só `/worker`.
4. A secção `## Orquestração` nunca copia a lista de tarefas — só limite (índice), executor, âncora.
5. Revisão de lote sempre via `git diff <âncora>..HEAD` — a âncora é a fonte, não a memória da IA.

**Opt-in:** a Orquestração está ativa quando o handoff tem a secção `## Orquestração`. Sem ela,
vale o **modo livre** (comportamento anterior: cada sessão retoma pelo cursor, sem fronteira).
O template D já inclui a secção; a skill adiciona-a em projetos novos/adaptados quando pedido.

### 7.5 Handoff entre provedores diferentes

| Situação | Mecânica |
|----------|----------|
| Claude → Codex (mesma mudança) | Claude grava handoff ao fechar a tarefa; Codex arranca pelo protocolo (7.3) e retoma no cursor |
| Troca a meio de tarefa | Registar em **Gotchas** ("tarefa 3 a meio: falta o teste"); próxima IA decide repetir ou continuar |
| Sessão morreu sem `/wrapup` | Handoff já estava gravado incrementalmente (por tarefa) — a próxima IA retoma igual |
| Duas IAs pedem trabalho ao mesmo tempo | Executores são serializados pela fronteira: um lote por executor; a coordenação não delega o mesmo intervalo duas vezes |

### 7.6 Troubleshooting do handoff

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| IA recomeçou do zero | Não leu o handoff no arranque | Executar protocolo 7.3; verificar se o ponteiro da IA importa o canônico (`check-pointers.sh`) |
| Narrativa contradiz `tasks.md` | Alguém editou tarefas sem atualizar o cursor derivado | Conflito de arranque → a IA deve parar e perguntar; resolver no `tasks.md` (fonte única) |
| Handoff > 20 linhas | Acumulação em vez de substituição | Reescrever substituindo; a auditoria M5 marca DRIFT |
| Tarefa `[x]` além do limite | Executor avançou sem gate | DRIFT D7 — reverter ou formalizar retroativamente **com aprovação humana** |
| Handoff desatualizado após crash | Worker não gravou incrementalmente | Retomar pelo cursor de `tasks.md` + `git log`; registar gotcha; reforçar passo 6 do worker |

### 7.7 Custos de token da camada

O desenho é deliberadamente barato por sessão:

- Cérebro: ≤ 150 linhas, lido uma vez (ou importado).
- Handoff: ≤ 20 linhas (o 2º arquivo mais quente; teto auditável).
- Contexto: carregado sob demanda por tarefa.
- Revisões da coordenação: `git diff` desde a âncora — sem reler o projeto.
- Procedures: frias — lidas só quando a intenção correspondente ocorre.

---

## 8. Loop de Conformidade A/B

Mecanismo auto-corretivo que constrói/adapta o projeto até bater **exatamente** o padrão de
[CONFORMANCE-SPEC](CONFORMANCE-SPEC.md) — usado pela skill e disponível a qualquer momento via `/conform`.

**Papéis:** **A = Auditor** (read-only; classifica `CONFORME | FALTA | DRIFT`; emite instruction set) ·
**B = Executor** (aplica **só** o aprovado, sem scope creep).

**Ciclo:**
```text
A audita (vs SPEC) → instruction set + AUTORIZAÇÃO humana
   → B executa só o aprovado → A re-audita o DISCO
      → PASS? sai do loop : re-instrui B com o delta (máx. 3 ciclos; depois escala)
```

- Gate humano obrigatório antes do 1º B e sempre que B tocar algo coberto pelos guardrails.
- A verifica o **resultado real no disco**, não a narrativa de B.
- Portável: no Claude Code, A e B podem ser subagentes reais (isolamento genuíno); em Codex/Gemini, um agente faz role-switch A→B→A seguindo `procedures/conform.md`.

**Critérios:** NOVO = 100% dos itens (B1–B6 + M1–M8) + zero D1–D7 + orçamentos. EXISTENTE = itens
necessários aplicados + zero arquivos pré-existentes movidos/apagados sem aprovação + integridade intacta.

---

## 9. Motor de Estrutura da Aplicação

Enquanto o resto organiza o **cérebro**, o Motor (`/structure`) organiza e audita o **código-fonte** —
multi-stack e multi-agent, verificável.

- **Perfis** em `structure-profiles/`: `next-app` (App Router; colocação híbrida C: `_components/_actions/_data-access` por rota + promoção de compartilhados) e `generico` (fallback por feature). Cada perfil = `blueprint.md` + `rules/` (fonte única provider-neutra).
- **Regra única → todos os agentes**: `scripts/emit-rules.sh` transpila as regras para Cursor (`.cursor/rules/*.mdc`) e Copilot (`.github/instructions/*.instructions.md`). `scripts/check-rules-sync.sh` + CI garantem que o emitido nunca divirja da fonte (DS1).
- **Regras verificáveis**: S1–S7 (perfil declarado, cérebro canônico, regras sincronizadas, colocação, server-first [WARN], validação Zod, auth em profundidade) + DS1–DS2 (fonte única, gate de build) em [STRUCTURE-SPEC](STRUCTURE-SPEC.md).
- **Brownfield seguro** ([STRUCTURE-MIGRATION](STRUCTURE-MIGRATION.md)): Tier 0 (só convenções — default, risco zero) → Tier 1 (auditoria read-only) → Tier 2 (migração incremental por módulo, reference-safe, gate de build com rollback) → Tier 3 (reorg completo, raros casos).

---

## 10. Ciclo diário — do zero ao wrapup

```text
1. Abrir o agente na pasta do projeto
   → cérebro carrega automático (CLAUDE.md ou ponteiro → AGENTS.md)
2. "vamos começar"
   → agente lê handoff/history + estado; retoma no cursor
3. /propose add-dark-mode
   → changes/add-dark-mode/ (proposal + tasks [+ design])
   → multi-provedor com Orquestração: humano aprova o 1º lote (fronteira)
4. /worker developer
   → executa tarefa a tarefa; cada fechamento marca [x] + grava handoff (+ sha)
5. /wrapup
   → history + learnings + deltas de context/ (confirmados) + arquivo + handoff final
6. Fechar a janela
   → Stop hook grava lembrete automático em memory/history/
```

Memory/learnings crescem com o tempo via `/wrapup`. `context/` e `workers/` evoluem manualmente.
O cérebro mantém-se estável — **são as regras, não a memória**.

---

## 11. Stop hook (lembrete automático de fim de sessão)

Ao fechar a sessão, um hook grava um lembrete em `memory/history/YYYY-MM-DD-HHMM-sessao.md`:
*"Sessão encerrada automaticamente. Executar /wrapup para consolidar."*

- **Padrão portátil** (`sh`): macOS, Linux e Windows com Git Bash; usa `$CLAUDE_PROJECT_DIR`.
- **Alternativa PowerShell**: Windows nativo sem shell POSIX. Instalar **só uma** variante (a skill detecta o SO e pede confirmação antes de alterar settings).
- O nome com `HHMM` evita colisão entre duas sessões na mesma hora.

---

## 12. Regras invioláveis e orçamentos

**Anti-drift (qualquer uma força FAIL na auditoria):**

| # | Regra |
|---|-------|
| D1 | Sem `commands/` na raiz duplicando `.claude/commands/` + `procedures/` |
| D2 | Ponteiro nunca duplica o cérebro |
| D3 | Handoff nunca copia a lista de tarefas (cursor derivado) |
| D4 | `evaluation.json` reflete os provedores reais |
| D5 | Uma só fonte por lógica de comando |
| D6 | Estado dinâmico único: `memory/handoff.md` |
| D7 | Fronteira de aprovação: nada além do `Limite aprovado` sem gate humano |

**Orçamentos (concisão é gate):** cérebro canônico ≤ 150 linhas · handoff ≤ 20 · wrappers ≤ 6.

**Guardrails típicos** (`automation/guardrails.md`): deletar/mover arquivos, alterar estrutura do
cérebro, aplicar deltas de `context/` e ações irreversíveis em produção exigem confirmação humana;
ler/escrever em `memory/`, `changes/`, `projects/` é automático. Em dúvida → **parar e perguntar**.

---

## 13. FAQ / gotchas

**A skill não ativou.** Mencionar explicitamente: "agentic os", "adaptar projeto ao padrão", "montar agentic os". Verificar instalação e reinício do Claude Code.

**Posso usar sem git?** Sim, mas perdem-se a âncora de commit do handoff e a segurança de rollback das reorganizações. Recomendado: git desde o dia 1.

**Single-IA precisa de handoff?** Não — o handoff é peça da camada multi-provedor. Em single-IA, o estado dinâmico fica no próprio orquestrador (comportamento clássico).

**O executor ignorou o limite.** É convenção, não coerção — mitigado pela validação de arranque (para e pergunta) e pela auditoria (D7 = DRIFT). Tratar como incidente de processo e formalizar retroativamente só com aprovação humana.

**Migração de projeto flat → modular.** Via `/propose reorganize-context-modular` — nunca deleta, usa quarentena + `MOVES.md` para rollback.

**Windows sem Git Bash para o Stop hook.** Usar a variante PowerShell documentada no SKILL (a skill instala a correta).

**Credenciais.** Sempre variáveis de ambiente — nunca em `context/`, `memory/` ou nos cérebros.

---

*Agentic OS v1.4.0 · Este guia vive em `docs/USAGE.md`; updates acompanham o RELEASE-NOTES.*
