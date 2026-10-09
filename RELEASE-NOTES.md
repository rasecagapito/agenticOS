# Agentic OS v1.7.0

**Jev mais barato e previsível, no padrão TypeSafe.** O Roteador de Modelos ganha instrução, política e
montagem de estado **configuráveis**: pergunta neutra, decisão por `probabilities` no código, regras antes
do Jev e `state` enxuto e estruturado. Base: análise do piloto (23 decisões, 61% no Opus, nenhuma no Haiku)
e as boas práticas da skill oficial TypeSafe.

## Novidades (todas opcionais — sem as chaves, comportamento = v1.6.0)

- **`instructions_choice`** (string | objeto | array) — default para projetos novos: "Qual é o **menor**
  executor que faz bem o `pedido`?", sem "na dúvida, prefira o mais capaz".
- **`agent_criteria`** aceita, por agente, string **ou** `{definicao, exemplos[], exclusoes[]}` (vai como objeto).
- **`policy`** — `{"type":"confianca"}` (legado) ou `{"type":"probabilidades","subir_se_prob_acima":{"padrao":0.5,"profundo":0.35}}`:
  argmax das probabilidades; sobe só se P(tier + acima) ≥ limiar. Dúvida rapido×padrao vai para padrao, não para o Opus.
- **`rules`** `[{nome, match, tier}]` — regex no pedido **antes** do Jev (sem chamada HTTP; origem `regra:<nome>`).
- **`continuacao`** `{match, max_chars}` — "sim", "pode seguir", "opção 2" herdam o tier anterior sem chamar o Jev.
- **`extra_questions`** + **`escalate_on`** — perguntas Noul/Choice/Score do domínio na mesma chamada;
  Noul acima do limiar eleva o piso (`tier_minimo`). **`risk_question: false`** remove a pergunta `risco`.
- **State estruturado** — `{pedido, anterior, dominio, projeto, situacao}`: `domain_summary`,
  `state_project_summary_max_chars` (0 = não envia o resumo) e `state_command` `{cmd, timeout_ms}` (stdout
  JSON → `situacao`; falha/timeout nunca bloqueia, vai para `state_command_falhou`).
- Log ganha `politica`, `probabilidades`, `extras`; statusline mostra `regra:<nome>` e `continua`.
- Testes: retrocompatibilidade com config v1.6, política por probabilidades, rules, continuação,
  escalate_on, state_command (ok/timeout/JSON inválido) e critérios objeto.

## Atualizar

`/router-update` **não muda o comportamento**: o `config.json` local é preservado e as chaves da v1.7 não
são acrescentadas (o instalador só lista as disponíveis). Ative-as uma a uma no `config.json` — ver
`docs/ROUTER.md` → "Configuração v1.7.0". Projetos novos já nascem com os defaults da v1.7.

---

# Agentic OS v1.6.0

**O Jev escolhe o subagente.** No Roteador de Modelos, o Jev deixa de só classificar e passa a
**decidir quem executa** (`rapido` / `padrao` / `profundo`), pesando complexidade e risco juntos.

## Novidades

- **`decision_mode: "jev"` (novo padrão)** — pergunta única ao Jev: "qual executor deve fazer o
  pedido?", com a descrição de cada subagente em `agent_criteria` (editável no `config.json`).
- **Rede de segurança mantida** — confiança < 0,60 sobe um nível; Jev indisponível → `profundo`.
- **Contexto da conversa** (`context_previous: true`) — o Jev recebe o início do pedido anterior da
  sessão e o subagente usado. Respostas curtas ("sim", "pode seguir") continuam no nível da tarefa.
- Statusline: `roteador: jev 0.92 → profundo (Opus)` / `roteador: jev rapido 0.55 ↑ padrao (Sonnet)`.
- **Modo antigo preservado**: `decision_mode: "regras"` (classe + limiares de risco/confiança).

## Atualizar

Projetos com o roteador: atualizar o plugin e rodar `/router-update`. O `config.json` local é
preservado e ganha as chaves novas — **o modo passa a `jev`**. Para manter o comportamento da v1.5.0,
defina `"decision_mode": "regras"`.

---

