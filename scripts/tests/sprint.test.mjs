// Testes do controle de Sprints no Project (#8). Rodar: node --test scripts/tests/sprint.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOV = path.join(REPO, 'scripts', 'governanca');
const imp = (m) => import(pathToFileURL(path.join(GOV, m)).href);
const FAKE = path.join(REPO, 'scripts', 'tests', 'fixtures', 'fake-gh.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sprint-'));

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

function ficha() {
  return {
    versao: 1, repo: 'dono/app', branch_principal: 'main',
    project: { owner: 'dono', number: 3, url: 'https://github.com/users/dono/projects/3', id: 'PVT_1', campo_status_id: 'FLD_S' },
    colunas: { backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em andamento', em_validacao: 'Em validação', concluido: 'Concluído' },
    analistas: ['analista'], ambientes: { hom: 'hom', prd: 'prd' },
    prefixos_branch: { feature: 'feature/', fix: 'fix/' },
    sprint: { capacidade_pontos: 30, campos: { funcionalidade: 'Funcionalidade', camada: 'Camada', tamanho: 'Tamanho', iteracao: 'Iteração' } },
  };
}

const CAMPOS = {
  funcionalidade: {
    id: 'F_FUNC', nome: 'Funcionalidade',
    opcoes: [{ id: 'fn1', name: 'Login' }, { id: 'fn0', name: 'A definir' }],
  },
  camada: {
    id: 'F_CAM', nome: 'Camada',
    opcoes: [
      { id: 'c1', name: 'Infra Estrutura' },
      { id: 'c2', name: 'Back-end' },
      { id: 'c3', name: 'Banco de Dados' },
      { id: 'c4', name: 'Front End' },
      { id: 'c5', name: 'Documentação' },
    ],
  },
  tamanho: { id: 'F_TAM', nome: 'Tamanho' },
  iteracao: {
    id: 'F_ITER', nome: 'Iteração',
    opcoes: [
      { id: 'sp1', title: 'Sprint 1', startDate: '2026-11-16', duration: 14 },
      { id: 'sp2', title: 'Sprint 2', startDate: '2026-11-30', duration: 14 },
    ],
  },
};

test('sprint: valida regras (A definir, multi-camada, tamanho 8, ~30 pts, Concluído sem tamanho/iteração)', async () => {
  const { validarPlanoSprint } = await imp('sprint.mjs');

  assert.throws(
    () => validarPlanoSprint([{ id: 1, status: 'Backlog', funcionalidade: 'Login', camadas: ['Back-end', 'Front End'], tamanho: 3, motivo: 'x' }], CAMPOS, ficha()),
    (e) => e.codigo === 'MULTICAMADA_SEM_QUEBRA',
  );
  assert.throws(
    () => validarPlanoSprint([{ id: 2, status: 'Em andamento', funcionalidade: 'Login', camada: 'Back-end', tamanho: 8, motivo: 'x' }], CAMPOS, ficha()),
    (e) => e.codigo === 'TAMANHO_OITO_SEM_QUEBRA',
  );

  assert.throws(
    () => validarPlanoSprint([{ id: 3, status: 'Backlog', funcionalidade: 'Login', camada: 'Back-end', tamanho: 25, motivo: 'x' }], CAMPOS, ficha()),
    (e) => e.codigo === 'PARAMETRO',
  );

  const res = validarPlanoSprint([
    { id: 10, itemId: 'IT10', status: 'Concluído', funcionalidade: 'Login', camada: 'Back-end', tamanho: 5, motivo: 'antigo' },
    { id: 11, itemId: 'IT11', status: 'Em andamento', funcionalidade: 'Nova Tela X', camada: 'Front End', tamanho: 5, motivo: 'tela complexa' },
    { id: 12, itemId: 'IT12', status: 'Backlog', prioridade: 1, funcionalidade: 'Login', camada: 'Back-end', tamanho: 3, motivo: 'ajuste médio' },
  ], { ...CAMPOS }, ficha());

  // Nota: tamanho deve ser 1,2,3,5,8 — vamos validar caso com soma exatamente 30 e transbordo para Sprint 2
  assert.equal(res.itens[0].tamanho, null);
  assert.equal(res.itens[0].iteracao, null);
  assert.equal(res.itens[1].funcionalidade, 'A definir');
  assert.deepEqual(res.funcionalidades_sugeridas, ['Nova Tela X']);
  assert.match(res.tabela_markdown, /\| Cartão \| Funcionalidade \| Camada \| Tamanho \| Sprint \| Motivo do tamanho \|/);
});

test('sprint: encaixe respeita ~30 pontos e empurra excedente para Sprint 2; apply exige confirmação', async () => {
  const { validarPlanoSprint, sprintApply } = await imp('sprint.mjs');
  const plano = [
    { id: 1, itemId: 'IT1', status: 'Em validação', funcionalidade: 'Login', camada: 'Back-end', tamanho: 5, motivo: 'auth' },
    { id: 2, itemId: 'IT2', status: 'Backlog', prioridade: 1, funcionalidade: 'Login', camada: 'Back-end', tamanho: 5, motivo: 'parte 1' },
    { id: 3, itemId: 'IT3', status: 'Backlog', prioridade: 2, funcionalidade: 'Login', camada: 'Back-end', tamanho: 5, motivo: 'parte 2' },
    { id: 4, itemId: 'IT4', status: 'Backlog', prioridade: 3, funcionalidade: 'Login', camada: 'Back-end', tamanho: 5, motivo: 'parte 3' },
    { id: 5, itemId: 'IT5', status: 'Backlog', prioridade: 4, funcionalidade: 'Login', camada: 'Back-end', tamanho: 5, motivo: 'parte 4' },
    { id: 6, itemId: 'IT6', status: 'Backlog', prioridade: 5, funcionalidade: 'Login', camada: 'Back-end', tamanho: 5, motivo: 'parte 5' },
    { id: 7, itemId: 'IT7', status: 'Backlog', prioridade: 6, funcionalidade: 'Login', camada: 'Front End', tamanho: 3, motivo: 'transborda' },
    { id: 8, itemId: 'IT8', status: 'Backlog', prioridade: 7, funcionalidade: 'Login', camada: 'Banco de Dados', tamanho: 8, motivo: 'grande' },
  ];
  const r = validarPlanoSprint(plano, CAMPOS, ficha());
  assert.equal(r.pontos_por_sprint['Sprint 1'], 30);
  assert.equal(r.pontos_por_sprint['Sprint 2'], 3);
  assert.equal(r.itens.find((x) => x.id === 8).iteracao, null);
  assert.equal(r.itens.find((x) => x.id === 8).requer_quebra, true);

  const regrasFields = [
    ok('^project field-list 3', {
      fields: [
        { id: 'F_FUNC', name: 'Funcionalidade' },
        { id: 'F_CAM', name: 'Camada' },
        { id: 'F_TAM', name: 'Tamanho' },
        { id: 'F_ITER', name: 'Iteração' },
      ],
    }),
    ok('id=F_FUNC', { data: { node: { options: CAMPOS.funcionalidade.opcoes } } }),
    ok('id=F_CAM', { data: { node: { options: CAMPOS.camada.opcoes } } }),
    ok('ProjectV2IterationField', { data: { node: { configuration: { iterations: CAMPOS.iteracao.opcoes } } } }),
    ok('^project item-edit', {}),
    ok('^issue view', { body: 'Descrição do cartão' }),
    ok('^issue edit', ''),
  ];
  cenario(regrasFields);
  assert.throws(() => sprintApply(ficha(), [plano[0]]), (e) => e.codigo === 'CONFIRMACAO_SPRINT');
  const c = cenario(regrasFields);
  const ap = sprintApply(ficha(), [plano[0], { id: 9, itemId: 'IT9', status: 'Concluído', funcionalidade: 'Login', camada: 'Documentação' }], { confirmoSprint: true });
  assert.deepEqual(ap.aplicados, [1, 9]);
  assert.ok(c.chamadas().some((x) => x.args.includes('--clear')));
  assert.ok(c.chamadas().some((x) => x.args[0] === 'issue' && x.args[1] === 'edit' && x.args.join(' ').includes('Estimativa: 5 pontos, porque auth')));
});
