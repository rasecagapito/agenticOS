# Identidade do agente e aprovação pelo chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O agente passa a operar no GitHub com identidade própria (token de outra conta ou GitHub App), para o dono do projeto poder ser o analista; sem identidade separada, a assinatura bloqueia, salvo `aprovacao_pelo_chat` opt-in (prova fraca, registrada como tal).

**Architecture:** `identidade.mjs` resolve a identidade do projeto (nenhuma/token/app) e entrega o token a `gh.mjs` (estado em memória do processo: `GH_TOKEN` no `gh` filho, renovação perto de expirar, token ocultado nas mensagens) e a `git.mjs` (credencial só no ambiente do `git push`, via `GIT_CONFIG_COUNT`). O CLI ativa a identidade nos subcomandos de cartão e aplica a trava `IDENTIDADE_IGUAL_ANALISTA` em `card-hom`/`card-sign`. `assinatura.mjs` ganha o caminho `--pelo-chat`, reaproveitando os efeitos da review. `detect` informa a identidade e o conflito.

**Tech Stack:** Node ≥18 ESM sem dependências (`node:crypto` para JWT RS256), `node:test`, `gh` CLI (falso nos testes), git.

**Spec:** `docs/superpowers/specs/2026-11-08-identidade-agente-design.md`. Branch: `feat/hom-assinatura`. Complementa `docs/superpowers/plans/2026-11-04-hom-assinatura.md` (Tasks 1–5 feitas; a Task 6 de lá é substituída pela Task 11 daqui; a Task 7 de lá vira a Task 12 daqui).

**Regras do repo:**
- Testes no Windows com arquivos explícitos (pasta não funciona; demora minutos — timeout longo):
  `node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs scripts/tests/hom.test.mjs scripts/tests/identidade.test.mjs scripts/tests/nomes-reais.test.mjs`
- Commits terminam com linha em branco + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Hook "Isolamento de clientes" bloqueia Bash com `$VAR`/`${...}`/crase+barra: use caminhos literais; textos com isso vão pela ferramenta Write/Edit.
- **Nada de nomes reais** (pessoas, orgs, clientes) em arquivo versionado. Nos testes, só nomes fictícios (`dono`, `ana`, `analista`, `agente`, `robo`, `meu-agente`).
- O fake-gh registra em `chamadas()` cada chamada `{args, input, body_file, gh_token}` (o `gh_token` entra na Task 2).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/governanca/ficha.mjs` | Modificar | campos `identidade_agente` e `aprovacao_pelo_chat`; validação; `_env` não é segredo; `lerFichaParcial` |
| `scripts/governanca/erros.mjs` | Modificar | 6 códigos + aviso `GH_LOCAL_E_ANALISTA`; texto de `ANALISTA_IGUAL_AGENTE` |
| `scripts/governanca/gh.mjs` | Modificar | token do agente em memória → `GH_TOKEN`; token explícito; renovação; ocultar token |
| `scripts/governanca/git.mjs` | Modificar | `envPush(token)`; `git(..., { env })`; push com credencial só no ambiente |
| `scripts/governanca/identidade.mjs` | Criar | `identidadeDe`, `ativarIdentidade`, `desativarIdentidade`, `loginAgente`, `exigirSeparacao`, `jwtApp` |
| `scripts/governanca/assinatura.mjs` | Modificar | agente = `loginAgente()`; linha `Tipo`; efeitos extraídos; `--pelo-chat` |
| `scripts/governanca/detect.mjs` | Modificar | bloco `identidade`; `checarAnalista(..., { permitirIgual })` |
| `scripts/governanca/apply.mjs` | Modificar | passa a ficha ao `detect` (`parcial`) |
| `scripts/github-setup.mjs` | Modificar | ativa identidade nos subcomandos de cartão; trava em `card-hom`/`card-sign`; flags `--pelo-chat --resultado --frase` |
| `scripts/tests/fixtures/fake-gh.mjs` | Modificar | registra `gh_token`; regra com `token` casa só aquele `GH_TOKEN` |
| `scripts/tests/identidade.test.mjs` | Criar | ficha, gh, git, identidade (token/app/separação) |
| `scripts/tests/hom.test.mjs` | Modificar | `card-sign --pelo-chat`; `Tipo`; CLI com trava |
| `scripts/tests/governanca.test.mjs` | Modificar | `detect` com identidade; instalador (guardrail 13, procedimento) |
| `scripts/tests/nomes-reais.test.mjs`, `scripts/tests/donos-permitidos.txt` | Criar | repo sem donos fora da lista permitida |
| `scripts/check-governanca.sh` | Modificar | roda os 5 arquivos de teste |
| `template/F-governanca/automation/procedures/cartao.md`, `template/F-governanca/guardrails-bloco.md` | Modificar | ramo pelo chat, trava, guardrail 13 |
| `docs/superpowers/specs/2026-11-04-hom-assinatura-design.md`, `docs/superpowers/plans/2026-11-04-hom-assinatura.md` | Modificar | tirar nomes reais |
| wizard, SKILL, GOVERNANCA, CONFORMANCE, guia, README, RELEASE-NOTES | Modificar | etapa e docs da identidade |

---

### Task 1: Ficha e erros

**Files:** Modify `scripts/governanca/ficha.mjs`, `scripts/governanca/erros.mjs`; Create `scripts/tests/identidade.test.mjs`.

- [ ] **Step 1: Criar o arquivo de teste com os ajudantes e o primeiro teste**

`scripts/tests/identidade.test.mjs`:

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/identidade.test.mjs`
Expected: FAIL (`f.identidade_agente` é `undefined`).

- [ ] **Step 3: Implementar**

`scripts/governanca/ficha.mjs` — em `fichaPadrao`, depois de `limite_hom_min: 30,`:

```js
    identidade_agente: { modo: 'nenhuma', token_env: 'AGENTIC_OS_GH_TOKEN', app_id: null, chave_privada_env: 'AGENTIC_OS_APP_KEY_PATH' },
    aprovacao_pelo_chat: false,
```

Em `chavesSecretas`, trocar a linha do spread por (nome de variável termina em `_env` e não guarda valor):

```js
    ...(SEGREDO.test(k) && !/_env$/.test(k) ? [`${prefixo}${k}`] : []),
```

Em `validarFicha`, antes de `const s = chavesSecretas(f);`:

```js
  const ia = f?.identidade_agente;
  if (ia !== undefined && ia !== null) {
    if (!['nenhuma', 'token', 'app'].includes(ia.modo)) erros.push('identidade_agente.modo deve ser nenhuma, token ou app');
    for (const k of ['token_env', 'chave_privada_env'])
      if (ia[k] !== undefined && ia[k] !== null && !/^[A-Z][A-Z0-9_]*$/.test(String(ia[k])))
        erros.push(`identidade_agente.${k} deve ser um NOME_DE_VARIAVEL (o valor fica no ambiente, nunca na ficha)`);
    if (ia.modo === 'app' && !(Number.isInteger(ia.app_id) && ia.app_id > 0)) erros.push('identidade_agente.app_id é obrigatório no modo app');
  }
  if (f?.aprovacao_pelo_chat !== undefined && typeof f.aprovacao_pelo_chat !== 'boolean') erros.push('aprovacao_pelo_chat deve ser true ou false');
```

No fim do arquivo:

```js
// Lê a ficha sem validar (detect roda antes de a ficha estar completa). Ilegível → null.
export function lerFichaParcial(cwd, arq = ARQ_FICHA) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(cwd, arq), 'utf8'));
  } catch {
    return null;
  }
}
```

`scripts/governanca/erros.mjs` — trocar o texto de `ANALISTA_IGUAL_AGENTE`:

```js
  ANALISTA_IGUAL_AGENTE:
    'O analista precisa ser outra conta GitHub que a do agente (o GitHub não deixa quem abriu o PR aprová-lo). Configure identidade_agente (conta-robô ou GitHub App) ou ligue aprovacao_pelo_chat no wizard.',
```

E, depois de `ASSINATURA_DE_OUTRO_COMMIT`:

