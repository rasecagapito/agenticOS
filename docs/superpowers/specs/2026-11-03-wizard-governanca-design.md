# Wizard de configuração + Governança GitHub (Partes 0 e 1) — Design

- **Data:** 2026-11-03
- **Status:** aprovado em brainstorming, aguardando revisão do spec
- **Fonte:** "PROMPT MESTRE — CONTROLE DE GITHUB, BRANCHES, HOMOLOGAÇÃO E PRODUÇÃO v2.0" (colado pelo usuário) + pedido de wizard
- **Release alvo:** v1.9.0 (camada F opt-in)

## 1. Contexto e escopo

O Prompt Mestre descreve uma esteira completa: cartão no GitHub Project → branch por cartão →
execução com Supervisor → homologação (HOM) com assinatura autenticada do analista → merge protegido
na `main` → publicação em produção (PRD) com migrações e rollback → documentação da tarefa.

É grande demais para uma entrega. Foi decomposto em 5 partes, cada uma com spec → plano → implementação:

| # | Parte | Este spec? |
|---|---|---|
| 0 | Wizard de configuração do plugin | **Sim** |
| 1 | Fundação GitHub (Project, cartão, branch, PR, proteção, `docs/tasks/`) | **Sim** |
| 2 | Supervisor (nota 0–10, máx. 2 ciclos de correção) | Não — spec próprio |
| 3 | HOM + assinatura do analista | Não — spec próprio |
| 4 | Publicação PRD (merge, migrações, deploy, rollback) | Não — spec próprio |

As partes 2–4 entram depois como **etapas novas do wizard** e **campos novos da ficha**, sem refazer 0–1.

### Decisões tomadas no brainstorming

1. Entregar em partes, começando pela Fundação, com o wizard como moldura (Parte 0).
2. **Fonte da verdade dos cartões = GitHub Project.** `changes/<ID>-...` é o caderno técnico do cartão.
3. **Assinatura = dois carimbos nativos do GitHub** (definidos aqui, aplicados nas Partes 3–4):
   aprovação obrigatória do PR pelo analista (com descarte de aprovação quando há commit novo) e
   aprovação do Environment `prd`. O analista precisa de conta GitHub diferente da usada pelo agente.
4. **Arquitetura = skill conduz, script executa.** Mesmo padrão do `install-router.mjs`.

## 2. Arquitetura

### No plugin (repo `agenticOS`)

| Peça | Arquivo | Papel |
|---|---|---|
| Wizard | `skills/agentic-os/wizard.md` (novo) | Roteiro das etapas. `SKILL.md` apenas aponta para ele. |
| Script GitHub | `scripts/github-setup.mjs` (novo) | Subcomandos `detect`, `apply`, `card-start`, `card-pr`; todos aceitam `--dry-run`. Saída JSON para a skill ler. |
| Molde da camada | `template/F-governanca/` (novo) | Arquivos copiados para o projeto. |
| Documentação | `docs/GOVERNANCA.md` (novo) + seção no `docs/guia-completo.html` | Explicação para leigo. |
| Testes | `tests/github-setup.test.mjs` (novo) | `gh` falso via PATH com respostas gravadas. |

### No projeto (instalado pela camada F)

| Peça | Arquivo |
|---|---|
| Ficha | `.agentic-os/governanca.json` |
| Estado do wizard | `.agentic-os/wizard-estado.json` (retomada; pode ser apagado ao terminar) |
| Procedimento | `automation/procedures/cartao.md` (provider-neutro) |
| Comando | `.claude/commands/cartao.md` (wrapper fino, ≤ 6 linhas) |
| Registro | `docs/tasks/TASK-{ID}-{descricao}.md` |
| Guardrails | Bloco novo em `automation/guardrails.md` com as 10 proibições do Prompt Mestre |

### Ficha `.agentic-os/governanca.json`

```json
{
  "versao": 1,
  "repo": "dono/nome",
  "branch_principal": "main",
  "project": { "url": "https://github.com/users/dono/projects/3", "id": "PVT_...", "campo_status_id": "PVTSSF_..." },
  "colunas": {
    "backlog": "Backlog", "a_fazer": "A Fazer", "em_andamento": "Em andamento",
    "em_validacao": "Em validação", "aprovado": "Aprovado", "concluido": "Concluído", "bloqueado": "Bloqueado"
  },
  "colunas_ids": { "a_fazer": "…", "em_andamento": "…" },
  "analistas": ["login-do-analista"],
  "ambientes": { "hom": "hom", "prd": "prd" },
  "prefixos_branch": { "feature": "feature/", "fix": "fix/" },
  "protecao_aplicada": { "em": "2026-11-03T12:00:00Z", "nivel": "completa | parcial | nenhuma", "motivo": "…" }
}
```

