// Testes da Parte 3 (HOM e assinatura). Rodar: node --test scripts/tests/hom.test.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hom-'));
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
    colunas: { backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em andamento', em_validacao: 'Em validação', aprovado: 'Aprovado', concluido: 'Concluído', bloqueado: 'Bloqueado' },
    colunas_ids: { a_fazer: 'o2', em_andamento: 'o3', em_validacao: 'o4', aprovado: 'o5' },
    analistas: ['analista'], ambientes: { hom: 'hom', prd: 'prd' },
    prefixos_branch: { feature: 'feature/', fix: 'fix/' },
    aceitar_protecao_parcial: false, protecao_aplicada: null,
    comando_testes: 'node -e "process.exit(0)"',
    deploy_hom: 'node -e "require(\'fs\').writeFileSync(\'hom-publicado.txt\',\'ok\');console.log(\'SEGREDO_DO_LOG\')"',
    migracao_hom: null, testes_hom: null, url_hom: 'https://hom.exemplo.com', limite_hom_min: 30,
    ...extra,
  };
}

// Projeto com origin (bare), branch feature/101-carga, TASK, proposal com critérios e revisão válida do Supervisor.
function projeto() {
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
  fs.writeFileSync(path.join(dir, '.gitignore'), '.agentic-os/supervisor/\n.agentic-os/hom/\nhom-publicado.txt\n');
  g('add', '.');
  g('commit', '-qm', 'init');
  g('remote', 'add', 'origin', bare);
  g('push', '-q', 'origin', 'main');
  g('fetch', '-q', 'origin');
  g('switch', '-q', '--no-track', '-c', 'feature/101-carga', 'origin/main');
  fs.mkdirSync(path.join(dir, 'docs', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/tasks/TASK-101-carga.md'), '# TASK-101\n\n## Plano\nx\n\n## Histórico\n- início\n');
  fs.mkdirSync(path.join(dir, 'changes', '101-carga'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'changes/101-carga/proposal.md'), '# Carga\n\n## Critérios de aceite\n- Importa CSV com 3 colunas\n- Rejeita linha sem CNPJ\n');
  g('add', '.');
  g('commit', '-qm', 'feat: carga');
  const commit = g('rev-parse', 'HEAD');
  const crit = [{ id: 'C1', texto: 'x', status: 'atendido', prova: 'ok' }];
  fs.mkdirSync(path.join(dir, '.agentic-os', 'supervisor'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.agentic-os/supervisor/101.json'), JSON.stringify({
    id: 101, rodada: 1, ciclo: 1, situacao: 'pronto_para_pr', pendente: null, decisoes: [],
    historico: [{ rodada: 1, ciclo: 1, commit, nota: 10, em: 'x', criterios: crit }],
    valida: { commit, nota: 10, tipo: 'nota_10', rodada: 1, ciclo: 1 },
  }));
  return { dir, g, head: () => g('rev-parse', 'HEAD'), shaBare: (ref) => spawnSync('git', ['rev-parse', ref], { cwd: bare, encoding: 'utf8' }).stdout.trim() };
}

test('executar: sucesso, falha, tempo esgotado', async () => {
  const { executar } = await imp('executar.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'ex-'));
  const a = executar(dir, 'node -e "console.log(\'oi\')"', 60000);
  assert.equal(a.ok, true);
  assert.match(a.saida, /oi/);
  const b = executar(dir, 'node -e "process.exit(4)"', 60000);
  assert.deepEqual([b.ok, b.codigo], [false, 4]);
  const c = executar(dir, 'node -e "setTimeout(()=>{},5000)"', 300);
  assert.deepEqual([c.ok, c.tempo_esgotado], [false, true]);
});

test('gh: trava escrita em reviews/merge e pr review|merge|close; GET passa', async () => {
  const { gh } = await imp('gh.mjs');
  cenario([ok('^api repos/d/a/pulls/7/reviews', [])]);
  const trava = (args) => assert.throws(() => gh(args), (e) => e.codigo === 'TRAVA', args.join(' '));
  trava(['api', '-X', 'POST', 'repos/d/a/pulls/7/reviews']);
  trava(['api', '--method', 'PUT', 'repos/d/a/pulls/7/merge']);
  trava(['api', 'repos/d/a/pulls/7/reviews', '-f', 'event=APPROVE']);
  trava(['api', 'repos/d/a/pulls/7/reviews/1/dismissals', '-X', 'PUT']);
  trava(['pr', 'review', '7', '--approve']);
  trava(['pr', 'merge', '7']);
  trava(['pr', 'close', '7']);
  assert.equal(gh(['api', 'repos/d/a/pulls/7/reviews?per_page=100']).code, 0);
});

test('ficha padrão: campos HOM; erros novos existem', async () => {
  const { fichaPadrao } = await imp('ficha.mjs');
  const f = fichaPadrao();
  assert.deepEqual([f.deploy_hom, f.migracao_hom, f.testes_hom, f.url_hom, f.limite_hom_min], [null, null, null, null, 30]);
  const { ERROS } = await imp('erros.mjs');
  for (const c of ['SEM_PR', 'HOM_OCUPADO', 'MIGRACAO_NAO_AUTORIZADA', 'COMANDO_SUSPEITO_PRD', 'SEM_HOM', 'HOM_FALHOU', 'ASSINATURA_DE_OUTRO_COMMIT']) assert.ok(ERROS[c], c);
});

test('cartão: registrarSecao troca/insere; anexarNaSecao acumula; CRLF preservado', async () => {
  const { registrarSecao, anexarNaSecao } = await imp('cartao.mjs');
  const t = '# T\n\n## Plano\nx\n\n## Histórico\n- a\n';
  const um = registrarSecao(t, 'Homologação', '## Homologação\n\n- 1');
  assert.match(um, /## Homologação\n\n- 1\n\n## Histórico/);
  assert.equal(registrarSecao(um, 'Homologação', '## Homologação\n\n- 2').match(/## Homologação/g).length, 1);
  const dois = anexarNaSecao(um, 'Homologação', '- 2');
  assert.match(dois, /## Homologação\n\n- 1\n- 2\n\n## Histórico/);
  assert.match(anexarNaSecao(t, 'Homologação', '- novo'), /## Homologação\n\n- novo\n/);
  const crlf = anexarNaSecao(um.replace(/\n/g, '\r\n'), 'Homologação', '- 3');
  assert.match(crlf, /- 1\r\n- 3\r\n/);
});

const ITEM = ok('^project item-list 3', { items: [{ id: 'ITEM_101', status: 'Em andamento', content: { type: 'Issue', number: 101, title: 'Carga', repository: 'dono/app' } }] });
const PR = ok('^pr list', [{ number: 7, url: 'https://github.com/dono/app/pull/7' }]);
const SEM_DEPLOY = ok('^api repos/dono/app/deployments\\?environment=hom', []);
const CRIA = ok('^api -X POST repos/dono/app/deployments --input', { id: 55, sha: 'x', created_at: '2026-11-04T10:00:00Z' });
const STATUS = ok('^api -X POST repos/dono/app/deployments/\\d+/statuses', {});
const base = [ITEM, PR, SEM_DEPLOY, CRIA, STATUS, ok('^project item-edit', '{}'), ok('^pr comment', '')];
const statusDe = (c) => c.chamadas().filter((x) => /statuses/.test(x.args.join(' ')) && x.input).map((x) => JSON.parse(x.input).state);

test('card-hom: commita Homologação no TASK antes, publica, Em validação, instruções sem saída do comando', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  const c = cenario(base);
  const r = cardHom(p.dir, ficha(), 101);
  assert.equal(r.sha, p.head());
  assert.equal(p.g('log', '-1', '--format=%s'), 'docs(task): TASK-101 homologacao');
  assert.equal(p.shaBare('feature/101-carga'), p.head());
  assert.ok(fs.existsSync(path.join(p.dir, 'hom-publicado.txt')));
  assert.deepEqual(statusDe(c), ['in_progress', 'success']);
  const criar = c.chamadas().find((x) => /deployments --input/.test(x.args.join(' ')));
  assert.deepEqual(JSON.parse(criar.input).payload, { cartao: 101, pr: 7 });
  assert.equal(JSON.parse(criar.input).ref, p.head());
  const edit = c.chamadas().find((x) => x.args[1] === 'item-edit');
  assert.equal(edit.args[edit.args.indexOf('--single-select-option-id') + 1], 'o4');
  const com = c.chamadas().find((x) => x.args[0] === 'pr' && x.args[1] === 'comment');
  assert.match(com.body_file, /Importa CSV com 3 colunas[\s\S]*Rejeita linha sem CNPJ/);
  assert.match(com.body_file, /https:\/\/hom\.exemplo\.com/);
  assert.doesNotMatch(com.body_file, /SEGREDO_DO_LOG/);
  assert.match(fs.readFileSync(path.join(p.dir, '.agentic-os/hom/101.log'), 'utf8'), /SEGREDO_DO_LOG/);
  const est = JSON.parse(fs.readFileSync(path.join(p.dir, '.agentic-os/hom/101.json'), 'utf8'));
  assert.deepEqual([est.sha, est.pr.number, est.deploy_id], [p.head(), 7, 55]);
  assert.equal(p.g('status', '--porcelain', '--untracked-files=no'), '');
});

test('card-hom: sem PR, sem revisão, HOM ocupado (e furar fila com motivo)', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  cenario([ok('^pr list', [])]);
  assert.throws(() => cardHom(p.dir, ficha(), 101), (e) => e.codigo === 'SEM_PR');
  const OCUPADO = ok('^api repos/dono/app/deployments\\?environment=hom', [{ id: 9, sha: 'abc1234def', payload: { cartao: 202, pr: 8 } }]);
  const ST9 = ok('^api repos/dono/app/deployments/9/statuses', [{ state: 'success' }]);
  cenario([PR, OCUPADO, ST9]);
  assert.throws(() => cardHom(p.dir, ficha(), 101), (e) => e.codigo === 'HOM_OCUPADO' && /#202/.test(e.message));
  assert.throws(() => cardHom(p.dir, ficha(), 101, { furarFila: true }), (e) => e.codigo === 'PARAMETRO');
  const c = cenario([ITEM, PR, OCUPADO, ST9, CRIA, STATUS, ok('^project item-edit', '{}'), ok('^pr comment', '')]);
  cardHom(p.dir, ficha(), 101, { furarFila: true, motivo: 'urgente' });
  const criar = c.chamadas().find((x) => /deployments --input/.test(x.args.join(' ')));
  assert.deepEqual(JSON.parse(criar.input).payload, { cartao: 101, pr: 7, furou_fila: true, motivo: 'urgente' });
  assert.match(fs.readFileSync(path.join(p.dir, 'docs/tasks/TASK-101-carga.md'), 'utf8'), /Motivo: urgente/);
  fs.rmSync(path.join(p.dir, '.agentic-os/supervisor/101.json'));
  fs.writeFileSync(path.join(p.dir, 'x.txt'), 'x');
  p.g('add', 'x.txt');
  p.g('commit', '-qm', 'x');
  cenario([PR]);
  assert.throws(() => cardHom(p.dir, ficha(), 101), (e) => e.codigo === 'SEM_REVISAO');
});

test('card-hom: migração exige autorização; comando citando prd exige confirmação', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  cenario([PR, SEM_DEPLOY]);
  assert.throws(() => cardHom(p.dir, ficha({ migracao_hom: 'node -e "0"' }), 101), (e) => e.codigo === 'MIGRACAO_NAO_AUTORIZADA');
  assert.throws(() => cardHom(p.dir, ficha({ deploy_hom: 'npm run deploy:prd' }), 101), (e) => e.codigo === 'COMANDO_SUSPEITO_PRD');
  assert.throws(() => cardHom(p.dir, ficha({ ambientes: { hom: 'hom', prd: 'producao' }, testes_hom: 'curl https://producao.x' }), 101), (e) => e.codigo === 'COMANDO_SUSPEITO_PRD');
  const c = cenario(base);
  cardHom(p.dir, ficha({ migracao_hom: 'node -e "0"' }), 101, { migracaoAutorizada: true });
  assert.deepEqual(statusDe(c), ['in_progress', 'success']);
});

test('card-hom: falha numa etapa marca failure e não move o cartão; tempo esgotado; aviso de migração', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  let c = cenario(base);
  assert.throws(() => cardHom(p.dir, ficha({ deploy_hom: 'node -e "process.exit(4)"' }), 101), (e) => e.codigo === 'HOM_FALHOU' && /deploy/.test(e.message));
  assert.deepEqual(statusDe(c), ['in_progress', 'failure']);
  assert.equal(c.chamadas().some((x) => x.args[1] === 'item-edit'), false);
  c = cenario(base);
  assert.throws(() => cardHom(p.dir, ficha({ migracao_hom: 'node -e "process.exit(2)"' }), 101, { migracaoAutorizada: true }), (e) => e.codigo === 'HOM_FALHOU' && /pela metade/.test(e.message));
  c = cenario(base);
  assert.throws(() => cardHom(p.dir, ficha({ deploy_hom: 'node -e "setTimeout(()=>{},5000)"', limite_hom_min: 0.005 }), 101), (e) => e.codigo === 'HOM_FALHOU' && /tempo esgotado/.test(e.message));
});

test('card-hom: modo manual em dois passos; repetir no mesmo commit não duplica deployment nem TASK', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  let c = cenario(base);
  const m = cardHom(p.dir, ficha({ deploy_hom: null }), 101);
  assert.equal(m.modo, 'manual');
  assert.equal(m.sha, p.head());
  assert.equal(c.chamadas().some((x) => /deployments --input/.test(x.args.join(' '))), false);
  const antes = p.head();
  c = cenario(base);
  cardHom(p.dir, ficha({ deploy_hom: null }), 101, { publicadoManual: true });
  assert.equal(p.head(), antes);
  assert.deepEqual(statusDe(c), ['in_progress', 'success']);
  const EXISTE = ok('^api repos/dono/app/deployments\\?environment=hom', [{ id: 55, sha: antes, payload: { cartao: 101, pr: 7 } }]);
  c = cenario([ITEM, PR, EXISTE, ok('^api repos/dono/app/deployments/55/statuses$|statuses\\?per_page', [{ state: 'success' }]), STATUS, ok('^project item-edit', '{}'), ok('^pr comment', '')]);
  cardHom(p.dir, ficha({ deploy_hom: null }), 101, { publicadoManual: true });
  assert.equal(c.chamadas().some((x) => /deployments --input/.test(x.args.join(' '))), false);
  assert.equal(c.chamadas().some((x) => x.args[1] === 'comment'), false);
});

test('card-hom: --dry-run não muda nada', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  const antes = p.head();
  const c = cenario([PR, SEM_DEPLOY]);
  const r = cardHom(p.dir, ficha(), 101, { dryRun: true });
  assert.equal(r.dry_run, true);
  assert.equal(p.head(), antes);
  assert.equal(c.chamadas().some((x) => x.args.includes('-X')), false);
});

const rv = (login, state, commit_id, submitted_at, body = '', id = Math.random()) => ({
  id, user: { login }, state, commit_id, submitted_at, body, html_url: `https://github.com/dono/app/pull/7#review-${login}-${submitted_at}`,
});

test('decidir: última review por analista; dismissed, não analista e agente não valem; commit e data', async () => {
  const { decidir } = await imp('assinatura.mjs');
  const base = { analistas: ['Analista', 'outra'], agente: 'agente', sha: 's2', desde: '2026-11-04T10:00:00Z' };
  const d = (reviews) => decidir({ ...base, reviews }).situacao;
  assert.equal(d([]), 'aguardando');
  assert.equal(d([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z')]), 'aprovado');
  assert.equal(d([rv('analista', 'APPROVED', 's2', '2026-11-04T09:00:00Z')]), 'outro_commit');
  assert.equal(d([rv('analista', 'APPROVED', 's1', '2026-11-04T11:00:00Z')]), 'outro_commit');
  assert.equal(d([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z'), rv('analista', 'CHANGES_REQUESTED', 's2', '2026-11-04T12:00:00Z')]), 'reprovado');
  assert.equal(d([rv('analista', 'CHANGES_REQUESTED', 's2', '2026-11-04T11:00:00Z'), rv('analista', 'APPROVED', 's2', '2026-11-04T12:00:00Z')]), 'aprovado');
  assert.equal(d([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z'), rv('analista', 'DISMISSED', 's2', '2026-11-04T12:00:00Z')]), 'aguardando');
  assert.equal(d([rv('estranho', 'APPROVED', 's2', '2026-11-04T11:00:00Z')]), 'aguardando');
  assert.equal(decidir({ ...base, analistas: ['agente'], reviews: [rv('agente', 'APPROVED', 's2', '2026-11-04T11:00:00Z')] }).situacao, 'aguardando');
  assert.equal(d([rv('analista', 'COMMENTED', 's2', '2026-11-04T11:00:00Z')]), 'aguardando');
  assert.equal(d([rv('outra', 'CHANGES_REQUESTED', 's1', '2026-11-04T11:00:00Z'), rv('analista', 'APPROVED', 's2', '2026-11-04T11:30:00Z')]), 'aprovado');
});

function estadoHom(dir, extra = {}) {
  fs.mkdirSync(path.join(dir, '.agentic-os', 'hom'), { recursive: true });
  const e = { id: 101, sha: 's2', pr: { number: 7, url: 'https://github.com/dono/app/pull/7' }, deploy_id: 55, em: '2026-11-04T10:00:00Z', branch: 'feature/101-carga', comentado: true, assinatura: null, reprovacoes: [], ...extra };
  fs.writeFileSync(path.join(dir, '.agentic-os/hom/101.json'), JSON.stringify(e));
}
const REVIEWS = (lista) => ok('^api --paginate --slurp repos/dono/app/pulls/7/reviews', [lista]);
const DEP_OK = ok('^api repos/dono/app/deployments/55/statuses', [{ state: 'success' }]);
const PRVIEW = (extra = {}) => ok('^pr view', { body: 'Cartão #101\n\n## Supervisor\nnota', state: 'OPEN', headRefOid: 's2', ...extra });
const assinaturaBase = (lista) => [ok('^api user$', { login: 'agente' }), REVIEWS(lista), ITEM, ok('^project item-edit', '{}'),
  PRVIEW(), DEP_OK, ok('^pr edit', ''), STATUS, ok('^issue comment', '')];

test('card-sign: aprovado grava assinatura no corpo do PR, Aprovado, libera HOM; sem commit; idempotente', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  estadoHom(p.dir);
  const antes = p.head();
  const c = cenario(assinaturaBase([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z', 'Tudo ok no HOM')]));
  const r = cardSign(p.dir, ficha(), 101);
  assert.equal(r.situacao, 'aprovado');
  assert.equal(p.head(), antes);
  const edit = c.chamadas().find((x) => x.args[0] === 'pr' && x.args[1] === 'edit');
  for (const t of ['## Assinatura', '## Supervisor', 'analista', '2026-11-04T11:00:00Z', 's2', 'hom', 'aprovado', '#review-analista', 'Tudo ok no HOM'])
    assert.ok(edit.body_file.includes(t), t);
  const ie = c.chamadas().find((x) => x.args[1] === 'item-edit');
  assert.equal(ie.args[ie.args.indexOf('--single-select-option-id') + 1], 'o5');
  assert.deepEqual(statusDe(c), ['inactive']);
  assert.equal(c.chamadas().some((x) => /reviews/.test(x.args.join(' ')) && (x.args.includes('-X') || x.args.includes('--input'))), false);
  const c2 = cenario([]);
  assert.equal(cardSign(p.dir, ficha(), 101).ja_registrado, true);
  assert.equal(c2.chamadas().length, 0);
});

test('card-sign: reprovado atualiza TASK no disco (sem commit), volta Em andamento, libera HOM, devolve pontos', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  estadoHom(p.dir);
  const antes = p.head();
  const c = cenario(assinaturaBase([rv('analista', 'CHANGES_REQUESTED', 's2', '2026-11-04T11:00:00Z', 'CSV com 4 colunas quebra')]));
  const r = cardSign(p.dir, ficha(), 101);
  assert.equal(r.situacao, 'reprovado');
  assert.equal(r.pontos, 'CSV com 4 colunas quebra');
  assert.equal(p.head(), antes);
  assert.match(fs.readFileSync(path.join(p.dir, 'docs/tasks/TASK-101-carga.md'), 'utf8'), /## Homologação[\s\S]*REPROVADO por analista[\s\S]*CSV com 4 colunas quebra/);
  const ie = c.chamadas().find((x) => x.args[1] === 'item-edit');
  assert.equal(ie.args[ie.args.indexOf('--single-select-option-id') + 1], 'o3');
  assert.deepEqual(statusDe(c), ['inactive']);
  const c2 = cenario([ok('^api user$', { login: 'agente' }), REVIEWS([rv('analista', 'CHANGES_REQUESTED', 's2', '2026-11-04T11:00:00Z', 'CSV com 4 colunas quebra')])]);
  assert.equal(cardSign(p.dir, ficha(), 101).ja_registrado, true);
  assert.equal(c2.chamadas().some((x) => x.args[1] === 'item-edit'), false);
});

test('card-sign: sem HOM, aguardando, aprovação de outro commit', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  cenario([]);
  assert.throws(() => cardSign(p.dir, ficha(), 101), (e) => e.codigo === 'SEM_HOM');
  estadoHom(p.dir);
  cenario([ok('^api user$', { login: 'agente' }), REVIEWS([])]);
  assert.equal(cardSign(p.dir, ficha(), 101).situacao, 'aguardando_analista');
  cenario([ok('^api user$', { login: 'agente' }), REVIEWS([rv('analista', 'APPROVED', 's1', '2026-11-04T11:00:00Z')])]);
  assert.throws(() => cardSign(p.dir, ficha(), 101), (e) => e.codigo === 'ASSINATURA_DE_OUTRO_COMMIT');
});

const CLI = path.join(REPO, 'scripts', 'github-setup.mjs');
function cli(cwd, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: process.env });
  return { code: r.status, json: r.stdout.trim() ? JSON.parse(r.stdout) : null, stderr: r.stderr };
}

test('CLI: card-hom --dry-run e card-sign; flags booleanas novas', async () => {
  const p = projeto();
  fs.mkdirSync(path.join(p.dir, '.agentic-os'), { recursive: true });
  fs.writeFileSync(path.join(p.dir, '.agentic-os/governanca.json'), JSON.stringify(ficha()));
  p.g('add', '.agentic-os/governanca.json');
  p.g('commit', '-qm', 'ficha');
  // a ficha entrou depois da revisão: refaz o estado válido para o HEAD
  const sup = JSON.parse(fs.readFileSync(path.join(p.dir, '.agentic-os/supervisor/101.json'), 'utf8'));
  sup.valida.commit = p.head();
  sup.historico[0].commit = p.head();
  fs.writeFileSync(path.join(p.dir, '.agentic-os/supervisor/101.json'), JSON.stringify(sup));
  cenario([PR, SEM_DEPLOY, ok('^api user$', { login: 'agente' })]);
  const dry = cli(p.dir, ['card-hom', '101', '--dry-run', '--migracao-autorizada', '--confirmo-comando']);
  assert.equal(dry.code, 0, dry.stderr);
  assert.equal(dry.json.dry_run, true);
  const sem = cli(p.dir, ['card-sign', '101']);
  assert.equal(sem.code, 2);
  assert.equal(sem.json.erro.codigo, 'SEM_HOM');
  assert.equal(cli(p.dir, ['card-hom', '101', '--furar-fila', '--motivo', '--dry-run']).json.erro.codigo, 'PARAMETRO');
});

// ---------- correções da revisão ----------

test('gh trava: flags globais, métodos colados, merges, graphql; chamadas legítimas passam', async () => {
  const { verificarChamada } = await imp('gh.mjs');
  const trava = (args, input) => assert.throws(() => verificarChamada(args, input), (e) => e.codigo === 'TRAVA', args.join(' '));
  trava(['-R', 'd/a', 'pr', 'merge', '7']);
  trava(['pr', '--repo', 'd/a', 'close', '7']);
  trava(['--repo=d/a', 'pr', 'review', '7']);
  trava(['api', '-XPOST', 'repos/d/a/pulls/7/reviews']);
  trava(['api', '--method=PUT', 'repos/d/a/pulls/7/merge']);
  trava(['api', 'repos/d/a/pulls/7/reviews', '-fevent=APPROVE']);
  trava(['api', 'repos/d/a/pulls/7/reviews', '-Fx=y']);
  trava(['api', 'repos/d/a/pulls/7/reviews', '--field=x=y']);
  trava(['api', '-X', 'POST', 'repos/d/a/merges']);
  trava(['api', 'repos/d/a/merges', '-f', 'base=main']);
  trava(['api', 'graphql', '-f', 'query=mutation { mergePullRequest(input:{}) { clientMutationId } }']);
  trava(['api', 'graphql', '--input', '-'], '{"query":"mutation { addPullRequestReview(input:{}) { pullRequestReview { id } } }"}');
  trava(['api', 'graphql', '-f', 'query=mutation { closePullRequest(input:{}) { clientMutationId } }']);
  for (const ok_ of [
    ['pr', 'create', '--repo', 'd/a', '--title', 't'], ['pr', 'edit', 'u', '--repo', 'd/a'], ['pr', 'comment', 'u'], ['pr', 'list', '--repo', 'd/a'],
    ['pr', 'view', 'u', '--json', 'state'], ['issue', 'comment', '1', '--body', 'pr merge'], ['project', 'item-list', '3'],
    ['api', 'repos/d/a/pulls/7/reviews'], ['api', '--paginate', '--slurp', 'repos/d/a/pulls/7/reviews?per_page=100'],
    ['api', '-X', 'POST', 'repos/d/a/deployments/5/statuses', '--input', '-'],
    ['api', 'graphql', '-f', 'query=query { viewer { login } }'],
    ['api', 'graphql', '-f', 'query=mutation { updateProjectV2ItemFieldValue(input:{}) { clientMutationId } }'],
  ]) assert.doesNotThrow(() => verificarChamada(ok_, ''), ok_.join(' '));
});

test('card-hom: push do commit da Homologação que falhou antes é reenviado no retry', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  const t = path.join(p.dir, 'docs/tasks/TASK-101-carga.md');
  fs.writeFileSync(t, fs.readFileSync(t, 'utf8').replace('## Histórico', '## Homologação\n\n- local\n\n## Histórico'));
  p.g('add', 'docs/tasks/TASK-101-carga.md');
  p.g('commit', '-qm', 'docs(task): TASK-101 homologacao');
  const local = p.head();
  assert.notEqual(p.shaBare('feature/101-carga'), local);
  cenario(base);
  cardHom(p.dir, ficha(), 101);
  assert.equal(p.head(), local);
  assert.equal(p.shaBare('feature/101-carga'), local);
});

test('card-hom: HOM_FALHOU traz campos estruturados', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  cenario(base);
  try {
    cardHom(p.dir, ficha({ deploy_hom: 'node -e "process.exit(4)"' }), 101);
    assert.fail('deveria falhar');
  } catch (e) {
    assert.deepEqual(e.extra, { etapa: 'deploy', codigo_saida: 4, tempo_esgotado: false, aviso_migracao: false });
  }
  cenario(base);
  try {
    cardHom(p.dir, ficha({ migracao_hom: 'node -e "process.exit(2)"' }), 101, { migracaoAutorizada: true });
    assert.fail('deveria falhar');
  } catch (e) {
    assert.deepEqual([e.extra.etapa, e.extra.aviso_migracao], ['migracao', true]);
  }
});

test('card-hom: deployment em andamento de outro cartão ocupa o HOM (se recente)', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  const dep = (criado) => ok('^api repos/dono/app/deployments\\?environment=hom', [{ id: 9, sha: 'abc1234def', created_at: criado, payload: { cartao: 202, pr: 8 } }]);
  const ST = ok('^api repos/dono/app/deployments/9/statuses', [{ state: 'in_progress' }]);
  cenario([PR, dep(new Date().toISOString()), ST]);
  assert.throws(() => cardHom(p.dir, ficha(), 101), (e) => e.codigo === 'HOM_OCUPADO' && /#202/.test(e.message));
  const c = cenario([ITEM, PR, dep(new Date(Date.now() - 3 * 3600000).toISOString()), ST, CRIA, STATUS, ok('^project item-edit', '{}'), ok('^pr comment', '')]);
  cardHom(p.dir, ficha(), 101);
  assert.deepEqual(statusDe(c), ['in_progress', 'success']);
});

test('card-hom: arquivo novo não ignorado trava (ARVORE_SUJA); estado local não conta', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  cenario([PR, SEM_DEPLOY]);
  fs.writeFileSync(path.join(p.dir, 'lixo.txt'), 'x');
  assert.throws(() => cardHom(p.dir, ficha(), 101, { dryRun: true }), (e) => e.codigo === 'ARVORE_SUJA' && /lixo\.txt/.test(e.message));
  fs.rmSync(path.join(p.dir, 'lixo.txt'));
  assert.equal(cardHom(p.dir, ficha(), 101, { dryRun: true }).dry_run, true);
});

test('card-hom: cartão já aprovado no mesmo commit não republica', async () => {
  const { cardHom } = await imp('hom.mjs');
  const p = projeto();
  cenario(base);
  cardHom(p.dir, ficha(), 101);
  const arq = path.join(p.dir, '.agentic-os/hom/101.json');
  const est = JSON.parse(fs.readFileSync(arq, 'utf8'));
  est.assinatura = { commit: p.head() };
  fs.writeFileSync(arq, JSON.stringify(est));
  const c = cenario([PR]);
  const r = cardHom(p.dir, ficha(), 101);
  assert.equal(r.situacao, 'ja_aprovado');
  assert.equal(c.chamadas().some((x) => x.args.includes('-X') || x.args[1] === 'item-edit'), false);
});

test('card-sign: HOM tomado por outro cartão, PR fechado, PR com commit novo', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  estadoHom(p.dir);
  const APR = rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z');
  const cen = (...mais) => cenario([ok('^api user$', { login: 'agente' }), REVIEWS([APR]), ...mais]);
  const c = cen(PRVIEW(), ok('^api repos/dono/app/deployments/55/statuses', [{ state: 'inactive' }]));
  assert.throws(() => cardSign(p.dir, ficha(), 101), (e) => e.codigo === 'SEM_HOM' && /não está mais com este cartão/.test(e.message));
  assert.equal(c.chamadas().some((x) => x.args[1] === 'item-edit' || x.args.includes('-X')), false);
  cen(PRVIEW({ state: 'CLOSED' }), DEP_OK);
  assert.throws(() => cardSign(p.dir, ficha(), 101), (e) => e.codigo === 'SEM_HOM' && /PR fechado/.test(e.message));
  cen(PRVIEW({ headRefOid: 's3' }), DEP_OK);
  assert.throws(() => cardSign(p.dir, ficha(), 101), (e) => e.codigo === 'SEM_HOM' && /commit depois do HOM/.test(e.message));
});

test('card-sign: reprovação interrompida retoma sem duplicar TASK, comentário nem status', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  estadoHom(p.dir);
  const CR = rv('analista', 'CHANGES_REQUESTED', 's2', '2026-11-04T11:00:00Z', 'quebra');
  const falha = { re: '^project item-edit', code: 1, stderr: 'boom' };
  cenario([ok('^api user$', { login: 'agente' }), REVIEWS([CR]), PRVIEW(), DEP_OK, ITEM, falha, STATUS, ok('^issue comment', '')]);
  assert.throws(() => cardSign(p.dir, ficha(), 101), (e) => e.codigo === 'GH_FALHOU');
  const ler = () => fs.readFileSync(path.join(p.dir, 'docs/tasks/TASK-101-carga.md'), 'utf8');
  assert.equal(ler().match(/REPROVADO por/g).length, 1);
  const est = JSON.parse(fs.readFileSync(path.join(p.dir, '.agentic-os/hom/101.json'), 'utf8'));
  assert.equal(est.reprovacoes[0].concluido, false);
  const c = cenario([ok('^api user$', { login: 'agente' }), REVIEWS([CR]), ITEM, ok('^project item-edit', '{}'), STATUS, ok('^issue comment', '')]);
  const r = cardSign(p.dir, ficha(), 101);
  assert.equal(r.situacao, 'reprovado');
  assert.equal(ler().match(/REPROVADO por/g).length, 1);
  assert.equal(c.chamadas().filter((x) => x.args[1] === 'item-edit').length, 1);
  assert.equal(c.chamadas().filter((x) => x.args[1] === 'comment').length, 1);
  assert.deepEqual(statusDe(c), ['inactive']);
  const fim = JSON.parse(fs.readFileSync(path.join(p.dir, '.agentic-os/hom/101.json'), 'utf8'));
  assert.equal(fim.reprovacoes.length, 1);
  assert.equal(fim.reprovacoes[0].concluido, true);
  assert.equal(cardSign(p.dir, ficha(), 101).ja_registrado, true);
});

test('gh trava graphql: flags antes do endpoint, @arquivo, --input=arquivo, enqueue', async () => {
  const { verificarChamada } = await imp('gh.mjs');
  const trava = (args, input) => assert.throws(() => verificarChamada(args, input), (e) => e.codigo === 'TRAVA', args.join(' '));
  const M = 'mutation { mergePullRequest(input:{}) { clientMutationId } }';
  trava(['api', '-X', 'POST', 'graphql', '-f', `query=${M}`]);
  trava(['api', '--method', 'POST', 'graphql', '-f', `query=${M}`]);
  trava(['api', '-H', 'Accept: x', 'graphql', '-f', `query=${M}`]);
  trava(['api', 'graphql', '-f', 'query=mutation { enqueuePullRequest(input:{}) { clientMutationId } }']);
  const arq = path.join(TMP, 'q.graphql');
  fs.writeFileSync(arq, M);
  trava(['api', 'graphql', '-F', `query=@${arq}`]);
  trava(['api', 'graphql', '-f', `query=@${arq}`]);
  trava(['api', 'graphql', `--input=${arq}`]);
  trava(['api', 'graphql', '--input', arq]);
  assert.doesNotThrow(() => verificarChamada(['api', '-H', 'Accept: x', 'graphql', '-f', 'query=query { viewer { login } }'], ''));
});

test('card-sign: aprovação interrompida (falha no status inactive) retoma sem duplicar', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  estadoHom(p.dir);
  const APR = rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z', 'ok');
  const falha = { re: '^api -X POST repos/dono/app/deployments/\\d+/statuses', code: 1, stderr: 'boom' };
  cenario([ok('^api user$', { login: 'agente' }), REVIEWS([APR]), PRVIEW(), DEP_OK, ITEM, ok('^project item-edit', '{}'), ok('^pr edit', ''), ok('^issue comment', ''), falha]);
  assert.throws(() => cardSign(p.dir, ficha(), 101), (e) => e.codigo === 'GH_FALHOU');
  const est = JSON.parse(fs.readFileSync(path.join(p.dir, '.agentic-os/hom/101.json'), 'utf8'));
  assert.equal(est.assinatura, null);
  assert.deepEqual(Object.keys(est.assinatura_pendente.efeitos).sort(), ['comentario', 'mover', 'pr']);
  // retry: deploy já pode estar inactive; sem rechecar status nem PR, sem repetir PR/mover/comentário
  const c = cenario([ok('^api user$', { login: 'agente' }), REVIEWS([APR]), ITEM, STATUS]);
  const r = cardSign(p.dir, ficha(), 101);
  assert.equal(r.situacao, 'aprovado');
  assert.deepEqual(c.chamadas().filter((x) => /item-edit|pr edit|issue comment|pr view/.test(x.args.join(' '))), []);
  assert.deepEqual(statusDe(c), ['inactive']);
  const fim = JSON.parse(fs.readFileSync(path.join(p.dir, '.agentic-os/hom/101.json'), 'utf8'));
  assert.equal(fim.assinatura.commit, 's2');
  assert.equal(fim.assinatura_pendente, undefined);
});

test('log do HOM não rastreado e não ignorado não bloqueia review-check nem card-pr', async () => {
  const { checagensBase } = await imp('supervisor.mjs');
  const { cardPr } = await imp('cartao.mjs');
  const p = projeto();
  fs.writeFileSync(path.join(p.dir, '.gitignore'), 'hom-publicado.txt\n');
  p.g('add', '.gitignore');
  p.g('commit', '-qm', 'gitignore sem hom');
  fs.mkdirSync(path.join(p.dir, '.agentic-os', 'hom'), { recursive: true });
  fs.writeFileSync(path.join(p.dir, '.agentic-os/hom/101.log'), 'log');
  assert.equal(p.g('status', '--porcelain', '--untracked-files=all').includes('.agentic-os/hom'), true);
  assert.doesNotThrow(() => checagensBase(p.dir, ficha(), 101));
  const sup = JSON.parse(fs.readFileSync(path.join(p.dir, '.agentic-os/supervisor/101.json'), 'utf8'));
  sup.valida.commit = p.head();
  sup.historico[0].commit = p.head();
  fs.writeFileSync(path.join(p.dir, '.agentic-os/supervisor/101.json'), JSON.stringify(sup));
  cenario([ITEM, ok('^pr list', [])]);
  assert.equal(cardPr(p.dir, ficha(), 101, { dryRun: true }).dry_run, true);
  fs.writeFileSync(path.join(p.dir, 'lixo.txt'), 'x');
  assert.throws(() => cardPr(p.dir, ficha(), 101, { dryRun: true }), (e) => e.codigo === 'ARVORE_SUJA' && /lixo\.txt/.test(e.message));
});

const chatBase = (lista = []) => [ok('^api user$', { login: 'analista' }), REVIEWS(lista), ITEM, ok('^project item-edit', '{}'),
  PRVIEW(), DEP_OK, ok('^pr edit', ''), STATUS, ok('^issue comment', '')];

test('card-sign: registro da review traz Tipo "review no GitHub"', async () => {
  const { textoAssinatura } = await imp('assinatura.mjs');
  const t = textoAssinatura({ cartao: 1, repo: 'dono/app', pr: 'u', analista: 'analista', em: 'x', commit: 's', ambiente: 'hom', resultado: 'aprovado', evidencia: 'e', texto: '' });
  assert.match(t, /\| Tipo \| review no GitHub \|/);
  assert.doesNotMatch(t, /Declarado por/);
});

test('card-sign --pelo-chat: desligado, parâmetros, review vence, aprovado e reprovado com registro de prova fraca', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  estadoHom(p.dir);
  cenario([]);
  const chat = { peloChat: true, resultado: 'aprovado', frase: 'aprovo o cartão 101' };
  assert.throws(() => cardSign(p.dir, ficha(), 101, chat), (e) => e.codigo === 'CHAT_DESLIGADO');
  const fc = ficha({ analistas: ['analista'], aprovacao_pelo_chat: true });
  assert.throws(() => cardSign(p.dir, fc, 101, { ...chat, resultado: 'talvez' }), (e) => e.codigo === 'PARAMETRO');
  assert.throws(() => cardSign(p.dir, fc, 101, { ...chat, frase: '  ' }), (e) => e.codigo === 'PARAMETRO');
  cenario(chatBase([rv('outra', 'APPROVED', 's2', '2026-11-04T11:00:00Z')]));
  assert.throws(() => cardSign(p.dir, ficha({ analistas: ['analista', 'outra'], aprovacao_pelo_chat: true }), 101, chat), (e) => e.codigo === 'JA_HA_REVIEW');

  const c = cenario(chatBase());
  const r = cardSign(p.dir, fc, 101, chat);
  assert.deepEqual([r.situacao, r.tipo], ['aprovado', 'chat, sem prova do GitHub']);
  const edit = c.chamadas().find((x) => x.args[0] === 'pr' && x.args[1] === 'edit');
  for (const t of ['| Tipo | chat, sem prova do GitHub |', '| Declarado por | analista da ficha (não autenticado) |', '| Frase | "aprovo o cartão 101" |', 'analista (declarado)'])
    assert.ok(edit.body_file.includes(t), t);
  const com = c.chamadas().find((x) => x.args[0] === 'issue');
  assert.match(com.args.join(' '), /pelo chat \(sem prova do GitHub\)/);
  assert.deepEqual(statusDe(c), ['inactive']);
  assert.equal(cardSign(p.dir, fc, 101, chat).ja_registrado, true);

  const p2 = projeto();
  estadoHom(p2.dir);
  const c2 = cenario(chatBase());
  const r2 = cardSign(p2.dir, fc, 101, { peloChat: true, resultado: 'reprovado', frase: 'reprovo: o filtro | quebra' });
  assert.equal(r2.situacao, 'reprovado');
  assert.equal(r2.pontos, 'reprovo: o filtro | quebra');
  assert.match(fs.readFileSync(path.join(p2.dir, 'docs/tasks/TASK-101-carga.md'), 'utf8'), /REPROVADO por analista \(declarado\), pelo chat \(sem prova do GitHub\)/);
  const ie = c2.chamadas().find((x) => x.args[1] === 'item-edit');
  assert.equal(ie.args[ie.args.indexOf('--single-select-option-id') + 1], 'o3');
});

test('card-sign --pelo-chat: aprovação interrompida retoma sem duplicar', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  estadoHom(p.dir);
  const fc = ficha({ aprovacao_pelo_chat: true });
  const chat = { peloChat: true, resultado: 'aprovado', frase: 'aprovo' };
  cenario([...chatBase().filter((x) => x !== STATUS), { re: '^api -X POST repos/dono/app/deployments/\\d+/statuses', stderr: 'HTTP 502', code: 1 }]);
  assert.throws(() => cardSign(p.dir, fc, 101, chat), (e) => e.codigo === 'REDE');
  const c = cenario(chatBase());
  assert.equal(cardSign(p.dir, fc, 101, chat).situacao, 'aprovado');
  assert.equal(c.chamadas().some((x) => x.args[0] === 'pr' && x.args[1] === 'edit'), false);
  assert.deepEqual(statusDe(c), ['inactive']);
});

test('card-sign: com identidade do agente e gh local = analista, a review é registrada com aviso', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const { ativarIdentidade, desativarIdentidade } = await imp('identidade.mjs');
  const p = projeto();
  estadoHom(p.dir);
  process.env.TESTE_TOKEN_SIGN = 'tok_s';
  const f = ficha({ identidade_agente: { modo: 'token', token_env: 'TESTE_TOKEN_SIGN' } });
  const c = cenario([{ ...ok('^api user$', { login: 'robo' }), token: 'tok_s' }, ok('^api user$', { login: 'analista' }),
    ...assinaturaBase([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z')]).slice(1)]);
  ativarIdentidade(f);
  const r = cardSign(p.dir, f, 101);
  desativarIdentidade();
  delete process.env.TESTE_TOKEN_SIGN;
  assert.deepEqual([r.situacao, r.aviso], ['aprovado', 'GH_LOCAL_E_ANALISTA']);
  const edit = c.chamadas().find((x) => x.args[0] === 'pr' && x.args[1] === 'edit');
  assert.ok(edit.body_file.includes('| Tipo | review no GitHub ⚠️ gh local = analista |'));
});

test('card-sign: gh local deslogado com identidade do agente não vira erro nem aviso', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const { ativarIdentidade, desativarIdentidade } = await imp('identidade.mjs');
  const p = projeto();
  estadoHom(p.dir);
  process.env.TESTE_TOKEN_SIGN2 = 'tok_s2';
  const f = ficha({ identidade_agente: { modo: 'token', token_env: 'TESTE_TOKEN_SIGN2' } });
  const c = cenario([{ ...ok('^api user$', { login: 'robo' }), token: 'tok_s2' }, { re: '^api user$', stderr: 'gh auth login', code: 1 },
    ...assinaturaBase([rv('analista', 'APPROVED', 's2', '2026-11-04T11:00:00Z')]).slice(1)]);
  ativarIdentidade(f);
  const r = cardSign(p.dir, f, 101);
  desativarIdentidade();
  delete process.env.TESTE_TOKEN_SIGN2;
  assert.equal(r.situacao, 'aprovado');
  assert.equal(r.aviso, undefined);
  const edit = c.chamadas().find((x) => x.args[0] === 'pr' && x.args[1] === 'edit');
  assert.ok(edit.body_file.includes('| Tipo | review no GitHub |'));
});

const PENDENTE_CHAT = { tipo: 'chat, sem prova do GitHub', efeitos: { pr: true }, cartao: 101, commit: 's2', em: 'x', analista: 'analista (declarado)', evidencia: 'declaração no chat em x', texto: 'aprovo', resultado: 'aprovado', repo: 'dono/app', pr: 'u', ambiente: 'hom' };

test('card-sign: aprovação pelo chat interrompida não vira aguardando nem aceita reprovação', async () => {
  const { cardSign } = await imp('assinatura.mjs');
  const p = projeto();
  estadoHom(p.dir, { assinatura_pendente: PENDENTE_CHAT });
  cenario(chatBase());
  assert.throws(() => cardSign(p.dir, ficha(), 101), (e) => e.codigo === 'PARAMETRO' && /pelo-chat/.test(e.message));
  const fc = ficha({ aprovacao_pelo_chat: true });
  assert.throws(() => cardSign(p.dir, fc, 101, { peloChat: true, resultado: 'reprovado', frase: 'reprovo' }), (e) => e.codigo === 'PARAMETRO' && /aprovação/.test(e.message));
});

test('CLI: agente = analista bloqueia card-hom e card-sign; chat ligado libera; token do agente chega ao gh', async () => {
  const p = projeto();
  fs.mkdirSync(path.join(p.dir, '.agentic-os'), { recursive: true });
  const gravar = (f) => {
    fs.writeFileSync(path.join(p.dir, '.agentic-os/governanca.json'), JSON.stringify(f));
  };
  gravar(ficha({ analistas: ['agente'] }));
  cenario([PR, SEM_DEPLOY, ok('^api user$', { login: 'agente' })]);
  assert.equal(cli(p.dir, ['card-hom', '101', '--dry-run']).json.erro.codigo, 'IDENTIDADE_IGUAL_ANALISTA');
  assert.equal(cli(p.dir, ['card-sign', '101']).json.erro.codigo, 'IDENTIDADE_IGUAL_ANALISTA');
  gravar(ficha({ analistas: ['agente'], aprovacao_pelo_chat: true }));
  assert.equal(cli(p.dir, ['card-sign', '101', '--pelo-chat', '--resultado', 'aprovado', '--frase', 'aprovo']).json.erro.codigo, 'SEM_HOM');
  p.g('remote', 'set-url', 'origin', 'https://github.com/dono/app.git');
  gravar(ficha({ analistas: ['agente'], identidade_agente: { modo: 'token', token_env: 'TESTE_TOKEN_CLI' } }));
  process.env.TESTE_TOKEN_CLI = 'tok_cli';
  const c = cenario([PR, SEM_DEPLOY, { ...ok('^api user$', { login: 'robo' }), token: 'tok_cli' }]);
  const r = cli(p.dir, ['card-sign', '101']);
  assert.equal(r.json.erro.codigo, 'SEM_HOM');
  assert.ok(c.chamadas().every((x) => x.gh_token === 'tok_cli'));
  assert.doesNotMatch(r.stderr + JSON.stringify(r.json), /tok_cli/);
  delete process.env.TESTE_TOKEN_CLI;
});
