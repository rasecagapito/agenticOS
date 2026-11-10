# Identidade do agente e aprovação pelo chat — complemento da Parte 3 da Governança GitHub

> Status: aprovado em conversa (2026-11-08). Complementa `2026-11-04-hom-assinatura-design.md`.
> Versão alvo: **v1.11.0** (ainda não lançada; sai junto com HOM e assinatura). Painel segue 1.2.1.

## 1. Problema

Hoje o agente usa o login do `gh` do usuário. Consequências:

1. O PR é aberto pela conta do usuário. O GitHub não deixa o autor aprovar o próprio PR, então quem é dono do
   projeto e quer ser o analista não consegue dar Approve.
2. O agente tem o mesmo token do usuário. Um Approve dessa conta pode ter sido dado pelo agente; não prova nada.
   Por isso o plugin ignora review da conta do agente — e quem trabalha sozinho fica sem como assinar.

O Agentic OS é distribuído para qualquer pessoa: a solução tem de ser genérica, configurada por projeto, sem
nomes de pessoas, orgs ou projetos no plugin e sem levar dado ou memória de um projeto para outro.

Analogia: o agente ganha um crachá próprio. O analista assina com o crachá dele; a portaria (GitHub) sabe
distinguir os dois. Sem crachá próprio, o projeto pode optar por um "livro de visitas" (aprovação pelo chat),
que registra a declaração mas não prova quem escreveu.

## 2. Decisões (aprovadas pelo usuário)

| # | Decisão |
|---|---|
| I1 | Identidade do agente **por projeto**, em três modos: `token` (token pronto em variável de ambiente — conta-robô ou outro), `app` (o plugin gera o token de instalação de um GitHub App a partir do ID e da chave privada) e `nenhuma` (padrão; comportamento atual). |
| I2 | Segredo **nunca** na ficha nem no git: a ficha guarda só nomes de variáveis de ambiente e o `app_id`. |
| I3 | `detect` e `apply` rodam com a conta do usuário (exigem admin, feitos uma vez). `card-start`, `card-pr`, `review-*`, `card-hom` e `card-sign` usam a identidade do agente quando configurada. |
| I4 | Sem identidade separada, o HOM e a assinatura **bloqueiam** se o agente estiver em `analistas`. Exceção opt-in: `aprovacao_pelo_chat: true` na ficha libera a assinatura pelo chat, registrada como prova fraca. |
| I5 | Fichas antigas (v1.9/v1.10) sem os campos novos continuam funcionando igual (`modo: nenhuma`, chat desligado). |
| I6 | O repo do plugin não contém login, org ou nome de projeto além do autor do plugin e dos nomes fictícios dos testes (teste automático garante). |

## 3. Ficha

Campos novos em `fichaPadrao`:

```json
"identidade_agente": { "modo": "nenhuma", "token_env": "AGENTIC_OS_GH_TOKEN", "app_id": null, "chave_privada_env": "AGENTIC_OS_APP_KEY_PATH" },
"aprovacao_pelo_chat": false
```

- `modo`: `nenhuma` | `token` | `app`. Valor desconhecido → `FICHA_INVALIDA`.
- `token_env`: nome da variável com o token (modo `token`).
- `app_id`: inteiro (modo `app`). `chave_privada_env`: nome da variável com o **caminho** da `.pem` (fora do repo).
- `validarFicha` continua recusando chaves com cara de segredo; os nomes acima terminam em `_env`/`_id` e não
  guardam valor secreto. Valor de `token_env`/`chave_privada_env` precisa casar `^[A-Z][A-Z0-9_]*$`.
- Ficha sem `identidade_agente` → tratada como `modo: nenhuma`; sem `aprovacao_pelo_chat` → `false`.

## 4. Componentes

### 4.1 `scripts/governanca/identidade.mjs` (novo)