# Agentic OS v1.5.0

**Roteador de Modelos (opt-in, Claude Code).** Cada pedido é classificado pelo **Jev** (TypeSafe)
antes de o modelo lê-lo e vai para o subagente do tamanho certo; a sessão principal (Haiku) vira
recepção que só delega e resume. Compatível com v1.4.0 — nada muda em projetos que não instalarem.

## Novidades

- **`template/E-roteador/`** — hook `UserPromptSubmit` (`route.mjs`) faz 1 chamada ao Jev com 2
  perguntas (nível `choice` + risco `noul`); **a decisão fica no código** (`decide.mjs`):
  simples→`rapido` (Haiku), rotina→`padrao` (Sonnet), difícil→`profundo` (Opus); risco > 0,70 e
  confiança < 0,60 sobem um nível cada (teto: avançado). Falha do Jev → `profundo`.
- **3 subagentes de uma só fonte** — `agent-body.md` + `tiers` do `config.json` →
  `emit-agents.mjs`; gate `scripts/check-agents-sync.sh` + workflow `router-check` (D5).
- **Controle do usuário** — `nivel:basico|intermediario|avancado <pedido>` força o tier;
  `!` (modo bash) e `/comandos` passam sem roteamento.
- **Escalonamento com limite** — subagente devolve `status: escalar`; `log-escalation.mjs` devolve o
  próximo tier ou `LIMITE` (`max_escalations`, padrão 1).
- **Registro e visibilidade** — `.claude/router/decisions.jsonl` (horário, prévia + hash, classe,
  confiança, risco, tier, justificativa, tempo do Jev, erro) e statusline
  `roteador: dificil, 0.91, profundo (Opus)` encadeada com a statusline global.
- **Instalador idempotente** — `scripts/install-router.mjs <projeto> [--dry-run]`: merge de settings
  sem apagar hooks/permissões, preserva `config.json` e log locais, bloco no `CLAUDE.md` entre
  marcadores. Atualização nos projetos: `/router-update`.
- **Agnóstico de projeto** — o contexto enviado ao Jev vem do cérebro do próprio projeto
  (AGENTS.md / CLAUDE.md / context/), nunca do código do roteador.
- Docs: `docs/ROUTER.md`; seção nova no `SKILL.md`; testes em `scripts/tests/router.test.mjs`.

## Atualizar projetos que usam o plugin

```bash
claude plugin marketplace update agentic-os
claude plugin update agentic-os@agentic-os
# só em projetos com o roteador instalado:
/router-update
```

---

# Agentic OS v1.4.0

**Hardening do handoff multi-agente + Orquestração com fronteira de aprovação.** O handoff deixa de
ser só convenção narrativa e ganha regras anti-drift verificáveis, orçamentos rígidos de tokens e
um **humano como orquestrador final**. Compatível com v1.3.2.

## Novidades

- **Orquestração (fronteira de aprovação)** — o humano é o orquestrador final: uma IA de
  coordenação propõe **lotes de 3–5 tarefas**; executores só trabalham até o `Limite aprovado`;
  o limite **só avança com aprovação humana registrada no handoff**. Revisão de lote via
  `git diff <âncora>..HEAD`. Ativa quando o handoff traz a secção `## Orquestração`
  (template D já a inclui; sem a secção = modo livre, comportamento anterior).
- **Estado dinâmico único (D6)** — sessão/cursor/próximo passo vivem **só** em `memory/handoff.md`;
  o cérebro guarda apenas estado estático (fase). Zero dupla escrita, zero dupla leitura.
- **Âncora git** — cada tarefa fechada grava `commit <sha>` no handoff; "o que aconteceu" deriva do
  git, não de prosa. Narrativa encolhe e a retoma fica exata.
- **Orçamentos rígidos** — concisão vira gate de auditoria: handoff **≤ 20 linhas**, cérebro
  canônico **≤ 150**, wrappers **≤ 6**. Narrativa = 1 linha por campo, substituir nunca acumular.
- **Validação no arranque** — o próprio header do handoff instrui a IA que chega a validar
  coerência com `tasks.md` (e com o `Limite aprovado`); conflito → parar e perguntar.
  Custo zero no cérebro (instrução co-localizada com o dado).
