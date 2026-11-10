# HOM e assinatura do analista — Parte 3 da Governança GitHub

> Status: aprovado em conversa (2026-11-04). Base: Prompt Mestre v2.0, seções "EM VALIDAÇÃO",
> "APROVAÇÃO FORMAL DO ANALISTA" e "REPROVAÇÃO NA HOMOLOGAÇÃO"; camada F v1.10.0
> (`2026-11-03-wizard-governanca-design.md`, `2026-11-04-supervisor-design.md`).
> Versão alvo: **v1.11.0** (painel segue 1.2.1).

## 1. Objetivo

Depois do PR aberto com nota do Supervisor, publicar **exatamente o commit revisado** no ambiente HOM,
entregar ao analista instruções de teste e **ler** a decisão dele, autenticada no GitHub (review do PR).
Aprovado → cartão em "Aprovado" com o registro de assinatura. Reprovado → volta a "Em andamento" e o ciclo
recomeça. O agente nunca assina, aprova ou simula aprovação.

Analogia: o plugin é o gerente da obra. Não opera o guindaste de cada canteiro (o deploy é do projeto),
mas manda o operador certo levantar a peça certa, pendura a placa "sala ocupada" e anota no diário quem
vistoriou, quando e o quê.

## 2. Decisões (aprovadas pelo usuário)

| # | Decisão |
|---|---|
| D1 | Deploy HOM por **comandos do projeto na ficha**: `deploy_hom`, `migracao_hom` (opcional), `testes_hom` (opcional), `url_hom` (opcional). `deploy_hom` vazio = modo manual (usuário publica, plugin registra). |
| D2 | Assinatura = **review do PR** pelo analista (Approve / Request changes), lida pelo script. Prova autenticada do GitHub. |
| D3 | Um cartão por vez no HOM via **GitHub Deployments** no ambiente `hom` (sem Actions, sem custo). |
| D4 | Migração HOM só roda com o "sim" do usuário (Prompt Mestre: "migrações autorizadas"). |
| D5 | Analista ≠ conta do agente (já exigido desde v1.9.0). Para o teste real: `<analista-de-teste>` (conta de teste), só no sandbox. |

## 3. Fluxo

`/cartao <ID>` → trabalho → `/cartao revisar` → `/cartao pr` → **`/cartao hom <ID>`** → analista testa e
faz review no PR → **`/cartao assinatura <ID>`** → "Aprovado" (merge e PRD: Parte 4).

### 3.1 `/cartao hom <ID>` → `card-hom <ID> [--furar-fila --motivo "..."] [--migracao-autorizada] [--dry-run]`

Pré-condições (cada falha → erro com código):
1. Branch do cartão, árvore rastreada limpa, PR aberto (`SEM_PR`).
2. Revisão do Supervisor válida para o HEAD (`exigirRevisao`: `SEM_REVISAO` / `REVISAO_VENCIDA`). O commit
   publicado é o `HEAD`, que é o revisado (ou só difere no TASK).
3. HOM livre: o último deployment `hom` com status `success` e não `inactive` pertence a outro cartão →
   `HOM_OCUPADO` (diz qual cartão e PR). `--furar-fila --motivo` (só com o "sim" do usuário) ignora; o motivo
   vai para o deployment, o TASK e o PR.
4. `migracao_hom` definida e sem `--migracao-autorizada` → `MIGRACAO_NAO_AUTORIZADA` (o orquestrador mostra
   o comando e pede o "sim").
5. Algum comando HOM contém `prd` ou o nome de `ambientes.prd` (palavra inteira, sem caixa) →
   `COMANDO_SUSPEITO_PRD`, a menos que `--confirmo-comando` (só com o "sim").

Execução:
0. Grava a seção `## Homologação` no TASK ("commit publicado em HOM em <data>") e **commita + push antes do
   deploy** (só o TASK muda, a revisão continua válida). Assim o commit publicado é o HEAD do PR, que é o que o
   analista aprova. Nada é commitado na branch depois do deploy: um commit depois da aprovação a descartaria
   (repos protegidos com "dismiss stale reviews").
1. Procura deployment `hom` existente para o mesmo `sha` e cartão; senão cria
   (`POST repos/{r}/deployments` com `ref: <sha>`, `environment: <ambientes.hom>`, `auto_merge: false`,
   `required_contexts: []`, `payload: {cartao, pr, furou_fila?, motivo?}`, `description: "Cartão #ID"`).
