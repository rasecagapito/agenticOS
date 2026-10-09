// Testes do Roteador de Modelos. Rodar: node --test scripts/tests/
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTER = path.join(REPO, 'template', 'E-roteador', '.claude', 'router');
const { decide, isBypass, parseOverride, nextTier } = await import(pathToFileURL(path.join(ROUTER, 'decide.mjs')).href);
// cfg = config da v1.6.0 (retrocompatibilidade); tpl = template atual (v1.7, projetos novos).
const FIXTURE_V16 = path.join(REPO, 'scripts', 'tests', 'fixtures', 'config-v1.6.json');
const cfg = JSON.parse(fs.readFileSync(FIXTURE_V16, 'utf8'));
const tpl = JSON.parse(fs.readFileSync(path.join(ROUTER, 'config.json'), 'utf8'));
const pick = (nivel, confianca, risco) => decide(cfg, { nivel, confianca, risco }).subagente;

test('decide: nível base', () => {
  assert.equal(pick('simples', 0.9, 0.1), 'rapido');
  assert.equal(pick('rotina', 0.9, 0.1), 'padrao');
  assert.equal(pick('dificil', 0.9, 0.1), 'profundo');
});

test('decide modo jev: vale a escolha do Jev', () => {
  const jev = (escolha, confianca, risco = 0.9) => decide(cfg, { escolha, confianca, risco });
  assert.equal(jev('rapido', 0.9).subagente, 'rapido'); // risco alto não sobe no modo jev
  assert.equal(jev('padrao', 0.8).subagente, 'padrao');
  assert.equal(jev('rapido', 0.55).subagente, 'padrao'); // confiança baixa sobe 1
  assert.equal(jev('rapido', 0.6).subagente, 'rapido');
  assert.equal(jev('profundo', 0.1).subagente, 'profundo'); // teto
  assert.equal(jev('xpto', 0.99).subagente, 'profundo'); // desconhecido → mais forte
  assert.match(jev('rapido', 0.55).justificativa, /^jev=rapido; conf \.55<\.60 \+1 → padrao$/);
});

test('buildQuestions: modo jev x regras e contexto anterior', async () => {
  const { buildQuestions } = await import(pathToFileURL(path.join(ROUTER, 'route.mjs')).href);
  const q = buildQuestions(cfg, true);
  assert.deepEqual(Object.keys(q.subagente.criteria), ['rapido', 'padrao', 'profundo']);
  assert.match(q.subagente.instructions, /anterior/);
  assert.doesNotMatch(buildQuestions(cfg, false).subagente.instructions, /anterior/);
  const r = buildQuestions({ ...cfg, decision_mode: 'regras' }, false);
  assert.ok(r.nivel && !r.subagente);
});

test('decide: risco > 0.7 sobe um nível (0.7 exato não sobe)', () => {
  assert.equal(pick('simples', 0.9, 0.8), 'padrao');
  assert.equal(pick('simples', 0.9, 0.7), 'rapido');
});

test('decide: confiança < 0.6 sobe um nível (0.6 exato não sobe)', () => {
  assert.equal(pick('simples', 0.5, 0.1), 'padrao');
  assert.equal(pick('simples', 0.6, 0.1), 'rapido');
});

test('decide: bumps acumulam e respeitam o teto', () => {
  assert.equal(pick('simples', 0.5, 0.8), 'profundo');
  const d = decide(cfg, { nivel: 'rotina', confianca: 0.5, risco: 0.9 });
  assert.equal(d.subagente, 'profundo');
  assert.match(d.justificativa, /teto/);
  assert.equal(pick('dificil', 0.1, 0.99), 'profundo');
});

test('decide: falha do classificador → fallback profundo', () => {
  const d = decide(cfg, null, { erro: 'HTTP 401' });
  assert.equal(d.subagente, 'profundo');
  assert.equal(d.origem, 'fallback');
  assert.match(d.justificativa, /HTTP 401/);
});

test('decide: classe desconhecida → mais forte', () => {
  assert.equal(pick('???', 0.9, 0.1), 'profundo');
});

