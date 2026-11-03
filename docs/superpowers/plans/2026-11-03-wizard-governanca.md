# Wizard + Governança GitHub (Partes 0 e 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O `/agentic-os` passa a configurar tudo como wizard (uma pergunta por tela) e ganha a camada opt-in F — Governança GitHub: ficha por projeto, cartão (issue no GitHub Project) → branch `feature|fix/{ID}-{desc}` → PR ligado, `main` protegida com revisão obrigatória do analista, Environments `hom`/`prd`, `docs/tasks/TASK-{ID}-{desc}.md`.

**Architecture:** A skill conduz a conversa (`skills/agentic-os/wizard.md`); um script Node sem dependências (`scripts/github-setup.mjs` + módulos `scripts/governanca/*.mjs`) faz todo o trabalho no GitHub via `gh`, com `--dry-run` e saída JSON; `scripts/install-governanca.mjs` instala a camada F num projeto (ficha, cópia do script em `.agentic-os/bin/`, procedimento, comando, blocos marcados). Travas fixas no código: nunca push/merge na branch principal, nunca aprovar PR, proteção só endurece.

**Tech Stack:** Node ≥ 18 (ESM, `node:test`), GitHub CLI `gh` (REST + GraphQL), git, Markdown (skill/procedimentos), bash (gates de CI).

**Spec:** `docs/superpowers/specs/2026-11-03-wizard-governanca-design.md`

**Convenções do repo:**
- Testes em `scripts/tests/*.test.mjs`, rodar com `node --test <arquivo>`.
- Arquivos com LF. No Windows/Git Bash, o hook "Isolamento de clientes" bloqueia comandos Bash com `${...}`; use caminhos literais.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca push direto na `main` do agenticOS: tudo vai pela branch `feat/wizard-governanca` + PR.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `scripts/governanca/erros.mjs` | Códigos de erro + texto "como resolver"; classe `ErroGov` |
| `scripts/governanca/gh.mjs` | Executa `gh` (ou o gh falso nos testes); classifica falhas em códigos |
| `scripts/governanca/git.mjs` | Git local: repo?, origin, árvore limpa, branch existe, push seguro (trava) |
| `scripts/governanca/nomes.mjs` | `slug`, nome da branch, caminho do TASK |
| `scripts/governanca/colunas.mjs` | Colunas padrão, faltantes, mescla de opções, mapa nome→id, `norm` |
| `scripts/governanca/ficha.mjs` | Ficha padrão, validação (inclui "sem segredo"), ler/gravar |
| `scripts/governanca/protecao.mjs` | Corpo de proteção que nunca enfraquece + diff "antes → depois" |
| `scripts/governanca/detect.mjs` | Leitura do estado (git, repo, Projects, Status, ambientes, proteção, analistas) |
| `scripts/governanca/apply.mjs` | Planeja e executa ações (colunas, convite, ambientes, proteção); travas |
| `scripts/governanca/cartao.mjs` | `card-start` e `card-pr` |
| `scripts/github-setup.mjs` | CLI: despacha subcomandos, imprime JSON, códigos de saída |
| `scripts/install-governanca.mjs` | Instala/atualiza a camada F num projeto |
| `scripts/tests/fixtures/fake-gh.mjs` | gh falso com cenário + log de chamadas |
| `scripts/tests/governanca.test.mjs` | Todos os testes da governança |
| `scripts/check-governanca.sh` + `.github/workflows/governanca-check.yml` | Gate de CI |
| `template/F-governanca/**` | Procedimento `cartao.md`, comando `/cartao`, bloco de guardrails, README de `docs/tasks/` |
| `skills/agentic-os/wizard.md` | Roteiro do wizard (16 etapas) |
| `skills/agentic-os/SKILL.md` | Aponta para o wizard; seção da camada F; `/propose` com cartão |
| `scripts/build-skill.sh`, `scripts/check-skill-sync.sh` | Empacotar e checar também o `wizard.md` |
| `docs/CONFORMANCE-SPEC.md` | Itens F1–F6 |
| `docs/GOVERNANCA.md`, `docs/guia-completo.html`, `README.md`, `RELEASE-NOTES.md`, 3 manifestos | Docs e versão 1.9.0 |

---

### Task 1: Erros + executor do `gh` + gh falso

**Files:**
- Create: `scripts/governanca/erros.mjs`
- Create: `scripts/governanca/gh.mjs`
- Create: `scripts/tests/fixtures/fake-gh.mjs`
- Create: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Criar o gh falso**

`scripts/tests/fixtures/fake-gh.mjs`:

```js
#!/usr/bin/env node
// gh falso para testes: responde conforme AGENTIC_OS_GH_SCENARIO (lista de regras {re, stdout, stderr, code};
// a primeira cujo regex casa com os argumentos unidos por espaço vence) e registra cada chamada
// em AGENTIC_OS_GH_LOG (uma linha JSON {args, input}).
import fs from 'node:fs';

const args = process.argv.slice(2);
const linha = args.join(' ');
let input = '';
if (args.includes('--input')) {
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {}
}
if (process.env.AGENTIC_OS_GH_LOG) fs.appendFileSync(process.env.AGENTIC_OS_GH_LOG, JSON.stringify({ args, input }) + '\n');
const regras = JSON.parse(fs.readFileSync(process.env.AGENTIC_OS_GH_SCENARIO, 'utf8'));
const r = regras.find((x) => new RegExp(x.re).test(linha));
if (!r) {
  process.stderr.write(`fake-gh: sem cenário para: ${linha}\n`);
  process.exit(1);
}
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.code ?? 0);
```

- [ ] **Step 2: Escrever os testes que falham**

`scripts/tests/governanca.test.mjs`:

```js
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
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/governanca/gh.mjs`

- [ ] **Step 4: Implementar `erros.mjs`**

```js
// Códigos de erro da governança GitHub. A skill lê `codigo` e mostra `como_resolver` ao usuário.
export const ERROS = {
  GH_AUSENTE: 'Instale o GitHub CLI (https://cli.github.com) e rode: gh auth login',
  GH_DESLOGADO: 'Rode: gh auth login',
  SEM_ESCOPO_PROJECT: 'Rode: gh auth refresh -s project',
  GH_FALHOU: 'Veja a mensagem do gh; repetir é seguro (o script confere o estado antes de criar).',
  REDE: 'Falha de rede ou da API do GitHub. Repita: o script confere o estado antes de criar.',
  PLANO_SEM_PROTECAO:
    'O plano do GitHub não permite esta proteção neste repositório privado. Saídas: (1) tornar o repo público, (2) subir de plano (Pro/Team), (3) seguir com proteção parcial — o risco fica escrito na ficha.',
  NAO_E_GIT: 'A pasta não é um repositório git. Rode: git init',
  SEM_REMOTO: 'Sem remoto "origin" no GitHub. Crie com: gh repo create <dono>/<nome> --private --source . --push',
  GIT_FALHOU: 'Veja a mensagem do git.',
  FICHA_INVALIDA: 'Rode o wizard (/agentic-os) para recriar .agentic-os/governanca.json.',
  PARAMETRO: 'Parâmetro inválido. Veja o uso no topo de github-setup.mjs.',
  ANALISTA_IGUAL_AGENTE:
    'O analista precisa de uma conta GitHub diferente da usada pelo agente: o GitHub não deixa quem abriu o PR aprová-lo.',
  ANALISTA_INEXISTENTE: 'Login do GitHub não encontrado. Confira a grafia.',
  CARTAO_INEXISTENTE: 'O cartão precisa ser uma issue do repositório adicionada ao Project (rascunho não serve: converta em issue).',
  CARTAO_FORA_DE_A_FAZER: 'Mova o cartão para "A Fazer" no Project.',
  ARVORE_SUJA: 'Há alterações não commitadas. Commite ou guarde (git stash) antes.',
  BRANCH_EXISTE: 'A branch do cartão já existe. Retome nela (git switch <branch>) ou pare.',
  BRANCH_ERRADA: 'Rode na branch do cartão (git switch <branch>).',
  TRAVA: 'Ação proibida pela governança (push/merge na branch principal, aprovar PR ou afrouxar proteção).',
};

export class ErroGov extends Error {
  constructor(codigo, detalhe) {
    super(detalhe || ERROS[codigo] || codigo);
    this.codigo = codigo;
    this.como_resolver = ERROS[codigo] || '';
  }
}
```

- [ ] **Step 5: Implementar `gh.mjs`**

```js
// Executa o GitHub CLI. Testes: AGENTIC_OS_GH_FAKE=<script.mjs> roda o gh falso com o node;
// AGENTIC_OS_GH_BIN troca o executável (ex.: simular gh ausente). Nunca imprime token.
import { spawnSync } from 'node:child_process';
import { ErroGov } from './erros.mjs';

export function gh(args, { input, permitirFalha = false } = {}) {
  const fake = process.env.AGENTIC_OS_GH_FAKE;
  const bin = fake ? process.execPath : process.env.AGENTIC_OS_GH_BIN || 'gh';
  const argv = fake ? [fake, ...args] : args;
  const r = spawnSync(bin, argv, {
    input,
    encoding: 'utf8',
    env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
  });
  if (r.error?.code === 'ENOENT') throw new ErroGov('GH_AUSENTE');
  const saida = { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
  if (saida.code !== 0 && !permitirFalha) throw classificar(saida, args);
  return saida;
}

export function ghJson(args, opts) {
  const { stdout } = gh(args, opts);
  return stdout.trim() ? JSON.parse(stdout) : null;
}

export function classificar({ stdout = '', stderr = '' }, args = []) {
  const t = `${stderr}\n${stdout}`;
  if (/not logged in|gh auth login/i.test(t)) return new ErroGov('GH_DESLOGADO');
  if (/INSUFFICIENT_SCOPES|required scopes?.*project|missing required scope/i.test(t)) return new ErroGov('SEM_ESCOPO_PROJECT');
  if (/Upgrade to GitHub Pro|make this repository public/i.test(t)) return new ErroGov('PLANO_SEM_PROTECAO');
  if (/could not resolve host|timed? ?out|ECONNRESET|HTTP 50\d/i.test(t)) return new ErroGov('REDE');
  return new ErroGov('GH_FALHOU', `gh ${args.join(' ')} → ${t.trim().slice(0, 300)}`);
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 4 testes, 0 falhas

- [ ] **Step 7: Commit**

```bash
git add scripts/governanca/erros.mjs scripts/governanca/gh.mjs scripts/tests/fixtures/fake-gh.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): executor do gh com codigos de erro e gh falso para testes"
```

---

### Task 2: Git local + nomes

**Files:**
- Create: `scripts/governanca/git.mjs`
- Create: `scripts/governanca/nomes.mjs`
- Modify: `scripts/tests/governanca.test.mjs` (acrescentar no fim)

- [ ] **Step 1: Acrescentar helpers de repo e testes que falham**

Acrescentar ao fim de `scripts/tests/governanca.test.mjs`:

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `Cannot find module .../nomes.mjs`

- [ ] **Step 3: Implementar `nomes.mjs`**

```js
// Nomes derivados do cartão: slug, branch e arquivo TASK.
export function slug(texto, max = 40) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

