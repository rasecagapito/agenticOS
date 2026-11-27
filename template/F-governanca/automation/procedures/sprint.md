# Procedimento: /sprint (Controle de Sprints — Ágil · Scrum Master)

O controle das sprints é lido direto dos campos do **GitHub Project** pelo Ágil · Scrum Master. O que não está nos campos não é contado.

## Campos obrigatórios do Project
1. **`Funcionalidade`** *(SingleSelect — entrega de negócio)*: se a opção não existir, usar `"A definir"` e listar as novas opções sugeridas.
2. **`Camada`** *(SingleSelect)*: `Infra Estrutura`, `Back-end`, `Banco de Dados`, `Front End` ou `Documentação`. Cartão que mexe em mais de uma camada deve ser quebrado em sub-issues (1 por camada).
3. **`Tamanho`** *(Number — esforço relativo, NÃO horas)*:
   - `1` trivial (texto/config) · `2` pequeno (algumas horas) · `3` médio (~1 dia) · `5` grande (alguns dias) · `8` muito grande/incerto (**não entra na sprint sem quebrar antes**).
   - Na dúvida entre dois tamanhos, escolher o maior.
   - No campo vai **só o número**; no corpo da issue vai `Estimativa: X pontos, porque ...`.
4. **`Iteração`** *(campo Iteration nativo — nunca em título, label ou comentário)*:
   - Sprints de 2 semanas (seg–sex), ~30 pontos por sprint.
   - Encaixe: (1) `Em andamento` e `Em validação` vão para a sprint atual; (2) depois `Backlog` por prioridade até ~30 pontos; (3) tamanho `8` não entra sem quebra prévia; (4) `Concluído` recebe **só** `Funcionalidade` e `Camada` (sem `Tamanho` nem `Iteração`).

## Fluxo obrigatório (`/sprint`)
1. Inspecionar: `node .agentic-os/bin/github-setup.mjs sprint-inspect`.
2. Montar arquivo JSON do plano e validar: `node .agentic-os/bin/github-setup.mjs sprint-plan --plano <arquivo.json>`.
3. **Antes de alterar qualquer campo**, mostrar a tabela gerada (`Cartão | Funcionalidade | Camada | Tamanho | Sprint | Motivo do tamanho`) + soma de pontos por sprint + sugestões de novas Funcionalidades (`A definir`).
4. **Só aplicar depois que o usuário responder `"ok"`:** `node .agentic-os/bin/github-setup.mjs sprint-apply --plano <arquivo.json> --confirmo-sprint`.

## Regras invioláveis
- Nunca calcular porcentagem nem fechar sprints (papel do Ágil · Scrum Master).
- Travou? Comentar na issue começando com `BLOQUEIO: <motivo>`.
- Cresceu além do estimado? Atualizar `Tamanho` no Project e comentar o porquê na issue.
- Nunca fechar issues por automação sem atualizar o status no Project. Nunca exibir tokens ou senhas.
