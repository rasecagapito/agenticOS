# Wizard de configuração do Agentic OS

Roteiro obrigatório para configurar (ou reconfigurar) um projeto. Substitui a "Fase de descoberta".

## Regras

- **Uma pergunta por tela.** 2–4 opções; a recomendada primeiro, com "(recomendado)". Toda tela aceita
  **Voltar**; etapas opcionais aceitam **Pular**.
- **Claude Code:** use `AskUserQuestion` (1 pergunta por chamada). **Codex/Gemini/outros:** lista numerada
  no texto; aceite o número como resposta.
- **Detectar antes de perguntar.** Se a detecção for certa, só peça confirmação ("Encontrei X. Correto?").
- **Nada é criado antes da etapa 14.** Exceções: (1) `.agentic-os/wizard-estado.json` (respostas até agora,
  sem segredo — nunca grave a chave do Jev nem token), gravado a cada etapa; ao iniciar, se ele existir,
  ofereça "Retomar de onde parou"; (2) `git init` (etapa 7), `gh repo create` (etapa 8) e `gh project create`
  (etapa 9), que as etapas seguintes precisam que existam: mostre o comando e pergunte "Executar agora?" antes.
- **Idempotente.** Projeto já configurado: mostre o que está igual e pergunte só o que falta/mudou.
- **Toda ação no GitHub é mostrada com o comando** antes de rodar.
- Fale como para um leigo: analogia curta antes do termo técnico.
- `<plugin>` = pasta do plugin Agentic OS (onde está este arquivo, dois níveis acima).

## Etapas

| # | Etapa | Faça |
|---|---|---|
| 1 | Início | Pasta vazia → Modo B; com código → Modo A. Pergunte só se ambíguo. |
| 2 | Avisos de custo | Mostre já, antes de configurar: (a) Roteador sem chave do Jev → **todos os pedidos vão para o Opus**; (b) Governança em repo **privado no plano gratuito** do GitHub: a trava da `main` (PR + aprovação do analista) e a aprovação do ambiente `prd` **não funcionam** — o GitHub bloqueia ambos. Saídas: tornar o repo público, assinar plano pago, ou seguir com proteção parcial (sem trava na `main`; a disciplina fica só nas regras do agente); (c) Governança: o **Supervisor** usa o Opus em cada revisão de cartão (até 3 por rodada), mesmo com o roteador Jev. Pergunte "Entendi, seguir?". |
| 3 | Projeto | Tipo (SaaS / n8n / conteúdo / consultoria / outro), stack (detecte por `package.json`, `requirements.txt`, `pom.xml`… e confirme), usuários, objetivo do agente. Uma pergunta por tela. |
| 4 | Camadas | Múltipla escolha: Roteador de Modelos · Multi-provedor · Governança GitHub. Marque "(já tem)" nas instaladas. |
| 5 | Roteador | Só se escolhido. Pergunta e aviso da seção "Roteador de Modelos" do SKILL.md (chave agora / `fallback_sem_chave` Sonnet / sem roteador). |
| 6 | Multi-provedor | Só se escolhido. Quais IAs (múltipla); humano como orquestrador final (Orquestração) sim/não. |
| 7 | Git | Rode `node <plugin>/scripts/github-setup.mjs detect`. Aviso `NAO_E_GIT` → ofereça `git init`. Confirme a branch principal. |
| 8 | Repo GitHub | `repo` do detect → confirme. Aviso `SEM_REMOTO` → opções: criar privado (`gh repo create <dono>/<nome> --private --source . --push`) / colar nome existente. |
| 9 | Project | Liste `projects` do detect (título + URL). Opções: escolher um / criar novo (`gh project create --owner <dono> --title "<nome>"`) / colar URL. Depois rode `detect --project <N>`. |
| 10 | Colunas | Compare `status_project.opcoes` com: Backlog, A Fazer, Em andamento, Em validação, Aprovado, Concluído, Bloqueado. Mostre as faltantes; pergunte se cria (feito no `apply`). |
| 11 | Analista | Pergunte o(s) login(s) GitHub de quem assina. Rode `detect --project <N> --analista <login>`. `ANALISTA_IGUAL_AGENTE` → explique que precisa de outra conta e pergunte de novo. `ANALISTA_INEXISTENTE` → pergunte de novo. `colaborador:false` → avise que será convidado. |
| 12 | Ambientes | Nomes HOM/PRD (padrão `hom`/`prd`); mostre os que já existem; grave em `ambientes`. Depois, **comando de testes**: detecte (`package.json` com `scripts.test` real → `npm test` — o padrão do `npm init`, `echo "Error: no test specified" && exit 1`, conta como sem testes; `pyproject.toml`/`pytest.ini` → `pytest`; `Makefile` com alvo `test` → `make test`; `pom.xml` → `mvn test`) e confirme; grave em `comando_testes`. Sem testes → avise que o Supervisor não dá 10 sem testes e grave `null`. |
| 13 | Proteção | Monte a ficha **completa** (repo, `project.owner/number/url/id`, 7 `colunas`, ≥1 analista, `ambientes`, `comando_testes`, `prefixos_branch`, `branch_principal`) em `.agentic-os/wizard-estado.json` e rode `node <plugin>/scripts/github-setup.mjs apply --ficha .agentic-os/wizard-estado.json --dry-run`. Mostre `mudancas` ("antes → depois"). Erro `PLANO_SEM_PROTECAO` → 3 opções: tornar público / subir de plano / seguir com proteção parcial (grava `aceitar_protecao_parcial: true` e roda o `--dry-run` de novo). |
| 14 | Resumo | Liste tudo que será criado/alterado: arquivos do Agentic OS, camadas, ações do `apply --dry-run`. Pergunte "Criar?". |
| 15 | Execução | Sem perguntas: crie a estrutura (Modo A/B), instale camadas escolhidas (`install-router.mjs`; `install-governanca.mjs <projeto> --ficha-json .agentic-os/wizard-estado.json`), rode `node .agentic-os/bin/github-setup.mjs apply`, depois o loop de conformidade A/B até PASS (máx. 3 ciclos). |
| 16 | Fim | Relatório: o que foi feito, links (repo, Project), avisos (ex.: proteção parcial), próximo passo: `/cartao <ID>` → trabalho → `/cartao revisar <ID>` → `/cartao pr <ID>`. Os arquivos de governança criados devem entrar na principal por PR (`chore/agentic-os-governanca`) — a proteção já está ativa. Apague `.agentic-os/wizard-estado.json` (o instalador já o pôs no `.gitignore`). Proteção parcial → diga claramente que a `main` **não** está travada. |

Etapas 5–13 só aparecem se a camada correspondente foi escolhida na etapa 4 (7–13 = Governança).

## Erros do script

Toda saída `ok:false` traz `erro.codigo` e `erro.como_resolver`: mostre os dois, ofereça "Tentar de novo"
ou "Pular a Governança" e não avance sem resposta. Nunca contorne uma trava.
