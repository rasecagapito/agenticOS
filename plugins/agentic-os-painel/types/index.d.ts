/** Uma execução de subagente contabilizada: tokens reais e custo real vs. custo se fosse Opus. */
export type Run = {
  id: string
  agent: string
  model: string
  real: number
  opus: number
}

declare module 'claude-code' {
  interface PluginState {
    'agentic-os-painel': { runs: Shaped<Run[]> }
  }
}
