import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Consumo, Run } from '../types'

const PANE = 'agentic-os-painel'
const TITLE = 'Agentic OS'
const LOG = '.claude/router/decisions.jsonl'
const CONFIG = '.claude/router/config.json'

// Muda o tag quando os campos de Run mudarem: valores de versões antigas são descartados.
const runs = atom({ plugin: 'agentic-os-painel', key: 'runs' } as const, [] as Run[], { shape: 'runs-3' })
const consumo = atom({ plugin: 'agentic-os-painel', key: 'consumo' } as const, { usd: null, ctx: null } as Consumo, {
  shape: 'consumo-1',
})

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

// Soma o consumo do registro (.jsonl) de um subagente. Cada resposta ocupa várias linhas com o mesmo
// `message.id` e o mesmo `usage` (uma por bloco): só a última conta, senão o gasto sai ~3× maior.
export function somaTranscript(texto: string): { real: number; opus: number } {
  const respostas = new Map<string, { model: string; usage: Usage }>()
  let n = 0
  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue
    try {
      const m = JSON.parse(linha)?.message
      if (m?.usage && m.model) respostas.set(m.id ?? `linha-${n++}`, { model: m.model, usage: m.usage })
    } catch {
      /* linha cortada: o registro pode estar sendo escrito */
    }
  }
  let real = 0
  let opus = 0
  for (const r of respostas.values()) {
    real += cost(r.usage, priceOf(r.model))
    opus += cost(r.usage, OPUS)
  }
  return { real, opus }
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

// Abre o painel só quando há uma tela conectada: no início da sessão o VS Code/Desktop pode ainda não
// ter se ligado (ui.open falharia com no-surface). Nesse caso, abre no session.attach.
async function abrirSeHouverTela($: EngineInterface) {
  const telas = await $.session.surfaces().catch(() => [])
  if (telas.length > 0) await $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'painel', description: 'Abrir o painel do Agentic OS (economia do Jev + atalhos)' })
    await abrirSeHouverTela($)
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    const r = await next(e)
    await $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    return r
  })

  on('command.run', { command: 'painel' }, async $ => {
    const r = await $.ui.open({ id: PANE, title: TITLE, focus: true })
    return { text: r.isPlaced ? 'Painel do Agentic OS aberto.' : `Painel aguardando espaço: ${r.reason}` }
  })

  // Guarda o registro de cada subagente que termina, em primeiro ou segundo plano. O resultado do Agent não
  // serve: em segundo plano volta `async_launched`, sem `usage`. A soma fica para o desenho: neste evento a
  // última resposta ainda não foi gravada por inteiro. Retomado, o subagente substitui a linha, não soma de novo.
  on('classic.SubagentStop', async ($, e, next) => {
    const r = await next(e)
    const run: Run = { id: e.agent_id, agent: e.agent_type, path: e.agent_transcript_path }
    await update($, runs, list => [...list.filter(x => x.id !== run.id), run].slice(-500))
    return r
  }).catch(($, e, next) => next(e)) // falha do painel nunca bloqueia o subagente

  // Consumo da sessão (o mesmo total do /cost) e uso do contexto, empurrados pelo engine a cada mudança.
  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    await update($, consumo, () => ({ usd: e.cost?.usd ?? null, ctx: e.context?.percent ?? null }))
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const lista = await read($, runs)
    let gasto = await read($, consumo)
    if (gasto.usd == null) {
      // Antes do primeiro session.measure: lê direto (mesmo número do /cost).
      const u = await $.session.usage().catch(() => null)
      gasto = { usd: u?.cost?.usd ?? null, ctx: u?.context?.percent ?? null }
    }

    let log = ''
    try {
      log = await $.fs.read(LOG)
    } catch {
      /* roteador ainda sem registro */
    }
    const temRoteador = log !== '' || (await $.fs.exists(CONFIG).catch(() => false))
    const { porAgente, jevChamadas, ultima } = resumoLog(log)

    let real = 0
    let opus = 0
    let semDados = 0
    for (const run of lista) {
      try {
        const t = somaTranscript(await $.fs.read(run.path))
        real += t.real
        opus += t.opus
      } catch {
        semDados++ // registro ausente ou acima do limite de leitura (4 MiB): fora da conta, sem valor inventado
      }
    }
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
        <Text bold>Consumo desta sessão</Text>
        <Text>{gasto.usd == null ? 'Custo ainda indisponível' : `${usd(gasto.usd)} gastos (igual ao /cost)`}</Text>
        {gasto.ctx != null && <Text dimColor>Contexto usado: {Math.round(gasto.ctx)}%</Text>}
        <Text> </Text>
        {!temRoteador && (
          <Text dimColor>Roteador de modelos não instalado: a economia por subagente aparece quando ele estiver ativo.</Text>
        )}
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
                {semDados > 0 && <Text dimColor>{semDados} subagente(s) sem dados de consumo, fora da conta</Text>}
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
