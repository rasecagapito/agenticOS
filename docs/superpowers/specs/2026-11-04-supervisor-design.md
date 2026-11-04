# Supervisor de qualidade (nota 0–10) — Parte 2 da Governança GitHub

> Status: aprovado em conversa (2026-11-04). Base: Prompt Mestre v2.0, seção "EM ANDAMENTO", e a camada F
> entregue na v1.9.0 (`docs/superpowers/specs/2026-11-03-wizard-governanca-design.md`).
> Versão alvo: **v1.10.0** (painel segue 1.2.1).

## 1. Objetivo

Entre "código pronto na branch do cartão" e "PR aberto", um **Supervisor independente** revisa a entrega e
dá nota de 0 a 10 com base em **critérios objetivos com prova**. O PR só abre com nota 10 — ou com a
liberação explícita do usuário, registrada e visível no PR.

Analogia: o fiscal de obra (Supervisor) usa uma prancheta (script). O que dá para medir, a prancheta mede
sozinha; o que exige julgamento, o fiscal julga, sempre anotando a prova. Quem soma a nota é a prancheta.

## 2. Decisões (aprovadas pelo usuário)

| # | Decisão |
|---|---|
| D1 | Supervisor = **subagente separado, sem edição** (Claude Code). Em Codex/Gemini: o mesmo agente troca de papel lendo o mesmo arquivo do agente. |
| D2 | Supervisor usa **sempre Opus, fixo**, sem passar pelo roteador Jev (a fiscalização não pode ser rebaixada). |
| D3 | Critérios em **duas camadas**: base fixa (todo cartão) + critérios de aceite do cartão (`proposal.md`). |
| D4 | Nota = **⌊10 × atendidos ÷ total⌋**. Cada critério é `atendido` ou `nao_atendido`; **sem prova = não atendido**. Só 10 libera sem decisão humana. |
| D5 | Revisão **antes do PR**, com a nota **presa ao commit** revisado. Commit novo invalida a nota (exceto mudança só no `docs/tasks/TASK-<ID>-*.md`). |
| D6 | Uma rodada = revisão inicial + até 2 correções (3 notas). Na 3ª nota < 10 **o cartão não trava**: o orquestrador avisa e **pergunta ao usuário**: seguir com a nota atual ou nova análise (nova rodada). Nunca decide sozinho. |
| D7 | Quem decide a nota não é o Jev nem o Supervisor: o **script** calcula; o Supervisor só julga critérios com prova; o **usuário** decide exceções. |

**Divergência registrada do Prompt Mestre:** o Prompt Mestre manda manter a atividade bloqueada após dois
ciclos e exige "10/10 comprovada" para concluir. Por decisão do usuário, após a 3ª nota < 10 ele escolhe
seguir ou nova análise; a regra de conclusão (Partes 3–4) passa a ser "nota 10 **ou** exceção autorizada
pelo usuário e registrada".

## 3. Critérios

### 3.1 Base fixa — medidos pelo script (sem IA)

| ID | Critério | Prova |
|---|---|---|
| B1 | Testes do projeto passam (`comando_testes` da ficha; limite 10 min) | código de saída + últimas 40 linhas da saída |
| B2 | Nenhum segredo no diff da branch vs. principal | lista de achados `arquivo:linha` (texto mascarado) ou "0 achados" |
| B3 | Trabalho na branch do cartão; principal intocada | branch atual, `merge-base`, commits à frente |
| B4 | `docs/tasks/TASK-<ID>-*.md` existe e `changes/<ID>-*/proposal.md` tem `## Critérios de aceite` com ≥ 1 item | caminhos dos arquivos |

- Sem `comando_testes` → B1 `nao_atendido`, prova "comando de testes não configurado".
- Tempo esgotado → B1 `nao_atendido`, prova "tempo esgotado (10 min)".
- B2 usa padrões de chave/token/senha (AWS, GitHub `ghp_`/`github_pat_`, `sk-`, chave privada PEM,
  `password=`/`senha=`/`api_key=` com valor literal). Texto exato listado em
  `.agentic-os/segredos-permitidos.txt` (editado só pelo usuário) é ignorado; o PR lista o que foi liberado.
- Sem a seção `## Critérios de aceite`, `review-check` **para** com erro `SEM_CRITERIOS` (não há o que revisar).

### 3.2 Base fixa — julgados pelo Supervisor (com prova)

| ID | Critério |
|---|---|
| G1 | Nenhuma regra de `automation/guardrails.md` violada no diff |
| G2 | Documentação afetada atualizada (README/docs/context do que mudou) |
| E* | Cada gate em `automation/evaluation.json` → `gates.revisao_cartao` (lista de textos), se existir |

### 3.3 Critérios do cartão — julgados pelo Supervisor

