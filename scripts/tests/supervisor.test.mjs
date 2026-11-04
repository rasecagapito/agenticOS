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