```js
  IDENTIDADE_IGUAL_ANALISTA:
    'O agente usa a mesma conta GitHub de um analista: a aprovação dessa conta não prova nada. Saídas: (1) configurar identidade_agente (token de uma conta-robô ou GitHub App) pelo wizard; (2) ligar aprovacao_pelo_chat na ficha (prova fraca, registrada como tal).',
  TOKEN_AUSENTE: 'Defina a variável de ambiente com o token do agente (nome em identidade_agente.token_env), no sistema ou num .env fora do git.',
  APP_CHAVE_INVALIDA: 'Confira a variável com o caminho da chave privada (.pem) do GitHub App (identidade_agente.chave_privada_env), o app_id e, se preciso, gere a chave de novo.',
  APP_NAO_INSTALADO: 'Instale o GitHub App no repositório (Settings da conta/org → GitHub Apps → Configure → acesso ao repo).',
  CHAT_DESLIGADO: 'A aprovação pelo chat está desligada (aprovacao_pelo_chat: false). Use a review no PR ou ligue pelo wizard.',
  JA_HA_REVIEW: 'Já há review do analista no PR para este commit: ela vale mais que o chat. Rode card-sign <ID> sem --pelo-chat.',
  GH_LOCAL_E_ANALISTA:
    'O gh desta máquina está logado com a conta de um analista: o agente consegue agir como ele. Deixe o gh logado só com a conta do agente ou use o modo app.',
  REMOTO_SSH: 'Com identidade do agente, use o remoto https: git remote set-url origin https://github.com/<dono>/<repo>.git',
```

- [ ] **Step 4: Rodar e ver passar** — `node --test scripts/tests/identidade.test.mjs` → PASS.

- [ ] **Step 5: Rodar o resto** — `bash scripts/check-governanca.sh` → PASS (nada mudou para fichas antigas).

- [ ] **Step 6: Commit**

```bash
git add scripts/governanca/ficha.mjs scripts/governanca/erros.mjs scripts/tests/identidade.test.mjs
git commit -m "feat(identidade): campos da ficha, validacao e erros novos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Token do agente no `gh` e no `git push`

**Files:** Modify `scripts/governanca/gh.mjs`, `scripts/governanca/git.mjs`, `scripts/tests/fixtures/fake-gh.mjs`; Test `scripts/tests/identidade.test.mjs`.

- [ ] **Step 1: Fake-gh registra o token e aceita regra por token**

Em `scripts/tests/fixtures/fake-gh.mjs`, trocar a linha do `appendFileSync` e a do `find`:

```js
if (process.env.AGENTIC_OS_GH_LOG)
  fs.appendFileSync(process.env.AGENTIC_OS_GH_LOG, JSON.stringify({ args, input, body_file, gh_token: process.env.GH_TOKEN || null }) + '\n');
