Executa o procedimento provider-neutro em `automation/procedures/conform.md`.

**Uso**: `/conform`  (sem argumento = só auditar/dry-run; com aprovação = loop A/B até PASS)

Loop de conformidade: A audita (read-only) → gate humano → B aplica exato → A re-audita, até bater
`docs/CONFORMANCE-SPEC.md` (máx. 3 ciclos). No Claude Code, A e B são subagentes reais.
(Fonte única da lógica partilhada com Codex/Gemini/etc.)
