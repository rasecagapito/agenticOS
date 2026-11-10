# HOM e assinatura do analista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/cartao hom <ID>` publica o commit revisado no HOM pelos comandos da ficha (fila por GitHub Deployments) e `/cartao assinatura <ID>` lê a review do analista no PR e registra aprovação/reprovação.

**Architecture:** `executar.mjs` (runner comum), `hom.mjs` (pré-condições, deployments, etapas, instruções), `assinatura.mjs` (decisão pura sobre reviews + efeitos), helpers novos em `cartao.mjs`, trava de reviews em `gh.mjs`. Estado local em `.agentic-os/hom/<ID>.json` + log `.agentic-os/hom/<ID>.log` (fora do git). Nada é commitado na branch depois do deploy.

**Tech Stack:** Node ≥18 ESM sem dependências, `node:test`, `gh` CLI (falso nos testes via `AGENTIC_OS_GH_FAKE`), git.

**Spec:** `docs/superpowers/specs/2026-11-04-hom-assinatura-design.md`. Branch: `feat/hom-assinatura`.

**Regras do repo:**
- Testes no Windows com arquivos explícitos: `node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs scripts/tests/hom.test.mjs` (pasta não funciona; demora vários minutos — timeout longo).
- Commits terminam com linha em branco + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Hook "Isolamento de clientes" bloqueia Bash com `$VAR`/`${...}`/crase+barra: use caminhos literais e a ferramenta Write/Edit para textos assim.
- O fake-gh registra em `chamadas()` cada chamada `{args, input, body_file}` (`body_file` = conteúdo do arquivo de `--body-file`).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/governanca/executar.mjs` | Criar | roda comando pelo runner com limite; usado por B1 e HOM |
| `scripts/governanca/supervisor.mjs` | Modificar | `rodarTestes` usa `executar` |
| `scripts/governanca/gh.mjs` | Modificar | trava: nunca escreve em reviews/merge, nunca `pr review|merge|close` |
| `scripts/governanca/erros.mjs` | Modificar | 7 códigos novos |
| `scripts/governanca/ficha.mjs` | Modificar | campos HOM no `fichaPadrao` |
| `scripts/governanca/cartao.mjs` | Modificar | exporta `ghComCorpo`, `prAberto`, `registrarSecao`, `anexarNaSecao` |
| `scripts/governanca/hom.mjs` | Criar | `card-hom` |
| `scripts/governanca/assinatura.mjs` | Criar | `card-sign` |
| `scripts/github-setup.mjs` | Modificar | subcomandos e flags |
| `scripts/tests/hom.test.mjs` | Criar | testes da Parte 3 |
| `scripts/check-governanca.sh` | Modificar | roda os 3 arquivos de teste |
| `template/F-governanca/automation/procedures/cartao.md`, `guardrails-bloco.md` | Modificar | `/cartao hom`, `/cartao assinatura`, guardrail 12 |
| `scripts/install-governanca.mjs` | Modificar | `.gitignore` com `.agentic-os/hom/` |
| wizard, SKILL, docs, manifestos | Modificar | etapa HOM, docs, v1.11.0 |

---

### Task 1: Base — executar, trava de reviews, erros, ficha, helpers do cartão

**Files:** Create `scripts/governanca/executar.mjs`, `scripts/tests/hom.test.mjs`; Modify `supervisor.mjs`, `gh.mjs`, `erros.mjs`, `ficha.mjs`, `cartao.mjs`.

- [ ] **Step 1: Criar `scripts/tests/hom.test.mjs` com helpers e testes da base**

```js
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
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test scripts/tests/hom.test.mjs` → FAIL (`executar.mjs` não existe).

- [ ] **Step 3: Implementar**

`scripts/governanca/executar.mjs`:

```js
// Executa um comando de shell com limite de tempo pelo runner, que mata a árvore de processos no estouro.
// Usado pelo B1 do Supervisor (testes) e pelas etapas do HOM.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RUNNER = fileURLToPath(new URL('./rodar-comando.mjs', import.meta.url));
const MARCADOR_TEMPO = '__AGENTIC_OS_TEMPO_ESGOTADO__';