- `resolverIdentidade(ficha, cwd)` → `{ modo, token|null, login|null }`, com cache em memória por execução.
  - `nenhuma`: `token: null` (o `gh` usa o login local).
  - `token`: lê `process.env[token_env]`; vazio → `TOKEN_AUSENTE`. Login via `gh api user` com esse token.
  - `app`: lê a `.pem` do caminho em `process.env[chave_privada_env]`; ausente/ilegível/inválida →
    `APP_CHAVE_INVALIDA`. Gera JWT RS256 (`iat` = agora − 60 s, `exp` = agora + 9 min, `iss` = `app_id`) com
    `node:crypto`, sem dependências. `GET repos/{repo}/installation` (com o JWT) → 404 = `APP_NAO_INSTALADO`.
    `POST app/installations/{id}/access_tokens` → token de 1 h. Login = `<slug>[bot]` (de `GET app`).
    Renova se faltar menos de 5 min para expirar.
- O token fica só em memória. Nunca vai para stdout, log, arquivo de estado ou `.git/config`.

### 4.2 `gh.mjs`

- `gh(args, { input, agente })`: com `agente: true` e token resolvido, roda com `GH_TOKEN=<token>` no `env` do
  processo filho. Sem `agente`, comportamento atual (conta do usuário).
- Mensagens de erro do `gh` passam por um filtro que troca o token por `***` antes de virar `ErroGov`.
- A trava de reviews/merge (`verificarChamada`) vale igual para as duas identidades.

### 4.3 `git.mjs`

- `pushBranch` com identidade de agente: `git -c http.extraheader="AUTHORIZATION: basic <base64(x-access-token:TOKEN)>" push ...`
  — credencial só daquele comando, nunca gravada no repo. Sem identidade: comportamento atual.

### 4.4 Quem usa qual identidade

| Subcomando | Identidade |
|---|---|
| `detect`, `apply` | usuário |
| `card-start`, `card-pr`, `review-check`, `review-record`, `review-decide`, `card-hom`, `card-sign` | agente (se configurada; senão, usuário) |

### 4.5 Trava `IDENTIDADE_IGUAL_ANALISTA`

Em `card-hom` (antes de qualquer efeito) e em `card-sign`: se o login do agente (resolvido) estiver em
`analistas` (sem caixa) e `aprovacao_pelo_chat` for `false` → `IDENTIDADE_IGUAL_ANALISTA`. O `como_resolver`
cita as duas saídas: configurar `identidade_agente` (`token` ou `app`) ou ligar `aprovacao_pelo_chat`.

### 4.6 `detect`

Devolve `identidade: { modo, login_agente, login_gh_local, conflito, avisos[] }`.
- `conflito: true` se `login_agente` estiver em `analistas`.
- Aviso `GH_LOCAL_E_ANALISTA` se o `gh` local estiver logado com uma conta de `analistas` e o modo não for
  `nenhuma`: "o agente consegue agir como o analista nesta máquina; deixe o `gh` logado só com a conta do
  agente ou use o modo `app`".
- Falhas de identidade viram aviso no `detect` (não erro), para o wizard conseguir mostrar e orientar.

## 5. Assinatura

### 5.1 Review no GitHub (prova forte)

`card-sign <ID>` como hoje, com:
- "Conta do agente" = `login` da identidade resolvida (no modo `app`, `<slug>[bot]`).
- `textoAssinatura` ganha a linha `| Tipo | review no GitHub |`.
- **Risco registrado (decisão do usuário):** com identidade separada (`token`/`app`) mas o `gh` local logado
  com uma conta de `analistas`, o agente ainda conseguiria aprovar usando esse login. A assinatura não bloqueia:
  sai com `| Tipo | review no GitHub ⚠️ gh local = analista |` e o retorno traz `aviso: GH_LOCAL_E_ANALISTA`.
  Para prova forte de verdade, o usuário deixa o `gh` da máquina só com a conta do agente.

### 5.2 Aprovação pelo chat (prova fraca, opt-in)

