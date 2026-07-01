# Conformance Spec — o padrão desenhado (verificável)

> Fonte da verdade objetiva que o **Agente A (auditor)** usa para decidir PASS/FAIL.
> Um projeto está "no padrão" quando satisfaz esta spec para o seu modo (NOVO ou EXISTENTE).
> Loop que consome esta spec: [`CONFORMANCE-LOOP.md`](CONFORMANCE-LOOP.md).

O auditor percorre cada item e marca **`CONFORME` | `FALTA` | `DRIFT`**.
`FALTA` = peça do padrão ausente. `DRIFT` = existe mas viola o padrão (pior que faltar).

---

## Camadas base (sempre exigidas)

| # | Camada | Item exigido | Verificação |
|---|--------|--------------|-------------|
| B1 | Identity | Orquestrador existe (`CLAUDE.md` ou cérebro canônico) com Identidade + Módulos + Workers + Regras + Estado | Arquivo presente, seções presentes |
| B2 | Knowledge | `context/` com ≥1 módulo `.md` real (não placeholder genérico) | Pasta + conteúdo específico do projeto |
| B3 | Memory | `memory/history/` **e** `memory/learnings/` existem | Ambas as pastas presentes |
| B4 | Workers | `workers/` com ≥1 worker no formato: Papel · Função · Contexto a Carregar · Schema de Saída · Restrições | Cada worker tem as 5 seções |
| B5 | Automation | `automation/evaluation.json` **e** `automation/guardrails.md` | Ambos presentes; guardrails lista ações que exigem confirmação humana |
| B6 | Referência | `AGENTIC-OS.md` na raiz (tabela de estrutura + comandos + ciclo) | Presente |

## Camada Multi-Provedor (exigida só quando opt-in ativo)

Ativa quando o projeto declara multi-IA (existe `AGENTS.md` canônico + ponteiros, ou o usuário pediu).

| # | Item exigido | Verificação |
|---|--------------|-------------|
| M1 | **Um** cérebro canônico (default `AGENTS.md`) com Protocolo de Arranque de Sessão | Arquivo único marcado canônico |
| M2 | Ponteiros finos (`CLAUDE.md`, `GEMINI.md`) que fazem `@import` do canônico | Ponteiro tem `@<canônico>` e **não** duplica conteúdo |
| M3 | `automation/procedures/{propose,worker,wrapup,status,handoff}.md` — fonte única da lógica | 5 procedimentos presentes |
| M4 | `.claude/commands/*` são **wrappers finos** que apontam para `procedures/` | Cada wrapper ≤ ~6 linhas, referencia o procedimento |
| M5 | `memory/handoff.md` — estado vivo; cursor **derivado** da 1ª `[ ]` em `changes/<ativa>/tasks.md` | Presente; handoff **não** copia lista de tarefas |
| M6 | `providers/registry.md` — arquivo de entrada + import + limitações por IA | Presente |
| M7 | `changes/` + `changes/archive/` | Ambas presentes |

---

## Regras anti-drift invioláveis (qualquer uma → FAIL)

- **D1 — Sem `commands/` na raiz** duplicando `.claude/commands/` + `automation/procedures/`.
  Três fontes da mesma lógica = drift garantido. (Erro real observado em `.projeto1`.)
- **D2 — Ponteiro nunca duplica o cérebro.** `CLAUDE.md`/`GEMINI.md` só apontam; conteúdo vive no canônico.
- **D3 — Handoff nunca copia a lista de tarefas.** O cursor é derivado; `tasks.md` é a única verdade do progresso.
- **D4 — `evaluation.json` reflete os provedores reais**, não só um (ex.: `platform: "Codex"` sozinho num projeto multi-IA = drift).
- **D5 — Uma só fonte por lógica de comando.** Se existe `procedures/x.md`, o wrapper não reimplementa a lógica.

---

## Critério de sucesso por modo

### NOVO (MODO B) — estrito
- **100%** dos itens base (B1–B6) + Multi-Provedor (M1–M7 se opt-in) = `CONFORME`.
- **Zero** violações D1–D5.
- Estrutura criada do zero, limpa; conteúdo real (não placeholder).
- O skill **não declara sucesso** sem re-auditoria `PASS` completa.

### EXISTENTE (MODO A) — necessário + integridade
- Todos os itens de conformidade **necessários** aplicados (o que faltava foi criado/ponteirado).
- **Zero** arquivos pré-existentes movidos / renomeados / apagados **sem aprovação** explícita.
- Integridade do projeto intacta: código da app inalterado, app continua a correr, git limpo salvo o aprovado.
- Poder do plugin presente: memory + context + workers + (handoff/procedures se multi-IA).
- Violações D1–D5 **só** são corrigidas dentro de uma mudança aprovada (nunca silenciosamente).

---

## Saída do auditor (schema)

```json
{
  "mode": "NOVO | EXISTENTE",
  "multi_provider": true,
  "resultado": "PASS | FAIL",
  "divergencias": [
    { "id": "M4", "estado": "DRIFT", "detalhe": "commands/ na raiz duplica procedures", "necessario": true }
  ],
  "instrucoes_para_B": ["remover commands/ raiz após confirmar wrappers em .claude/commands/", "..."],
  "requires_user_approval": true
}
```
