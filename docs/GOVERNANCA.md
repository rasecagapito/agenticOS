# Governança GitHub (camada F)

> Analogia: uma esteira de fábrica com portas trancadas. Cada pedido (cartão) anda numa esteira própria
> (branch). Para entrar no estoque oficial (`main`), a porta só abre com o crachá do analista
> (aprovação no GitHub) — e se alguém mexer na peça depois do crachá, a porta tranca de novo.

## O que faz (Partes 0 a 3)

1. **Wizard** (`/agentic-os`): pergunta tudo em etapas e configura o projeto.
2. **Ficha** `.agentic-os/governanca.json`: repo, Project, colunas, analista(s), ambientes. Sem segredo.
3. **`/cartao <ID>`**: cartão (issue no Project, coluna "A Fazer") → plano aprovado →
   branch `feature/{ID}-{desc}` (ou `fix/`) → `docs/tasks/TASK-{ID}-{desc}.md` → cartão em "Em andamento".
4. **`/cartao pr <ID>`**: push da branch, PR para a `main` citando `#ID`, comentário no cartão.
5. **`main` protegida**: PR obrigatório, 1 aprovação do analista (CODEOWNERS), aprovação descartada em
   commit novo, aprovação do último push, vale para admins, sem force-push nem exclusão.
6. **Environments** `hom` e `prd` (o `prd` exige aprovação do analista).

7. **`/cartao revisar <ID>`**: Supervisor (nota 0–10) — veja a seção abaixo.

8. **`/cartao hom <ID>`** e **`/cartao assinatura <ID>`**: publicam no HOM e registram a decisão do analista
   — veja a seção "HOM e assinatura (Parte 3)".

9. **Identidade do agente**: o agente age no GitHub com conta própria (token ou GitHub App) para o dono do
   projeto poder ser o analista — veja a seção "Identidade do agente".

Próxima parte: publicação PRD (e o merge exigir a assinatura).

## Supervisor (Parte 2)

> Analogia: o fiscal de obra. Quem construiu não se fiscaliza: um fiscal independente confere cada item da
> lista de aceite e só carimba com prova. O que dá para medir com régua (testes, segredos) é medido por um
> script, sem opinião de IA.

**Quem mede o quê**
- **Script** (B1–B4): B1 testes do projeto passam (`comando_testes` da ficha); B2 nenhum segredo no diff da
  branch; B3 trabalho na branch do cartão, principal intocada; B4 TASK do cartão existe.
- **Supervisor** (subagente `supervisor`, Opus fixo, sem edição): G1 guardrails respeitados, G2 documentação
  afetada atualizada, E* gates extras de `automation/evaluation.json` (`gates.revisao_cartao`), C* os
  "Critérios de aceite" do `proposal.md` do cartão.
- **Usuário**: decide as exceções (seguir com nota baixa, nova análise, liberar texto no detector de segredos).

**Nota** = ⌊10 × atendidos ÷ total⌋. Critério sem prova, ausente ou com status inválido conta como **não
atendido**. A nota fica presa ao commit: commit novo (fora o TASK do cartão) vence a revisão.

**Rodada** = 3 notas. Nota 10 → `/cartao pr`. Abaixo de 10 → o executor corrige só os pendentes e revisa de
novo. Na 3ª nota abaixo de 10 o usuário escolhe: **seguir** com a nota atual (o PR mostra ⚠️ e o motivo) ou
**nova análise** (começa outra rodada). O agente nunca decide isso sozinho (`review-decide` só com o "sim").

**`ARVORE_SUJA` no revisar:** `review-check` recusa arquivo modificado ou não rastreado e não ignorado, porque
os testes rodariam com código fora do commit. Commite o que faz parte do cartão ou ponha artefatos de teste
(`coverage/`, relatórios) no `.gitignore`.

**Segredos (B2):** procura chaves AWS, tokens GitHub, `sk-…`, chaves privadas e senhas literais (`password`,
`token`, `secret`, `api_key`… com valor entre aspas, ou sem aspas se tiver dígito ou símbolo). Limite honesto:
**senha sem aspas só com letras não é detectada** (evita travar anotações de tipo como `token: string`).
Falso alarme: só o usuário libera o texto exato em `.agentic-os/segredos-permitidos.txt`; o PR lista o que foi
liberado.

