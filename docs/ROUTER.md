# Roteador de Modelos (opt-in, Claude Code)

Classifica cada pedido **antes** de o modelo lê-lo e entrega o trabalho ao subagente do tamanho certo.
A sessão principal roda num modelo leve e funciona como **recepção**: não executa, só delega e resume.
Classificador padrão: **Jev** (TypeSafe System One). Template: `template/E-roteador/`.

## Fluxo

```
mensagem → hook UserPromptSubmit (route.mjs)
         → Jev: 1 chamada, 2 perguntas (nível = choice, risco = noul)
         → decide.mjs (regra no código) → decisions.jsonl
         → contexto "ROTEADOR: ... subagent_type=X" → recepção delega via Agent tool
         → subagente executa e devolve {status, feito, verificacoes, pendencias}
         → recepção responde só com o resumo
```

## Regra de decisão (`decide.mjs`, limiares em `config.json`)

| Classe (Jev) | Tier | Subagente padrão |
|---|---|---|
| simples | básico | `rapido` (Haiku) |
| rotina | intermediário | `padrao` (Sonnet) |
| difícil | avançado | `profundo` (Opus) |

- Risco **> 0,70** → sobe 1 nível. Confiança **< 0,60** → sobe 1 nível. Acumulam; teto = avançado.
- Classificador indisponível (sem chave, timeout 5 s, HTTP 401/422/429/529, resposta inválida) →
  `fallback_tier` (padrão: avançado — "na dúvida, o mais forte"). O erro vai para o log.
- `justificativa` registra a trilha: `base=rotina; risco .78>.70 +1 → profundo`.

Risco e confiança são estimativas orientativas do classificador, não probabilidades comprovadas.
Calibre os limiares com os seus próprios dados (veja o log).

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
`project_summary_sources` (AGENTS.md, CLAUDE.md, context/…), truncado em 4000 caracteres. Nada
específico de projeto fica no código — o mesmo roteador serve para qualquer projeto.

## Limitações conhecidas

- **A recepção pode não delegar.** A regra no CLAUDE.md e o contexto do hook orientam, mas não obrigam.
  Valide no transcript que a ferramenta Agent foi chamada com o `subagent_type` indicado.
- Subagentes carregam o mesmo CLAUDE.md; o bloco instrui executores a ignorar a parte da recepção.
- Latência: +1 chamada HTTP por mensagem (o tempo fica em `jev_ms` no log).
- Bloco no `CLAUDE.md` é específico do Claude: em projetos multi-provedor fica no ponteiro `CLAUDE.md`
  entre marcadores, sem duplicar o cérebro canônico (D2 mantém-se).
