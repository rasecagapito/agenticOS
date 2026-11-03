// Testes da Governança GitHub (camada F). Rodar: node --test scripts/tests/governanca.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOV = path.join(REPO, 'scripts', 'governanca');
const imp = (m) => import(pathToFileURL(path.join(GOV, m)).href);
const FAKE = path.join(REPO, 'scripts', 'tests', 'fixtures', 'fake-gh.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-'));
// Isola dos settings reais do usuário e dá identidade ao git dos repos de teste.
Object.assign(process.env, {
  HOME: TMP,
  USERPROFILE: TMP,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_NOSYSTEM: '1',
});

// Cenário do gh falso. Devolve leitor das chamadas e as variáveis para subprocessos.
function cenario(regras) {
  const dir = fs.mkdtempSync(path.join(TMP, 'gh-'));
  const arq = path.join(dir, 'cenario.json');
  const log = path.join(dir, 'chamadas.jsonl');
  fs.writeFileSync(arq, JSON.stringify(regras));
  const env = { AGENTIC_OS_GH_FAKE: FAKE, AGENTIC_OS_GH_SCENARIO: arq, AGENTIC_OS_GH_LOG: log };
  Object.assign(process.env, env);
  delete process.env.AGENTIC_OS_GH_BIN;
  const chamadas = () =>
    fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { chamadas, env };
}
const ok = (re, json) => ({ re, stdout: typeof json === 'string' ? json : JSON.stringify(json) });
const falha = (re, stderr) => ({ re, code: 1, stderr });

test('gh: executa o gh falso e devolve JSON', async () => {
  const { ghJson } = await imp('gh.mjs');
  const c = cenario([ok('^api user$', { login: 'agente' })]);
  assert.deepEqual(ghJson(['api', 'user']), { login: 'agente' });
  assert.deepEqual(c.chamadas()[0].args, ['api', 'user']);
});

test('gh: classifica falhas em códigos', async () => {
  const { classificar } = await imp('gh.mjs');
  const cod = (stderr) => classificar({ stderr }).codigo;
  assert.equal(cod('You are not logged into any GitHub hosts. Run gh auth login'), 'GH_DESLOGADO');
  assert.equal(cod('INSUFFICIENT_SCOPES: your token has not been granted the required scopes: project'), 'SEM_ESCOPO_PROJECT');
  assert.equal(cod('Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)'), 'PLANO_SEM_PROTECAO');
  assert.equal(cod('error connecting to api.github.com: could not resolve host'), 'REDE');
  assert.equal(cod('HTTP 422: Validation Failed'), 'GH_FALHOU');
});

test('gh: executável ausente → GH_AUSENTE', async () => {
  const { gh } = await imp('gh.mjs');
  delete process.env.AGENTIC_OS_GH_FAKE;
  process.env.AGENTIC_OS_GH_BIN = 'gh-que-nao-existe-xyz';
  assert.throws(() => gh(['api', 'user']), (e) => e.codigo === 'GH_AUSENTE');
  delete process.env.AGENTIC_OS_GH_BIN;
});

test('gh: falha com permitirFalha devolve código sem lançar', async () => {
  const { gh } = await imp('gh.mjs');
  cenario([falha('^api x$', 'HTTP 404: Not Found')]);
  const r = gh(['api', 'x'], { permitirFalha: true });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /404/);
});