`card-sign <ID> --pelo-chat --resultado aprovado|reprovado --frase "<texto do usuário>"`

- `aprovacao_pelo_chat: false` → `CHAT_DESLIGADO`.
- Faltando `--resultado` ou `--frase` → `PARAMETRO`. `--resultado reprovado` usa a frase como motivo.
- Pré-condições iguais ao caminho da review: estado HOM existe (`SEM_HOM`), PR aberto, HEAD do PR = commit
  publicado, HOM ainda com este cartão.
- Se já houver review válida de analista (Approve/Request changes) no GitHub para o commit publicado →
  `JA_HA_REVIEW` (a prova forte vence; rode `card-sign <ID>` sem `--pelo-chat`).
- Efeitos idênticos aos da review (mesma retomada idempotente por efeito): aprovado → seção Assinatura no
  PR, cartão em "Aprovado", comentário na issue, deployment `inactive`; reprovado → linha no TASK (disco),
  cartão em "Em andamento", comentário, deployment `inactive`.
- Registro:
  ```
  | Tipo | chat, sem prova do GitHub |
  | Declarado por | analista da ficha (não autenticado) |
  | Frase | "<frase>" |
  ```
  No lugar de `Analista`/`Evidência` da review: `Analista` = `analistas[0]` da ficha com o sufixo
  "(declarado)"; `Evidência` = "declaração no chat em <data>".
- **Guardrail 13**: usar `--pelo-chat` só quando o usuário escreveu, por iniciativa própria, que aprova ou
  reprova o cartão; nunca perguntar "posso aprovar?" para colher um sim; a frase registrada é a dele, literal.

### 5.3 Parte 4 (fora deste escopo, só registrado)

O merge lerá o `Tipo`; com "chat", o PR recebe aviso ⚠️ (como a nota liberada pelo usuário no Supervisor).

## 6. Erros novos

| Código | Quando | Como resolver |
|---|---|---|
| `IDENTIDADE_IGUAL_ANALISTA` | agente está em `analistas` e chat desligado | configurar `identidade_agente` ou ligar `aprovacao_pelo_chat` |
| `TOKEN_AUSENTE` | modo `token` e a variável está vazia | definir a variável (ambiente ou `.env` fora do git) |
| `APP_CHAVE_INVALIDA` | modo `app` e a `.pem` não lê/não assina | conferir a variável com o caminho e a chave baixada do App |
| `APP_NAO_INSTALADO` | o App não está instalado no repo | instalar o App no repo (Settings da org → GitHub Apps) |
| `CHAT_DESLIGADO` | `--pelo-chat` com `aprovacao_pelo_chat: false` | ligar na ficha (wizard) ou usar review no GitHub |
| `JA_HA_REVIEW` | `--pelo-chat` com review válida no GitHub | rodar `card-sign <ID>` sem `--pelo-chat` |

## 7. Wizard

Etapa nova **"Identidade do agente"** depois de "Analista" (renumerar as seguintes):
1. Modo: **App** (recomendado em org), **conta-robô** ou **nenhuma**.
2. App: pedir `app_id` e o **nome** da variável com o caminho da `.pem`. Robô: lembrar de pôr o token em
   `AGENTIC_OS_GH_TOKEN` (ou outro nome, gravado em `token_env`). Mostrar o passo a passo e as permissões
   mínimas: *Contents* (RW), *Pull requests* (RW), *Issues* (RW), *Deployments* (RW), *Metadata* (R) e, no
   Project da org/usuário, *Projects* (RW).
3. Nenhuma: explicar que o analista precisa ser outra pessoa; oferecer `aprovacao_pelo_chat` com o aviso de
   prova fraca.
4. Teste: rodar `detect` e mostrar "agente = X · analistas = Y · ✅/⚠️".

## 8. Docs e conformidade

- `docs/GOVERNANCA.md`: seção "Identidade do agente" (problema, analogia do crachá, modos, passo a passo,
  permissões, aviso do `gh` local, aprovação pelo chat e o que ela não prova) e "Atualizando de 1.10".
