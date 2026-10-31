import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Run } from '../types'

const PANE = 'agentic-os-painel'
const TITLE = 'Agentic OS'
const LOG = '.claude/router/decisions.jsonl'
const CONFIG = '.claude/router/config.json'

// Muda o tag quando os campos de Run mudarem: valores de versões antigas são descartados.
const runs = atom({ plugin: 'agentic-os-painel', key: 'runs' } as const, [] as Run[], { shape: 'runs-1' })

// Preços US$ por milhão de tokens (fonte: tabela oficial Anthropic, 2026-10). Escrita de cache = 1,25× entrada.
// Edite aqui quando os preços mudarem. A ordem importa: o primeiro padrão que casar vale.
type Price = { input: number; output: number; cacheWrite: number; cacheRead: number }
// Referência "se tudo fosse Opus": Opus 5.5.
const OPUS: Price = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }
const PRICES: Array<[RegExp, Price]> = [
  [/haiku-4-5/, { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }],
  [/haiku/, { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 }],
  [/sonnet-4-6/, { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  [/sonnet/, { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }],
  [/opus-5-5/, OPUS],
  [/opus/, { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }],
  [/fable|mythos/, { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 }],
]
// Jev: ~1.500 tokens de entrada por decisão × US$0,042/Mtok (saída gratuita).
const JEV_POR_DECISAO = (1500 * 0.042) / 1e6

type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}
type AgentResultLike = { usage?: Usage; resolvedModel?: string; modelsUsed?: string[]; agentType?: string }

export function priceOf(model: string): Price {
  const m = model.toLowerCase()
  for (const [re, p] of PRICES) if (re.test(m)) return p
  return OPUS // modelo desconhecido: conta como Opus (nunca infla a economia)
}

export function cost(u: Usage, p: Price): number {
  return (
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1e6
  )
}

export const usd = (v: number) => `US$ ${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(2)}`

type Decisao = {
  ts?: string
  tipo?: string
  origem?: string
  subagente?: string | null
  modelo?: string | null
  nivel?: string | null
  escolha_jev?: string
  confianca?: number | null
  jev_ms?: number
}

// Mesmo texto da statusline do roteador.
export function segmento(e: Decisao | undefined): string {
  if (!e) return 'aguardando o primeiro pedido'
  const alvo = `${e.subagente} (${e.modelo})`
  if (e.tipo === 'escalonamento') return `escalou → ${alvo}`
  if (e.origem === 'override') return `manual → ${alvo}`
  if (e.origem === 'fallback') return `erro → ${alvo}`
  if (e.origem?.startsWith('regra:')) return `${e.origem} → ${alvo}`
  if (e.origem === 'continuacao') return `continua → ${alvo}`
  const conf = e.confianca == null ? '?' : e.confianca.toFixed(2)
  if (e.escolha_jev) return `jev ${conf} → ${alvo}`
  return `${e.nivel}, ${conf} → ${alvo}`
}

export function resumoLog(texto: string, hoje = new Date()) {
  const porAgente: Record<string, number> = {}
  let jevChamadas = 0
  let ultima: Decisao | undefined
  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue
    let e: Decisao
    try {
      e = JSON.parse(linha)
    } catch {
      continue
    }
    if ((e.tipo !== 'decisao' && e.tipo !== 'escalonamento') || !e.subagente || e.origem === 'envelope') continue
    ultima = e
    if (!e.ts || new Date(e.ts).toDateString() !== hoje.toDateString()) continue
    if (e.tipo === 'decisao') {
      porAgente[e.subagente] = (porAgente[e.subagente] ?? 0) + 1
      if ((e.jev_ms ?? 0) > 0) jevChamadas++
    }
  }
  return { porAgente, jevChamadas, ultima }
}

type Atalho = { rotulo: string; command: string; args?: string }

