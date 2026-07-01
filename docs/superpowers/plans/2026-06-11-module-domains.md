# Module / Domains Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Adicionar suporte opcional a módulos/domínios ao plugin Agentic OS — `context/<modulo>/`, mudanças prefixadas `<modulo>-<feature>` com campo `## Módulo:`, e deltas que miram a pasta do módulo — sem quebrar o modo flat.

**Architecture:** Plugin markdown. Padrão modular é opt-in detectado por presença de subpastas em `context/`. Atualiza doc fonte-única, skill e os comandos propose/wrapup dos 3 templates.

**Tech Stack:** Markdown, slash commands, PowerShell (verificação).

**Spec:** `docs/superpowers/specs/2026-06-11-module-domains-design.md`

**Nota commits:** Repo É git agora. Cada task termina com commit + push (GCM funciona). Se push falhar, continuar e reportar.

---

## File Structure

**Modificados:**
- `docs/CHANGE-WORKFLOW.md` — nova seção "Módulos / Domínios"
- `skills/agentic-os/SKILL.md` — MODO B (estrutura modular), MODO A (detecção), /propose, ciclo
- `template/{A-generico,B-saas-n8n,C-claude-integrado}/.claude/commands/propose.md` — detecção + prefixo + campo Módulo
- `template/{A,B,C}/.claude/commands/wrapup.md` — delta mira context/<modulo>/

---

## Task 1: Documentar Módulos em `docs/CHANGE-WORKFLOW.md`

**Files:**
- Modify: `docs/CHANGE-WORKFLOW.md`

- [ ] **Step 1: Acrescentar seção "Módulos / Domínios"**

Ler `docs/CHANGE-WORKFLOW.md`. Inserir a seção abaixo IMEDIATAMENTE ANTES da seção
`## Reorganização de projetos existentes (brownfield)`:

```markdown
## Módulos / Domínios (opcional)

Projetos com vários módulos de código (auth, billing, pagamentos…) podem organizar o
conhecimento por **domínio**, em vez de arquivos soltos. É **opt-in** — projetos pequenos
continuam flat.

### Estrutura modular

\`\`\`
context/
├── _global.md           # stack + convenções compartilhadas
├── auth/
│   ├── produto.md        # o que o módulo faz
│   └── arquitetura.md    # como funciona
└── billing/
    └── produto.md

changes/
├── auth-add-2fa/         # nome prefixado pelo módulo
│   ├── proposal.md       # contém "## Módulo: auth"
│   └── tasks.md
└── billing-add-invoices/
\`\`\`

### Regras

| Peça | Regra |
|------|-------|
| `context/<modulo>/` | 1 subpasta por módulo; `_global.md` para o compartilhado |
| `changes/<modulo>-<feature>/` | nome prefixado; `proposal.md` declara `## Módulo: <nome>` |
| Delta no `/wrapup` | mira `context/<modulo>/` do módulo declarado |
| `workers/` | globais — carregam só `_global.md` + `context/<modulo>/` da tarefa |
| `CLAUDE.md` | lista módulos (`@context/auth/`); carrega só o ativo → poupa tokens |

### Detecção flat vs modular

- `context/` tem subpastas → **modular**: comandos aplicam as regras acima.
- `context/` só tem `.md` soltos → **flat**: comportamento normal, inalterado.

### Exemplo: `/propose add-2fa` (projeto modular)

\`\`\`
/propose add-2fa
→ detecta modular (existem context/auth/, context/billing/)
→ pergunta: "Que módulo? [auth/billing/novo]"   (resposta: auth)
→ cria changes/auth-add-2fa/ com proposal contendo "## Módulo: auth"
\`\`\`
No /wrapup, o delta sugere updates só em context/auth/.
```

- [ ] **Step 2: Verificar**

Run: `powershell -command "Select-String -Path 'docs/CHANGE-WORKFLOW.md' -Pattern 'Módulos / Domínios' -Quiet"`
Expected: `True`.

- [ ] **Step 3: Commit**

```bash
git add docs/CHANGE-WORKFLOW.md
git commit -m "docs: document module/domain pattern in change workflow"
git push origin main
```

---

## Task 2: Atualizar `skills/agentic-os/SKILL.md`

