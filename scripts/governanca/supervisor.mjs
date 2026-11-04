// Supervisor (Parte 2 da governança): critérios, checagens objetivas B1–B4, nota e estado da revisão.
// O script mede B1–B4 e calcula a nota; o subagente `supervisor` só julga G/E/C com prova; exceções = usuário.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErroGov } from './erros.mjs';
import { branchAtual, git } from './git.mjs';
import { gh } from './gh.mjs';
import { ARQ_PERMITIDOS, lerPermitidos, varrerSegredos } from './segredos.mjs';

export const DIR_ESTADO = '.agentic-os/supervisor';
export const CICLOS_POR_RODADA = 3;
const LIMITE_TESTES_MS = 10 * 60 * 1000;
const RUNNER = fileURLToPath(new URL('./rodar-comando.mjs', import.meta.url));
const MARCADOR_TEMPO = '__AGENTIC_OS_TEMPO_ESGOTADO__';
// Só arquivos rastreados contam: o que o commit revisado não contém (ex.: coverage/) não trava o fluxo.
const rastreadosLimpos = (cwd) => git(cwd, ['status', '--porcelain', '--untracked-files=no']).out === '';
export const formatarLimite = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`);
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
  const itens = [];
  let dentro = false;
  let cerca = false;
  for (const l of String(texto).normalize('NFC').split(/\r?\n/)) {
    if (/^\s*```/.test(l)) {
      cerca = !cerca;
      continue;
    }
    if (cerca) continue;
    if (/^##\s+crit[eé]rios de aceite\s*$/i.test(l)) {
      dentro = true;
      continue;
    }
    if (!dentro) continue;
    if (/^##\s/.test(l)) break;
    const m = l.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/);
    if (m) itens.push(m[1]);
  }
  return itens;
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
  const r = spawnSync(process.execPath, [RUNNER, comando, String(limiteMs)], {
    cwd, encoding: 'utf8', timeout: limiteMs + 30000, maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) {
    if (r.error.code === 'ETIMEDOUT') return nao(`tempo esgotado (${formatarLimite(limiteMs)}): ${comando}`);
    return nao(`falha ao executar os testes (${r.error.code || 'erro'}): ${r.error.message}`);
  }
  const bruta = `${r.stdout || ''}${r.stderr || ''}`;
  if (bruta.includes(MARCADOR_TEMPO)) return nao(`tempo esgotado (${formatarLimite(limiteMs)}): ${comando}`);
  const saida = bruta.trim().split('\n').slice(-40).join('\n');
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

export function checagensBase(cwd, ficha, id, { limiteMs, proposal } = {}) {
  const branch = branchAtual(cwd);
  if (!Object.values(ficha.prefixos_branch).some((p) => branch.startsWith(`${p}${id}-`)))
    throw new ErroGov('BRANCH_ERRADA', `A branch atual "${branch}" não é do cartão #${id}.`);
  const sujos = git(cwd, ['status', '--porcelain', '--untracked-files=all']).out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.replace(/^\s*\S+\s+/, ''))
    .filter((f) => !f.startsWith(`${DIR_ESTADO}/`) && f !== ARQ_PERMITIDOS);
  if (sujos.length) throw new ErroGov('ARVORE_SUJA', `Alterações fora do commit (ignore artefatos no .gitignore): ${sujos.slice(0, 5).join(', ')}`);
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
  const b4 = task ? at(proposal ? `${task}; ${proposal}` : task) : nao(`docs/tasks/TASK-${id}-*.md não encontrado`);
  const resultados = [
    { id: 'B1', texto: 'Testes do projeto passam', ...b1 },
    { id: 'B2', texto: 'Nenhum segredo no diff da branch', ...b2 },
    { id: 'B3', texto: 'Trabalho na branch do cartão; principal intocada', ...b3 },
    { id: 'B4', texto: 'TASK do cartão existe', ...b4 },
  ];
  return { commit, base, intervalo: `${base}..${commit}`, branch, liberados, resultados };
}

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
  const b = checagensBase(cwd, ficha, n, { limiteMs, proposal });
  e.pendente = { commit: b.commit, intervalo: b.intervalo, resultados: b.resultados, criterios, liberados: b.liberados };
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
  if (head !== e.pendente.commit)
    throw new ErroGov('PARECER_INVALIDO', `O HEAD mudou desde o review-check (era ${e.pendente.commit.slice(0, 7)}, agora ${head.slice(0, 7)}). Rode review-check de novo.`);
  if (!rastreadosLimpos(cwd))
    throw new ErroGov('PARECER_INVALIDO', 'Há mudança rastreada não commitada desde o review-check. Commite ou desfaça e rode review-check de novo.');
  let parecer;
  try {
    parecer = JSON.parse(fs.readFileSync(path.resolve(cwd, String(arqParecer || '')), 'utf8'));
  } catch {
    throw new ErroGov('PARECER_INVALIDO', `Parecer ilegível: ${arqParecer}`);
  }
  const criterios = consolidar(e.pendente, parecer);
  const nota = calcularNota(criterios);
  e.ciclo += 1;
  e.historico.push({ rodada: e.rodada, ciclo: e.ciclo, commit: head, nota, em: agora(), resumo: String(parecer.resumo || ''), liberados: e.pendente.liberados || [], criterios });
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
  if (git(cwd, ['cat-file', '-e', `${e.valida.commit}^{commit}`], { permitirFalha: true }).code !== 0)
    throw new ErroGov('REVISAO_VENCIDA', `O commit revisado não existe mais; revise de novo (/cartao revisar ${id}).`);
  const mudou = git(cwd, ['diff', '--no-renames', '--name-only', e.valida.commit, 'HEAD']).out.split('\n').filter(Boolean);
  const fora = mudou.filter((f) => !new RegExp(`^docs/tasks/TASK-${id}-[^/]+\\.md$`).test(f));
  if (fora.length) throw new ErroGov('REVISAO_VENCIDA', `Mudou depois da revisão: ${fora.slice(0, 5).join(', ')}. Rode /cartao revisar ${id} de novo.`);
  return e;
}

// Mantém o corpo do PR curto: no máximo 10 itens, o resto vira "+K outros".
const limitar = (itens, sep) => itens.slice(0, 10).join(sep) + (itens.length > 10 ? ` +${itens.length - 10} outros` : '');
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
  if (h.liberados?.length)
    linhas.push(`Segredos liberados pelo usuário: ${limitar(h.liberados.map((x) => `${x.arquivo}:${x.linha} (${x.tipo})`), ', ')}`, '');
  const rodadas = e.decisoes.filter((d) => d.tipo === 'nova_rodada');
  if (rodadas.length) linhas.push(`Novas análises pedidas pelo usuário: ${limitar(rodadas.map((d) => `${d.em} (${cel(d.motivo)})`), '; ')}`, '');
  linhas.push('| Critério | Descrição | Status | Prova |', '|---|---|---|---|');
  for (const c of h.criterios) linhas.push(`| ${c.id} | ${cel(c.texto)} | ${c.status === 'atendido' ? '✅' : '❌'} | ${cel(c.prova)} |`);
  return linhas.join('\n') + '\n';
}