const regras = JSON.parse(fs.readFileSync(process.env.AGENTIC_OS_GH_SCENARIO, 'utf8'));
// Regra com "token" só casa quando o GH_TOKEN do processo é esse (simula contas diferentes).
const r = regras.find((x) => new RegExp(x.re).test(linha) && (x.token === undefined || x.token === (process.env.GH_TOKEN || null)));
```

E no comentário do topo: `em AGENTIC_OS_GH_LOG (uma linha JSON {args, input, body_file, gh_token}); regra com "token" casa só esse GH_TOKEN.`

- [ ] **Step 2: Testes**

Acrescentar em `scripts/tests/identidade.test.mjs`:

```js
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
```

- [ ] **Step 3: Rodar e ver falhar** — `node --test scripts/tests/identidade.test.mjs` → FAIL (`usarTokenAgente` não existe).

- [ ] **Step 4: Implementar `gh.mjs`**

Antes de `export function gh(`:

```js
// Token do agente (identidade separada): só em memória deste processo. null = login do gh local.
let tokenAgente = null;
let expira = 0;
let renovar = null;
export function usarTokenAgente(token, { expiraEm = 0, renovador = null } = {}) {
  tokenAgente = token || null;
  expira = expiraEm;
  renovar = renovador;
}
export const tokenAgenteAtual = () => tokenAgente;
```

Trocar a função `gh` inteira por:

```js
export function gh(args, { input, permitirFalha = false, token } = {}) {
  verificarChamada(args, input);
  if (token === undefined && tokenAgente && renovar && expira && expira - Date.now() < 5 * 60000) {
    const n = renovar();
    tokenAgente = n.token;
    expira = n.expira;
  }
  const t = token !== undefined ? token : tokenAgente;
  const esconder = (s) => [t, tokenAgente].filter(Boolean).reduce((a, x) => a.split(x).join('***'), String(s ?? ''));
  const fake = process.env.AGENTIC_OS_GH_FAKE;
  const bin = fake ? process.execPath : process.env.AGENTIC_OS_GH_BIN || 'gh';
  const argv = fake ? [fake, ...args] : args;
  const r = spawnSync(bin, argv, {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', ...(t ? { GH_TOKEN: t } : {}) },
  });
  if (r.error?.code === 'ENOENT') throw new ErroGov('GH_AUSENTE');
  const saida = { code: r.status ?? 1, stdout: r.stdout || '', stderr: esconder(r.stderr || '') };
  if (saida.code !== 0 && !permitirFalha) throw classificar({ ...saida, stdout: esconder(saida.stdout) }, args.map(esconder));
  return saida;
}
```

- [ ] **Step 5: Implementar `git.mjs`**

Trocar o import e a função `git`:

```js
import { spawnSync } from 'node:child_process';
import { ErroGov } from './erros.mjs';
import { tokenAgenteAtual } from './gh.mjs';

// Credencial do agente só no ambiente do comando (nunca em .git/config nem na linha de comando).
export function envPush(token) {
  if (!token) return {};
  const b = Buffer.from(`x-access-token:${token}`).toString('base64');
  return { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${b}` };
}

// Todo comando que fala com o remoto usa a credencial do agente (se houver); os locais, não.
const REMOTOS = new Set(['push', 'fetch', 'ls-remote', 'pull']);
export const envGit = (args) => (REMOTOS.has(args[0]) ? envPush(tokenAgenteAtual()) : {});

export function git(cwd, args, { permitirFalha = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes', ...envGit(args) }, timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
  const res = { code: r.status ?? 1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  if (res.code !== 0 && !permitirFalha) throw new ErroGov('GIT_FALHOU', `git ${args.join(' ')} → ${res.err}`);
  return res;
}

// Com identidade do agente, o origin precisa ser https (o cabeçalho de credencial não vale em SSH:
// o push sairia com a chave SSH do usuário).
export function exigirRemotoHttps(cwd) {
  const url = git(cwd, ['remote', 'get-url', 'origin'], { permitirFalha: true }).out;
  if (url && !/^https:\/\//i.test(url))
    throw new ErroGov('REMOTO_SSH', `O origin é ${url.replace(/\/\/[^@/]*@/, '//')}; com identidade do agente ele precisa ser https.`);
}
```

`pushBranch` não muda (o `push` já recebe a credencial pelo `envGit`).

(`REMOTO_SSH` foi criado na Task 1.)

- [ ] **Step 6: Rodar** — `node --test scripts/tests/identidade.test.mjs` → PASS; `bash scripts/check-governanca.sh` → PASS.

- [ ] **Step 7: Commit** — `feat(identidade): token do agente no gh e no git push, oculto nas mensagens`

---

### Task 3: `identidade.mjs` — modos `nenhuma` e `token`, trava de separação

**Files:** Create `scripts/governanca/identidade.mjs`; Test `scripts/tests/identidade.test.mjs`.

- [ ] **Step 1: Testes**

```js
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
```

- [ ] **Step 2: Rodar e ver falhar** — módulo não existe.

- [ ] **Step 3: Implementar** `scripts/governanca/identidade.mjs`:

```js
// Identidade do agente no GitHub, por projeto (ficha.identidade_agente).
// nenhuma = login do gh local · token = token pronto numa variável de ambiente · app = token de instalação de um GitHub App.
// O token fica só em memória (gh.mjs); nunca em ficha, log, estado ou .git/config.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson, usarTokenAgente } from './gh.mjs';

export const PADRAO = { modo: 'nenhuma', token_env: 'AGENTIC_OS_GH_TOKEN', app_id: null, chave_privada_env: 'AGENTIC_OS_APP_KEY_PATH' };
export const identidadeDe = (ficha) => ({ ...PADRAO, ...(ficha?.identidade_agente || {}) });

let atual = null; // { modo, login }

export function desativarIdentidade() {
  usarTokenAgente(null);
  atual = null;
}

export function ativarIdentidade(ficha) {
  const ia = identidadeDe(ficha);
  if (ia.modo === 'token') {
    const token = String(process.env[ia.token_env] || '').trim();
    if (!token) throw new ErroGov('TOKEN_AUSENTE', `Variável ${ia.token_env} vazia.`);
    usarTokenAgente(token);
    atual = { modo: 'token', login: ghJson(['api', 'user'])?.login || null };
    return atual;
  }
  if (ia.modo === 'app') return ativarApp(ficha, ia);
  usarTokenAgente(null);
  atual = { modo: 'nenhuma', login: null };
  return atual;
}

// Login de quem age como agente. No modo nenhuma, pergunta ao gh local a cada vez (sem cache entre testes/projetos).
export function loginAgente() {
  if (atual && atual.modo !== 'nenhuma' && atual.login) return atual.login;
  return ghJson(['api', 'user'])?.login || null;
}

export const modoAtivo = () => atual?.modo || 'nenhuma';

export function exigirSeparacao(ficha) {
  const login = loginAgente();
  const igual = (ficha.analistas || []).some((a) => String(a).toLowerCase() === String(login || '').toLowerCase());
  if (igual && ficha.aprovacao_pelo_chat !== true)
    throw new ErroGov('IDENTIDADE_IGUAL_ANALISTA', `O agente age como "${login}", que está em analistas.`);
  return { login, igual };
}

function ativarApp() {
  throw new ErroGov('APP_CHAVE_INVALIDA', 'Modo app ainda não disponível.');
}
```

(`crypto`, `fs` e `gh` são usados na Task 4.)

- [ ] **Step 4: Rodar** — `node --test scripts/tests/identidade.test.mjs` → PASS.

- [ ] **Step 5: Commit** — `feat(identidade): modos nenhuma e token e trava de separacao`

---

### Task 4: `identidade.mjs` — modo `app`

**Files:** Modify `scripts/governanca/identidade.mjs`; Test `scripts/tests/identidade.test.mjs`.

- [ ] **Step 1: Teste**

```js
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
```

- [ ] **Step 2: Rodar e ver falhar** — `APP_CHAVE_INVALIDA: Modo app ainda não disponível` no primeiro `ativarIdentidade`.

- [ ] **Step 3: Implementar** — em `identidade.mjs`, trocar a função provisória `ativarApp` por:

```js
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function jwtApp(appId, pem, agoraMs = Date.now()) {
  const s = Math.floor(agoraMs / 1000);
  const corpo = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iat: s - 60, exp: s + 540, iss: String(appId) }))}`;
  let assinatura;
  try {
    assinatura = crypto.sign('RSA-SHA256', Buffer.from(corpo), pem);
  } catch {
    throw new ErroGov('APP_CHAVE_INVALIDA', 'A chave privada não assina (formato .pem inválido).');
  }
  return `${corpo}.${b64url(assinatura)}`;
}

function lerChave(ia) {
  const caminho = String(process.env[ia.chave_privada_env] || '').trim();
  if (!caminho) throw new ErroGov('APP_CHAVE_INVALIDA', `Variável ${ia.chave_privada_env} vazia.`);
  try {
    return fs.readFileSync(caminho, 'utf8');
  } catch {
    throw new ErroGov('APP_CHAVE_INVALIDA', `Não consegui ler a chave indicada por ${ia.chave_privada_env}.`);
  }
}

function emitir(ficha, ia, pem) {
  const jwt = jwtApp(ia.app_id, pem);
  const H = ['-H', `Authorization: Bearer ${jwt}`];
  const inst = gh(['api', ...H, `repos/${ficha.repo}/installation`], { token: jwt, permitirFalha: true });
  if (inst.code !== 0) {
    const t = `${inst.stderr}\n${inst.stdout}`;
    if (/404|Not Found/i.test(t)) throw new ErroGov('APP_NAO_INSTALADO', `O App ${ia.app_id} não está instalado em ${ficha.repo}.`);
    if (/401|JSON web token|Bad credentials|Integration not found/i.test(t)) throw new ErroGov('APP_CHAVE_INVALIDA', 'O GitHub recusou a assinatura do App (app_id ou chave errada).');
    throw new ErroGov('GH_FALHOU', `instalação do App → ${t.trim().slice(0, 300)}`);
  }
  const id = JSON.parse(inst.stdout).id;
  const r = ghJson(['api', '-X', 'POST', ...H, `app/installations/${id}/access_tokens`], { token: jwt });
  return { token: r.token, expira: Date.parse(r.expires_at) || Date.now() + 3600000, jwt };
}

function ativarApp(ficha, ia) {
  const pem = lerChave(ia);
  const e = emitir(ficha, ia, pem);
  const slug = ghJson(['api', '-H', `Authorization: Bearer ${e.jwt}`, 'app'], { token: e.jwt })?.slug;
  usarTokenAgente(e.token, {
    expiraEm: e.expira,
    renovador: () => {
      const n = emitir(ficha, ia, pem);
      return { token: n.token, expira: n.expira };
    },
  });
  atual = { modo: 'app', login: slug ? `${slug}[bot]` : null };
  return atual;
}
```

- [ ] **Step 4: Rodar** — `node --test scripts/tests/identidade.test.mjs` → PASS.

- [ ] **Step 5: Commit** — `feat(identidade): modo GitHub App com JWT RS256 e token de instalacao`

---

### Task 4b: Verificação real cedo (controlador, com "sim" do usuário) — antes das Tasks 5–10

Confirma no GitHub de verdade as premissas que, se falharem, mudam o design. Pede ao usuário: um GitHub App de
teste (permissões da Task 10) instalado num repo privado descartável da org de teste, a `.pem` fora de qualquer
repo e a variável com o caminho. Nada disso vai para arquivo versionado.

- [ ] Script descartável no scratchpad (fora do repo) que importa `identidade.mjs`, ativa o modo `app` com uma ficha mínima do repo descartável e roda:
  1. `ativarIdentidade` → `login` = `<slug>[bot]` (prova que `-H Authorization: Bearer` + `GH_TOKEN=<jwt>` chega aos endpoints do App).
  2. `gh issue create` e `gh issue comment` → autor = `<slug>[bot]` no GitHub.
  3. Branch com 1 commit + `pushBranch` (remoto https) → push aceito; `git log` remoto mostra o commit; `.git/config` sem token.
  4. `gh pr create` → autor do PR = `<slug>[bot]`.
  5. `gh project item-add` + `item-edit` num Project **da org** e num Project **de usuário**.
- [ ] Mesmo roteiro com modo `token` (fine-grained PAT de uma conta-robô, se o usuário tiver; senão, registrar como não testado).
- [ ] Se o item 5 falhar em Project de usuário (esperado: token de App e PAT fine-grained podem não escrever em Project de usuário): acrescentar à Task 7 o aviso `PROJECT_DE_USUARIO` no `detect` quando `modo != nenhuma` e `project.owner` for usuário (o wizard recomenda Project da org) e à Task 10 o texto no wizard e no GOVERNANCA. Qualquer outra premissa falha → parar e rever o spec com o usuário.
- [ ] Apagar o repo descartável (com "sim"). Registrar os resultados (sem nomes de org/conta) para o PR.

---

### Task 5: Assinatura — agente resolvido, linha `Tipo`, aprovação pelo chat

**Files:** Modify `scripts/governanca/assinatura.mjs`; Test `scripts/tests/hom.test.mjs`.

- [ ] **Step 1: Testes** — acrescentar no fim de `scripts/tests/hom.test.mjs` (usa `projeto`, `estadoHom`, `cenario`, `ok`, `REVIEWS`, `PRVIEW`, `DEP_OK`, `ITEM`, `STATUS`, `statusDe`, `rv`, `ficha` já definidos no arquivo):

```js
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
```

E o teste do risco registrado (identidade separada, mas o `gh` local logado como analista):

```js
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
```

(`assinaturaBase(...).slice(1)` tira a regra `api user → agente` da base; a chamada com `token: ''` cai na regra sem token.)

Nota: `chatBase` usa `^api user$ → analista`, o mesmo login do analista: o caminho pelo chat existe justamente para o agente = analista com `aprovacao_pelo_chat: true` (a trava fica no CLI, Task 6). No teste de `JA_HA_REVIEW`, a review de `outra` (analista diferente do agente) é a prova forte.

- [ ] **Step 2: Rodar e ver falhar** — `node --test scripts/tests/hom.test.mjs` → FAIL (sem `Tipo`, `--pelo-chat` ignorado).

- [ ] **Step 3: Implementar** — substituir `scripts/governanca/assinatura.mjs` inteiro por:

```js
// Assinatura (Parte 3): LÊ a review do analista no PR (só GET) e registra aprovação ou reprovação.
// O agente nunca assina: review da conta do agente não vale. Aprovação não gera commit (descartaria a review).
// Opt-in (aprovacao_pelo_chat): registra a declaração do usuário no chat, marcada como prova fraca.
import fs from 'node:fs';
import path from 'node:path';
import { acharCartao, anexarNaSecao, ghComCorpo, moverCartao, registrarSecao } from './cartao.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';
import { gravarEstadoHom, lerEstadoHom, marcarStatus, ultimoStatus } from './hom.mjs';
import { loginAgente, modoAtivo } from './identidade.mjs';
import { acharTask, validarId } from './supervisor.mjs';

const VALE = ['APPROVED', 'CHANGES_REQUESTED'];
export const TIPO_REVIEW = 'review no GitHub';
export const TIPO_REVIEW_RISCO = 'review no GitHub ⚠️ gh local = analista';
export const TIPO_CHAT = 'chat, sem prova do GitHub';

// Com identidade separada, o gh local logado como analista ainda permitiria ao agente aprovar por ele:
// a assinatura vale, mas registra o risco (decisão do usuário: registrar, não bloquear).
function tipoDaReview(ficha) {
  if (modoAtivo() === 'nenhuma') return TIPO_REVIEW;
  const local = String(ghJson(['api', 'user'], { token: '' })?.login || '').toLowerCase();
  return (ficha.analistas || []).some((a) => String(a).toLowerCase() === local) ? TIPO_REVIEW_RISCO : TIPO_REVIEW;
}
const comAviso = (res, tipo) => (tipo === TIPO_REVIEW_RISCO ? { ...res, aviso: 'GH_LOCAL_E_ANALISTA' } : res);

export function decidir({ reviews, analistas, agente, sha, desde }) {
  const permitidos = new Set(analistas.map((a) => String(a).toLowerCase()));
  const ag = String(agente || '').toLowerCase();
  const ultima = new Map();
  const ordenadas = (reviews || [])
    .filter((r) => r?.user?.login && [...VALE, 'DISMISSED'].includes(r.state))
    .filter((r) => permitidos.has(r.user.login.toLowerCase()) && r.user.login.toLowerCase() !== ag)
    .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  for (const r of ordenadas) ultima.set(r.user.login.toLowerCase(), r);
  const ult = [...ultima.values()].filter((r) => VALE.includes(r.state));
  const rep = ult.find((r) => r.state === 'CHANGES_REQUESTED' && r.commit_id === sha);
  if (rep) return { situacao: 'reprovado', review: rep };
  const apr = ult.find((r) => r.state === 'APPROVED' && r.commit_id === sha && String(r.submitted_at) > String(desde));
  if (apr) return { situacao: 'aprovado', review: apr };
  if (ult.some((r) => r.state === 'APPROVED')) return { situacao: 'outro_commit' };
  return { situacao: 'aguardando' };
}

const umaLinha = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const celula = (s) => umaLinha(s).replace(/\|/g, '\\|');
const quemDe = (reg) => (reg.tipo === TIPO_CHAT ? `${reg.analista}, pelo chat (sem prova do GitHub)` : reg.analista);

export function textoAssinatura(reg) {
  return [
    '| Campo | Valor |',
    '|---|---|',
    `| Cartão | #${reg.cartao} |`,
    `| Repositório | ${reg.repo} |`,
    `| PR | ${reg.pr} |`,
    `| Tipo | ${reg.tipo || TIPO_REVIEW} |`,
    `| Analista | ${reg.analista} |`,
    ...(reg.tipo === TIPO_CHAT ? ['| Declarado por | analista da ficha (não autenticado) |', `| Frase | "${celula(reg.texto)}" |`] : []),
    `| Data/hora | ${reg.em} |`,
    `| Commit homologado | ${reg.commit} |`,
    `| Ambiente | ${reg.ambiente} |`,
    `| Resultado | ${reg.resultado} |`,
    `| Evidência | ${reg.evidencia} |`,
    '',
    reg.texto ? `> ${umaLinha(reg.texto)}` : '> (sem comentário na review)',
  ].join('\n');
}

function lerReviews(ficha, e) {
  const paginas = ghJson(['api', '--paginate', '--slurp', `repos/${ficha.repo}/pulls/${e.pr.number}/reviews?per_page=100`]) || [];
  return [paginas].flat(2);
}

function conferirPr(ficha, e, n) {
  const pr = ghJson(['pr', 'view', e.pr.url, '--repo', ficha.repo, '--json', 'state,headRefOid,body']) || {};
  if (pr.state !== 'OPEN') throw new ErroGov('SEM_HOM', 'O PR não está mais aberto (PR fechado); não há o que assinar.');
  if (pr.headRefOid !== e.sha) throw new ErroGov('SEM_HOM', 'O PR tem commit depois do HOM; rode /cartao revisar e /cartao hom de novo.');
  if (ultimoStatus(ficha, e.deploy_id) !== 'success')
    throw new ErroGov('SEM_HOM', `O HOM não está mais com este cartão (outro cartão publicou ou o deploy foi desativado); rode /cartao hom ${n} de novo.`);
}

// Intenção gravada ANTES dos efeitos externos; cada efeito é marcado ao concluir (retry não duplica).
function aplicarAprovacao(cwd, ficha, n, e, base, pendente) {
  const curto = e.sha.slice(0, 7);
  const cartao = acharCartao(ficha, n);
  const pend = pendente || { ...base, efeitos: {} };
  const salvar = () => gravarEstadoHom(cwd, n, { ...e, assinatura: null, assinatura_pendente: pend });
  salvar();
  const feito = (k, fn) => {
    if (pend.efeitos[k]) return;
    fn();
    pend.efeitos[k] = true;
    salvar();
  };
  feito('pr', () => {
    const atual = ghJson(['pr', 'view', e.pr.url, '--repo', ficha.repo, '--json', 'body'])?.body || '';
    ghComCorpo(['pr', 'edit', e.pr.url, '--repo', ficha.repo], registrarSecao(atual, 'Assinatura', `## Assinatura\n\n${textoAssinatura(pend)}`));
  });
  feito('mover', () => moverCartao(ficha, cartao.itemId, 'aprovado'));
  feito('comentario', () =>
    gh(['issue', 'comment', String(n), '--repo', ficha.repo, '--body', `Homologação aprovada por ${quemDe(pend)} em ${pend.em} (commit ${curto}). Evidência: ${pend.evidencia}`]));
  feito('status', () => marcarStatus(ficha, e.deploy_id, 'inactive', { descricao: `Cartão #${n} aprovado` }));
  const { efeitos: _x, ...reg } = pend;
  const { assinatura_pendente: _p, ...limpo } = e;
  gravarEstadoHom(cwd, n, { ...limpo, assinatura: reg });
  return { ok: true, situacao: 'aprovado', assinatura: reg };
}

function aplicarReprovacao(cwd, ficha, n, e, reg, reprovacoes) {
  const curto = e.sha.slice(0, 7);
  const cartao = acharCartao(ficha, n);
  const salvar = () => gravarEstadoHom(cwd, n, { ...e, assinatura: null, reprovacoes });
  salvar();
  const feito = (k, fn) => {
    if (reg.efeitos[k]) return;
    fn();
    reg.efeitos[k] = true;
    salvar();
  };
  const task = acharTask(cwd, n);
  feito('task', () => {
    if (!task) return;
    const abs = path.join(cwd, task);
    const atual = fs.readFileSync(abs, 'utf8');
    if (atual.includes(reg.evidencia)) return;
    fs.writeFileSync(abs, anexarNaSecao(atual, 'Homologação',
      `- ${reg.em} — REPROVADO por ${quemDe(reg)} (commit ${curto}). Motivo: ${umaLinha(reg.texto) || '(sem texto)'}. Evidência: ${reg.evidencia}`));
  });
  feito('mover', () => moverCartao(ficha, cartao.itemId, 'em_andamento'));
  feito('comentario', () =>
    gh(['issue', 'comment', String(n), '--repo', ficha.repo, '--body', `Homologação reprovada por ${quemDe(reg)} em ${reg.em} (commit ${curto}). Motivo: ${umaLinha(reg.texto)}. Evidência: ${reg.evidencia}`]));
  feito('status', () => marcarStatus(ficha, e.deploy_id, 'inactive', { descricao: `Cartão #${n} reprovado` }));
  reg.concluido = true;
  salvar();
  return { ok: true, situacao: 'reprovado', pontos: reg.texto, ...(task ? { task_atualizado: task, aviso: 'TASK atualizado no disco: commite junto com a correção.' } : {}) };
}

function assinarPeloChat(cwd, ficha, n, e, o) {
  if (ficha.aprovacao_pelo_chat !== true) throw new ErroGov('CHAT_DESLIGADO');
  if (!['aprovado', 'reprovado'].includes(o.resultado)) throw new ErroGov('PARAMETRO', '--pelo-chat exige --resultado aprovado|reprovado.');
  const frase = umaLinha(o.frase);
  if (!frase) throw new ErroGov('PARAMETRO', '--pelo-chat exige --frase com o texto literal do usuário.');
  if (e.assinatura && e.assinatura.commit === e.sha) return { ok: true, situacao: 'aprovado', ja_registrado: true, assinatura: e.assinatura };
  const reprovacoes = [...(e.reprovacoes || [])];
  // Retomada: decisão pelo chat interrompida no meio continua de onde parou (não rechecar o HOM, já pode estar inactive).
  const pendente = o.resultado === 'aprovado' && e.assinatura_pendente?.tipo === TIPO_CHAT ? e.assinatura_pendente : null;
  let reg = o.resultado === 'reprovado' ? reprovacoes.find((x) => x.tipo === TIPO_CHAT && x.concluido === false) || null : null;
  if (!pendente && !reg) {
    const d = decidir({ reviews: lerReviews(ficha, e), analistas: ficha.analistas, agente: loginAgente(), sha: e.sha, desde: e.em });
    if (d.situacao === 'aprovado' || d.situacao === 'reprovado') throw new ErroGov('JA_HA_REVIEW');
    conferirPr(ficha, e, n);
  }
  const em = new Date().toISOString();
  const base = {
    cartao: n, repo: ficha.repo, pr: e.pr.url, tipo: TIPO_CHAT, analista: `${ficha.analistas[0]} (declarado)`, em, commit: e.sha,
    ambiente: ficha.ambientes.hom, resultado: o.resultado, evidencia: `declaração no chat em ${em}`, texto: frase,
  };
  if (o.resultado === 'aprovado') return { ...aplicarAprovacao(cwd, ficha, n, e, base, pendente), tipo: TIPO_CHAT };
  if (!reg) {
    reg = { ...base, concluido: false, efeitos: {} };
    reprovacoes.push(reg);
  }
  return { ...aplicarReprovacao(cwd, ficha, n, e, reg, reprovacoes), tipo: TIPO_CHAT };
}

export function cardSign(cwd, ficha, id, o = {}) {
  const n = validarId(id);
  const e = lerEstadoHom(cwd, n);
  if (!e) throw new ErroGov('SEM_HOM');
  if (o.peloChat) return assinarPeloChat(cwd, ficha, n, e, o);
  if (e.assinatura && e.assinatura.commit === e.sha) return { ok: true, situacao: 'aprovado', ja_registrado: true, assinatura: e.assinatura };
  const d = decidir({ reviews: lerReviews(ficha, e), analistas: ficha.analistas, agente: loginAgente(), sha: e.sha, desde: e.em });
  if (d.situacao === 'aguardando') return { ok: true, situacao: 'aguardando_analista', pr: e.pr.url };
  if (d.situacao === 'outro_commit') throw new ErroGov('ASSINATURA_DE_OUTRO_COMMIT');
  const r = d.review;
  const reprovacoes = [...(e.reprovacoes || [])];
  let reg = d.situacao === 'reprovado' ? reprovacoes.find((x) => x.evidencia === r.html_url) : null;
  if (reg && reg.concluido !== false) return { ok: true, situacao: 'reprovado', ja_registrado: true, pontos: (r.body || '').trim() };
  const pendente = d.situacao === 'aprovado' && e.assinatura_pendente?.evidencia === r.html_url ? e.assinatura_pendente : null;
  if (!reg && !pendente) conferirPr(ficha, e, n);
  const tipo = pendente?.tipo || reg?.tipo || tipoDaReview(ficha);
  const base = {
    cartao: n, repo: ficha.repo, pr: e.pr.url, tipo, analista: r.user.login, em: r.submitted_at, commit: e.sha,
    ambiente: ficha.ambientes.hom, resultado: d.situacao, evidencia: r.html_url, texto: (r.body || '').trim(),
  };
  if (d.situacao === 'aprovado') return comAviso(aplicarAprovacao(cwd, ficha, n, e, base, pendente), tipo);
  if (!reg) {
    reg = { ...base, concluido: false, efeitos: {} };
    reprovacoes.push(reg);
  }
  return comAviso(aplicarReprovacao(cwd, ficha, n, e, reg, reprovacoes), tipo);
}
```

- [ ] **Step 4: Rodar** — `node --test scripts/tests/hom.test.mjs` → PASS (os testes antigos de `card-sign` continuam passando: mesmo comportamento, só ganham a linha `Tipo`).

- [ ] **Step 5: Commit** — `feat(identidade): assinatura com agente resolvido, linha Tipo e aprovacao pelo chat`

---

### Task 6: CLI — ativar identidade, trava em `card-hom`/`card-sign`, flags do chat

**Files:** Modify `scripts/github-setup.mjs`; Test `scripts/tests/hom.test.mjs`.

- [ ] **Step 1: Testes**

No teste existente `CLI: card-hom --dry-run e card-sign; flags booleanas novas` de `hom.test.mjs`, trocar `cenario([PR, SEM_DEPLOY]);` por:

```js
  cenario([PR, SEM_DEPLOY, ok('^api user$', { login: 'agente' })]);
```

E acrescentar no fim do arquivo:

```js
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
  gravar(ficha({ analistas: ['agente'], identidade_agente: { modo: 'token', token_env: 'TESTE_TOKEN_CLI' } }));
  process.env.TESTE_TOKEN_CLI = 'tok_cli';
  const c = cenario([PR, SEM_DEPLOY, { ...ok('^api user$', { login: 'robo' }), token: 'tok_cli' }]);
  const r = cli(p.dir, ['card-sign', '101']);
  assert.equal(r.json.erro.codigo, 'SEM_HOM');
  assert.ok(c.chamadas().every((x) => x.gh_token === 'tok_cli'));
  assert.doesNotMatch(r.stderr + JSON.stringify(r.json), /tok_cli/);
  delete process.env.TESTE_TOKEN_CLI;
});
```

(A ficha fica na árvore sem commit; `card-sign` não confere árvore limpa e `card-hom --dry-run` para na trava antes disso.)

- [ ] **Step 2: Rodar e ver falhar** — `node --test scripts/tests/hom.test.mjs` → FAIL (sem trava, sem `--pelo-chat`).

- [ ] **Step 3: Implementar `scripts/github-setup.mjs`**

Comentário de uso: trocar a linha do `card-sign` por:

```js
//   node github-setup.mjs card-sign <ID> [--pelo-chat --resultado aprovado|reprovado --frase "texto literal do usuário"]   ← chat só se a ficha permitir
```

E acrescentar antes de `// Travas fixas:`:

```js
// Identidade: card-* e review-* rodam como o agente (ficha.identidade_agente); detect e apply, como o usuário.
```

Imports — acrescentar:

```js
import { ativarIdentidade, exigirSeparacao } from './governanca/identidade.mjs';
import { exigirRemotoHttps } from './governanca/git.mjs';
import { ARQ_FICHA, gravarFicha, lerFicha, lerFichaParcial } from './governanca/ficha.mjs';
```

(trocando o import antigo de `ficha.mjs`).

`FLAGS`: acrescentar `'resultado', 'frase'`. `BOOLEANAS`: acrescentar `'--pelo-chat': 'peloChat'`. Em `opcoes`, inicializar `peloChat: false`.

Em `rodar`, depois de `const arq = o.ficha || ARQ_FICHA;`:

```js
  const comoAgente = ({ separar = false } = {}) => {
    const f = lerFicha(cwd, arq);
    if (ativarIdentidade(f).modo !== 'nenhuma') exigirRemotoHttps(cwd);
    if (separar) exigirSeparacao(f);
    return f;
  };
```

Trocar os `case` (de `detect` a `card-sign`):

```js
    case 'detect':
      return { ok: true, ...detect(cwd, { owner: o.owner, project: o.project ? Number(o.project) : undefined, analistas: o.analista, parcial: lerFichaParcial(cwd, arq) }) };
    case 'apply': {
      const r = aplicar(cwd, lerFicha(cwd, arq), { dryRun: o.dryRun });
      if (r.ficha) gravarFicha(cwd, r.ficha, arq);
      return r;
    }
    case 'card-start':
      return cardStart(cwd, comoAgente(), o._[0], { tipo: o.tipo, desc: o.desc, dryRun: o.dryRun });
    case 'card-pr':
      return cardPr(cwd, comoAgente(), o._[0], { dryRun: o.dryRun });
    case 'review-check':
      return reviewCheck(cwd, comoAgente(), o._[0]);
    case 'review-record':
      return reviewRecord(cwd, comoAgente(), o._[0], o.parecer);
    case 'review-decide':
      return reviewDecide(cwd, comoAgente(), o._[0], { seguir: o.seguir, novaRodada: o.novaRodada, motivo: o.motivo });
    case 'card-hom':
      return cardHom(cwd, comoAgente({ separar: true }), o._[0], {
        dryRun: o.dryRun, furarFila: o.furarFila, motivo: o.motivo, migracaoAutorizada: o.migracaoAutorizada,
        confirmoComando: o.confirmoComando, publicadoManual: o.publicadoManual,
      });
    case 'card-sign':
      return cardSign(cwd, comoAgente({ separar: true }), o._[0], { peloChat: o.peloChat, resultado: o.resultado, frase: o.frase });
```

