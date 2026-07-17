Executa o procedimento de conformidade em `automation/procedures/conform.md`.

**Uso**: `/conform`  (sem argumento = só auditar/dry-run; com aprovação = loop A/B até PASS)

Loop de conformidade: A audita (read-only) → gate humano → B aplica exato → A re-audita, até bater
`docs/CONFORMANCE-SPEC.md` (máx. 3 ciclos). No Claude Code, A e B são subagentes reais (Task/Agent).
(Fonte única da lógica; noutras IAs, um só agente faz role-switch A→B→A lendo o procedimento.)