export const nomeBranch = (ficha, tipo, id, desc) =>
  `${ficha.prefixos_branch[tipo] ?? ficha.prefixos_branch.feature}${id}-${desc}`;

export const caminhoTask = (id, desc) => `docs/tasks/TASK-${id}-${desc}.md`;
```

- [ ] **Step 4: Implementar `git.mjs`**

```js
// Operações git locais da governança. Trava 1: nunca push na branch principal.
import { spawnSync } from 'node:child_process';
import { ErroGov } from './erros.mjs';

export function git(cwd, args, { permitirFalha = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const res = { code: r.status ?? 1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  if (res.code !== 0 && !permitirFalha) throw new ErroGov('GIT_FALHOU', `git ${args.join(' ')} → ${res.err}`);
  return res;
}

export const ehRepo = (cwd) => git(cwd, ['rev-parse', '--is-inside-work-tree'], { permitirFalha: true }).out === 'true';

export function parseRemoto(url) {
  const m = String(url).match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function remotoOrigin(cwd) {
  const r = git(cwd, ['remote', 'get-url', 'origin'], { permitirFalha: true });
  return r.code === 0 ? parseRemoto(r.out) : null;
}

export const arvoreLimpa = (cwd) => git(cwd, ['status', '--porcelain']).out === '';

export const branchAtual = (cwd) => git(cwd, ['branch', '--show-current']).out;

export function branchExiste(cwd, nome) {
  if (git(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${nome}`], { permitirFalha: true }).code === 0) return true;
  return git(cwd, ['ls-remote', '--exit-code', '--heads', 'origin', nome], { permitirFalha: true }).code === 0;
}

export function pushBranch(cwd, branch, principal) {
  if (!branch || branch === principal) throw new ErroGov('TRAVA', `Push na branch principal (${principal}) é proibido.`);
  git(cwd, ['push', '-u', 'origin', `${branch}:${branch}`]);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 7 testes

- [ ] **Step 6: Commit**

```bash
git add scripts/governanca/git.mjs scripts/governanca/nomes.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): git local, nomes de branch/TASK e trava de push na principal"
```

---

### Task 3: Colunas + ficha

**Files:**
- Create: `scripts/governanca/colunas.mjs`
- Create: `scripts/governanca/ficha.mjs`
- Modify: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Testes que falham**

Acrescentar:

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `Cannot find module .../colunas.mjs`

- [ ] **Step 3: Implementar `colunas.mjs`**

```js
// Colunas do GitHub Project (opções do campo Status).
export const COLUNAS_PADRAO = {
  backlog: 'Backlog',
  a_fazer: 'A Fazer',
  em_andamento: 'Em andamento',
  em_validacao: 'Em validação',
  aprovado: 'Aprovado',
  concluido: 'Concluído',
  bloqueado: 'Bloqueado',
};

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function colunasFaltantes(opcoes, colunas) {
  const tem = new Set(opcoes.map((o) => norm(o.name)));
  return Object.values(colunas).filter((n) => !tem.has(norm(n)));
}

// A API substitui a lista inteira: as existentes vão primeiro, com cor e descrição originais.
export function opcoesMescladas(opcoes, faltantes) {
  return [
    ...opcoes.map((o) => ({ name: o.name, color: o.color || 'GRAY', description: o.description || '' })),
    ...faltantes.map((name) => ({ name, color: 'GRAY', description: '' })),
  ];
}

export function mapearIds(opcoes, colunas) {
  const porNome = new Map(opcoes.map((o) => [norm(o.name), o.id]));
  return Object.fromEntries(Object.entries(colunas).map(([k, n]) => [k, porNome.get(norm(n)) || null]));
}
```

- [ ] **Step 4: Implementar `ficha.mjs`**

```js
// Ficha de governança do projeto (.agentic-os/governanca.json). Nunca guarda segredo.
import fs from 'node:fs';
import path from 'node:path';
import { COLUNAS_PADRAO } from './colunas.mjs';
import { ErroGov } from './erros.mjs';

export const ARQ_FICHA = '.agentic-os/governanca.json';
const SEGREDO = /token|secret|senha|password|api_?key|credencial/i;

export function fichaPadrao(parcial = {}) {
  return {
    versao: 1,
    repo: '',
    branch_principal: 'main',
    project: { owner: '', number: 0, url: '', id: '', campo_status_id: '' },
    colunas: { ...COLUNAS_PADRAO },
    colunas_ids: {},
    analistas: [],
    ambientes: { hom: 'hom', prd: 'prd' },
    prefixos_branch: { feature: 'feature/', fix: 'fix/' },
    aceitar_protecao_parcial: false,
    protecao_aplicada: null,
    ...parcial,
  };
}

function chavesSecretas(obj, prefixo = '') {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).flatMap(([k, v]) => [
    ...(SEGREDO.test(k) ? [`${prefixo}${k}`] : []),
    ...chavesSecretas(v, `${prefixo}${k}.`),
  ]);
}

export function validarFicha(f) {
  const erros = [];
  if (!/^[^/\s]+\/[^/\s]+$/.test(f?.repo || '')) erros.push('repo deve ser dono/nome');
  if (!f?.project?.owner || !Number.isInteger(f.project.number) || f.project.number < 1)
    erros.push('project.owner e project.number são obrigatórios');
  for (const k of Object.keys(COLUNAS_PADRAO)) if (!f?.colunas?.[k]) erros.push(`colunas.${k} ausente`);
  if (!Array.isArray(f?.analistas) || f.analistas.length === 0) erros.push('analistas: informe ao menos um login');
  if (!f?.ambientes?.hom || !f?.ambientes?.prd) erros.push('ambientes.hom e ambientes.prd são obrigatórios');
  if (!f?.prefixos_branch?.feature || !f?.prefixos_branch?.fix) erros.push('prefixos_branch.feature e .fix são obrigatórios');
  const s = chavesSecretas(f);
  if (s.length) erros.push(`a ficha não pode guardar segredo: ${s.join(', ')}`);
  return erros;
}

export function lerFicha(cwd, arq = ARQ_FICHA) {
  let f;
  try {
    f = JSON.parse(fs.readFileSync(path.resolve(cwd, arq), 'utf8'));
  } catch {
    throw new ErroGov('FICHA_INVALIDA', `Não consegui ler ${arq}.`);
  }
  const erros = validarFicha(f);
  if (erros.length) throw new ErroGov('FICHA_INVALIDA', erros.join('; '));
  return f;
}

export function gravarFicha(cwd, f, arq = ARQ_FICHA) {
  const p = path.resolve(cwd, arq);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(f, null, 2) + '\n');
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 9 testes

- [ ] **Step 6: Commit**

```bash
git add scripts/governanca/colunas.mjs scripts/governanca/ficha.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): colunas do Project e ficha validada sem segredo"
```

---

### Task 4: Proteção que só endurece

**Files:**
- Create: `scripts/governanca/protecao.mjs`
- Modify: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Testes que falham**

```js
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
    required_status_checks: { strict: true, contexts: ['ci'], checks: [{ context: 'ci', app_id: 15368 }] },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: { required_approving_review_count: 2, dismiss_stale_reviews: true, require_code_owner_reviews: true, require_last_push_approval: true },
    restrictions: { users: [{ login: 'chefe' }], teams: [], apps: [] },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
    lock_branch: { enabled: false },
  };
  const c = mesclarProtecao(atual);
  assert.equal(c.required_pull_request_reviews.required_approving_review_count, 2);
  assert.deepEqual(c.required_status_checks, { strict: true, checks: [{ context: 'ci', app_id: 15368 }] });
  assert.deepEqual(c.restrictions, { users: ['chefe'], teams: [], apps: [] });
  assert.equal(c.required_linear_history, true);
  assert.equal(c.required_conversation_resolution, true);
  assert.deepEqual(diffProtecao(atual, c), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `Cannot find module .../protecao.mjs`

- [ ] **Step 3: Implementar `protecao.mjs`**

```js
// Proteção da branch principal. Trava 3: o corpo gerado nunca é mais fraco que a regra atual.
// `atual` = resposta de GET repos/{repo}/branches/{b}/protection (ou null se não protegida).
export function mesclarProtecao(atual) {
  const a = atual || {};
  const rev = a.required_pull_request_reviews || {};
  const sc = a.required_status_checks;
  return {
    required_status_checks: sc
      ? sc.checks?.length
        ? { strict: !!sc.strict, checks: sc.checks }
        : { strict: !!sc.strict, contexts: sc.contexts || [] }
      : null,
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      require_last_push_approval: true,
      required_approving_review_count: Math.max(1, rev.required_approving_review_count || 0),
    },
    restrictions: a.restrictions
      ? {
          users: (a.restrictions.users || []).map((u) => u.login),
          teams: (a.restrictions.teams || []).map((t) => t.slug),
          apps: (a.restrictions.apps || []).map((x) => x.slug),
        }
      : null,
    required_linear_history: !!a.required_linear_history?.enabled,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: !!a.required_conversation_resolution?.enabled,
    lock_branch: !!a.lock_branch?.enabled,
  };
}

// Linhas "nome: antes → depois" só do que muda (para o wizard mostrar).
export function diffProtecao(atual, novo) {
  const a = atual || {};
  const r = a.required_pull_request_reviews || {};
  const n = novo.required_pull_request_reviews;
  const flag = (o, semRegra) => (o ? !!o.enabled : semRegra);
  const linhas = [];
  const add = (nome, antes, depois) => {
    if (antes !== depois) linhas.push(`${nome}: ${antes} → ${depois}`);
  };
  add('PR obrigatório', !!a.required_pull_request_reviews, true);
  add('Aprovações mínimas', r.required_approving_review_count || 0, n.required_approving_review_count);
  add('Descartar aprovação em commit novo', !!r.dismiss_stale_reviews, n.dismiss_stale_reviews);
  add('Exigir revisão do analista (CODEOWNERS)', !!r.require_code_owner_reviews, n.require_code_owner_reviews);
  add('Aprovação do último push', !!r.require_last_push_approval, n.require_last_push_approval);
  add('Regra vale para admins', flag(a.enforce_admins, false), novo.enforce_admins);
  add('Force-push permitido', flag(a.allow_force_pushes, !atual), novo.allow_force_pushes);
  add('Apagar branch permitido', flag(a.allow_deletions, !atual), novo.allow_deletions);
  return linhas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 11 testes

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/protecao.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): protecao da branch principal que nunca enfraquece"
```

---

### Task 5: `detect`

**Files:**
- Create: `scripts/governanca/detect.mjs`
- Modify: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Cenário base + testes que falham**

```js
// Cenário de um repo privado sem proteção, Project 3 com Status {Todo, A Fazer}.
const BASE = [
  ok('^api user$', { login: 'agente' }),
  ok('^api users/analista$', { id: 42, login: 'analista' }),
  falha('^api users/', 'HTTP 404: Not Found'),
  ok('^api repos/dono/app/collaborators/analista$', ''),
  falha('^api repos/dono/app/collaborators/', 'HTTP 404: Not Found'),
  ok('^api repos/dono/app$', { default_branch: 'main', private: true, owner: { type: 'User' } }),
  falha('^api repos/dono/app/branches/main/protection$', 'gh: Branch not protected (HTTP 404)'),
  ok('^api repos/dono/app/environments$', { total_count: 0, environments: [] }),
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `Cannot find module .../detect.mjs`

- [ ] **Step 3: Implementar `detect.mjs`**

```js
// Leitura do estado. Nunca escreve nada (nem local, nem no GitHub).
import { classificar, gh, ghJson } from './gh.mjs';
import { ehRepo, git, remotoOrigin } from './git.mjs';

export function lerProtecao(repo, branch) {
  const s = gh(['api', `repos/${repo}/branches/${branch}/protection`], { permitirFalha: true });
  if (s.code === 0) return { estado: 'ativa', regras: JSON.parse(s.stdout) };
  const e = classificar(s);
  if (e.codigo === 'PLANO_SEM_PROTECAO') return { estado: 'indisponivel_no_plano' };
  if (/not protected|Not Found|404/i.test(`${s.stderr}${s.stdout}`)) return { estado: 'nenhuma' };
  throw e;
}

export function lerAmbientes(repo) {
  const s = gh(['api', `repos/${repo}/environments`], { permitirFalha: true });
  if (s.code !== 0) return [];
  const d = JSON.parse(s.stdout || '{}');
  return (d.environments || []).map((e) => ({
    nome: e.name,
    revisores: (e.protection_rules || [])
      .filter((p) => p.type === 'required_reviewers')
      .flatMap((p) => p.reviewers || [])
      .map((x) => ({ type: x.type, id: x.reviewer?.id })),
  }));
}

export function statusDoProject(owner, number) {
  const f = ghJson(['project', 'field-list', String(number), '--owner', owner, '--format', 'json']);
  const st = (f?.fields || []).find((x) => x.name === 'Status');
  if (!st) return null;
  const q = 'query($id:ID!){node(id:$id){... on ProjectV2SingleSelectField{options{id name color description}}}}';
  const d = ghJson(['api', 'graphql', '-f', `query=${q}`, '-f', `id=${st.id}`]);
  return { campo_status_id: st.id, opcoes: d?.data?.node?.options || [] };
}

export function checarAnalista(repo, login, loginAgente) {
  if (String(login).toLowerCase() === String(loginAgente).toLowerCase()) return { login, erro: 'ANALISTA_IGUAL_AGENTE' };
  const u = gh(['api', `users/${login}`], { permitirFalha: true });
  if (u.code !== 0) return { login, erro: 'ANALISTA_INEXISTENTE' };
  const id = JSON.parse(u.stdout).id;
  const colaborador = repo ? gh(['api', `repos/${repo}/collaborators/${login}`], { permitirFalha: true }).code === 0 : false;
  return { login, id, colaborador };
}

export function detect(cwd, { owner, project, analistas = [] } = {}) {
  const r = { git: ehRepo(cwd), repo: null, avisos: [] };
  r.login = ghJson(['api', 'user']).login;
  if (!r.git) r.avisos.push('NAO_E_GIT');
  else {
    r.repo = remotoOrigin(cwd);
    if (!r.repo) r.avisos.push('SEM_REMOTO');
    r.branch_local = git(cwd, ['branch', '--show-current'], { permitirFalha: true }).out || null;
  }
  if (r.repo) {
    const info = ghJson(['api', `repos/${r.repo}`]);
    r.branch_principal = info.default_branch;
    r.privado = !!info.private;
    r.tipo_dono = info.owner?.type || 'User';
    r.protecao = lerProtecao(r.repo, r.branch_principal);
    r.ambientes = lerAmbientes(r.repo);
  }
  r.owner = owner || r.repo?.split('/')[0] || r.login;
  r.projects = (ghJson(['project', 'list', '--owner', r.owner, '--format', 'json'])?.projects || []).map((p) => ({
    number: p.number,
    title: p.title,
    url: p.url,
    id: p.id,
  }));
  if (project) r.status_project = statusDoProject(r.owner, project);
  r.analistas = analistas.map((l) => checarAnalista(r.repo, l, r.login));
  return r;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 14 testes

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/detect.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): detect le git, repo, Project, Status, ambientes e analistas"
```

---

### Task 6: `apply` (planejar + executar + travas)

**Files:**
- Create: `scripts/governanca/apply.mjs`
- Modify: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Testes que falham**

```js
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
  for (const args of [['pr', 'merge', '7'], ['pr', 'review', '7', '--approve'], ['api', 'repos/d/a/pulls/7/reviews'], ['api', '-X', 'DELETE', 'repos/d/a/branches/main/protection']])
    assert.throws(() => verificarTravas([{ tipo: 'x', descricao: 'x', gh: args }]), (e) => e.codigo === 'TRAVA');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `Cannot find module .../apply.mjs`

- [ ] **Step 3: Implementar `apply.mjs`**

```js
// Planeja e executa a configuração no GitHub. Travas: nunca merge/aprovação/DELETE; proteção só endurece.
import { colunasFaltantes, mapearIds, opcoesMescladas } from './colunas.mjs';
import { detect, statusDoProject } from './detect.mjs';
import { ERROS, ErroGov } from './erros.mjs';
import { gh } from './gh.mjs';
import { diffProtecao, mesclarProtecao } from './protecao.mjs';

const MUTACAO_COLUNAS =
  'mutation($input:UpdateProjectV2FieldInput!){updateProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{options{id name}}}}}';

const PROIBIDO = /\bpr (merge|review)\b|\/reviews\b|\/merges\b|-X DELETE|--method DELETE/i;

export function verificarTravas(acoes) {
  for (const a of acoes) {
    if (!a.gh) continue;
    const t = a.gh.join(' ');
    if (PROIBIDO.test(t)) throw new ErroGov('TRAVA', `Ação proibida: gh ${t}`);
  }
}

function uniaoRevisores(atuais, novos) {
  const vistos = new Set(atuais.map((r) => `${r.type}:${r.id}`));
  return [...atuais, ...novos.filter((r) => !vistos.has(`${r.type}:${r.id}`))];
}

export function planejar(estado, ficha) {
  const acoes = [];
  const repo = ficha.repo;
  for (const a of estado.analistas) {
    if (a.erro) throw new ErroGov(a.erro, `${a.login}: ${ERROS[a.erro]}`);
    if (!a.colaborador)
      acoes.push({
        tipo: 'convite',
        descricao: `Convidar ${a.login} como colaborador (push) — sem acesso, a aprovação dele não conta`,
        gh: ['api', '-X', 'PUT', `repos/${repo}/collaborators/${a.login}`, '-f', 'permission=push'],
      });
  }
  const st = estado.status_project;
  if (!st) throw new ErroGov('GH_FALHOU', 'O Project não tem o campo Status.');
  const faltam = colunasFaltantes(st.opcoes, ficha.colunas);
  if (faltam.length)
    acoes.push({
      tipo: 'colunas',
      descricao: `Criar colunas: ${faltam.join(', ')}`,
      gh: ['api', 'graphql', '--input', '-'],
      input: JSON.stringify({
        query: MUTACAO_COLUNAS,
        variables: { input: { fieldId: st.campo_status_id, singleSelectOptions: opcoesMescladas(st.opcoes, faltam) } },
      }),
    });
  const ambs = new Map(estado.ambientes.map((e) => [e.nome, e]));
  const { hom, prd } = ficha.ambientes;
  if (!ambs.has(hom))
    acoes.push({ tipo: 'ambiente', descricao: `Criar ambiente ${hom}`, gh: ['api', '-X', 'PUT', `repos/${repo}/environments/${hom}`] });
  const atuais = ambs.get(prd)?.revisores || [];
  const revisores = uniaoRevisores(atuais, estado.analistas.map((a) => ({ type: 'User', id: a.id })));
  if (!ambs.has(prd) || revisores.length > atuais.length)
    acoes.push({
      tipo: 'ambiente',
      descricao: `Ambiente ${prd} com aprovação obrigatória de: ${ficha.analistas.join(', ')}`,
      gh: ['api', '-X', 'PUT', `repos/${repo}/environments/${prd}`, '--input', '-'],
      input: JSON.stringify({ reviewers: revisores, prevent_self_review: true }),
    });
  const branch = ficha.branch_principal;
  if (estado.protecao.estado === 'indisponivel_no_plano') {
    if (!ficha.aceitar_protecao_parcial) throw new ErroGov('PLANO_SEM_PROTECAO');
    acoes.push({ tipo: 'protecao', descricao: `Proteção de ${branch} indisponível no plano (aceito: parcial)`, gh: null });
  } else {
    const atual = estado.protecao.estado === 'ativa' ? estado.protecao.regras : null;
    const corpo = mesclarProtecao(atual);
    const mudancas = diffProtecao(atual, corpo);
    if (mudancas.length)
      acoes.push({
        tipo: 'protecao',
        descricao: `Proteger ${branch}: ${mudancas.join('; ')}`,
        mudancas,
        gh: ['api', '-X', 'PUT', `repos/${repo}/branches/${branch}/protection`, '--input', '-'],
        input: JSON.stringify(corpo),
      });
  }
  return acoes;
}

export function executar(acoes, ficha, { dryRun = false } = {}) {
  verificarTravas(acoes);
  const feitas = [];
  const avisos = [];
  let nivel = 'completa';
  const resumo = (a, status, extra = {}) => ({ tipo: a.tipo, descricao: a.descricao, ...(a.mudancas ? { mudancas: a.mudancas } : {}), status, ...extra });
  for (const a of acoes) {
    if (!a.gh) {
      avisos.push(a.descricao);
      nivel = 'parcial';
      feitas.push(resumo(a, 'pulado'));
      continue;
    }
    if (dryRun) {
      feitas.push(resumo(a, 'planejado', { comando: `gh ${a.gh.join(' ')}` }));
      continue;
    }
    try {
      gh(a.gh, { input: a.input });
      feitas.push(resumo(a, 'feito'));
    } catch (e) {
      if (e.codigo === 'PLANO_SEM_PROTECAO' && ficha.aceitar_protecao_parcial) {
        avisos.push(`${a.descricao}: indisponível no plano`);
        nivel = 'parcial';
        feitas.push(resumo(a, 'pulado'));
      } else throw e;
    }
  }
  return { acoes: feitas, avisos, nivel };
}

export function aplicar(cwd, ficha, { dryRun = false } = {}) {
  const estado = detect(cwd, { owner: ficha.project.owner, project: ficha.project.number, analistas: ficha.analistas });
  if (!estado.repo) throw new ErroGov('SEM_REMOTO');
  if (estado.repo.toLowerCase() !== ficha.repo.toLowerCase())
    throw new ErroGov('FICHA_INVALIDA', `A ficha aponta ${ficha.repo}, mas o origin é ${estado.repo}.`);
  const r = executar(planejar(estado, ficha), ficha, { dryRun });
  if (dryRun) return { ok: true, dry_run: true, ...r };
  const st = statusDoProject(ficha.project.owner, ficha.project.number);
  const nova = {
    ...ficha,
    project: { ...ficha.project, campo_status_id: st.campo_status_id },
    colunas_ids: mapearIds(st.opcoes, ficha.colunas),
    protecao_aplicada: { em: new Date().toISOString(), nivel: r.nivel, motivo: r.avisos.join('; ') },
  };
  return { ok: true, ...r, ficha: nova };
}
```

Nota: em "plano sem proteção + aceito", o `PUT environments/prd` também pode ser recusado pelo plano — o `executar` marca `pulado` e o nível fica `parcial` (coberto pelo teste).

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 19 testes

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/apply.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): apply com dry-run, convite do analista, ambientes e travas"
```

---

### Task 7: `card-start`

**Files:**
- Create: `scripts/governanca/cartao.mjs`
- Modify: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Testes que falham**

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `Cannot find module .../cartao.mjs`

- [ ] **Step 3: Implementar `cartao.mjs` (parte card-start)**

```js
// Fluxo do cartão: card-start (A Fazer → branch + TASK → Em andamento) e card-pr (push + PR ligado).
import fs from 'node:fs';
import path from 'node:path';
import { norm } from './colunas.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';
import { arvoreLimpa, branchAtual, branchExiste, git, pushBranch } from './git.mjs';
import { caminhoTask, nomeBranch, slug } from './nomes.mjs';

export function acharCartao(ficha, id) {
  const { owner, number } = ficha.project;
  const lista = ghJson(['project', 'item-list', String(number), '--owner', owner, '--format', 'json', '--limit', '1000']);
  const repo = ficha.repo.toLowerCase();
  const item = (lista?.items || []).find(
    (i) => i.content?.number === Number(id) && (!i.content.repository || String(i.content.repository).toLowerCase() === repo),
  );
  if (!item) throw new ErroGov('CARTAO_INEXISTENTE', `Cartão #${id} não encontrado no Project ${ficha.project.url}.`);
  return { itemId: item.id, titulo: item.content.title || item.title || `cartao-${id}`, status: item.status || '' };
}

export function moverCartao(ficha, itemId, chave) {
  const opcao = ficha.colunas_ids?.[chave];
  if (!opcao) throw new ErroGov('FICHA_INVALIDA', `Sem id da coluna "${ficha.colunas[chave]}". Rode: github-setup.mjs apply`);
  gh(['project', 'item-edit', '--id', itemId, '--project-id', ficha.project.id, '--field-id', ficha.project.campo_status_id, '--single-select-option-id', opcao]);
}

export function textoTask({ id, desc, titulo, repo, branch, agora }) {
  return `# TASK-${id} — ${titulo}

| Campo | Valor |
|---|---|
| Cartão | #${id} |
| Repositório | ${repo} |
| Branch | ${branch} |
| Início | ${agora} |
| PR | (pendente: /cartao pr ${id}) |

## Plano
Ver \`changes/${id}-${desc}/\` (proposal.md, tasks.md).

## Histórico
- ${agora} — cartão movido para Em andamento; branch criada.
`;
}

export function cardStart(cwd, ficha, id, { tipo = 'feature', desc, dryRun = false } = {}) {
  if (!['feature', 'fix'].includes(tipo)) throw new ErroGov('PARAMETRO', '--tipo deve ser feature ou fix.');
  if (!/^\d+$/.test(String(id))) throw new ErroGov('PARAMETRO', 'O ID do cartão é o número da issue.');
  const c = acharCartao(ficha, id);
  if (norm(c.status) !== norm(ficha.colunas.a_fazer))
    throw new ErroGov('CARTAO_FORA_DE_A_FAZER', `Cartão #${id} está em "${c.status || 'sem coluna'}"; mova para "${ficha.colunas.a_fazer}".`);
  if (!arvoreLimpa(cwd)) throw new ErroGov('ARVORE_SUJA');
  const d = slug(desc || c.titulo) || `cartao-${id}`;
  const branch = nomeBranch(ficha, tipo, id, d);
  const task = caminhoTask(id, d);
  if (branchExiste(cwd, branch)) throw new ErroGov('BRANCH_EXISTE', `A branch ${branch} já existe. Retome nela (git switch ${branch}) ou pare.`);
  const principal = ficha.branch_principal;
  const acoes = [
    `git fetch origin ${principal}`,
    `git switch --no-track -c ${branch} origin/${principal}`,
    `criar ${task}`,
    `git commit (TASK-${id})`,
    `mover cartão #${id} → ${ficha.colunas.em_andamento}`,
  ];
  if (dryRun) return { ok: true, dry_run: true, branch, task, acoes };
  git(cwd, ['fetch', 'origin', principal]);
  git(cwd, ['switch', '--no-track', '-c', branch, `origin/${principal}`]);
  const abs = path.join(cwd, task);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, textoTask({ id, desc: d, titulo: c.titulo, repo: ficha.repo, branch, agora: new Date().toISOString() }));
  git(cwd, ['add', task]);
  git(cwd, ['commit', '-q', '-m', `docs(task): TASK-${id} ${d}`]);
  moverCartao(ficha, c.itemId, 'em_andamento');
  return { ok: true, branch, task, acoes };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 22 testes

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/cartao.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): card-start cria branch do cartao, TASK e move para Em andamento"
```

---

### Task 8: `card-pr`

**Files:**
- Modify: `scripts/governanca/cartao.mjs` (acrescentar no fim)
- Modify: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Testes que falham**

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `cardPr is not a function` (export ausente)

- [ ] **Step 3: Acrescentar ao fim de `cartao.mjs`**

```js
export function corpoPr({ id, titulo, ficha, task }) {
  return [
    `Cartão #${id} — ${titulo}`,
    `Project: ${ficha.project.url}`,
    task ? `TASK: \`${task}\`` : null,
    '',
    `Este PR só entra na \`${ficha.branch_principal}\` com a aprovação do analista (revisão obrigatória). Commit novo depois da aprovação descarta a aprovação.`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function registrarPr(texto, url, agora) {
  if (texto.includes(url)) return texto;
  return texto.replace(/^\| PR \|.*\|$/m, `| PR | ${url} |`).trimEnd() + `\n- ${agora} — PR aberto: ${url}\n`;
}

export function cardPr(cwd, ficha, id, { dryRun = false } = {}) {
  const atual = branchAtual(cwd);
  if (!Object.values(ficha.prefixos_branch).some((p) => atual.startsWith(`${p}${id}-`)))
    throw new ErroGov('BRANCH_ERRADA', `A branch atual "${atual}" não é do cartão #${id}.`);
  if (!arvoreLimpa(cwd)) throw new ErroGov('ARVORE_SUJA');
  const c = acharCartao(ficha, id);
  const dirTasks = path.join(cwd, 'docs', 'tasks');
  const nome = fs.existsSync(dirTasks) ? fs.readdirSync(dirTasks).find((f) => f.startsWith(`TASK-${id}-`)) : null;
  const task = nome ? `docs/tasks/${nome}` : null;
  const existente = ghJson(['pr', 'list', '--repo', ficha.repo, '--head', atual, '--state', 'open', '--json', 'url']) || [];
  const acoes = [
    `git push -u origin ${atual}`,
    existente.length ? `PR já aberto: ${existente[0].url}` : `gh pr create --base ${ficha.branch_principal} --head ${atual}`,
    existente.length ? 'cartão já comentado' : `comentar o link do PR no cartão #${id}`,
    task ? `registrar o PR em ${task}` : 'sem TASK para registrar',
  ];
  if (dryRun) return { ok: true, dry_run: true, branch: atual, acoes };
  pushBranch(cwd, atual, ficha.branch_principal);
  let url = existente[0]?.url;
  if (!url) {
    url = gh(['pr', 'create', '--repo', ficha.repo, '--base', ficha.branch_principal, '--head', atual, '--title', `[#${id}] ${c.titulo}`, '--body', corpoPr({ id, titulo: c.titulo, ficha, task })]).stdout.trim();
    gh(['issue', 'comment', String(id), '--repo', ficha.repo, '--body', `PR aberto: ${url} — aguardando aprovação do analista.`]);
  }
  if (task) {
    const abs = path.join(cwd, task);
    const antes = fs.readFileSync(abs, 'utf8');
    const depois = registrarPr(antes, url, new Date().toISOString());
    if (depois !== antes) {
      fs.writeFileSync(abs, depois);
      git(cwd, ['add', task]);
      git(cwd, ['commit', '-q', '-m', `docs(task): TASK-${id} PR aberto`]);
      pushBranch(cwd, atual, ficha.branch_principal);
    }
  }
  return { ok: true, branch: atual, pr: url, acoes };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 24 testes

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/cartao.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): card-pr abre PR ligado ao cartao sem tocar a principal"
```

---

### Task 9: CLI `github-setup.mjs`

**Files:**
- Create: `scripts/github-setup.mjs`
- Modify: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Testes que falham**

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — `code` 1 / `Cannot find module .../github-setup.mjs`

- [ ] **Step 3: Implementar `scripts/github-setup.mjs`**

```js
#!/usr/bin/env node
// Governança GitHub do Agentic OS (camada F). Saída: JSON em stdout.
// Código de saída: 0 ok · 2 erro conhecido ({ok:false, erro:{codigo, mensagem, como_resolver}}) · 1 erro inesperado.
// Uso (na pasta do projeto):
//   node github-setup.mjs detect [--owner X] [--project N] [--analista login]...
//   node github-setup.mjs apply [--ficha arq] [--dry-run]
//   node github-setup.mjs card-start <ID> [--tipo feature|fix] [--desc texto] [--dry-run]
//   node github-setup.mjs card-pr <ID> [--dry-run]
// Travas fixas: nunca push/merge na branch principal, nunca aprova PR, proteção só endurece.
import { aplicar } from './governanca/apply.mjs';
import { cardPr, cardStart } from './governanca/cartao.mjs';
import { detect } from './governanca/detect.mjs';
import { ErroGov } from './governanca/erros.mjs';
import { ARQ_FICHA, gravarFicha, lerFicha } from './governanca/ficha.mjs';

function opcoes(argv) {
  const o = { _: [], analista: [], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[++i];
      if (v === undefined) throw new ErroGov('PARAMETRO', `Falta valor para ${a}.`);
      if (k === 'analista') o.analista.push(v);
      else o[k] = v;
    } else o._.push(a);
  }
  return o;
}

function rodar(argv, cwd) {
  const [sub, ...resto] = argv;
  const o = opcoes(resto);
  const arq = o.ficha || ARQ_FICHA;
  switch (sub) {
    case 'detect':
      return { ok: true, ...detect(cwd, { owner: o.owner, project: o.project ? Number(o.project) : undefined, analistas: o.analista }) };
    case 'apply': {
      const r = aplicar(cwd, lerFicha(cwd, arq), { dryRun: o.dryRun });
      if (r.ficha) gravarFicha(cwd, r.ficha, arq);
      return r;
    }
    case 'card-start':
      return cardStart(cwd, lerFicha(cwd, arq), o._[0], { tipo: o.tipo, desc: o.desc, dryRun: o.dryRun });
    case 'card-pr':
      return cardPr(cwd, lerFicha(cwd, arq), o._[0], { dryRun: o.dryRun });
    default:
      throw new ErroGov('PARAMETRO', `Subcomando desconhecido: ${sub ?? '(nenhum)'}. Use detect | apply | card-start | card-pr.`);
  }
}

try {
  process.stdout.write(JSON.stringify(rodar(process.argv.slice(2), process.cwd()), null, 2) + '\n');
} catch (e) {
  if (e instanceof ErroGov) {
    process.stdout.write(JSON.stringify({ ok: false, erro: { codigo: e.codigo, mensagem: e.message, como_resolver: e.como_resolver } }, null, 2) + '\n');
    process.exit(2);
  }
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
}
```

Nota: `cardStart` com `o.tipo` undefined usa o default `feature` (desestruturação com default só vale para `undefined` — correto).

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 26 testes

- [ ] **Step 5: Commit**

```bash
git add scripts/github-setup.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): CLI github-setup com saida JSON e codigos de saida"
```

---

### Task 10: Template F + instalador

**Files:**
- Create: `template/F-governanca/README.md`
- Create: `template/F-governanca/automation/procedures/cartao.md`
- Create: `template/F-governanca/.claude/commands/cartao.md`
- Create: `template/F-governanca/docs/tasks/README.md`
- Create: `template/F-governanca/guardrails-bloco.md`
- Create: `scripts/install-governanca.mjs`
- Modify: `scripts/tests/governanca.test.mjs`

- [ ] **Step 1: Criar `template/F-governanca/README.md`**

```markdown
# Camada F — Governança GitHub (opt-in)

Cartão no GitHub Project → branch `feature|fix/{ID}-{desc}` → PR ligado → `main` protegida com
revisão obrigatória do analista. Instalada pelo wizard (`/agentic-os`) via
`node <plugin>/scripts/install-governanca.mjs <projeto> --ficha-json <arquivo>`.

| Arquivo no projeto | Origem |
|---|---|
| `.agentic-os/governanca.json` | Ficha (respostas do wizard) |
| `.agentic-os/bin/` | Cópia de `scripts/github-setup.mjs` + `scripts/governanca/` |
| `automation/procedures/cartao.md` | Este template |
| `.claude/commands/cartao.md` | Este template (wrapper) |
| `docs/tasks/README.md` | Este template (só se não existir) |
| Bloco em `automation/guardrails.md` | `guardrails-bloco.md` |
| Bloco em `.github/CODEOWNERS` | Analistas da ficha |

Docs: `docs/GOVERNANCA.md`.
```

- [ ] **Step 2: Criar `template/F-governanca/automation/procedures/cartao.md`**

```markdown
# Procedimento: /cartao (Governança GitHub)

Fonte única do fluxo do cartão. Funciona em qualquer IA: rode os comandos na raiz do projeto.
O script devolve JSON; `ok:false` traz `erro.codigo` e `erro.como_resolver` — mostre ao usuário e pare.

Ficha: `.agentic-os/governanca.json`. Script: `node .agentic-os/bin/github-setup.mjs`.

## `/cartao <ID>` — começar um cartão

1. `node .agentic-os/bin/github-setup.mjs card-start <ID> --dry-run` → confirme que o cartão existe e
   está em "A Fazer". Erro → mostre `como_resolver` e pare.
2. Pergunte ao usuário: tipo `feature` ou `fix` (padrão `feature`; `fix` se o cartão é bug) e confirme a
   descrição curta sugerida pelo `branch` do dry-run.
3. Monte o plano: siga o procedimento de `/propose` com o nome `<ID>-<desc>` (pasta `changes/<ID>-<desc>/`,
   com `## Cartão: #<ID>` no `proposal.md`). **Mostre o plano e espere a aprovação do usuário.**
4. Com o "sim": `node .agentic-os/bin/github-setup.mjs card-start <ID> --tipo <tipo> --desc "<desc>"`.
   Resultado: branch criada, `docs/tasks/TASK-<ID>-<desc>.md` commitado, cartão em "Em andamento".
5. Commite o plano (`changes/<ID>-<desc>/`) nesta branch. Daqui em diante, todo trabalho do cartão
   acontece **só nesta branch** (`/worker`, `/loop`).

## `/cartao pr <ID>` — abrir o PR

1. Confirme que está na branch do cartão e que os testes passam.
2. `node .agentic-os/bin/github-setup.mjs card-pr <ID> --dry-run` → mostre as ações.
3. `node .agentic-os/bin/github-setup.mjs card-pr <ID>` → push da branch, PR para a principal com
   `Cartão #<ID>`, comentário no cartão, PR registrado no TASK.
4. Diga ao usuário: o merge depende da **aprovação do analista no GitHub**. Você não aprova nem faz merge.

## `/cartao` sem argumento

Liste os cartões em "A Fazer" e "Em andamento":
`gh project item-list <project.number> --owner <project.owner> --format json` (valores da ficha).

## Proibido (ver `automation/guardrails.md`)

Push ou merge na branch principal; aprovar PR (próprio ou alheio); alterar regras de proteção do GitHub
para contornar aprovação; assinar ou simular aprovação em nome do analista.
```

- [ ] **Step 3: Criar `template/F-governanca/.claude/commands/cartao.md`**

```markdown
---
description: Fluxo do cartão do GitHub Project (branch → PR). Uso: /cartao <ID> | /cartao pr <ID>
---
Siga `automation/procedures/cartao.md` com os argumentos: $ARGUMENTS
```

- [ ] **Step 4: Criar `template/F-governanca/docs/tasks/README.md`**

```markdown
# docs/tasks

Um arquivo por cartão: `TASK-{ID}-{descricao}.md`. Nasce no `/cartao <ID>` (cartão, repositório,
branch, início) e recebe o PR no `/cartao pr <ID>`. As próximas etapas (Supervisor, HOM, assinatura,
PRD) acrescentam linhas ao "Histórico" do mesmo arquivo.
```

- [ ] **Step 5: Criar `template/F-governanca/guardrails-bloco.md`**

```markdown
## Governança GitHub (camada F) — proibido

1. Push direto na branch principal.
2. Merge de trabalho não homologado.
3. Publicar em PRD sem aprovação formal do analista.
4. O executor aprovar o próprio código (o agente nunca aprova PR).
5. Usar credenciais de PRD em desenvolvimento.
6. Copiar dados de HOM para PRD indiscriminadamente.
7. Executar mudança destrutiva sem autorização.
8. Ignorar falha crítica de segurança.
9. Falsificar testes ou assinaturas.
10. Alterar regras de proteção do GitHub para contornar aprovação.

O orquestrador nunca assina nem simula aprovação em nome do analista.
**Sem assinatura, sem merge na principal e sem publicação em PRD.**
```

- [ ] **Step 6: Testes do instalador que falham**

```js
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
  assert.ok(fs.existsSync(path.join(dir, '.agentic-os/bin/governanca/cartao.mjs')));
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
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL — instalador inexistente (status ≠ 0)

- [ ] **Step 8: Implementar `scripts/install-governanca.mjs`**

```js
#!/usr/bin/env node
// Instala/atualiza a camada F (Governança GitHub) num projeto. Idempotente.
// Uso: node scripts/install-governanca.mjs <projeto> --ficha-json <arquivo> [--dry-run]
//  - Valida e grava .agentic-os/governanca.json (preserva colunas_ids, ids do Project e protecao_aplicada já gravados).
//  - Copia scripts/github-setup.mjs + scripts/governanca/ para .agentic-os/bin/ (o procedimento usa esta cópia).
//  - Copia procedimento /cartao, comando e docs/tasks/README.md (este só se não existir).
//  - Upsert de blocos marcados em automation/guardrails.md, .github/CODEOWNERS e .gitignore.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'template', 'F-governanca');
const { ARQ_FICHA, validarFicha } = await import(pathToFileURL(path.join(REPO, 'scripts', 'governanca', 'ficha.mjs')).href);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function upsertBloco(texto, id, conteudo, marca = (s) => `<!-- ${s} -->`) {
  const ini = marca(`agentic-os:${id}:start`);
  const fim = marca(`agentic-os:${id}:end`);
  const bloco = `${ini}\n${conteudo.trim()}\n${fim}`;
  const re = new RegExp(`${esc(ini)}[\\s\\S]*?${esc(fim)}`);
  if (re.test(texto)) return texto.replace(re, () => bloco);
  return (texto.trimEnd() ? texto.trimEnd() + '\n\n' : '') + bloco + '\n';
}

function mesclarFicha(nova, antiga) {
  if (!antiga) return nova;
  const vazio = (v) => v === undefined || v === null || v === '' || (typeof v === 'object' && !Object.keys(v).length);
  return {
    ...nova,
    project: {
      ...nova.project,
      id: nova.project.id || antiga.project?.id || '',
      campo_status_id: nova.project.campo_status_id || antiga.project?.campo_status_id || '',
    },
    colunas_ids: vazio(nova.colunas_ids) ? antiga.colunas_ids || {} : nova.colunas_ids,
    protecao_aplicada: vazio(nova.protecao_aplicada) ? antiga.protecao_aplicada ?? null : nova.protecao_aplicada,
  };
}

export function instalar(dest, ficha, { dryRun = false } = {}) {
  const erros = validarFicha(ficha);
  if (erros.length) throw new Error(`Ficha inválida: ${erros.join('; ')}`);
  const plano = [];
  const escrever = (rel, conteudo) => {
    const abs = path.join(dest, rel);
    const atual = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (atual === conteudo) return;
    plano.push(`${atual === null ? 'criar' : 'atualizar'} ${rel}`);
    if (dryRun) return;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, conteudo);
  };
  const ler = (rel) => (fs.existsSync(path.join(dest, rel)) ? fs.readFileSync(path.join(dest, rel), 'utf8') : '');
  const lerSrc = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

  let antiga = null;
  try {
    antiga = JSON.parse(ler(ARQ_FICHA) || 'null');
  } catch {}
  escrever(ARQ_FICHA, JSON.stringify(mesclarFicha(ficha, antiga), null, 2) + '\n');

  escrever('.agentic-os/bin/github-setup.mjs', fs.readFileSync(path.join(REPO, 'scripts', 'github-setup.mjs'), 'utf8'));
  for (const f of fs.readdirSync(path.join(REPO, 'scripts', 'governanca')))
    escrever(`.agentic-os/bin/governanca/${f}`, fs.readFileSync(path.join(REPO, 'scripts', 'governanca', f), 'utf8'));
  const versao = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  escrever('.agentic-os/bin/VERSION', `${versao}\n`);

  escrever('automation/procedures/cartao.md', lerSrc('automation/procedures/cartao.md'));
  escrever('.claude/commands/cartao.md', lerSrc('.claude/commands/cartao.md'));
  if (!fs.existsSync(path.join(dest, 'docs/tasks/README.md'))) escrever('docs/tasks/README.md', lerSrc('docs/tasks/README.md'));

  escrever('automation/guardrails.md', upsertBloco(ler('automation/guardrails.md'), 'governanca', lerSrc('guardrails-bloco.md')));
  const hash = (s) => `# ${s}`;
  const donos = ficha.analistas.map((l) => `@${l}`).join(' ');
  escrever('.github/CODEOWNERS', upsertBloco(ler('.github/CODEOWNERS'), 'governanca', `* ${donos}`, hash));
  escrever('.gitignore', upsertBloco(ler('.gitignore'), 'governanca', '.agentic-os/wizard-estado.json', hash));
  return { ok: true, dry_run: dryRun, plano };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const dest = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
  const i = args.indexOf('--ficha-json');
  try {
    if (i < 0 || !args[i + 1]) throw new Error('Uso: install-governanca.mjs <projeto> --ficha-json <arquivo> [--dry-run]');
    const ficha = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'));
    const r = instalar(dest, ficha, { dryRun: args.includes('--dry-run') });
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, erro: e.message }) + '\n');
    process.exit(2);
  }
}
```

Atenção: o CODEOWNERS usa a **última** regra que casa; o bloco `* @analistas` vai no fim de propósito (o analista revisa tudo). Regras específicas existentes ficam acima e são sobrepostas para `*` — documentar em `docs/GOVERNANCA.md` (Task 13).

- [ ] **Step 9: Rodar e ver passar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: PASS — 28 testes

- [ ] **Step 10: Commit**

```bash
git add template/F-governanca scripts/install-governanca.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(governanca): template F e instalador idempotente"
```

---

### Task 11: Gate de CI

**Files:**
- Create: `scripts/check-governanca.sh`
- Create: `.github/workflows/governanca-check.yml`

- [ ] **Step 1: Criar `scripts/check-governanca.sh`**

```bash
#!/usr/bin/env bash
# Gate da camada F (Governança GitHub): testes do script, travas e instalador.
set -euo pipefail
cd "$(dirname "$0")/.."
node --test scripts/tests/governanca.test.mjs
```

- [ ] **Step 2: Criar `.github/workflows/governanca-check.yml`**

```yaml
name: governanca-check

