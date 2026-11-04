# Governança GitHub (camada F)

> Analogia: uma esteira de fábrica com portas trancadas. Cada pedido (cartão) anda numa esteira própria
> (branch). Para entrar no estoque oficial (`main`), a porta só abre com o crachá do analista
> (aprovação no GitHub) — e se alguém mexer na peça depois do crachá, a porta tranca de novo.

## O que faz (Partes 0, 1 e 2)

1. **Wizard** (`/agentic-os`): pergunta tudo em etapas e configura o projeto.
2. **Ficha** `.agentic-os/governanca.json`: repo, Project, colunas, analista(s), ambientes. Sem segredo.
3. **`/cartao <ID>`**: cartão (issue no Project, coluna "A Fazer") → plano aprovado →
   branch `feature/{ID}-{desc}` (ou `fix/`) → `docs/tasks/TASK-{ID}-{desc}.md` → cartão em "Em andamento".
4. **`/cartao pr <ID>`**: push da branch, PR para a `main` citando `#ID`, comentário no cartão.
5. **`main` protegida**: PR obrigatório, 1 aprovação do analista (CODEOWNERS), aprovação descartada em
   commit novo, aprovação do último push, vale para admins, sem force-push nem exclusão.
6. **Environments** `hom` e `prd` (o `prd` exige aprovação do analista).

7. **`/cartao revisar <ID>`**: Supervisor (nota 0–10) — veja a seção abaixo.

Próximas partes: HOM + assinatura, publicação PRD.

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
quem tem acesso ao disco pode editá-lo. A trava real do merge continua sendo a aprovação do analista no GitHub.

**Custo:** cada revisão chama o Opus, mesmo com o roteador Jev (até 3 por rodada).

**Divergência do Prompt Mestre:** o Prompt Mestre previa a nota dada pelo próprio agente; aqui a nota é
calculada pelo script a partir de provas, e a 3ª nota baixa vai para o usuário em vez de seguir automático.

## Requisitos

- `gh` instalado e logado com permissão `project` (`gh auth refresh -s project`).
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

`node .agentic-os/bin/github-setup.mjs <detect|apply|card-start|card-pr> [--dry-run]` — saída JSON;
erro conhecido sai com código 2 e `erro.codigo` + `erro.como_resolver`.

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
| BRANCH_EXISTE | `git switch <branch>` para retomar |
| REDE | Repetir (seguro) |
