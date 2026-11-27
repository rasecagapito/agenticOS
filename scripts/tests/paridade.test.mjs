// Testes do Motor de Paridade (#7). Rodar: node --test scripts/tests/paridade.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { compararConjuntos, executarParidade, parseCsv, validarDiff } = await import(
  pathToFileURL(path.join(REPO, 'scripts', 'paridade.mjs')).href
);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'par-'));

test('paridade: ignora ordem, arredonda para 2 casas e agrupa diferenças por tipo', () => {
  assert.deepEqual(
    compararConjuntos(
      [{ id: 'B', val: 10.124 }, { id: 'A', val: 5.0 }],
      [{ id: 'A', val: 5.001 }, { id: 'B', val: 10.121 }],
      { ignorar_ordem: true, casas_decimais: 2 },
    ),
    [],
  );

  const diffs = compararConjuntos(
    [{ id: 'A', val: 10.0, status: 'OK' }],
    [{ id: 'A', val: 10.5, status: 'CANCELADO' }],
    { casas_decimais: 2 },
  );
  assert.equal(diffs.length, 2);
  assert.deepEqual(diffs.map((d) => d.tipo), ['divergencia_campo', 'divergencia_numerica']);
});

test('paridade: executarParidade gera diff.json e validarDiff aprova só com zero diferenças', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'proj-'));
  const alvo = path.join(dir, 'paridade', 'relatorio');
  fs.mkdirSync(alvo, { recursive: true });
  fs.writeFileSync(path.join(alvo, 'casos.csv'), 'filial,devolucao\n01,nao\n02,sim\n');
  fs.writeFileSync(
    path.join(dir, 'old.mjs'),
    'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const c=JSON.parse(s);console.log(JSON.stringify([{filial:c.filial,total:c.devolucao==="sim"?10.5:20.004}]))})',
  );
  fs.writeFileSync(
    path.join(dir, 'new.mjs'),
    'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const c=JSON.parse(s);console.log(JSON.stringify([{filial:c.filial,total:c.devolucao==="sim"?99:20.001}]))})',
  );
  fs.writeFileSync(
    path.join(alvo, 'config.json'),
    JSON.stringify({
      alvo: 'relatorio',
      ignorar_ordem: true,
      casas_decimais: 2,
      comando_antigo: `"${process.execPath}" old.mjs`,
      comando_novo: `"${process.execPath}" new.mjs`,
    }),
  );

  const r1 = executarParidade('paridade/relatorio', dir);
  assert.equal(r1.casos_total, 2);
  assert.equal(r1.casos_ok, 1);
  assert.equal(r1.total_diferencas, 1);
  assert.equal(r1.grupos[0].tipo, 'divergencia_numerica');
  assert.equal(validarDiff('paridade/relatorio', dir).ok, false);

  fs.writeFileSync(
    path.join(dir, 'new.mjs'),
    'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const c=JSON.parse(s);console.log(JSON.stringify([{filial:c.filial,total:c.devolucao==="sim"?10.5:20.0}]))})',
  );
  const r2 = executarParidade('paridade/relatorio', dir);
  assert.equal(r2.total_diferencas, 0);
  assert.equal(r2.casos_ok, 2);
  assert.equal(validarDiff('paridade/relatorio', dir).ok, true);
});
