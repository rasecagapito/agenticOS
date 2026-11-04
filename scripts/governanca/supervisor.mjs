// Supervisor (Parte 2 da governança): critérios, checagens objetivas B1–B4, nota e estado da revisão.
// O script mede B1–B4 e calcula a nota; o subagente `supervisor` só julga G/E/C com prova; exceções = usuário.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ErroGov } from './erros.mjs';
import { arvoreLimpa, branchAtual, git } from './git.mjs';
import { gh } from './gh.mjs';
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