**Files:**
- Modify: `skills/agentic-os/SKILL.md`

- [ ] **Step 1: MODO B — mostrar opção modular na estrutura**

Em `skills/agentic-os/SKILL.md`, na seção "MODO B", logo após a árvore de estrutura ASCII
(a seguir ao bloco que termina em `projects/`), inserir:

```markdown
**Variante modular (projetos com vários módulos de código):** `context/` pode usar subpastas
por módulo em vez de arquivos soltos:

\`\`\`
context/
├── _global.md           # stack + convenções compartilhadas
├── auth/                # 1 pasta por módulo
│   ├── produto.md
│   └── arquitetura.md
└── billing/
    └── produto.md
\`\`\`

Neste caso, as mudanças são prefixadas (`changes/<modulo>-<feature>/`) e cada `proposal.md`
declara `## Módulo: <nome>`. Ver `docs/CHANGE-WORKFLOW.md` seção "Módulos / Domínios".
É opt-in — projetos pequenos mantêm `context/` flat.
```

- [ ] **Step 2: MODO A — detectar módulos existentes**

Na seção "MODO A", no "Passo 1: Explorar estrutura", acrescentar ao fim da lista de coisas
a procurar:

```markdown
- Módulos de código separados (ex: `src/auth/`, `src/billing/`) — se existirem, considerar
  organização modular do `context/` (uma subpasta por módulo). Ver `docs/CHANGE-WORKFLOW.md`.
```

- [ ] **Step 3: `/propose` — instruções de módulo na zona de Slash Commands**

Na seção "Slash Commands", dentro do bloco `### /.claude/commands/propose.md`, acrescentar
um ponto após o passo de criação da pasta:

```markdown
- **Projeto modular**: se `context/` tem subpastas, detectar projeto modular. Se o nome da
  mudança não começa por um módulo conhecido, perguntar qual módulo. Prefixar o nome
  (`<modulo>-<feature>`) e incluir `## Módulo: <nome>` no `proposal.md`.
```

- [ ] **Step 4: Ciclo de Operação — nota de módulo**

Na seção "Ciclo de Operação", logo após o bloco numerado do ciclo, acrescentar:

```markdown
Em projetos modulares, as mudanças são prefixadas pelo módulo (`auth-add-2fa`) e o delta do
`/wrapup` mira `context/<modulo>/`. Ver `docs/CHANGE-WORKFLOW.md`.
```

- [ ] **Step 5: Verificar**

Run: `powershell -command "$f='skills/agentic-os/SKILL.md'; @('Variante modular','Módulo: <nome>','Projeto modular') | %{ \"$_ => \" + (Select-String -Path $f -Pattern $_ -Quiet) }"`
Expected: cada padrão `True`.

- [ ] **Step 6: Commit**

```bash
git add skills/agentic-os/SKILL.md
git commit -m "feat: skill supports modular context organization"
git push origin main
```

---

## Task 3: Atualizar `propose.md` nos 3 templates — detecção de módulo

**Files:**
- Modify: `template/A-generico/.claude/commands/propose.md`
- Modify: `template/B-saas-n8n/.claude/commands/propose.md`
- Modify: `template/C-claude-integrado/.claude/commands/propose.md`

O bloco inserido é o **mesmo** nos três. Inserir como novo passo logo APÓS o passo
"3. Criar a pasta `changes/<nome>/` e os artefatos" (antes do passo de reorganização).

- [ ] **Step 1: Definir o bloco**

```markdown
3b. **Projeto modular** (se `context/` tem subpastas, ex: `context/auth/`):
   - Detectar que o projeto é modular.
   - Se o nome da mudança não começa por um módulo existente, perguntar:
     "Que módulo? [<lista das subpastas de context/>/novo]".
   - Prefixar o nome da pasta: `changes/<modulo>-<feature>/`.
   - Incluir no `proposal.md` a linha `## Módulo: <nome>` (após o título).
   Projeto flat (sem subpastas) → ignorar este passo.
```

- [ ] **Step 2: Inserir nos 3 arquivos**

Ler cada arquivo e inserir o bloco (texto idêntico) na posição indicada com a Edit tool.

- [ ] **Step 3: Verificar**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | %{ Select-String -Path \"template/$_/.claude/commands/propose.md\" -Pattern 'Projeto modular' -Quiet }"`
Expected: `True` três vezes.

