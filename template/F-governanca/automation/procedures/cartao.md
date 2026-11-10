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
4. Diga ao usuário: próximo passo é `/cartao hom <ID>`. Você não aprova nem faz merge.

## `/cartao hom <ID>` — publicar no HOM

1. `node .agentic-os/bin/github-setup.mjs card-hom <ID> --dry-run` → mostre as ações.
   - `HOM_OCUPADO` → diga qual cartão ocupa o HOM. Pergunte se espera ou fura a fila; furar só com o "sim" e
     um motivo (`--furar-fila --motivo "..."`).
   - `MIGRACAO_NAO_AUTORIZADA` → mostre o comando de migração e pergunte. Com o "sim": `--migracao-autorizada`.
   - `COMANDO_SUSPEITO_PRD` → um comando de HOM cita produção. Mostre e pergunte. Com o "sim": `--confirmo-comando`.
   - `IDENTIDADE_IGUAL_ANALISTA` → o agente usa a conta de um analista. Mostre o `como_resolver` (configurar
     `identidade_agente` ou ligar `aprovacao_pelo_chat` pelo wizard). Não contorne.
2. `node .agentic-os/bin/github-setup.mjs card-hom <ID> [flags autorizadas]`.
   - `modo: manual` → peça ao usuário publicar o commit `sha` no HOM; com a confirmação dele:
     `card-hom <ID> --publicado-manual`. No 2º passo repita as **mesmas flags autorizadas** do 1º
     (`--furar-fila --motivo "..."`, `--migracao-autorizada`, `--confirmo-comando`).
   - `HOM_FALHOU` → mostre a etapa e as linhas finais; o log completo está em `.agentic-os/hom/<ID>.log`.
     Falha de migração: avise que o banco HOM pode estar pela metade. Não tente desfazer sozinho.
3. Sucesso: cartão em "Em validação"; o PR recebeu as instruções ao analista. Diga ao usuário que o analista
   deve abrir o PR e fazer **Approve** ou **Request changes**. Não faça commit nesta branch até a assinatura.

## `/cartao assinatura <ID>` — ler a decisão do analista

1. `node .agentic-os/bin/github-setup.mjs card-sign <ID>`.
2. Conforme `situacao`:
   - `aguardando_analista` → diga que ainda não há review válida do analista no PR.
   - `aprovado` → cartão em "Aprovado"; a assinatura está no corpo do PR. Próximo passo: `/cartao merge <ID>`.
   - `reprovado` → passe os `pontos` ao executor (`/worker`); ele corrige e commita **junto com o TASK já
     atualizado**; depois `/cartao revisar <ID>` → `/cartao pr <ID>` → `/cartao hom <ID>`.
   - `ASSINATURA_DE_OUTRO_COMMIT` → peça ao analista aprovar a versão atual no PR.
   - `IDENTIDADE_IGUAL_ANALISTA` → igual ao `/cartao hom`.
3. **Aprovação pelo chat** — só se a ficha tem `aprovacao_pelo_chat: true`. Quando o usuário escrever, por
   iniciativa própria, que aprova ou reprova o cartão, rode
   `node .agentic-os/bin/github-setup.mjs card-sign <ID> --pelo-chat --resultado aprovado|reprovado --frase "<frase literal>"`.
   - `JA_HA_REVIEW` → há review do analista no PR para este commit; rode sem `--pelo-chat`.
   - `CHAT_DESLIGADO` → explique que a aprovação pelo chat está desligada nesta ficha.
   - O registro diz "chat, sem prova do GitHub". Avise o usuário disso.

Nunca aprove, reprove, comente como analista nem registre review por ele. Nunca pergunte "posso aprovar?".

## `/cartao merge <ID>` — integrar na branch principal

1. `node .agentic-os/bin/github-setup.mjs card-merge <ID>`.
2. O script relê as reviews no GitHub e só integra se a assinatura vale para o último commit do PR. Merge em
   squash com a assinatura na mensagem do commit; a branch remota é apagada; a issue é fechada pelo
   `Closes #ID`; o cartão **fica em "Aprovado"** (a publicação PRD vem depois). O TASK não muda.
3. Conforme o resultado:
   - `integrado` → mostre o `sha_squash` e o Tipo. Se `avisos` tiver `ARVORE_SUJA`, diga que a cópia local ficou
     na branch do cartão (há arquivo não commitado); `GIT_FALHOU`, que a volta para a principal falhou.
   - `ja_integrado` → nada a fazer.
   - `CONFIRMACAO_CHAT` → a assinatura foi pelo chat. Explique que não há prova do GitHub e que o merge exige
     um "sim" dele. Só rode com `--confirmo-merge-chat` quando ele escrever, por iniciativa própria, que quer
     integrar; nunca pergunte "posso integrar?" para colher um sim.
   - `ASSINATURA_REPROVADA` → igual ao `reprovado` do `/cartao assinatura`.
   - `ASSINATURA_DE_OUTRO_COMMIT`, `SEM_ASSINATURA` → peça a aprovação do commit atual e rode
     `/cartao assinatura <ID>`.
   - `CHECKS_PENDENTES` → mostre os checks; espere o CI ou corrija.
   - `PR_CONFLITO` → atualize a branch; o commit novo exige `/cartao revisar` → `pr` → `hom` → `assinatura`.
   - `MERGE_RECUSADO` → mostre o motivo (proteção da branch, permissão do token/App).

## `/cartao` sem argumento

Liste os cartões em "A Fazer" e "Em andamento":
`gh project item-list <project.number> --owner <project.owner> --format json` (valores da ficha).

## Proibido (ver `automation/guardrails.md`)

Push na branch principal; merge fora do `/cartao merge`; aprovar PR (próprio ou alheio); alterar regras de proteção do GitHub
para contornar aprovação; assinar ou simular aprovação em nome do analista.
