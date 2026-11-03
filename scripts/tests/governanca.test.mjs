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
  assert.deepEqual(m[1], { name: 'a fazer', color: 'BLUE', description: 'd' });
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