test('override e bypass', () => {
  const ov = parseOverride('nivel:avançado conserte o login', cfg.tiers);
  assert.deepEqual(ov, { tierIndex: 2, prompt: 'conserte o login' });
  assert.equal(parseOverride('nivel:basico troque a cor', cfg.tiers).tierIndex, 0);
  assert.equal(parseOverride('nivel:xpto algo', cfg.tiers), null);
  assert.equal(decide(cfg, null, { override: 1 }).subagente, 'padrao');
  assert.ok(isBypass('!ls'));
  assert.ok(isBypass('  /status'));
  assert.ok(!isBypass('mude a cor'));
  assert.ok(isBypass('<task-notification> <task-id>x</task-id>'));
  assert.ok(isBypass('<command-name>/status</command-name>'));
});

test('nextTier', () => {
  assert.equal(nextTier(cfg.tiers, 'rapido').agent, 'padrao');
  assert.equal(nextTier(cfg.tiers, 'profundo'), null);
});

// ---- Ponta a ponta: instala num projeto temporário e simula o Jev ----

function mockJev(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => handler(req, JSON.parse(b || '{}'), res));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function runHook(proj, prompt, env = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(proj, '.claude', 'router', 'route.mjs')], {
      env: { ...process.env, ...env },
    });
    let out = '';
    p.stdout.on('data', (c) => (out += c));
    p.on('close', () => resolve(out));
    p.stdin.end(JSON.stringify({ prompt, session_id: 't', cwd: proj }));
  });
}

const lastEntry = (proj) => {
  const lines = fs.readFileSync(path.join(proj, '.claude', 'router', 'decisions.jsonl'), 'utf8').trim().split('\n');
  return JSON.parse(lines.at(-1));
};

