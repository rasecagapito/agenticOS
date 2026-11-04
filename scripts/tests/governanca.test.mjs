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
  assert.equal(cod('gh: Failed to create the environment protection rule. Please ensure the billing plan supports the required reviewers protection rule. (HTTP 422)'), 'PLANO_SEM_PROTECAO');
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

// Repo git temporário. remoto: URL do origin (string) ou null.
function repoGit({ remoto = 'https://github.com/dono/app.git' } = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, 'proj-'));
  const g = (...a) => {
    const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    if (r.status) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  g('add', '.');
  g('commit', '-qm', 'init');
  if (remoto) g('remote', 'add', 'origin', remoto);
  return { dir, g };
}
// Repo com origin real (bare local) para fetch/push.
function repoComBare() {
  const bare = fs.mkdtempSync(path.join(TMP, 'bare-'));
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  const p = repoGit({ remoto: bare });
  p.g('push', '-q', 'origin', 'main');
  const shaBare = (ref) => spawnSync('git', ['rev-parse', ref], { cwd: bare, encoding: 'utf8' }).stdout.trim();
  return { ...p, bare, shaBare };
}

test('nomes: slug, branch e TASK', async () => {
  const { slug, nomeBranch, caminhoTask } = await imp('nomes.mjs');
  assert.equal(slug('Carga de Clientes — Ação!'), 'carga-de-clientes-acao');
  assert.equal(slug('a'.repeat(60)).length, 40);
  const ficha = { prefixos_branch: { feature: 'feature/', fix: 'fix/' } };
  assert.equal(nomeBranch(ficha, 'fix', 102, 'carga-itens'), 'fix/102-carga-itens');
  assert.equal(caminhoTask(101, 'carga-clientes'), 'docs/tasks/TASK-101-carga-clientes.md');
});

test('git: remoto, árvore limpa, branch existe', async () => {
  const { parseRemoto, remotoOrigin, ehRepo, arvoreLimpa, branchExiste } = await imp('git.mjs');
  assert.equal(parseRemoto('https://github.com/dono/app.git'), 'dono/app');
  assert.equal(parseRemoto('git@github.com:dono/app.git'), 'dono/app');
  assert.equal(parseRemoto('https://gitlab.com/dono/app.git'), null);
  const { dir, g } = repoGit();
  assert.equal(ehRepo(dir), true);
  assert.equal(ehRepo(TMP), false);
  assert.equal(remotoOrigin(dir), 'dono/app');
  assert.equal(arvoreLimpa(dir), true);
  fs.writeFileSync(path.join(dir, 'novo.txt'), 'y');
  assert.equal(arvoreLimpa(dir), false);
  g('branch', 'feature/1-x');
  assert.equal(branchExiste(dir, 'feature/1-x'), true);
  assert.equal(branchExiste(dir, 'feature/2-y'), false);
});

test('git: trava — push na branch principal é proibido', async () => {
  const { pushBranch } = await imp('git.mjs');
  const { dir } = repoComBare();
  assert.throws(() => pushBranch(dir, 'main', 'main'), (e) => e.codigo === 'TRAVA');
  assert.throws(() => pushBranch(dir, '', 'main'), (e) => e.codigo === 'TRAVA');
});

const { fichaPadrao } = await imp('ficha.mjs');
function fichaTesteSync(extra = {}) {
  return fichaPadrao({
    repo: 'dono/app',
    project: { owner: 'dono', number: 3, url: 'https://github.com/users/dono/projects/3', id: 'PVT_1', campo_status_id: 'FLD_S' },
    colunas_ids: { a_fazer: 'o2', em_andamento: 'o3' },
    analistas: ['analista'],
    ...extra,
  });
}

