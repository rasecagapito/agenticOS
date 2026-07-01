# Registro de Provedores

> Fonte única sobre COMO cada IA lê o cérebro. Um engano sobre um provedor fica isolado aqui,
> sem partir o desenho. O cérebro canônico é `AGENTS.md`; os ponteiros importam-no.

| Provedor | Arquivo de entrada | Import suportado | Slash commands | Notas / limitações |
|----------|--------------------|--------------------|----------------|--------------------|
| **Claude** (Claude Code) | `CLAUDE.md` → `@AGENTS.md` | `@arquivo` | ✅ nativos (`.claude/commands/`) | Ponteiro fino; workflow via slash. |
| **Codex** (OpenAI Codex CLI) | `AGENTS.md` (canônico) | lê nativo | ❌ | Sem slash: pedir em NL, IA segue `automation/procedures/`. |
| **Gemini** (Gemini CLI) | `GEMINI.md` → import de `AGENTS.md` | `@arquivo` | ❌ | Ponteiro fino; workflow via `procedures/`. |
| **GLM / DeepSeek / Kimi** | via harness | conforme harness | conforme harness | Se via base-url no Claude Code → herdam `CLAUDE.md`. Se via harness OpenAI-compat (aider/opencode) → tipicamente `AGENTS.md`. |

## Como adicionar um provedor novo
1. Descobrir qual arquivo de bootstrap ele lê.
2. Se **suporta import** → criar ponteiro fino que importa `AGENTS.md` (ex.: `NOVO.md` com `@AGENTS.md`).
3. Se **não suporta import** e lê um arquivo fixo → apontar esse arquivo para o canônico e instruir a seguir `automation/procedures/`.
4. Registrar aqui a linha do provedor (entrada, import, limitações).

## Regra de ouro
Nunca duplicar o conteúdo do cérebro num arquivo de provedor. Ponteiro sempre. Duplicação = drift = "delírio".
