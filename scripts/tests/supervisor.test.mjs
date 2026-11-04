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
