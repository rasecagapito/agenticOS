import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agentic-os-painel',
  component: 'Pane',
  requestId: 'agentic-os-painel',
  props: {
    title: 'Agentic OS',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const cmd = (name: string) => ({ name, description: name, source: 'user' as const })

const hoje = new Date().toISOString()
const LOG = [
  { ts: hoje, tipo: 'decisao', origem: 'jev', subagente: 'rapido', modelo: 'Haiku', escolha_jev: 'rapido', confianca: 0.98, jev_ms: 400 },
  { ts: hoje, tipo: 'decisao', origem: 'jev', subagente: 'profundo', modelo: 'Opus', escolha_jev: 'profundo', confianca: 0.83, jev_ms: 350 },
  { ts: hoje, tipo: 'decisao', origem: 'envelope', subagente: 'profundo', modelo: 'Opus', jev_ms: 0 },
]
  .map(e => JSON.stringify(e))
  .join('\n')

test('contabiliza o subagente, mostra economia, decisões e só os botões que existem', async ($, on) => {
  const rodados: string[] = []
  on('command.register', () => ({ value: { command: 'painel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: LOG }))
  on('fs.exists', () => ({ value: true }))
  on('command.list', () => ({ value: [cmd('status'), cmd('wrapup')] }))
  on('command.run', (_, e) => {
    rodados.push(e.command)
    return { text: 'ok' }
  })
  // 1M de entrada + 100k de saída no Haiku 4.5: real = 1 + 0,5 = US$1,50; se Opus 5.5 = 4 + 2 = US$6,00
  on('tool.call', () => ({
    result: {
      status: 'completed',
      agentType: 'rapido',
      resolvedModel: 'claude-haiku-4-5-20251001',
      usage: { input_tokens: 1_000_000, output_tokens: 100_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      content: [],
      totalToolUseCount: 0,
      totalDurationMs: 1,
      totalTokens: 1_100_000,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.tool.call({ tool: 'Agent', description: 'trocar texto', prompt: 'x', subagent_type: 'rapido' })

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /economizados/ }))?.text).toMatch(/US\$ 4\.50/)
    expect((await ui.find({ type: 'Text', text: /Gasto real/ }))?.text).toMatch(/US\$ 1\.50/)
    expect((await ui.find({ type: 'Text', text: /Se tudo fosse Opus/ }))?.text).toMatch(/US\$ 6\.00/)
    expect((await ui.find({ type: 'Text', text: /Decisões de hoje/ }))?.text).toMatch(/\(2\)/) // envelope não conta
    expect((await ui.find({ type: 'Text', text: /Última/ }))?.text).toMatch(/jev 0\.83 → profundo \(Opus\)/)
    expect(await ui.find({ type: 'Button', key: 'status' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'wrapup' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'handoff' })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'wrapup' })
  await ui.unmount()
  expect(rodados).toContain('wrapup')
})

test('consumo da sessão aparece mesmo sem roteador e acompanha o session.measure', async ($, on) => {
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('fs.exists', () => ({ value: false }))
  on('command.list', () => ({ value: [cmd('agentic-os:agentic-os')] }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [], cost: { usd: 1.23 } },
  }))
  on('session.measure', () => ({ changed: ['cost'] }))

  let ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ type: 'Text', text: /gastos/ }))?.text).toMatch(/US\$ 1\.23/)
  expect((await ui.find({ type: 'Text', text: /Contexto usado/ }))?.text).toMatch(/42%/)
  expect((await ui.find({ type: 'Text', text: /não instalado/ }))?.text).toBeDefined()
  await ui.unmount()

  await $.session.measure({
    context: { window: 200000, percent: 57 },
    rateLimits: [],
    cost: { usd: 2.5 },
    changed: ['cost', 'context'],
  })
  ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ type: 'Text', text: /gastos/ }))?.text).toMatch(/US\$ 2\.50/)
  expect((await ui.find({ type: 'Text', text: /Contexto usado/ }))?.text).toMatch(/57%/)
  await ui.unmount()
})

test('sem tela no início não tenta abrir; abre quando a tela se conecta', async ($, on) => {
  const abertos: string[] = []
  let telas: Array<'terminal' | 'desktop' | 'vscode' | 'mobile'> = []
  on('command.register', () => ({ value: { command: 'painel' } }))
  on('session.surfaces', () => ({ value: telas }))
  on('ui.open', (_, e) => {
    abertos.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  expect(abertos).toEqual([])

  telas = ['vscode']
  await $.session.attach({ clientId: 'c1', surface: 'vscode' })
  expect(abertos).toEqual(['agentic-os-painel'])
})

test('sem comandos próprios: botões chamam a skill do plugin com /status e /wrapup', async ($, on) => {
  const rodados: Array<{ command: string; args: string }> = []
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('fs.exists', () => ({ value: false }))
  on('command.list', () => ({ value: [cmd('agentic-os:agentic-os'), cmd('help')] }))
  on('command.run', (_, e) => {
    rodados.push({ command: e.command, args: e.args })
    return { text: 'ok' }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await ui.find({ type: 'Button', key: 'status' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'wrapup' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'handoff' })).toBeUndefined()
  await ui.press({ key: 'status' })
  await ui.unmount()
  expect(rodados[0]).toEqual({ command: 'agentic-os:agentic-os', args: '/status' })
})

test('nenhum comando do Agentic OS: explica em vez de ficar vazio', async ($, on) => {
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('fs.exists', () => ({ value: false }))
  on('command.list', () => ({ value: [cmd('help')] }))

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ type: 'Text', text: /não encontrados/ }))?.text).toBeDefined()
  await ui.unmount()
})

test('sem roteador: avisa e ainda mostra os botões', async ($, on) => {
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('fs.exists', () => ({ value: false }))
  on('command.list', () => ({ value: [cmd('status'), cmd('wrapup'), cmd('handoff')] }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /não instalado/ }))?.text).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'handoff' })).toBeDefined()
  await ui.unmount()
})