**Limite honesto:** o estado fica em `.agentic-os/supervisor/` (local, fora do git). É registro, não cadeado:
quem tem acesso ao disco pode editá-lo, e apagá-lo zera os ciclos. Por isso o PR sempre mostra o commit revisado,
a nota, as rodadas e as liberações: uma burla fica visível para o analista. A trava real do merge continua sendo
a aprovação do analista no GitHub.

**Custo:** cada revisão chama o Opus, mesmo com o roteador Jev (até 3 por rodada).

**Divergência do Prompt Mestre (decisão do usuário):** o Prompt Mestre manda manter a atividade **bloqueada**
depois de dois ciclos de correção e exige "10/10 comprovada" para concluir. Aqui, depois da 3ª nota abaixo de 10, o
cartão não trava: o usuário escolhe seguir com a nota atual (⚠️ no PR) ou pedir nova análise. A regra de conclusão
do cartão passa a ser "nota 10 **ou** exceção autorizada pelo usuário e registrada".

## HOM e assinatura (Parte 3)

> Analogia: o gerente de obra e o dono da obra. O gerente (o agente) coloca a peça pronta na sala de
> demonstração (o HOM), um cliente por vez, e avisa o dono (o analista). Quem diz "aprovado" ou "refaça" é só o
> dono, por escrito no PR. O gerente apenas lê o que o dono escreveu e anota; nunca assina por ele.

**Ficha (campos novos, sem segredo):** `deploy_hom` (comando que publica; vazio = publicação manual),
`migracao_hom` (opcional), `testes_hom` (opcional), `url_hom` (link do HOM) e `limite_hom_min` (tempo máximo
de cada etapa, padrão 30). Credenciais **nunca** vão na ficha: só em variáveis de ambiente ou `.env` fora do git.

### `/cartao hom <ID>` — publicar no HOM

- **Pré-condições:** você está na branch do cartão; não há arquivo modificado nem arquivo novo não ignorado
  (o estado local do plugin não conta; **arquivo não rastreado bloqueia o hom** com `ARVORE_SUJA`); existe PR
  aberto (`/cartao pr`); a revisão do Supervisor vale para o commit atual (nota 10 ou liberação do usuário).
- **Registro antes do deploy:** o plugin acrescenta a seção "Homologação" ao TASK, faz **um** commit
  (`docs(task): TASK-<ID> homologacao`) e empurra a branch. Esse é o commit que vai para o HOM. **Depois do
  deploy nada é commitado na branch**, porque um commit depois da aprovação do analista a descartaria.
  Repetir o comando no mesmo commit não duplica o commit nem o deployment.
- **Um cartão por vez (fila):** a fila é o ambiente `hom` dos GitHub Deployments. O HOM está ocupado quando o
  deployment mais recente de **outro** cartão está com sucesso, ou ainda em andamento há menos de
  `limite_hom_min` + 5 minutos. Ocupado → erro `HOM_OCUPADO` dizendo qual cartão. Furar a fila só com o "sim" do
  usuário e um motivo (`--furar-fila --motivo "..."`); o motivo fica no deployment e no TASK.
  **Se outro cartão tomar o HOM, a homologação pendente do primeiro deixa de valer:** o GitHub desativa o
  deployment antigo e o `/cartao assinatura` recusa (`SEM_HOM`) até rodar `/cartao hom` de novo.
- **Etapas, nesta ordem:** `deploy_hom`, `migracao_hom`, `testes_hom`, cada uma com o limite de tempo. A
  migração só roda com o "sim" do usuário a cada vez (`--migracao-autorizada`). Comando de HOM que cite produção
  (`prd` ou o nome do ambiente PRD) pede confirmação (`--confirmo-comando`). Se uma etapa falha, o deployment fica
  `failure`, o cartão **não** muda de coluna e o erro `HOM_FALHOU` traz a etapa, o código de saída e o final da
  saída. Falha na migração: o banco HOM pode ter ficado pela metade; confira antes de repetir.
- **Log completo** em `.agentic-os/hom/<ID>.log` (local, fora do git). O comentário no PR nunca leva a saída
  dos comandos.
- **Sucesso:** cartão em "Em validação" e um comentário no PR com o commit publicado, o link do HOM, a nota do
  Supervisor e a lista do que testar (os critérios de aceite), explicando como aprovar ou reprovar.
- **Modo manual** (`deploy_hom` vazio): o 1º passo para depois de registrar e empurrar o commit e pede que o
  usuário publique aquele commit; com a confirmação dele roda-se o 2º passo (`--publicado-manual`).
  **No 2º passo repita as mesmas flags autorizadas do 1º** (`--furar-fila --motivo`, `--migracao-autorizada`,
  `--confirmo-comando`).