test('e2e: instalador + hook + log + statusline', async (t) => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'roteador proj-'));
  fs.writeFileSync(path.join(proj, 'CLAUDE.md'), '# Projeto X\nBarbearia com agendamento online.\n');
  fs.mkdirSync(path.join(proj, '.claude', 'router'), { recursive: true });
  // projeto já tinha o roteador v1.6.0: o update não pode mudar o comportamento
  fs.copyFileSync(FIXTURE_V16, path.join(proj, '.claude', 'router', 'config.json'));
  fs.writeFileSync(
    path.join(proj, '.claude', 'settings.json'),
    JSON.stringify({ permissions: { allow: ['Read(*)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo x' }] }] } }),
  );

  const inst = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'install-router.mjs'), proj], { encoding: 'utf8' });
  assert.equal(inst.status, 0, inst.stderr);

  // settings: preserva o existente, adiciona model + hook
  const s = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8'));
  assert.equal(s.model, 'haiku');
  assert.deepEqual(s.permissions.allow, ['Read(*)']);
  assert.equal(s.hooks.Stop.length, 1);
  assert.equal(s.hooks.UserPromptSubmit.length, 1);
  for (const a of ['rapido', 'padrao', 'profundo']) assert.ok(fs.existsSync(path.join(proj, '.claude', 'agents', `${a}.md`)));
  assert.match(fs.readFileSync(path.join(proj, '.claude', 'agents', 'profundo.md'), 'utf8'), /^model: opus$/m);
  const brain = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');
  assert.match(brain, /Barbearia/);
  assert.equal(brain.split('agentic-os:router:start').length, 2);

  const upCfg = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'router', 'config.json'), 'utf8'));
  for (const k of ['instructions_choice', 'policy', 'rules', 'continuacao', 'risk_question', 'state_command']) {
    assert.ok(!(k in upCfg), `update não deve ativar ${k}`);
  }
  assert.match(inst.stdout, /opcionais da v1\.7/);

  // idempotente: 2ª execução não duplica hook nem bloco
  spawnSync(process.execPath, [path.join(REPO, 'scripts', 'install-router.mjs'), proj]);
  const s2 = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8'));
  assert.equal(s2.hooks.UserPromptSubmit.length, 1);
  assert.equal(fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8').split('agentic-os:router:start').length, 2);

  // mock do Jev
  let lastBody = null;
  let reply = { escolha: 'profundo', nivel: 'dificil', conf: 0.91, risco: 0.34 };
  const srv = await mockJev((req, body, res) => {
    lastBody = body;
    if (req.headers.authorization !== 'Bearer k') {
      res.writeHead(401).end('{}');
      return;
    }
    const answers = { risco: { type: 'noul', noul: reply.risco } };
    if (body.questions.subagente) {
      answers.subagente = { type: 'choice', choice: reply.escolha, probabilities: {}, confidence: reply.conf };
    } else {
      answers.nivel = { type: 'choice', choice: reply.nivel, probabilities: {}, confidence: reply.conf };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ model: 'jev-1.13.0', answers }));
  });
  t.after(() => srv.close());
  const cfgPath = path.join(proj, '.claude', 'router', 'config.json');
  const pc = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  pc.classifier.endpoint = `http://127.0.0.1:${srv.address().port}/v1/systemone`;
  fs.writeFileSync(cfgPath, JSON.stringify(pc));
  const statusline = () =>
    spawnSync(process.execPath, [path.join(proj, '.claude', 'router', 'statusline.mjs')], {
      input: '{}',
      encoding: 'utf8',
      env: { ...process.env, HOME: proj, USERPROFILE: proj },
    }).stdout;

  // modo jev (padrão): Jev escolhe profundo
  let out = JSON.parse(await runHook(proj, 'race condition no agendamento', { TYPESAFE_API_KEY: 'k' }));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="profundo"/);
  assert.match(out.hookSpecificOutput.additionalContext, /jev escolheu=profundo/);
  assert.equal(lastBody.questions.subagente.type, 'choice');
  assert.equal(lastBody.questions.risco.type, 'noul');
  assert.match(lastBody.state.projeto, /Barbearia/);
  assert.equal(lastBody.state.anterior, undefined); // 1ª mensagem da sessão
  assert.deepEqual(Object.keys(lastBody.state), ['pedido', 'projeto']); // state da v1.6.0
  const { LEGACY_INSTRUCTIONS } = await import(pathToFileURL(path.join(ROUTER, 'route.mjs')).href);
  assert.equal(lastBody.questions.subagente.instructions, LEGACY_INSTRUCTIONS); // texto da v1.6.0
  assert.deepEqual(Object.keys(lastBody.questions), ['subagente', 'risco']);
  let e = lastEntry(proj);
  assert.equal(e.subagente, 'profundo');
  assert.equal(e.escolha_jev, 'profundo');
  assert.equal(e.confianca, 0.91);
  assert.ok(e.jev_ms >= 0);
  assert.equal(statusline(), 'roteador: jev 0.91 → profundo (Opus)');

  // resposta curta leva o pedido anterior ao Jev
  await runHook(proj, 'sim, pode seguir', { TYPESAFE_API_KEY: 'k' });
  assert.deepEqual(lastBody.state.anterior, { subagente: 'profundo', pedido: 'race condition no agendamento' });
  assert.match(lastBody.questions.subagente.instructions, /anterior/);

  // Jev inseguro (conf 0.5) escolhe rapido → sobe para padrao
  reply = { escolha: 'rapido', conf: 0.5, risco: 0.1 };
  out = JSON.parse(await runHook(proj, 'troque o título', { TYPESAFE_API_KEY: 'k' }));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="padrao"/);
  assert.equal(statusline(), 'roteador: jev rapido 0.50 ↑ padrao (Sonnet)');

  // modo regras (opcional): simples + risco alto → padrao
  pc.decision_mode = 'regras';
  fs.writeFileSync(cfgPath, JSON.stringify(pc));
  reply = { nivel: 'dificil', conf: 0.91, risco: 0.34 };
  await runHook(proj, 'race condition no agendamento', { TYPESAFE_API_KEY: 'k' });
  assert.ok(lastBody.questions.nivel && !lastBody.questions.subagente);
  assert.equal(statusline(), 'roteador: dificil, 0.91, profundo (Opus)');
  reply = { nivel: 'simples', conf: 0.95, risco: 0.8 };
  out = JSON.parse(await runHook(proj, 'troque a cor do botão', { TYPESAFE_API_KEY: 'k' }));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="padrao"/);

  // chave inválida → 401 → profundo
  out = JSON.parse(await runHook(proj, 'troque a cor do botão', { TYPESAFE_API_KEY: 'errada' }));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="profundo"/);
  assert.equal(lastEntry(proj).erro, 'HTTP 401');

  // sem chave → profundo
  out = JSON.parse(await runHook(proj, 'troque a cor', { TYPESAFE_API_KEY: '' }));
  assert.equal(lastEntry(proj).origem, 'fallback');

  // bypass: sem saída e sem log novo
  const n = fs.readFileSync(path.join(proj, '.claude', 'router', 'decisions.jsonl'), 'utf8').split('\n').length;
  assert.equal(await runHook(proj, '/status'), '');
  assert.equal(await runHook(proj, '!ls'), '');
  assert.equal(fs.readFileSync(path.join(proj, '.claude', 'router', 'decisions.jsonl'), 'utf8').split('\n').length, n);

  // override: não chama o Jev
  lastBody = null;
  out = JSON.parse(await runHook(proj, 'nivel:basico renomeie a variável', { TYPESAFE_API_KEY: 'k' }));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="rapido"/);
  assert.equal(lastBody, null);

  // escalonamento com limite
  const esc = (a) =>
    spawnSync(process.execPath, [path.join(proj, '.claude', 'router', 'log-escalation.mjs'), a, 'causa não encontrada'], {
      encoding: 'utf8',
    }).stdout.trim();
  assert.equal(esc('rapido'), 'padrao');
  assert.equal(esc('padrao'), 'LIMITE'); // max_escalations = 1

  fs.rmSync(proj, { recursive: true, force: true });
});

