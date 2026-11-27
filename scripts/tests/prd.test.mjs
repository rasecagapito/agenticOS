// Testes da Parte 4b (/cartao prd <ID>). Rodar: node --test scripts/tests/prd.test.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'prd-'));
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

function ficha(extra = {}) {
  return {
    versao: 1, repo: 'dono/app', branch_principal: 'main',
    project: { owner: 'dono', number: 3, url: 'https://github.com/users/dono/projects/3', id: 'PVT_1', campo_status_id: 'FLD_S' },
    colunas: { backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em andamento', em_validacao: 'Em validação', concluido: 'Concluído' },
    colunas_ids: { a_fazer: 'o2', em_andamento: 'o3', em_validacao: 'o4', concluido: 'o6' },
    analistas: ['analista'], ambientes: { hom: 'hom', prd: 'prd' },
    prefixos_branch: { feature: 'feature/', fix: 'fix/' },
    deploy_prd: 'node -e "process.exit(0)"',
    migracao_prd: null,
    testes_prd: 'node -e "process.exit(0)"',
    url_prd: 'https://app.exemplo.com',
    limite_prd_min: 30,
    ...extra,
  };
}

function repoPronto(comMerge = true) {
  const dir = fs.mkdtempSync(path.join(TMP, 'proj-'));
  const g = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.agentic-os/\n');
  g('add', '.');
  g('commit', '-qm', 'init');
  if (comMerge) {
    fs.mkdirSync(path.join(dir, '.agentic-os', 'hom'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.agentic-os/hom/101.json'),
      JSON.stringify({ id: 101, merge: { sha: 'abc1234def5678', pr: 'https://github.com/dono/app/pull/7' } }),
    );
  }
  return dir;
}

const REGRAS_PRD = [
  ok('^api -X POST repos/dono/app/deployments ', { id: 55, created_at: '2026-11-27T00:00:00Z' }),
  ok('^api -X POST repos/dono/app/deployments/55/statuses', {}),
  ok('^project item-list 3', { items: [{ id: 'ITEM_101', status: 'Em validação', content: { number: 101, title: 'Carga', repository: 'dono/app' } }] }),
  ok('^project item-edit', {}),
  ok('^issue close 101', ''),
];

test('card-prd: exige merge, branch principal, árvore limpa e --confirmo-prd; conclui e fecha issue', async () => {
  const { cardPrd } = await imp('prd.mjs');
  const semMerge = repoPronto(false);
  assert.throws(() => cardPrd(semMerge, ficha(), 101, { confirmoPrd: true }), (e) => e.codigo === 'SEM_MERGE');

  const dir = repoPronto(true);
  assert.throws(() => cardPrd(dir, ficha(), 101), (e) => e.codigo === 'PRD_NAO_APROVADO');
  assert.throws(() => cardPrd(dir, ficha({ migracao_prd: 'node -e "0"' }), 101, { confirmoPrd: true }), (e) => e.codigo === 'MIGRACAO_NAO_AUTORIZADA');

  const dry = cardPrd(dir, ficha(), 101, { dryRun: true });
  assert.equal(dry.dry_run, true);
  assert.ok(dry.acoes.some((a) => /Concluído/.test(a)));

  const c = cenario(REGRAS_PRD);
  const r = cardPrd(dir, ficha(), 101, { confirmoPrd: true });
  assert.equal(r.situacao, 'concluido');
  assert.equal(r.issue_fechada, true);
  assert.ok(c.chamadas().some((x) => x.args[1] === 'item-edit' && x.args.includes('o6')));
  assert.ok(c.chamadas().some((x) => x.args[0] === 'issue' && x.args[1] === 'close'));

  // idempotente
  const c2 = cenario([]);
  assert.equal(cardPrd(dir, ficha(), 101, { confirmoPrd: true }).situacao, 'ja_concluido');
  assert.equal(c2.chamadas().length, 0);
});

test('card-prd: falha de etapa marca failure e não move cartão', async () => {
  const { cardPrd } = await imp('prd.mjs');
  const dir = repoPronto(true);
  const c = cenario(REGRAS_PRD);
  assert.throws(
    () => cardPrd(dir, ficha({ deploy_prd: 'node -e "process.exit(1)"' }), 101, { confirmoPrd: true }),
    (e) => e.codigo === 'PRD_FALHOU',
  );
  assert.equal(c.chamadas().some((x) => x.args[1] === 'item-edit'), false);
  assert.equal(c.chamadas().some((x) => x.args[1] === 'close'), false);
});
