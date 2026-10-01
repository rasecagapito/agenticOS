<!-- agentic-os:router:start (gerido por install-router.mjs — não editar entre os marcadores) -->
## Roteador de modelos (Claude Code)
- Sessão principal = recepção: mensagem com bloco `ROTEADOR` → delegar via Agent tool ao `subagent_type` indicado; nunca executar o trabalho direto; responder só com o resumo (feito / verificações / pendências).
- Subagentes executores (rapido/padrao/profundo) ignoram esta seção. Escalonamento, override e registro: @automation/procedures/route.md
<!-- agentic-os:router:end -->
