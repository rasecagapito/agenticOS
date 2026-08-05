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

**Princípios (anti-drift e anti-tokens):**

1. **Cursor derivado** — a próxima tarefa é a primeira `[ ]` não marcada em
   `changes/<ativa>/tasks.md`. Nunca se copia a lista de tarefas para o handoff (duas fontes = drift).
2. **Estado dinâmico único** — estado de sessão (quem mexeu, quando, o que falta) vive **só** no
   handoff. Nenhum outro arquivo (cérebro incluído) guarda sessão/cursor/próximo passo.
3. **Âncora git** — ao fechar tarefa, grava-se o `commit: <sha>`. "O que aconteceu desde então"
   deriva de `git diff <sha>..HEAD`, não de prosa. Narrativa encolhe porque o git já regista.
4. **Teto rígido** — handoff ≤ 20 linhas, narrativa = 1 linha por campo, **substituir nunca
   acumular**. É o segundo arquivo lido em toda sessão; crescimento aqui é custo recorrente.
5. **Validação no arranque** — a instrução de coerência vive no próprio header do handoff
   (ficheiro já carregado — custo zero no cérebro): mudança ativa existe e cursor = 1ª `[ ]`
   (e ≤ limite aprovado, quando orquestração ativa). Conflito → parar e perguntar.

**À prova de crash:** o worker grava o handoff **ao fechar cada tarefa** (incremental), não só no
`/wrapup`. Se a sessão morre sem wrapup, a próxima IA retoma na mesma a partir de `changes/` + `handoff.md`.

```markdown
# Handoff — estado vivo da sessão
> Lê isto PRIMEIRO. Validação: mudança ativa não existe, ou cursor ≠ 1ª [ ] em tasks.md,
> ou cursor além do limite aprovado → parar e perguntar. Não improvisar.

## Sessão
- IA: [Claude|Codex|Gemini|…] · Quando: [YYYY-MM-DD HH:mm]

## Orquestração (omitir a secção = modo livre)
- Orquestrador: humano (gate final) · Coordenação: [IA que propõe/revê]
- Limite aprovado: tarefa N de tasks.md · Executor: [IA] · Aprovado por humano em: [data/hora]
- Âncora: commit <sha> da última aprovação

## Mudança ativa
- Pasta: changes/<nome>/ (ou "nenhuma")
- Cursor: 1ª [ ] em tasks.md, ≤ limite aprovado (derivar — não copiar aqui)

## Narrativa (1 linha por campo — substituir, nunca acumular)
- Feito: … · Decidido: … · Gotchas: … · Próxima intenção: …
```

## Orquestração — fronteira de aprovação (opt-in)

Com várias IAs, o modo mais seguro não é "cada uma avança sozinha" — é **uma coordenação que
propõe, executores que cumprem lotes aprovados, e o humano como orquestrador final**. Ativa por
projeto quando o handoff traz a secção `## Orquestração`; sem ela, vale o modo livre acima.

**Mecânica (custo ≈ 1 linha de estado):**

1. A IA coordenadora propõe um **lote de 3–5 tarefas** e regista no handoff: executor pretendido,
   `Limite aprovado` = última tarefa do lote, `Âncora` = sha atual.
2. O **humano aprova** (gate obrigatório) antes de qualquer execução além do limite vigente.
   Aprovação registada no handoff ("Aprovado por humano em: …").
3. O executor só trabalha em tarefas com índice **≤ Limite aprovado**, gravando sha + narrativa ao
   fechar cada uma (incremental). Chegou ao fim do lote ou encontrou gotcha → **para** e regista
   "aguardando aprovação".
4. A coordenação revê o lote com `git diff <âncora>..HEAD` (barato — o git já conta a história),
   recomenda aprovar/ajustar, e o humano dá a palavra final para avançar o limite (ou trocar o
   executor, ou bloquear).

**Regras invioláveis:**
- `Limite aprovado` só avança com **aprovação humana registada** no handoff (ver D7).
- Executor nunca improvisa além do lote; gotcha → parar, nunca contornar.
- `/propose` e `/wrapup` são exclusivos da coordenação; executores só `/worker`.
- A secção nunca duplica a lista de tarefas — só o limite (índice), o executor e a âncora.

## Protocolo de arranque (no topo do cérebro canônico)

Toda a IA, ao arrancar:
1. Ler `memory/handoff.md` e aplicar a validação do seu header (coerência handoff↔tasks; conflito → parar).
2. Abrir a mudança ativa em `changes/`.
3. Retomar na primeira tarefa `[ ]` (o cursor) — respeitando o `Limite aprovado` se a secção Orquestração existir.
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