- Cartão já aprovado naquele mesmo commit: o comando não republica (`ja_aprovado`).

### `/cartao assinatura <ID>` — ler a decisão do analista

O plugin **só lê** (GET) as reviews do PR; nunca escreve em review nem faz merge (travado no `gh`).

- Vale a **última review de cada analista da ficha** (Approve ou Request changes); comentário simples e review
  descartada não valem; a review da **conta do agente não vale**.
- Aprovação só vale se for do **commit publicado** e **posterior** à publicação no HOM. Aprovação de um commit
  anterior → `ASSINATURA_DE_OUTRO_COMMIT`. Sem review válida → `aguardando_analista`.
- Antes de registrar, confere que o PR segue aberto, que o commit do PR é o publicado e que o HOM ainda é
  deste cartão; senão `SEM_HOM` com a causa.
- **Aprovado:** o corpo do PR ganha a seção "## Assinatura" (analista, data/hora, commit, ambiente, evidência =
  link da review), o cartão vai para "Aprovado", a issue recebe um comentário e o HOM é liberado para o próximo
  cartão. Nenhum commit é criado.
- **Reprovado:** o motivo (texto da review) é anotado no TASK **no disco, sem commit** (commite junto com a
  correção), o cartão volta para "Em andamento", a issue recebe um comentário e o HOM é liberado. O comando devolve os
  `pontos` para o executor corrigir; depois: `/cartao revisar` → `/cartao pr` → `/cartao hom`. Se o comando for
  interrompido no meio, rodar de novo completa o que faltou sem duplicar nada.

**Limite honesto:** o registro da assinatura é real (review no GitHub + cópia no PR), mas em repositório
**privado no plano gratuito** o GitHub **não obriga** o merge a esperar essa aprovação. A Parte 4 vai exigir a
assinatura no merge feito pelo plugin; até lá, um merge manual pela interface do GitHub continua possível.
O estado local (`.agentic-os/hom/`) é registro, não cadeado.

## Identidade do agente

> Analogia: o agente ganha um crachá próprio. O analista assina com o crachá dele e a portaria (o GitHub)
> sabe distinguir os dois. Sem crachá próprio, o projeto pode optar por um "livro de visitas" (aprovação pelo
> chat): ele registra a declaração, mas não prova quem escreveu.

**O problema.** Por padrão o agente usa o login do `gh` do usuário. Então (1) o PR sai em nome do usuário, e o
GitHub não deixa o autor aprovar o próprio PR: quem é dono do projeto e quer ser o analista não consegue dar
Approve; (2) o agente tem o mesmo token do usuário, logo um Approve dessa conta pode ter sido dado pelo agente e
não prova nada (por isso o plugin ignora review da conta do agente).

**Os três modos** (campo `identidade_agente.modo` da ficha, por projeto):

| Modo | O que é | Ficha guarda |
|---|---|---|
| `nenhuma` (padrão) | o agente usa o `gh` local, como antes | nada |
| `token` | conta-robô (ou outra conta) com token pronto numa variável de ambiente | `token_env` (nome da variável; padrão `AGENTIC_OS_GH_TOKEN`) |
| `app` | GitHub App; o plugin gera o token de instalação (1 h) a partir do ID e da chave privada, sem dependências | `app_id` e `chave_privada_env` (nome da variável com o **caminho** da `.pem`; padrão `AGENTIC_OS_APP_KEY_PATH`) |

O segredo **nunca** vai para a ficha nem para o git: a ficha guarda só nomes de variáveis e o `app_id`. O token
fica só em memória do processo; não aparece em saída, log, arquivo de estado nem em `.git/config` (o push usa a
credencial só naquele comando). `detect` e `apply` rodam com a conta do usuário (exigem admin, feitos uma vez);
`card-start`, `card-pr`, `review-*`, `card-hom` e `card-sign` usam a identidade do agente quando configurada.

**Passo a passo — GitHub App (recomendado em org):**
1. Criar o App na conta ou na org (Settings → Developer settings → GitHub Apps), com as permissões mínimas abaixo.
2. Instalar o App no repositório.
3. Baixar a chave privada (`.pem`) e guardá-la **fora do repo**.
4. Pôr o caminho da `.pem` numa variável de ambiente (padrão `AGENTIC_OS_APP_KEY_PATH`) e informar o `app_id` e o
   nome da variável ao wizard (etapa 12). O login do agente passa a ser `<slug>[bot]`.

