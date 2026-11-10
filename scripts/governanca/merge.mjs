// Merge (Parte 4a): integra o PR do cartão na branch principal só com assinatura válida do commit atual.
// Reconfere as reviews no GitHub (não confia no corpo do PR); squash com --match-head-commit; nunca push na principal.
import { decidir, lerReviews, textoAssinatura, tipoDaReview, TIPO_CHAT, TIPO_REVIEW_RISCO } from './assinatura.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';
import { loginAgente } from './identidade.mjs';

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