export function executar(cwd, comando, limiteMs) {
  const r = spawnSync(process.execPath, [RUNNER, comando, String(limiteMs)], {
    cwd, encoding: 'utf8', timeout: limiteMs + 30000, maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error)
    return { ok: false, codigo: null, tempo_esgotado: r.error.code === 'ETIMEDOUT', erroCodigo: r.error.code || 'erro', erro: r.error.message, saida: '' };
  const bruta = `${r.stdout || ''}${r.stderr || ''}`;
  const tempo = bruta.includes(MARCADOR_TEMPO);
  return { ok: !tempo && r.status === 0, codigo: r.status, tempo_esgotado: tempo, erroCodigo: null, erro: null, saida: bruta.replace(MARCADOR_TEMPO, '').trim() };
}
```

`supervisor.mjs`: importar `import { executar } from './executar.mjs';`, remover `RUNNER`/`MARCADOR_TEMPO`/`spawnSync`/`fileURLToPath` se ficarem sem uso, e trocar o corpo de `rodarTestes` por:

```js
export function rodarTestes(cwd, comando, { limiteMs = LIMITE_TESTES_MS } = {}) {
  if (!comando) return nao('comando de testes não configurado (comando_testes na ficha)');
  const r = executar(cwd, comando, limiteMs);
  if (r.tempo_esgotado) return nao(`tempo esgotado (${formatarLimite(limiteMs)}): ${comando}`);
  if (r.erro) return nao(`falha ao executar os testes (${r.erroCodigo}): ${r.erro}`);
  const saida = r.saida.split('\n').slice(-40).join('\n');
  const prova = `${comando} → saída ${r.codigo}${saida ? `\n${saida}` : ''}`;
  return r.codigo === 0 ? at(prova) : nao(prova);
}
```

`gh.mjs`: no início de `gh(args, ...)`, chamar `verificarChamada(args)` (exportada):

```js
// Trava fixa: o plugin nunca escreve em reviews nem faz merge/close/review de PR (só o analista assina).
export function verificarChamada(args) {
  const linha = args.join(' ');
  if (args[0] === 'pr' && ['merge', 'review', 'close'].includes(args[1]))
    throw new ErroGov('TRAVA', `gh pr ${args[1]} é proibido pela governança.`);
  if (args[0] === 'api' && /pulls\/\d+\/(reviews|merge)/.test(linha)) {
    const i = args.findIndex((a) => a === '-X' || a === '--method');
    const temCampo = args.some((a) => ['-f', '-F', '--field', '--raw-field', '--input'].includes(a));
    const metodo = i >= 0 ? String(args[i + 1]).toUpperCase() : temCampo ? 'POST' : 'GET';
    if (metodo !== 'GET') throw new ErroGov('TRAVA', 'Escrever em reviews ou merge de PR é proibido pela governança.');
  }
}
```

(confira que `gh.mjs` importa `ErroGov`; se não, importe de `./erros.mjs`.)

`erros.mjs`, depois de `REVISAO_VENCIDA`:

```js
  SEM_PR: 'Rode /cartao pr <ID> antes.',
  HOM_OCUPADO: 'O HOM está com outro cartão em validação. Espere a assinatura dele ou fure a fila com o "sim" do usuário (--furar-fila --motivo).',
  MIGRACAO_NAO_AUTORIZADA: 'Mostre o comando de migração ao usuário e peça o "sim" (--migracao-autorizada).',
  COMANDO_SUSPEITO_PRD: 'Um comando de HOM cita produção. Confira com o usuário antes de seguir (--confirmo-comando).',
  SEM_HOM: 'Rode /cartao hom <ID> antes.',
  HOM_FALHOU: 'Uma etapa do HOM falhou. Veja a etapa e o log em .agentic-os/hom/<ID>.log, corrija e rode de novo.',
  ASSINATURA_DE_OUTRO_COMMIT: 'O analista aprovou uma versão anterior. Peça a aprovação do commit atual no PR.',
```

`ficha.mjs`, em `fichaPadrao`, depois de `comando_testes: null,`:

```js
    deploy_hom: null,
    migracao_hom: null,
    testes_hom: null,
    url_hom: null,
    limite_hom_min: 30,
```

`cartao.mjs`: exportar `ghComCorpo` (trocar `function ghComCorpo` por `export function ghComCorpo`), e acrescentar/trocar:

```js
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Insere ou troca a seção "## <titulo>" (antes de "## Histórico", se houver). Preserva CRLF.
export function registrarSecao(original, titulo, secao) {
  const crlf = original.includes('\r\n');
  const texto = original.replace(/\r\n/g, '\n');
  const s = secao.replace(/\r\n/g, '\n').trimEnd() + '\n';
  const t = escRe(titulo);
  let r;
  if (new RegExp(`^## ${t}$`, 'm').test(texto)) r = texto.replace(new RegExp(`^## ${t}\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm'), () => `${s}\n`);
  else if (titulo !== 'Histórico' && /^## Histórico$/m.test(texto)) r = texto.replace(/^## Histórico$/m, () => `${s}\n## Histórico`);
  else r = texto.trimEnd() + `\n\n${s}`;
  return crlf ? r.replace(/\n/g, '\r\n') : r;
}

export const registrarSupervisor = (original, secao) => registrarSecao(original, 'Supervisor', secao);

// Acrescenta uma linha ao fim da seção "## <titulo>" (cria a seção se faltar). Preserva CRLF.
export function anexarNaSecao(original, titulo, linha) {
  const crlf = original.includes('\r\n');
  const texto = original.replace(/\r\n/g, '\n');
  const re = new RegExp(`(^## ${escRe(titulo)}\\n[\\s\\S]*?)(\\n*)(?=^## |(?![\\s\\S]))`, 'm');
  const r = re.test(texto)
    ? texto.replace(re, (_, corpo) => `${corpo.trimEnd()}\n${linha}\n\n`).replace(/\n{3,}$/, '\n')
    : registrarSecao(texto, titulo, `## ${titulo}\n\n${linha}`);
  const fim = r.endsWith('\n') ? r : `${r}\n`;
  return crlf ? fim.replace(/\n/g, '\r\n') : fim;
}

export function prAberto(ficha, branch) {
  const l = ghJson(['pr', 'list', '--repo', ficha.repo, '--head', branch, '--state', 'open', '--json', 'number,url']) || [];
  return l[0] || null;
}
```

(remova a função `registrarSupervisor` antiga; em `cardPr` troque a busca de PR existente por `prAberto` mantendo o comportamento: `const existente = prAberto(ficha, atual);` e use `existente?.url`.)

- [ ] **Step 4: Rodar tudo** — `node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs scripts/tests/hom.test.mjs` → PASS (todos, incluindo os antigos).

- [ ] **Step 5: Commit** — `feat(hom): runner comum, trava de reviews, erros, ficha e helpers do cartao`

---

### Task 2: `card-hom`

**Files:** Create `scripts/governanca/hom.mjs`; Test `scripts/tests/hom.test.mjs`.

- [ ] **Step 1: Testes**

```js
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
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test scripts/tests/hom.test.mjs` → FAIL (`hom.mjs` não existe).

- [ ] **Step 3: Implementar `scripts/governanca/hom.mjs`**

```js
// HOM (Parte 3): publica o commit revisado no ambiente HOM pelos comandos da ficha. Fila: GitHub Deployments.
// Nada é commitado na branch depois do deploy (commit depois da aprovação do analista a descartaria).
import fs from 'node:fs';
import path from 'node:path';
import { acharCartao, anexarNaSecao, ghComCorpo, moverCartao, prAberto } from './cartao.mjs';
import { ErroGov } from './erros.mjs';
import { executar } from './executar.mjs';
import { gh, ghJson } from './gh.mjs';
import { branchAtual, git, pushBranch } from './git.mjs';
import { acharTask, exigirRevisao, lerCriterios, validarId } from './supervisor.mjs';

export const DIR_HOM = '.agentic-os/hom';
const agora = () => new Date().toISOString();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const arqEstado = (cwd, id) => path.join(cwd, DIR_HOM, `${id}.json`);

export function lerEstadoHom(cwd, id) {
  const p = arqEstado(cwd, id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    throw new ErroGov('PARAMETRO', `Estado ilegível: ${DIR_HOM}/${id}.json`);
  }
}

export function gravarEstadoHom(cwd, id, e) {
  const p = arqEstado(cwd, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(e, null, 2) + '\n');
}

const payloadDe = (d) => {
  if (typeof d?.payload === 'string') {
    try {
      return JSON.parse(d.payload);
    } catch {
      return {};
    }
  }
  return d?.payload || {};
};

export function listarDeploys(ficha) {
  return ghJson(['api', `repos/${ficha.repo}/deployments?environment=${encodeURIComponent(ficha.ambientes.hom)}&per_page=100`]) || [];
}

export function ultimoStatus(ficha, depId) {
  const l = ghJson(['api', `repos/${ficha.repo}/deployments/${depId}/statuses?per_page=1`]) || [];
  return l[0]?.state || 'pending';
}

export function marcarStatus(ficha, depId, state, { descricao = '', url } = {}) {
  const corpo = { state, description: descricao.slice(0, 140), ...(url ? { environment_url: url } : {}) };
  gh(['api', '-X', 'POST', `repos/${ficha.repo}/deployments/${depId}/statuses`, '--input', '-'], { input: JSON.stringify(corpo) });
}

function criarDeploy(ficha, sha, payload) {
  const corpo = {
    ref: sha, environment: ficha.ambientes.hom, auto_merge: false, required_contexts: [], payload,
    description: `Cartão #${payload.cartao}`, transient_environment: false, production_environment: false,
  };
  return ghJson(['api', '-X', 'POST', `repos/${ficha.repo}/deployments`, '--input', '-'], { input: JSON.stringify(corpo) });
}

// Cartão que ocupa o HOM: dono do deployment mais recente com status "success" (não inativo).
export function quemOcupa(ficha, id) {
  for (const d of listarDeploys(ficha).slice(0, 20)) {
    if (ultimoStatus(ficha, d.id) !== 'success') continue;
    const p = payloadDe(d);
    const c = Number(p.cartao);
    return c && c !== Number(id) ? { cartao: c, pr: p.pr, sha: String(d.sha || '') } : null;
  }
  return null;
}

export function comandosSuspeitos(ficha) {
  const nomes = [...new Set(['prd', ficha.ambientes?.prd].filter(Boolean).map((s) => escRe(String(s))))];
  const re = new RegExp(`(^|[^A-Za-z0-9])(${nomes.join('|')})([^A-Za-z0-9]|$)`, 'i');
  return ['deploy_hom', 'migracao_hom', 'testes_hom'].filter((k) => ficha[k] && re.test(ficha[k]));
}

export function instrucoesAnalista({ id, sha, ficha, criterios, nota }) {
  return [
    `## Homologação do cartão #${id}`,
    '',
    `Versão publicada no HOM: commit \`${sha.slice(0, 7)}\`${ficha.url_hom ? ` — ${ficha.url_hom}` : ''}`,
    `Nota do Supervisor: ${nota}`,
    '',
    '**O que testar:**',
    ...criterios.map((c) => `- [ ] ${c}`),
    '',
    '**Como responder:** neste PR, *Review changes* → **Approve** para aprovar, ou **Request changes** descrevendo o que falhou. Commit novo depois disso exige nova homologação.',
  ].join('\n');
}

export function cardHom(cwd, ficha, id, o = {}) {
  const n = validarId(id);
  const branch = branchAtual(cwd);
  if (!Object.values(ficha.prefixos_branch).some((p) => branch.startsWith(`${p}${n}-`)))
    throw new ErroGov('BRANCH_ERRADA', `A branch atual "${branch}" não é do cartão #${n}.`);
  if (git(cwd, ['status', '--porcelain', '--untracked-files=no']).out !== '') throw new ErroGov('ARVORE_SUJA');
  const pr = prAberto(ficha, branch);
  if (!pr) throw new ErroGov('SEM_PR');
  const rev = exigirRevisao(cwd, n);
  const ocupa = quemOcupa(ficha, n);
  if (o.furarFila && !String(o.motivo || '').trim()) throw new ErroGov('PARAMETRO', '--furar-fila exige --motivo.');
  if (ocupa && !o.furarFila)
    throw new ErroGov('HOM_OCUPADO', `O HOM está com o cartão #${ocupa.cartao} (PR #${ocupa.pr}, commit ${ocupa.sha.slice(0, 7)}).`);
  const susp = comandosSuspeitos(ficha);
  if (susp.length && !o.confirmoComando) throw new ErroGov('COMANDO_SUSPEITO_PRD', `Citam produção: ${susp.join(', ')}.`);
  if (ficha.migracao_hom && !o.migracaoAutorizada) throw new ErroGov('MIGRACAO_NAO_AUTORIZADA', `Migração HOM: ${ficha.migracao_hom}`);
  const manual = !ficha.deploy_hom;
  const marca = `docs(task): TASK-${n} homologacao`;
  const task = acharTask(cwd, n);
  const acoes = [
    task ? `registrar Homologação em ${task} (commit + push antes do deploy)` : 'sem TASK',
    `deployment ${ficha.ambientes.hom} do commit atual`,
    ...(manual ? ['modo manual: o usuário publica o commit'] : [`deploy: ${ficha.deploy_hom}`]),
    ...(ficha.migracao_hom ? [`migração: ${ficha.migracao_hom}`] : []),
    ...(ficha.testes_hom ? [`testes HOM: ${ficha.testes_hom}`] : []),
    `cartão #${n} → ${ficha.colunas.em_validacao}`,
    `instruções ao analista no PR ${pr.url}`,
  ];
  if (o.dryRun) return { ok: true, dry_run: true, acoes };

  if (task && git(cwd, ['log', '-1', '--format=%s']).out !== marca) {
    const abs = path.join(cwd, task);
    const fila = o.furarFila ? `\n- Fila furada com o "sim" do usuário. Motivo: ${String(o.motivo).trim()}` : '';
    fs.writeFileSync(abs, anexarNaSecao(fs.readFileSync(abs, 'utf8'), 'Homologação', `- ${agora()} — publicação no HOM pedida (PR ${pr.url}). O commit publicado é o que contém esta linha.${fila}`));
    git(cwd, ['add', task]);
    git(cwd, ['commit', '-q', '-m', marca]);
    pushBranch(cwd, branch, ficha.branch_principal);
  }
  const sha = git(cwd, ['rev-parse', 'HEAD']).out;
  if (manual && !o.publicadoManual)
    return { ok: true, modo: 'manual', sha, pr: pr.url, instrucao: `Publique o commit ${sha.slice(0, 7)} no HOM e confirme; depois rode: card-hom ${n} --publicado-manual` };

  const anterior = lerEstadoHom(cwd, n);
  let dep = listarDeploys(ficha).find((d) => d.sha === sha && Number(payloadDe(d).cartao) === n);
  if (!dep) dep = criarDeploy(ficha, sha, { cartao: n, pr: pr.number, ...(o.furarFila ? { furou_fila: true, motivo: String(o.motivo).trim() } : {}) });
  marcarStatus(ficha, dep.id, 'in_progress', { descricao: `Cartão #${n}` });
  const log = path.join(cwd, DIR_HOM, `${n}.log`);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `\n# ${agora()} — cartão #${n}, commit ${sha}\n`);
  const limite = (Number(ficha.limite_hom_min) || 30) * 60000;
  const etapas = [['deploy', manual ? null : ficha.deploy_hom], ['migracao', ficha.migracao_hom], ['testes', ficha.testes_hom]].filter(([, c]) => c);
  for (const [etapa, cmd] of etapas) {
    const r = executar(cwd, cmd, limite);
    const fim = r.tempo_esgotado ? 'tempo esgotado' : r.erro ? `${r.erroCodigo}: ${r.erro}` : `saída ${r.codigo}`;
    fs.appendFileSync(log, `\n## ${etapa}: ${cmd}\n${r.saida}\n→ ${fim}\n`);
    if (!r.ok) {
      marcarStatus(ficha, dep.id, 'failure', { descricao: `Falhou em ${etapa}` });
      const aviso = etapa === 'migracao' ? ' ATENÇÃO: o banco HOM pode estar pela metade; confira antes de tentar de novo.' : '';
      const motivo = r.tempo_esgotado ? `tempo esgotado em ${Number(ficha.limite_hom_min) || 30} min` : fim;
      throw new ErroGov('HOM_FALHOU', `Etapa "${etapa}" falhou (${motivo}). Log: ${DIR_HOM}/${n}.log.${aviso}\n${r.saida.split('\n').slice(-20).join('\n')}`);
    }
  }
  marcarStatus(ficha, dep.id, 'success', { descricao: `Cartão #${n} em validação`, url: ficha.url_hom || undefined });
  moverCartao(ficha, acharCartao(ficha, n).itemId, 'em_validacao');
  const jaComentado = anterior?.sha === sha && anterior?.comentado;
  if (!jaComentado) {
    const criterios = lerCriterios(cwd, n).criterios.filter((c) => c.id.startsWith('C')).map((c) => c.texto);
    const v = rev.valida;
    const nota = `${v.nota}/10${v.tipo === 'liberado_pelo_usuario' ? ' (liberada pelo usuário)' : ''}`;
    ghComCorpo(['pr', 'comment', pr.url, '--repo', ficha.repo], instrucoesAnalista({ id: n, sha, ficha, criterios, nota }));
  }
  gravarEstadoHom(cwd, n, {
    id: n, sha, pr, deploy_id: dep.id, em: dep.created_at || agora(), branch, comentado: true,
    assinatura: anterior?.sha === sha ? anterior.assinatura || null : null, reprovacoes: anterior?.reprovacoes || [],
  });
  return { ok: true, sha, pr: pr.url, deploy_id: dep.id, etapas: etapas.map(([e]) => e), cartao: ficha.colunas.em_validacao };
}
```

- [ ] **Step 4: Rodar** — `node --test scripts/tests/hom.test.mjs` → PASS. Ajuste mínimo se um teste do plano estiver errado (relate).

- [ ] **Step 5: Commit** — `feat(hom): card-hom publica o commit revisado com fila por deployments`

---

### Task 3: `card-sign`

**Files:** Create `scripts/governanca/assinatura.mjs`; Test `scripts/tests/hom.test.mjs`.

- [ ] **Step 1: Testes**

```js
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
const REVIEWS = (lista) => ok('^api repos/dono/app/pulls/7/reviews', lista);
const assinaturaBase = (lista) => [ok('^api user$', { login: 'agente' }), REVIEWS(lista), ITEM, ok('^project item-edit', '{}'),
  ok('^pr view', { body: 'Cartão #101\n\n## Supervisor\nnota' }), ok('^pr edit', ''), STATUS, ok('^issue comment', '')];

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
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test scripts/tests/hom.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `scripts/governanca/assinatura.mjs`**

```js
// Assinatura (Parte 3): LÊ a review do analista no PR (só GET) e registra aprovação ou reprovação.
// O agente nunca assina: review da conta do agente não vale. Aprovação não gera commit (descartaria a review).
import fs from 'node:fs';
import path from 'node:path';
import { acharCartao, anexarNaSecao, ghComCorpo, moverCartao, registrarSecao } from './cartao.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';
import { gravarEstadoHom, lerEstadoHom, marcarStatus } from './hom.mjs';
import { acharTask, validarId } from './supervisor.mjs';

const VALE = ['APPROVED', 'CHANGES_REQUESTED'];

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

export function textoAssinatura(reg) {
  return [
    '| Campo | Valor |',
    '|---|---|',
    `| Cartão | #${reg.cartao} |`,
    `| Repositório | ${reg.repo} |`,
    `| PR | ${reg.pr} |`,
    `| Analista | ${reg.analista} |`,
    `| Data/hora | ${reg.em} |`,
    `| Commit homologado | ${reg.commit} |`,
    `| Ambiente | ${reg.ambiente} |`,
    `| Resultado | ${reg.resultado} |`,
    `| Evidência | ${reg.evidencia} |`,
    '',
    reg.texto ? `> ${umaLinha(reg.texto)}` : '> (sem comentário na review)',
  ].join('\n');
}