test('colunas: faltantes ignoram acento/caixa; mescla preserva existentes; ids por nome', async () => {
  const { COLUNAS_PADRAO, colunasFaltantes, opcoesMescladas, mapearIds } = await imp('colunas.mjs');
  const opcoes = [
    { id: 'o1', name: 'Todo', color: 'GRAY', description: '' },
    { id: 'o2', name: 'a fazer', color: 'BLUE', description: 'd' },
    { id: 'o3', name: 'Em Andamento', color: 'YELLOW', description: '' },
  ];
  const faltam = colunasFaltantes(opcoes, COLUNAS_PADRAO);
  assert.deepEqual(faltam, ['Backlog', 'Em validação', 'Aprovado', 'Concluído', 'Bloqueado']);
  const m = opcoesMescladas(opcoes, faltam);
  assert.equal(m.length, 8);
  assert.deepEqual(m[1], { id: 'o2', name: 'a fazer', color: 'BLUE', description: 'd' }); // id preserva o status dos cartões
  assert.equal(m[7].name, 'Bloqueado');
  const ids = mapearIds(opcoes, COLUNAS_PADRAO);
  assert.equal(ids.a_fazer, 'o2');
  assert.equal(ids.em_andamento, 'o3');
  assert.equal(ids.backlog, null);
});

test('ficha: válida passa; erros e segredo são recusados', async () => {
  const { validarFicha, lerFicha, gravarFicha } = await imp('ficha.mjs');
  const f = fichaTesteSync();
  assert.deepEqual(validarFicha(f), []);
  assert.match(validarFicha({ ...f, repo: 'semdono' }).join(), /dono\/nome/);
  assert.match(validarFicha({ ...f, analistas: [] }).join(), /analistas/);
  assert.match(validarFicha({ ...f, extra: { github_token: 'x' } }).join(), /segredo/);
  const dir = fs.mkdtempSync(path.join(TMP, 'ficha-'));
  gravarFicha(dir, f);
  assert.deepEqual(lerFicha(dir), f);
  fs.writeFileSync(path.join(dir, '.agentic-os', 'governanca.json'), '{');
  assert.throws(() => lerFicha(dir), (e) => e.codigo === 'FICHA_INVALIDA');
});

test('git: parseRemoto ancora o host; gh: REDE não casa "timed out" solto', async () => {
  const { parseRemoto } = await imp('git.mjs');
  const { classificar } = await imp('gh.mjs');
  assert.equal(parseRemoto('https://notgithub.com/o/app'), null);
  assert.equal(parseRemoto('ssh://git@github.com/o/app.git'), 'o/app');
  assert.equal(parseRemoto('https://github.com/o/my.app.git'), 'o/my.app');
  assert.equal(classificar({ stderr: 'dial tcp: lookup api.github.com: no such host' }).codigo, 'REDE');
  assert.equal(classificar({ stderr: 'HTTP 422: Validation Failed: timed out title' }).codigo, 'GH_FALHOU');
});

test('proteção: sem regra atual → alvo completo; diff mostra antes → depois', async () => {
  const { mesclarProtecao, diffProtecao } = await imp('protecao.mjs');
  const corpo = mesclarProtecao(null);
  assert.equal(corpo.enforce_admins, true);
  assert.equal(corpo.allow_force_pushes, false);
  assert.equal(corpo.allow_deletions, false);
  assert.deepEqual(corpo.required_pull_request_reviews, {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
    require_last_push_approval: true,
    required_approving_review_count: 1,
  });
  const diff = diffProtecao(null, corpo);
  assert.ok(diff.includes('PR obrigatório: false → true'));
  assert.ok(diff.includes('Force-push permitido: true → false'));
});