(`detect` recebe `parcial` na Task 7; até lá o parâmetro extra é ignorado.)

- [ ] **Step 4: Rodar** — `bash scripts/check-governanca.sh` → PASS.

- [ ] **Step 5: Commit** — `feat(identidade): CLI ativa a identidade do agente e trava agente = analista`

---

### Task 7: `detect` e `apply` com identidade

**Files:** Modify `scripts/governanca/detect.mjs`, `scripts/governanca/apply.mjs`; Test `scripts/tests/governanca.test.mjs`.

- [ ] **Step 1: Teste** — em `scripts/tests/governanca.test.mjs`, logo depois dos imports/ajudantes do topo acrescentar `delete process.env.GH_TOKEN;`, e depois do teste `detect: lê git, repo, ...`:

```js
test('detect: identidade do agente (token), conflito e aviso do gh local; chat libera analista = agente', async () => {
  const { detect } = await imp('detect.mjs');
  const { dir } = repoGit();
  const extra = [ok('^api users/agente$', { id: 7, login: 'agente' }), ok('^api repos/dono/app/collaborators/agente$', '')];
  process.env.TESTE_TOKEN_DETECT = 'tok_d';
  cenario([{ ...ok('^api user$', { login: 'robo' }), token: 'tok_d' }, ...extra, ...BASE]);
  const tok = { analistas: ['agente'], identidade_agente: { modo: 'token', token_env: 'TESTE_TOKEN_DETECT' } };
  const r = detect(dir, { project: 3, analistas: ['agente'], parcial: tok });
  assert.deepEqual([r.identidade.modo, r.identidade.login_agente, r.identidade.login_gh_local, r.identidade.conflito], ['token', 'robo', 'agente', false]);
  assert.deepEqual(r.identidade.avisos, ['GH_LOCAL_E_ANALISTA']);
  assert.deepEqual(r.analistas[0], { login: 'agente', id: 7, colaborador: true });
  delete process.env.TESTE_TOKEN_DETECT;
  cenario([...extra, ...BASE]);
  const r2 = detect(dir, { project: 3, analistas: ['agente'], parcial: { analistas: ['agente'], aprovacao_pelo_chat: true } });
  assert.deepEqual([r2.identidade.modo, r2.identidade.login_agente, r2.identidade.conflito], ['nenhuma', 'agente', true]);
  assert.deepEqual(r2.analistas[0], { login: 'agente', id: 7, colaborador: true, igual_agente: true });
  assert.equal(detect(dir, { project: 3, analistas: ['agente'], parcial: { analistas: ['agente'] } }).analistas[0].erro, 'ANALISTA_IGUAL_AGENTE');
  assert.ok(detect(dir, { project: 3, parcial: tok }).identidade.avisos.includes('TOKEN_AUSENTE'));
  assert.equal(detect(dir, { project: 3 }).identidade.modo, 'nenhuma');
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test scripts/tests/governanca.test.mjs` → FAIL (`r.identidade` indefinido).