// ---- v1.7: instrução neutra, critérios objeto, policy por probabilidades, rules, continuação,
// ---- extra_questions/escalate_on, state estruturado e state_command ----

const { buildQuestions, buildState, LEGACY_INSTRUCTIONS } = await import(pathToFileURL(path.join(ROUTER, 'route.mjs')).href);
const { matchRule, matchContinuacao } = await import(pathToFileURL(path.join(ROUTER, 'decide.mjs')).href);
const { runStateCommand, parseSituacao } = await import(pathToFileURL(path.join(ROUTER, 'lib.mjs')).href);

test('v1.7 retrocompat: config v1.6 → mesma decisão e mesmas perguntas', () => {
  const casos = [
    [{ escolha: 'rapido', confianca: 0.55, risco: 0.9 }, 'padrao', 'jev=rapido; conf .55<.60 +1 → padrao'],
    [{ escolha: 'padrao', confianca: 0.8, risco: 0.1 }, 'padrao', 'jev=padrao → padrao'],
    [{ escolha: 'profundo', confianca: 0.1, risco: 0.1 }, 'profundo', 'jev=profundo; conf .10<.60 +1; teto → profundo'],
    // probabilidades na resposta não mudam nada sem `policy`
    [{ escolha: 'rapido', confianca: 0.9, probabilidades: { rapido: 0.5, padrao: 0.1, profundo: 0.4 } }, 'rapido', 'jev=rapido → rapido'],
  ];
  for (const [cls, sub, just] of casos) {
    const d = decide(cfg, cls);
    assert.equal(d.subagente, sub);
    assert.equal(d.justificativa, just);
  }
  const q = buildQuestions(cfg, false);
  assert.equal(q.subagente.instructions, LEGACY_INSTRUCTIONS);
  assert.ok(q.risco);
  assert.equal(matchRule(cfg, 'qualquer'), null);
  assert.equal(matchContinuacao(cfg, 'sim', { subagente: 'profundo' }), null);
  const st = buildState({ ...cfg, project_summary: 'resumo' }, 'p');
  assert.deepEqual(st, { pedido: 'p', projeto: 'resumo' });
  assert.equal(buildState({ ...cfg, project_summary: 'r', project_summary_max_chars: 0 }, 'p').projeto, 'r'); // legado: 0 = 4000
});

test('v1.7 instructions_choice: neutra no template; string, objeto e array', () => {
  assert.match(tpl.instructions_choice, /menor/);
  assert.doesNotMatch(tpl.instructions_choice, /na dúvida/);
  assert.equal(buildQuestions(tpl, false).subagente.instructions, tpl.instructions_choice);
  assert.match(buildQuestions(tpl, true).subagente.instructions, /`anterior`/);
  const obj = { pergunta: 'menor executor?' };
  assert.deepEqual(buildQuestions({ ...tpl, instructions_choice: obj }, false).subagente.instructions, obj);
  const comCtx = buildQuestions({ ...tpl, instructions_choice: obj }, true).subagente.instructions;
  assert.ok(Array.isArray(comCtx) && comCtx[0] === obj && /anterior/.test(comCtx[1]));
  const arr = buildQuestions({ ...tpl, instructions_choice: ['a', 'b'] }, true).subagente.instructions;
  assert.equal(arr.length, 3);
});

