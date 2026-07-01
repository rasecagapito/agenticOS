# Agentic OS — Template D (Multi-Provedor)

Cérebro compartilhado entre várias IAs (Claude, Codex, Gemini, GLM, DeepSeek…). Quando uma IA
para, a próxima continua exatamente do mesmo ponto. **Sem drift** — fonte única de verdade.

## Como funciona (fonte única + ponteiros)

| Peça | Papel |
|------|-------|
| `AGENTS.md` | **Cérebro canônico** — orquestrador que todas as IAs leem. |
| `CLAUDE.md` | Ponteiro fino (`@AGENTS.md`) para o Claude Code. |
| `GEMINI.md` | Ponteiro fino (import de `AGENTS.md`) para o Gemini CLI. |
| `providers/registry.md` | Que arquivo cada IA lê + limitações. |
| `automation/procedures/` | Lógica dos comandos, **provider-neutra** (fonte única). |
| `.claude/commands/` | Wrappers finos → `procedures/` (UX de slash no Claude). |
| `memory/handoff.md` | **Estado vivo** — quem parou onde, e a narrativa p/ retomar. |
| `context/` · `memory/` · `changes/` | Cérebro neutro compartilhado (igual aos outros templates). |

## Continuidade entre IAs

```
Claude trabalha → fecha tarefa → grava memory/handoff.md (incremental)
                                        │
Codex arranca → lê handoff.md → abre changes/<ativa>/tasks.md
             → retoma na primeira [ ]  → continua exato
```

- **Cursor** (próxima tarefa) = primeira `[ ]` em `tasks.md`. Derivado, nunca duplicado.
- Handoff gravado a cada tarefa → sobrevive a sessão morta sem `/wrapup`.

## Comandos (Claude) ↔ Procedimentos (todas as IAs)

| Slash | Procedimento | Ação |
|-------|--------------|------|
| `/propose <nome>` | `procedures/propose.md` | Criar mudança |
| `/worker [nome]` | `procedures/worker.md` | Executar mudança ativa |
| `/wrapup` | `procedures/wrapup.md` | Consolidar + finalizar handoff |
| `/status` | `procedures/status.md` | Estado do projeto |
| `/handoff` | `procedures/handoff.md` | Ler/gravar estado vivo |

Noutras IAs: pedir em linguagem natural ("faz o wrapup") → a IA lê o procedimento.

## Ciclo de uso

```
1. Abrir a IA na pasta → lê o cérebro (AGENTS.md via ponteiro)
2. Ler memory/handoff.md → retomar no cursor da mudança ativa
3. /worker [nome] → trabalha; grava handoff ao fechar cada tarefa
4. Trocar de IA a qualquer momento → a próxima retoma exato
5. /wrapup → arquiva mudança + memória + finaliza handoff
```

Detalhes: `docs/MULTI-PROVIDER.md` e `docs/CHANGE-WORKFLOW.md` (raiz do repositório do plugin).
