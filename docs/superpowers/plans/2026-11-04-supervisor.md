# Supervisor (nota 0–10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à camada F um Supervisor que revisa o cartão antes do PR e dá nota 0–10 com prova; `card-pr` só abre PR com nota 10 ou liberação do usuário.

**Architecture:** Script (`supervisor.mjs`, `segredos.mjs`) mede B1–B4 sem IA, guarda estado em `.agentic-os/supervisor/<ID>.json` (fora do git) e calcula a nota; subagente `supervisor` (Opus fixo, sem edição) julga G/E/C com prova; procedimento `/cartao revisar` orquestra; `card-pr` exige revisão válida para o commit atual.

**Tech Stack:** Node ≥18 ESM sem dependências, `node:test`, `gh` CLI (falso nos testes via `AGENTIC_OS_GH_FAKE`), git.

**Spec:** `docs/superpowers/specs/2026-11-04-supervisor-design.md`. Branch: `feat/supervisor`.

**Regras do repo:**
- Rodar testes no Windows com arquivos explícitos: `node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs` (pasta não funciona).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca escrever token literal em teste (o push protection do GitHub bloqueia): monte por concatenação (`'gh' + 'p_' + 'a'.repeat(36)`).
- Hook "Isolamento de clientes" bloqueia comandos Bash com `$VAR`/`${...}`/crase+barra: use caminhos literais; para textos com esses caracteres, escreva arquivo com a ferramenta Write.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/governanca/erros.mjs` | Modificar | 5 códigos novos |
| `scripts/governanca/ficha.mjs` | Modificar | `comando_testes: null` no `fichaPadrao` |
| `scripts/governanca/git.mjs` | Modificar | `maxBuffer` 64 MB (diffs grandes) |
| `scripts/governanca/segredos.mjs` | Criar | varredura de segredos no diff (B2) |
| `scripts/governanca/supervisor.mjs` | Criar | critérios, B1–B4, nota, estado, check/record/decide, trava do PR, seção do PR |
| `scripts/governanca/cartao.mjs` | Modificar | `cardPr` exige revisão; PR e TASK com seção Supervisor |
| `scripts/github-setup.mjs` | Modificar | subcomandos `review-check/record/decide`, flags |
| `scripts/tests/supervisor.test.mjs` | Criar | testes da Parte 2 |
| `scripts/tests/governanca.test.mjs` | Modificar | testes de `card-pr` criam revisão válida |
| `scripts/check-governanca.sh` | Modificar | roda os 2 arquivos de teste |
| `template/F-governanca/.claude/agents/supervisor.md` | Criar | subagente |
| `template/F-governanca/automation/procedures/cartao.md` | Modificar | `/cartao revisar`; critérios no plano |
| `template/F-governanca/.claude/commands/cartao.md` | Modificar | descrição com `revisar` |
| `template/F-governanca/guardrails-bloco.md` | Modificar | proibição 11 |
| `scripts/install-governanca.mjs` | Modificar | copia agente; `.gitignore` com `.agentic-os/supervisor/` |
| `skills/agentic-os/wizard.md`, `SKILL.md`, docs, manifestos | Modificar | etapa de testes, custo, docs, v1.10.0 |

---

### Task 1: Erros, ficha e git

**Files:**
- Modify: `scripts/governanca/erros.mjs`, `scripts/governanca/ficha.mjs`, `scripts/governanca/git.mjs`
- Test: `scripts/tests/supervisor.test.mjs` (criar)

- [ ] **Step 1: Criar o arquivo de teste com helpers e o primeiro teste**

```js
// Testes do Supervisor (Parte 2). Rodar: node --test scripts/tests/supervisor.test.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
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
    colunas_ids: { a_fazer: 'o2', em_andamento: 'o3' },
    analistas: ['analista'], ambientes: { hom: 'hom', prd: 'prd' },
    prefixos_branch: { feature: 'feature/', fix: 'fix/' },
    aceitar_protecao_parcial: false, protecao_aplicada: null,
    comando_testes: 'node -e "process.exit(0)"',
    ...extra,
  };
}

