# Procedimento: HANDOFF (estado vivo entre IAs)

> Provider-neutro. Fonte única da lógica de continuidade. Qualquer IA (Claude, Codex, Gemini…)
> executa isto — via `/handoff` no Claude ou a pedido ("lê/atualiza o handoff") nas outras.

O handoff é o que permite a **outra IA continuar exatamente onde a anterior parou**.
Ficheiro: `memory/handoff.md`.

## Princípio anti-drift (importante)
- O **cursor** (qual a próxima tarefa) é **derivado** da mudança ativa: a primeira `[ ]`
  não marcada em `changes/<ativa>/tasks.md`. **Nunca** copiar a lista de tarefas para o handoff
  — senão passam a existir duas fontes de verdade e uma fica desatualizada ("delírio").
- O handoff guarda só o que a mudança NÃO captura: quem mexeu por último, e a narrativa
  (o "porquê" e o "estado mental" que não cabe num checkbox).

## LER (ao arrancar sessão)
1. Ler `memory/handoff.md` inteiro.
2. Identificar a **mudança ativa** apontada.
3. Abrir `changes/<ativa>/tasks.md` e localizar a primeira `[ ]` → é aqui que se retoma.
4. Ler a narrativa (Feito / Decidido / Gotchas / Próxima intenção) para recuperar contexto.

## GRAVAR (incremental — à prova de crash)
Atualizar `memory/handoff.md` **ao fechar cada tarefa** e em decisões-chave, não só no wrapup.
Assim, se a sessão morrer sem `/wrapup`, a próxima IA retoma na mesma.
Escrever/atualizar:
- **Último provedor**: nome da IA + data/hora real.
- **Mudança ativa**: pasta `changes/<nome>/` (ou "nenhuma").
- **Narrativa**: substituir pelo estado atual — Feito, Decidido, Gotchas, Próxima intenção.
Não listar tarefas aqui; o `tasks.md` é a verdade do progresso.

## Obter hora real
`Get-Date -Format 'yyyy-MM-dd HH:mm'` (PowerShell) ou `date '+%Y-%m-%d %H:%M'` (POSIX).

## Formato de `memory/handoff.md`
```markdown
# Handoff — estado vivo da sessão
> Lê isto PRIMEIRO ao arrancar. Atualizado ao fechar cada tarefa e no wrapup.

## Último provedor
- IA: [Claude|Codex|Gemini|GLM|DeepSeek] · Quando: [YYYY-MM-DD HH:mm]

## Mudança ativa
- Pasta: changes/<nome>/   (ou "nenhuma")
- Cursor: primeira [ ] em tasks.md  (derivar — não copiar aqui)

## Narrativa
- Feito: …
- Decidido: …
- Gotchas: …
- Próxima intenção: …
```
