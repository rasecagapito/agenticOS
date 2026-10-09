# Roteador de Modelos (opt-in, Claude Code)

Classifica cada pedido **antes** de o modelo lê-lo e entrega o trabalho ao subagente do tamanho certo.
A sessão principal roda num modelo leve e funciona como **recepção**: não executa, só delega e resume.
Classificador padrão: **Jev** (TypeSafe System One). Template: `template/E-roteador/`.

## Fluxo

```
mensagem → hook UserPromptSubmit (route.mjs)
         → envelope (bypass_patterns: retorno de subagente/notificação, sem Jev)
         → bypass (!, /) → override (nivel:) → rules (regex, sem Jev) → continuação (sem Jev)
         → Jev: 1 chamada (modo jev: "qual subagente?" [+ risco] [+ extra_questions];
           state = { pedido, anterior, dominio, projeto, situacao })
         → decide.mjs (policy confianca|probabilidades → escalate_on → teto) → decisions.jsonl
         → contexto "ROTEADOR: ... subagent_type=X" → recepção delega via Agent tool
         → subagente executa e devolve {status, feito, verificacoes, pendencias}
         → recepção responde só com o resumo
```

## Quem decide (`decision_mode` no `config.json`)

### Modo `jev` (padrão desde v1.6.0) — o Jev escolhe

O Jev recebe uma pergunta `choice`: "qual executor deve fazer o pedido?", com a descrição de cada
subagente em `agent_criteria` (editável). Ele pesa complexidade e risco juntos e devolve
`profundo (0.92)`. O código só obedece, com uma rede de segurança:

- Confiança **< 0,60** → sobe 1 nível ("o Jev ficou em dúvida → o mais forte").
- Risco é perguntado e registrado, mas **não** muda a escolha.
- **Contexto anterior** (`context_previous: true`): vai junto o início do pedido anterior da sessão
  e o subagente usado. Assim "sim, pode seguir" depois de uma tarefa difícil continua no Opus.
- Justificativa: `jev=rapido; conf .55<.60 +1 → padrao`. Statusline: `roteador: jev 0.92 → profundo (Opus)`
  (ou `jev rapido 0.55 ↑ padrao (Sonnet)` quando subiu).

### Modo `regras` — o Jev classifica, o código decide

| Classe (Jev) | Tier | Subagente padrão |
|---|---|---|
| simples | básico | `rapido` (Haiku) |
| rotina | intermediário | `padrao` (Sonnet) |
| difícil | avançado | `profundo` (Opus) |

- Risco **> 0,70** → sobe 1 nível. Confiança **< 0,60** → sobe 1 nível. Acumulam; teto = avançado.

### Nos dois modos
- Classificador indisponível (sem chave, timeout 5 s, HTTP 401/422/429/529, resposta inválida) →
  `fallback_tier` (padrão: avançado — "na dúvida, o mais forte"). O erro vai para o log.
- `justificativa` registra a trilha: `base=rotina; risco .78>.70 +1 → profundo`.

Risco e confiança são estimativas orientativas do classificador, não probabilidades comprovadas.
Calibre os limiares com os seus próprios dados (veja o log).

## Configuração v1.7.0 (opcional, retrocompatível)

Todas as chaves abaixo são **opcionais**. Sem elas, o roteador se comporta exatamente como na v1.6.0
(instrução antiga, política por confiança, pergunta `risco`, `state = { pedido, projeto (4000), anterior }`).
**Projetos novos** recebem os defaults da v1.7 do template; no `/router-update` de um projeto existente o
instalador **não** acrescenta estas chaves (só lista quais estão disponíveis) — ative uma a uma.
Base: boas práticas TypeSafe (pergunta neutra, política no código, usar `probabilities`, state
estruturado e enxuto, critérios estruturados, só perguntas que o código consome).

| Chave | Tipo | Default v1.7 (template) | Sem a chave (v1.6) |
|---|---|---|---|
| `instructions_choice` | string \| objeto \| array | "Qual é o **menor** executor que faz bem o `pedido`? …" | texto antigo ("…na dúvida, prefira o mais capaz") |
| `agent_criteria.<agente>` | string \| `{definicao, exemplos[], exclusoes[]}` | objetos | strings |
| `policy` | `{type:"confianca"}` \| `{type:"probabilidades", subir_se_prob_acima:{…}}` | probabilidades `{padrao:.5, profundo:.35}` | confianca |
| `rules` | `[{nome, match, tier}]` | `[]` | — |
| `continuacao` | `{match, max_chars}` | regex de confirmação curta, 40 | — |
| `extra_questions` | `{id: question}` | `{}` | — |
| `escalate_on` | `[{question, noul_acima, tier_minimo}]` | `[]` | — |
| `risk_question` | bool | `false` | `true` |
| `state_project_summary_max_chars` | número | 4000 (0 = não envia `projeto`) | `project_summary_max_chars` ou 4000 |
| `domain_summary` | string | `""` | — |
| `state_command` | `{cmd, timeout_ms}` \| null | `null` | — |
| `bypass_patterns` | array de regex | envelopes do harness (abaixo) | **mesmo default** (seguro; `[]` desliga) |

