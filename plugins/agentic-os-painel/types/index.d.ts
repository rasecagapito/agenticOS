/** Uma execução de subagente contabilizada: tokens reais e custo real vs. custo se fosse Opus. */
export type Run = {
  id: string
  agent: string
  model: string
  real: number
  opus: number
}

/** Consumo da sessão como o /cost o soma (US$) e o uso do contexto (%), atualizado pelo session.measure. */
export type Consumo = { usd: number | null; ctx: number | null }

declare module 'claude-code' {
  interface PluginState {
    'agentic-os-painel': { runs: Shaped<Run[]>; consumo: Shaped<Consumo> }
  }
}