- [ ] **Step 3: Implementar `detect.mjs`**

Imports — acrescentar:

```js
import { ErroGov } from './erros.mjs';
import { ativarIdentidade, desativarIdentidade, identidadeDe } from './identidade.mjs';
```

(se `ErroGov` já é importado, não duplicar.)

Trocar `checarAnalista`:

```js
export function checarAnalista(repo, login, loginAgente, { permitirIgual = false } = {}) {
  const igual = String(login).toLowerCase() === String(loginAgente).toLowerCase();
  if (igual && !permitirIgual) return { login, erro: 'ANALISTA_IGUAL_AGENTE' };
  const u = gh(['api', `users/${login}`], { permitirFalha: true });
  if (u.code !== 0) return { login, erro: 'ANALISTA_INEXISTENTE' };
  const id = JSON.parse(u.stdout).id;
  const colaborador = repo ? gh(['api', `repos/${repo}/collaborators/${login}`], { permitirFalha: true }).code === 0 : false;
  return { login, id, colaborador, ...(igual ? { igual_agente: true } : {}) };
}

// Quem age como agente neste projeto. Falha de identidade vira aviso (o wizard mostra e orienta).
export function lerIdentidade(parcial, r) {
  const ia = identidadeDe(parcial);
  const out = { modo: ia.modo, login_agente: ia.modo === 'nenhuma' ? r.login : null, login_gh_local: r.login, conflito: false, avisos: [] };
  const analistas = (parcial?.analistas || []).map((a) => String(a).toLowerCase());
  if (ia.modo !== 'nenhuma') {
    try {
      out.login_agente = ativarIdentidade({ ...parcial, repo: parcial?.repo || r.repo, identidade_agente: ia }).login;
    } catch (e) {
      if (!(e instanceof ErroGov)) throw e;
      out.avisos.push(e.codigo);
    } finally {
      desativarIdentidade();
    }
    if (analistas.includes(String(r.login).toLowerCase())) out.avisos.push('GH_LOCAL_E_ANALISTA');
  }
  out.conflito = !!out.login_agente && analistas.includes(String(out.login_agente).toLowerCase());
  return out;
}
```

Em `detect`: assinatura `export function detect(cwd, { owner, project, analistas = [], parcial = null } = {})`, e trocar a última linha antes do `return r;` por:

```js
  r.identidade = lerIdentidade(parcial, r);
  const agente = r.identidade.login_agente || r.login;
  r.analistas = analistas.map((l) => checarAnalista(r.repo, l, agente, { permitirIgual: parcial?.aprovacao_pelo_chat === true }));
```

`apply.mjs` linha 138: acrescentar `parcial: ficha` ao objeto passado ao `detect`.

- [ ] **Step 4: Rodar** — `bash scripts/check-governanca.sh` → PASS.

- [ ] **Step 5: Commit** — `feat(identidade): detect informa identidade, conflito e aviso do gh local`

---

### Task 8: Procedimento, guardrail 13 e gate