// Projeto git com origin (bare local), branch do cartão 101, TASK e proposal com critérios.
function projetoCartao({ criterios = ['Importa CSV com 3 colunas', 'Rejeita linha sem CNPJ'], semProposal = false } = {}) {
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
  fs.writeFileSync(path.join(dir, '.gitignore'), '.agentic-os/supervisor/\n');
  g('add', '.');
  g('commit', '-qm', 'init');
  g('remote', 'add', 'origin', bare);
  g('push', '-q', 'origin', 'main');
  g('fetch', '-q', 'origin');
  g('switch', '-q', '--no-track', '-c', 'feature/101-carga', 'origin/main');
  fs.mkdirSync(path.join(dir, 'docs', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/tasks/TASK-101-carga.md'), '# TASK-101\n\n## Plano\nx\n\n## Histórico\n- início\n');
  if (!semProposal) {
    fs.mkdirSync(path.join(dir, 'changes', '101-carga'), { recursive: true });
    const itens = criterios.map((c) => `- ${c}`).join('\n');
    fs.writeFileSync(path.join(dir, 'changes/101-carga/proposal.md'), `# Carga\n\n## Cartão: #101\n\n## Critérios de aceite\n${itens}\n\n## Fora do escopo\n- nada\n`);
  }
  fs.writeFileSync(path.join(dir, 'carga.mjs'), 'export const x = 1;\n');
  g('add', '.');
  g('commit', '-qm', 'feat: carga');
  return { dir, g, head: () => g('rev-parse', 'HEAD') };
}

test('erros novos têm como_resolver; ficha padrão traz comando_testes null', async () => {
  const { ERROS } = await imp('erros.mjs');
  for (const c of ['SEM_CRITERIOS', 'PARECER_INVALIDO', 'AGUARDA_DECISAO', 'SEM_REVISAO', 'REVISAO_VENCIDA']) assert.ok(ERROS[c], c);
  const { fichaPadrao } = await imp('ficha.mjs');
  assert.equal(fichaPadrao().comando_testes, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: FAIL (`SEM_CRITERIOS` ausente).

- [ ] **Step 3: Implementar**

Em `scripts/governanca/erros.mjs`, dentro de `ERROS`, depois de `TRAVA`:

```js
  SEM_CRITERIOS: 'Adicione "## Critérios de aceite" (lista de itens verificáveis) ao proposal.md do cartão (changes/<ID>-<desc>/).',
  PARECER_INVALIDO: 'Rode /cartao revisar <ID> de novo: o parecer precisa ser JSON do Supervisor para o commit atual.',
  AGUARDA_DECISAO: '3ª nota abaixo de 10: pergunte ao usuário se segue com a nota atual ou faz nova análise (review-decide).',
  SEM_REVISAO: 'Rode /cartao revisar <ID> antes de abrir o PR.',
  REVISAO_VENCIDA: 'Houve commit depois da revisão. Rode /cartao revisar <ID> de novo.',
```

Em `scripts/governanca/ficha.mjs`, no objeto de `fichaPadrao`, depois de `protecao_aplicada: null,`:

```js
    comando_testes: null,
```

Em `scripts/governanca/git.mjs`, na chamada `spawnSync('git', args, {...})`, acrescentar `maxBuffer: 64 * 1024 * 1024,` junto de `timeout: 30000`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/supervisor.test.mjs scripts/tests/governanca.test.mjs`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/erros.mjs scripts/governanca/ficha.mjs scripts/governanca/git.mjs scripts/tests/supervisor.test.mjs
git commit -m "feat(supervisor): erros novos, comando_testes na ficha, maxBuffer no git"
```

---

### Task 2: Varredura de segredos (B2)

**Files:**
- Create: `scripts/governanca/segredos.mjs`
- Test: `scripts/tests/supervisor.test.mjs`

- [ ] **Step 1: Testes**

```js
test('segredos: acha token no + do diff, com arquivo:linha e texto mascarado; ignora linhas removidas', async () => {
  const { varrerSegredos } = await imp('segredos.mjs');
  const tok = 'gh' + 'p_' + 'a'.repeat(36);
  const diff = [
    'diff --git a/x.mjs b/x.mjs', '--- a/x.mjs', '+++ b/x.mjs', '@@ -1,0 +5,2 @@',
    '+const ok = 1;', `+const t = '${tok}';`, '@@ -9 +10,0 @@', `-const velho = '${tok}';`,
  ].join('\n');
  const { achados, liberados } = varrerSegredos(diff);
  assert.equal(achados.length, 1);
  assert.equal(achados[0].arquivo, 'x.mjs');
  assert.equal(achados[0].linha, 6);
  assert.equal(achados[0].tipo, 'token GitHub');
  assert.ok(!achados[0].trecho.includes(tok));
  assert.equal(liberados.length, 0);
});

test('segredos: padrões AWS, sk-, PEM e senha literal; texto permitido vai para liberados', async () => {
  const { varrerSegredos } = await imp('segredos.mjs');
  const linhas = [
    'AKIA' + 'ABCDEFGHIJKLMNOP',
    'sk-' + 'x'.repeat(24),
    '-----BEGIN RSA ' + 'PRIVATE KEY-----',
    'senha = "' + 'segredo123' + '"',
  ];
  const diff = ['+++ b/c.txt', '@@ -0,0 +1,4 @@', ...linhas.map((l) => `+${l}`)].join('\n');
  const r = varrerSegredos(diff);
  assert.deepEqual(r.achados.map((a) => a.tipo), ['chave AWS', 'chave sk-', 'chave privada', 'senha/chave literal']);
  const r2 = varrerSegredos(diff, ['sk-' + 'x'.repeat(24)]);
  assert.equal(r2.achados.length, 3);
  assert.equal(r2.liberados.length, 1);
});

test('segredos: lerPermitidos ignora vazias e comentários', async () => {
  const { lerPermitidos } = await imp('segredos.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'perm-'));
  assert.deepEqual(lerPermitidos(dir), []);
  fs.mkdirSync(path.join(dir, '.agentic-os'));
  fs.writeFileSync(path.join(dir, '.agentic-os/segredos-permitidos.txt'), '# exemplo\n\nchave-de-teste-123\n');
  assert.deepEqual(lerPermitidos(dir), ['chave-de-teste-123']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: FAIL (módulo `segredos.mjs` não existe).

- [ ] **Step 3: Implementar `scripts/governanca/segredos.mjs`**

```js
// Varredura de segredos nas linhas adicionadas de um diff unificado (critério B2 do Supervisor).
// Texto exato listado em .agentic-os/segredos-permitidos.txt (editado só pelo usuário) vira "liberado".
import fs from 'node:fs';
import path from 'node:path';

export const ARQ_PERMITIDOS = '.agentic-os/segredos-permitidos.txt';

const PADROES = [
  ['chave AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['token GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/],
  ['chave sk-', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['chave privada', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['senha/chave literal', /\b(?:password|passwd|senha|api_?key|secret|token)\b\s*[:=]\s*["'][^"'\s]{6,}["']/i],
];

const mascarar = (s) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-2)}`);

export function lerPermitidos(cwd) {
  const p = path.join(cwd, ARQ_PERMITIDOS);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

export function varrerSegredos(diff, permitidos = []) {
  const achados = [];
  const liberados = [];
  let arquivo = '';
  let linha = 0;
  for (const l of String(diff).split('\n')) {
    if (l.startsWith('+++ ')) {
      arquivo = l.slice(4).replace(/^b\//, '');
      continue;
    }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) {
      linha = Number(h[1]);
      continue;
    }
    if (!l.startsWith('+')) continue;
    const txt = l.slice(1);
    for (const [tipo, re] of PADROES) {
      const m = txt.match(re);
      if (!m) continue;
      const hit = { arquivo, linha, tipo, trecho: mascarar(m[0]) };
      (permitidos.some((p) => txt.includes(p)) ? liberados : achados).push(hit);
      break;
    }
    linha++;
  }
  return { achados, liberados };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/segredos.mjs scripts/tests/supervisor.test.mjs
git commit -m "feat(supervisor): varredura de segredos no diff (B2)"
```

---

### Task 3: Critérios e checagens B1–B4

**Files:**
- Create: `scripts/governanca/supervisor.mjs`
- Test: `scripts/tests/supervisor.test.mjs`

- [ ] **Step 1: Testes**

```js
test('critérios: lê lista do proposal (G1, G2, E*, C*); sem seção → SEM_CRITERIOS', async () => {
  const { lerCriterios, extrairCriterios } = await imp('supervisor.mjs');
  assert.deepEqual(extrairCriterios('# x\n## Critérios de aceite\n- a\n* [ ] b\n\n## Outro\n- c\n'), ['a', 'b']);
  assert.deepEqual(extrairCriterios('## criterios de aceite\n- só\n'), ['só']);
  const { dir } = projetoCartao();
  fs.mkdirSync(path.join(dir, 'automation'));
  fs.writeFileSync(path.join(dir, 'automation/evaluation.json'), JSON.stringify({ gates: { revisao_cartao: ['Logs sem dados pessoais'] } }));
  const r = lerCriterios(dir, 101);
  assert.equal(r.proposal, 'changes/101-carga/proposal.md');
  assert.deepEqual(r.criterios.map((c) => c.id), ['G1', 'G2', 'E1', 'C1', 'C2']);
  assert.equal(r.criterios[3].texto, 'Importa CSV com 3 colunas');
  const sem = projetoCartao({ semProposal: true });
  assert.throws(() => lerCriterios(sem.dir, 101), (e) => e.codigo === 'SEM_CRITERIOS');
  const vazio = projetoCartao({ criterios: [] });
  assert.throws(() => lerCriterios(vazio.dir, 101), (e) => e.codigo === 'SEM_CRITERIOS');
});

test('B1: testes passam, falham, sem comando e tempo esgotado', async () => {
  const { rodarTestes } = await imp('supervisor.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 't-'));
  assert.equal(rodarTestes(dir, 'node -e "process.exit(0)"').status, 'atendido');
  const f = rodarTestes(dir, 'node -e "console.log(\'quebrou\');process.exit(3)"');
  assert.equal(f.status, 'nao_atendido');
  assert.match(f.prova, /saída 3[\s\S]*quebrou/);
  assert.match(rodarTestes(dir, null).prova, /não configurado/);
  const t = rodarTestes(dir, 'node -e "setTimeout(()=>{},5000)"', { limiteMs: 300 });
  assert.equal(t.status, 'nao_atendido');
  assert.match(t.prova, /tempo esgotado/);
});

test('checagens base: B1–B4 atendidos; segredo e branch errada', async () => {
  const { checagensBase } = await imp('supervisor.mjs');
  const p = projetoCartao();
  const r = checagensBase(p.dir, ficha(), 101);
  assert.equal(r.commit, p.head());
  assert.deepEqual(r.resultados.map((c) => [c.id, c.status]), [['B1', 'atendido'], ['B2', 'atendido'], ['B3', 'atendido'], ['B4', 'atendido']]);
  fs.writeFileSync(path.join(p.dir, 'cfg.mjs'), `export const k = '${'gh' + 'p_' + 'b'.repeat(36)}';\n`);
  p.g('add', '.');
  p.g('commit', '-qm', 'cfg');
  const r2 = checagensBase(p.dir, ficha(), 101);
  assert.equal(r2.resultados[1].status, 'nao_atendido');
  assert.match(r2.resultados[1].prova, /cfg\.mjs:1/);
  fs.writeFileSync(path.join(p.dir, 'sujo.txt'), 'x');
  assert.throws(() => checagensBase(p.dir, ficha(), 101), (e) => e.codigo === 'ARVORE_SUJA');
  fs.rmSync(path.join(p.dir, 'sujo.txt'));
  p.g('switch', '-q', 'main');
  assert.throws(() => checagensBase(p.dir, ficha(), 101), (e) => e.codigo === 'BRANCH_ERRADA');
});

test('checagens base: sem TASK → B4 não atendido', async () => {
  const { checagensBase } = await imp('supervisor.mjs');
  const p = projetoCartao();
  p.g('rm', '-q', 'docs/tasks/TASK-101-carga.md');
  p.g('commit', '-qm', 'rm task');
  const b4 = checagensBase(p.dir, ficha(), 101).resultados[3];
  assert.equal(b4.status, 'nao_atendido');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: FAIL (`supervisor.mjs` não existe).

- [ ] **Step 3: Implementar a primeira metade de `scripts/governanca/supervisor.mjs`**

```js
// Supervisor (Parte 2 da governança): critérios, checagens objetivas B1–B4, nota e estado da revisão.
// O script mede B1–B4 e calcula a nota; o subagente `supervisor` só julga G/E/C com prova; exceções = usuário.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ErroGov } from './erros.mjs';
import { arvoreLimpa, branchAtual, git } from './git.mjs';
import { lerPermitidos, varrerSegredos } from './segredos.mjs';

export const DIR_ESTADO = '.agentic-os/supervisor';
export const CICLOS_POR_RODADA = 3;
const LIMITE_TESTES_MS = 10 * 60 * 1000;
const at = (prova) => ({ status: 'atendido', prova });
const nao = (prova) => ({ status: 'nao_atendido', prova });

export function validarId(id) {
  if (!/^\d+$/.test(String(id))) throw new ErroGov('PARAMETRO', 'O ID do cartão é o número da issue.');
  return Number(id);
}

export function acharTask(cwd, id) {
  const d = path.join(cwd, 'docs', 'tasks');
  const f = fs.existsSync(d) ? fs.readdirSync(d).find((n) => n.startsWith(`TASK-${id}-`) && n.endsWith('.md')) : null;
  return f ? `docs/tasks/${f}` : null;
}

export function acharProposal(cwd, id) {
  const d = path.join(cwd, 'changes');
  if (!fs.existsSync(d)) return null;
  const n = fs.readdirSync(d).find((x) => x.startsWith(`${id}-`) && fs.existsSync(path.join(d, x, 'proposal.md')));
  return n ? `changes/${n}/proposal.md` : null;
}

export function extrairCriterios(texto) {
  const m = String(texto).match(/^##\s+crit[eé]rios de aceite\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.match(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/))
    .filter(Boolean)
    .map((x) => x[1]);
}

export function lerCriterios(cwd, id) {
  const proposal = acharProposal(cwd, id);
  const doCartao = proposal ? extrairCriterios(fs.readFileSync(path.join(cwd, proposal), 'utf8')) : [];
  if (!doCartao.length)
    throw new ErroGov('SEM_CRITERIOS', proposal ? `${proposal} não tem itens em "## Critérios de aceite".` : `Não achei changes/${id}-*/proposal.md.`);
  const criterios = [
    { id: 'G1', texto: 'Nenhuma regra de automation/guardrails.md violada no diff' },
    { id: 'G2', texto: 'Documentação afetada atualizada (README, docs, context do que mudou)' },
  ];
  const ev = path.join(cwd, 'automation', 'evaluation.json');
  if (fs.existsSync(ev)) {
    let gates;
    try {
      gates = JSON.parse(fs.readFileSync(ev, 'utf8'))?.gates?.revisao_cartao;
    } catch (e) {
      throw new ErroGov('PARAMETRO', `automation/evaluation.json inválido: ${e.message}`);
    }
    if (Array.isArray(gates))
      gates.filter((g) => typeof g === 'string' && g.trim()).forEach((g, i) => criterios.push({ id: `E${i + 1}`, texto: g.trim() }));
  }
  doCartao.forEach((t, i) => criterios.push({ id: `C${i + 1}`, texto: t }));
  return { proposal, criterios };
}

export function rodarTestes(cwd, comando, { limiteMs = LIMITE_TESTES_MS } = {}) {
  if (!comando) return nao('comando de testes não configurado (comando_testes na ficha)');
  const r = spawnSync(comando, { cwd, shell: true, encoding: 'utf8', timeout: limiteMs, maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === 'ETIMEDOUT' || (r.status === null && r.signal))
    return nao(`tempo esgotado (${Math.round(limiteMs / 1000)} s): ${comando}`);
  const saida = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-40).join('\n');
  const prova = `${comando} → saída ${r.status}${saida ? `\n${saida}` : ''}`;
  return r.status === 0 ? at(prova) : nao(prova);
}

export function baseComum(cwd, principal) {
  for (const ref of [`origin/${principal}`, principal]) {
    const r = git(cwd, ['merge-base', ref, 'HEAD'], { permitirFalha: true });
    if (r.code === 0 && r.out) return { ref, base: r.out };
  }
  throw new ErroGov('GIT_FALHOU', `Sem base comum com ${principal}.`);
}

export function checagensBase(cwd, ficha, id, { limiteMs } = {}) {
  const branch = branchAtual(cwd);
  if (!Object.values(ficha.prefixos_branch).some((p) => branch.startsWith(`${p}${id}-`)))
    throw new ErroGov('BRANCH_ERRADA', `A branch atual "${branch}" não é do cartão #${id}.`);
  if (!arvoreLimpa(cwd)) throw new ErroGov('ARVORE_SUJA');
  const commit = git(cwd, ['rev-parse', 'HEAD']).out;
  const { ref, base } = baseComum(cwd, ficha.branch_principal);
  const curto = (s) => s.slice(0, 7);
  const b1 = rodarTestes(cwd, ficha.comando_testes, { limiteMs });
  const diff = git(cwd, ['diff', '--unified=0', '--no-color', `${base}..HEAD`]).out;
  const { achados, liberados } = varrerSegredos(diff, lerPermitidos(cwd));
  const b2 = achados.length
    ? nao(achados.map((a) => `${a.arquivo}:${a.linha} — ${a.tipo}: ${a.trecho}`).join('\n'))
    : at(`0 achados no diff ${curto(base)}..${curto(commit)}${liberados.length ? `; ${liberados.length} liberado(s) pelo usuário` : ''}`);
  const frente = Number(git(cwd, ['rev-list', '--count', `${base}..HEAD`]).out);
  const b3 = frente > 0 ? at(`branch ${branch}; ${frente} commit(s) à frente de ${ref} (base ${curto(base)})`) : nao(`nenhum commit na branch ${branch} à frente de ${ref}`);
  const task = acharTask(cwd, id);
  const b4 = task ? at(task) : nao(`docs/tasks/TASK-${id}-*.md não encontrado`);
  const resultados = [
    { id: 'B1', texto: 'Testes do projeto passam', ...b1 },
    { id: 'B2', texto: 'Nenhum segredo no diff da branch', ...b2 },
    { id: 'B3', texto: 'Trabalho na branch do cartão; principal intocada', ...b3 },
    { id: 'B4', texto: 'TASK do cartão existe', ...b4 },
  ];
  return { commit, base, intervalo: `${base}..${commit}`, branch, liberados, resultados };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/supervisor.mjs scripts/tests/supervisor.test.mjs
git commit -m "feat(supervisor): criterios do cartao e checagens B1-B4"
```

---

### Task 4: Nota, estado, review-check / review-record / review-decide

**Files:**
- Modify: `scripts/governanca/supervisor.mjs` (acrescentar)
- Test: `scripts/tests/supervisor.test.mjs`

- [ ] **Step 1: Testes**

```js
// Parecer de teste: todos os critérios pendentes com o status dado (ou por id).
function parecer(chk, status = 'atendido', porId = {}) {
  return {
    commit: chk.commit,
    criterios: chk.criterios.map((c) => ({ id: c.id, status: porId[c.id] || status, prova: `prova de ${c.id}` })),
    resumo: 'teste',
  };
}
function gravarParecer(dir, obj) {
  const arq = path.join(dir, '.agentic-os', 'supervisor', '101-parecer.json');
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return arq;
}

test('nota: proporção arredondada para baixo; consolidar trata sem prova/ausente/status inválido', async () => {
  const { calcularNota, consolidar } = await imp('supervisor.mjs');
  const c = (n, s) => Array.from({ length: n }, () => ({ status: s }));
  assert.equal(calcularNota([...c(10, 'atendido')]), 10);
  assert.equal(calcularNota([...c(9, 'atendido'), ...c(1, 'nao_atendido')]), 9);
  assert.equal(calcularNota([...c(2, 'atendido'), ...c(1, 'nao_atendido')]), 6);
  const pend = {
    commit: 'abcdef1234567',
    resultados: [{ id: 'B1', texto: 't', status: 'atendido', prova: 'ok' }],
    criterios: [{ id: 'C1', texto: 'a' }, { id: 'C2', texto: 'b' }, { id: 'C3', texto: 'c' }],
  };
  const r = consolidar(pend, {
    commit: 'abcdef1',
    criterios: [
      { id: 'C1', status: 'atendido', prova: '   ' },
      { id: 'C2', status: 'talvez', prova: 'x' },
      { id: 'B1', status: 'nao_atendido', prova: 'tentou sobrescrever' },
    ],
  });
  assert.deepEqual(r.map((x) => [x.id, x.status]), [['B1', 'atendido'], ['C1', 'nao_atendido'], ['C2', 'nao_atendido'], ['C3', 'nao_atendido']]);
  assert.match(r[3].prova, /ausente/);
  assert.throws(() => consolidar(pend, { commit: 'fff0000', criterios: [] }), (e) => e.codigo === 'PARECER_INVALIDO');
  assert.throws(() => consolidar(pend, { commit: 'abc', criterios: [] }), (e) => e.codigo === 'PARECER_INVALIDO');
  assert.throws(() => consolidar(pend, null), (e) => e.codigo === 'PARECER_INVALIDO');
});

test('review: check → record nota 10 → pronto_para_pr e comentário no cartão', async () => {
  const { reviewCheck, reviewRecord, lerEstado } = await imp('supervisor.mjs');
  const p = projetoCartao();
  const c = cenario([ok('^issue comment', '')]);
  const chk = reviewCheck(p.dir, ficha(), 101);
  assert.equal(chk.ciclo, 1);
  assert.equal(chk.rodada, 1);
  assert.equal(chk.parecer_em, '.agentic-os/supervisor/101-parecer.json');
  const r = reviewRecord(p.dir, ficha(), 101, gravarParecer(p.dir, parecer(chk)));
  assert.equal(r.nota, 10);
  assert.equal(r.proximo, 'pronto_para_pr');
  const e = lerEstado(p.dir, 101);
  assert.deepEqual(e.valida, { commit: p.head(), nota: 10, tipo: 'nota_10', rodada: 1, ciclo: 1 });
  const com = c.chamadas().find((x) => x.args[0] === 'issue');
  assert.match(com.args[com.args.indexOf('--body') + 1], /Supervisor — rodada 1, ciclo 1: nota 10\/10/);
  assert.equal(p.g('status', '--porcelain'), '');
});

test('review: 3 notas < 10 → decisao_usuario; check recusa; nova-rodada e seguir', async () => {
  const { reviewCheck, reviewRecord, reviewDecide, lerEstado } = await imp('supervisor.mjs');
  const p = projetoCartao();
  cenario([ok('^issue comment', '')]);
  const ruim = () => {
    const chk = reviewCheck(p.dir, ficha(), 101);
    return reviewRecord(p.dir, ficha(), 101, gravarParecer(p.dir, parecer(chk, 'atendido', { C2: 'nao_atendido' })));
  };
  assert.equal(ruim().proximo, 'corrigir');
  assert.equal(ruim().proximo, 'corrigir');
  const r3 = ruim();
  assert.equal(r3.proximo, 'decisao_usuario');
  assert.equal(r3.nota, 8);
  assert.deepEqual(r3.pendentes.map((x) => x.id), ['C2']);
  assert.throws(() => reviewCheck(p.dir, ficha(), 101), (e) => e.codigo === 'AGUARDA_DECISAO');
  assert.throws(() => reviewDecide(p.dir, ficha(), 101, { seguir: true }), (e) => e.codigo === 'PARAMETRO');
  assert.throws(() => reviewDecide(p.dir, ficha(), 101, { seguir: true, novaRodada: true, motivo: 'x' }), (e) => e.codigo === 'PARAMETRO');
  const nr = reviewDecide(p.dir, ficha(), 101, { novaRodada: true, motivo: 'ajustei o critério C2' });
  assert.equal(nr.rodada, 2);
  assert.equal(lerEstado(p.dir, 101).ciclo, 0);
  ruim();
  ruim();
  ruim();
  const s = reviewDecide(p.dir, ficha(), 101, { seguir: true, motivo: 'C2 fica para o cartão 102' });
  assert.equal(s.situacao, 'liberado_pelo_usuario');
  const e = lerEstado(p.dir, 101);
  assert.equal(e.valida.tipo, 'liberado_pelo_usuario');
  assert.equal(e.valida.nota, 8);
  assert.equal(e.valida.motivo, 'C2 fica para o cartão 102');
  assert.deepEqual(e.decisoes.map((d) => d.tipo), ['nova_rodada', 'seguir']);
});

test('review: record recusa parecer de outro commit, JSON ilegível e sem check', async () => {
  const { reviewCheck, reviewRecord } = await imp('supervisor.mjs');
  const p = projetoCartao();
  cenario([ok('^issue comment', '')]);
  assert.throws(() => reviewRecord(p.dir, ficha(), 101, gravarParecer(p.dir, '{}')), (e) => e.codigo === 'PARECER_INVALIDO');
  const chk = reviewCheck(p.dir, ficha(), 101);
  assert.throws(() => reviewRecord(p.dir, ficha(), 101, gravarParecer(p.dir, 'não é json')), (e) => e.codigo === 'PARECER_INVALIDO');
  fs.writeFileSync(path.join(p.dir, 'novo.mjs'), 'x\n');
  p.g('add', '.');
  p.g('commit', '-qm', 'novo');
  assert.throws(() => reviewRecord(p.dir, ficha(), 101, gravarParecer(p.dir, parecer(chk))), (e) => e.codigo === 'PARECER_INVALIDO');
});

test('exigirRevisao: sem revisão, commit novo vence; só TASK mudou continua válida', async () => {
  const { reviewCheck, reviewRecord, exigirRevisao } = await imp('supervisor.mjs');
  const p = projetoCartao();
  cenario([ok('^issue comment', '')]);
  assert.throws(() => exigirRevisao(p.dir, 101), (e) => e.codigo === 'SEM_REVISAO');
  const chk = reviewCheck(p.dir, ficha(), 101);
  reviewRecord(p.dir, ficha(), 101, gravarParecer(p.dir, parecer(chk)));
  fs.appendFileSync(path.join(p.dir, 'docs/tasks/TASK-101-carga.md'), '- nota\n');
  p.g('commit', '-qam', 'task');
  assert.equal(exigirRevisao(p.dir, 101).valida.nota, 10);
  fs.writeFileSync(path.join(p.dir, 'carga.mjs'), 'export const x = 2;\n');
  p.g('commit', '-qam', 'muda');
  assert.throws(() => exigirRevisao(p.dir, 101), (e) => e.codigo === 'REVISAO_VENCIDA' && /carga\.mjs/.test(e.message));
});

test('secaoSupervisor: tabela; liberação mostra aviso com motivo', async () => {
  const { secaoSupervisor } = await imp('supervisor.mjs');
  const crit = [{ id: 'C1', texto: 'a | b', status: 'atendido', prova: 'x.mjs:1\nmais' }, { id: 'C2', texto: 'c', status: 'nao_atendido', prova: 'falta' }];
  const base = { historico: [{ rodada: 1, ciclo: 3, commit: 'abcdef1234', nota: 5, em: '2026-11-04T10:00:00Z', criterios: crit }], decisoes: [] };
  const s10 = secaoSupervisor({ ...base, valida: { commit: 'abcdef1234', nota: 5, tipo: 'nota_10', rodada: 1, ciclo: 3 } });
  assert.match(s10, /^## Supervisor/m);
  assert.match(s10, /\| C1 \| a \\\| b \| ✅ \| x\.mjs:1 \|/);
  assert.doesNotMatch(s10, /⚠️/);
  const lib = secaoSupervisor({ ...base, valida: { commit: 'abcdef1234', nota: 5, tipo: 'liberado_pelo_usuario', motivo: 'prazo', em: '2026-11-04T11:00:00Z', rodada: 1, ciclo: 3 } });
  assert.match(lib, /⚠️ \*\*Nota 5\/10 — liberada pelo usuário em 2026-11-04T11:00:00Z\.\*\* Motivo: prazo/);
  assert.match(lib, /Não atendidos: C2/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: FAIL (`calcularNota` não exportado).

- [ ] **Step 3: Acrescentar ao fim de `scripts/governanca/supervisor.mjs`**

Acrescentar no topo do arquivo, junto dos outros imports: `import { gh } from './gh.mjs';`

```js
const STATUS = ['atendido', 'nao_atendido'];
const agora = () => new Date().toISOString();
const arqEstado = (cwd, id) => path.join(cwd, DIR_ESTADO, `${id}.json`);

export function lerEstado(cwd, id) {
  const p = arqEstado(cwd, id);
  if (!fs.existsSync(p))
    return { id: Number(id), rodada: 1, ciclo: 0, situacao: 'nova', pendente: null, historico: [], valida: null, decisoes: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    throw new ErroGov('PARAMETRO', `Estado ilegível: ${DIR_ESTADO}/${id}.json`);
  }
}

export function gravarEstado(cwd, e) {
  const p = arqEstado(cwd, e.id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(e, null, 2) + '\n');
}

export function calcularNota(criterios) {
  if (!criterios.length) return 0;
  return Math.floor((10 * criterios.filter((c) => c.status === 'atendido').length) / criterios.length);
}

// Junta os resultados B1–B4 (só do script) com o parecer do Supervisor para os critérios G/E/C pendentes.
export function consolidar(pendente, parecer) {
  if (!parecer || typeof parecer !== 'object' || !Array.isArray(parecer.criterios))
    throw new ErroGov('PARECER_INVALIDO', 'O parecer precisa ser um objeto com "commit" e "criterios".');
  const c = String(parecer.commit || '');
  if (c.length < 7 || !pendente.commit.startsWith(c))
    throw new ErroGov('PARECER_INVALIDO', `Parecer do commit "${c}", revisão pendente do ${pendente.commit.slice(0, 7)}.`);
  const porId = new Map(parecer.criterios.filter((x) => x && typeof x === 'object').map((x) => [x.id, x]));
  const julgados = pendente.criterios.map((k) => {
    const p = porId.get(k.id);
    const prova = typeof p?.prova === 'string' ? p.prova.trim() : '';
    const valido = p && STATUS.includes(p.status) && prova;
    return { id: k.id, texto: k.texto, status: valido ? p.status : 'nao_atendido', prova: valido ? prova : p ? 'sem prova válida no parecer' : 'ausente no parecer' };
  });
  return [...pendente.resultados, ...julgados];
}

function comentar(ficha, id, texto) {
  try {
    gh(['issue', 'comment', String(id), '--repo', ficha.repo, '--body', texto]);
    return null;
  } catch (e) {
    if (!(e instanceof ErroGov)) throw e;
    return `Não consegui comentar no cartão #${id}: ${e.message}`;
  }
}

export function reviewCheck(cwd, ficha, id, { limiteMs } = {}) {
  const n = validarId(id);
  const e = lerEstado(cwd, n);
  if (e.situacao === 'aguardando_decisao') throw new ErroGov('AGUARDA_DECISAO');
  const { proposal, criterios } = lerCriterios(cwd, n);
  const b = checagensBase(cwd, ficha, n, { limiteMs });
  e.pendente = { commit: b.commit, intervalo: b.intervalo, resultados: b.resultados, criterios };
  gravarEstado(cwd, e);
  return {
    ok: true, id: n, rodada: e.rodada, ciclo: e.ciclo + 1, commit: b.commit, intervalo: b.intervalo, branch: b.branch,
    proposal, base: b.resultados, criterios, liberados: b.liberados, parecer_em: `${DIR_ESTADO}/${n}-parecer.json`,
  };
}

export function reviewRecord(cwd, ficha, id, arqParecer) {
  const n = validarId(id);
  const e = lerEstado(cwd, n);
  if (e.situacao === 'aguardando_decisao') throw new ErroGov('AGUARDA_DECISAO');
  if (!e.pendente) throw new ErroGov('PARECER_INVALIDO', 'Não há revisão pendente: rode review-check antes.');
  const head = git(cwd, ['rev-parse', 'HEAD']).out;
  if (head !== e.pendente.commit || !arvoreLimpa(cwd))
    throw new ErroGov('PARECER_INVALIDO', 'O código mudou desde o review-check. Rode review-check de novo.');
  let parecer;
  try {
    parecer = JSON.parse(fs.readFileSync(path.resolve(cwd, String(arqParecer || '')), 'utf8'));
  } catch {
    throw new ErroGov('PARECER_INVALIDO', `Parecer ilegível: ${arqParecer}`);
  }
  const criterios = consolidar(e.pendente, parecer);
  const nota = calcularNota(criterios);
  e.ciclo += 1;
  e.historico.push({ rodada: e.rodada, ciclo: e.ciclo, commit: head, nota, em: agora(), resumo: String(parecer.resumo || ''), criterios });
  if (nota === 10) {
    e.situacao = 'pronto_para_pr';
    e.valida = { commit: head, nota, tipo: 'nota_10', rodada: e.rodada, ciclo: e.ciclo };
  } else {
    e.situacao = e.ciclo >= CICLOS_POR_RODADA ? 'aguardando_decisao' : 'corrigir';
    e.valida = null;
  }
  e.pendente = null;
  gravarEstado(cwd, e);
  const pendentes = criterios.filter((c) => c.status !== 'atendido');
  const linhas = pendentes.map((c) => `- ${c.id} ${c.texto}: ${c.prova.split('\n')[0]}`);
  const aviso = comentar(ficha, n, [`Supervisor — rodada ${e.rodada}, ciclo ${e.ciclo}: nota ${nota}/10 (commit ${head.slice(0, 7)})`, ...linhas].join('\n'));
  const proximo = { pronto_para_pr: 'pronto_para_pr', corrigir: 'corrigir', aguardando_decisao: 'decisao_usuario' }[e.situacao];
  return { ok: true, id: n, nota, rodada: e.rodada, ciclo: e.ciclo, proximo, pendentes, ...(aviso ? { aviso } : {}) };
}

// Só roda com o "sim" explícito do usuário no chat (o procedimento garante; o orquestrador nunca decide).
export function reviewDecide(cwd, ficha, id, { seguir = false, novaRodada = false, motivo = '' } = {}) {
  const n = validarId(id);
  if (Boolean(seguir) === Boolean(novaRodada)) throw new ErroGov('PARAMETRO', 'Use --seguir ou --nova-rodada (um dos dois).');
  if (!String(motivo).trim()) throw new ErroGov('PARAMETRO', '--motivo é obrigatório.');
  const e = lerEstado(cwd, n);
  if (e.situacao !== 'aguardando_decisao')
    throw new ErroGov('PARAMETRO', `Decisão só depois da 3ª nota abaixo de 10 (situação atual: ${e.situacao}).`);
  const ultima = e.historico.at(-1);
  const quando = agora();
  if (seguir) {
    if (git(cwd, ['rev-parse', 'HEAD']).out !== ultima.commit) throw new ErroGov('REVISAO_VENCIDA');
    e.valida = { commit: ultima.commit, nota: ultima.nota, tipo: 'liberado_pelo_usuario', motivo: motivo.trim(), em: quando, rodada: e.rodada, ciclo: e.ciclo };
    e.situacao = 'liberado_pelo_usuario';
  } else {
    e.rodada += 1;
    e.ciclo = 0;
    e.situacao = 'corrigir';
  }
  e.decisoes.push({ tipo: seguir ? 'seguir' : 'nova_rodada', motivo: motivo.trim(), em: quando, commit: ultima.commit, nota: ultima.nota });
  gravarEstado(cwd, e);
  const txt = seguir
    ? `Supervisor — usuário liberou seguir com nota ${ultima.nota}/10 (commit ${ultima.commit.slice(0, 7)}). Motivo: ${motivo.trim()}`
    : `Supervisor — usuário pediu nova análise (rodada ${e.rodada}). Motivo: ${motivo.trim()}`;
  const aviso = comentar(ficha, n, txt);
  return { ok: true, id: n, situacao: e.situacao, rodada: e.rodada, ...(aviso ? { aviso } : {}) };
}

// Trava do card-pr: revisão válida para o commit atual (só o TASK do cartão pode ter mudado depois).
export function exigirRevisao(cwd, id) {
  const e = lerEstado(cwd, id);
  if (!e.valida) throw new ErroGov('SEM_REVISAO');
  const mudou = git(cwd, ['diff', '--name-only', e.valida.commit, 'HEAD']).out.split('\n').filter(Boolean);
  const fora = mudou.filter((f) => !new RegExp(`^docs/tasks/TASK-${id}-[^/]+\\.md$`).test(f));
  if (fora.length) throw new ErroGov('REVISAO_VENCIDA', `Mudou depois da revisão: ${fora.slice(0, 5).join(', ')}. Rode /cartao revisar ${id} de novo.`);
  return e;
}

const cel = (s) => String(s).split('\n')[0].slice(0, 120).replace(/\|/g, '\\|');

export function secaoSupervisor(e) {
  const v = e.valida;
  const h = [...e.historico].reverse().find((x) => x.commit === v.commit) || e.historico.at(-1);
  const nao = h.criterios.filter((c) => c.status !== 'atendido').map((c) => c.id);
  const linhas = [
    '## Supervisor',
    '',
    `| Commit revisado | Rodada / ciclo | Nota |`,
    '|---|---|---|',
    `| ${v.commit.slice(0, 7)} | ${v.rodada} / ${v.ciclo} | ${v.nota}/10 |`,
    '',
  ];
  if (v.tipo === 'liberado_pelo_usuario')
    linhas.push(`> ⚠️ **Nota ${v.nota}/10 — liberada pelo usuário em ${v.em}.** Motivo: ${v.motivo}`, `> Não atendidos: ${nao.join(', ')}`, '');
  const rodadas = e.decisoes.filter((d) => d.tipo === 'nova_rodada');
  if (rodadas.length) linhas.push(`Novas análises pedidas pelo usuário: ${rodadas.map((d) => `${d.em} (${cel(d.motivo)})`).join('; ')}`, '');
  linhas.push('| Critério | Descrição | Status | Prova |', '|---|---|---|---|');
  for (const c of h.criterios) linhas.push(`| ${c.id} | ${cel(c.texto)} | ${c.status === 'atendido' ? '✅' : '❌'} | ${cel(c.prova)} |`);
  return linhas.join('\n') + '\n';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/governanca/supervisor.mjs scripts/tests/supervisor.test.mjs
git commit -m "feat(supervisor): nota, estado, review-check/record/decide e trava do PR"
```

---

### Task 5: `card-pr` exige revisão; PR e TASK com seção Supervisor

**Files:**
- Modify: `scripts/governanca/cartao.mjs`
- Modify: `scripts/tests/governanca.test.mjs` (testes de card-pr existentes)
- Test: `scripts/tests/supervisor.test.mjs`

- [ ] **Step 1: Teste novo em `supervisor.test.mjs`**

```js
test('card-pr: recusa sem revisão; com liberação o corpo do PR e o TASK trazem ⚠️', async () => {
  const { reviewCheck, reviewRecord, reviewDecide } = await imp('supervisor.mjs');
  const { cardPr } = await imp('cartao.mjs');
  const p = projetoCartao();
  const ITEM = ok('^project item-list 3', { items: [{ id: 'ITEM_101', status: 'Em andamento', content: { type: 'Issue', number: 101, title: 'Carga', repository: 'dono/app' } }] });
  cenario([ITEM, ok('^pr list', [])]);
  assert.throws(() => cardPr(p.dir, ficha(), 101), (e) => e.codigo === 'SEM_REVISAO');
  cenario([ok('^issue comment', '')]);
  for (let i = 0; i < 3; i++) {
    const chk = reviewCheck(p.dir, ficha(), 101);
    reviewRecord(p.dir, ficha(), 101, gravarParecer(p.dir, parecer(chk, 'atendido', { C1: 'nao_atendido' })));
  }
  reviewDecide(p.dir, ficha(), 101, { seguir: true, motivo: 'prazo do cliente' });
  const c = cenario([ITEM, ok('^pr list', []), ok('^pr create', 'https://github.com/dono/app/pull/9\n'), ok('^issue comment', '')]);
  assert.equal(cardPr(p.dir, ficha(), 101).pr, 'https://github.com/dono/app/pull/9');
  const criar = c.chamadas().find((x) => x.args[1] === 'create').args;
  const corpo = criar[criar.indexOf('--body') + 1];
  assert.match(corpo, /## Supervisor[\s\S]*⚠️ \*\*Nota 8\/10[\s\S]*Motivo: prazo do cliente/);
  const task = fs.readFileSync(path.join(p.dir, 'docs/tasks/TASK-101-carga.md'), 'utf8');
  assert.match(task, /## Supervisor[\s\S]*⚠️[\s\S]*## Histórico/);
  assert.equal(p.g('status', '--porcelain'), '');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: FAIL (cardPr não exige revisão).

- [ ] **Step 3: Implementar em `scripts/governanca/cartao.mjs`**

Import novo no topo: `import { exigirRevisao, secaoSupervisor } from './supervisor.mjs';`

Substituir `corpoPr` por:

```js
export function corpoPr({ id, titulo, ficha, task, supervisor }) {
  return [
    `Cartão #${id} — ${titulo}`,
    `Project: ${ficha.project.url}`,
    task ? `TASK: \`${task}\`` : null,
    '',
    `Este PR só entra na \`${ficha.branch_principal}\` com a aprovação do analista (revisão obrigatória). Commit novo depois da aprovação descarta a aprovação.`,
    supervisor ? `\n${supervisor}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

// Insere ou troca a seção "## Supervisor" do TASK (antes de "## Histórico", se houver).
export function registrarSupervisor(texto, secao) {
  const s = secao.trimEnd() + '\n';
  if (/^## Supervisor$/m.test(texto)) return texto.replace(/^## Supervisor\n[\s\S]*?(?=^## |(?![\s\S]))/m, `${s}\n`);
  if (/^## Histórico$/m.test(texto)) return texto.replace(/^## Histórico$/m, `${s}\n## Histórico`);
  return texto.trimEnd() + `\n\n${s}`;
}
```

Em `cardPr`, logo depois de `if (!arvoreLimpa(cwd)) throw new ErroGov('ARVORE_SUJA');`:

```js
  const supervisor = secaoSupervisor(exigirRevisao(cwd, Number(id)));
```

Na chamada `corpoPr({ id, titulo: c.titulo, ficha, task })` passar `supervisor`: `corpoPr({ id, titulo: c.titulo, ficha, task, supervisor })`.

No bloco `if (task) {...}`, trocar `const depois = registrarPr(antes, url, new Date().toISOString());` por:

```js
    const depois = registrarSupervisor(registrarPr(antes, url, new Date().toISOString()), supervisor);
```

Acrescentar `'exigir revisão do Supervisor (nota 10 ou liberação do usuário)'` como primeiro item de `acoes`.

- [ ] **Step 4: Ajustar os testes de card-pr em `scripts/tests/governanca.test.mjs`**

Acrescentar helper antes do teste `card-pr: push da branch...`:

```js
// Revisão válida do Supervisor para o HEAD atual (os testes de card-pr não testam o Supervisor).
function revisaoValida(dir, g, id = 101) {
  const commit = g('rev-parse', 'HEAD');
  const crit = [{ id: 'C1', texto: 'x', status: 'atendido', prova: 'ok' }];
  const e = { id, rodada: 1, ciclo: 1, situacao: 'pronto_para_pr', pendente: null, decisoes: [],
    historico: [{ rodada: 1, ciclo: 1, commit, nota: 10, em: 'x', criterios: crit }],
    valida: { commit, nota: 10, tipo: 'nota_10', rodada: 1, ciclo: 1 } };
  fs.mkdirSync(path.join(dir, '.agentic-os', 'supervisor'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.agentic-os', 'supervisor', `${id}.json`), JSON.stringify(e));
  const gi = path.join(dir, '.git', 'info', 'exclude');
  fs.appendFileSync(gi, '\n.agentic-os/supervisor/\n');
}
```

Nos testes `card-pr: push da branch...` e `card-pr: PR já aberto não duplica...`, chamar `revisaoValida(dir, g);` logo depois de `cardStart(dir, fichaTesteSync(), 101);`. No teste `card-pr: push da branch...` acrescentar ao fim: `assert.match(corpo, /## Supervisor/);`.

- [ ] **Step 5: Rodar tudo**

Run: `node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add scripts/governanca/cartao.mjs scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs
git commit -m "feat(supervisor): card-pr exige revisao e leva a secao Supervisor ao PR e ao TASK"
```

---

### Task 6: CLI — `review-check`, `review-record`, `review-decide`

**Files:**
- Modify: `scripts/github-setup.mjs`, `scripts/check-governanca.sh`
- Test: `scripts/tests/supervisor.test.mjs`

- [ ] **Step 1: Teste**

```js
const CLI = path.join(REPO, 'scripts', 'github-setup.mjs');
function cli(cwd, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: process.env });
  return { code: r.status, json: r.stdout.trim() ? JSON.parse(r.stdout) : null, stderr: r.stderr };
}

test('CLI: review-check/record/decide de ponta a ponta; flags booleanas', async () => {
  const p = projetoCartao();
  fs.mkdirSync(path.join(p.dir, '.agentic-os'), { recursive: true });
  fs.writeFileSync(path.join(p.dir, '.agentic-os/governanca.json'), JSON.stringify(ficha()));
  p.g('add', '.agentic-os/governanca.json');
  p.g('commit', '-qm', 'ficha');
  cenario([ok('^issue comment', '')]);
  const chk = cli(p.dir, ['review-check', '101']);
  assert.equal(chk.code, 0, chk.stderr);
  assert.equal(chk.json.ciclo, 1);
  const arq = gravarParecer(p.dir, parecer(chk.json));
  const rec = cli(p.dir, ['review-record', '101', '--parecer', arq]);
  assert.equal(rec.json.nota, 10);
  const dec = cli(p.dir, ['review-decide', '101', '--seguir', '--motivo', 'x']);
  assert.equal(dec.code, 2);
  assert.equal(dec.json.erro.codigo, 'PARAMETRO');
  assert.equal(cli(p.dir, ['review-check', '101', '--seguir-errado']).json.erro.codigo, 'PARAMETRO');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/supervisor.test.mjs`
Expected: FAIL (`Subcomando desconhecido: review-check`).

- [ ] **Step 3: Implementar em `scripts/github-setup.mjs`**

Cabeçalho de uso (comentário), acrescentar:

```js
//   node github-setup.mjs review-check <ID>
//   node github-setup.mjs review-record <ID> --parecer <arquivo>
//   node github-setup.mjs review-decide <ID> (--seguir | --nova-rodada) --motivo "texto"   ← só com o "sim" do usuário
```

Import: `import { reviewCheck, reviewDecide, reviewRecord } from './governanca/supervisor.mjs';`

Trocar `const FLAGS = [...]` e o início de `opcoes` por:

```js
const FLAGS = ['dry-run', 'owner', 'project', 'analista', 'ficha', 'tipo', 'desc', 'parecer', 'motivo'];
const BOOLEANAS = { '--dry-run': 'dryRun', '--seguir': 'seguir', '--nova-rodada': 'novaRodada' };

function opcoes(argv) {
  const o = { _: [], analista: [], dryRun: false, seguir: false, novaRodada: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOLEANAS[a]) o[BOOLEANAS[a]] = true;
    else if (a.startsWith('--')) {
```

(o resto do laço continua igual).

No `switch`, antes de `default`:

```js
    case 'review-check':
      return reviewCheck(cwd, lerFicha(cwd, arq), o._[0]);
    case 'review-record':
      return reviewRecord(cwd, lerFicha(cwd, arq), o._[0], o.parecer);
    case 'review-decide':
      return reviewDecide(cwd, lerFicha(cwd, arq), o._[0], { seguir: o.seguir, novaRodada: o.novaRodada, motivo: o.motivo });
```

Na mensagem do `default`, listar: `detect | apply | card-start | card-pr | review-check | review-record | review-decide`.

Em `scripts/check-governanca.sh`, trocar a última linha por:

```bash
node --test scripts/tests/governanca.test.mjs scripts/tests/supervisor.test.mjs
```

- [ ] **Step 4: Rodar tudo**

Run: `bash scripts/check-governanca.sh`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add scripts/github-setup.mjs scripts/check-governanca.sh scripts/tests/supervisor.test.mjs
git commit -m "feat(supervisor): subcomandos review-check, review-record e review-decide"
```

---

### Task 7: Agente, procedimento, guardrails e instalador

**Files:**
- Create: `template/F-governanca/.claude/agents/supervisor.md`
- Modify: `template/F-governanca/automation/procedures/cartao.md`, `template/F-governanca/.claude/commands/cartao.md`, `template/F-governanca/guardrails-bloco.md`, `scripts/install-governanca.mjs`
- Test: `scripts/tests/governanca.test.mjs` (teste do instalador)

- [ ] **Step 1: Teste — no teste `install: cria ficha, script, procedimento...` de `governanca.test.mjs`, acrescentar antes de `const antes = ...`:**

```js
  const ag = ler('.claude/agents/supervisor.md');
  assert.match(ag, /^model: opus$/m);
  assert.match(ag, /^tools: Read, Grep, Glob, Bash$/m);
  assert.doesNotMatch(ag, /^tools:.*\b(Edit|Write)\b/m);
  assert.match(ler('.gitignore'), /^\.agentic-os\/supervisor\/$/m);
  assert.match(ler('automation/procedures/cartao.md'), /## `\/cartao revisar <ID>`/);
  assert.match(ler('automation/guardrails.md'), /11\. Escrever o parecer do Supervisor/);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/tests/governanca.test.mjs`
Expected: FAIL (agente não copiado).

- [ ] **Step 3: Criar `template/F-governanca/.claude/agents/supervisor.md`**

````markdown
---
name: supervisor
description: Supervisor de qualidade da Governança GitHub (camada F). Use só a partir de /cartao revisar <ID>. Julga os critérios G/E/C do cartão com prova e devolve o parecer JSON. Não edita, não corrige, não dá nota.
model: opus
tools: Read, Grep, Glob, Bash
---

# Supervisor

Você é o fiscal independente do cartão. Quem escreveu o código é outro agente; você só verifica.

## Entrada (vem do orquestrador)
O JSON do `review-check`: `id`, `commit`, `intervalo` (`<base>..<commit>`), `base` (B1–B4, já medidos
pelo script — **não reavalie**), `criterios` (G/E/C para você julgar) e `proposal`.

## Como julgar
1. Leia o `proposal` e o diff: `git diff <intervalo>` e `git log --oneline <intervalo>`.
2. Para cada critério de `criterios`, decida `atendido` ou `nao_atendido`.
3. `atendido` **só com prova concreta**: `arquivo:linha` + trecho, ou comando + saída. Dúvida, prova
   fraca ou impossível verificar → `nao_atendido`, dizendo o que falta.
4. G1: compare o diff com `automation/guardrails.md`. G2: o que mudou de comportamento está nos docs?
5. Pode rodar comandos **só de leitura** (git diff/log/show, testes, grep). Nunca edite, crie, apague,
   commite, faça push ou rode `review-*`. Nunca dê nota: o script calcula.

## Saída — só isto, num bloco ```json
```json
{
  "commit": "<commit recebido>",
  "criterios": [ { "id": "C1", "status": "atendido", "prova": "src/carga.mjs:42 — valida CNPJ antes de gravar" } ],
  "resumo": "1 linha"
}
```
Inclua **todos** os ids de `criterios`. Critério faltando conta como não atendido.
````

- [ ] **Step 4: Procedimento `template/F-governanca/automation/procedures/cartao.md`**

No passo 3 de `/cartao <ID>`, depois de "(pasta `changes/<ID>-<desc>/`, com `## Cartão: #<ID>` no `proposal.md`)", acrescentar:
"O `proposal.md` precisa ter `## Critérios de aceite` com itens verificáveis (um por linha, `- ...`): é o que o Supervisor vai conferir."

Inserir nova seção entre `/cartao <ID>` e `/cartao pr <ID>`:

````markdown
## `/cartao revisar <ID>` — Supervisor (nota 0–10)

Custo: cada revisão chama o Opus (fixo, mesmo com o roteador Jev). Até 3 por rodada.

1. `node .agentic-os/bin/github-setup.mjs review-check <ID>` → B1–B4 medidos e a lista de critérios.
   `SEM_CRITERIOS` → complete o `proposal.md` com o usuário. `AGUARDA_DECISAO` → vá ao passo 5.
2. Chame o Supervisor com o JSON inteiro do passo 1:
   - Claude Code: subagente `supervisor` (**não** passe `model`; ele é fixo em Opus, mesmo que o bloco
     ROTEADOR indique outro nível).
   - Outras IAs: assuma o papel lendo `.claude/agents/supervisor.md`, sem editar nada.
3. Salve **só o objeto JSON** da resposta em `parecer_em` (do passo 1). Nunca escreva ou altere o parecer.
4. `node .agentic-os/bin/github-setup.mjs review-record <ID> --parecer <parecer_em>` → `nota`, `proximo`.
5. Conforme `proximo`:
   - `pronto_para_pr` → diga a nota e siga para `/cartao pr <ID>`.
   - `corrigir` → passe ao executor (`/worker`) **só** os `pendentes`; ele corrige e commita; volte ao passo 1.
   - `decisao_usuario` → mostre a nota, cada pendente com a prova e o que foi tentado nos ciclos. Pergunte:
     **"Seguir com nota N"** ou **"Nova análise"** (o usuário pode ajustar critérios ou orientar).
     Só com o "sim" explícito: `review-decide <ID> --seguir --motivo "..."` ou
     `review-decide <ID> --nova-rodada --motivo "..."`. Nunca decida sozinho.

Nunca edite `.agentic-os/supervisor/`. Falso alarme de segredo: só o usuário pode liberar o texto exato em
`.agentic-os/segredos-permitidos.txt`.
````

Em `/cartao pr <ID>`, passo 1, trocar por: "1. Confirme que está na branch do cartão e que `/cartao revisar <ID>` deu nota 10 (ou o usuário liberou) para o commit atual. Sem isso o script recusa (`SEM_REVISAO`/`REVISAO_VENCIDA`)."

- [ ] **Step 5: Comando, guardrails e instalador**

`template/F-governanca/.claude/commands/cartao.md`, linha `description:`:

```
description: Fluxo do cartão do GitHub Project (branch → Supervisor → PR). Uso: /cartao <ID> | /cartao revisar <ID> | /cartao pr <ID>
```

`template/F-governanca/guardrails-bloco.md`, depois do item 10:

```
11. Escrever o parecer do Supervisor no lugar dele, editar `.agentic-os/supervisor/` ou rodar `review-decide` sem o "sim" do usuário.
```

`scripts/install-governanca.mjs`:
- depois de `escrever('.claude/commands/cartao.md', ...)`: `escrever('.claude/agents/supervisor.md', lerSrc('.claude/agents/supervisor.md'));`
- trocar o upsert do `.gitignore` por: `escrever('.gitignore', upsertBloco(ler('.gitignore'), 'governanca', '.agentic-os/wizard-estado.json\n.agentic-os/supervisor/', hash));`
- comentário do topo: acrescentar "agente supervisor" na lista do que é copiado.

- [ ] **Step 6: Rodar tudo**

Run: `bash scripts/check-governanca.sh`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add template/F-governanca scripts/install-governanca.mjs scripts/tests/governanca.test.mjs
git commit -m "feat(supervisor): agente supervisor, /cartao revisar, guardrail 11 e instalador"
```

---

### Task 8: Wizard, skill, docs e versão 1.10.0

**Files:**
- Modify: `skills/agentic-os/wizard.md`, `skills/agentic-os/SKILL.md`, `agentic-os.skill` (rebuild), `docs/GOVERNANCA.md`, `docs/CONFORMANCE-SPEC.md`, `docs/guia-completo.html`, `README.md`, `RELEASE-NOTES.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (só a entrada agentic-os), `.codex-plugin/plugin.json`

- [ ] **Step 1: Wizard (`skills/agentic-os/wizard.md`)**
  - Etapa 2 (Avisos de custo): acrescentar "(c) Governança: o **Supervisor** usa o Opus em cada revisão de cartão (até 3 por rodada), mesmo com o roteador Jev."
  - Etapa 12 (Ambientes): acrescentar ao fim "Depois, **comando de testes**: detecte (`package.json` → `npm test`; `pyproject.toml`/`pytest.ini` → `pytest`; `Makefile` com alvo `test` → `make test`; `pom.xml` → `mvn test`) e confirme; grave em `comando_testes`. Sem testes → avise que o Supervisor não dá 10 sem testes e grave `null`."
  - Etapa 13: na lista da ficha completa, acrescentar `comando_testes`.
  - Etapa 16: próximo passo vira "`/cartao <ID>` → trabalho → `/cartao revisar <ID>` → `/cartao pr <ID>`".

- [ ] **Step 2: `SKILL.md`** — na seção da camada F, acrescentar 1 linha: "`/cartao revisar <ID>`: Supervisor independente (Opus fixo) dá nota 0–10 com prova; PR só com 10 ou liberação do usuário. Ver `docs/GOVERNANCA.md`." Rodar `bash scripts/build-skill.sh` e `bash scripts/check-skill-sync.sh` (Expected: `OK`).

- [ ] **Step 3: `docs/GOVERNANCA.md`** — título de "## O que faz (Partes 0 e 1)" vira "(Partes 0, 1 e 2)"; nova seção "## Supervisor (Parte 2)" antes de "## Requisitos", com: analogia do fiscal; critérios B1–B4 (script) / G1–G2, E*, C* (Supervisor); nota ⌊10 × atendidos ÷ total⌋, sem prova = não atendido; rodada = 3 notas; 3ª < 10 → usuário escolhe seguir (⚠️ no PR) ou nova análise; nota presa ao commit; `segredos-permitidos.txt`; limite honesto (estado local = registro, não cadeado); custo do Opus; divergência do Prompt Mestre. Em "## Comandos do script", acrescentar os 3 subcomandos `review-*`.

- [ ] **Step 4: `docs/CONFORMANCE-SPEC.md`** — na tabela da camada F, depois de F6:

```
| F7 | `.claude/agents/supervisor.md` presente, `model: opus`, sem `Edit`/`Write` nas ferramentas | Frontmatter lido |
| F8 | `.gitignore` com `.agentic-os/supervisor/` e `automation/procedures/cartao.md` com `/cartao revisar` | Ambos presentes |
```

Trocar a menção "F1–F6" por "F1–F8" onde aparecer (`grep -rn "F1–F6" docs README.md skills`).

- [ ] **Step 5: Guia (`docs/guia-completo.html`, seção `#governanca`)** — novo `<h3>Supervisor: nota de 0 a 10</h3>` com parágrafo da analogia do fiscal e lista: quem mede o quê (script / Supervisor / usuário); só 10 passa direto; 3ª nota < 10 → você decide; PR mostra ⚠️ se liberado; custo Opus. Na caixa "Pode custar" da seção, acrescentar o item do Opus por revisão. Mesmo estilo HTML das listas vizinhas.

- [ ] **Step 6: `README.md` e `RELEASE-NOTES.md`** — README: na linha/seção da camada F, citar `/cartao revisar`. RELEASE-NOTES: nova seção no topo:

```markdown
# Agentic OS v1.10.0

- **Supervisor (Parte 2 da governança):** `/cartao revisar <ID>` — subagente `supervisor` independente
  (Opus fixo, sem edição) julga os critérios do cartão com prova; o script mede testes, segredos, branch e
  TASK e calcula a nota ⌊10 × atendidos ÷ total⌋ (sem prova = não atendido). Até 2 correções automáticas;
  na 3ª nota abaixo de 10 o usuário decide: seguir (⚠️ no PR) ou nova análise. Nota presa ao commit:
  `/cartao pr` só abre PR com nota 10 ou liberação gravada. Subcomandos `review-check|record|decide`.
- Wizard: comando de testes na ficha (`comando_testes`) e aviso de custo do Supervisor.
- Conformidade: F7–F8. Guardrail 11.
```

- [ ] **Step 7: Versão** — `"version": "1.10.0"` em `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` e na entrada `agentic-os` de `.claude-plugin/marketplace.json` (a entrada do painel fica `1.2.1`).

- [ ] **Step 8: Gates**

Run:
```bash
bash scripts/check-governanca.sh && node --test scripts/tests/router.test.mjs && bash scripts/check-skill-sync.sh && bash scripts/check-pointers.sh && bash scripts/check-rules-sync.sh && claude plugin validate .
```
Expected: tudo PASS / OK / `✔ Validation passed`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "docs(supervisor): wizard, skill, GOVERNANCA, conformidade F7-F8, guia e versao 1.10.0"
```

---

### Task 9: Teste real (controlador, com autorização do usuário)

Feito pelo controlador, não por subagente. Pedir o "sim" antes de criar recursos no GitHub.

- [ ] Criar repo privado sandbox + Project (como na v1.9.0), rodar `install-governanca.mjs` + `apply`.
- [ ] Criar issue/cartão, `card-start`, `proposal.md` com 2 critérios, um deles propositalmente não cumprido.
- [ ] `/cartao revisar`: subagente `supervisor` **real** → esperar nota < 10 com o critério furado como pendente.
- [ ] Corrigir, revisar → nota 10 → `card-pr` → PR com seção Supervisor; `main` remota intacta.
- [ ] Novo cartão: forçar 3 notas < 10 → pergunta ao usuário → `review-decide --seguir` → PR com ⚠️.
- [ ] Apagar repo e Project sandbox; confirmar que sumiram.
- [ ] Bugs achados → corrigir com teste antes da release.

### Task 10: Release v1.10.0 (só com o "sim" do usuário)

- [ ] Gates com parada no primeiro erro (Task 8, Step 8).
- [ ] Push `feat/supervisor`, PR (corpo com resultados do teste real + linha 🤖), CI verde, squash-merge, tag `v1.10.0`, release com a seção do RELEASE-NOTES.
- [ ] `claude plugin marketplace update agentic-os` + `claude plugin update agentic-os@agentic-os --scope user`; avisar para reiniciar o VS Code.
- [ ] Atualizar memória `governanca-v190.md` (Parte 2 entregue) e o índice.
