// Testes da Parte 4a (merge exigindo a assinatura). Rodar: node --test scripts/tests/merge.test.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-'));
Object.assign(process.env, {
  HOME: TMP, USERPROFILE: TMP, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_NOSYSTEM: '1',
});

function cenario(regras) {
  const dir = fs.mkdtempSync(path.join(TMP, 'gh-'));
  const arq = path.join(dir, 'cenario.json');
  const log = path.join(dir, 'chamadas.jsonl');
  fs.writeFileSync(arq, JSON.stringify(regras));
  Object.assign(process.env, { AGENTIC_OS_GH_FAKE: FAKE, AGENTIC_OS_GH_SCENARIO: arq, AGENTIC_OS_GH_LOG: log });
  delete process.env.AGENTIC_OS_GH_BIN;
  const chamadas = () =>
    fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { chamadas };
}
const ok = (re, json) => ({ re, stdout: typeof json === 'string' ? json : JSON.stringify(json) });

test('erros novos da Parte 4a existem', async () => {
  const { ERROS } = await imp('erros.mjs');
  for (const c of ['CARTAO_FORA_DE_APROVADO', 'SEM_ASSINATURA', 'ASSINATURA_REPROVADA', 'CHECKS_PENDENTES', 'PR_CONFLITO', 'MERGE_RECUSADO', 'CONFIRMACAO_CHAT'])
    assert.ok(ERROS[c], c);
});

test('ghMerge: squash, match-head-commit, subject e corpo; gh() continua travando merge', async () => {
  const { gh, ghMerge, usarTokenAgente } = await imp('gh.mjs');
  const c = cenario([ok('^pr merge', '')]);
  usarTokenAgente('tok-agente');
  try {
    ghMerge({ repo: 'dono/app', url: 'https://github.com/dono/app/pull/7', sha: 's2', titulo: 'Carga (#7)', corpo: 'corpo X\n' });
  } finally {
    usarTokenAgente(null);
  }
  const m = c.chamadas()[0];
  assert.deepEqual(m.args.slice(0, 10), ['pr', 'merge', 'https://github.com/dono/app/pull/7', '--repo', 'dono/app', '--squash', '--match-head-commit', 's2', '--subject', 'Carga (#7)']);
  assert.equal(m.args.includes('--delete-branch'), false);
  assert.equal(m.body_file, 'corpo X\n');
  assert.equal(m.gh_token, 'tok-agente');
  assert.throws(() => gh(['pr', 'merge', '7']), (e) => e.codigo === 'TRAVA');
  assert.throws(() => ghMerge({ repo: 'dono/app', url: 'u', sha: '', titulo: 't', corpo: 'c' }), (e) => e.codigo === 'PARAMETRO');
});