**Files:** Modify `template/F-governanca/automation/procedures/cartao.md`, `template/F-governanca/guardrails-bloco.md`, `scripts/check-governanca.sh`; Test `scripts/tests/governanca.test.mjs`.

- [ ] **Step 1: Teste** — no teste `install: cria ficha, script, procedimento...` de `governanca.test.mjs`, acrescentar:

```js
  assert.match(ler('automation/guardrails.md'), /13\. /);
  assert.match(ler('automation/procedures/cartao.md'), /--pelo-chat/);
  assert.match(ler('automation/procedures/cartao.md'), /IDENTIDADE_IGUAL_ANALISTA/);
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

`guardrails-bloco.md`, depois do 12:

```
13. Usar `card-sign --pelo-chat` sem o usuário ter escrito, por iniciativa própria, que aprova ou reprova o cartão; perguntar "posso aprovar?" para colher um sim; registrar frase que não seja a dele, literal.
```

`procedures/cartao.md`, em `/cartao hom <ID>`, passo 1, acrescentar o item:

```
   - `IDENTIDADE_IGUAL_ANALISTA` → o agente usa a conta de um analista. Mostre o `como_resolver` (configurar
     `identidade_agente` ou ligar `aprovacao_pelo_chat` pelo wizard). Não contorne.
```

Em `/cartao assinatura <ID>`, trocar a última linha (`Nunca aprove, reprove, comente como analista nem registre review por ele.`) por:

```
   - `IDENTIDADE_IGUAL_ANALISTA` → igual ao `/cartao hom`.
3. **Aprovação pelo chat** — só se a ficha tem `aprovacao_pelo_chat: true`. Quando o usuário escrever, por
   iniciativa própria, que aprova ou reprova o cartão, rode
   `node .agentic-os/bin/github-setup.mjs card-sign <ID> --pelo-chat --resultado aprovado|reprovado --frase "<frase literal>"`.
   - `JA_HA_REVIEW` → há review do analista no PR para este commit; rode sem `--pelo-chat`.
   - `CHAT_DESLIGADO` → explique que a aprovação pelo chat está desligada nesta ficha.
   - O registro diz "chat, sem prova do GitHub". Avise o usuário disso.

Nunca aprove, reprove, comente como analista nem registre review por ele. Nunca pergunte "posso aprovar?".
```

`scripts/check-governanca.sh`, última linha:

```bash
node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs scripts/tests/hom.test.mjs scripts/tests/identidade.test.mjs scripts/tests/nomes-reais.test.mjs
```

(O `nomes-reais.test.mjs` nasce na Task 9; até lá, rode os 4 primeiros à mão.)

- [ ] **Step 4: Rodar** — `node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs scripts/tests/hom.test.mjs scripts/tests/identidade.test.mjs` → PASS.

- [ ] **Step 5: Commit** — `feat(identidade): procedimento com aprovacao pelo chat, guardrail 13 e gate`

---

### Task 9: Limpeza de nomes reais + teste de donos

**Files:** Modify `docs/superpowers/specs/2026-11-04-hom-assinatura-design.md`, `docs/superpowers/plans/2026-11-04-hom-assinatura.md`; Create `scripts/tests/nomes-reais.test.mjs`, `scripts/tests/donos-permitidos.txt`.

- [ ] **Step 1: Teste**

`scripts/tests/nomes-reais.test.mjs`:

```js
// O repo do plugin é distribuído: não pode citar login/org de usuários reais.
// Só o autor do plugin, caminhos genéricos do GitHub e nomes fictícios (lista em donos-permitidos.txt).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('repo do plugin não cita donos fora da lista permitida', () => {
  const permitidos = new Set(
    fs.readFileSync(path.join(REPO, 'scripts/tests/donos-permitidos.txt'), 'utf8')
      .split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')),
  );
  const arquivos = spawnSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).stdout
    .split('\n').filter((f) => f && /\.(md|mjs|js|json|html|sh|txt|ya?ml)$/.test(f));
  const padroes = [
    /github\.com[/:]([A-Za-z0-9][A-Za-z0-9-]*)/g,
    /\brepos\/([A-Za-z0-9][A-Za-z0-9-]*)\//g,
    /"repo":\s*"([A-Za-z0-9][A-Za-z0-9-]*)\//g,
    /analistas['"]?\s*:\s*\[\s*['"]([A-Za-z0-9][A-Za-z0-9-]*)/g,
  ];
  const achados = [];
  for (const f of arquivos) {
    const abs = path.join(REPO, f);
    if (!fs.existsSync(abs)) continue;
    const t = fs.readFileSync(abs, 'utf8');
    for (const re of padroes) for (const m of t.matchAll(re)) if (!permitidos.has(m[1].toLowerCase())) achados.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(achados, []);
});
```

`scripts/tests/donos-permitidos.txt` (ponto de partida):

```
# Donos que podem aparecer no repo do plugin. NUNCA acrescente login/org de cliente ou de outra pessoa:
# troque o nome no arquivo por um fictício. Permitidos: autor do plugin, caminhos genéricos do GitHub,
# projetos públicos de terceiros citados como referência, nomes fictícios dos testes.
rasecagapito
users
orgs
settings
apps
login
features
marketplace
cli
anthropics
dono
d
acme
ana
analista
agente
robo
```

- [ ] **Step 2: Rodar** — `node --test scripts/tests/nomes-reais.test.mjs` → lista `achados`. Para cada um:
  - caminho genérico do GitHub ou projeto público de terceiros citado como referência (ex.: `github.com/cli`) → acrescentar o dono ao `donos-permitidos.txt`;
  - nome fictício de teste → acrescentar;
  - **login/org real de pessoa ou cliente → trocar no arquivo** por nome fictício (nunca acrescentar à lista).

- [ ] **Step 3: Limpar os nomes do spec e do plano da Parte 3**

Os nomes reais (uma conta de analista e uma org) estão listados na memória local do controlador
(`plugin-generico-sem-nomes`, fora do repo) — este plano não os repete. Em
`docs/superpowers/specs/2026-11-04-hom-assinatura-design.md` (decisão D5 e seção de teste real) e
`docs/superpowers/plans/2026-11-04-hom-assinatura.md` (Task 6), com Edit `replace_all`:
- a menção à org (entre parênteses, depois do login) → `(conta de teste)`;
- o login da conta de analista → `<analista-de-teste>`.

Conferir: a ferramenta Grep, sem caixa, com os dois nomes da memória, em todo o repo → 0 resultados.

- [ ] **Step 4: Rodar** — `node --test scripts/tests/nomes-reais.test.mjs` → PASS; `bash scripts/check-governanca.sh` → PASS.

- [ ] **Step 5: Commit** — `chore(identidade): tira nomes reais dos docs e testa donos permitidos`

---

### Task 10: Wizard, skill, docs, conformidade e notas

**Files:** Modify `skills/agentic-os/wizard.md`, `skills/agentic-os/SKILL.md`, `docs/GOVERNANCA.md`, `docs/CONFORMANCE-SPEC.md`, `docs/guia-completo.html`, `README.md`, `RELEASE-NOTES.md`.

- [ ] **Wizard** — inserir etapa **12 "Identidade do agente"** depois da 11 (Analista); renumerar 12–17 → 13–18; "7–14 = Governança" → "7–15". Texto da linha:

  `| 12 | Identidade do agente | Explique: com a mesma conta do analista, a aprovação não prova nada e o GitHub não deixa o autor aprovar o próprio PR. Opções, uma tela: **GitHub App** (recomendado em org) · **conta-robô** · **nenhuma**. App: peça o `app_id` e o **nome** da variável com o caminho da `.pem` (padrão `AGENTIC_OS_APP_KEY_PATH`); mostre o passo a passo (criar o App na conta/org, instalar no repo, baixar a chave, guardar fora do repo). Conta-robô: o usuário cria a conta, convida no repo, gera *fine-grained token* do repo e põe na variável (padrão `AGENTIC_OS_GH_TOKEN`, nome em `token_env`). Permissões mínimas: Contents, Pull requests, Issues, Deployments (RW), Metadata (R), Projects (RW). Nenhuma: o analista precisa ser outra pessoa; ofereça `aprovacao_pelo_chat` avisando que é prova fraca. **Nunca** peça token ou chave no chat. Teste: `detect --project <N> --analista <login> --ficha .agentic-os/wizard-estado.json` → mostre "agente = `identidade.login_agente` · analistas = … · ✅" ou os `avisos`/`conflito`. |`

  Na etapa da ficha completa, acrescentar `identidade_agente, aprovacao_pelo_chat`. Na etapa Analista, em `ANALISTA_IGUAL_AGENTE`: "→ explique e siga para a etapa 12 (identidade do agente)".
- [ ] **SKILL.md** (seção da camada F), 1 linha: "Identidade do agente (`identidade_agente`: token de conta-robô ou GitHub App) para o dono do projeto poder ser o analista; sem ela, a assinatura bloqueia, salvo `aprovacao_pelo_chat` (prova fraca, registrada). Ver `docs/GOVERNANCA.md`." Rodar `bash scripts/build-skill.sh` e `bash scripts/check-skill-sync.sh`.
- [ ] **`docs/GOVERNANCA.md`**: seção `## Identidade do agente` antes de `## Requisitos` — problema (autor não aprova o próprio PR; mesma conta não prova nada), analogia do crachá, os três modos, passo a passo do App e da conta-robô, permissões mínimas, aviso `GH_LOCAL_E_ANALISTA` (deixar o `gh` da máquina só com a conta do agente; enquanto não, a assinatura sai com `Tipo: review no GitHub ⚠️ gh local = analista`), aprovação pelo chat (o que registra e o que **não** prova), erros novos. Seção `## Atualizando de 1.10`: ficha antiga = `modo: nenhuma`, nada muda até configurar; reinstalar com `install-governanca` preserva a ficha. Em "Comandos do script": `card-sign <ID> --pelo-chat --resultado ... --frase ...`.
- [ ] **`docs/CONFORMANCE-SPEC.md`**: F4 "12 proibições" → "13"; nova linha `| F10 | Ficha com `identidade_agente` válido ou ausente e nenhum segredo nela (só nomes de variáveis) | `validarFicha` sem erros |`; "F1–F9" → "F1–F10" onde aparecer.
- [ ] **Guia** (`docs/guia-completo.html`, seção `#governanca`): `<h3>Identidade do agente</h3>` no estilo das vizinhas (analogia do crachá, três modos, chat = prova fraca).
- [ ] **README.md**: na linha da Governança, citar "identidade própria do agente (App/robô) ou aprovação pelo chat".
- [ ] **RELEASE-NOTES.md**, no bloco v1.11.0 já existente, acrescentar:

```markdown
- **Identidade do agente:** `identidade_agente` na ficha — `token` (conta-robô, token em variável de ambiente) ou
  `app` (GitHub App; o plugin gera o token de 1 h com a chave privada, sem dependências). PRs e pushes saem como o
  agente, e o dono do projeto pode ser o analista. Token só em memória; nunca em ficha, log ou `.git/config`.
- Sem identidade separada, `card-hom` e `card-sign` param com `IDENTIDADE_IGUAL_ANALISTA`. Opt-in
  `aprovacao_pelo_chat`: `card-sign <ID> --pelo-chat` registra a declaração do usuário como "chat, sem prova do
  GitHub" (review no PR vence: `JA_HA_REVIEW`). Guardrail 13. Conformidade F10. `detect` mostra agente × analistas.
- Atualizando de 1.10: ficha antiga = `modo: nenhuma`; nada muda até configurar.
```

- [ ] **Referências a número de etapa**: com a ferramenta Grep, procurar `etapa \d+|etapas \d+` em `skills/agentic-os/`, `docs/` e `template/` e corrigir as que mudaram com a renumeração (o SKILL.md cita o Resumo e a etapa 2 por número).
- [ ] **Gates**: `bash scripts/check-governanca.sh && node --test scripts/tests/router.test.mjs && bash scripts/check-skill-sync.sh && bash scripts/check-pointers.sh && bash scripts/check-rules-sync.sh && claude plugin validate .` → tudo OK.
- [ ] **Commit** — `docs(identidade): wizard, skill, GOVERNANCA, conformidade F10, guia e notas`

---

### Task 11: Teste real (controlador, com "sim" do usuário)

Feito pelo controlador, não por subagente. Cada recurso criado no GitHub pede o "sim" do usuário antes.
Nada de nome de org/conta em arquivo versionado: a org de teste só aparece na ficha do sandbox (fora do repo).

- [ ] **Preparar (usuário):** numa org do usuário com plano pago (proteção de `main` disponível), criar um GitHub App de teste com as permissões da Task 10, instalar no repo sandbox, baixar a `.pem` para fora de qualquer repo e definir a variável com o caminho. Logar o `gh` da máquina com a conta do usuário (para `detect`/`apply`).
- [ ] **Sandbox:** repo privado + Project na org; ficha com `identidade_agente: { modo: 'app', app_id, chave_privada_env }`, `analistas: [<conta do usuário>]`, `comando_testes`, `deploy_hom` que grava arquivo fora do git, `url_hom`; `install-governanca` + `apply --dry-run` + `apply`. `detect --ficha ...` → `login_agente = <slug>[bot]`, `conflito: false`, aviso `GH_LOCAL_E_ANALISTA` presente (esperado: o `gh` local é do usuário; decisão: registrar o risco). As assinaturas por review deste teste devem sair com `Tipo: review no GitHub ⚠️ gh local = analista`; repetir uma aprovação com o `gh` local trocado para outra conta (ou deslogado) e conferir `Tipo: review no GitHub` sem aviso.
- [ ] **Cartão 1:** `card-start` → proposal → `revisar` (Supervisor real via `claude -p --agent supervisor`) → `card-pr` (conferir no GitHub: autor do PR = `<slug>[bot]`; push feito pelo App) → `card-hom` → usuário faz **Request changes** pelo navegador → `card-sign` = reprovado (TASK no disco, cartão em Em andamento).
- [ ] **Cartão 1, volta 2:** corrige + commita com o TASK → `revisar` → `card-pr` → usuário faz **Approve antes** do `card-hom` → `card-hom` (commit do TASK) → `card-sign` = `ASSINATURA_DE_OUTRO_COMMIT` → usuário faz **Approve** de novo → `card-sign` = aprovado (Assinatura no corpo do PR com `Tipo: review no GitHub`; cartão em Aprovado).
- [ ] **Cartão 2:** até `card-pr`; com o cartão 1 em validação, `card-hom 2` → `HOM_OCUPADO`.
- [ ] **Chat:** ficha com `aprovacao_pelo_chat: true` e `modo: nenhuma` (agente = usuário); cartão 3 até `card-hom`; usuário escreve no chat "aprovo o cartão 3" → `card-sign 3 --pelo-chat --resultado aprovado --frase "aprovo o cartão 3"` → registro "chat, sem prova do GitHub". Com `aprovacao_pelo_chat: false`, o mesmo `card-hom` → `IDENTIDADE_IGUAL_ANALISTA`.
- [ ] **Limpar (com "sim"):** apagar repo e Project; usuário remove o App e a `.pem`. Confirmar que sumiram.
- [ ] Bugs achados → corrigir com teste antes da release. Registrar os resultados para o corpo do PR.

### Task 12: Release v1.11.0 (só com o "sim" do usuário)

- [ ] **Histórico sem nomes reais (antes de qualquer push):** commits antigos desta branch citam conta e org reais (a Task 9 só limpa a árvore). Push publica todos os commits intermediários, e o GitHub guarda o head do PR mesmo depois de apagar a branch. Com o "sim" do usuário: `git branch backup/hom-assinatura` → `git reset --soft main` → recommitar em commits limpos (por exemplo um por Parte: HOM/assinatura, identidade, docs) com a linha Co-Authored-By. Conferir com a ferramenta Grep sobre a saída de `git log -p main..HEAD` salva no scratchpad: 0 ocorrências dos dois nomes reais da memória local (sem caixa). O corpo do PR e os resultados do teste real também não citam org nem conta.
- [ ] Gates (Task 10) → push da branch → PR (resumo da Parte 3 + identidade, resultados do teste real, linha 🤖) → CI → squash-merge → tag `v1.11.0` → release → `claude plugin marketplace update agentic-os` + `claude plugin update agentic-os@agentic-os --scope user` → memória.
