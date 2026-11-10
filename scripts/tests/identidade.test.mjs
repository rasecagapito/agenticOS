// Testes da identidade do agente. Rodar: node --test scripts/tests/identidade.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOV = path.join(REPO, 'scripts', 'governanca');
const imp = (m) => import(pathToFileURL(path.join(GOV, m)).href);
const FAKE = path.join(REPO, 'scripts', 'tests', 'fixtures', 'fake-gh.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ident-'));
delete process.env.GH_TOKEN;
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
const fichaBase = (extra = {}) => ({
  versao: 1, repo: 'dono/app', branch_principal: 'main', project: { owner: 'dono', number: 3 },
  analistas: ['ana'], ambientes: { hom: 'hom', prd: 'prd' }, ...extra,
});

test('ficha: identidade no padrão; validação; nomes _env não contam como segredo; ficha antiga vale', async () => {
  const { fichaPadrao, validarFicha } = await imp('ficha.mjs');
  const f = fichaPadrao({ repo: 'dono/app', project: { owner: 'dono', number: 1 }, analistas: ['ana'] });
  assert.deepEqual(f.identidade_agente, { modo: 'nenhuma', token_env: 'AGENTIC_OS_GH_TOKEN', app_id: null, chave_privada_env: 'AGENTIC_OS_APP_KEY_PATH' });
  assert.equal(f.aprovacao_pelo_chat, false);
  assert.deepEqual(validarFicha(f), []);
  const com = (ia, extra = {}) => validarFicha({ ...f, identidade_agente: { ...f.identidade_agente, ...ia }, ...extra });
  assert.match(com({ modo: 'x' }).join(), /identidade_agente\.modo/);
  assert.match(com({ token_env: 'meu token' }).join(), /identidade_agente\.token_env/);
  assert.match(com({ chave_privada_env: 'c:/chave.pem' }).join(), /identidade_agente\.chave_privada_env/);
  assert.match(com({ modo: 'app' }).join(), /app_id/);
  assert.deepEqual(com({ modo: 'app', app_id: 42 }), []);
  assert.match(validarFicha({ ...f, aprovacao_pelo_chat: 'sim' }).join(), /aprovacao_pelo_chat/);
  assert.match(validarFicha({ ...f, identidade_agente: { ...f.identidade_agente, token: 'x' } }).join(), /segredo/);
  const antiga = { ...f };
  delete antiga.identidade_agente;
  delete antiga.aprovacao_pelo_chat;
  assert.deepEqual(validarFicha(antiga), []);
  const { ERROS } = await imp('erros.mjs');
  for (const c of ['IDENTIDADE_IGUAL_ANALISTA', 'TOKEN_AUSENTE', 'APP_CHAVE_INVALIDA', 'APP_NAO_INSTALADO', 'CHAT_DESLIGADO', 'JA_HA_REVIEW', 'GH_LOCAL_E_ANALISTA', 'REMOTO_SSH'])
    assert.ok(ERROS[c], c);
  assert.match(ERROS.ANALISTA_IGUAL_AGENTE, /identidade_agente/);
});

test('gh: token do agente vai em GH_TOKEN; token explícito vence; token some das mensagens de erro', async () => {
  const { gh, usarTokenAgente } = await imp('gh.mjs');
  const c = cenario([ok('^api user$', { login: 'x' }), { re: '^api falha', stderr: 'recusado tok_SEGREDO', code: 1 }]);
  usarTokenAgente('tok_SEGREDO');
  gh(['api', 'user']);
  gh(['api', 'user'], { token: 'outro' });
  assert.throws(() => gh(['api', 'falha', 'tok_SEGREDO']), (e) => e.codigo === 'GH_FALHOU' && !e.message.includes('tok_SEGREDO'));
  assert.throws(() => gh(['api', 'falha', '-H', 'Authorization: Bearer jwt_X'], { token: 'jwt_X' }), (e) => !e.message.includes('jwt_X'));
  usarTokenAgente(null);
  gh(['api', 'user']);
  assert.deepEqual(c.chamadas().map((x) => x.gh_token), ['tok_SEGREDO', 'outro', 'tok_SEGREDO', 'jwt_X', null]);
});

test('gh: renova o token do agente quando faltam menos de 5 min', async () => {
  const { gh, usarTokenAgente } = await imp('gh.mjs');
  const c = cenario([ok('^api user$', {})]);
  let n = 0;
  usarTokenAgente('velho', { expiraEm: Date.now() + 60000, renovador: () => ({ token: `novo${++n}`, expira: Date.now() + 3600000 }) });
  gh(['api', 'user']);
  gh(['api', 'user']);
  usarTokenAgente(null);
  assert.deepEqual(c.chamadas().map((x) => x.gh_token), ['novo1', 'novo1']);
});

