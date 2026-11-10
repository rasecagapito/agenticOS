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

const rv = (login, state, commit_id, submitted_at, body = '') => ({
  user: { login }, state, commit_id, submitted_at, body, html_url: `https://github.com/dono/app/pull/7#review-${login}-${submitted_at}`,
});
const REVIEWS = (lista) => ok('^api --paginate --slurp repos/dono/app/pulls/7/reviews', [lista]);
const USER = ok('^api user$', { login: 'agente' });
function ficha(extra = {}) {
  return {
    versao: 1, repo: 'dono/app', branch_principal: 'main',
    project: { owner: 'dono', number: 3, url: 'https://github.com/users/dono/projects/3', id: 'PVT_1', campo_status_id: 'FLD_S' },
    colunas: { backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em andamento', em_validacao: 'Em validação', aprovado: 'Aprovado', concluido: 'Concluído', bloqueado: 'Bloqueado' },
    colunas_ids: { a_fazer: 'o2', em_andamento: 'o3', em_validacao: 'o4', aprovado: 'o5' },
    analistas: ['analista'], ambientes: { hom: 'hom', prd: 'prd' }, aprovacao_pelo_chat: false,
    ...extra,
  };
}
const ASSIN = { cartao: 101, repo: 'dono/app', pr: 'https://github.com/dono/app/pull/7', tipo: 'review no GitHub', analista: 'analista',
  em: '2026-11-04T11:00:00Z', commit: 's2', ambiente: 'hom', resultado: 'aprovado', evidencia: 'https://github.com/dono/app/pull/7#review-1', texto: 'ok' };
const E = { id: 101, sha: 's2', pr: { number: 7, url: 'https://github.com/dono/app/pull/7' }, branch: 'feature/101-carga', assinatura: ASSIN };
const PRDADOS = (extra = {}) => ({ number: 7, url: 'https://github.com/dono/app/pull/7', title: 'Carga', state: 'OPEN', isDraft: false,
  baseRefName: 'main', headRefName: 'feature/101-carga', headRefOid: 's2', mergeable: 'MERGEABLE', body: 'Cartão #101', mergeCommit: null, ...extra });

test('provarAssinatura: review vale; reprovação vence; agente não vale; chat exige ficha, corpo e confirmação', async () => {
  const { provarAssinatura } = await imp('merge.mjs');
  cenario([USER, REVIEWS([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z')])]);
  assert.equal(provarAssinatura(ficha(), E, ASSIN, PRDADOS()), 'review no GitHub');
  cenario([USER, REVIEWS([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z'), rv('analista', 'CHANGES_REQUESTED', 's2', '2026-11-04T12:00:00Z')])]);
  assert.throws(() => provarAssinatura(ficha(), E, ASSIN, PRDADOS()), (e) => e.codigo === 'ASSINATURA_REPROVADA');
  cenario([USER, REVIEWS([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z'), rv('analista', 'DISMISSED', 's2', '2026-11-04T12:00:00Z')])]);
  assert.throws(() => provarAssinatura(ficha(), E, ASSIN, PRDADOS()), (e) => e.codigo === 'SEM_ASSINATURA');
  cenario([USER, REVIEWS([rv('agente', 'APPROVED', 's2', '2026-11-04T11:00:00Z')])]);
  assert.throws(() => provarAssinatura(ficha({ analistas: ['analista', 'agente'] }), E, ASSIN, PRDADOS()), (e) => e.codigo === 'SEM_ASSINATURA');

  const chat = { ...ASSIN, tipo: 'chat, sem prova do GitHub' };
  const corpoChat = 'x\n## Assinatura\n| Tipo | chat, sem prova do GitHub |';
  cenario([USER, REVIEWS([])]);
  assert.throws(() => provarAssinatura(ficha(), E, chat, PRDADOS({ body: corpoChat }), { confirmoMergeChat: true }), (e) => e.codigo === 'CHAT_DESLIGADO');
  const fc = ficha({ aprovacao_pelo_chat: true });
  assert.throws(() => provarAssinatura(fc, E, chat, PRDADOS({ body: 'sem seção' }), { confirmoMergeChat: true }), (e) => e.codigo === 'SEM_ASSINATURA');
  assert.throws(() => provarAssinatura(fc, E, chat, PRDADOS({ body: corpoChat })), (e) => e.codigo === 'CONFIRMACAO_CHAT');
  assert.equal(provarAssinatura(fc, E, chat, PRDADOS({ body: corpoChat }), { confirmoMergeChat: true }), 'chat, sem prova do GitHub');
  cenario([USER, REVIEWS([rv('analista', 'CHANGES_REQUESTED', 's2', '2026-11-04T12:00:00Z')])]);
  assert.throws(() => provarAssinatura(fc, E, chat, PRDADOS({ body: corpoChat }), { confirmoMergeChat: true }), (e) => e.codigo === 'ASSINATURA_REPROVADA');
  // review aprovando o commit atual vale mais que o chat
  cenario([USER, REVIEWS([rv('analista', 'APPROVED', 's2', '2026-11-04T12:00:00Z')])]);
  assert.equal(provarAssinatura(fc, E, chat, PRDADOS({ body: corpoChat })), 'review no GitHub');
});

test('exigirChecks e exigirIntegravel', async () => {
  const { exigirChecks, exigirIntegravel } = await imp('merge.mjs');
  const pr = PRDADOS();
  cenario([ok('^pr checks', [{ name: 'ci', bucket: 'pass' }, { name: 'lint', bucket: 'skipping' }])]);
  exigirChecks(ficha(), pr);
  cenario([ok('^pr checks', [{ name: 'ci', bucket: 'pending' }, { name: 'lint', bucket: 'fail' }])]);
  assert.throws(() => exigirChecks(ficha(), pr), (e) => e.codigo === 'CHECKS_PENDENTES' && /ci \(pending\)/.test(e.message) && e.extra.checks.length === 2);
  cenario([{ re: '^pr checks', stderr: "no required checks reported on the 'feature/101-carga' branch", code: 1 }]);
  exigirChecks(ficha(), pr);
  cenario([{ re: '^pr checks', stderr: 'HTTP 404: Not Found', code: 1 }]);
  assert.throws(() => exigirChecks(ficha(), pr), (e) => e.codigo === 'GH_FALHOU');

  cenario([]);
  exigirIntegravel(ficha(), pr, 0);
  assert.throws(() => exigirIntegravel(ficha(), PRDADOS({ mergeable: 'CONFLICTING' }), 0), (e) => e.codigo === 'PR_CONFLITO');
  cenario([ok('^pr view', { mergeable: 'MERGEABLE' })]);
  exigirIntegravel(ficha(), PRDADOS({ mergeable: 'UNKNOWN' }), 0);
  cenario([ok('^pr view', { mergeable: 'UNKNOWN' })]);
  assert.throws(() => exigirIntegravel(ficha(), PRDADOS({ mergeable: 'UNKNOWN' }), 0), (e) => e.codigo === 'PR_CONFLITO' && /calculando/.test(e.message));
});

test('corpoSquash: bloco da assinatura, aviso por Tipo e Closes', async () => {
  const { corpoSquash } = await imp('merge.mjs');
  const a = corpoSquash(ASSIN, 101);
  assert.match(a, /^## Assinatura\n\n\| Campo \| Valor \|/);
  assert.match(a, /\| Commit homologado \| s2 \|/);
  assert.match(a, /Closes #101\n$/);
  assert.equal(a.includes('⚠️'), false);
  assert.match(corpoSquash({ ...ASSIN, tipo: 'review no GitHub ⚠️ gh local = analista' }, 101), /⚠️ O gh desta máquina estava logado como analista/);
  assert.match(corpoSquash({ ...ASSIN, tipo: 'chat, sem prova do GitHub' }, 101), /⚠️ Assinatura declarada no chat, sem prova do GitHub\./);
});
