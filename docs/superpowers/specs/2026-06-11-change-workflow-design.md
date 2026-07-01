# Spec: Change Workflow no Agentic OS

**Data**: 2026-06-11
**Estado**: Aprovado para planejamento
**Inspiração**: [OpenSpec](https://github.com/Fission-AI/OpenSpec) (artefato-por-mudança, deltas brownfield)

---

## Problema

O plugin Agentic OS organiza memória persistente (context/, memory/, workers/) mas
não tem estrutura por **mudança/feature**. Cada tarefa é difusa: ativa-se um worker,
trabalha-se, faz-se `/wrapup`. Não há artefato que capture *porquê* + *o quê* + *passos*
antes de codar. Resultado: requisitos vivem só no chat, igual ao problema que o OpenSpec resolve.

## Objetivo

Adicionar uma **camada de mudança estruturada** ACIMA do fluxo worker/wrapup existente,
sem remover nada. Brownfield — projetos atuais continuam a funcionar igual.

## Alinhamento com OpenSpec (core profile)

OpenSpec `core` = `propose · explore · apply · sync · archive`. Mapeamento p/ o nosso:

| OpenSpec | Agentic OS | Nota |
|----------|-----------|------|
| `/opsx:explore` | `superpowers:brainstorming` (já existe) + **ponte de formato** | Fase exploratória antes de propor — reutilizamos, mas convertemos o output |
| `/opsx:propose` | `/propose` (novo) | Cria pasta + artefatos |
| `/opsx:apply` | `/worker` (existente) | Execução das tasks |
| `/opsx:sync` | passo dentro de `/wrapup` | Merge de deltas no source-of-truth (context/) — semi-auto, humano confirma |
| `/opsx:archive` | passo dentro de `/wrapup` | Move pasta p/ archive/ |

**Filosofia herdada**: fluido, não-linear. Dependências (proposal→design→tasks) são
*enablers*, não gates rígidos. Qualquer artefato pode ser atualizado a qualquer hora.
Alinha com o princípio "fluid not rigid" do OpenSpec e o "no rigid phase gates" do Agentic OS.

**Customização**: os templates de `proposal.md`/`tasks.md`/`design.md` são editáveis por
projeto (equivalente ao `schema.yaml` + `templates/*.md` do OpenSpec) — instruções não ficam
escondidas em código.

### Ponte de formato: brainstorming → artefatos

`superpowers:brainstorming` produz uma spec própria em
`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`. Essa spec é a **fonte exploratória**,
mas NÃO é o formato operacional do Agentic OS. `/propose` faz a conversão:

```
brainstorming  →  docs/superpowers/specs/<topic>-design.md   (exploração, livre)
                          ↓  /propose extrai e converte
changes/<nome>/  →  proposal.md  (Porquê/Escopo/Abordagem ← da spec)
                    tasks.md     (checklist ← dos critérios de sucesso/passos)
                    design.md    (decisões técnicas ← se a spec tiver)
```

Regra: se já existe uma spec de brainstorming sobre o tema, `/propose` lê-a e pré-preenche
os artefatos (sem duplicar — proposal.md referencia a spec com link). Se não existe,
`/propose` gera os artefatos do zero a partir do nome/descrição.

## Não-objetivos (YAGNI)

- Sem `/apply` nem `/archive` como comandos separados — `/wrapup` arquiva.
- Sem `specs/` delta como arquivos separados (não copiar a estrutura completa do OpenSpec).
- Sem validação estrutural automática nesta versão.
- Sem merge automático de deltas — humano confirma sempre.
- Workers, context, memory, automation permanecem intactos.

---

## Design

### Nova pasta: `changes/`

```
changes/
├── <nome-da-mudanca>/
│   ├── proposal.md      # porquê + escopo + abordagem (alto nível)
│   ├── design.md        # decisões técnicas — só se mudança não-trivial
│   └── tasks.md         # checklist de implementação
└── archive/
    └── YYYY-MM-DD-<nome>/   # mudanças fechadas
```

Uma mudança = uma pasta. Múltiplas mudanças podem coexistir em paralelo sem conflito.

### Fluxo conectado (camada acima)

```
/propose "ideia"  → cria changes/<nome>/ (proposal + tasks; design se preciso)
       ↓
/worker [nome]    → executa DENTRO da mudança ativa (lê tasks.md, marca ✓ ao concluir)
       ↓
/wrapup           → detecta mudança ativa → move p/ changes/archive/
                    + grava history/ + learnings/
                    + SUGERE deltas em context/ (humano confirma item a item)
                    + atualiza CLAUDE.md "Estado do Projeto"
```

### Comandos

**Apenas 1 comando novo: `/propose`.** Os outros dois são atualizados.

| Comando | Estado | Comportamento |
|---------|--------|---------------|
| `/propose <nome>` | **novo** | Cria `changes/<nome>/`. Gera `proposal.md` (intent/scope/abordagem) e `tasks.md` (checklist). Cria `design.md` só se a mudança for técnica/não-trivial. Se escopo ambíguo, pergunta antes de criar. |
| `/worker [nome]` | atualizado | Passo extra: detecta mudança ativa em `changes/`, carrega `tasks.md` como contexto, marca tarefas concluídas durante o trabalho. |
| `/wrapup` | atualizado | Passo extra: se há mudança ativa → arquiva pasta p/ `changes/archive/YYYY-MM-DD-<nome>/` e sugere updates em `context/` (formato delta), humano confirma. |

### Delta semi-automático (no /wrapup)

`/wrapup` analisa a mudança fechada e propõe ao humano, sem aplicar sozinho:

```
Mudança "add-dark-mode" fechada. Sugiro atualizar context/:
  + produto.md   ADICIONAR feature "Dark Mode" à tabela de features
  ~ arquitetura.md  MODIFICAR — novo theme provider no diagrama
Confirmar? [s/n por item]
```

Notação delta: `+` ADICIONAR · `~` MODIFICAR · `-` REMOVER (inspirado em ADDED/MODIFIED/REMOVED do OpenSpec).

#### Exemplo end-to-end: `add-dark-mode`

**1. `/propose add-dark-mode`** cria `changes/add-dark-mode/`:

`proposal.md`
```markdown
# Mudança: add-dark-mode

## Porquê
Usuários pedem tema escuro; reduz fadiga visual e alinha com concorrência.

## Escopo
- Toggle claro/escuro no header
- Persistência da preferência (localStorage)
- NÃO entra: temas customizados pelo usuário

## Abordagem
Theme provider via CSS variables, toggle persiste em localStorage.
```

`tasks.md`
```markdown
# Tarefas: add-dark-mode

- [ ] 1. Adicionar theme provider (context) + CSS variables
- [ ] 2. Criar componente Toggle no header
- [ ] 3. Persistir preferência em localStorage
- [ ] 4. Testar troca de tema sem flash
```

**2. `/worker developer`** executa, marca `[x]` à medida que conclui.

**3. `/wrapup`** detecta mudança concluída → arquiva + sugere delta:

```
Mudança "add-dark-mode" concluída. Sugiro atualizar context/:

  + context/produto.md
    ADICIONAR à tabela "Funcionalidades Core":
    | Dark Mode | DONE | P2 |

  ~ context/arquitetura.md
    MODIFICAR diagrama: adicionar [Theme Provider] na camada Frontend

  + context/stack.md
    ADICIONAR nota: preferência de tema persistida em localStorage

Confirmar atualização? [1=produto.md s/n] [2=arquitetura.md s/n] [3=stack.md s/n]
```

Humano aprova item a item. Aprovados → editados em `context/`. Pasta movida p/
`changes/archive/2026-06-11-add-dark-mode/`. Registro em `memory/history/` + `memory/learnings/`.

### Artefatos por mudança (formato)

**proposal.md**
```markdown
# Mudança: <nome>

## Porquê
[1-3 frases: problema/oportunidade]

## Escopo
- [o que entra]
- [o que NÃO entra]

## Abordagem
[alto nível, 1 parágrafo]
```

**tasks.md**
```markdown
# Tarefas: <nome>

- [ ] 1. [tarefa]
- [ ] 2. [tarefa]
```

**design.md** (opcional, só não-trivial)
```markdown
# Design técnico: <nome>

## Decisões
| Decisão | Motivo | Alternativas |
|---------|--------|--------------|

## Riscos
- [risco]
```

---

## Reorganização de projetos existentes (brownfield)

O plugin deve poder **organizar projetos já em funcionamento**: arrumar pastas, consolidar
documentação dispersa, identificar e agrupar arquivos redundantes — **sem corromper o projeto
em produção**. Isto reusa o change-workflow: uma reorganização É uma mudança.

### Fluxo: `/propose reorganize-<alvo>`

1. **Scan (read-only)** — mapeia a estrutura atual: pastas, docs soltos, arquivos duplicados
   ou redundantes, READMEs múltiplos, configs espalhadas. Nada é tocado.
2. **Plano de reorganização** — gera `changes/reorganize-<alvo>/proposal.md` + `tasks.md`
   listando CADA movimento proposto como uma linha explícita:
   ```
   - [ ] MOVER  docs/old-api.md        → docs/archive/old-api.md   (substituído por api-v2.md)
   - [ ] AGRUPAR notas-*.md (3 arquivos) → docs/notas/            (dispersos na raiz)
   - [ ] MARCAR  config.bak.json        → redundante (idêntico a config.json)
   ```
3. **Aprovação humana** — usuário confirma o plano inteiro ou item a item.
4. **Execução segura** (`/worker`) — aplica só os itens aprovados.

### Regras de segurança (invioláveis)

- **Nunca deletar.** Arquivos redundantes são **movidos** para `_quarantine/` (ou
  `docs/archive/`), nunca apagados. Deleção real só com confirmação explícita posterior do humano.
- **Nunca mover código sem verificar referências.** Antes de mover qualquer arquivo, procurar
  imports/links que apontem para ele. Se houver referências, ou atualizar todas, ou não mover.
- **Verificar estado git primeiro.** Se for repo git, exigir working tree limpo (ou aviso) antes
  de reorganizar — assim qualquer movimento é reversível via git.
- **Backup do que se move.** Registrar o mapa origem→destino em
  `changes/reorganize-<alvo>/MOVES.md` para rollback manual.
- **Dry-run por padrão.** O scan e o plano nunca alteram nada; só `/worker` após aprovação move.
- **Em dúvida → parar e perguntar.** (princípio do guardrails.md)

### Detecção de redundância

Critérios para marcar arquivo como redundante (sugestão, humano decide):
- Conteúdo idêntico (hash igual) a outro arquivo
- Backup óbvio (`.bak`, `~`, `-copy`, `-old`, datado e superseded)
- Doc que outro doc mais recente cobre integralmente (sobreposição semântica)

Nunca marcar automaticamente como redundante: arquivos referenciados por código,
configs ativas, ou qualquer coisa fora de `docs/`/notas sem análise de referências.

### Integração com a skill (MODO A)

A skill `agentic-os` já tem "MODO A: Analisar e Adaptar Projeto Existente" com a Regra de Ouro
"só criar, nunca mover/deletar". Esta capacidade **estende** o MODO A: passa a permitir
mover/agrupar **através do change-workflow com aprovação**, mantendo a Regra de Ouro como
default (movimentos só acontecem dentro de uma mudança aprovada, nunca silenciosamente).

## Documentação

Fonte única, renderiza nativo no GitHub:

- **`docs/CHANGE-WORKFLOW.md`** (novo) — conceito, pasta `changes/`, ciclo completo,
  delta semi-auto, exemplos end-to-end. Referência única.
- **`AGENTIC-OS.md`** de cada template — seção curta que **referencia** o doc acima (não duplica).
- **`README.md`** do repo (criar se não existir) — link p/ o doc.

---

## Escopo de rollout

Aplicar a **3 templates + skill + docs**:

| Alvo | Alteração |
|------|-----------|
| `template/A-generico/` | pasta `changes/` + `changes/archive/` (.gitkeep); `.claude/commands/propose.md`; atualizar wrapup.md + worker.md; CLAUDE.md ganha `/propose` na tabela; AGENTIC-OS.md seção |
| `template/B-saas-n8n/` | idem A |
| `template/C-claude-integrado/` | idem A |
| `skill/agentic-os/SKILL.md` | MODO B: criar `changes/` na estrutura nova. MODO A: passo p/ adicionar workflow a projeto existente **+ capacidade de reorganização brownfield (mover/agrupar/redundância via mudança aprovada)** |
| `docs/CHANGE-WORKFLOW.md` | novo doc fonte-única |
| `README.md` | criar com link p/ doc (se não existir) |

---

## Critérios de sucesso

1. `/propose dark-mode` cria `changes/dark-mode/` com proposal + tasks nos 3 templates.
2. `/worker developer` detecta e carrega a mudança ativa.
3. `/wrapup` arquiva a mudança e sugere deltas em context/ com confirmação humana.
4. Projetos Agentic OS existentes não quebram (brownfield).
5. `docs/CHANGE-WORKFLOW.md` explica o ciclo completo com exemplo executável.
6. Se existe spec de brainstorming sobre o tema, `/propose` pré-preenche os artefatos a partir dela (ponte de formato).
7. `/propose reorganize-<alvo>` num projeto existente gera plano de movimentos sem tocar arquivos; só `/worker` após aprovação move; nada é deletado; referências de código são verificadas antes de mover.
