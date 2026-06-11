# Change Workflow — Agentic OS

> Camada de mudança estruturada acima do fluxo worker/wrapup.
> Inspirado em [OpenSpec](https://github.com/Fission-AI/OpenSpec), adaptado à filosofia leve do Agentic OS.

## Conceito

Cada feature, correção ou reorganização é uma **mudança**: uma pasta em `changes/<nome>/`
com os artefatos que capturam *porquê*, *como* e *passos* antes de mexer no código.
A mudança é executada por um worker e, ao fechar, alimenta a memória e atualiza o
conhecimento (`context/`) via deltas confirmados pelo humano.

Princípios herdados: **fluido, não rígido** — dependências entre artefatos são
facilitadores, não portões. Qualquer artefato pode ser atualizado a qualquer momento.

## Estrutura de pastas

```
changes/
├── <nome-da-mudanca>/
│   ├── proposal.md      # porquê + escopo + abordagem
│   ├── design.md        # decisões técnicas (só se não-trivial)
│   └── tasks.md         # checklist de implementação
└── archive/
    └── YYYY-MM-DD-<nome>/   # mudanças fechadas
```

## Ciclo

```
(explorar)        superpowers:brainstorming   → spec exploratória opcional
   ↓
/propose <nome>   cria changes/<nome>/ (proposal + tasks; design se preciso)
   ↓
/worker [nome]    executa dentro da mudança ativa (lê tasks.md, marca [x])
   ↓
/wrapup           arquiva a mudança + history/learnings
                  + sugere deltas em context/ (humano confirma item a item)
                  + atualiza CLAUDE.md "Estado do Projeto"
```

Mapeamento com OpenSpec `core` (`propose·explore·apply·sync·archive`):
explore→brainstorming · propose→/propose · apply→/worker · sync+archive→/wrapup.

## Artefatos

**proposal.md**
```markdown
# Mudança: <nome>
## Porquê
[1-3 frases]
## Escopo
- [entra]
- [NÃO entra]
## Abordagem
[1 parágrafo, alto nível]
```

**tasks.md**
```markdown
# Tarefas: <nome>
- [ ] 1. [tarefa]
- [ ] 2. [tarefa]
```

**design.md** (opcional)
```markdown
# Design técnico: <nome>
## Decisões
| Decisão | Motivo | Alternativas |
|---------|--------|--------------|
## Riscos
- [risco]
```

## Ponte: brainstorming → artefatos

Se já existe uma spec de `superpowers:brainstorming` em
`docs/superpowers/specs/<topic>-design.md`, `/propose` lê-a e pré-preenche os artefatos
(referencia com link, não duplica). Se não existe, gera do zero a partir do nome/descrição.

## Delta semi-automático (no /wrapup)

Ao fechar uma mudança, `/wrapup` analisa o que mudou e **sugere** updates em `context/`,
sem aplicar sozinho. Notação: `+` ADICIONAR · `~` MODIFICAR · `-` REMOVER.

Exemplo (`add-dark-mode`):
```
Mudança "add-dark-mode" concluída. Sugiro atualizar context/:
  + context/produto.md     ADICIONAR à tabela de features: | Dark Mode | DONE | P2 |
  ~ context/arquitetura.md MODIFICAR diagrama: adicionar [Theme Provider]
  + context/stack.md       ADICIONAR nota: preferência em localStorage
Confirmar? [1 s/n] [2 s/n] [3 s/n]
```
Aprovados → editados em context/. Pasta → changes/archive/. Registo em memory/.

## Reorganização de projetos existentes (brownfield)

Reorganizar é uma mudança: `/propose reorganize-<alvo>`.

1. **Scan read-only** — mapeia pastas, docs soltos, duplicados, redundâncias. Nada é tocado.
2. **Plano** — proposal.md + tasks.md listando CADA movimento como uma linha:
   ```
   - [ ] MOVER  docs/old-api.md → docs/archive/old-api.md  (substituído por api-v2.md)
   - [ ] AGRUPAR notas-*.md (3) → docs/notas/             (dispersos na raiz)
   - [ ] MARCAR config.bak.json → redundante (idêntico a config.json)
   ```
3. **Aprovação humana** — todo o plano ou item a item.
4. **Execução segura** (`/worker`) — só itens aprovados.

### Regras de segurança (invioláveis)
- **Nunca deletar.** Redundantes vão para `_quarantine/` (ou `docs/archive/`), nunca apagados.
- **Nunca mover código sem verificar referências.** Procurar imports/links antes; atualizar todos ou não mover.
- **Verificar git primeiro.** Se for repo git, exigir working tree limpo — movimentos reversíveis.
- **Registar movimentos** em `changes/reorganize-<alvo>/MOVES.md` (mapa origem→destino) p/ rollback.
- **Dry-run por defeito.** Só `/worker` após aprovação move.
- **Em dúvida → parar e perguntar.**

### Redundância — critérios (sugestão; humano decide)
- Conteúdo idêntico (hash) a outro ficheiro
- Backup óbvio (`.bak`, `~`, `-copy`, `-old`, datado e superseded)
- Doc coberto integralmente por outro mais recente

Nunca marcar automaticamente: ficheiros referenciados por código, configs ativas,
ou qualquer coisa fora de `docs/`/notas sem análise de referências.