- **Novas regras verificáveis** — anti-drift **D6** (estado dinâmico único) e **D7** (fronteira só
  com gate humano); item **M8** (Orquestração bem formada); **M5** reforçado (teto + header de
  validação). Auditoria A/B passa a exigir `D1–D7` e orçamentos.
- **Verificação de ponteiros (CI)** — `scripts/check-pointers.sh` + workflow `pointer-check`:
  todo ponteiro (`CLAUDE.md`/`GEMINI.md`) importa o canônico e o canônico nunca está vazio
  (fecha o risco de ponteiro falhar silenciosamente). `providers/registry.md` ganha estado
  "verificado" por provedor.
- **Correção: colisão de mesma hora** — Stop hook e `/wrapup` passam a usar `HHMM` no nome do
  arquivo de sessão (duas sessões na mesma hora já não se sobrescrevem). Aplicado aos 4 templates
  e às variantes `sh`/PowerShell do skill.
- **README** — tabela de comandos atualizada (`/conform`, `/handoff`, `/structure` faltavam).

## Impacto em tokens (por sessão)

| Peça | Antes | Agora |
|------|-------|-------|
| Cérebro (template D) | estado dinâmico duplicado | só estático + ponteiro para handoff |
| Handoff | narrativa livre acumulável | ≤ 20 linhas, schema fixo, substitui |
| Revisão de lotes | releitura de contexto | `git diff` desde a âncora |

Nenhuma melhoria aumenta o custo por sessão; P1 (estado único) e P4 (âncora) reduzem.

---

# Agentic OS v1.3.2

Release de **feature**: introduz o **Motor de Estrutura da Aplicação** — o Agentic OS deixa de
organizar só o cérebro do agente e passa a definir, montar e **auditar a estrutura do código-fonte**,
de forma multi-stack e multi-agent, com a mesma disciplina verificável (spec + loop A/B) já usada no
resto do sistema. Compatível com v1.3.1.

## Novidades

- **Motor de Estrutura + `/structure`** — monta (projeto novo) e audita (existente) a estrutura da
  aplicação. Procedimento provider-neutro em `automation/procedures/structure.md`; comando em todos os
  templates.
- **Perfis de estrutura** (`structure-profiles/`) — `next-app` (App Router, colocação híbrida C:
  `_components/_actions/_data-access` por rota + compartilhado promovido) e `generico` (fallback por
  feature). Cada perfil: `blueprint.md` + `rules/` como fonte única provider-neutra.
- **Regra única → todos os agentes** — `scripts/emit-rules.sh` transpila as regras com escopo por glob
  para o formato nativo de cada agente: Cursor (`.cursor/rules/*.mdc`) e Copilot
  (`.github/instructions/*.instructions.md`). Cérebro sempre-ativo no `AGENTS.md` (lido nativamente por
  Cursor, Copilot, Codex/ChatGPT e Gemini). Zero duplicação.
- **Estrutura verificável** — `docs/STRUCTURE-SPEC.md` define regras checáveis S1–S7 + anti-drift
  DS1–DS2, integradas ao loop A/B. S5 (server-first) é WARN, não bloqueia.
- **Brownfield seguro** — `docs/STRUCTURE-MIGRATION.md` define a escada de 4 tiers. Projeto implantado =
  **Tier 0** por padrão (só convenções + `AGENTS.md`, código intocado). Migração real é opt-in, por
  módulo, reference-safe, com **gate de build** (rollback se build/testes falharem).
- **Anti-drift das regras** — `scripts/check-rules-sync.sh` + CI (`.github/workflows/rules-sync.yml`)
  garantem que o emitido nunca divirja da fonte (DS1).

## Alvos multi-agent
Cursor · VSCode-Copilot · Copilot CLI · Claude Code · ChatGPT/Codex · Gemini — todos sobre `AGENTS.md`
como cérebro comum.

---

# Agentic OS v1.3.1

Release de **manutenção/consistência**: fecha lacunas entre o que a documentação promete e o que os
templates entregam, e torna o hook de sessão cross-platform. Sem mudança de comportamento do núcleo —
compatível com v1.3.0.

