# Governança GitHub (camada F)

> Analogia: uma esteira de fábrica com portas trancadas. Cada pedido (cartão) anda numa esteira própria
> (branch). Para entrar no estoque oficial (`main`), a porta só abre com o crachá do analista
> (aprovação no GitHub) — e se alguém mexer na peça depois do crachá, a porta tranca de novo.

## O que faz (Partes 0 e 1)

1. **Wizard** (`/agentic-os`): pergunta tudo em etapas e configura o projeto.
2. **Ficha** `.agentic-os/governanca.json`: repo, Project, colunas, analista(s), ambientes. Sem segredo.
3. **`/cartao <ID>`**: cartão (issue no Project, coluna "A Fazer") → plano aprovado →
   branch `feature/{ID}-{desc}` (ou `fix/`) → `docs/tasks/TASK-{ID}-{desc}.md` → cartão em "Em andamento".
4. **`/cartao pr <ID>`**: push da branch, PR para a `main` citando `#ID`, comentário no cartão.
5. **`main` protegida**: PR obrigatório, 1 aprovação do analista (CODEOWNERS), aprovação descartada em
   commit novo, aprovação do último push, vale para admins, sem force-push nem exclusão.
6. **Environments** `hom` e `prd` (o `prd` exige aprovação do analista).

Próximas partes: Supervisor (nota 0–10), HOM + assinatura, publicação PRD.

## Requisitos

- `gh` instalado e logado com permissão `project` (`gh auth refresh -s project`).
- Analista com **conta GitHub própria** (o GitHub não deixa quem abriu o PR aprová-lo) e acesso de escrita
  ao repo (o wizard convida).
- **Custo:** em repo privado, proteção de branch e revisores de ambiente podem exigir plano pago do GitHub.
  O wizard testa e, se o plano não permitir, oferece: tornar público, subir de plano ou proteção parcial
  (registrada na ficha em `protecao_aplicada`).

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

| Código | Como resolver |
|---|---|
| GH_AUSENTE / GH_DESLOGADO | Instalar o `gh` / `gh auth login` |
| SEM_ESCOPO_PROJECT | `gh auth refresh -s project` |
| PLANO_SEM_PROTECAO | Tornar público / subir de plano / proteção parcial |
| ANALISTA_IGUAL_AGENTE | Usar outra conta para o analista |
| CARTAO_INEXISTENTE / CARTAO_FORA_DE_A_FAZER | Criar a issue no Project / mover para "A Fazer" |
| ARVORE_SUJA | Commitar ou `git stash` |
| BRANCH_EXISTE | `git switch <branch>` para retomar |
| REDE | Repetir (seguro) |
