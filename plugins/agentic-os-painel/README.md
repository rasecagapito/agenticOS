# agentic-os-painel

Painel opcional do Agentic OS, fixo ao lado do chat do Claude Code (VS Code, app Desktop ou terminal
com ≥ 110–144 colunas).

```
┌─ Agentic OS ───────────────────────┐
│ Economia nesta sessão              │
│ US$ 4.50 economizados (75%)        │
│ Gasto real: US$ 1.50               │
│ Se tudo fosse Opus: US$ 6.00       │
│ Jev: ≈US$ 0.0001 · 3 subagente(s)  │
│                                    │
│ Decisões de hoje (14)              │
│ rapido    ████████ 8               │
│ padrao    ████ 4                   │
│ profundo  ██ 2                     │
│ Última: jev 0.98 → padrao (Sonnet) │
│                                    │
│ [/status] [/wrapup] [/handoff]     │
└────────────────────────────────────┘
```

## Instalar

```bash
claude plugin marketplace add rasecagapito/agenticOS     # se ainda não tiver o marketplace
claude plugin install agentic-os-painel@agentic-os
```

Reinicie o Claude Code. O painel abre sozinho; para reabrir, digite `/painel`.
Requer um Claude Code com suporte a mods (hooks de função, 2.1.3xx ou mais novo).

## O que mostra

- **Economia nesta sessão**: cada subagente informa ao terminar os tokens e o modelo que usou. O painel
  multiplica pelo preço do modelo (gasto real) e pelo preço do Opus 5.5 ("se tudo fosse Opus"). A diferença,
  menos o custo estimado do Jev, é a economia.
- **Decisões de hoje**: quantos pedidos foram para cada subagente, lidas de `.claude/router/decisions.jsonl`
  (o registro do roteador). Avisos internos do Claude Code não contam.
- **Botões**: rodam `/status`, `/wrapup` e `/handoff` como se você tivesse digitado. Usam o comando próprio do
  projeto se existir; senão, a skill do plugin (`/agentic-os:agentic-os /status`). `/handoff` só aparece em
  projetos multi-provedor.

Sem o roteador instalado, o painel mostra só os botões.

## Limitações

- **Estimativa, não fatura**: preços de tabela em `hooks/register.tsx` (`PRICES`), atualizar quando mudarem.
  O custo da recepção (Haiku) não entra.
- A economia zera a cada sessão; as decisões do dia vêm do registro do roteador.
- Se o painel falhar, o subagente segue normal (o hook tem `.catch`).

## Desenvolver

```bash
claude plugin validate plugins/agentic-os-painel
claude plugin test plugins/agentic-os-painel
```
