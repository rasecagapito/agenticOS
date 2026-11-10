// Assinatura (Parte 3): LÊ a review do analista no PR (só GET) e registra aprovação ou reprovação.
// O agente nunca assina: review da conta do agente não vale. Aprovação não gera commit (descartaria a review).
// Opt-in (aprovacao_pelo_chat): registra a declaração do usuário no chat, marcada como prova fraca.
import fs from 'node:fs';
import path from 'node:path';
import { acharCartao, anexarNaSecao, ghComCorpo, moverCartao, registrarSecao } from './cartao.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';
import { gravarEstadoHom, lerEstadoHom, marcarStatus, ultimoStatus } from './hom.mjs';
import { loginAgente, modoAtivo } from './identidade.mjs';
import { acharTask, validarId } from './supervisor.mjs';

const VALE = ['APPROVED', 'CHANGES_REQUESTED'];
export const TIPO_REVIEW = 'review no GitHub';
export const TIPO_REVIEW_RISCO = 'review no GitHub ⚠️ gh local = analista';
export const TIPO_CHAT = 'chat, sem prova do GitHub';

// Com identidade separada, o gh local logado como analista ainda permitiria ao agente aprovar por ele:
// a assinatura vale, mas registra o risco (decisão do usuário: registrar, não bloquear).
function tipoDaReview(ficha) {
  if (modoAtivo() === 'nenhuma') return TIPO_REVIEW;
  const r = gh(['api', 'user'], { token: '', permitirFalha: true });
  if (r.code !== 0) return TIPO_REVIEW;
  let login = '';
  try {
    login = JSON.parse(r.stdout || 'null')?.login || '';
  } catch {}
  const local = String(login).toLowerCase();
  return (ficha.analistas || []).some((a) => String(a).toLowerCase() === local) ? TIPO_REVIEW_RISCO : TIPO_REVIEW;
}
const ErroPendenteChat = () =>
  new ErroGov('PARAMETRO', 'Há uma aprovação pelo chat interrompida; retome com card-sign <ID> --pelo-chat --resultado aprovado --frase "<mesma frase>".');
const comAviso =(res, tipo) => (tipo === TIPO_REVIEW_RISCO ? { ...res, aviso: 'GH_LOCAL_E_ANALISTA' } : res);

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
const celula = (s) => umaLinha(s).replace(/\|/g, '\\|');
const quemDe = (reg) => (reg.tipo === TIPO_CHAT ? `${reg.analista}, pelo chat (sem prova do GitHub)` : reg.analista);

export function textoAssinatura(reg) {
  return [
    '| Campo | Valor |',
    '|---|---|',
    `| Cartão | #${reg.cartao} |`,
    `| Repositório | ${reg.repo} |`,
    `| PR | ${reg.pr} |`,
    `| Tipo | ${reg.tipo || TIPO_REVIEW} |`,
    `| Analista | ${reg.analista} |`,
    ...(reg.tipo === TIPO_CHAT ? ['| Declarado por | analista da ficha (não autenticado) |', `| Frase | "${celula(reg.texto)}" |`] : []),
    `| Data/hora | ${reg.em} |`,
    `| Commit homologado | ${reg.commit} |`,
    `| Ambiente | ${reg.ambiente} |`,
    `| Resultado | ${reg.resultado} |`,
    `| Evidência | ${reg.evidencia} |`,
    '',
    reg.texto ? `> ${umaLinha(reg.texto)}` : '> (sem comentário na review)',
  ].join('\n');
}

function lerReviews(ficha, e) {
  const paginas = ghJson(['api', '--paginate', '--slurp', `repos/${ficha.repo}/pulls/${e.pr.number}/reviews?per_page=100`]) || [];
  return [paginas].flat(2);
}

function conferirPr(ficha, e, n) {
  const pr = ghJson(['pr', 'view', e.pr.url, '--repo', ficha.repo, '--json', 'state,headRefOid,body']) || {};
  if (pr.state !== 'OPEN') throw new ErroGov('SEM_HOM', 'O PR não está mais aberto (PR fechado); não há o que assinar.');
  if (pr.headRefOid !== e.sha) throw new ErroGov('SEM_HOM', 'O PR tem commit depois do HOM; rode /cartao revisar e /cartao hom de novo.');
  if (ultimoStatus(ficha, e.deploy_id) !== 'success')
    throw new ErroGov('SEM_HOM', `O HOM não está mais com este cartão (outro cartão publicou ou o deploy foi desativado); rode /cartao hom ${n} de novo.`);
}

