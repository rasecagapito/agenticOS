# Procedimento: PROPOSE (criar mudança estruturada)

> Provider-neutro. No Claude: `/propose <nome>`. Noutras IAs: "faz o propose <nome>".
> Ver `docs/CHANGE-WORKFLOW.md` para o ciclo completo.

Cria uma mudança em `changes/<nome>/`.

## Execução
1. **Nome** em kebab-case. Se o argumento é descrição, derivar nome curto. Escopo ambíguo → 1 pergunta antes de criar.
2. **Ponte de brainstorming**: procurar em `docs/superpowers/specs/` uma spec recente do tema (`*-<tema>-design.md`).
   - Existe → extrair Porquê/Escopo/Abordagem e critérios; `proposal.md` referencia a spec com link (não duplicar).
   - Não existe → gerar artefatos do zero a partir do nome/descrição.
3. **Criar** `changes/<nome>/` com:
   - `proposal.md` — `# Mudança: <nome>` + `## Porquê` + `## Escopo` (entra / NÃO entra) + `## Abordagem`.
   - `tasks.md` — `# Tarefas: <nome>` + checklist `- [ ] 1. …`.
   - `design.md` — **só se** técnica/não-trivial (arquitetura, migrations, risco).
3b. **Projeto modular** (se `context/` tem subpastas): detectar módulo; se o nome não começa por módulo existente, perguntar "Que módulo? [<subpastas>/novo]"; prefixar `changes/<modulo>-<feature>/`; incluir `## Módulo: <nome>` no proposal.
4. **Reorganização** (`propose reorganize-<alvo>`): scan read-only; `tasks.md` lista CADA movimento (`MOVER`/`AGRUPAR`/`MARCAR`); aplicar Regras de Segurança de `docs/CHANGE-WORKFLOW.md`.
5. **Marcar como ativa no handoff**: atualizar `memory/handoff.md` → Mudança ativa = `changes/<nome>/` (seguir `procedures/handoff.md`).
6. **Confirmar**: "Mudança '<nome>' criada. Artefatos: [lista]. Executar o worker para implementar."

## Sem argumento
Listar mudanças ativas em `changes/` (excluindo `archive/`), 1 linha cada.