- [ ] **Step 4: Commit**

```bash
git add template/*/.claude/commands/propose.md
git commit -m "feat: /propose detects modular project and prefixes module"
git push origin main
```

---

## Task 4: Atualizar `wrapup.md` nos 3 templates — delta por módulo

**Files:**
- Modify: `template/A-generico/.claude/commands/wrapup.md`
- Modify: `template/B-saas-n8n/.claude/commands/wrapup.md`
- Modify: `template/C-claude-integrado/.claude/commands/wrapup.md`

No passo "Fechar mudança ativa" (criado na implementação anterior), refinar o sub-ponto do
delta para considerar módulo. O texto a acrescentar é o **mesmo** nos três.

- [ ] **Step 1: Definir a linha a acrescentar**

Dentro do passo "Fechar mudança ativa", logo após a linha que descreve "Sugerenciar deltas em
`context/`", acrescentar:

```markdown
     - Se a mudança declara `## Módulo: <nome>` (projeto modular), mirar as sugestões de
       delta em `context/<modulo>/` (e `context/_global.md` se afetar o compartilhado).
```

- [ ] **Step 2: Inserir nos 3 arquivos**

Ler cada `wrapup.md`, localizar o passo "Fechar mudança ativa" e o sub-ponto de delta,
inserir a linha com a Edit tool (indentação consistente com as linhas vizinhas).

- [ ] **Step 3: Verificar**

Run: `powershell -command "@('A-generico','B-saas-n8n','C-claude-integrado') | %{ Select-String -Path \"template/$_/.claude/commands/wrapup.md\" -Pattern 'context/<modulo>/' -Quiet }"`
Expected: `True` três vezes.

- [ ] **Step 4: Commit**

```bash
git add template/*/.claude/commands/wrapup.md
git commit -m "feat: wrapup targets module context dir for deltas"
git push origin main
```

---

## Task 5: Bump de versão + verificação final

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Subir versão para 1.1.0**

Em `.claude-plugin/plugin.json` e `.claude-plugin/marketplace.json`, mudar `"version": "1.0.0"`
para `"version": "1.1.0"` (no marketplace.json, o campo version dentro do objeto do plugin).

- [ ] **Step 2: Verificação integrada**

Run:
```
powershell -command "$ok=$true; @('docs/CHANGE-WORKFLOW.md|Módulos / Domínios','skills/agentic-os/SKILL.md|Variante modular') | %{ $p=$_.Split('|'); if(!(Select-String -Path $p[0] -Pattern $p[1] -Quiet)){$ok=$false; Write-Output \"FALTA: $_\"} }; @('A-generico','B-saas-n8n','C-claude-integrado') | %{ if(!(Select-String -Path \"template/$_/.claude/commands/propose.md\" -Pattern 'Projeto modular' -Quiet)){$ok=$false; Write-Output \"FALTA propose: $_\"}; if(!(Select-String -Path \"template/$_/.claude/commands/wrapup.md\" -Pattern 'context/<modulo>/' -Quiet)){$ok=$false; Write-Output \"FALTA wrapup: $_\"} }; if($ok){Write-Output 'MODULOS OK'}"
```
Expected: `MODULOS OK`.

- [ ] **Step 3: Commit + tag + push**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "chore: bump to v1.1.0 — module/domain support"
git tag v1.1.0
git push origin main
git push origin v1.1.0
```

---

## Self-Review (preenchido)

**Spec coverage:**
- Estrutura modular + regras → Tasks 1, 2
- Detecção flat vs modular → Tasks 1, 2, 3
- `/propose` detecta + prefixa + campo Módulo → Task 3
- Delta mira context/<modulo>/ → Task 4
- Flat inalterado → garantido por "opt-in" em todos os blocos (detecção por subpastas)
- MODO A detecta módulos → Task 2 Step 2
- Critérios 1-6 → Tasks 1-4 + verificação Task 5

**Placeholder scan:** sem TODO/TBD; conteúdo completo mostrado.

**Naming consistency:** `context/<modulo>/`, `_global.md`, `changes/<modulo>-<feature>/`,
`## Módulo: <nome>` — consistentes em spec, doc e comandos.