test('v1.7 agent_criteria: objeto {definicao, exemplos, exclusoes} vai como objeto; string continua', () => {
  const q = buildQuestions(tpl, false);
  assert.equal(typeof q.subagente.criteria.rapido, 'object');
  assert.ok(q.subagente.criteria.profundo.definicao && Array.isArray(q.subagente.criteria.profundo.exemplos));
  const mix = { ...tpl, agent_criteria: { rapido: 'texto', padrao: { definicao: 'x', exemplos: [], exclusoes: [] } } };
  const c = buildQuestions(mix, false).subagente.criteria;
  assert.equal(c.rapido, 'texto');
  assert.deepEqual(c.padrao, { definicao: 'x', exemplos: [], exclusoes: [] });
  assert.match(c.profundo, /Nível avancado/);
});

test('v1.7 policy probabilidades', () => {
  const pol = (p, extra = {}) => decide({ ...tpl, ...extra }, { escolha: 'x', confianca: 0.2, probabilidades: p });
  // argmax baixo, mas probabilidade alta no topo → sobe ao topo
  let d = pol({ rapido: 0.45, padrao: 0.15, profundo: 0.4 });
  assert.equal(d.subagente, 'profundo');
  assert.match(d.justificativa, /argmax=rapido \.45; P\(>=profundo\) \.40>=\.35 ↑ → profundo/);
  // dúvida rapido × padrao → padrao (não vai ao Opus)
  d = pol({ rapido: 0.5, padrao: 0.45, profundo: 0.05 });
  assert.equal(d.subagente, 'padrao');
  // confiança baixa não sobe nada
  assert.equal(pol({ rapido: 0.9, padrao: 0.05, profundo: 0.05 }).subagente, 'rapido');
  // argmax padrao, profundo abaixo do limiar → fica
  assert.equal(pol({ rapido: 0.2, padrao: 0.5, profundo: 0.3 }).subagente, 'padrao');
  // argmax profundo
  assert.equal(pol({ rapido: 0.1, padrao: 0.2, profundo: 0.7 }).subagente, 'profundo');
  // sem probabilidades → vale a escolha, sem subida
  d = decide(tpl, { escolha: 'rapido', confianca: 0.1 });
  assert.equal(d.subagente, 'rapido');
  assert.match(d.justificativa, /sem probabilidades/);
  // limiar por id do tier também vale
  const byId = { policy: { type: 'probabilidades', subir_se_prob_acima: { avancado: 0.3 } } };
  assert.equal(pol({ rapido: 0.6, padrao: 0.1, profundo: 0.3 }, byId).subagente, 'profundo');
});

test('v1.7 rules: primeira que casa decide; regex inválida e tier inexistente são puladas', () => {
  const c = {
    ...tpl,
    rules: [
      { nome: 'quebrada', match: '([', tier: 'basico' },
      { nome: 'fantasma', match: 'prd', tier: 'xpto' },
      { nome: 'prd', match: '\\b(prd|produ[cç][aã]o|rollback)\\b', tier: 'avancado' },
      { nome: 'status', match: '^(status|listar?)\\b', tier: 'rapido' },
    ],
  };
  assert.deepEqual(matchRule(c, 'Faça o rollback em PRD'), { tierIndex: 2, nome: 'prd' });
  assert.deepEqual(matchRule(c, 'status do cliente'), { tierIndex: 0, nome: 'status' });
  assert.equal(matchRule(c, 'crie a tela'), null);
  const d = decide(c, null, { regra: matchRule(c, 'rollback') });
  assert.equal(d.origem, 'regra:prd');
  assert.equal(d.subagente, 'profundo');
});

test('v1.7 continuacao: confirmação curta herda o tier anterior', () => {
  const ant = { subagente: 'profundo', pedido: 'migre o banco' };
  assert.deepEqual(matchContinuacao(tpl, 'sim, pode seguir', ant), { tierIndex: 2 });
  assert.deepEqual(matchContinuacao(tpl, 'opção 2', { subagente: 'rapido' }), { tierIndex: 0 });
  assert.equal(matchContinuacao(tpl, 'sim, mas antes troque a cor do botão', ant), null); // não casa
  assert.equal(matchContinuacao(tpl, 'sim', null), null); // sem decisão anterior
  assert.equal(matchContinuacao({ ...tpl, continuacao: { match: '.*', max_chars: 5 } }, 'pode seguir', ant), null);
  const d = decide(tpl, null, { continuacao: { tierIndex: 2 } });
  assert.equal(d.origem, 'continuacao');
  assert.equal(d.subagente, 'profundo');
});

