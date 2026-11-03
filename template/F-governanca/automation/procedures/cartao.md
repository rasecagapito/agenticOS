# Procedimento: /cartao (Governança GitHub)

Fonte única do fluxo do cartão. Funciona em qualquer IA: rode os comandos na raiz do projeto.
O script devolve JSON; `ok:false` traz `erro.codigo` e `erro.como_resolver` — mostre ao usuário e pare.

Ficha: `.agentic-os/governanca.json`. Script: `node .agentic-os/bin/github-setup.mjs`.

## `/cartao <ID>` — começar um cartão

1. `node .agentic-os/bin/github-setup.mjs card-start <ID> --dry-run` → confirme que o cartão existe e
   está em "A Fazer". Erro → mostre `como_resolver` e pare.
2. Pergunte ao usuário: tipo `feature` ou `fix` (padrão `feature`; `fix` se o cartão é bug) e confirme a
   descrição curta sugerida pelo `branch` do dry-run.
3. Monte o plano: siga o procedimento de `/propose` com o nome `<ID>-<desc>` (pasta `changes/<ID>-<desc>/`,
   com `## Cartão: #<ID>` no `proposal.md`). **Mostre o plano e espere a aprovação do usuário.**
4. Com o "sim": `node .agentic-os/bin/github-setup.mjs card-start <ID> --tipo <tipo> --desc "<desc>"`.
   Resultado: branch criada, `docs/tasks/TASK-<ID>-<desc>.md` commitado, cartão em "Em andamento".
5. Commite o plano (`changes/<ID>-<desc>/`) nesta branch. Daqui em diante, todo trabalho do cartão
   acontece **só nesta branch** (`/worker`, `/loop`).

## `/cartao pr <ID>` — abrir o PR

1. Confirme que está na branch do cartão e que os testes passam.
2. `node .agentic-os/bin/github-setup.mjs card-pr <ID> --dry-run` → mostre as ações.
3. `node .agentic-os/bin/github-setup.mjs card-pr <ID>` → push da branch, PR para a principal com
   `Cartão #<ID>`, comentário no cartão, PR registrado no TASK.
4. Diga ao usuário: o merge depende da **aprovação do analista no GitHub**. Você não aprova nem faz merge.

## `/cartao` sem argumento

Liste os cartões em "A Fazer" e "Em andamento":
`gh project item-list <project.number> --owner <project.owner> --format json` (valores da ficha).

## Proibido (ver `automation/guardrails.md`)

Push ou merge na branch principal; aprovar PR (próprio ou alheio); alterar regras de proteção do GitHub
para contornar aprovação; assinar ou simular aprovação em nome do analista.
