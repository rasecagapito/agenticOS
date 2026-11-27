#!/usr/bin/env node
// Motor de Paridade do Agentic OS (#7): compara a versão antiga (oráculo) contra a nova para cada
// linha de `casos.csv`, normalizando ordem e arredondamento, e gera `diff.json` agrupado por tipo.
// "Pronto" = total_diferencas === 0. Zero dependências externas.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseCsv(texto) {
  const linhas = String(texto || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!linhas.length) return { colunas: [], linhas: [] };
  const parseLinha = (l) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"' && l[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        q = !q;
      } else if (ch === ',' && !q) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const colunas = parseLinha(linhas[0]);
  const regs = linhas.slice(1).map((l, idx) => {
    const vals = parseLinha(l);
    const obj = { _linha: idx + 2 };
    colunas.forEach((c, i) => {
      obj[c] = vals[i] ?? '';
    });
    return obj;
  });
  return { colunas, linhas: regs };
}

export function normalizarValor(v, casas = 2) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Number(v.toFixed(casas)) : String(v);
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(Number(t).toFixed(casas));
    return t;
  }
  return v;
}

export function normalizarRegistro(reg, { casas_decimais = 2, colunas_ignoradas = [] } = {}) {
  const ign = new Set(colunas_ignoradas);
  const out = {};
  for (const k of Object.keys(reg).sort()) {
    if (ign.has(k)) continue;
    out[k] = normalizarValor(reg[k], casas_decimais);
  }
  return out;
}

const serializar = (reg) => JSON.stringify(reg);

export function compararConjuntos(antigo, novo, opts = {}) {
  const normA = antigo.map((r) => normalizarRegistro(r, opts));
  const normN = novo.map((r) => normalizarRegistro(r, opts));
  const ordena = opts.ignorar_ordem !== false;
  const listaA = ordena ? [...normA].sort((a, b) => serializar(a).localeCompare(serializar(b))) : normA;
  const listaN = ordena ? [...normN].sort((a, b) => serializar(a).localeCompare(serializar(b))) : normN;

  const diffs = [];
  const max = Math.max(listaA.length, listaN.length);
  if (listaA.length !== listaN.length) {
    diffs.push({ tipo: 'contagem_linhas', antigo: listaA.length, novo: listaN.length });
  }
  const min = Math.min(listaA.length, listaN.length);
  for (let i = 0; i < min; i++) {
    const a = listaA[i];
    const n = listaN[i];
    const cols = new Set([...Object.keys(a), ...Object.keys(n)]);
    for (const c of cols) {
      if (a[c] !== n[c]) {
        const tipo = typeof a[c] === 'number' && typeof n[c] === 'number' ? 'divergencia_numerica' : 'divergencia_campo';
        diffs.push({ tipo, coluna: c, linha_indice: i, antigo: a[c] ?? null, novo: n[c] ?? null });
      }
    }
  }
  if (max > min && listaA.length !== listaN.length) {
    diffs.push({ tipo: 'linhas_excedentes', diferenca: Math.abs(listaA.length - listaN.length) });
  }
  return diffs;
}

function executarComandoCaso(cmd, caso, cwd) {
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    input: JSON.stringify(caso),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`comando "${cmd}" falhou (saída ${r.status}): ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`);
  }
  const parsed = JSON.parse((r.stdout || '[]').trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function executarParidade(dirAlvo, cwd = process.cwd()) {
  const abs = path.resolve(cwd, dirAlvo);
  const cfgPath = path.join(abs, 'config.json');
  const csvPath = path.join(abs, 'casos.csv');
  if (!fs.existsSync(cfgPath) || !fs.existsSync(csvPath)) {
    throw new Error(`Paridade incompleta em ${dirAlvo}: exige config.json e casos.csv.`);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { linhas } = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (!linhas.length) throw new Error(`casos.csv vazio em ${dirAlvo}.`);

  const gruposMap = new Map();
  const registrarGrupo = (tipo, exemplo) => {
    if (!gruposMap.has(tipo)) gruposMap.set(tipo, { tipo, ocorrencias: 0, exemplos: [] });
    const g = gruposMap.get(tipo);
    g.ocorrencias++;
    if (g.exemplos.length < 5) g.exemplos.push(exemplo);
  };

  let casosOk = 0;
  let totalDiferencas = 0;
  for (const caso of linhas) {
    try {
      const ant = executarComandoCaso(cfg.comando_antigo, caso, cwd);
      const nov = executarComandoCaso(cfg.comando_novo, caso, cwd);
      const diffs = compararConjuntos(ant, nov, cfg);
      if (diffs.length === 0) casosOk++;
      else {
        totalDiferencas += diffs.length;
        for (const d of diffs) registrarGrupo(d.tipo, { caso_linha: caso._linha, ...d });
      }
    } catch (e) {
      totalDiferencas++;
      registrarGrupo('erro_execucao', { caso_linha: caso._linha, erro: e.message });
    }
  }

  const resultado = {
    alvo: cfg.alvo || path.basename(abs),
    gerado_em: new Date().toISOString(),
    casos_total: linhas.length,
    casos_ok: casosOk,
    total_diferencas: totalDiferencas,
    grupos: [...gruposMap.values()],
  };
  fs.writeFileSync(path.join(abs, 'diff.json'), JSON.stringify(resultado, null, 2) + '\n', 'utf8');
  return resultado;
}

export function validarDiff(dirAlvo, cwd = process.cwd()) {
  const abs = path.resolve(cwd, dirAlvo);
  const diffPath = path.join(abs, 'diff.json');
  const csvPath = path.join(abs, 'casos.csv');
  if (!fs.existsSync(diffPath)) return { ok: false, motivo: `diff.json não encontrado em ${dirAlvo}` };
  if (!fs.existsSync(csvPath)) return { ok: false, motivo: `casos.csv não encontrado em ${dirAlvo}` };
  const csv = parseCsv(fs.readFileSync(csvPath, 'utf8')).linhas.length;
  const diff = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
  if (diff.casos_total !== csv || diff.casos_ok !== csv || diff.total_diferencas !== 0) {
    const resumo = (diff.grupos || []).map((g) => `${g.tipo}(${g.ocorrencias})`).join(', ');
    return {
      ok: false,
      motivo: `${diff.total_diferencas} diferença(s) aberta(s) em ${diff.casos_total} casos (${resumo || 'incompleto'})`,
      diff,
    };
  }
  return { ok: true, diff };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sub, alvo = 'paridade/default'] = process.argv.slice(2);
  try {
    if (sub === 'run') {
      const r = executarParidade(alvo, process.cwd());
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
      process.exit(r.total_diferencas === 0 ? 0 : 2);
    } else if (sub === 'check') {
      const r = validarDiff(alvo, process.cwd());
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
      process.exit(r.ok ? 0 : 2);
    } else {
      console.error('Uso: paridade.mjs <run|check> <dir-alvo>');
      process.exit(1);
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, erro: e.message }) + '\n');
    process.exit(1);
  }
}