2. Status `in_progress`.
3. Roda `deploy_hom` → `migracao_hom` → `testes_hom`, cada um pelo runner (`rodar-comando.mjs`), limite
   `limite_hom_min` da ficha (padrão 30). Saída completa em `.agentic-os/hom/<ID>.log` (fora do git).
4. Falha em qualquer etapa → status `failure` com a etapa; cartão não muda; retorno traz `etapa`, `codigo_saida`,
   últimas 20 linhas (só local). Falha na migração → `aviso_migracao: "banco HOM pode estar pela metade"`.
5. Sucesso → status `success` (`environment_url: url_hom`); cartão → "Em validação"; comentário no PR com
   instruções ao analista (3.3); estado local `.agentic-os/hom/<ID>.json` (sha, PR, deployment, data).
6. Modo manual (`deploy_hom` vazio): retorna `modo: manual` sem criar nada; o orquestrador pede que o usuário
   publique o commit `<sha>` e, com a confirmação, roda `card-hom <ID> --publicado-manual` que registra o
   deployment `success` e segue o passo 5.

### 3.2 `/cartao assinatura <ID>` → `card-sign <ID>`

1. Lê o último deployment `hom` `success` do cartão (`sha_hom`, `em_hom`). Sem → `SEM_HOM`.
2. Lê as reviews do PR (`GET repos/{r}/pulls/{n}/reviews`, paginado). **Só GET.**
3. Considera só reviews de logins em `analistas` (comparação sem caixa), diferentes da conta do agente
   (`gh api user`), estado `APPROVED` ou `CHANGES_REQUESTED`, não `DISMISSED`. Vale **a última de cada analista**.
4. Decisão:
   - Alguma última review `CHANGES_REQUESTED` com `commit_id == sha_hom` → **reprovado**.
   - Senão, alguma `APPROVED` com `commit_id == sha_hom` e `submitted_at > em_hom` → **aprovado**.
   - `APPROVED` só de commit anterior → `ASSINATURA_DE_OUTRO_COMMIT` ("peça ao analista aprovar a versão atual").
   - Nenhuma → `situacao: aguardando_analista` (nada muda).
5. Aprovado → **sem commit** (descartaria a aprovação): o registro de assinatura — cartão, projeto/repo, PR,
   login do analista, data/hora (`submitted_at`), commit homologado, ambiente, resultado "aprovado", evidência
   (`html_url` da review) e texto da review — vai para o **corpo do PR** (seção `## Assinatura`, editar o corpo não
   descarta review), para um comentário no cartão e para o estado local; cartão → "Aprovado"; deployment →
   `inactive` (libera o HOM). O TASK recebe a assinatura na Parte 4 (junto do merge). Repetir `card-sign` depois
   de aprovado não repete efeitos.
6. Reprovado → a seção `## Homologação` do TASK é atualizada **no disco, sem commit** (mesmos campos + motivo =
   texto da review): o executor commita junto com a correção. Cartão → "Em andamento"; deployment → `inactive`;
   comentário no cartão; retorno traz `pontos` (texto da review) para o executor. A revisão do Supervisor deixa
   de valer quando entra o commit da correção (regra já existente).

### 3.3 Instruções ao analista (comentário no PR)

Cartão, commit `sha` curto, link `url_hom` (se houver), lista "O que testar" = critérios de aceite C* do
`proposal.md`, nota do Supervisor, e "Como responder: Approve para aprovar, Request changes com o que falhou.
Commit novo depois disso exige nova homologação." Nunca inclui saída de comando.

## 4. Travas novas

- O script **nunca** cria, edita, envia ou descarta review (`/pulls/N/reviews` só GET; `--method` diferente de
  GET nesse caminho → `TRAVA`). Continua proibido `pr merge|review|close`.
- Review da conta do agente nunca vale.
- Credenciais nunca na ficha (`validarFicha` já recusa chave com nome de segredo; os comandos usam variáveis
  de ambiente / `.env` não versionado).
- Saída de deploy nunca vai para PR/issue.
- Furar fila, migração e comando com `prd`: só com o "sim" do usuário; o procedimento proíbe o orquestrador
  de passar as flags sozinho (guardrail 12).