// Intenção gravada ANTES dos efeitos externos; cada efeito é marcado ao concluir (retry não duplica).
function aplicarAprovacao(cwd, ficha, n, e, base, pendente) {
  const curto = e.sha.slice(0, 7);
  const cartao = acharCartao(ficha, n);
  const pend = pendente || { ...base, efeitos: {} };
  const salvar = () => gravarEstadoHom(cwd, n, { ...e, assinatura: null, assinatura_pendente: pend });
  salvar();
  const feito = (k, fn) => {
    if (pend.efeitos[k]) return;
    fn();
    pend.efeitos[k] = true;
    salvar();
  };
  feito('pr', () => {
    const atual = ghJson(['pr', 'view', e.pr.url, '--repo', ficha.repo, '--json', 'body'])?.body || '';
    ghComCorpo(['pr', 'edit', e.pr.url, '--repo', ficha.repo], registrarSecao(atual, 'Assinatura', `## Assinatura\n\n${textoAssinatura(pend)}`));
  });
  feito('mover', () => moverCartao(ficha, cartao.itemId, 'aprovado'));
  feito('comentario', () =>
    gh(['issue', 'comment', String(n), '--repo', ficha.repo, '--body', `Homologação aprovada por ${quemDe(pend)} em ${pend.em} (commit ${curto}). Evidência: ${pend.evidencia}`]));
  feito('status', () => marcarStatus(ficha, e.deploy_id, 'inactive', { descricao: `Cartão #${n} aprovado` }));
  const { efeitos: _x, ...reg } = pend;
  const { assinatura_pendente: _p, ...limpo } = e;
  gravarEstadoHom(cwd, n, { ...limpo, assinatura: reg });
  return { ok: true, situacao: 'aprovado', assinatura: reg };
}

function aplicarReprovacao(cwd, ficha, n, e, reg, reprovacoes) {
  const curto = e.sha.slice(0, 7);
  const cartao = acharCartao(ficha, n);
  const salvar = () => gravarEstadoHom(cwd, n, { ...e, assinatura: null, reprovacoes });
  salvar();
  const feito = (k, fn) => {
    if (reg.efeitos[k]) return;
    fn();
    reg.efeitos[k] = true;
    salvar();
  };
  const task = acharTask(cwd, n);
  feito('task', () => {
    if (!task) return;
    const abs = path.join(cwd, task);
    const atual = fs.readFileSync(abs, 'utf8');
    if (atual.includes(reg.evidencia)) return;
    fs.writeFileSync(abs, anexarNaSecao(atual, 'Homologação',
      `- ${reg.em} — REPROVADO por ${quemDe(reg)} (commit ${curto}). Motivo: ${umaLinha(reg.texto) || '(sem texto)'}. Evidência: ${reg.evidencia}`));
  });
  feito('mover', () => moverCartao(ficha, cartao.itemId, 'em_andamento'));
  feito('comentario', () =>
    gh(['issue', 'comment', String(n), '--repo', ficha.repo, '--body', `Homologação reprovada por ${quemDe(reg)} em ${reg.em} (commit ${curto}). Motivo: ${umaLinha(reg.texto)}. Evidência: ${reg.evidencia}`]));
  feito('status', () => marcarStatus(ficha, e.deploy_id, 'inactive', { descricao: `Cartão #${n} reprovado` }));
  reg.concluido = true;
  salvar();
  return { ok: true, situacao: 'reprovado', pontos: reg.texto, ...(task ? { task_atualizado: task, aviso: 'TASK atualizado no disco: commite junto com a correção.' } : {}) };
}