test('proteção: nunca enfraquece regras existentes', async () => {
  const { mesclarProtecao, diffProtecao } = await imp('protecao.mjs');
  const atual = {
    required_status_checks: { strict: true, contexts: ['ci'], checks: [{ context: 'ci', app_id: 15368 }, { context: 'lint', app_id: null }] },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      required_approving_review_count: 2,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      require_last_push_approval: true,
      dismissal_restrictions: { users: [{ login: 'chefe' }], teams: [{ slug: 'time' }], apps: [{ slug: 'bot' }] },
      bypass_pull_request_allowances: { users: [{ login: 'chefe' }], teams: [], apps: [{ slug: 'bot' }] },
    },
    block_creations: { enabled: true },
    allow_fork_syncing: { enabled: true },
    restrictions: { users: [{ login: 'chefe' }], teams: [], apps: [] },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
    lock_branch: { enabled: false },
  };
  const c = mesclarProtecao(atual);
  assert.equal(c.required_pull_request_reviews.required_approving_review_count, 2);
  assert.deepEqual(c.required_status_checks, { strict: true, checks: [{ context: 'ci', app_id: 15368 }, { context: 'lint', app_id: -1 }] });
  assert.deepEqual(c.required_pull_request_reviews.dismissal_restrictions, { users: ['chefe'], teams: ['time'], apps: ['bot'] });
  assert.deepEqual(c.required_pull_request_reviews.bypass_pull_request_allowances, { users: ['chefe'], teams: [], apps: ['bot'] });
  assert.equal(c.block_creations, true);
  assert.equal(c.allow_fork_syncing, true);
  assert.equal('dismissal_restrictions' in mesclarProtecao(null).required_pull_request_reviews, false);
  assert.deepEqual(c.restrictions, { users: ['chefe'], teams: [], apps: [] });
  assert.equal(c.required_linear_history, true);
  assert.equal(c.required_conversation_resolution, true);
  assert.deepEqual(diffProtecao(atual, c), []);
});

// Cenário de um repo privado sem proteção, Project 3 com Status {Todo, A Fazer}.
const BASE = [
  ok('^api user$', { login: 'agente' }),
  ok('^api users/analista$', { id: 42, login: 'analista' }),
  falha('^api users/', 'HTTP 404: Not Found'),
  ok('^api repos/dono/app/collaborators/analista$', ''),
  falha('^api repos/dono/app/collaborators/', 'HTTP 404: Not Found'),
  ok('^api repos/dono/app$', { default_branch: 'main', private: true, owner: { type: 'User' } }),
  falha('^api repos/dono/app/branches/main/protection$', 'gh: Branch not protected (HTTP 404)'),
  ok('^api repos/dono/app/environments\\?per_page=100$', { total_count: 0, environments: [] }),
  ok('^project list', { projects: [{ number: 3, title: 'App', url: 'https://github.com/users/dono/projects/3', id: 'PVT_1' }] }),
  ok('^project field-list 3', { fields: [{ id: 'FLD_S', name: 'Status', type: 'ProjectV2SingleSelectField' }] }),
  ok('^api graphql -f query=query', {
    data: { node: { options: [{ id: 'o1', name: 'Todo', color: 'GRAY', description: '' }, { id: 'o2', name: 'A Fazer', color: 'BLUE', description: '' }] } },
  }),
];

test('detect: lê git, repo, proteção, ambientes, Projects, Status e analistas', async () => {
  const { detect } = await imp('detect.mjs');
  cenario(BASE);
  const { dir } = repoGit();
  const r = detect(dir, { project: 3, analistas: ['analista', 'agente', 'fantasma', 'outro'] });
  assert.equal(r.git, true);
  assert.equal(r.repo, 'dono/app');
  assert.equal(r.login, 'agente');
  assert.equal(r.branch_principal, 'main');
  assert.equal(r.privado, true);
  assert.deepEqual(r.protecao, { estado: 'nenhuma' });
  assert.deepEqual(r.ambientes, []);
  assert.equal(r.owner, 'dono');
  assert.equal(r.projects[0].id, 'PVT_1');
  assert.equal(r.status_project.campo_status_id, 'FLD_S');
  assert.equal(r.status_project.opcoes.length, 2);
  assert.deepEqual(r.analistas[0], { login: 'analista', id: 42, colaborador: true });
  assert.equal(r.analistas[1].erro, 'ANALISTA_IGUAL_AGENTE');
  assert.equal(r.analistas[2].erro, 'ANALISTA_INEXISTENTE');
});

test('detect: pasta sem git e repo sem remoto viram avisos', async () => {
  const { detect } = await imp('detect.mjs');
  cenario(BASE);
  const semGit = fs.mkdtempSync(path.join(TMP, 'nada-'));
  assert.deepEqual(detect(semGit).avisos, ['NAO_E_GIT']);
  const { dir } = repoGit({ remoto: null });
  const r = detect(dir);
  assert.deepEqual(r.avisos, ['SEM_REMOTO']);
  assert.equal(r.owner, 'agente');
});