Cada item (`- ...`) da seção `## Critérios de aceite` do `proposal.md` vira `C1..Cn`, na ordem.

## 4. Peças

| Peça | Responsabilidade |
|---|---|
| `scripts/governanca/supervisor.mjs` | checagens B1–B4, leitura dos critérios, validação do parecer, cálculo da nota, estado da revisão, decisão |
| `scripts/governanca/segredos.mjs` | varredura de segredos no diff (B2) |
| `scripts/github-setup.mjs` | subcomandos `review-check`, `review-record`, `review-decide` |
| `scripts/governanca/cartao.mjs` | `cardPr` exige revisão válida; corpo do PR e TASK recebem a tabela |
| `template/F-governanca/.claude/agents/supervisor.md` | subagente: `model: opus`, ferramentas `Read, Grep, Glob, Bash` (sem `Edit`/`Write`), esquema do parecer |
| `template/F-governanca/automation/procedures/cartao.md` | novo `/cartao revisar <ID>`; plano exige `## Critérios de aceite` |
| `scripts/install-governanca.mjs` | copia o agente; `.gitignore` ganha `.agentic-os/supervisor/` |
| `skills/agentic-os/wizard.md` | etapa de `comando_testes` (detecta por `package.json`/`pyproject`/`Makefile` e confirma); aviso de custo do Opus |
| ficha `governanca.json` | campo novo `comando_testes` (string ou `null`) |

## 5. Fluxo — `/cartao revisar <ID>`

1. **`review-check <ID>`**
   - Exige árvore limpa (`ARVORE_SUJA`) e branch do cartão (`BRANCH_ERRADA`).
   - Se o estado está `aguardando_decisao` → erro `AGUARDA_DECISAO` (pergunte ao usuário).
   - Roda B1–B4, lê critérios G/E/C, grava em `.agentic-os/supervisor/<ID>.json` a revisão pendente
     `{commit, base:[...], criterios:[{id, texto}]}` e devolve isso + `rodada`, `ciclo`.
2. **Orquestrador chama o subagente `supervisor`** com: ID, commit, intervalo do diff
   (`<merge-base>..<commit>`), resultados B1–B4 (só leitura, não reavalia) e a lista G/E/C.
   O subagente devolve o parecer (JSON):
   ```json
   { "commit": "<sha>", "criterios": [ { "id": "C1", "status": "atendido", "prova": "src/x.mjs:42 — ..." } ],
     "resumo": "1 linha" }
   ```
   Ele grava o parecer no arquivo indicado pelo orquestrador **via saída**, não editando o projeto: o
   orquestrador salva a resposta em `.agentic-os/supervisor/<ID>-parecer.json`.
3. **`review-record <ID> --parecer <arq>`**
   - Recusa se `parecer.commit` ≠ commit da revisão pendente ≠ `HEAD` (`PARECER_INVALIDO`).
   - Resultados B1–B4 vêm **só** da revisão pendente (o parecer não pode sobrescrevê-los).
   - Critério pendente ausente no parecer, status fora de `atendido|nao_atendido` ou `prova` vazia →
     `nao_atendido`. JSON ilegível → `PARECER_INVALIDO`.
   - Calcula a nota, incrementa `ciclo`, grava o histórico, comenta no cartão (issue):
     "Supervisor — rodada R, ciclo C: nota N/10 (commit abc1234)" + critérios não atendidos.
   - Devolve `{nota, ciclo, rodada, pendentes:[...], proximo}` onde `proximo` ∈
     `pronto_para_pr` (nota 10) · `corrigir` (nota < 10 e ciclo < 3) · `decisao_usuario` (nota < 10 e ciclo = 3).
4. **`corrigir`** → orquestrador passa ao executor (`/worker`) **só os critérios pendentes**; executor corrige,
   commita; volta ao passo 1.
5. **`decisao_usuario`** → orquestrador mostra nota, pendentes, provas e o que foi tentado, e pergunta:
   - "Seguir com nota N" → com o "sim": `review-decide <ID> --seguir --motivo "..."`.
   - "Nova análise" → com o "sim": `review-decide <ID> --nova-rodada --motivo "..."` (rodada+1, ciclo 0;
     o usuário pode ajustar critérios ou orientar antes).
   O orquestrador **nunca** roda `review-decide` sem o "sim" explícito do usuário no chat.
6. **`pronto_para_pr`** ou liberação gravada → `/cartao pr <ID>`.

## 6. Estado — `.agentic-os/supervisor/<ID>.json` (fora do git)

