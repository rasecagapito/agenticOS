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
const cfg = JSON.parse(fs.readFileSync(path.join(ROUTER, 'config.json'), 'utf8'));
const pick = (nivel, confianca, risco) => decide(cfg, { nivel, confianca, risco }).subagente;

test('decide: nível base', () => {
  assert.equal(pick('simples', 0.9, 0.1), 'rapido');
  assert.equal(pick('rotina', 0.9, 0.1), 'padrao');
  assert.equal(pick('dificil', 0.9, 0.1), 'profundo');
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
  fs.mkdirSync(path.join(proj, '.claude'));
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

  // idempotente: 2ª execução não duplica hook nem bloco
  spawnSync(process.execPath, [path.join(REPO, 'scripts', 'install-router.mjs'), proj]);
  const s2 = JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8'));
  assert.equal(s2.hooks.UserPromptSubmit.length, 1);
  assert.equal(fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8').split('agentic-os:router:start').length, 2);

  // mock do Jev
  let lastBody = null;
  let reply = { nivel: 'dificil', conf: 0.91, risco: 0.34 };
  const srv = await mockJev((req, body, res) => {
    lastBody = body;
    if (req.headers.authorization !== 'Bearer k') {
      res.writeHead(401).end('{}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        model: 'jev-1.13.0',
        answers: {
          nivel: { type: 'choice', choice: reply.nivel, probabilities: {}, confidence: reply.conf },
          risco: { type: 'noul', noul: reply.risco },
        },
      }),
    );
  });
  t.after(() => srv.close());
  const cfgPath = path.join(proj, '.claude', 'router', 'config.json');
  const pc = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  pc.classifier.endpoint = `http://127.0.0.1:${srv.address().port}/v1/systemone`;
  fs.writeFileSync(cfgPath, JSON.stringify(pc));

  // difícil → profundo
  let out = JSON.parse(await runHook(proj, 'race condition no agendamento', { TYPESAFE_API_KEY: 'k' }));
  assert.match(out.hookSpecificOutput.additionalContext, /subagent_type="profundo"/);
  assert.equal(lastBody.questions.nivel.type, 'choice');
  assert.equal(lastBody.questions.risco.type, 'noul');
  assert.match(lastBody.state.projeto, /Barbearia/);
  let e = lastEntry(proj);
  assert.equal(e.subagente, 'profundo');
  assert.equal(e.confianca, 0.91);
  assert.ok(e.jev_ms >= 0);

  // statusline
  const sl = spawnSync(process.execPath, [path.join(proj, '.claude', 'router', 'statusline.mjs')], {
    input: '{}',
    encoding: 'utf8',
    env: { ...process.env, HOME: proj, USERPROFILE: proj },
  });
  assert.equal(sl.stdout, 'roteador: dificil, 0.91, profundo (Opus)');

  // simples + risco alto → padrao
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