test('detect: plano sem proteção é reconhecido', async () => {
  const { detect } = await imp('detect.mjs');
  cenario([
    falha('^api repos/dono/app/branches/main/protection$', 'Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)'),
    ...BASE,
  ]);
  const { dir } = repoGit();
  assert.deepEqual(detect(dir).protecao, { estado: 'indisponivel_no_plano' });
});

test('detect: erro de rede nos ambientes não é engolido', async () => {
  const { detect } = await imp('detect.mjs');
  cenario([falha('^api repos/dono/app/environments\\?per_page=100$', 'error connecting to api.github.com: could not resolve host'), ...BASE]);
  const { dir } = repoGit();
  assert.throws(() => detect(dir), (e) => e.codigo === 'REDE');
});

test('apply: ambiente prd existente preserva wait_timer e branch policy', async () => {
  const { aplicar } = await imp('apply.mjs');
  const pol = { protected_branches: false, custom_branch_policies: true };
  cenario([
    ok('^api repos/dono/app/environments\\?per_page=100$', {
      environments: [
        { name: 'hom', protection_rules: [] },
        {
          name: 'prd',
          deployment_branch_policy: pol,
          protection_rules: [
            { type: 'wait_timer', wait_timer: 30 },
            { type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 42 } }] },
          ],
        },
      ],
    }),
    ...BASE,
  ]);
  const { dir } = repoGit();
  const r = aplicar(dir, fichaTesteSync(), { dryRun: true });
  const { planejar } = await imp('apply.mjs');
  const { detect } = await imp('detect.mjs');
  const f = fichaTesteSync();
  const acao = planejar(detect(dir, { project: 3, analistas: ['analista'] }), f).find((a) => a.gh.join(' ').includes('environments/prd'));
  assert.ok(acao && r.ok);
  assert.deepEqual(JSON.parse(acao.input), {
    reviewers: [{ type: 'User', id: 42 }],
    prevent_self_review: true,
    wait_timer: 30,
    deployment_branch_policy: pol,
  });
});

const ESCRITA = (c) => c.args.includes('-X') || c.args.includes('--input');

test('apply --dry-run: lista ações e não escreve nada', async () => {
  const { aplicar } = await imp('apply.mjs');
  const c = cenario(BASE);
  const { dir } = repoGit();
  const r = aplicar(dir, fichaTesteSync(), { dryRun: true });
  assert.equal(r.dry_run, true);
  assert.deepEqual(r.acoes.map((a) => a.tipo), ['colunas', 'ambiente', 'ambiente', 'protecao']);
  assert.ok(r.acoes.every((a) => a.status === 'planejado' && a.comando.startsWith('gh ')));
  assert.equal(c.chamadas().filter(ESCRITA).length, 0);
});

test('apply: cria colunas, ambientes e proteção; devolve ficha com ids', async () => {
  const { aplicar } = await imp('apply.mjs');
  const c = cenario([
    ok('^api graphql --input -$', '{}'),
    ok('^api -X PUT repos/dono/app/environments/', '{}'),
    ok('^api -X PUT repos/dono/app/branches/main/protection', '{}'),
    ...BASE,
  ]);
  const { dir } = repoGit();
  const r = aplicar(dir, fichaTesteSync());
  assert.ok(r.acoes.every((a) => a.status === 'feito'));
  const escritas = c.chamadas().filter(ESCRITA);
  const mut = JSON.parse(escritas[0].input);
  assert.equal(mut.variables.input.fieldId, 'FLD_S');
  assert.deepEqual(mut.variables.input.singleSelectOptions.slice(0, 2).map((o) => o.name), ['Todo', 'A Fazer']);
  const prd = escritas.find((e) => e.args.join(' ').includes('environments/prd'));
  assert.deepEqual(JSON.parse(prd.input), { reviewers: [{ type: 'User', id: 42 }], prevent_self_review: true });
  const prot = JSON.parse(escritas.find((e) => e.args.join(' ').includes('/protection')).input);
  assert.equal(prot.required_pull_request_reviews.dismiss_stale_reviews, true);
  assert.equal(r.ficha.colunas_ids.a_fazer, 'o2');
  assert.equal(r.ficha.protecao_aplicada.nivel, 'completa');
});