```json
{
  "id": 12, "rodada": 1, "ciclo": 2, "situacao": "corrigir",
  "pendente": { "commit": "<sha>", "base": [ ... ], "criterios": [ ... ] },
  "historico": [ { "rodada": 1, "ciclo": 1, "commit": "<sha>", "nota": 7, "em": "<ISO>",
                   "criterios": [ { "id": "B1", "texto": "...", "status": "...", "prova": "..." } ] } ],
  "valida": { "commit": "<sha>", "nota": 10, "tipo": "nota_10" },
  "decisoes": [ { "tipo": "seguir|nova_rodada", "motivo": "...", "em": "<ISO>", "commit": "<sha>", "nota": 8 } ]
}
```

`situacao` ∈ `corrigir` · `aguardando_decisao` · `pronto_para_pr` · `liberado_pelo_usuario`.
`valida` só existe com nota 10 ou após `--seguir` (aí `tipo: "liberado_pelo_usuario"`).

## 7. Trava no `card-pr`

- Sem `valida` → `SEM_REVISAO` ("Rode /cartao revisar <ID>").
- `git diff --name-only <valida.commit> HEAD` com qualquer arquivo além de `docs/tasks/TASK-<ID>-*.md`
  → `REVISAO_VENCIDA` ("commit novo depois da revisão; revise de novo").
- Corpo do PR e `TASK-<ID>` ganham a seção **Supervisor**: commit revisado, rodada/ciclos, nota, tabela de
  critérios (status + prova curta) e, se liberado pelo usuário, em destaque:
  `⚠️ Nota N/10 — liberada pelo usuário em <data>. Motivo: ...` + critérios não atendidos.

## 8. Erros novos (`erros.mjs`)

| Código | Como resolver |
|---|---|
| `SEM_CRITERIOS` | Adicione `## Critérios de aceite` (lista) ao `proposal.md` do cartão. |
| `PARECER_INVALIDO` | Rode `/cartao revisar <ID>` de novo; o parecer precisa ser JSON do commit atual. |
| `AGUARDA_DECISAO` | 3ª nota < 10: pergunte ao usuário (seguir ou nova análise). |
| `SEM_REVISAO` | Rode `/cartao revisar <ID>` antes do PR. |
| `REVISAO_VENCIDA` | Houve commit depois da revisão. Rode `/cartao revisar <ID>` de novo. |

## 9. Limites honestos

- O estado é arquivo local: apagá-lo zera ciclos. É **registro e disciplina**, não cadeado. O PR sempre
  mostra commit revisado, nota, rodadas e liberações, então burla fica visível ao analista. O cadeado real
  é a aprovação do analista no GitHub (Parte 3).
- Custo: cada revisão é uma chamada ao Opus (fixo, mesmo com Jev). Máx. 3 por rodada; rodadas extras só com
  o "sim" do usuário. O wizard avisa isso no início.

## 10. Testes

Automáticos (`node:test` + `fake-gh`, sem GitHub real):
- Nota: 10 só com tudo atendido; 9/10 → 9; sem prova → não atendido; critério ausente → não atendido;
  JSON ilegível / commit diferente → `PARECER_INVALIDO`; parecer não sobrescreve B1–B4.
- Base: teste falhando, tempo esgotado (limite reduzido no teste), sem `comando_testes`; segredo pego;
  texto em `segredos-permitidos.txt` passa; fora da branch; `proposal.md` sem critérios → `SEM_CRITERIOS`.
- Ciclos: 3ª nota < 10 → `decisao_usuario` e `review-check` recusa com `AGUARDA_DECISAO`;
  `--nova-rodada` → rodada 2, ciclo 0; `--seguir` → `valida.tipo = liberado_pelo_usuario` + motivo.
- `card-pr`: sem revisão → `SEM_REVISAO`; commit novo → `REVISAO_VENCIDA`; só TASK mudou → ok;
  liberação → corpo com ⚠️ e motivo; nota 10 → tabela.
- Instalador: copia `supervisor.md`; `.gitignore` com `.agentic-os/supervisor/`.

Real (antes da release, sandbox privado + Project, apagados no fim):
- Subagente Supervisor real revisa cartão com critério propositalmente furado → nota < 10 → correção →
  10 → PR com tabela.
- Forçar 3 notas < 10 → pergunta ao usuário → `--seguir` aparece no PR com ⚠️.

## 11. Docs e versão

`docs/GOVERNANCA.md` (seção Supervisor), `docs/CONFORMANCE-SPEC.md` (F7: agente supervisor instalado e
sem edição; F8: `.gitignore` com `.agentic-os/supervisor/` e procedimento com `revisar`), guia completo
seção 8c, `README.md`, `RELEASE-NOTES.md`. Manifestos → 1.10.0; painel 1.2.1.

## 12. Fora do escopo

Deploy HOM, migrações e assinatura do analista (Parte 3); merge, PRD e rollback (Parte 4); movimentação
automática para "Em validação".
