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
    prefixos_branch: { feature: 'feature/', fix: 'fix/' },
    aceitar_protecao_parcial: false, protecao_aplicada: null,
    comando_testes: 'node -e "process.exit(0)"',
    deploy_hom: 'node -e "process.exit(0)"',
    migracao_hom: null, testes_hom: null, url_hom: 'https://hom.exemplo.com', limite_hom_min: 30,
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

// Projeto com origin (bare) e branch do cartão; estado HOM com assinatura aprovada.
function projeto(estadoExtra = {}) {
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
  fs.writeFileSync(path.join(dir, '.gitignore'), '.agentic-os/hom/\n');
  g('add', '.');
  g('commit', '-qm', 'init');
  g('remote', 'add', 'origin', bare);
  g('push', '-q', 'origin', 'main');
  g('switch', '-q', '-c', 'feature/101-carga');
  fs.writeFileSync(path.join(dir, 'carga.txt'), 'y\n');
  g('add', '.');
  g('commit', '-qm', 'feat: carga');
  const estado = (extra = {}) => {
    fs.mkdirSync(path.join(dir, '.agentic-os', 'hom'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agentic-os/hom/101.json'), JSON.stringify({ ...E, ...estadoExtra, ...extra }));
  };
  estado();
  const lerEstado = () => JSON.parse(fs.readFileSync(path.join(dir, '.agentic-os/hom/101.json'), 'utf8'));
  return { dir, g, estado, lerEstado, mainBare: () => spawnSync('git', ['rev-parse', 'main'], { cwd: bare, encoding: 'utf8' }).stdout.trim() };
}
const ITEM = (status = 'Aprovado') => ok('^project item-list 3', { items: [{ id: 'ITEM_101', status, content: { type: 'Issue', number: 101, title: 'Carga', repository: 'dono/app' } }] });
const PRV = (extra) => ok('^pr view https://github.com/dono/app/pull/7 --repo dono/app --json number,', PRDADOS(extra));
const SHA = ok('--json mergeCommit$', { mergeCommit: { oid: 'abc1234def' } });
const CHECKS = ok('^pr checks', [{ name: 'ci', bucket: 'pass' }]);
const MERGE = ok('^pr merge', '');
const DEL = ok('^api -X DELETE repos/dono/app/git/refs/heads/feature/101-carga$', '');
const COMENT = ok('^issue comment 101', '');
const tudo = (lista, extra = {}) => [ITEM(), PRV(extra), SHA, USER, REVIEWS(lista), CHECKS, MERGE, DEL, COMENT];
const APROVA = [rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z')];

test('card-merge: review válida → squash com assinatura, apaga branch remota, comenta, volta à main; idempotente', async () => {
  const { cardMerge } = await imp('merge.mjs');
  const p = projeto();
  const antes = p.mainBare();
  const c = cenario(tudo(APROVA));
  const r = cardMerge(p.dir, ficha(), 101, { esperaMs: 0 });
  assert.deepEqual([r.ok, r.situacao, r.sha_squash, r.tipo], [true, 'integrado', 'abc1234def', 'review no GitHub']);
  const m = c.chamadas().find((x) => x.args[0] === 'pr' && x.args[1] === 'merge');
  assert.equal(m.args[m.args.indexOf('--match-head-commit') + 1], 's2');
  assert.equal(m.args[m.args.indexOf('--subject') + 1], 'Carga (#7)');
  assert.match(m.body_file, /## Assinatura[\s\S]*\| Analista \| analista \|[\s\S]*Closes #101/);
  assert.ok(c.chamadas().some((x) => x.args.join(' ') === 'api -X DELETE repos/dono/app/git/refs/heads/feature/101-carga'));
  assert.match(c.chamadas().find((x) => x.args[0] === 'issue').args.join(' '), /Integrado na main .*squash abc1234.*review no GitHub/);
  assert.equal(c.chamadas().some((x) => x.args[1] === 'item-edit'), false); // cartão fica em Aprovado
  assert.equal(p.g('branch', '--show-current'), 'main');
  assert.equal(p.mainBare(), antes); // nenhum push na principal
  const st = p.lerEstado();
  assert.equal(st.merge.sha, 'abc1234def');
  assert.equal(st.merge_pendente, undefined);
  const c2 = cenario([]);
  assert.equal(cardMerge(p.dir, ficha(), 101).situacao, 'ja_integrado');
  assert.equal(c2.chamadas().length, 0);
});

test('card-merge: pré-condições', async () => {
  const { cardMerge } = await imp('merge.mjs');
  const p = projeto();
  const erro = (regras, codigo, fic = ficha(), o = { esperaMs: 0 }) => {
    cenario(regras);
    assert.throws(() => cardMerge(p.dir, fic, 101, o), (e) => e.codigo === codigo, codigo);
  };
  erro([ITEM('Em validação')], 'CARTAO_FORA_DE_APROVADO');
  p.estado({ assinatura: null });
  erro([ITEM()], 'SEM_ASSINATURA');
  p.estado({ assinatura_pendente: { tipo: 'chat, sem prova do GitHub' } });
  erro([ITEM()], 'PARAMETRO');
  p.estado();
  erro([ITEM(), PRV({ state: 'CLOSED' })], 'SEM_PR');
  erro([ITEM(), PRV({ isDraft: true })], 'SEM_PR');
  erro([ITEM(), PRV({ baseRefName: 'dev' })], 'SEM_PR');
  erro([ITEM(), PRV({ headRefOid: 's3' })], 'ASSINATURA_DE_OUTRO_COMMIT');
  erro([ITEM(), PRV(), USER, REVIEWS([])], 'SEM_ASSINATURA');
  erro([ITEM(), PRV(), USER, REVIEWS(APROVA), ok('^pr checks', [{ name: 'ci', bucket: 'fail' }])], 'CHECKS_PENDENTES');
  erro([ITEM(), PRV({ mergeable: 'CONFLICTING' }), USER, REVIEWS(APROVA), CHECKS], 'PR_CONFLITO');
  erro([ITEM(), PRV(), USER, REVIEWS(APROVA), CHECKS, { re: '^pr merge', stderr: 'GraphQL: Head branch was modified. Review and try the merge again. token=tok-x', code: 1 }], 'MERGE_RECUSADO');
  assert.equal(p.lerEstado().merge, undefined);
});

test('card-merge: Tipo chat exige --confirmo-merge-chat; com ele integra com aviso', async () => {
  const { cardMerge } = await imp('merge.mjs');
  const chat = { ...ASSIN, tipo: 'chat, sem prova do GitHub', analista: 'analista (declarado)' };
  const p = projeto({ assinatura: chat });
  const fc = ficha({ aprovacao_pelo_chat: true });
  const corpo = 'x\n## Assinatura\n| Tipo | chat, sem prova do GitHub |';
  cenario(tudo([], { body: corpo }));
  assert.throws(() => cardMerge(p.dir, fc, 101, { esperaMs: 0 }), (e) => e.codigo === 'CONFIRMACAO_CHAT');
  const c = cenario(tudo([], { body: corpo }));
  const r = cardMerge(p.dir, fc, 101, { esperaMs: 0, confirmoMergeChat: true });
  assert.equal(r.tipo, 'chat, sem prova do GitHub');
  assert.match(c.chamadas().find((x) => x.args[1] === 'merge').body_file, /⚠️ Assinatura declarada no chat, sem prova do GitHub\./);
});

test('card-merge: PR já integrado completa efeitos sem chamar merge; retry após falha no comentário não duplica', async () => {
  const { cardMerge } = await imp('merge.mjs');
  const p = projeto();
  const c = cenario([ITEM(), PRV({ state: 'MERGED' }), SHA, DEL, COMENT]);
  const r = cardMerge(p.dir, ficha(), 101);
  assert.deepEqual([r.situacao, r.sha_squash], ['ja_integrado', 'abc1234def']);
  assert.equal(c.chamadas().some((x) => x.args[1] === 'merge'), false);

  const q = projeto();
  cenario([...tudo(APROVA).filter((x) => x !== COMENT), { re: '^issue comment', stderr: 'HTTP 502', code: 1 }]);
  assert.throws(() => cardMerge(q.dir, ficha(), 101, { esperaMs: 0 }), (e) => e.codigo === 'REDE');
  assert.equal(q.lerEstado().merge_pendente.efeitos.merge, true);
  const c3 = cenario([SHA, DEL, COMENT]);
  assert.equal(cardMerge(q.dir, ficha(), 101).situacao, 'integrado');
  assert.equal(c3.chamadas().some((x) => x.args[1] === 'merge'), false);
  assert.equal(c3.chamadas().filter((x) => x.args[0] === 'issue').length, 1);
});

test('card-merge: árvore suja não troca de branch (aviso); token do agente no merge', async () => {
  const { cardMerge } = await imp('merge.mjs');
  const { usarTokenAgente } = await imp('gh.mjs');
  const p = projeto();
  fs.writeFileSync(path.join(p.dir, 'rascunho.txt'), 'z');
  const c = cenario(tudo(APROVA));
  usarTokenAgente('tok-agente');
  let r;
  try {
    r = cardMerge(p.dir, ficha(), 101, { esperaMs: 0 });
  } finally {
    usarTokenAgente(null);
  }
  assert.ok(r.avisos.includes('ARVORE_SUJA'));
  assert.equal(p.g('branch', '--show-current'), 'feature/101-carga');
  assert.equal(c.chamadas().find((x) => x.args[1] === 'merge').gh_token, 'tok-agente');
});

const CLI = path.join(REPO, 'scripts', 'github-setup.mjs');
function cli(cwd, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: process.env });
  return { code: r.status, json: r.stdout.trim() ? JSON.parse(r.stdout) : null, stderr: r.stderr };
}

test('CLI: card-merge e --confirmo-merge-chat', async () => {
  const p = projeto();
  fs.writeFileSync(path.join(p.dir, '.agentic-os/governanca.json'), JSON.stringify(ficha({ aprovacao_pelo_chat: true })));
  cenario([ITEM('Em validação'), USER]);
  const r = cli(p.dir, ['card-merge', '101', '--confirmo-merge-chat']);
  assert.equal(r.code, 2, r.stderr);
  assert.equal(r.json.erro.codigo, 'CARTAO_FORA_DE_APROVADO');
  assert.equal(cli(p.dir, ['card-merge', '101', '--confirmo-merge']).json.erro.codigo, 'PARAMETRO');
});

test('card-merge: nunca apaga a branch principal', async () => {
  const { cardMerge } = await imp('merge.mjs');
  const p = projeto({ branch: 'main' });
  cenario([ITEM(), PRV({ state: 'MERGED', headRefName: 'main' }), SHA, COMENT]);
  assert.throws(() => cardMerge(p.dir, ficha(), 101), (e) => e.codigo === 'TRAVA');
});