Nunca contém token, senha ou chave. O script usa a autenticação do próprio `gh`.

### Ligação com o que já existe

- `/propose` pergunta o número do cartão quando a camada F está instalada → `changes/<ID>-<desc>/`,
  com `## Cartão: #<ID>` no `proposal.md`.
- `/status` mostra cartão ativo, branch e PR quando a ficha existe.
- O loop de conformidade A/B ganha os itens da camada F na `CONFORMANCE-SPEC.md` (F1–F6, ver §6).

## 3. Wizard (Parte 0)

### Regras gerais

- **Uma pergunta por tela**, 2–4 opções, recomendada primeiro com "(recomendado)"; **Voltar** sempre;
  **Pular** nas etapas opcionais.
- **Nada é criado antes da etapa 14.** Até lá o wizard só lê e pergunta.
- Detecta antes de perguntar; quando detecta com certeza, só pede confirmação.
- Respostas gravadas em `.agentic-os/wizard-estado.json` a cada etapa → retomada após queda.
  Exceção: esse arquivo é a única escrita antes da etapa 14 e não contém segredo.
- **Idempotente:** rodar de novo num projeto configurado mostra o que está igual e pergunta só o que mudou
  ou falta. Também serve para adicionar uma camada depois.
- Toda ação no GitHub é exibida com o comando que vai rodar.
- **Por provedor:** Claude Code usa `AskUserQuestion` (caixas clicáveis); Codex/Gemini/outros usam lista
  numerada no texto e aceitam o número como resposta.

### Etapas

| # | Etapa | Pergunta | Detecção prévia |
|---|---|---|---|
| 1 | Início | Projeto novo ou existente? | Pasta vazia vs. com código (Modo A/B). Pergunta só se ambíguo. |
| 2 | Avisos de custo | Mostra os custos possíveis já no começo; "Entendi, seguir?" | Chave do Jev; plano GitHub (se governança for provável). |
| 3 | Projeto | Tipo, stack, usuários, objetivo | Stack de `package.json`, `requirements.txt`, etc. |
| 4 | Camadas | Múltipla escolha: Roteador, Multi-provedor, Governança GitHub | Camadas já instaladas aparecem como "já tem". |
| 5 | Roteador | Chave agora / fallback Sonnet / sem roteador | Gancho global existente. |
| 6 | Multi-provedor | Quais IAs; humano como orquestrador? | Cérebro canônico existente. |
| 7 | Git | Confirma repo e branch principal | `git rev-parse`. Sem git → oferecer `git init`. |
| 8 | Repo GitHub | Confirma `dono/repo` | `origin`. Sem remoto → criar privado / colar nome. |
| 9 | Project | Escolher da lista / criar novo / colar URL | `gh project list --owner <dono>`. |
| 10 | Colunas | Criar as que faltam? | Compara opções do campo Status com §2. |
| 11 | Analista | Login(s) GitHub de quem assina | Login == conta do agente → bloqueia e explica. Login inexistente → pede de novo. |
| 12 | Ambientes | Nomes HOM/PRD (padrão `hom`/`prd`) | Environments existentes no repo. |
| 13 | Proteção | Mostra "antes → depois" da `main`; aplicar? | Regras atuais + plano. Plano não permite → 3 saídas (§5). |
| 14 | Resumo | Lista tudo a criar/alterar; "Criar?" | `github-setup.mjs apply --dry-run`. |
| 15 | Execução | Sem perguntas: arquivos + `apply` + loop A/B | Re-auditoria até PASS (máx. 3 ciclos). |
| 16 | Fim | Relatório, links (Project, repo), próximo passo `/cartao <ID>` | — |

Etapas 5–13 só aparecem se a camada correspondente foi escolhida na etapa 4.

## 4. Script `scripts/github-setup.mjs` (Parte 1)

Node ≥ 18, sem dependências. Chama `gh` (CLI e `gh api graphql`). Entrada por argumentos; saída JSON
em stdout (`{ ok, acoes: [...], avisos: [...], erro?: { codigo, mensagem, como_resolver } }`).

| Subcomando | Faz | Escreve? |
|---|---|---|
| `detect [--owner X]` | Git, remoto, branch principal, Projects, campo Status e opções, Environments, regras da branch principal, plano/visibilidade, login do agente | Não |
| `apply --ficha <arq>` | Cria colunas faltantes, Environments `hom`/`prd` (com revisor obrigatório no `prd` quando o plano permitir), proteção da branch principal | Sim (com `--dry-run`: não) |
| `card-start <ID> [--tipo feature\|fix] [--desc slug]` | Valida cartão em "A Fazer", árvore limpa; cria branch a partir da principal atualizada; move cartão para "Em andamento"; cria `docs/tasks/TASK-<ID>-<desc>.md` | Sim |
| `card-pr <ID>` | Push da branch do cartão; abre PR para a principal com `Cartão #<ID>` e link do cartão no corpo; liga PR ao item do Project; grava link no TASK | Sim |

