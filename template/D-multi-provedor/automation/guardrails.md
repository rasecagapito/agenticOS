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
- **Handoff incremental**: gravar ao fechar cada tarefa (com commit sha), não só no wrapup (sobrevive a sessão morta).
- **Cursor derivado**: a próxima tarefa lê-se de `tasks.md`, nunca duplicada no handoff.
- **Estado dinâmico único**: sessão/cursor/próximo passo vivem só em `memory/handoff.md`. O cérebro guarda apenas estado estático (fase).
- **Antes de trocar de IA**: garantir handoff atualizado; se uma tarefa ficou a meio, registrar em "Gotchas".
- **Credenciais**: sempre via variáveis de ambiente, nunca em `context/`, `memory/` ou nos arquivos cérebro.

## Regras de Orquestração (quando a secção existe no handoff)
- **Humano é o orquestrador final**: o `Limite aprovado` só avança com aprovação humana registrada no handoff.
- **Executor cumpre lotes (3–5 tarefas)**: nunca avança além do `Limite aprovado`; gotcha → parar e registrar, nunca contornar.
- **`/propose` e `/wrapup` exclusivos da coordenação**; executores só executam tarefas aprovadas.
- **Revisão barata**: a coordenação revê lotes via `git diff <âncora>..HEAD` — a âncora é a fonte, não a memória.

## Escalação
Em dúvida: **parar, documentar a dúvida no handoff, perguntar**.
Melhor pergunta desnecessária do que ação irreversível ou drift entre IAs.
