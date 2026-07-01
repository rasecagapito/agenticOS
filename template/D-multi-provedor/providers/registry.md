# Registo de Provedores

> Fonte única sobre COMO cada IA lê o cérebro. Um engano sobre um provedor fica isolado aqui,
> sem partir o desenho. O cérebro canónico é `AGENTS.md`; os ponteiros importam-no.

| Provedor | Ficheiro de entrada | Import suportado | Slash commands | Notas / limitações |
|----------|--------------------|--------------------|----------------|--------------------|
| **Claude** (Claude Code) | `CLAUDE.md` → `@AGENTS.md` | `@ficheiro` | ✅ nativos (`.claude/commands/`) | Ponteiro fino; workflow via slash. |
| **Codex** (OpenAI Codex CLI) | `AGENTS.md` (canónico) | lê nativo | ❌ | Sem slash: pedir em NL, IA segue `automation/procedures/`. |
| **Gemini** (Gemini CLI) | `GEMINI.md` → import de `AGENTS.md` | `@ficheiro` | ❌ | Ponteiro fino; workflow via `procedures/`. |
| **GLM / DeepSeek / Kimi** | via harness | conforme harness | conforme harness | Se via base-url no Claude Code → herdam `CLAUDE.md`. Se via harness OpenAI-compat (aider/opencode) → tipicamente `AGENTS.md`. |

## Como adicionar um provedor novo
1. Descobrir qual ficheiro de bootstrap ele lê.
2. Se **suporta import** → criar ponteiro fino que importa `AGENTS.md` (ex.: `NOVO.md` com `@AGENTS.md`).
3. Se **não suporta import** e lê um ficheiro fixo → apontar esse ficheiro para o canónico e instruir a seguir `automation/procedures/`.
4. Registar aqui a linha do provedor (entrada, import, limitações).

## Regra de ouro
Nunca duplicar o conteúdo do cérebro num ficheiro de provedor. Ponteiro sempre. Duplicação = drift = "delírio".