**Passo a passo — conta-robô:**
1. Criar uma conta GitHub só para o agente e convidá-la no repositório.
2. Gerar um *fine-grained token* restrito ao repo e pô-lo numa variável de ambiente (padrão `AGENTIC_OS_GH_TOKEN`;
   outro nome vai em `token_env`). Nunca cole o token no chat.

**Permissões mínimas:** Contents, Pull requests, Issues e Deployments (leitura e escrita), Metadata (leitura) e
Projects (leitura e escrita).

**Trava `IDENTIDADE_IGUAL_ANALISTA`.** Em `card-hom` e `card-sign`, se o login do agente estiver em `analistas` e
a aprovação pelo chat estiver desligada, o comando para. Saídas: configurar `identidade_agente` (`token` ou
`app`) ou ligar `aprovacao_pelo_chat`.

**Aviso `GH_LOCAL_E_ANALISTA`.** Com identidade separada, mas o `gh` da máquina logado com uma conta de
`analistas`, o agente conseguiria aprovar usando esse login. `detect` avisa e a assinatura **não bloqueia**: sai
com `Tipo: review no GitHub ⚠️ gh local = analista`. Para prova forte de verdade, deixe o `gh` da máquina só com a
conta do agente (ou use o modo `app`).

**Aprovação pelo chat (opt-in, prova fraca).** Com `aprovacao_pelo_chat: true` na ficha:
`card-sign <ID> --pelo-chat --resultado aprovado|reprovado --frase "<texto do usuário>"`.
- Mesmas pré-condições da review (HOM do cartão, PR aberto, HEAD = commit publicado) e mesmos efeitos (assinatura
  no PR e cartão em "Aprovado", ou motivo no TASK e cartão em "Em andamento"; comentário na issue; HOM liberado).
- Se já existe review válida de analista no GitHub para o commit publicado, vale a review: erro `JA_HA_REVIEW`
  (rode `card-sign <ID>` sem `--pelo-chat`).
- O registro diz `Tipo: chat, sem prova do GitHub`, `Declarado por: analista da ficha (não autenticado)` e a frase
  literal. **O que isso não prova:** que quem escreveu a frase é mesmo o analista; é o registro de uma declaração.
- Guardrail 13: o agente só usa `--pelo-chat` quando o usuário escreveu, por iniciativa própria, que aprova ou
  reprova o cartão; nunca pergunta "posso aprovar?" para colher um sim.

**Erros novos**

| Código | Como resolver |
|---|---|
| IDENTIDADE_IGUAL_ANALISTA | Configurar `identidade_agente` (`token`/`app`) ou ligar `aprovacao_pelo_chat` |
| TOKEN_AUSENTE | Definir a variável do `token_env` (ambiente ou `.env` fora do git) |
| APP_CHAVE_INVALIDA | Conferir a variável com o caminho da `.pem` e a chave baixada do App |
| APP_NAO_INSTALADO | Instalar o App no repo (Settings da org → GitHub Apps) |
| CHAT_DESLIGADO | Ligar `aprovacao_pelo_chat` na ficha ou usar a review no GitHub |
| JA_HA_REVIEW | Rodar `card-sign <ID>` sem `--pelo-chat` |

**Limites conhecidos**
- A identidade do agente foi testada com um GitHub simulado (testes automáticos); ainda não foi verificada
  contra o GitHub real.
- Um token fine-grained ou o token de instalação de um GitHub App pode não conseguir escrever em um Project de
  **conta pessoal**. Nos modos `token` e `app`, o recomendado é usar Project de **organização**.
- Com o `gh` local logado como analista, a assinatura é registrada com o tipo ⚠️ (`gh local = analista`).
- No modo `app`, o JWT de vida curta (cerca de 10 minutos) aparece na linha de comando do `gh` enquanto o token de
  instalação é obtido; fica visível a outros processos do mesmo usuário do sistema operacional.

## Atualizando de 1.10

Ficha antiga (sem `identidade_agente` e `aprovacao_pelo_chat`) é tratada como `modo: nenhuma` e chat desligado:
nada muda até você configurar a identidade (wizard, etapa 12). Reinstalar com `install-governanca` preserva a ficha.
Os arquivos de governança do projeto (procedimento do `/cartao` e guardrail 13) são atualizados pela reinstalação.

## Requisitos

- `gh` **2.48 ou mais novo** (o `/cartao assinatura` usa `--slurp`), instalado e logado com permissão `project`
  (`gh auth refresh -s project`).