on:
  push:
    paths:
      - "template/F-governanca/**"
      - "scripts/github-setup.mjs"
      - "scripts/install-governanca.mjs"
      - "scripts/governanca/**"
      - "scripts/tests/governanca.test.mjs"
      - "scripts/tests/fixtures/fake-gh.mjs"
  pull_request:
    paths:
      - "template/F-governanca/**"
      - "scripts/github-setup.mjs"
      - "scripts/install-governanca.mjs"
      - "scripts/governanca/**"
      - "scripts/tests/governanca.test.mjs"
      - "scripts/tests/fixtures/fake-gh.mjs"

jobs:
  check-governanca:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Testes da governança GitHub (camada F)
        run: bash scripts/check-governanca.sh
```

- [ ] **Step 3: Rodar o gate**

Run: `bash scripts/check-governanca.sh`
Expected: `# pass 28` e `# fail 0`

- [ ] **Step 4: Commit**

```bash
git add scripts/check-governanca.sh .github/workflows/governanca-check.yml
git commit -m "ci(governanca): gate governanca-check"
```

---

### Task 12: Wizard na skill + empacotamento

**Files:**
- Create: `skills/agentic-os/wizard.md`
- Modify: `skills/agentic-os/SKILL.md` (seção "Fase de descoberta", linhas ~184–196; seção `/propose`, ~303–315; nova seção da camada F após a do roteador)
- Modify: `scripts/build-skill.sh`
- Modify: `scripts/check-skill-sync.sh`
- Regenerate: `agentic-os.skill`

