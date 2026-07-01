# Guardrails — Multi-Provedor

## Ações de Alto Impacto (Confirmação Obrigatória)
- Deletar ou mover arquivos
- Alterar o arquivo cérebro canônico (`AGENTS.md`) em estrutura (não só "Estado do Projeto")
- Aplicar deltas em `context/` sem confirmação item a item
- Qualquer ação irreversível em produção

## Ações Automáticas Permitidas
- Ler qualquer arquivo do projeto
- Escrever em `memory/**`, `changes/**`, `projects/**`
- Marcar tarefas `[x]` em `tasks.md`
- Atualizar `memory/handoff.md` (incremental)

## Regras Multi-Provedor (invioláveis)
- **Fonte única**: só `AGENTS.md` (ou o cérebro detectado) orquestra. `CLAUDE.md`/`GEMINI.md` são ponteiros `@import` — nunca colar conteúdo neles.
- **Carimbo de provedor**: toda a gravação de handoff registra qual IA a fez + hora real.
- **Handoff incremental**: gravar ao fechar cada tarefa, não só no wrapup (sobrevive a sessão morta).
- **Cursor derivado**: a próxima tarefa lê-se de `tasks.md`, nunca duplicada no handoff.
- **Antes de trocar de IA**: garantir handoff atualizado; se uma tarefa ficou a meio, registrar em "Gotchas".
- **Credenciais**: sempre via variáveis de ambiente, nunca em `context/`, `memory/` ou nos arquivos cérebro.

## Escalação
Em dúvida: **parar, documentar a dúvida no handoff, perguntar**.
Melhor pergunta desnecessária do que ação irreversível ou drift entre IAs.
