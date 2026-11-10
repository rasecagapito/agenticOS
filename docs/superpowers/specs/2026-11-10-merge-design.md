# Parte 4a — Merge na principal exigindo a assinatura (design)

Data: 2026-11-10. Versão alvo: **1.12.0**. Parte 4b (deploy PRD, migração PRD, rollback, "Concluído") fica
para um spec próprio.

## 1. Problema

Até a 1.11.0 a assinatura do analista é registrada (review no GitHub ou declaração pelo chat), mas o merge na
branch principal é manual. Em repositório privado no plano gratuito o GitHub não obriga o merge a esperar a
aprovação. Falta um caminho do plugin que só integre o PR quando a assinatura vale para o commit atual.

## 2. Decisões

- **Recorte:** 4a só merge; 4b PRD em seguida (release separada).
- **Por Tipo da assinatura:**
  - `review no GitHub` → merge.
  - `review no GitHub ⚠️ gh local = analista` → merge, com o aviso na mensagem do squash e no PR.
  - `chat, sem prova do GitHub` → merge só com `--confirmo-merge-chat` (um "sim" novo do usuário, escrito por
    iniciativa dele; nunca colhido com pergunta induzida), com aviso ⚠️.
- **Pós-merge:** squash; branch remota apagada; issue fechada pelo `Closes #ID`; cartão **fica em "Aprovado"**
  até a 4b mover para "Concluído".
- **TASK não muda no merge.** Pôr a assinatura no arquivo TASK exigiria commit novo na branch, e commit novo
  descarta a aprovação. A assinatura vai na **mensagem do commit de squash** (permanente no `git log` da
  principal) e continua no corpo do PR.
- **Abordagem:** reconferir no GitHub na hora do merge (não confiar no texto do corpo do PR para reviews).

## 3. Comando `/cartao merge <ID>` → `github-setup.mjs card-merge <ID> [--confirmo-merge-chat]`

Módulo novo `scripts/governanca/merge.mjs` (função `cardMerge(cwd, ficha, id, o)`), chamado pelo
`github-setup.mjs` dentro de `comoAgente()` (identidade do agente ativa; separação exigida como em
`card-sign`).

### 3.1 Pré-condições (nesta ordem)

1. Cartão existe (`CARTAO_INEXISTENTE`) e está em "Aprovado" (`CARTAO_FORA_DE_APROVADO`).
2. Estado local `.agentic-os/hom/<ID>.json` tem `assinatura` com `resultado: aprovado` (`SEM_ASSINATURA`).
   Assinatura pendente pelo chat (`assinatura_pendente`) → `PARAMETRO` pedindo para retomar `card-sign`.
3. PR existe e está aberto, não draft, com base na branch principal (`SEM_PR`). PR já integrado → ir para 3.4
   (idempotência).
4. `headRefOid` do PR == `assinatura.commit` (`ASSINATURA_DE_OUTRO_COMMIT`).
5. Prova da assinatura, conforme o Tipo gravado:
   - Tipos review: reler as reviews (`lerReviews` + `decidir()` com `desde` = 0, analistas da ficha, agente
     atual). `reprovado` → `ASSINATURA_REPROVADA`; `aprovado` no commit atual → segue; outro resultado →
     `SEM_ASSINATURA`. O Tipo efetivo é recalculado (`tipoDaReview`), não lido do estado.
   - Tipo chat: exige que nenhuma review do analista peça mudanças no commit atual (senão
     `ASSINATURA_REPROVADA`), que o corpo do PR tenha a seção "## Assinatura" com Tipo chat e que
     `--confirmo-merge-chat` tenha sido passado (`CONFIRMACAO_CHAT`). Com `aprovacao_pelo_chat: false` na
     ficha → `CHAT_DESLIGADO`.
6. Checks: `gh pr checks` sem pendente nem falho nos obrigatórios (`CHECKS_PENDENTES`, com a lista). Sem checks
   configurados → segue.
7. `mergeable` do PR: `CONFLICTING` → `PR_CONFLITO`; `UNKNOWN` → uma nova leitura após 3 s, depois
   `PR_CONFLITO` com "o GitHub ainda está calculando; tente de novo".

### 3.2 Merge

`gh pr merge <url> --squash --match-head-commit <sha> --delete-branch --subject "<título do PR> (#<PR>)"
--body-file -` com corpo:

```
<bloco da assinatura: textoAssinatura(registro)>

⚠️ <aviso, quando o Tipo não for "review no GitHub">

Closes #<ID>
```

Recusa do GitHub (proteção, permissão do token/App, head mudou) → `MERGE_RECUSADO` com o motivo do `gh`
(token escondido como no resto do `gh.mjs`). Para App, a mensagem lembra a permissão `contents: write`.

### 3.3 Depois do merge (efeitos marcados no estado, retry não duplica)

Gravar `merge_pendente` no estado antes do merge; marcar cada efeito ao concluir:
- `merge` — feito (sha do squash guardado).
- `comentario` — comentário na issue: "Integrado na <principal> em <data> (squash <sha7>), assinatura <Tipo>."
- `local` — se a árvore estiver limpa: `git checkout <principal>` e `git pull --ff-only`; se suja, não mexe e
  avisa (`aviso: ARVORE_SUJA`), sem falhar o comando.
- Estado final: `merge: { sha, em, tipo }`; `merge_pendente` removido.