- [ ] **Step 1: Criar `skills/agentic-os/wizard.md`**

````markdown
# Wizard de configuração do Agentic OS

Roteiro obrigatório para configurar (ou reconfigurar) um projeto. Substitui a "Fase de descoberta".

## Regras

- **Uma pergunta por tela.** 2–4 opções; a recomendada primeiro, com "(recomendado)". Toda tela aceita
  **Voltar**; etapas opcionais aceitam **Pular**.
- **Claude Code:** use `AskUserQuestion` (1 pergunta por chamada). **Codex/Gemini/outros:** lista numerada
  no texto; aceite o número como resposta.
- **Detectar antes de perguntar.** Se a detecção for certa, só peça confirmação ("Encontrei X. Correto?").
- **Nada é criado antes da etapa 14.** Exceção: `.agentic-os/wizard-estado.json` (respostas até agora,
  sem segredo), gravado a cada etapa. Ao iniciar, se ele existir, ofereça "Retomar de onde parou".
- **Idempotente.** Projeto já configurado: mostre o que está igual e pergunte só o que falta/mudou.
- **Toda ação no GitHub é mostrada com o comando** antes de rodar.
- Fale como para um leigo: analogia curta antes do termo técnico.
- `<plugin>` = pasta do plugin Agentic OS (onde está este arquivo, dois níveis acima).