test('git: push do agente leva o token só no ambiente, nunca no .git/config', async () => {
  const { envPush, pushBranch } = await imp('git.mjs');
  const { usarTokenAgente } = await imp('gh.mjs');
  assert.deepEqual(envPush(null), {});
  const e = envPush('tok_X');
  assert.equal(e.GIT_CONFIG_COUNT, '1');
  assert.equal(e.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.equal(Buffer.from(e.GIT_CONFIG_VALUE_0.replace('AUTHORIZATION: basic ', ''), 'base64').toString(), 'x-access-token:tok_X');
  const bare = fs.mkdtempSync(path.join(TMP, 'bare-'));
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  const dir = fs.mkdtempSync(path.join(TMP, 'proj-'));
  const g = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' }).stdout.trim();
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  g('add', '.');
  g('commit', '-qm', 'a');
  g('remote', 'add', 'origin', bare);
  g('switch', '-q', '-c', 'feature/1-x');
  usarTokenAgente('tok_X');
  pushBranch(dir, 'feature/1-x', 'main');
  usarTokenAgente(null);
  assert.equal(spawnSync('git', ['rev-parse', 'feature/1-x'], { cwd: bare, encoding: 'utf8' }).stdout.trim(), g('rev-parse', 'HEAD'));
  assert.doesNotMatch(fs.readFileSync(path.join(dir, '.git', 'config'), 'utf8'), /tok_X|extraheader/);
});

test('git: credencial do agente vai em todo comando que fala com o remoto (fetch, ls-remote, push, pull), e só neles', async () => {
  const { envGit } = await imp('git.mjs');
  const { usarTokenAgente } = await imp('gh.mjs');
  usarTokenAgente('tok_Y');
  for (const c of ['fetch', 'ls-remote', 'push', 'pull']) assert.equal(envGit([c, 'origin']).GIT_CONFIG_COUNT, '1', c);
  for (const c of ['status', 'commit', 'switch', 'rev-parse']) assert.deepEqual(envGit([c]), {}, c);
  usarTokenAgente(null);
  assert.deepEqual(envGit(['fetch', 'origin']), {});
});

test('git: remoto SSH com identidade do agente é recusado (a credencial https não vale em SSH)', async () => {
  const { exigirRemotoHttps } = await imp('git.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'ssh-'));
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:dono/app.git'], { cwd: dir });
  assert.throws(() => exigirRemotoHttps(dir), (e) => e.codigo === 'REMOTO_SSH');
  spawnSync('git', ['remote', 'set-url', 'origin', 'https://github.com/dono/app.git'], { cwd: dir });
  assert.doesNotThrow(() => exigirRemotoHttps(dir));
});

test('git: remoto precisa ser https em github.com, inclusive a URL de push', async () => {
  const { exigirRemotoHttps } = await imp('git.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'push-'));
  const g = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('remote', 'add', 'origin', 'https://github.com/dono/app.git');
  assert.doesNotThrow(() => exigirRemotoHttps(dir));
  g('remote', 'set-url', '--push', 'origin', 'git@github.com:dono/app.git');
  assert.throws(() => exigirRemotoHttps(dir), (e) => e.codigo === 'REMOTO_SSH');
  g('remote', 'set-url', '--push', 'origin', 'https://gitlab.com/dono/app.git');
  assert.throws(() => exigirRemotoHttps(dir), (e) => e.codigo === 'REMOTO_SSH' && !/user:pass/.test(e.message));
  g('remote', 'set-url', '--push', 'origin', 'https://user:pass@github.com/dono/app.git');
  assert.throws(() => exigirRemotoHttps(dir), (e) => e.codigo === 'REMOTO_SSH' && !/user:pass/.test(e.message));
  g('remote', 'set-url', '--push', 'origin', 'https://GitHub.com/dono/app.git');
  assert.doesNotThrow(() => exigirRemotoHttps(dir));
  g('remote', 'set-url', 'origin', 'https://user:pass@gitlab.com/dono/app.git');
  assert.throws(() => exigirRemotoHttps(dir), (e) => e.codigo === 'REMOTO_SSH' && !/user:pass/.test(e.message));
});

test('executar: variáveis pedidas e o token do agente não chegam ao comando', async () => {
  const { executar } = await imp('executar.mjs');
  const { usarTokenAgente } = await imp('gh.mjs');
  const cmd = 'node -e "console.log(process.env.TESTE_TOK_X||\'vazio\', process.env.GH_TOKEN||\'semgh\')"';
  process.env.TESTE_TOK_X = 'segredo';
  assert.match(executar(TMP, cmd, 60000).saida, /segredo/);
  const r = executar(TMP, cmd, 60000, { semVariaveis: ['TESTE_TOK_X'] });
  assert.match(r.saida, /vazio/);
  usarTokenAgente('tok_ag');
  process.env.GH_TOKEN = 'tok_ag';
  assert.match(executar(TMP, cmd, 60000).saida, /semgh/);
  process.env.GH_TOKEN = 'do_usuario';
  assert.match(executar(TMP, cmd, 60000).saida, /do_usuario/);
  usarTokenAgente(null);
  delete process.env.GH_TOKEN;
  delete process.env.TESTE_TOK_X;
});

test('identidade: nenhuma usa o gh local; token lê a variável; sem variável → TOKEN_AUSENTE', async () => {
  const { ativarIdentidade, desativarIdentidade, loginAgente } = await imp('identidade.mjs');
  desativarIdentidade();
  let c = cenario([ok('^api user$', { login: 'dono' })]);
  assert.deepEqual(ativarIdentidade(fichaBase()), { modo: 'nenhuma', login: null });
  assert.equal(loginAgente(), 'dono');
  assert.equal(c.chamadas()[0].gh_token, null);
  delete process.env.TESTE_TOKEN_AGENTE;
  const ft = fichaBase({ identidade_agente: { modo: 'token', token_env: 'TESTE_TOKEN_AGENTE' } });
  assert.throws(() => ativarIdentidade(ft), (e) => e.codigo === 'TOKEN_AUSENTE' && /TESTE_TOKEN_AGENTE/.test(e.message));
  process.env.TESTE_TOKEN_AGENTE = 'tok_robo';
  c = cenario([ok('^api user$', { login: 'robo' })]);
  assert.deepEqual(ativarIdentidade(ft), { modo: 'token', login: 'robo' });
  assert.equal(loginAgente(), 'robo');
  assert.equal(c.chamadas().length, 1);
  assert.equal(c.chamadas()[0].gh_token, 'tok_robo');
  desativarIdentidade();
  delete process.env.TESTE_TOKEN_AGENTE;
});

test('identidade: exigirSeparacao bloqueia agente = analista, salvo aprovacao_pelo_chat', async () => {
  const { desativarIdentidade, exigirSeparacao } = await imp('identidade.mjs');
  desativarIdentidade();
  cenario([ok('^api user$', { login: 'Ana' })]);
  const f = fichaBase({ analistas: ['ana'] });
  assert.throws(() => exigirSeparacao(f), (e) => e.codigo === 'IDENTIDADE_IGUAL_ANALISTA' && /Ana/.test(e.message));
  assert.deepEqual(exigirSeparacao({ ...f, aprovacao_pelo_chat: true }), { login: 'Ana', igual: true });
  assert.deepEqual(exigirSeparacao({ ...f, analistas: ['outra'] }), { login: 'Ana', igual: false });
});

test('identidade app: JWT RS256 válido, token de instalação, login <slug>[bot], erros', async () => {
  const { ativarIdentidade, desativarIdentidade, loginAgente } = await imp('identidade.mjs');
  const { gh } = await imp('gh.mjs');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pemArq = path.join(TMP, 'app.pem');
  fs.writeFileSync(pemArq, privateKey.export({ type: 'pkcs1', format: 'pem' }));
  process.env.TESTE_APP_PEM = pemArq;
  const f = fichaBase({ identidade_agente: { modo: 'app', app_id: 42, chave_privada_env: 'TESTE_APP_PEM' } });
  desativarIdentidade();
  const c = cenario([
    ok('repos/dono/app/installation$', { id: 9 }),
    ok('-X POST .*app/installations/9/access_tokens$', { token: 'ghs_inst', expires_at: new Date(Date.now() + 3600000).toISOString() }),
    ok(' app$', { slug: 'meu-agente' }),
    ok('^api user$', { login: 'nao-usar' }),
  ]);
  assert.deepEqual(ativarIdentidade(f), { modo: 'app', login: 'meu-agente[bot]' });
  assert.equal(loginAgente(), 'meu-agente[bot]');
  const h = c.chamadas()[0].args.find((a) => a.startsWith('Authorization: Bearer '));
  const [cab, carga, sig] = h.slice('Authorization: Bearer '.length).split('.');
  const dec = (s) => JSON.parse(Buffer.from(s, 'base64url').toString());
  assert.deepEqual(dec(cab), { alg: 'RS256', typ: 'JWT' });
  assert.equal(dec(carga).iss, '42');
  assert.ok(dec(carga).exp - dec(carga).iat <= 600);
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${cab}.${carga}`), publicKey, Buffer.from(sig, 'base64url')));
  gh(['api', 'user']);
  assert.equal(c.chamadas().at(-1).gh_token, 'ghs_inst');
  desativarIdentidade();
  cenario([{ re: 'installation$', stderr: 'gh: Not Found (HTTP 404)', code: 1 }]);
  assert.throws(() => ativarIdentidade(f), (e) => e.codigo === 'APP_NAO_INSTALADO');
  cenario([{ re: 'installation$', stderr: 'gh: A JSON web token could not be decoded (HTTP 401)', code: 1 }]);
  assert.throws(() => ativarIdentidade(f), (e) => e.codigo === 'APP_CHAVE_INVALIDA');
  fs.writeFileSync(pemArq, 'nao e chave');
  assert.throws(() => ativarIdentidade(f), (e) => e.codigo === 'APP_CHAVE_INVALIDA');
  delete process.env.TESTE_APP_PEM;
  assert.throws(() => ativarIdentidade(f), (e) => e.codigo === 'APP_CHAVE_INVALIDA' && /TESTE_APP_PEM/.test(e.message));
  desativarIdentidade();
});
