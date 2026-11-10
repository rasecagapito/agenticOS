// Merge (Parte 4a): integra o PR do cartão na branch principal só com assinatura válida do commit atual.
// Reconfere as reviews no GitHub (não confia no corpo do PR); squash com --match-head-commit; nunca push na principal.
import { decidir, lerReviews, textoAssinatura, tipoDaReview, TIPO_CHAT, TIPO_REVIEW_RISCO } from './assinatura.mjs';
import { acharCartao } from './cartao.mjs';
import { norm } from './colunas.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson, ghMerge } from './gh.mjs';
import { arvoreLimpa, git } from './git.mjs';
import { gravarEstadoHom, lerEstadoHom } from './hom.mjs';
import { loginAgente, modoAtivo } from './identidade.mjs';
import { validarId } from './supervisor.mjs';

export const CAMPOS_PR = 'number,url,title,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,body';
export const AVISO_TIPO = {
  [TIPO_REVIEW_RISCO]: 'O gh desta máquina estava logado como analista: o agente conseguiria agir como ele.',
  [TIPO_CHAT]: 'Assinatura declarada no chat, sem prova do GitHub.',
};

const esperar = (ms) => {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

export const lerPr = (ficha, url, campos = CAMPOS_PR) => ghJson(['pr', 'view', url, '--repo', ficha.repo, '--json', campos]) || {};

export function corpoSquash(reg, n) {
  const aviso = AVISO_TIPO[reg.tipo];
  return ['## Assinatura', '', textoAssinatura(reg), '', ...(aviso ? [`⚠️ ${aviso}`, ''] : []), `Closes #${n}`, ''].join('\n');
}

// Devolve o Tipo efetivo. Sempre relê as reviews: reprovação vence; review aprovando o commit atual vale mais
// que o chat; o chat só vale sem review válida, com a ficha permitindo, a seção no PR e o "sim" novo do usuário.
export function provarAssinatura(ficha, e, a, pr, o = {}) {
  const d = decidir({ reviews: lerReviews(ficha, e), analistas: ficha.analistas, agente: loginAgente(), sha: a.commit, desde: '' });
  if (d.situacao === 'reprovado') throw new ErroGov('ASSINATURA_REPROVADA');
  if (d.situacao === 'aprovado') return tipoDaReview(ficha);
  if (a.tipo !== TIPO_CHAT)
    throw new ErroGov('SEM_ASSINATURA', 'Não há review do analista aprovando o commit atual no PR (foi descartada ou é de outro commit).');
  if (ficha.aprovacao_pelo_chat !== true) throw new ErroGov('CHAT_DESLIGADO');
  const corpo = String(pr.body || '');
  if (!corpo.includes('## Assinatura') || !corpo.includes(TIPO_CHAT))
    throw new ErroGov('SEM_ASSINATURA', 'O corpo do PR não tem a assinatura pelo chat; rode /cartao assinatura de novo.');
  if (!o.confirmoMergeChat) throw new ErroGov('CONFIRMACAO_CHAT');
  return TIPO_CHAT;
}

// Checks obrigatórios: sem nenhum configurado, segue; pendente, falho ou cancelado bloqueia.
export function exigirChecks(ficha, pr) {
  const r = gh(['pr', 'checks', pr.url, '--repo', ficha.repo, '--required', '--json', 'name,bucket'], { permitirFalha: true });
  let lista = [];
  if (r.stdout.trim()) lista = JSON.parse(r.stdout);
  else if (r.code !== 0 && !/no (required )?checks/i.test(r.stderr))
    throw new ErroGov('GH_FALHOU', `gh pr checks → ${r.stderr.trim().slice(0, 300)}`);
  const ruins = lista.filter((c) => c.bucket !== 'pass' && c.bucket !== 'skipping');
  if (ruins.length)
    throw new ErroGov('CHECKS_PENDENTES', `Checks obrigatórios sem sucesso: ${ruins.map((c) => `${c.name} (${c.bucket})`).join(', ')}.`, { checks: ruins });
}

export function exigirIntegravel(ficha, pr, esperaMs = 3000) {
  let m = pr.mergeable;
  if (m === 'UNKNOWN') {
    esperar(esperaMs);
    m = lerPr(ficha, pr.url, 'mergeable').mergeable;
  }
  if (m === 'MERGEABLE') return;
  throw new ErroGov('PR_CONFLITO', m === 'UNKNOWN' ? 'O GitHub ainda está calculando se o PR pode ser integrado; tente de novo em instantes.' : undefined);
}

// Efeitos depois da decisão: intenção gravada antes; cada efeito marcado ao concluir (retry não duplica).
function concluir(cwd, ficha, n, e, pend, situacao) {
  if (!pend.branch || pend.branch === ficha.branch_principal)
    throw new ErroGov('TRAVA', `Apagar a branch principal (${ficha.branch_principal}) é proibido.`);
  const salvar = () => gravarEstadoHom(cwd, n, { ...e, merge_pendente: pend });
  const feito = (k, fn) => {
    if (pend.efeitos[k]) return;
    fn();
    pend.efeitos[k] = true;
    salvar();
  };
  salvar();
  feito('merge', () => {
    try {
      ghMerge({ repo: ficha.repo, url: pend.pr, sha: pend.commit, titulo: pend.titulo, corpo: pend.corpo });
    } catch (err) {
      if (err.codigo !== 'GH_FALHOU') throw err;
      const app = modoAtivo() === 'app' ? ' Com GitHub App: confira a permissão contents: write.' : '';
      throw new ErroGov('MERGE_RECUSADO', `${err.message}${app}`);
    }
  });
  if (!pend.sha) {
    pend.sha = lerPr(ficha, pend.pr, 'mergeCommit').mergeCommit?.oid || '';
    salvar();
  }
  feito('branch', () => gh(['api', '-X', 'DELETE', `repos/${ficha.repo}/git/refs/heads/${pend.branch}`], { permitirFalha: true }));
  feito('comentario', () =>
    gh(['issue', 'comment', String(n), '--repo', ficha.repo, '--body',
      `Integrado na ${ficha.branch_principal} em ${pend.em} (squash ${String(pend.sha).slice(0, 7)}), assinatura: ${pend.tipo}.`]));
  const avisos = pend.tipo === TIPO_REVIEW_RISCO ? ['GH_LOCAL_E_ANALISTA'] : [];
  if (!arvoreLimpa(cwd)) avisos.push('ARVORE_SUJA');
  else {
    const a = git(cwd, ['checkout', ficha.branch_principal], { permitirFalha: true });
    const b = a.code === 0 ? git(cwd, ['pull', '--ff-only', 'origin', ficha.branch_principal], { permitirFalha: true }) : a;
    if (b.code !== 0) avisos.push('GIT_FALHOU');
  }
  const { efeitos: _x, corpo: _c, ...reg } = pend;
  const { merge_pendente: _p, ...limpo } = e;
  gravarEstadoHom(cwd, n, { ...limpo, merge: reg });
  return { ok: true, situacao, pr: pend.pr, sha_squash: pend.sha, tipo: pend.tipo, avisos };
}

export function cardMerge(cwd, ficha, id, o = {}) {
  const n = validarId(id);
  const e = lerEstadoHom(cwd, n);
  if (e?.merge && !e.merge_pendente)
    return { ok: true, situacao: 'ja_integrado', pr: e.merge.pr, sha_squash: e.merge.sha, tipo: e.merge.tipo, avisos: [] };
  if (e?.merge_pendente?.efeitos?.merge) return concluir(cwd, ficha, n, e, e.merge_pendente, 'integrado');
  const cartao = acharCartao(ficha, n);
  if (norm(cartao.status) !== norm(ficha.colunas.aprovado))
    throw new ErroGov('CARTAO_FORA_DE_APROVADO', `Cartão #${n} está em "${cartao.status || '(sem coluna)'}"; o merge exige "${ficha.colunas.aprovado}".`);
  if (e?.assinatura_pendente) throw new ErroGov('PARAMETRO', `Há uma assinatura interrompida; rode /cartao assinatura ${n} de novo antes do merge.`);
  const a = e?.assinatura;
  if (!a || a.resultado !== 'aprovado') throw new ErroGov('SEM_ASSINATURA');
  const pr = lerPr(ficha, e.pr.url);
  const base = { pr: pr.url || e.pr.url, commit: a.commit, branch: pr.headRefName || e.branch, titulo: `${pr.title} (#${pr.number})`, em: new Date().toISOString() };
  if (pr.state === 'MERGED') return concluir(cwd, ficha, n, e, { ...base, tipo: a.tipo, sha: '', efeitos: { merge: true } }, 'ja_integrado');
  if (pr.state !== 'OPEN' || pr.isDraft || pr.baseRefName !== ficha.branch_principal)
    throw new ErroGov('SEM_PR', `O PR ${base.pr} precisa estar aberto, fora de rascunho e apontando para ${ficha.branch_principal}.`);
  if (pr.headRefOid !== a.commit)
    throw new ErroGov('ASSINATURA_DE_OUTRO_COMMIT', 'O PR tem commit depois da assinatura; rode /cartao revisar, pr, hom e assinatura de novo.');
  const tipo = provarAssinatura(ficha, e, a, pr, o);
  exigirChecks(ficha, pr);
  exigirIntegravel(ficha, pr, o.esperaMs ?? 3000);
  return concluir(cwd, ficha, n, e, { ...base, tipo, corpo: corpoSquash({ ...a, tipo }, n), sha: '', efeitos: {} }, 'integrado');
}