- Analista com **conta GitHub própria** (o GitHub não deixa quem abriu o PR aprová-lo) e acesso de escrita
  ao repo (o wizard convida).
- **Custo / plano do GitHub:** em repositório **privado no plano gratuito**, a trava da `main` (PR + aprovação
  do analista) e a aprovação do ambiente `prd` **não funcionam** — o GitHub bloqueia ambos (confirmado em teste
  real). Opções: tornar o repositório público, assinar plano pago (Pro/Team), ou seguir com **proteção parcial**
  (sem trava na `main`; a disciplina fica só nas regras do agente), registrada na ficha em `protecao_aplicada`.

## Travas (não há opção para desligar)

O script nunca faz push ou merge na branch principal, nunca aprova PR, nunca apaga nada e só **endurece**
a proteção (se a regra atual for mais forte, mantém a atual).

## CODEOWNERS

O instalador acrescenta no fim de `.github/CODEOWNERS` o bloco `* @analista`. No CODEOWNERS vale a
**última** regra que casa: por isso o analista revisa todo arquivo. Regras específicas existentes
continuam acima, mas para arquivos cobertos por `*` o analista passa a ser o dono.

## Comandos do script

`node .agentic-os/bin/github-setup.mjs <detect|apply|card-start|card-pr|card-hom|card-sign> [--dry-run]` — saída JSON;
erro conhecido sai com código 2 e `erro.codigo` + `erro.como_resolver` (e `erro.extra`, quando houver, como
os campos do `HOM_FALHOU`).

HOM e assinatura:
- `card-hom <ID> [--furar-fila --motivo "..."] [--migracao-autorizada] [--confirmo-comando] [--publicado-manual] [--dry-run]`
  — as quatro flags de autorização só com o "sim" do usuário.
- `card-sign <ID>` — lê a review do analista e registra.
- `card-sign <ID> --pelo-chat --resultado aprovado|reprovado --frase "<texto do usuário>"` — registra a decisão declarada
  no chat (só com `aprovacao_pelo_chat: true`; prova fraca).

Supervisor:
- `review-check <ID>` — mede B1–B4 e lista os critérios G/E/C.
- `review-record <ID> --parecer <arquivo>` — junta o parecer, calcula a nota e comenta no cartão.
- `review-decide <ID> (--seguir | --nova-rodada) --motivo "texto"` — só com o "sim" do usuário.

| Código | Como resolver |
|---|---|
| GH_AUSENTE / GH_DESLOGADO | Instalar o `gh` / `gh auth login` |
| SEM_ESCOPO_PROJECT | `gh auth refresh -s project` |
| PLANO_SEM_PROTECAO | Tornar público / subir de plano / proteção parcial |
| ANALISTA_IGUAL_AGENTE | Usar outra conta para o analista |
| CARTAO_INEXISTENTE / CARTAO_FORA_DE_A_FAZER | Criar a issue no Project / mover para "A Fazer" |
| ARVORE_SUJA | Commitar ou `git stash`; artefatos de teste vão no `.gitignore` |
| SEM_CRITERIOS | Adicionar `## Critérios de aceite` ao `proposal.md` |
| PARECER_INVALIDO / AGUARDA_DECISAO | Rodar `/cartao revisar` de novo / o usuário decide |
| SEM_REVISAO / REVISAO_VENCIDA | Rodar `/cartao revisar <ID>` antes do `/cartao pr` |
| SEM_PR | Rodar `/cartao pr <ID>` |
| HOM_OCUPADO | Esperar a assinatura do outro cartão, ou furar a fila com o "sim" + motivo |
| MIGRACAO_NAO_AUTORIZADA / COMANDO_SUSPEITO_PRD | Mostrar o comando ao usuário e repetir com a flag, só com o "sim" |
| SEM_HOM | Rodar `/cartao hom <ID>` (também quando o HOM foi tomado, o PR fechou ou ganhou commit novo) |
| HOM_FALHOU | Ver a etapa e o log em `.agentic-os/hom/<ID>.log`, corrigir e repetir |
| ASSINATURA_DE_OUTRO_COMMIT | Pedir ao analista a aprovação do commit atual no PR |
| IDENTIDADE_IGUAL_ANALISTA / TOKEN_AUSENTE / APP_CHAVE_INVALIDA / APP_NAO_INSTALADO / CHAT_DESLIGADO / JA_HA_REVIEW | Ver a seção "Identidade do agente" |
| BRANCH_EXISTE | `git switch <branch>` para retomar |
| REDE | Repetir (seguro) |