## Etapas

| # | Etapa | Faça |
|---|---|---|
| 1 | Início | Pasta vazia → Modo B; com código → Modo A. Pergunte só se ambíguo. |
| 2 | Avisos de custo | Mostre já, antes de configurar: (a) Roteador sem chave do Jev → **todos os pedidos vão para o Opus**; (b) Governança em repo **privado** pode exigir plano pago do GitHub para proteção da `main` e aprovação de ambiente. Pergunte "Entendi, seguir?". |
| 3 | Projeto | Tipo (SaaS / n8n / conteúdo / consultoria / outro), stack (detecte por `package.json`, `requirements.txt`, `pom.xml`… e confirme), usuários, objetivo do agente. Uma pergunta por tela. |
| 4 | Camadas | Múltipla escolha: Roteador de Modelos · Multi-provedor · Governança GitHub. Marque "(já tem)" nas instaladas. |
| 5 | Roteador | Só se escolhido. Pergunta e aviso da seção "Roteador de Modelos" do SKILL.md (chave agora / `fallback_sem_chave` Sonnet / sem roteador). |
| 6 | Multi-provedor | Só se escolhido. Quais IAs (múltipla); humano como orquestrador final (Orquestração) sim/não. |
| 7 | Git | Rode `node <plugin>/scripts/github-setup.mjs detect`. Aviso `NAO_E_GIT` → ofereça `git init`. Confirme a branch principal. |
| 8 | Repo GitHub | `repo` do detect → confirme. Aviso `SEM_REMOTO` → opções: criar privado (`gh repo create <dono>/<nome> --private --source . --push`) / colar nome existente. |
| 9 | Project | Liste `projects` do detect (título + URL). Opções: escolher um / criar novo (`gh project create --owner <dono> --title "<nome>"`) / colar URL. Depois rode `detect --project <N>`. |
| 10 | Colunas | Compare `status_project.opcoes` com: Backlog, A Fazer, Em andamento, Em validação, Aprovado, Concluído, Bloqueado. Mostre as faltantes; pergunte se cria (feito no `apply`). |
| 11 | Analista | Pergunte o(s) login(s) GitHub de quem assina. Rode `detect --project <N> --analista <login>`. `ANALISTA_IGUAL_AGENTE` → explique que precisa de outra conta e pergunte de novo. `ANALISTA_INEXISTENTE` → pergunte de novo. `colaborador:false` → avise que será convidado. |
| 12 | Ambientes | Nomes HOM/PRD (padrão `hom`/`prd`); mostre os que já existem. |
| 13 | Proteção | Monte a ficha (`fichaPadrao` + respostas) em `.agentic-os/wizard-estado.json` e rode `node <plugin>/scripts/github-setup.mjs apply --ficha .agentic-os/wizard-estado.json --dry-run`. Mostre `mudancas` ("antes → depois"). Erro `PLANO_SEM_PROTECAO` → 3 opções: tornar público / subir de plano / seguir com proteção parcial (grava `aceitar_protecao_parcial: true`). |
| 14 | Resumo | Liste tudo que será criado/alterado: arquivos do Agentic OS, camadas, ações do `apply --dry-run`. Pergunte "Criar?". |
| 15 | Execução | Sem perguntas: crie a estrutura (Modo A/B), instale camadas escolhidas (`install-router.mjs`; `install-governanca.mjs <projeto> --ficha-json .agentic-os/wizard-estado.json`), rode `node .agentic-os/bin/github-setup.mjs apply`, depois o loop de conformidade A/B até PASS (máx. 3 ciclos). |
| 16 | Fim | Relatório: o que foi feito, links (repo, Project), avisos (ex.: proteção parcial), próximo passo: `/cartao <ID>`. Os arquivos de governança criados devem entrar na principal por PR (`chore/agentic-os-governanca`) — a proteção já está ativa. Apague `.agentic-os/wizard-estado.json`. |

