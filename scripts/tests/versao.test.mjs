// Testes do controle de versões (#6). Rodar: node --test scripts/tests/versao.test.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ver-'));
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

function ficha() {
  return {
    versao: 1, repo: 'dono/app', branch_principal: 'main',
    project: { owner: 'dono', number: 3, url: 'https://github.com/users/dono/projects/3', id: 'PVT_1', campo_status_id: 'FLD_S' },
    colunas: { backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em andamento', em_validacao: 'Em validação', concluido: 'Concluído' },
    analistas: ['analista'], ambientes: { hom: 'hom', prd: 'prd' },
    prefixos_branch: { feature: 'feature/', fix: 'fix/' },
    versoes: { ignorar_backlog: true, prefixo_tag: 'v' },
  };
}

function repoComBare() {
  const bare = fs.mkdtempSync(path.join(TMP, 'bare-'));
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  const dir = fs.mkdtempSync(path.join(TMP, 'proj-'));
  const g = (...a) => {
    const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    if (r.status) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  g('add', '.');
  g('commit', '-qm', 'feat: primeira entrega (#1)');
  g('remote', 'add', 'origin', bare);
  g('push', '-q', 'origin', 'main');
  return { dir, bare, g };
}

test('versao: 1a versao fecha v1.0.0 só quando tudo do escopo está em Concluído (Backlog ignorado)', async () => {
  const { releaseCheck, releasePublish } = await imp('versao.mjs');
  const { dir, g } = repoComBare();
  cenario([
    ok('^project item-list 3', {
      items: [
        { id: '1', status: 'Concluído', content: { number: 1, title: 'Base', repository: 'dono/app' } },
        { id: '2', status: 'Em validação', content: { number: 2, title: 'Pendente', repository: 'dono/app' } },
      ],
    }),
  ]);
  assert.throws(() => releaseCheck(dir, ficha()), (e) => e.codigo === 'VERSAO_BLOQUEADA');

  // Todos concluídos (+ 1 em Backlog que é ignorado por padrão)
  cenario([
    ok('^project item-list 3', {
      items: [
        { id: '1', status: 'Concluído', content: { number: 1, title: 'Base', repository: 'dono/app' } },
        { id: '2', status: 'Backlog', content: { number: 2, title: 'Futuro', repository: 'dono/app' } },
      ],
    }),
    ok('^release view v1\\.0\\.0', { code: 1, stderr: 'not found' }),
  ]);
  const chk = releaseCheck(dir, ficha());
  assert.equal(chk.proxima_versao, 'v1.0.0');
  assert.throws(() => releasePublish(dir, ficha()), (e) => e.codigo === 'CONFIRMACAO_RELEASE');

  const c = cenario([
    ok('^project item-list 3', {
      items: [{ id: '1', status: 'Concluído', content: { number: 1, title: 'Base', repository: 'dono/app' } }],
    }),
    { re: '^release view v1\\.0\\.0', code: 1, stderr: 'not found' },
    ok('^release create v1\\.0\\.0', 'https://github.com/dono/app/releases/tag/v1.0.0\n'),
  ]);
  const pub = releasePublish(dir, ficha(), { confirmoRelease: true });
  assert.equal(pub.versao, 'v1.0.0');
  assert.equal(pub.situacao, 'publicada');
  assert.equal(g('tag', '--list', 'v1.0.0'), 'v1.0.0');
  assert.ok(c.chamadas().some((x) => x.args[0] === 'release' && x.args[1] === 'create'));

  // Nova entrega fix → v1.0.1; nova feature → v1.1.0
  fs.writeFileSync(path.join(dir, 'fix.txt'), 'ok');
  g('add', '.');
  g('commit', '-qm', 'fix: corrige bug (#3)');
  g('push', '-q', 'origin', 'main');
  cenario([
    ok('^project item-list 3', {
      items: [{ id: '3', status: 'Concluído', content: { number: 3, title: 'Bug', repository: 'dono/app' } }],
    }),
  ]);
  assert.equal(releaseCheck(dir, ficha()).proxima_versao, 'v1.0.1');
  assert.equal(releaseCheck(dir, ficha(), { minor: true }).proxima_versao, 'v1.1.0');
  assert.equal(releaseCheck(dir, ficha(), { major: true }).proxima_versao, 'v2.0.0');
});