test('v1.7 extra_questions + escalate_on; risk_question false', () => {
  const c = {
    ...tpl,
    extra_questions: {
      grava: { type: 'noul', instructions: 'O `pedido` grava dados em produção?' },
      risco: { type: 'noul', instructions: 'reservado' },
    },
    escalate_on: [{ question: 'grava', noul_acima: 0.6, tier_minimo: 'avancado' }],
  };
  const q = buildQuestions(c, false);
  assert.deepEqual(Object.keys(q), ['subagente', 'grava']); // risco reservado/removido
  assert.ok(buildQuestions({ ...tpl, risk_question: true }, false).risco);
  const base = { escolha: 'rapido', confianca: 0.9, probabilidades: { rapido: 0.9, padrao: 0.05, profundo: 0.05 } };
  let d = decide(c, { ...base, extras: { grava: { type: 'noul', noul: 0.8 } } });
  assert.equal(d.subagente, 'profundo');
  assert.match(d.justificativa, /grava \.80>\.60 → min profundo/);
  assert.equal(decide(c, { ...base, extras: { grava: { noul: 0.6 } } }).subagente, 'rapido'); // 0.6 exato não
  // só eleva o piso: nunca desce
  d = decide({ ...c, escalate_on: [{ question: 'grava', noul_acima: 0.1, tier_minimo: 'rapido' }] }, {
    ...base,
    probabilidades: { rapido: 0, padrao: 0, profundo: 1 },
    extras: { grava: { noul: 0.9 } },
  });
  assert.equal(d.subagente, 'profundo');
  // também no modo regras
  assert.equal(decide(c, { nivel: 'simples', confianca: 0.9, risco: 0, extras: { grava: { noul: 0.9 } } }).subagente, 'profundo');
});

test('v1.7 state estruturado: pedido, anterior, dominio, projeto, situacao', () => {
  const c = { ...tpl, project_summary: 'x'.repeat(5000), domain_summary: 'Cargas de dados no ERP.' };
  const st = buildState(c, 'p', { subagente: 'padrao' }, { etapa: 'teste' });
  assert.deepEqual(Object.keys(st), ['pedido', 'anterior', 'dominio', 'projeto', 'situacao']);
  assert.equal(st.projeto.length, 4000);
  assert.equal(buildState({ ...c, state_project_summary_max_chars: 100 }, 'p').projeto.length, 100);
  assert.ok(!('projeto' in buildState({ ...c, state_project_summary_max_chars: 0 }, 'p'))); // 0 = não envia
  assert.ok(!('dominio' in buildState({ ...c, domain_summary: '' }, 'p')));
});

