# Procedimento: HANDOFF (estado vivo entre IAs)

> Provider-neutro. Fonte única da lógica de continuidade. Qualquer IA (Claude, Codex, Gemini…)
> executa isto — via `/handoff` no Claude ou a pedido ("lê/atualiza o handoff") nas outras.
> Princípios: `docs/MULTI-PROVIDER.md` secção Handoff + Orquestração.

O handoff permite que **outra IA continue exatamente onde a anterior parou**.
Arquivo: `memory/handoff.md`. **Teto: ≤ 20 linhas** — substituir, nunca acumular.

## Princípios (anti-drift e anti-tokens)
1. **Cursor derivado** — 1ª `[ ]` não marcada em `changes/<ativa>/tasks.md`. Nunca copiar a lista
   de tarefas para o handoff (duas fontes = drift).
2. **Estado dinâmico único** — sessão/cursor/próximo passo vivem SÓ aqui. O cérebro guarda só
   estado estático (fase).
3. **Âncora git** — gravar `commit <sha>` ao fechar tarefa e na última aprovação. "O que houve
   desde então" deriva de `git diff <sha>..HEAD`, não de prosa.
4. **Orquestração (se a secção existir)** — cursor válido só até `Limite aprovado`; o limite só
   avança com **aprovação humana registada** (gate final). Lotes de 3–5 tarefas.

## LER (ao arrancar sessão)
1. Ler `memory/handoff.md` inteiro e aplicar a validação do header:
   mudança ativa existe? cursor = 1ª `[ ]` em tasks.md? cursor ≤ Limite aprovado (se orquestração)?
   Conflito → **parar e perguntar**; nunca improvisar nem "corrigir" em silêncio.
2. Retomar na 1ª `[ ]`. Ler a narrativa para recuperar contexto (Feito/Decidido/Gotchas/Próxima).

## GRAVAR (incremental — ao fechar cada tarefa; à prova de crash)
- **Sessão**: IA + hora real.
- **Mudança ativa**: pasta (ou "nenhuma").
- **Orquestração** (só coordenação/humano mexem aqui): limite, executor, âncora, aprovação humana.
- **Narrativa**: substituir pelo estado atual — 1 linha por campo. Não listar tarefas (tasks.md é a
  verdade do progresso) nem descrever o que o git já regista (para isso há a âncora).

## Obter hora real
`Get-Date -Format 'yyyy-MM-dd HH:mm'` (PowerShell) ou `date '+%Y-%m-%d %H:%M'` (POSIX).
Para a âncora: `git rev-parse --short HEAD`.

## Formato de `memory/handoff.md`
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