// Para cada ação: comando próprio do projeto (/status) se existir; senão a skill do plugin
// (/agentic-os:agentic-os /status). /handoff só em projeto multi-provedor (comando ou memory/handoff.md).
export function atalhos(nomes: string[], temHandoff: boolean): Atalho[] {
  const set = new Set(nomes)
  const skill = nomes.find(n => n === 'agentic-os:agentic-os') ?? nomes.find(n => /(^|:)agentic-os$/.test(n))
  const out: Atalho[] = []
  for (const acao of ['status', 'wrapup', 'handoff']) {
    if (acao === 'handoff' && !temHandoff && !set.has('handoff')) continue
    if (set.has(acao)) out.push({ rotulo: `/${acao}`, command: acao })
    else if (skill) out.push({ rotulo: `/${acao}`, command: skill, args: `/${acao}` })
  }
  return out
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'painel', description: 'Abrir o painel do Agentic OS (economia do Jev + atalhos)' })
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'painel' }, async $ => {
    const r = await $.ui.open({ id: PANE, title: TITLE, focus: true })
    return { text: r.isPlaced ? 'Painel do Agentic OS aberto.' : `Painel aguardando espaço: ${r.reason}` }
  })

  // Contabiliza cada subagente que termina: tokens reais × preço do modelo usado vs. preço do Opus.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const ran = await next(e)
    const r = (ran as { result?: AgentResultLike }).result
    const u = r?.usage
    if (u) {
      const model = r?.resolvedModel ?? r?.modelsUsed?.[0] ?? 'desconhecido'
      const run: Run = {
        id: e.tool_use_id,
        agent: r?.agentType ?? (e as { subagent_type?: string }).subagent_type ?? 'subagente',
        model,
        real: cost(u, priceOf(model)),
        opus: cost(u, OPUS),
      }
      await update($, runs, list => [...list, run].slice(-500))
    }
    return ran
  }).catch(($, e, next) => next(e)) // falha do painel nunca bloqueia o subagente

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const lista = await read($, runs)

    let log = ''
    try {
      log = await $.fs.read(LOG)
    } catch {
      /* roteador ainda sem registro */
    }
    const temRoteador = log !== '' || (await $.fs.exists(CONFIG).catch(() => false))
    const { porAgente, jevChamadas, ultima } = resumoLog(log)

    const real = lista.reduce((s, x) => s + x.real, 0)
    const opus = lista.reduce((s, x) => s + x.opus, 0)
    const jev = jevChamadas * JEV_POR_DECISAO
    const economia = opus - real - jev
    const pct = opus > 0 ? Math.round((economia / opus) * 100) : 0
    const total = Object.values(porAgente).reduce((s, n) => s + n, 0)

    const nomes = (await $.command.list().catch(() => [])).map(c => c.name)
    const temHandoff = await $.fs.exists('memory/handoff.md').catch(() => false)
    const botoes = atalhos(nomes, temHandoff)
    const rodar = (a: Atalho) => () => {
      $.command
        .run({ command: a.command, args: a.args })
        .catch((err: unknown) => $.ui.toast(`${a.rotulo}: ${String(err)}`))
    }

    return (
      <Box flexDirection="column">
        {!temRoteador && <Text dimColor>Roteador de modelos não instalado neste projeto.</Text>}
        {temRoteador && (
          <Box flexDirection="column">
            <Text bold>Economia nesta sessão</Text>
            {lista.length === 0 ? (
              <Text dimColor>Nenhum subagente concluído ainda.</Text>
            ) : (
              <Box flexDirection="column">
                <Text>
                  {usd(economia)} economizados ({pct}%)
                </Text>
                <Text dimColor>Gasto real: {usd(real)}</Text>
                <Text dimColor>Se tudo fosse Opus: {usd(opus)}</Text>
                <Text dimColor>
                  Jev: ≈{usd(jev)} · {lista.length} subagente(s)
                </Text>
              </Box>
            )}
            <Text> </Text>
            <Text bold>Decisões de hoje ({total})</Text>
            {['rapido', 'padrao', 'profundo'].map(a => (
              <Text>
                {a.padEnd(9)} {'█'.repeat(Math.min(12, porAgente[a] ?? 0))} {porAgente[a] ?? 0}
              </Text>
            ))}
            <Text dimColor>Última: {segmento(ultima)}</Text>
          </Box>
        )}
        <Text> </Text>
        {botoes.length === 0 ? (
          <Text dimColor>Comandos do Agentic OS não encontrados (instale o plugin agentic-os).</Text>
        ) : (
          <Box flexDirection="row" gap={1}>
            {botoes.map(a => (
              <Button key={a.rotulo.slice(1)} label={a.rotulo} onPress={rodar(a)} />
            ))}
          </Box>
        )}
        <Text dimColor>Estimativa: preços de tabela; custo da recepção (Haiku) não incluído.</Text>
      </Box>
    )
  })
}