test('v1.7 state_command: ok, timeout, JSON inválido, não-objeto, saída != 0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roteador sc-'));
  const script = (nome, code) => {
    const f = path.join(dir, nome);
    fs.writeFileSync(f, code);
    return { cmd: `"${process.execPath}" "${f}"`, timeout_ms: 1500 };
  };
  assert.deepEqual(await runStateCommand(script('ok.mjs', 'console.log(JSON.stringify({ etapa: "teste", n: 1 }))'), dir), {
    situacao: { etapa: 'teste', n: 1 },
  });
  const t0 = Date.now();
  const lento = { ...script('lento.mjs', 'setTimeout(() => console.log("{}"), 5000)'), timeout_ms: 300 };
  assert.deepEqual(await runStateCommand(lento, dir), { erro: 'timeout 300ms' });
  assert.ok(Date.now() - t0 < 2000, 'timeout não pode bloquear');
  assert.deepEqual(await runStateCommand(script('ruim.mjs', 'console.log("nao json")'), dir), { erro: 'json invalido' });
  assert.deepEqual(await runStateCommand(script('arr.mjs', 'console.log("[1,2]")'), dir), { erro: 'json nao e objeto' });
  assert.deepEqual(await runStateCommand(script('falha.mjs', 'process.exit(3)'), dir), { erro: 'saida 3' });
  assert.equal(await runStateCommand(null), null);
  assert.deepEqual(parseSituacao('null'), { erro: 'json nao e objeto' });
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('e2e v1.7: instalação nova — rules, continuação, probabilidades, state_command e log', async (t) => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'roteador v17-'));
  fs.writeFileSync(path.join(proj, 'CLAUDE.md'), '# Projeto Y\nCargas.\n');
  const inst = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'install-router.mjs'), proj], { encoding: 'utf8' });
  assert.equal(inst.status, 0, inst.stderr);
  const cfgPath = path.join(proj, '.claude', 'router', 'config.json');
  const pc = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.equal(pc.policy.type, 'probabilidades'); // projeto novo recebe os defaults da v1.7

  let lastBody = null;
  let calls = 0;
  let probs = { rapido: 0.45, padrao: 0.15, profundo: 0.4 };
  const srv = await mockJev((req, body, res) => {
    lastBody = body;
    calls++;
    const answers = {
      subagente: { type: 'choice', choice: 'rapido', probabilities: probs, confidence: 0.3 },
      grava: { type: 'noul', noul: 0.2 },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ model: 'jev', answers }));
  });
  t.after(() => srv.close());
  fs.writeFileSync(path.join(proj, 'sit.mjs'), 'console.log(JSON.stringify({ etapa: "carga", ambiente: "teste" }))');
  pc.classifier.endpoint = `http://127.0.0.1:${srv.address().port}/v1/systemone`;
  pc.domain_summary = 'Cargas de dados no ERP.';
  pc.state_project_summary_max_chars = 0;
  pc.state_command = { cmd: `"${process.execPath}" sit.mjs`, timeout_ms: 1500 };
  pc.rules = [{ nome: 'prd', match: '\\bprd\\b', tier: 'avancado' }];
  pc.extra_questions = { grava: { type: 'noul', instructions: 'O `pedido` grava dados em produção?' } };
  pc.escalate_on = [{ question: 'grava', noul_acima: 0.6, tier_minimo: 'avancado' }];
  fs.writeFileSync(cfgPath, JSON.stringify(pc));
  const env = { TYPESAFE_API_KEY: 'k' };

  // Jev: argmax rapido, mas P(profundo) .40 ≥ .35 → profundo; state estruturado com situacao
  let out = JSON.parse(await runHook(proj, 'ajuste a carga de itens', env));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="profundo"/);
  assert.deepEqual(Object.keys(lastBody.state), ['pedido', 'dominio', 'situacao']);
  assert.deepEqual(lastBody.state.situacao, { etapa: 'carga', ambiente: 'teste' });
  assert.deepEqual(Object.keys(lastBody.questions), ['subagente', 'grava']);
  assert.equal(typeof lastBody.questions.subagente.criteria.rapido, 'object');
  let e = lastEntry(proj);
  assert.equal(e.politica, 'probabilidades');
  assert.deepEqual(e.probabilidades, probs);
  assert.equal(e.confianca, 0.3);
  assert.deepEqual(e.extras, { grava: 0.2 });
  assert.equal(e.state_command_falhou, undefined);

  // continuação: não chama o Jev, mesmo tier
  const n0 = calls;
  out = JSON.parse(await runHook(proj, 'sim, pode seguir', env));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="profundo"/);
  assert.equal(calls, n0);
  assert.equal(lastEntry(proj).origem, 'continuacao');

  // regra: não chama o Jev
  out = JSON.parse(await runHook(proj, 'rode a carga em PRD', env));
  assert.match(out.hookSpecificOutput.additionalContext, /regra:prd/);
  assert.equal(calls, n0);
  e = lastEntry(proj);
  assert.equal(e.origem, 'regra:prd');
  assert.equal(e.jev_ms, 0);

  // dúvida rapido × padrao → padrao; state_command quebrado não bloqueia e vai para o log
  probs = { rapido: 0.5, padrao: 0.45, profundo: 0.05 };
  pc.state_command = { cmd: `"${process.execPath}" -e "process.exit(2)"`, timeout_ms: 1500 };
  fs.writeFileSync(cfgPath, JSON.stringify(pc));
  out = JSON.parse(await runHook(proj, 'liste as cargas pendentes e explique', env));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="padrao"/);
  e = lastEntry(proj);
  assert.equal(e.state_command_falhou, 'saida 2');
  assert.ok(!('situacao' in lastBody.state));

  fs.rmSync(proj, { recursive: true, force: true });
});
