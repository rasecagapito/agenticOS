# Conformance Loop — Agente A / Agente B (auto-correção)

> Modelo de execução **interno do skill** para construir/adaptar um projeto até ficar
> **exatamente** no padrão de [`CONFORMANCE-SPEC.md`](CONFORMANCE-SPEC.md).
> Não confundir com o comando `/loop` de um projeto (runner por objetivo). Este loop constrói o OS.

## Papéis

- **Agente A — Auditor (read-only).** Detecta o modo (NOVO/EXISTENTE), compara o estado atual com
  `CONFORMANCE-SPEC.md`, classifica cada item `CONFORME | FALTA | DRIFT`, marca as correções
  **estritamente necessárias**, e emite um *instruction set* preciso para B. Nunca escreve nada.
- **Agente B — Executor.** Aplica **exatamente** o instruction set aprovado. Nada além disso
  (sem scope creep). Reporta o que fez.

## Ciclo

```
A audita (vs SPEC)
   → emite instruction set + pede AUTORIZAÇÃO ao humano
      → [gate humano: aprova tudo ou item-a-item]
         → B executa só o aprovado
            → A re-audita
               → PASS? sim → SUCESSO, sai do loop
               → PASS? não → A re-instrui B com o delta preciso → repete
```

- **Guarda de iterações:** máx. **3** ciclos B. Se ao 3º não houver PASS → **parar e escalar ao humano**
  com o relatório de divergências. Nunca loop infinito.
- **Gate humano é obrigatório** antes do 1º B e sempre que B for tocar em algo coberto pelos guardrails
  (mover/apagar/renomear, alterar código, APIs pagas).

## Critério de sucesso

`resultado == PASS` na re-auditoria de A, segundo `CONFORMANCE-SPEC.md`:
- **NOVO:** 100% base (+ multi-provedor se opt-in), zero D1–D5, estrutura limpa do zero.
- **EXISTENTE:** itens necessários aplicados, **zero** arquivos pré-existentes movidos/apagados sem
  aprovação, integridade intacta, poder do plugin presente.

## Portabilidade (híbrido)

- **Claude Code:** A e B são **subagentes reais** via Task/Agent.
  - A → subagente read-only (tipo `Explore`): audita e devolve o schema de saída da SPEC.
  - B → subagente executor (`general-purpose`): recebe o instruction set aprovado e aplica.
  - Isolamento real → a verificação de A é genuinamente independente do trabalho de B.
- **Codex / Gemini / outras IAs:** **um só agente faz role-switch** A→B→A por fases, seguindo
  `automation/procedures/conform.md`. Mesmos gates, mesmo critério de sucesso, mesma guarda de 3 ciclos.

## Anti-drift dentro do loop

- B só aplica o **aprovado**; se A pediu X, B faz X — não "melhora" por conta própria.
- A re-auditoria compara contra a SPEC, **não** contra a memória do que B disse ter feito
  (verifica o resultado real no disco).
- Em projeto EXISTENTE, remover um `DRIFT` (ex.: `commands/` na raiz) exige mudança aprovada
  (`/propose`), nunca deleção silenciosa.