function assinarPeloChat(cwd, ficha, n, e, o) {
  if (ficha.aprovacao_pelo_chat !== true) throw new ErroGov('CHAT_DESLIGADO');
  if (!['aprovado', 'reprovado'].includes(o.resultado)) throw new ErroGov('PARAMETRO', '--pelo-chat exige --resultado aprovado|reprovado.');
  const frase = umaLinha(o.frase);
  if (!frase) throw new ErroGov('PARAMETRO', '--pelo-chat exige --frase com o texto literal do usuário.');
  if (e.assinatura && e.assinatura.commit === e.sha) return { ok: true, situacao: 'aprovado', ja_registrado: true, assinatura: e.assinatura };
  if (o.resultado === 'reprovado' && e.assinatura_pendente?.tipo === TIPO_CHAT) throw ErroPendenteChat();
  const reprovacoes = [...(e.reprovacoes || [])];
  // Retomada: decisão pelo chat interrompida no meio continua de onde parou (não rechecar o HOM, já pode estar inactive).
  const pendente = o.resultado === 'aprovado' && e.assinatura_pendente?.tipo === TIPO_CHAT ? e.assinatura_pendente : null;
  let reg = o.resultado === 'reprovado' ? reprovacoes.find((x) => x.tipo === TIPO_CHAT && x.concluido === false) || null : null;
  if (!pendente && !reg) {
    const d = decidir({ reviews: lerReviews(ficha, e), analistas: ficha.analistas, agente: loginAgente(), sha: e.sha, desde: e.em });
    if (d.situacao === 'aprovado' || d.situacao === 'reprovado') throw new ErroGov('JA_HA_REVIEW');
    conferirPr(ficha, e, n);
  }
  const em = new Date().toISOString();
  const base = {
    cartao: n, repo: ficha.repo, pr: e.pr.url, tipo: TIPO_CHAT, analista: `${ficha.analistas[0]} (declarado)`, em, commit: e.sha,
    ambiente: ficha.ambientes.hom, resultado: o.resultado, evidencia: `declaração no chat em ${em}`, texto: frase,
  };
  if (o.resultado === 'aprovado') return { ...aplicarAprovacao(cwd, ficha, n, e, base, pendente), tipo: TIPO_CHAT };
  if (!reg) {
    reg = { ...base, concluido: false, efeitos: {} };
    reprovacoes.push(reg);
  }
  return { ...aplicarReprovacao(cwd, ficha, n, e, reg, reprovacoes), tipo: TIPO_CHAT };
}

export function cardSign(cwd, ficha, id, o = {}) {
  const n = validarId(id);
  const e = lerEstadoHom(cwd, n);
  if (!e) throw new ErroGov('SEM_HOM');
  if (o.peloChat) return assinarPeloChat(cwd, ficha, n, e, o);
  if (e.assinatura && e.assinatura.commit === e.sha) return { ok: true, situacao: 'aprovado', ja_registrado: true, assinatura: e.assinatura };
  if (e.assinatura_pendente?.tipo === TIPO_CHAT) throw ErroPendenteChat();
  const d = decidir({ reviews: lerReviews(ficha, e), analistas: ficha.analistas, agente: loginAgente(), sha: e.sha, desde: e.em });
  if (d.situacao === 'aguardando') return { ok: true, situacao: 'aguardando_analista', pr: e.pr.url };
  if (d.situacao === 'outro_commit') throw new ErroGov('ASSINATURA_DE_OUTRO_COMMIT');
  const r = d.review;
  const reprovacoes = [...(e.reprovacoes || [])];
  let reg = d.situacao === 'reprovado' ? reprovacoes.find((x) => x.evidencia === r.html_url) : null;
  if (reg && reg.concluido !== false) return { ok: true, situacao: 'reprovado', ja_registrado: true, pontos: (r.body || '').trim() };
  const pendente = d.situacao === 'aprovado' && e.assinatura_pendente?.evidencia === r.html_url ? e.assinatura_pendente : null;
  if (!reg && !pendente) conferirPr(ficha, e, n);
  const tipo = pendente?.tipo || reg?.tipo || tipoDaReview(ficha);
  const base = {
    cartao: n, repo: ficha.repo, pr: e.pr.url, tipo, analista: r.user.login, em: r.submitted_at, commit: e.sha,
    ambiente: ficha.ambientes.hom, resultado: d.situacao, evidencia: r.html_url, texto: (r.body || '').trim(),
  };
  if (d.situacao === 'aprovado') return comAviso(aplicarAprovacao(cwd, ficha, n, e, base, pendente), tipo);
  if (!reg) {
    reg = { ...base, concluido: false, efeitos: {} };
    reprovacoes.push(reg);
  }
  return comAviso(aplicarReprovacao(cwd, ficha, n, e, reg, reprovacoes), tipo);
}