## Correções

- **`/conform` em todos os templates** — o comando `/conform` e o procedimento provider-neutro
  `automation/procedures/conform.md` passam a existir também em `A-generico`, `B-saas-n8n` e
  `C-claude-integrado` (antes só em `D-multi-provedor`). Agora qualquer projeto scaffoldado roda o
  loop de conformidade A/B como a doc descreve, inclusive no caminho role-switch de Codex/Gemini.
  A skill também cria `/conform` em projetos novos (MODO B) e ao adaptar existentes (MODO A).
- **Stop hook cross-platform** — o hook de fim de sessão deixa de ser PowerShell hardcoded. Padrão
  agora é um comando POSIX `sh` portátil (macOS, Linux e Windows via Git Bash), usando
  `$CLAUDE_PROJECT_DIR`. A variante PowerShell nativa continua documentada no `SKILL.md` para Windows
  sem shell POSIX. Aplicado aos 4 templates.
- **`agentic-os.skill` sincronizado** — o artefato empacotado para Codex estava com o `SKILL.md`
  antigo (drift, ironicamente contra a própria regra D5). Agora é regenerado a partir da fonte única
  `skills/agentic-os/SKILL.md` via `scripts/build-skill.sh`, e um `scripts/check-skill-sync.sh` +
  workflow CI (`.github/workflows/skill-sync.yml`) impedem que volte a divergir.

---

# Agentic OS v1.3.0

Loop de **Conformidade auto-corretivo (Agente A/B)** — o skill deixa de só descrever o padrão e
passa a **verificar e corrigir** até o projeto ficar exatamente no padrão desenhado, sendo
**exigente sobretudo em projetos novos**.

## Novidades

- **Loop A/B** — Agente A audita (read-only) → gate humano → Agente B aplica só o aprovado → A
  re-audita, até PASS (máx. 3 ciclos, depois escala). Spec: [`docs/CONFORMANCE-LOOP.md`](docs/CONFORMANCE-LOOP.md).
- **`docs/CONFORMANCE-SPEC.md`** — o "padrão desenhado" tornado **verificável**: camadas base
  (B1–B6), multi-provedor (M1–M7) e **regras anti-drift invioláveis** (D1–D5), incl. proibir
  `commands/` na raiz duplicando `.claude/commands/` + `procedures/`.
- **Gate duro no MODO B** — o skill não declara sucesso sem re-auditoria `PASS` completa.
- **Híbrido/portável** — no Claude Code, A e B são subagentes reais (Task/Agent); em Codex/Gemini,
  um só agente faz role-switch A→B→A seguindo `automation/procedures/conform.md`.
- **Novo comando `/conform`** — wrapper fino sobre o procedimento provider-neutro (sem argumento =
  só auditar/dry-run).
- **`evaluation.json`** — novo gate `agentic_os_conformance` + schema `conformance_audit`.

Compatível com v1.2.0 — a estrutura e o workflow multi-provedor mantêm-se; isto acrescenta a
camada de verificação.

---

# Agentic OS v1.2.0

Camada opt-in **Multi-Provedor** — várias IAs (Claude, Codex, Gemini, GLM, DeepSeek…)
trabalham sincronizadas sobre o mesmo cérebro. Quando uma para, a próxima continua exatamente
do mesmo ponto, **sem drift** ("sem delírio").

## Novidades

- **Fonte única + ponteiros** — um só arquivo cérebro é canônico (`AGENTS.md` em projetos novos); `CLAUDE.md`/`GEMINI.md` são ponteiros `@import`. Zero duplicação = zero drift.
- **Handoff** (`memory/handoff.md`) — estado vivo que a próxima IA lê para retomar. O cursor (próxima tarefa) é derivado da primeira `[ ]` em `tasks.md`; gravado incremental ao fechar cada tarefa (à prova de crash, sobrevive a sessão morta sem `/wrapup`).
- **Procedimentos provider-neutros** — `automation/procedures/{propose,worker,wrapup,status,handoff}.md` são a fonte única da lógica; `.claude/commands/` são wrappers finos. Codex/Gemini pedem em linguagem natural e leem o procedimento.
- **`providers/registry.md`** — que arquivo cada IA lê + suporte a import + limitações; isola fatos por provedor.
- **Novo template `D-multi-provedor/`** — exemplo completo pronto a copiar.
- **Skill atualizada** — detecta o cérebro em projetos existentes (regra de precedência), cria ponteiros em falta e adiciona a camada **sem tocar** nos comandos existentes.
- **Novo comando `/handoff`** — ler/gravar o estado vivo.

