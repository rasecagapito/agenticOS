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
    comando_testes: null,
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
  if (!f?.branch_principal) erros.push('branch_principal ausente');
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