### Proteção aplicada pelo `apply` (nível completo)

- PR obrigatório para a branch principal; 1 aprovação obrigatória; **descartar aprovações em commit novo**;
  exigir aprovação do último push; revisores = analistas (via `CODEOWNERS` gerado em `.github/CODEOWNERS`).
- Bloquear push direto e force-push; bloquear exclusão da branch.
- `enforce_admins` ligado (nem o dono burla sem desligar à mão).
- Environment `prd` com revisores obrigatórios = analistas.

### Travas fixas (sem flag para desligar)

1. Nunca faz push para a branch principal nem merge.
2. Nunca aprova PR, nunca chama endpoint de review com `APPROVE`.
3. `apply` só **endurece**: se a regra atual for mais forte que a planejada, mantém a atual; nunca remove
   proteção, revisor ou Environment.
4. `card-start` exige cartão existente e em "A Fazer"; exige árvore limpa.
5. Branch já existente → não sobrescreve; devolve `erro.codigo = BRANCH_EXISTE` para a skill perguntar
   (retomar ou parar).
6. Nunca grava token/segredo; nunca imprime token.

## 5. Erros

| Código | Situação | Como resolver (texto devolvido) |
|---|---|---|
| `GH_AUSENTE` | `gh` não instalado | Link de instalação |
| `GH_DESLOGADO` | `gh auth status` falha | `gh auth login` |
| `SEM_ESCOPO_PROJECT` | token sem `project` | `gh auth refresh -s project` |
| `PLANO_SEM_PROTECAO` | API recusa regra/Environment por plano | 3 saídas: tornar público / subir de plano / seguir com proteção parcial (risco escrito na ficha `protecao_aplicada`) |
| `ANALISTA_IGUAL_AGENTE` | login do analista == conta do `gh` | Usar outra conta para o analista |
| `CARTAO_INEXISTENTE` / `CARTAO_FORA_DE_A_FAZER` | — | Criar/mover o cartão no Project |
| `ARVORE_SUJA` | `git status` não limpo | Commitar ou guardar alterações |
| `BRANCH_EXISTE` | — | Retomar na branch ou parar |
| `REDE` | falha de API/rede | Repetir (operações idempotentes; checa estado antes de criar) |

O `apply` verifica o estado antes de cada criação, então repetir após falha parcial completa o que faltou.

## 6. Conformidade (itens novos na CONFORMANCE-SPEC)

| Item | Regra |
|---|---|
| F1 | `.agentic-os/governanca.json` existe, é JSON válido, sem chaves com nome de segredo |
| F2 | `automation/procedures/cartao.md` existe |
| F3 | `.claude/commands/cartao.md` é wrapper ≤ 6 linhas |
| F4 | `automation/guardrails.md` contém o bloco de governança |
| F5 | `docs/tasks/` existe |
| F6 | `.github/CODEOWNERS` lista os analistas da ficha |

Só auditados quando a ficha existe (camada opt-in).

## 7. Testes

1. **Automáticos (CI)** — `tests/github-setup.test.mjs` com `node:test`. Um `gh` falso (script no PATH
   do teste) devolve respostas gravadas e registra as chamadas. Cobre: `detect` em repo com e sem
   remoto/Project; `--dry-run` não chama endpoints de escrita; cada trava de §4 (tentativa de push na
   principal, afrouxar proteção, aprovar PR); cada código de erro de §5; idempotência do `apply`.
   HOME/USERPROFILE isolados como nos testes do roteador.
2. **Real antes da release** — repo privado de teste `agenticos-sandbox-governanca` + Project de teste na
   conta do usuário: wizard completo + um cartão de ponta a ponta (branch, TASK, PR ligado, merge
   bloqueado pela proteção). Apagar o repo de teste só com confirmação do usuário.
3. Gate de release com parada no primeiro erro antes do push (lição da v1.8.5).

## 8. Fora do escopo deste spec

Supervisor (Parte 2); deploy HOM, migrações, instruções ao analista e registro da assinatura (Parte 3);
merge, publicação PRD e rollback (Parte 4); movimentação automática para "Em validação", "Aprovado" e
"Concluído" (Partes 3–4). Na Parte 1 o cartão termina em "Em andamento" com PR aberto e bloqueado.

## 9. Release

v1.9.0: versão do agentic-os nos 3 manifestos; RELEASE-NOTES; `docs/GOVERNANCA.md`; guia HTML.
Projetos que não escolherem Governança no wizard não percebem mudança além do novo formato de perguntas.