### Ordem de decisão
`bypass_patterns` (envelope) → `!`/`/` (bypass) → `nivel:` (override) → `rules` → `continuacao` → Jev + `policy` → `escalate_on` → teto.
`rules` e `continuacao` não chamam o Jev (`jev_ms: 0`). Falha do Jev → `fallback_tier`.

### `policy`
- `{"type":"confianca"}` (legado): vale a escolha; confiança < `thresholds.confidence_below` sobe 1.
- `{"type":"probabilidades","subir_se_prob_acima":{"padrao":0.5,"profundo":0.35}}`: parte do **argmax**
  de `probabilities`; para cada tier acima dele (do topo para baixo), se P(tier) + P(tiers acima) ≥ limiar
  do tier → sobe até ele. Tier sem limiar não é destino de subida. A confiança **não** sobe nada (vai para
  o log). Ex.: `{rapido:.45, padrao:.15, profundo:.40}` → profundo; `{rapido:.50, padrao:.45, profundo:.05}`
  → padrao (dúvida entre dois níveis baixos não leva ao Opus). Resposta sem `probabilities` → vale a
  escolha do Jev, sem subida. Só no modo `jev`. Chaves do limiar: agente ou id do tier.

### `bypass_patterns` (envelopes do harness)
Retornos de subagente e notificações também chegam ao hook `UserPromptSubmit`, mas não são pedidos do
humano (no piloto, 9 de 23 decisões eram envelopes e 3 foram para o Opus). Texto que casa uma das regex
(flag `i`), avaliadas **antes de tudo**, não chama o Jev: o roteador mantém o tier da última decisão da
sessão (bloco `ROTEADOR: envelope …`) ou não emite bloco se não houver; o log registra `origem: envelope`
(sem prévia) e essa linha não vira `anterior` para o próximo pedido. Default (vale mesmo sem a chave):
`^\s*<agent-message\b`, `<task-notification`, `<system-reminder`, `<browser_instruction`,
`<user-prompt-submit-hook`, `[SYSTEM NOTIFICATION`. `"bypass_patterns": []` desliga.

### `rules` e `continuacao`
```json
"rules": [
  { "nome": "prd",    "match": "\\b(prd|produ[cç][aã]o|rollback|aprovar)\\b", "tier": "avancado" },
  { "nome": "status", "match": "^(status|listar?|explique)\\b",             "tier": "basico" }
],
"continuacao": { "match": "^(?:(?:sim|ok|pode|seguir|continue|op[cç][aã]o \\d+)[\\s,.!]*)+$", "max_chars": 40 }
```
Regex com flag `i`, avaliada no `pedido`; a primeira regra que casar decide (origem `regra:<nome>`).
Regex inválida ou tier inexistente → regra ignorada. `tier` aceita id (`avancado`) ou agente (`profundo`).
`continuacao`: pedido com até `max_chars` caracteres que casa a regex herda o subagente efetivo da decisão
anterior da sessão (considera escalonamento); sem decisão anterior → segue para o Jev.

### `extra_questions` e `escalate_on`
```json
"extra_questions": { "grava": { "type": "noul", "instructions": "O `pedido` grava dados em produção ou mexe em aprovação?" } },
"escalate_on": [ { "question": "grava", "noul_acima": 0.6, "tier_minimo": "avancado" } ]
```
As perguntas vão na mesma chamada (Noul/Choice/Score). `escalate_on` só **eleva o piso** (nunca desce),
nos dois modos. Respostas resumidas no log em `extras`. Ids `subagente`, `nivel`, `risco` são reservados.
`risk_question: false` remove a pergunta `risco` (que no modo `jev` só era registrada).