test('apply: analista sem acesso → convite; analista inválido → erro', async () => {
  const { aplicar } = await imp('apply.mjs');
  cenario(BASE);
  const { dir } = repoGit();
  cenario([ok('^api users/novo$', { id: 7 }), ...BASE]);
  const r = aplicar(dir, fichaTesteSync({ analistas: ['novo'] }), { dryRun: true });
  assert.equal(r.acoes[0].tipo, 'convite');
  assert.match(r.acoes[0].comando, /collaborators\/novo -f permission=push/);
  assert.throws(() => aplicar(dir, fichaTesteSync({ analistas: ['agente'] }), { dryRun: true }), (e) => e.codigo === 'ANALISTA_IGUAL_AGENTE');
});

test('apply: plano sem proteção → erro, ou parcial se aceito', async () => {
  const { aplicar } = await imp('apply.mjs');
  cenario([
    falha('^api repos/dono/app/branches/main/protection$', 'Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)'),
    falha('^api -X PUT repos/dono/app/environments/prd', 'Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)'),
    ok('^api graphql --input -$', '{}'),
    ok('^api -X PUT repos/dono/app/environments/', '{}'),
    ...BASE,
  ]);
  const { dir } = repoGit();
  assert.throws(() => aplicar(dir, fichaTesteSync(), { dryRun: true }), (e) => e.codigo === 'PLANO_SEM_PROTECAO');
  const r = aplicar(dir, fichaTesteSync({ aceitar_protecao_parcial: true }));
  assert.equal(r.ficha.protecao_aplicada.nivel, 'parcial');
  assert.ok(r.acoes.some((a) => a.tipo === 'protecao' && a.status === 'pulado'));
  assert.ok(r.acoes.some((a) => a.descricao.includes('prd') && a.status === 'pulado'));
});

test('apply: travas recusam merge, aprovação e DELETE', async () => {
  const { verificarTravas } = await imp('apply.mjs');
  for (const args of [['pr', 'merge', '7'], ['pr', 'review', '7', '--approve'], ['api', 'repos/d/a/pulls/7/reviews'], ['api', '-X', 'DELETE', 'repos/d/a/branches/main/protection'], ['api', '-XDELETE', 'x'], ['api', '--method=DELETE', 'x'], ['api', '-X', 'PUT', 'repos/d/a/pulls/7/merge']])
    assert.throws(() => verificarTravas([{ tipo: 'x', descricao: 'x', gh: args }]), (e) => e.codigo === 'TRAVA');
  assert.throws(
    () => verificarTravas([{ tipo: 'x', descricao: 'x', gh: ['api', 'graphql', '--input', '-'], input: '{"query":"mutation{mergePullRequest(input:{})}"}' }]),
    (e) => e.codigo === 'TRAVA',
  );
  verificarTravas([{ tipo: 'x', descricao: 'x', gh: ['api', '-X', 'PUT', 'repos/dono/reviews/environments/hom'] }]);
});

const ITEM = (status) =>
  ok('^project item-list 3', {
    items: [{ id: 'ITEM_101', status, title: 'Carga de clientes', content: { type: 'Issue', number: 101, title: 'Carga de clientes', repository: 'dono/app' } }],
  });