export function cardSign(cwd, ficha, id) {
  const n = validarId(id);
  const e = lerEstadoHom(cwd, n);
  if (!e) throw new ErroGov('SEM_HOM');
  if (e.assinatura && e.assinatura.commit === e.sha) return { ok: true, situacao: 'aprovado', ja_registrado: true, assinatura: e.assinatura };
  const agente = ghJson(['api', 'user'])?.login;
  const reviews = ghJson(['api', `repos/${ficha.repo}/pulls/${e.pr.number}/reviews?per_page=100`]) || [];
  const d = decidir({ reviews, analistas: ficha.analistas, agente, sha: e.sha, desde: e.em });
  if (d.situacao === 'aguardando') return { ok: true, situacao: 'aguardando_analista', pr: e.pr.url };
  if (d.situacao === 'outro_commit') throw new ErroGov('ASSINATURA_DE_OUTRO_COMMIT');
  const r = d.review;
  if (d.situacao === 'reprovado' && (e.reprovacoes || []).some((x) => x.evidencia === r.html_url))
    return { ok: true, situacao: 'reprovado', ja_registrado: true, pontos: (r.body || '').trim() };
  const reg = {
    cartao: n, repo: ficha.repo, pr: e.pr.url, analista: r.user.login, em: r.submitted_at, commit: e.sha,
    ambiente: ficha.ambientes.hom, resultado: d.situacao === 'aprovado' ? 'aprovado' : 'reprovado', evidencia: r.html_url, texto: (r.body || '').trim(),
  };
  const cartao = acharCartao(ficha, n);
  const curto = e.sha.slice(0, 7);
  if (d.situacao === 'aprovado') {
    const atual = ghJson(['pr', 'view', e.pr.url, '--repo', ficha.repo, '--json', 'body'])?.body || '';
    ghComCorpo(['pr', 'edit', e.pr.url, '--repo', ficha.repo], registrarSecao(atual, 'Assinatura', `## Assinatura\n\n${textoAssinatura(reg)}`));
    moverCartao(ficha, cartao.itemId, 'aprovado');
    marcarStatus(ficha, e.deploy_id, 'inactive', { descricao: `Cartão #${n} aprovado` });
    gh(['issue', 'comment', String(n), '--repo', ficha.repo, '--body', `Homologação aprovada por ${reg.analista} em ${reg.em} (commit ${curto}). Evidência: ${reg.evidencia}`]);
    gravarEstadoHom(cwd, n, { ...e, assinatura: reg });
    return { ok: true, situacao: 'aprovado', assinatura: reg };
  }
  const task = acharTask(cwd, n);
  if (task) {
    const abs = path.join(cwd, task);
    fs.writeFileSync(abs, anexarNaSecao(fs.readFileSync(abs, 'utf8'), 'Homologação',
      `- ${reg.em} — REPROVADO por ${reg.analista} (commit ${curto}). Motivo: ${umaLinha(reg.texto) || '(sem texto)'}. Evidência: ${reg.evidencia}`));
  }
  moverCartao(ficha, cartao.itemId, 'em_andamento');
  marcarStatus(ficha, e.deploy_id, 'inactive', { descricao: `Cartão #${n} reprovado` });
  gh(['issue', 'comment', String(n), '--repo', ficha.repo, '--body', `Homologação reprovada por ${reg.analista} em ${reg.em} (commit ${curto}). Motivo: ${umaLinha(reg.texto)}. Evidência: ${reg.evidencia}`]);
  gravarEstadoHom(cwd, n, { ...e, assinatura: null, reprovacoes: [...(e.reprovacoes || []), reg] });
  return { ok: true, situacao: 'reprovado', pontos: reg.texto, ...(task ? { task_atualizado: task, aviso: 'TASK atualizado no disco: commite junto com a correção.' } : {}) };
}
```

- [ ] **Step 4: Rodar** — `node --test scripts/tests/hom.test.mjs` → PASS.

- [ ] **Step 5: Commit** — `feat(hom): card-sign le a review do analista e registra aprovacao ou reprovacao`

---

### Task 4: CLI, instalador, procedimento, guardrail

**Files:** Modify `scripts/github-setup.mjs`, `scripts/check-governanca.sh`, `scripts/install-governanca.mjs`, `template/F-governanca/automation/procedures/cartao.md`, `template/F-governanca/.claude/commands/cartao.md`, `template/F-governanca/guardrails-bloco.md`; Test `hom.test.mjs` + teste do instalador em `governanca.test.mjs`.

- [ ] **Step 1: Testes**

Em `hom.test.mjs`:

```js
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
  cenario([PR, SEM_DEPLOY]);
  const dry = cli(p.dir, ['card-hom', '101', '--dry-run', '--migracao-autorizada', '--confirmo-comando']);
  assert.equal(dry.code, 0, dry.stderr);
  assert.equal(dry.json.dry_run, true);
  const sem = cli(p.dir, ['card-sign', '101']);
  assert.equal(sem.code, 2);
  assert.equal(sem.json.erro.codigo, 'SEM_HOM');
  assert.equal(cli(p.dir, ['card-hom', '101', '--furar-fila', '--motivo', '--dry-run']).json.erro.codigo, 'PARAMETRO');
});
```

No teste `install: cria ficha, script, procedimento...` de `governanca.test.mjs`, acrescentar:

```js
  assert.match(ler('.gitignore'), /^\.agentic-os\/hom\/$/m);
  assert.match(ler('automation/procedures/cartao.md'), /## `\/cartao hom <ID>`/);
  assert.match(ler('automation/procedures/cartao.md'), /## `\/cartao assinatura <ID>`/);
  assert.match(ler('automation/guardrails.md'), /12\. /);
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

`github-setup.mjs`:
- comentário de uso: `card-hom <ID> [--furar-fila --motivo "..."] [--migracao-autorizada] [--confirmo-comando] [--publicado-manual] [--dry-run]` e `card-sign <ID>`, com a nota "flags de autorização só com o 'sim' do usuário".
- imports: `import { cardHom } from './governanca/hom.mjs';` e `import { cardSign } from './governanca/assinatura.mjs';`
- `BOOLEANAS` ganha `'--furar-fila': 'furarFila', '--migracao-autorizada': 'migracaoAutorizada', '--confirmo-comando': 'confirmoComando', '--publicado-manual': 'publicadoManual'` (e `opcoes` inicializa esses quatro como `false`).
- `switch`:

```js
    case 'card-hom':
      return cardHom(cwd, lerFicha(cwd, arq), o._[0], {
        dryRun: o.dryRun, furarFila: o.furarFila, motivo: o.motivo, migracaoAutorizada: o.migracaoAutorizada,
        confirmoComando: o.confirmoComando, publicadoManual: o.publicadoManual,
      });
    case 'card-sign':
      return cardSign(cwd, lerFicha(cwd, arq), o._[0]);
```
- mensagem do `default` lista `card-hom | card-sign`.

`check-governanca.sh`: última linha → `node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs scripts/tests/hom.test.mjs`

`install-governanca.mjs`: conteúdo do bloco `.gitignore` → `'.agentic-os/wizard-estado.json\n.agentic-os/supervisor/\n.agentic-os/hom/'`.

`guardrails-bloco.md`, depois do 11:
```
12. Passar `--furar-fila`, `--migracao-autorizada`, `--confirmo-comando` ou `--publicado-manual` sem o "sim" do usuário; registrar ou simular a review do analista.
```

`commands/cartao.md` description: `... Uso: /cartao <ID> | /cartao revisar <ID> | /cartao pr <ID> | /cartao hom <ID> | /cartao assinatura <ID>`

`procedures/cartao.md`:
- Em `/cartao pr <ID>`, último passo vira: "Diga ao usuário: próximo passo é `/cartao hom <ID>`. Você não aprova nem faz merge."
- Inserir depois de `/cartao pr`:

````markdown
## `/cartao hom <ID>` — publicar no HOM

1. `node .agentic-os/bin/github-setup.mjs card-hom <ID> --dry-run` → mostre as ações.
   - `HOM_OCUPADO` → diga qual cartão ocupa o HOM. Pergunte se espera ou fura a fila; furar só com o "sim" e
     um motivo (`--furar-fila --motivo "..."`).
   - `MIGRACAO_NAO_AUTORIZADA` → mostre o comando de migração e pergunte. Com o "sim": `--migracao-autorizada`.
   - `COMANDO_SUSPEITO_PRD` → um comando de HOM cita produção. Mostre e pergunte. Com o "sim": `--confirmo-comando`.
2. `node .agentic-os/bin/github-setup.mjs card-hom <ID> [flags autorizadas]`.
   - `modo: manual` → peça ao usuário publicar o commit `sha` no HOM; com a confirmação dele:
     `card-hom <ID> --publicado-manual`.
   - `HOM_FALHOU` → mostre a etapa e as linhas finais; o log completo está em `.agentic-os/hom/<ID>.log`.
     Falha de migração: avise que o banco HOM pode estar pela metade. Não tente desfazer sozinho.
3. Sucesso: cartão em "Em validação"; o PR recebeu as instruções ao analista. Diga ao usuário que o analista
   deve abrir o PR e fazer **Approve** ou **Request changes**. Não faça commit nesta branch até a assinatura.

## `/cartao assinatura <ID>` — ler a decisão do analista

1. `node .agentic-os/bin/github-setup.mjs card-sign <ID>`.
2. Conforme `situacao`:
   - `aguardando_analista` → diga que ainda não há review válida do analista no PR.
   - `aprovado` → cartão em "Aprovado"; a assinatura está no corpo do PR. Próximo passo: Parte 4 (merge/PRD).
   - `reprovado` → passe os `pontos` ao executor (`/worker`); ele corrige e commita **junto com o TASK já
     atualizado**; depois `/cartao revisar <ID>` → `/cartao pr <ID>` → `/cartao hom <ID>`.
   - `ASSINATURA_DE_OUTRO_COMMIT` → peça ao analista aprovar a versão atual no PR.

Nunca aprove, reprove, comente como analista nem registre review por ele.
````

- [ ] **Step 4: Rodar** — `bash scripts/check-governanca.sh` → PASS.

- [ ] **Step 5: Commit** — `feat(hom): subcomandos card-hom e card-sign, procedimento, guardrail 12 e instalador`

---

### Task 5: Wizard, skill, docs e versão 1.11.0

- [ ] **Wizard (`skills/agentic-os/wizard.md`)**: nova linha de etapa **depois da 12** (renumere 13–16 → 14–17 e a frase "7–13 = Governança" → "7–14"), com o texto: "| 13 | HOM | Pergunte, um por tela: comando de **deploy HOM** (`deploy_hom`; vazio = publicação manual), **migração HOM** (`migracao_hom`, opcional; roda só com o "sim" a cada vez), **testes HOM** (`testes_hom`, opcional), **link do HOM** (`url_hom`). Avise: credenciais **nunca** na ficha — só em variáveis de ambiente ou `.env` fora do git; comando de HOM que cite produção pede confirmação. |". Na etapa da ficha completa, acrescentar `deploy_hom, migracao_hom, testes_hom, url_hom`. Na etapa Fim, fluxo: `/cartao <ID>` → trabalho → `revisar` → `pr` → `hom` → analista revisa o PR → `assinatura`.
- [ ] **SKILL.md**: na seção da camada F, 1 linha: "`/cartao hom <ID>` publica o commit revisado no HOM (fila por GitHub Deployments); `/cartao assinatura <ID>` lê a review do analista no PR (Approve/Request changes) e registra. Ver `docs/GOVERNANCA.md`." Rodar `bash scripts/build-skill.sh` e `bash scripts/check-skill-sync.sh`.
- [ ] **`docs/GOVERNANCA.md`**: "Partes 0, 1 e 2" → "0 a 3"; seção "## HOM e assinatura (Parte 3)" antes de "## Requisitos": analogia do gerente de obra; `/cartao hom` (pré-condições, fila, migração com "sim", modo manual, log local, nada commitado depois do deploy); `/cartao assinatura` (só lê review; última por analista; commit e data; conta do agente não vale; aprovado → corpo do PR + Aprovado; reprovado → TASK no disco + Em andamento); **limite honesto** do plano gratuito (review registrada, mas o GitHub não obriga o merge a esperar — a Parte 4 vai exigir a assinatura no merge feito pelo plugin; merge manual pela interface continua possível); erros novos. Em "Comandos do script": `card-hom`, `card-sign`.
- [ ] **`docs/CONFORMANCE-SPEC.md`**: F4 "11 proibições" → "12"; nova linha `| F9 | `.gitignore` com `.agentic-os/hom/` e procedimento com `/cartao hom` e `/cartao assinatura` | Ambos presentes |`; "F1–F8" → "F1–F9" onde aparecer (fora do histórico do RELEASE-NOTES).
- [ ] **Guia (`docs/guia-completo.html`, seção `#governanca`)**: `<h3>Homologação e assinatura</h3>` no estilo das vizinhas (analogia, passos, o que o analista faz, limite do plano gratuito); linha 1.11.0 na tabela de versões.
- [ ] **README.md**: citar `/cartao hom` e `/cartao assinatura` na camada F.
- [ ] **RELEASE-NOTES.md**, no topo:

```markdown
# Agentic OS v1.11.0

- **HOM e assinatura (Parte 3 da governança):** `/cartao hom <ID>` publica o commit revisado pelo Supervisor
  no HOM com os comandos da ficha (`deploy_hom`, `migracao_hom` só com o "sim", `testes_hom`, `url_hom`),
  um cartão por vez (fila por GitHub Deployments, furar só com "sim" + motivo), log local fora do git, cartão
  em "Em validação" e instruções ao analista no PR. `/cartao assinatura <ID>` **lê** a review do analista
  (Approve/Request changes, última por analista, do commit publicado, depois do deploy; conta do agente não
  vale): aprovado → assinatura no corpo do PR e cartão em "Aprovado"; reprovado → motivo no TASK e cartão em
  "Em andamento". Nada é commitado depois do deploy (não descarta a aprovação).
- Trava fixa: o plugin nunca escreve em reviews nem faz `pr review|merge|close`. Guardrail 12. Conformidade F9.
- Wizard: etapa HOM. Limite: em repo privado no plano gratuito o GitHub não obriga o merge a esperar a assinatura.
```

- [ ] **Versão**: `1.11.0` em `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` e na entrada `agentic-os` de `.claude-plugin/marketplace.json` (painel fica `1.2.1`).
- [ ] **Gates**: `bash scripts/check-governanca.sh && node --test scripts/tests/router.test.mjs && bash scripts/check-skill-sync.sh && bash scripts/check-pointers.sh && bash scripts/check-rules-sync.sh && claude plugin validate .` → tudo OK.
- [ ] **Commit** — `docs(hom): wizard, skill, GOVERNANCA, conformidade F9, guia e versao 1.11.0`

---

### Task 6: Teste real (controlador, com "sim" do usuário)

- [ ] Sandbox privado + Project; ficha com `analistas: ["<analista-de-teste>"]`, `deploy_hom` que grava arquivo, `url_hom`; install + apply (convida o <analista-de-teste>); **usuário aceita o convite como <analista-de-teste>**.
- [ ] Cartão 1: start → proposal → revisar (Supervisor real) até 10 → pr → hom → **usuário (<analista-de-teste>) faz Request changes** → assinatura = reprovado, TASK no disco, cartão Em andamento → corrige + commita → revisar → pr → hom → **Approve** → assinatura = aprovado, corpo do PR com registro, cartão Aprovado.
- [ ] Antes do Approve: cartão 2 tenta hom → `HOM_OCUPADO`. Uma aprovação do commit antigo → `ASSINATURA_DE_OUTRO_COMMIT`.
- [ ] Apagar repo e Project; confirmar.

### Task 7: Release v1.11.0 (só com o "sim" do usuário)

- [ ] Gates → push → PR (resultados do teste real + linha 🤖) → CI → squash-merge → tag `v1.11.0` → release → `claude plugin marketplace update agentic-os` + `claude plugin update agentic-os@agentic-os --scope user` → memória.