### State enviado ao Jev
Objeto com campos nomeados, só o relevante: `pedido`, `anterior` (se houver), `dominio` (`domain_summary`),
`projeto` (resumo, se `state_project_summary_max_chars` > 0), `situacao` (saída do `state_command`).
```json
"domain_summary": "Cargas de dados no ERP para clientes; PRD exige aprovação.",
"state_project_summary_max_chars": 0,
"state_command": { "cmd": "node tools/status.mjs --json", "timeout_ms": 1500 }
```
`state_command` roda na raiz do projeto; o stdout deve ser um **objeto JSON** (vira `state.situacao`).
Falha, saída ≠ 0, timeout, JSON inválido ou não-objeto → ignorado (nunca bloqueia) e registrado no
campo `state_command_falhou` da decisão.

### Log
Cada decisão registra também `politica`, `probabilidades`, `confianca`, `extras` e `state_command_falhou`
quando houver. Statusline: `roteador: regra:prd → profundo (Opus)`, `roteador: continua → padrao (Sonnet)`.

## Controle do usuário

| Entrada | Efeito |
|---|---|
| `nivel:basico\|intermediario\|avancado <pedido>` | força o tier, não chama o Jev |
| `!comando` | modo bash do Claude Code — nunca chega ao modelo nem ao hook |
| `/comando` | slash commands passam sem roteamento |

## Peças instaladas no projeto

| Arquivo | Papel |
|---|---|
| `.claude/router/route.mjs` | hook: bypass → Jev → decisão → log → contexto |
| `.claude/router/decide.mjs` | lógica pura (testada em `scripts/tests/router.test.mjs`) |
| `.claude/router/config.json` | tiers, modelos, limiares, fallback, resumo do projeto — **local, preservado em updates** |
| `.claude/router/agent-body.md` + `emit-agents.mjs` | fonte única dos 3 agentes (só muda `model`) |
| `.claude/agents/{rapido,padrao,profundo}.md` | gerados — não editar à mão |
| `.claude/router/statusline.mjs` | `roteador: dificil, 0.91, profundo (Opus)`, encadeado com a statusline global |
| `.claude/router/log-escalation.mjs` | escalonamento entre tiers com limite (`max_escalations`) |
| `.claude/router/decisions.jsonl` | log (gitignored): horário, prévia + hash, classe, confiança, risco, tier, tempo do Jev |
| `automation/procedures/route.md` | regras da recepção (provider-neutro) |
| bloco no `CLAUDE.md` | 2 linhas entre marcadores `agentic-os:router` |
| `.claude/settings.json` | `model: haiku` + hook (formato exec, `timeout: 10`) |
| `.claude/settings.local.json` | `statusLine` com caminho absoluto (por máquina) |

## Instalar / atualizar

```bash
# chave do Jev (só em variável de ambiente; nunca em arquivo)
setx TYPESAFE_API_KEY "<chave>"            # Windows
export TYPESAFE_API_KEY=<chave>            # macOS/Linux

# 1ª instalação (a partir do plugin ou de um clone do repo)
node <agentic-os>/scripts/install-router.mjs <pasta-do-projeto>   # --dry-run para pré-visualizar

# atualizar depois de uma nova versão do plugin
claude plugin marketplace update agentic-os
claude plugin update agentic-os@agentic-os
/router-update        # dentro do projeto (roda .claude/router/update.mjs)
```

O instalador é idempotente: sobrescreve o código do roteador, **preserva** `config.json` (só acrescenta
chaves novas) e o log, faz merge dos settings sem apagar hooks/permissões e mantém uma statusLine
própria do projeto, se já houver. Para mudar modelos/tiers: editar `config.json` e rodar
`node .claude/router/emit-agents.mjs`.

## Contexto do projeto enviado ao Jev

`project_summary` do `config.json`; se vazio, montado em tempo de execução a partir de
`project_summary_sources` (AGENTS.md, CLAUDE.md, context/…), truncado em 4000 caracteres
(`state_project_summary_max_chars`; 0 = não envia). Prefira `domain_summary` curto + `state_command`. Nada
específico de projeto fica no código — o mesmo roteador serve para qualquer projeto.

## Limitações conhecidas

- **A recepção pode não delegar.** A regra no CLAUDE.md e o contexto do hook orientam, mas não obrigam.
  Valide no transcript que a ferramenta Agent foi chamada com o `subagent_type` indicado.
- Subagentes carregam o mesmo CLAUDE.md; o bloco instrui executores a ignorar a parte da recepção.
- Latência: +1 chamada HTTP por mensagem (o tempo fica em `jev_ms` no log).
- Bloco no `CLAUDE.md` é específico do Claude: em projetos multi-provedor fica no ponteiro `CLAUDE.md`
  entre marcadores, sem duplicar o cérebro canônico (D2 mantém-se).