O cartão não muda de coluna (fica em "Aprovado"). A issue é fechada pelo GitHub via `Closes #ID`.

### 3.4 Idempotência

PR já `MERGED` → não chama `gh pr merge`; completa os efeitos que faltam em `merge_pendente` (ou, sem estado,
só comentário + local) e devolve `{ situacao: 'ja_integrado' }`.

### 3.5 Saída

JSON como os outros subcomandos: `{ ok, situacao: 'integrado'|'ja_integrado', pr, sha_squash, tipo, aviso? }`.

## 4. Trava reescrita

Antes: "o script nunca faz push ou merge na branch principal". Depois: "o script nunca faz push na branch
principal; merge só pelo `card-merge`, com assinatura válida do commit atual e `--match-head-commit`". Nunca
aprova PR, nunca apaga nada além da branch do cartão já integrada, só endurece a proteção.

**Guardrail 14** (template `guardrails-bloco.md`): integrar só com `/cartao merge`; nunca `gh pr merge` direto
nem merge pela interface em nome do usuário; `--confirmo-merge-chat` só quando o usuário escreveu o "sim" por
iniciativa própria.

## 5. Erros novos

| Código | Quando | Como resolver |
|---|---|---|
| `CARTAO_FORA_DE_APROVADO` | cartão não está em "Aprovado" | concluir `/cartao assinatura` com aprovação |
| `SEM_ASSINATURA` | não há aprovação válida (review ou chat) | rodar `/cartao assinatura` depois da decisão do analista |
| `ASSINATURA_REPROVADA` | última review do analista pede mudanças | corrigir → revisar → pr → hom |
| `CHECKS_PENDENTES` | check obrigatório pendente ou falho | esperar o CI ou corrigir |
| `PR_CONFLITO` | PR com conflito ou o GitHub ainda calculando | atualizar a branch (commit novo exige assinar de novo) |
| `MERGE_RECUSADO` | o GitHub recusou o merge | ler o motivo; conferir proteção e permissão do token/App |
| `CONFIRMACAO_CHAT` | Tipo chat sem `--confirmo-merge-chat` | o usuário confirma por iniciativa própria |

Reusa: `CARTAO_INEXISTENTE`, `SEM_PR`, `ASSINATURA_DE_OUTRO_COMMIT`, `CHAT_DESLIGADO`, `PARAMETRO`,
`IDENTIDADE_IGUAL_ANALISTA`.

## 6. Limites honestos

- Merge manual pela interface do GitHub continua possível em repo privado no plano gratuito; o plugin não
  impede, só não o faz.
- Tipo chat não tem prova do GitHub; o corpo do PR pode ser editado por quem tem acesso. O aviso ⚠️ fica na
  mensagem do squash.
- Com a proteção ativa (repo público ou plano pago), assinatura só pelo chat não satisfaz a aprovação exigida:
  o GitHub recusa e o comando devolve `MERGE_RECUSADO`.

## 7. Testes

Automáticos (`node:test` + fake-gh), arquivo novo `scripts/tests/merge.test.mjs`, incluído em
`scripts/check-governanca.sh`:
- Tipo review → merge; Tipo ⚠️ → merge com aviso na mensagem; chat sem flag → `CONFIRMACAO_CHAT`; chat com
  flag → merge com aviso; chat com ficha desligada → `CHAT_DESLIGADO`.
- Commit novo após assinatura → `ASSINATURA_DE_OUTRO_COMMIT`; reprovação mais nova → `ASSINATURA_REPROVADA`;
  dismissed ignorada; aprovação da conta do agente não vale → `SEM_ASSINATURA`.
- Cartão fora de "Aprovado"; sem estado; assinatura pendente pelo chat.
- Checks pendente/falho → `CHECKS_PENDENTES`; `CONFLICTING` → `PR_CONFLITO`; recusa do `gh` → `MERGE_RECUSADO`
  sem token na mensagem.
- Argumentos: `--squash`, `--match-head-commit <sha>`, `--delete-branch`, corpo com bloco e `Closes #ID`.
- Já integrado → não chama merge e completa efeitos; retry após falha no comentário não duplica o merge.
- Token do agente no `gh pr merge`; nenhum `git push` para a principal.
- Árvore suja no pós-merge → aviso, sem falha.

Real (opcional, antes da release): sandbox privado do usuário com Tipo chat, um cartão de ponta a ponta até o
merge; sandbox e Project apagados no fim com "sim". Sem segunda conta de analista, o merge por review fica sem
teste real (documentado).

## 8. Docs e versão

`docs/GOVERNANCA.md` (seção "Merge (Parte 4a)", trava reescrita, limites, erros, `card-merge` em "Comandos do
script", "O que faz (Partes 0 a 4a)"), `template/F-governanca/automation/procedures/cartao.md`
(`/cartao merge`; `assinatura` aponta para `merge`), guardrail 14, `docs/CONFORMANCE-SPEC.md` (F11),
`skills/agentic-os/SKILL.md` + `agentic-os.skill`, guia HTML (#governanca), `README.md`, `RELEASE-NOTES.md`.
Manifestos → 1.12.0. Teste `nomes-reais` precisa continuar verde.

## 9. Fora do escopo

Deploy PRD, migração PRD, rollback, coluna "Concluído" (Parte 4b). Atualizar branch atrasada automaticamente.
Escolha do método de merge pela ficha.
