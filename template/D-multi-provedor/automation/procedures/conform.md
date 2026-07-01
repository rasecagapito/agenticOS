# Procedimento: CONFORM (loop de conformidade A/B)

> Provider-neutro. No Claude: `/conform`. Noutras IAs: "corre o conform" / "audita a conformidade".
> Leva o projeto ao padrão de `docs/CONFORMANCE-SPEC.md` via loop auto-corretivo.
> Spec do loop: `docs/CONFORMANCE-LOOP.md`.

Papéis: **A = Auditor (read-only)** · **B = Executor (aplica só o aprovado)**.
No Claude Code, A e B podem ser subagentes reais (Task/Agent). Noutras IAs, um só agente
faz role-switch A→B→A por fases.

## Execução

1. **Detectar modo**: pasta vazia/nova → **NOVO**; projeto com arquivos → **EXISTENTE**.
2. **A — Auditar** (read-only) contra `docs/CONFORMANCE-SPEC.md`:
   - Percorrer camadas base (B1–B6), multi-provedor (M1–M7 se opt-in), regras anti-drift (D1–D5).
   - Classificar cada item `CONFORME | FALTA | DRIFT`; marcar quais correções são **necessárias**.
   - Emitir o schema de saída do auditor (ver SPEC): `mode`, `resultado`, `divergencias[]`,
     `instrucoes_para_B[]`, `requires_user_approval`.
3. **Gate humano**: apresentar o instruction set; pedir aprovação (tudo ou item-a-item).
   EXISTENTE = default conservador; mover/apagar/renomear ou tocar em código exige aprovação explícita
   (guardrails). Nada avança sem aprovação.
4. **B — Executar** só o aprovado, **exatamente**. Sem scope creep. Em EXISTENTE, respeitar a Regra
   de Ouro: só criar/ponteirar; remover `DRIFT` só dentro de mudança aprovada (`/propose`).
5. **A — Re-auditar** o resultado real no disco (não a narrativa de B):
   - `PASS` → **SUCESSO**, terminar e reportar.
   - senão → re-instruir B com o delta preciso e repetir a partir do passo 4.
6. **Guarda de iterações**: máx. **3** ciclos B. Ao 3º sem PASS → parar e escalar ao humano com o
   relatório de divergências.
7. **Fechar**: atualizar `memory/handoff.md` (seguir `procedures/handoff.md`) e confirmar ao usuário
   o resultado (PASS/escalado) + o que mudou.

## Critério de sucesso
`resultado == PASS` na re-auditoria, por `docs/CONFORMANCE-SPEC.md`.
NOVO = 100% + zero D1–D5. EXISTENTE = necessário aplicado + zero arquivos movidos/apagados sem
aprovação + integridade intacta + poder do plugin presente.

## Sem argumento
Só auditar (passo 2) e mostrar o relatório, sem gate nem execução ("dry-run" de conformidade).