## 5. Ficha (campos novos, opcionais)

`deploy_hom` (string|null), `migracao_hom` (string|null), `testes_hom` (string|null), `url_hom` (string|null),
`limite_hom_min` (número, padrão 30). `fichaPadrao` traz `null`/30.

## 6. Erros novos

| Código | Como resolver |
|---|---|
| `SEM_PR` | Rode `/cartao pr <ID>` antes. |
| `HOM_OCUPADO` | O HOM está com outro cartão em validação. Espere a assinatura dele ou fure a fila com o "sim" do usuário. |
| `MIGRACAO_NAO_AUTORIZADA` | Mostre o comando de migração ao usuário e peça o "sim". |
| `COMANDO_SUSPEITO_PRD` | Um comando HOM cita produção. Confira com o usuário antes de seguir. |
| `SEM_HOM` | Rode `/cartao hom <ID>` antes. |
| `HOM_FALHOU` | Uma etapa do HOM falhou (veja `etapa` e o log em `.agentic-os/hom/<ID>.log`). Corrija e rode de novo. |
| `ASSINATURA_DE_OUTRO_COMMIT` | O analista aprovou uma versão anterior. Peça a aprovação do commit atual no PR. |

## 7. Peças

| Peça | Responsabilidade |
|---|---|
| `scripts/governanca/hom.mjs` | pré-condições, deployments (criar/achar/status), execução dos comandos, instruções, seção Homologação |
| `scripts/governanca/assinatura.mjs` | leitura das reviews, decisão, registro Assinatura/Reprovação |
| `scripts/governanca/cartao.mjs` | exporta helpers reaproveitados (achar PR do cartão, mover cartão, comentar) |
| `scripts/github-setup.mjs` | subcomandos `card-hom`, `card-sign` e flags novas |
| `template/F-governanca/automation/procedures/cartao.md` | seções `/cartao hom` e `/cartao assinatura`; `pr` aponta para `hom` |
| `template/F-governanca/guardrails-bloco.md` | proibição 12 |
| `scripts/install-governanca.mjs` | `.gitignore` com `.agentic-os/hom/` |
| `skills/agentic-os/wizard.md` | etapa HOM (comandos, url, aviso de credenciais) |

## 8. Limites honestos

- Plano gratuito em repo privado: a review é registrada e lida, mas o GitHub **não obriga** o merge a
  esperar por ela. Na Parte 4 o merge feito pelo plugin vai exigir a assinatura gravada; merge manual pela
  interface do GitHub continua possível — a documentação diz isso.
- O plugin não desfaz migração com falha: avisa e para.

## 9. Testes

Automáticos (`node:test` + `fake-gh`): todos os casos de 3.1 e 3.2 (pré-condições, fila, furar fila com
motivo, migração não autorizada, comando com `prd`, ordem das etapas, falha por etapa, timeout, modo manual,
idempotência por `sha`, saída só no log); decisão da assinatura (última review por analista, dismissed
ignorada, commit antigo, não analista, conta do agente, aguardando, reprovado volta e libera HOM, aprovado
grava registro completo); nenhuma chamada não-GET em reviews; instalador e ficha.

Real (antes da release, sandbox privado + Project, apagados no fim), com o analista `<analista-de-teste>`:
1. Convite ao `<analista-de-teste>`; o usuário aceita como ele.
2. Cartão 1: revisar (10) → pr → hom (`deploy_hom` grava arquivo) → **Request changes** pelo <analista-de-teste> →
   assinatura reprova → corrige → revisar → pr → hom → **Approve** → assinatura aprova; TASK com registro.
3. Aprovação de commit antigo não vale; cartão 2 recebe `HOM_OCUPADO` enquanto o 1 está em validação.

## 10. Docs e versão

`docs/GOVERNANCA.md` (HOM, assinatura, limite do plano gratuito), `docs/CONFORMANCE-SPEC.md` (F9: procedimento
com `hom`/`assinatura` e `.gitignore` com `.agentic-os/hom/`; F4 vira 12 proibições), guia seção #governanca,
`README.md`, `RELEASE-NOTES.md`. Manifestos → 1.11.0; painel 1.2.1.

## 11. Fora do escopo

Merge na principal, deploy PRD, migrações PRD, rollback e "Concluído" (Parte 4).