test('card-start: cria branch, TASK, commit e move o cartão', async () => {
  const { cardStart } = await imp('cartao.mjs');
  const c = cenario([ITEM('A Fazer'), ok('^project item-edit', '{}')]);
  const { dir, g } = repoComBare();
  const r = cardStart(dir, fichaTesteSync(), 101);
  assert.equal(r.branch, 'feature/101-carga-de-clientes');
  assert.equal(g('branch', '--show-current'), 'feature/101-carga-de-clientes');
  const task = fs.readFileSync(path.join(dir, 'docs/tasks/TASK-101-carga-de-clientes.md'), 'utf8');
  assert.match(task, /\| Branch \| feature\/101-carga-de-clientes \|/);
  assert.match(g('log', '-1', '--format=%s'), /^docs\(task\): TASK-101/);
  const edit = c.chamadas().find((x) => x.args[1] === 'item-edit');
  assert.deepEqual(edit.args.slice(2), ['--id', 'ITEM_101', '--project-id', 'PVT_1', '--field-id', 'FLD_S', '--single-select-option-id', 'o3']);
  const up = spawnSync('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(up.status, 0); // branch criada com --no-track: nunca aponta para a main remota
});

test('card-start: --dry-run não muda nada; fix usa prefixo fix/', async () => {
  const { cardStart } = await imp('cartao.mjs');
  const c = cenario([ITEM('A Fazer')]);
  const { dir, g } = repoComBare();
  const r = cardStart(dir, fichaTesteSync(), 101, { tipo: 'fix', desc: 'Corrige CNPJ', dryRun: true });
  assert.equal(r.branch, 'fix/101-corrige-cnpj');
  assert.equal(g('branch', '--show-current'), 'main');
  assert.equal(c.chamadas().some((x) => x.args[1] === 'item-edit'), false);
});

test('card-start: recusa cartão fora de A Fazer, inexistente, árvore suja e branch existente', async () => {
  const { cardStart } = await imp('cartao.mjs');
  const { dir, g } = repoComBare();
  cenario([ITEM('Backlog')]);
  assert.throws(() => cardStart(dir, fichaTesteSync(), 101), (e) => e.codigo === 'CARTAO_FORA_DE_A_FAZER');
  assert.throws(() => cardStart(dir, fichaTesteSync(), 999), (e) => e.codigo === 'CARTAO_INEXISTENTE');
  cenario([ITEM('a fazer')]);
  fs.writeFileSync(path.join(dir, 'sujo.txt'), 'x');
  assert.throws(() => cardStart(dir, fichaTesteSync(), 101), (e) => e.codigo === 'ARVORE_SUJA');
  fs.rmSync(path.join(dir, 'sujo.txt'));
  g('branch', 'feature/101-carga-de-clientes');
  assert.throws(() => cardStart(dir, fichaTesteSync(), 101), (e) => e.codigo === 'BRANCH_EXISTE');
});

test('card-pr: push da branch, PR ligado, comentário no cartão e TASK atualizado; main intocada', async () => {
  const { cardStart, cardPr } = await imp('cartao.mjs');
  const { dir, g, shaBare } = repoComBare();
  cenario([ITEM('A Fazer'), ok('^project item-edit', '{}')]);
  cardStart(dir, fichaTesteSync(), 101);
  const mainAntes = shaBare('main');
  const c = cenario([ITEM('Em andamento'), ok('^pr list', []), ok('^pr create', 'https://github.com/dono/app/pull/7\n'), ok('^issue comment', '')]);
  const r = cardPr(dir, fichaTesteSync(), 101);
  assert.equal(r.pr, 'https://github.com/dono/app/pull/7');
  assert.equal(shaBare('main'), mainAntes);
  assert.equal(shaBare('feature/101-carga-de-clientes'), g('rev-parse', 'HEAD'));
  const criar = c.chamadas().find((x) => x.args[1] === 'create').args;
  assert.deepEqual(criar.slice(2, 8), ['--repo', 'dono/app', '--base', 'main', '--head', 'feature/101-carga-de-clientes']);
  const corpo = criar[criar.indexOf('--body') + 1];
  assert.match(corpo, /Cartão #101/);
  assert.doesNotMatch(corpo, /closes|fixes|resolves/i);
  assert.ok(c.chamadas().some((x) => x.args[0] === 'issue' && x.args[2] === '101'));
  const task = fs.readFileSync(path.join(dir, 'docs/tasks/TASK-101-carga-de-clientes.md'), 'utf8');
  assert.match(task, /\| PR \| https:\/\/github.com\/dono\/app\/pull\/7 \|/);
  assert.equal(g('status', '--porcelain'), '');
});

test('card-pr: PR já aberto não duplica; branch errada é recusada', async () => {
  const { cardStart, cardPr } = await imp('cartao.mjs');
  const { dir, g } = repoComBare();
  cenario([ITEM('A Fazer'), ok('^project item-edit', '{}')]);
  cardStart(dir, fichaTesteSync(), 101);
  const c = cenario([ITEM('Em andamento'), ok('^pr list', [{ url: 'https://github.com/dono/app/pull/7' }])]);
  assert.equal(cardPr(dir, fichaTesteSync(), 101).pr, 'https://github.com/dono/app/pull/7');
  assert.equal(c.chamadas().some((x) => x.args[1] === 'create'), false);
  g('switch', '-q', 'main');
  assert.throws(() => cardPr(dir, fichaTesteSync(), 101), (e) => e.codigo === 'BRANCH_ERRADA');
});

const CLI = path.join(REPO, 'scripts', 'github-setup.mjs');
function cli(cwd, args, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, json: r.stdout.trim() ? JSON.parse(r.stdout) : null, stderr: r.stderr };
}

test('CLI: detect imprime JSON; erro conhecido sai com 2 e código', async () => {
  const { env } = cenario(BASE);
  const { dir } = repoGit();
  const r = cli(dir, ['detect', '--project', '3', '--analista', 'analista'], env);
  assert.equal(r.code, 0);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.repo, 'dono/app');
  assert.equal(r.json.analistas[0].id, 42);
  const e = cli(dir, ['card-start', '101'], env); // sem ficha
  assert.equal(e.code, 2);
  assert.equal(e.json.ok, false);
  assert.equal(e.json.erro.codigo, 'FICHA_INVALIDA');
  assert.ok(e.json.erro.como_resolver);
  assert.equal(cli(dir, ['inventado'], env).json.erro.codigo, 'PARAMETRO');
});