Etapas 5–13 só aparecem se a camada correspondente foi escolhida na etapa 4 (7–13 = Governança).

## Erros do script

Toda saída `ok:false` traz `erro.codigo` e `erro.como_resolver`: mostre os dois, ofereça "Tentar de novo"
ou "Pular a Governança" e não avance sem resposta. Nunca contorne uma trava.
````

- [ ] **Step 2: Apontar o SKILL.md para o wizard**

Em `skills/agentic-os/SKILL.md`, substituir o bloco inteiro de `### Fase de descoberta (antes de criar arquivos)` (título + lista 1–5 + "Usar as respostas…") por:

```markdown
### Fase de descoberta = Wizard (antes de criar arquivos)

Toda configuração (Modo A ou B, camadas opcionais, reconfiguração) segue o **wizard**:
[`wizard.md`](wizard.md) — uma pergunta por tela, com opções e recomendação, até o resumo final.
Os avisos de custo (roteador sem chave do Jev → tudo no Opus; governança em repo privado pode exigir
plano pago do GitHub) vêm **na etapa 2, antes de qualquer configuração**.

Usar as respostas para popular os arquivos com conteúdo real — não placeholders genéricos.
```

No Passo 4 do Modo A, substituir a frase `Se o roteador de modelos estiver no plano, a mesma confirmação traz o aviso da Fase de descoberta (pergunta 5):` + linha seguinte por:

