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
   com `## Cartão: #<ID>` no `proposal.md`). O `proposal.md` precisa ter `## Critérios de aceite` com itens
   verificáveis (um por linha, `- ...`): é o que o Supervisor vai conferir. **Mostre o plano e espere a aprovação do usuário.**
4. Com o "sim": `node .agentic-os/bin/github-setup.mjs card-start <ID> --tipo <tipo> --desc "<desc>"`.
   Resultado: branch criada, `docs/tasks/TASK-<ID>-<desc>.md` commitado, cartão em "Em andamento".
5. Commite o plano (`changes/<ID>-<desc>/`) nesta branch. Daqui em diante, todo trabalho do cartão
   acontece **só nesta branch** (`/worker`, `/loop`).

## `/cartao revisar <ID>` — Supervisor (nota 0–10)

Custo: cada revisão chama o Opus (fixo, mesmo com o roteador Jev). Até 3 por rodada.

1. `node .agentic-os/bin/github-setup.mjs review-check <ID>` → B1–B4 medidos e a lista de critérios.
   `SEM_CRITERIOS` → complete o `proposal.md` com o usuário. `AGUARDA_DECISAO` → vá ao passo 5.
   `ARVORE_SUJA` → commite o que faz parte do cartão ou ponha artefatos de teste (coverage/, relatórios)
   no `.gitignore`.
2. Chame o Supervisor com o JSON inteiro do passo 1:
   - Claude Code: subagente `supervisor` (**não** passe `model`; ele é fixo em Opus, mesmo que o bloco
     ROTEADOR indique outro nível).
   - Outras IAs: assuma o papel lendo `.claude/agents/supervisor.md`, sem editar nada.
3. Salve **só o objeto JSON** da resposta em `parecer_em` (do passo 1). Nunca escreva ou altere o parecer.
4. `node .agentic-os/bin/github-setup.mjs review-record <ID> --parecer <parecer_em>` → `nota`, `proximo`.
5. Conforme `proximo`:
   - `pronto_para_pr` → diga a nota e siga para `/cartao pr <ID>`.
   - `corrigir` → passe ao executor (`/worker`) **só** os `pendentes`; ele corrige e commita; volte ao passo 1.
   - `decisao_usuario` → mostre a nota, cada pendente com a prova e o que foi tentado nos ciclos. Pergunte:
     **"Seguir com nota N"** ou **"Nova análise"** (o usuário pode ajustar critérios ou orientar).
     Só com o "sim" explícito: `review-decide <ID> --seguir --motivo "..."` ou
     `review-decide <ID> --nova-rodada --motivo "..."`. Nunca decida sozinho.

Nunca edite `.agentic-os/supervisor/`. Falso alarme de segredo: só o usuário pode liberar o texto exato em
`.agentic-os/segredos-permitidos.txt`.

## `/cartao pr <ID>` — abrir o PR

1. Confirme que está na branch do cartão e que `/cartao revisar <ID>` deu nota 10 (ou o usuário liberou) para
   o commit atual. Sem isso o script recusa (`SEM_REVISAO`/`REVISAO_VENCIDA`).
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
