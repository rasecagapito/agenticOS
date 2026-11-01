/** Um subagente que terminou: o consumo é somado do registro dele (`path`) ao desenhar o painel. */
export type Run = {
  id: string
  agent: string
  path: string
}

/** Consumo da sessão como o /cost o soma (US$) e o uso do contexto (%), atualizado pelo session.measure. */
export type Consumo = { usd: number | null; ctx: number | null }

declare module 'claude-code' {
  interface PluginState {
    'agentic-os-painel': { runs: Shaped<Run[]>; consumo: Shaped<Consumo> }
  }
}