```markdown
A confirmação é a etapa 14 (Resumo) do [wizard](wizard.md); os avisos de custo já foram dados na etapa 2.
```

Na seção `### /.claude/commands/propose.md`, depois do item 3 (antes de "- **Projeto modular**"), acrescentar:

```markdown
- **Governança ativa** (`.agentic-os/governanca.json` existe): perguntar o número do cartão; nome da
  mudança = `<ID>-<desc>`; incluir `## Cartão: #<ID>` no `proposal.md`. Preferir `/cartao <ID>`, que
  chama este fluxo e cria a branch.
```

Logo depois da seção da camada do Roteador (procurar o parágrafo que contém `install-router.mjs <projeto>`), acrescentar a seção:

```markdown
## Camada Governança GitHub (opt-in, camada F)

Cartão no GitHub Project → branch `feature|fix/{ID}-{desc}` → PR ligado → `main` protegida com revisão
obrigatória do analista + Environments `hom`/`prd`. Configurada pelas etapas 7–13 do [wizard](wizard.md).
Instalar: `node <plugin>/scripts/install-governanca.mjs <projeto> --ficha-json <arquivo>` e depois
`node .agentic-os/bin/github-setup.mjs apply` no projeto. Uso diário: `/cartao <ID>` e `/cartao pr <ID>`
(`automation/procedures/cartao.md`). Travas: o agente nunca faz push/merge na principal, nunca aprova PR e
nunca afrouxa proteção. Detalhes: `docs/GOVERNANCA.md`.
```

- [ ] **Step 3: Empacotar também o wizard**

Em `scripts/build-skill.sh`, depois da linha `tr -d '\r' < "$SRC" > "$tmp/agentic-os/SKILL.md"  # LF sempre (igual ao repo/CI)`, acrescentar:

```bash
tr -d '\r' < "skills/agentic-os/wizard.md" > "$tmp/agentic-os/wizard.md"
```

Em `scripts/check-skill-sync.sh`, substituir o bloco `if diff -q ... fi` por:

```bash
falhou=0
for f in SKILL.md wizard.md; do
  if ! diff -q <(tr -d '\r' < "$tmp/agentic-os/$f") <(tr -d '\r' < "skills/agentic-os/$f") >/dev/null 2>&1; then
    echo "FAIL: $OUT está DESATUALIZADO em relação a skills/agentic-os/$f."
    falhou=1
  fi
done
rm -rf "$tmp"
if [ "$falhou" = 1 ]; then
  echo "      Rode: scripts/build-skill.sh  e commite o resultado."
  exit 1
fi
echo "OK: $OUT está sincronizado com skills/agentic-os/{SKILL,wizard}.md"
```

- [ ] **Step 4: Reempacotar e checar**

Run: `bash scripts/build-skill.sh && bash scripts/check-skill-sync.sh`
Expected: `build ok: agentic-os.skill …` e `OK: agentic-os.skill está sincronizado com skills/agentic-os/{SKILL,wizard}.md`

- [ ] **Step 5: Commit**

```bash
git add skills/agentic-os/wizard.md skills/agentic-os/SKILL.md scripts/build-skill.sh scripts/check-skill-sync.sh agentic-os.skill
git commit -m "feat(skill): configuracao vira wizard e camada F de governanca"
```

---

### Task 13: Conformidade, docs e versão 1.9.0

**Files:**
- Modify: `docs/CONFORMANCE-SPEC.md` (nova seção antes de `## Regras anti-drift invioláveis`)
- Create: `docs/GOVERNANCA.md`
- Modify: `docs/guia-completo.html` (nova seção + linha no histórico + strings de versão)
- Modify: `README.md`, `RELEASE-NOTES.md`
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (entrada agentic-os), `.codex-plugin/plugin.json` → `1.9.0`

- [ ] **Step 1: CONFORMANCE-SPEC — itens F1–F6**

Inserir antes de `## Regras anti-drift invioláveis (qualquer uma → FAIL)`:

```markdown
## Camada Governança GitHub (exigida só quando opt-in ativo)

Ativa quando `.agentic-os/governanca.json` existe.

| # | Item exigido | Verificação |
|---|--------------|-------------|
| F1 | `.agentic-os/governanca.json` válido e **sem segredo** | JSON lê; `repo`, `project.owner/number`, 7 colunas, ≥1 analista, ambientes, prefixos; nenhuma chave com token/secret/senha/password/api_key |
| F2 | `automation/procedures/cartao.md` + `.agentic-os/bin/github-setup.mjs` | Ambos presentes |
| F3 | `.claude/commands/cartao.md` é wrapper fino | ≤ 6 linhas, aponta para o procedimento |
| F4 | Bloco `agentic-os:governanca` em `automation/guardrails.md` | Contém as 10 proibições |
| F5 | `docs/tasks/` existe | Pasta presente |
| F6 | `.github/CODEOWNERS` com bloco `agentic-os:governanca` listando os analistas da ficha | Logins iguais aos da ficha |

---
```

- [ ] **Step 2: Criar `docs/GOVERNANCA.md`**

```markdown
# Governança GitHub (camada F)

> Analogia: uma esteira de fábrica com portas trancadas. Cada pedido (cartão) anda numa esteira própria
> (branch). Para entrar no estoque oficial (`main`), a porta só abre com o crachá do analista
> (aprovação no GitHub) — e se alguém mexer na peça depois do crachá, a porta tranca de novo.

## O que faz (Partes 0 e 1)

1. **Wizard** (`/agentic-os`): pergunta tudo em etapas e configura o projeto.
2. **Ficha** `.agentic-os/governanca.json`: repo, Project, colunas, analista(s), ambientes. Sem segredo.
3. **`/cartao <ID>`**: cartão (issue no Project, coluna "A Fazer") → plano aprovado →
   branch `feature/{ID}-{desc}` (ou `fix/`) → `docs/tasks/TASK-{ID}-{desc}.md` → cartão em "Em andamento".
4. **`/cartao pr <ID>`**: push da branch, PR para a `main` citando `#ID`, comentário no cartão.
5. **`main` protegida**: PR obrigatório, 1 aprovação do analista (CODEOWNERS), aprovação descartada em
   commit novo, aprovação do último push, vale para admins, sem force-push nem exclusão.
6. **Environments** `hom` e `prd` (o `prd` exige aprovação do analista).

Próximas partes: Supervisor (nota 0–10), HOM + assinatura, publicação PRD.

## Requisitos