Tudo opt-in. Projetos single-IA (templates A/B/C) ficam inalterados.

Detalhes: [`docs/MULTI-PROVIDER.md`](docs/MULTI-PROVIDER.md).

---

# Agentic OS v1.1.0

Suporte opcional a **módulos / domínios** — organize o conhecimento por módulo de código
em projetos grandes, sem quebrar o modo flat (projetos pequenos continuam simples).

## Novidades

- **`context/<modulo>/`** — uma subpasta por módulo (ex: `auth/`, `folha-pagamento/`, `bem-estar/`) + `_global.md` para o que é compartilhado.
- **Mudanças prefixadas** — `changes/<modulo>-<feature>/` com o campo `## Módulo: <nome>` na proposal.
- **`/propose` detecta projeto modular** — se `context/` tem subpastas, pergunta o módulo e prefixa o nome da mudança.
- **Delta por módulo no `/wrapup`** — as sugestões de atualização miram só `context/<modulo>/` do módulo da mudança (economiza tokens, isola conhecimento).
- **Detecção flat vs modular** — automática, pela presença de subpastas em `context/`. Sem subpastas = comportamento atual, inalterado.

Tudo opt-in. Migração de projeto flat → modular é feita com segurança via `/propose reorganize-context-modular` (nunca deleta, usa quarentena + MOVES.md para rollback).

Detalhes: [`docs/CHANGE-WORKFLOW.md`](docs/CHANGE-WORKFLOW.md) → seção "Módulos / Domínios".

---

# Agentic OS v1.0.0

Primeiro release do plugin **Agentic OS** para Claude Code — metodologia de organização
de arquivos que permite a um agente IA operar com autonomia entre sessões: elimina cold
start, otimiza tokens e constrói memória persistente.

## Instalação

```
/plugin marketplace add rasecagapito/agenticOS
/plugin install agentic-os@agentic-os
```

Reiniciar o Claude Code após instalar.

> Plugins do Claude Code instalam via `/plugin`, **não** via `npm install`.

## Inclui

- **Skill `agentic-os`** — monta (projeto novo) ou adapta (projeto existente) ao padrão Agentic OS
- **3 templates**:
  - `A-generico` — conteúdo/marketing (workers: roteirista, pesquisador, analista)
  - `B-saas-n8n` — SaaS + automações n8n (workers: developer, workflow-designer, arquiteto, qa)
  - `C-claude-integrado` — SaaS integrado com Claude Code Superpowers
- **As 5 camadas**: Identity (`CLAUDE.md`) · Knowledge (`context/`) · Memory (`memory/`) · Workers (`workers/`) · Automation (`automation/`)
- **Change workflow**: `/propose` → `/worker` → `/wrapup`
  - cada mudança = pasta `changes/<nome>/` com proposal + tasks + design
  - delta semi-automático em `context/` (`+` adicionar · `~` modificar · `-` remover), humano confirma
  - ponte brainstorming → artefatos
- **Reorganização brownfield segura** (`/propose reorganize-<alvo>`): scan read-only → plano → aprovação → mover. Nunca deleta (quarentena), verifica referências, dry-run por padrão.
- **Docs**: [`docs/CHANGE-WORKFLOW.md`](docs/CHANGE-WORKFLOW.md) — ciclo completo com exemplo `add-dark-mode`

## Comandos

| Comando | Ação |
|---------|------|
| `/propose <nome>` | Criar mudança estruturada |
| `/worker [nome]` | Ativar especialista (executa a mudança ativa) |
| `/wrapup` | Arquivar mudança + atualizar `context/` (delta) + memória |
| `/status` | Estado atual do projeto |
