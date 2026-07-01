# Multi-Provedor — Cérebro Compartilhado entre IAs

> Camada **opt-in** do Agentic OS. Permite várias IAs (Claude, Codex, Gemini, GLM, DeepSeek…)
> trabalharem sincronizadas sobre o mesmo cérebro. Quando uma para, a próxima continua
> exatamente do mesmo ponto — **sem drift** ("sem delírio").

## Conceito

Dois problemas separam as IAs; a camada resolve os dois com uma peça cada:

| Problema | Causa | Solução |
|----------|-------|---------|
| Arquivo de entrada difere | Claude lê `CLAUDE.md`, Codex lê `AGENTS.md`, Gemini lê `GEMINI.md` | **Fonte única + ponteiros** |
| Não há continuidade | Cada IA arranca "fria" | **Handoff** (`memory/handoff.md`) |

## Fonte única + ponteiros

Um só arquivo cérebro é canônico; os outros são ponteiros `@import` para ele. Zero duplicação = zero drift.

```
              AGENTS.md   ← cérebro canônico (orquestrador, regras, ciclo, estado)
             /    |     \
      CLAUDE.md GEMINI.md (Codex lê AGENTS.md nativo)
       @AGENTS   @AGENTS
```

- **Projeto novo** → `AGENTS.md` canônico (standard cross-provider; Codex lê-o nativamente).
- **Projeto existente** → detectar qual cérebro já existe e centralizar nele (regra de precedência abaixo).
- Ponteiro é **import real** (`@AGENTS.md`), nunca prosa "por favor lê o AGENTS.md".

## Handoff — continuidade "exata" e à prova de crash

Estado vivo em `memory/handoff.md`. É o que a próxima IA lê para retomar.

**Princípio anti-drift:** o **cursor** (qual a próxima tarefa) é **derivado** — a primeira `[ ]`
não marcada em `changes/<ativa>/tasks.md`. Nunca se copia a lista de tarefas para o handoff,
senão passam a existir duas fontes de verdade. O handoff guarda só o que o `tasks.md` não captura:
quem mexeu por último e a narrativa (decisões, gotchas, próxima intenção).

**À prova de crash:** o worker grava o handoff **ao fechar cada tarefa** (incremental), não só no
`/wrapup`. Se a sessão morre sem wrapup, a próxima IA retoma na mesma a partir de `changes/` + `handoff.md`.

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

## Protocolo de arranque (no topo do cérebro canônico)

Toda a IA, ao arrancar:
1. Ler `memory/handoff.md`.
2. Abrir a mudança ativa em `changes/`.
3. Retomar na primeira tarefa `[ ]` (o cursor).
4. Carregar só os módulos de `context/` relevantes.

## Comando ↔ Procedimento neutro

As slash commands do Claude não existem no Codex/Gemini. Por isso a lógica vive em
`automation/procedures/` (fonte única) e as `.claude/commands/` são wrappers finos.
Noutras IAs, pede-se em linguagem natural e a IA lê o procedimento.

| Slash (Claude) | Procedimento (todas as IAs) |
|----------------|-----------------------------|
| `/propose` | `automation/procedures/propose.md` |
| `/worker` | `automation/procedures/worker.md` |
| `/wrapup` | `automation/procedures/wrapup.md` |
| `/status` | `automation/procedures/status.md` |
| `/handoff` | `automation/procedures/handoff.md` |

## Registro de provedores

`providers/registry.md` isola COMO cada IA lê o cérebro (arquivo de entrada, suporte a import,
limitações). Um engano sobre um provedor fica contido aí, sem partir o desenho.

## Regra de precedência (projeto existente)

1. Existe um orquestrador ativo (`CLAUDE.md`/`GEMINI.md`/`AGENTS.md` com conteúdo real) → **mantém-se canônico** (não partir setup que funciona).
2. Vários existem → o **maior/efetivamente orquestrador** vence; os outros viram ponteiros.
3. Empate/ambíguo → **perguntar** ao humano.
4. Nenhum existe (greenfield) → `AGENTS.md` canônico.

Regra de ouro do Modo A mantém-se: **só criar/ponteirar; nunca mover/renomear/apagar.**

## Como ativar

- **Template pronto:** copiar `template/D-multi-provedor/`.
- **Projeto existente:** invocar a skill `agentic-os` e pedir a camada multi-provedor — ela detecta o
  cérebro, cria os ponteiros em falta, adiciona `automation/procedures/` + `memory/handoff.md` +
  `providers/registry.md`, **sem tocar** nos comandos/arquivos existentes.

## Adicionar um provedor novo
Ver seção "Como adicionar um provedor novo" em `providers/registry.md`: descobrir o arquivo de
bootstrap, criar ponteiro (se suporta import) ou apontar+instruir procedures, e registrar a linha.