test('CLI: apply grava a ficha atualizada (e não grava em --dry-run)', async () => {
  const { gravarFicha, lerFicha } = await imp('ficha.mjs');
  const { env } = cenario([ok('^api graphql --input -$', '{}'), ok('^api -X PUT', '{}'), ...BASE]);
  const { dir } = repoGit();
  gravarFicha(dir, fichaTesteSync({ colunas_ids: {} }));
  assert.equal(cli(dir, ['apply', '--dry-run'], env).code, 0);
  assert.deepEqual(lerFicha(dir).colunas_ids, {});
  const r = cli(dir, ['apply'], env);
  assert.equal(r.code, 0);
  assert.equal(lerFicha(dir).colunas_ids.a_fazer, 'o2');
  assert.equal(lerFicha(dir).protecao_aplicada.nivel, 'completa');
});

test('card-pr: ID não numérico é recusado', async () => {
  const { cardPr } = await imp('cartao.mjs');
  const { dir } = repoComBare();
  assert.throws(() => cardPr(dir, fichaTesteSync(), '7-x'), (e) => e.codigo === 'PARAMETRO');
});

test('card-start: falha ao mover o cartão avisa que branch e TASK já existem', async () => {
  const { cardStart } = await imp('cartao.mjs');
  cenario([ITEM('A Fazer'), falha('^project item-edit', 'HTTP 502')]);
  const { dir, g } = repoComBare();
  assert.throws(
    () => cardStart(dir, fichaTesteSync(), 101),
    (e) => e.codigo === 'REDE' && e.message.includes('à mão') && e.message.includes('feature/101-carga-de-clientes') && !!e.como_resolver,
  );
  assert.equal(g('branch', '--show-current'), 'feature/101-carga-de-clientes');
});

test('ficha: branch_principal é obrigatória', async () => {
  const { validarFicha } = await imp('ficha.mjs');
  assert.ok(validarFicha(fichaTesteSync({ branch_principal: '' })).includes('branch_principal ausente'));
});

test('CLI: opção desconhecida é recusada com PARAMETRO', async () => {
  const { dir } = repoGit();
  const r = cli(dir, ['apply', '--dryrun'], {});
  assert.equal(r.code, 2);
  assert.equal(r.json.erro.codigo, 'PARAMETRO');
});

const INSTALL = path.join(REPO, 'scripts', 'install-governanca.mjs');
function instalar(dest, ficha, extra = []) {
  const arq = path.join(fs.mkdtempSync(path.join(TMP, 'resp-')), 'ficha.json');
  fs.writeFileSync(arq, JSON.stringify(ficha));
  return spawnSync(process.execPath, [INSTALL, dest, '--ficha-json', arq, ...extra], { encoding: 'utf8' });
}