- `gh` instalado e logado com permissão `project` (`gh auth refresh -s project`).
- Analista com **conta GitHub própria** (o GitHub não deixa quem abriu o PR aprová-lo) e acesso de escrita
  ao repo (o wizard convida).
- **Custo:** em repo privado, proteção de branch e revisores de ambiente podem exigir plano pago do GitHub.
  O wizard testa e, se o plano não permitir, oferece: tornar público, subir de plano ou proteção parcial
  (registrada na ficha em `protecao_aplicada`).

## Travas (não há opção para desligar)

O script nunca faz push ou merge na branch principal, nunca aprova PR, nunca apaga nada e só **endurece**
a proteção (se a regra atual for mais forte, mantém a atual).

## CODEOWNERS

O instalador acrescenta no fim de `.github/CODEOWNERS` o bloco `* @analista`. No CODEOWNERS vale a
**última** regra que casa: por isso o analista revisa todo arquivo. Regras específicas existentes
continuam acima, mas para arquivos cobertos por `*` o analista passa a ser o dono.

## Comandos do script

`node .agentic-os/bin/github-setup.mjs <detect|apply|card-start|card-pr> [--dry-run]` — saída JSON;
erro conhecido sai com código 2 e `erro.codigo` + `erro.como_resolver`.

| Código | Como resolver |
|---|---|
| GH_AUSENTE / GH_DESLOGADO | Instalar o `gh` / `gh auth login` |
| SEM_ESCOPO_PROJECT | `gh auth refresh -s project` |
| PLANO_SEM_PROTECAO | Tornar público / subir de plano / proteção parcial |
| ANALISTA_IGUAL_AGENTE | Usar outra conta para o analista |
| CARTAO_INEXISTENTE / CARTAO_FORA_DE_A_FAZER | Criar a issue no Project / mover para "A Fazer" |
| ARVORE_SUJA | Commitar ou `git stash` |
| BRANCH_EXISTE | `git switch <branch>` para retomar |
| REDE | Repetir (seguro) |
```

- [ ] **Step 3: README, RELEASE-NOTES e guia**

`README.md`: na lista/tabela de camadas ou recursos, acrescentar uma linha:
`- **Governança GitHub (v1.9, opt-in):** cartão → branch → PR com main protegida e aprovação do analista. Ver [docs/GOVERNANCA.md](docs/GOVERNANCA.md).`
E onde o README descreve o uso do `/agentic-os`, acrescentar: `A configuração é um wizard: uma pergunta por vez, com opções.`

`RELEASE-NOTES.md`: acrescentar no topo (mesmo formato das seções anteriores):

```markdown
## v1.9.0 — 2026-11-03

- **Wizard de configuração:** `/agentic-os` configura tudo em etapas (uma pergunta por tela, opções com
  recomendação, Voltar/Pular, retomada após queda). Avisos de custo na etapa 2. Ver `skills/agentic-os/wizard.md`.
- **Camada F — Governança GitHub (opt-in):** ficha `.agentic-os/governanca.json`; `/cartao <ID>` cria a
  branch `feature|fix/{ID}-{desc}` e `docs/tasks/TASK-{ID}-{desc}.md`; `/cartao pr <ID>` abre PR ligado;
  `main` protegida com revisão obrigatória do analista (CODEOWNERS), Environments `hom`/`prd`.
  Script `scripts/github-setup.mjs` (detect/apply/card-start/card-pr, `--dry-run`, JSON) e instalador
  `scripts/install-governanca.mjs`. Travas fixas: sem push/merge na principal, sem aprovar PR, proteção
  só endurece. CI `governanca-check`. Docs: `docs/GOVERNANCA.md`.
- Conformidade: itens F1–F6.
```

`docs/guia-completo.html`: copiar a estrutura de uma seção existente (ex.: a seção 8b do painel) para
criar a seção "Governança GitHub e wizard" com o texto de `docs/GOVERNANCA.md` (analogia, o que faz,
requisitos/custo, travas); acrescentar a linha `1.9.0` na tabela de histórico; trocar as strings de versão
`1.8.7` → `1.9.0` onde indicam a versão atual do plugin.

- [ ] **Step 4: Versão 1.9.0 nos 3 manifestos**

Trocar `"version": "1.8.7"` por `"version": "1.9.0"` em `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` e na entrada `agentic-os` de `.claude-plugin/marketplace.json` (a entrada do painel continua `1.2.1`).

Run: `grep -n '"version"' .claude-plugin/plugin.json .codex-plugin/plugin.json .claude-plugin/marketplace.json`
Expected: três `1.9.0` (agentic-os) e um `1.2.1` (painel)

- [ ] **Step 5: Validar o plugin e rodar todos os gates (parar no primeiro erro)**

Run:
```bash
set -e
claude plugin validate .
bash scripts/check-governanca.sh
bash scripts/check-agents-sync.sh
bash scripts/check-skill-sync.sh
bash scripts/check-pointers.sh
bash scripts/check-rules-sync.sh
```
Expected: todos OK; `# fail 0` nos dois `node --test`.

- [ ] **Step 6: Commit**

```bash
git add docs/CONFORMANCE-SPEC.md docs/GOVERNANCA.md docs/guia-completo.html README.md RELEASE-NOTES.md .claude-plugin/plugin.json .claude-plugin/marketplace.json .codex-plugin/plugin.json
git commit -m "docs(governanca): CONFORMANCE F1-F6, GOVERNANCA.md, guia e versao 1.9.0"
```

---

### Task 14: Teste real (sandbox no GitHub) — exige confirmação do usuário

Mocks escondem bugs reais (lição do painel 1.2.0). Este teste usa o GitHub de verdade.

**Antes de começar, pedir ao usuário:** "Posso criar o repo privado `rasecagapito/agenticos-sandbox-governanca` e um Project de teste na sua conta? Para o teste do analista preciso de uma segunda conta GitHub (login?) ou faço sem ela e testo só até o merge bloqueado." Sem "sim", pular para a Task 15 registrando que o teste real não foi feito.

- [ ] **Step 1: Criar sandbox**

```bash
cd "$TEMP" && mkdir agenticos-sandbox-governanca && cd agenticos-sandbox-governanca
git init -q -b main && echo "# sandbox" > README.md && git add . && git commit -qm init
gh repo create rasecagapito/agenticos-sandbox-governanca --private --source . --push
gh project create --owner rasecagapito --title "Sandbox Governança" --format json
```
Anotar `number`, `url`, `id` do Project.

- [ ] **Step 2: Detect real**

Run: `node "G:/Meu Drive/CDEV/Skill/Agentic OS/scripts/github-setup.mjs" detect --project <N> --analista <login-do-analista>`
Expected: `ok:true`, `repo` = `rasecagapito/agenticos-sandbox-governanca`, `status_project.opcoes` com as opções padrão do Project (ex.: Todo / In Progress / Done), `protecao.estado` = `nenhuma` ou `indisponivel_no_plano`.
Registrar qual veio (responde a dúvida do plano pago).

- [ ] **Step 3: Ficha + instalação + apply real**

Escrever a ficha (valores do Step 2) em `.agentic-os/wizard-estado.json`, então:
```bash
node "G:/Meu Drive/CDEV/Skill/Agentic OS/scripts/install-governanca.mjs" . --ficha-json .agentic-os/wizard-estado.json
node .agentic-os/bin/github-setup.mjs apply --dry-run
node .agentic-os/bin/github-setup.mjs apply
```
Conferir no navegador: colunas novas no Project **e** que um item de teste criado antes (`gh issue create` + `gh project item-add`) com status "Todo" **mantém** o status depois do apply (valida que a mutação de colunas não apaga status existentes). Se perder: parar, registrar, e trocar a estratégia de colunas antes de liberar.
Conferir: Settings → Branches (regra na `main`), Settings → Environments (`hom`, `prd` com revisor).

- [ ] **Step 4: Cartão de ponta a ponta**

```bash
gh issue create --repo rasecagapito/agenticos-sandbox-governanca --title "Carga de clientes" --body teste
gh project item-add <N> --owner rasecagapito --url <url-da-issue>
```
Mover o item para "A Fazer" no navegador (ou `gh project item-edit`). Commitar os arquivos de governança numa branch `chore/agentic-os-governanca` (a `main` já está protegida). Então:
```bash
node .agentic-os/bin/github-setup.mjs card-start <num-issue>
echo "x" > exemplo.txt && git add . && git commit -qm "feat: exemplo"
node .agentic-os/bin/github-setup.mjs card-pr <num-issue>
gh pr merge <url-do-pr> --merge   # tentativa manual do usuário/teste: DEVE falhar
```
Expected: branch `feature/<num>-carga-de-clientes` no GitHub; cartão em "Em andamento"; PR aberto com `Cartão #<num>`; comentário na issue; `gh pr merge` recusado ("review required" / base protegida) — se o plano permitir proteção.

- [ ] **Step 5: Registrar e limpar**

Registrar os resultados (o que passou, se a proteção ficou completa ou parcial) no corpo do PR da release.
Perguntar ao usuário antes de apagar: "Posso apagar o repo e o Project de teste?" Com "sim":
```bash
gh repo delete rasecagapito/agenticos-sandbox-governanca --yes
gh project delete <N> --owner rasecagapito
```

---

### Task 15: Release v1.9.0

- [ ] **Step 1: Gates com parada no primeiro erro**

Run (mesmo bloco do Task 13 Step 5, com `set -e`). Expected: tudo OK.

- [ ] **Step 2: PR**

```bash
git push -u origin feat/wizard-governanca
gh pr create --title "feat: v1.9.0 - wizard de configuracao + governanca GitHub (camada F)" --body "<resumo + resultados do teste real da Task 14>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: Merge, tag e release (com o "sim" do usuário)**

```bash
gh pr merge --squash --delete-branch
git switch main && git pull -q
git tag v1.9.0 && git push origin v1.9.0
gh release create v1.9.0 --title "v1.9.0 — Wizard + Governança GitHub" --notes-file <(sed -n '/^## v1.9.0/,/^## v1.8.7/p' RELEASE-NOTES.md | sed '$d')
```

- [ ] **Step 4: Atualizar o plugin nesta máquina**

```bash
claude plugin marketplace update agentic-os
claude plugin update agentic-os@agentic-os --scope user
```
Avisar o usuário para reiniciar o VS Code e testar `/agentic-os` num projeto real.
````