- Guia HTML (`#governanca`), README (camada F), RELEASE-NOTES 1.11.0 (acrescentar ao texto já escrito).
- `guardrails-bloco.md`: guardrail 13. `CONFORMANCE-SPEC.md`: F4 "12" → "13"; **F10**: ficha com
  `identidade_agente` válida ou ausente, e nenhum segredo nela.
- Procedimento `/cartao`: em `/cartao assinatura`, o ramo "pelo chat"; nos erros, as saídas de
  `IDENTIDADE_IGUAL_ANALISTA`.

## 9. Limpeza de nomes

- Trocar, no spec e no plano da Parte 3 (`2026-11-04-hom-assinatura-design.md`, `2026-11-04-hom-assinatura.md`),
  nomes reais de conta e org por "conta de analista de teste" / "org de teste".
- Teste automático `scripts/tests/nomes-reais.test.mjs`: varre os arquivos versionados (`git ls-files`) e
  falha em qualquer `github.com/<dono>`, `repos/<dono>/`, `"repo": "<dono>/..."` ou `analistas: [...]` cujo
  dono não esteja na lista **permitida** versionada `scripts/tests/donos-permitidos.txt` (autor do plugin e
  nomes fictícios dos testes, como `acme`, `ana`, `dono`). Uma lista de bloqueio não serve: ela própria
  publicaria os nomes reais.

## 10. Testes

Automáticos (`gh` falso, sem rede):
1. Ficha antiga sem os campos → `modo: nenhuma`, chat `false`, fluxo igual ao de hoje.
2. Modo `token`: `GH_TOKEN` chega ao `gh` falso; token ausente → `TOKEN_AUSENTE`; o token não aparece em
   stdout, no estado, no log nem em `.git/config` (push com `extraheader` só no comando).
3. Modo `app`: chave RSA gerada no teste (`generateKeyPairSync`); JWT verificado (cabeçalho, `iss`, `exp`,
   assinatura) pelo `gh` falso; instalação 404 → `APP_NAO_INSTALADO`; `.pem` inválida → `APP_CHAVE_INVALIDA`;
   login `<slug>[bot]` usado como agente no `card-sign`.
4. `IDENTIDADE_IGUAL_ANALISTA` em `card-hom` e `card-sign`; liberado com `aprovacao_pelo_chat: true`.
5. `--pelo-chat`: desligado → `CHAT_DESLIGADO`; aprovado e reprovado com os efeitos e o registro "Tipo: chat";
   review válida existente → `JA_HA_REVIEW`; retomada sem duplicar.
6. `detect`: `conflito` e aviso `GH_LOCAL_E_ANALISTA`.
7. `nomes-reais.test.mjs` passa no repo.

Real (antes da release; repo privado de teste numa org do usuário com plano Team, Project de teste e um
GitHub App de teste criado pelo usuário; tudo apagado no fim com o "sim" dele):
1. Agente como App: `card-start` → `revisar` (Supervisor real) → `pr` (autor = `<slug>[bot]`) → `hom`.
2. O usuário, pelo navegador, faz **Request changes** → `card-sign` = reprovado.
3. Correção → `revisar` → `pr` → o usuário faz **Approve antes** do `hom` → `hom` (commit do TASK) →
   `card-sign` = `ASSINATURA_DE_OUTRO_COMMIT` → **Approve** de novo → aprovado.
4. Cartão 2 com o HOM ocupado → `HOM_OCUPADO`.
5. Ficha com `aprovacao_pelo_chat: true`: cartão 3 assinado pelo chat → registro "chat, sem prova do GitHub".
6. Apagar repo e Project; o usuário remove o App.

## 11. Fora do escopo

- Merge e PRD (Parte 4).
- Criar conta-robô ou App pelo plugin (o usuário cria; o plugin só usa).
- Guardar token em cofre do sistema operacional.