test('install: cria ficha, script, procedimento, comando, blocos; idempotente', async () => {
  const { dir } = repoGit();
  fs.mkdirSync(path.join(dir, 'automation'));
  fs.writeFileSync(path.join(dir, 'automation', 'guardrails.md'), '# Guardrails\n\n- regra antiga\n');
  fs.mkdirSync(path.join(dir, '.github'));
  fs.writeFileSync(path.join(dir, '.github', 'CODEOWNERS'), 'docs/ @escritor\n');
  const f = fichaTesteSync({ analistas: ['analista', 'outra'] });
  assert.equal(instalar(dir, f).status, 0);
  const ler = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
  assert.equal(JSON.parse(ler('.agentic-os/governanca.json')).repo, 'dono/app');
  assert.ok(fs.existsSync(path.join(dir, '.agentic-os/bin/github-setup.mjs')));
  for (const m of fs.readdirSync(GOV)) assert.ok(fs.existsSync(path.join(dir, '.agentic-os/bin/governanca', m)), m);
  assert.ok(fs.existsSync(path.join(dir, 'automation/procedures/cartao.md')));
  assert.ok(ler('.claude/commands/cartao.md').split('\n').length <= 6);
  assert.ok(fs.existsSync(path.join(dir, 'docs/tasks/README.md')));
  assert.match(ler('automation/guardrails.md'), /- regra antiga[\s\S]*agentic-os:governanca:start[\s\S]*Sem assinatura/);
  assert.match(ler('.github/CODEOWNERS'), /^docs\/ @escritor\n[\s\S]*^\* @analista @outra$/m);
  assert.match(ler('.gitignore'), /\.agentic-os\/wizard-estado\.json/);
  const antes = ['automation/guardrails.md', '.github/CODEOWNERS', '.gitignore'].map(ler);
  assert.equal(instalar(dir, f).status, 0);
  assert.deepEqual(['automation/guardrails.md', '.github/CODEOWNERS', '.gitignore'].map(ler), antes);
});

test('install: preserva ids e proteção já aplicados; recusa segredo; dry-run não escreve', async () => {
  const { dir } = repoGit();
  const f = fichaTesteSync({ colunas_ids: { a_fazer: 'o2' }, protecao_aplicada: { em: 'x', nivel: 'completa', motivo: '' } });
  assert.equal(instalar(dir, f).status, 0);
  assert.equal(instalar(dir, fichaTesteSync({ colunas_ids: {}, protecao_aplicada: null })).status, 0);
  const salva = JSON.parse(fs.readFileSync(path.join(dir, '.agentic-os/governanca.json'), 'utf8'));
  assert.equal(salva.colunas_ids.a_fazer, 'o2');
  assert.equal(salva.protecao_aplicada.nivel, 'completa');
  const r = instalar(dir, { ...f, extra: { token: 'x' } });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /segredo/);
  const novo = repoGit().dir;
  assert.equal(instalar(novo, f, ['--dry-run']).status, 0);
  assert.equal(fs.existsSync(path.join(novo, '.agentic-os')), false);
});

test('install: trocar de repo ou Project descarta ids e proteção antigos', async () => {
  const { dir } = repoGit();
  const f = fichaTesteSync({ colunas_ids: { a_fazer: 'o2' }, protecao_aplicada: { em: 'x', nivel: 'completa', motivo: '' } });
  assert.equal(instalar(dir, f).status, 0);
  const outro = fichaTesteSync({ repo: 'dono/outro', colunas_ids: {}, protecao_aplicada: null });
  outro.project = { ...outro.project, id: '', campo_status_id: '' };
  assert.equal(instalar(dir, outro).status, 0);
  const salva = JSON.parse(fs.readFileSync(path.join(dir, '.agentic-os/governanca.json'), 'utf8'));
  assert.deepEqual(salva.colunas_ids, {});
  assert.equal(salva.protecao_aplicada, null);
  assert.equal(salva.project.id, '');
});
