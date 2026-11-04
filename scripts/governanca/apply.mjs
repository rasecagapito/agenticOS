// Planeja e executa a configuração no GitHub. Travas: nunca merge/aprovação/DELETE; proteção só endurece.
import { colunasFaltantes, mapearIds, opcoesMescladas } from './colunas.mjs';
import { detect, statusDoProject } from './detect.mjs';
import { ERROS, ErroGov } from './erros.mjs';
import { gh } from './gh.mjs';
import { diffProtecao, mesclarProtecao } from './protecao.mjs';

const MUTACAO_COLUNAS =
  'mutation($input:UpdateProjectV2FieldInput!){updateProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{options{id name}}}}}';

const PROIBIDO =
  /\bpr (merge|review|close)\b|\/pulls\/\d+\/(merge|reviews)|mergePullRequest|addPullRequestReview|deleteRef|enqueuePullRequest/i;
const METODOS_OK = new Set(['GET', 'PUT', 'POST']);

function metodos(args) {
  const m = [];
  args.forEach((x, i) => {
    if (x === '-X' || x === '--method') m.push(args[i + 1]);
    else {
      const k = /^(?:-X|--method)=?(.+)$/.exec(x);
      if (k) m.push(k[1]);
    }
  });
  return m;
}

export function verificarTravas(acoes) {
  for (const a of acoes) {
    if (!a.gh) continue;
    const t = a.gh.join(' ');
    if (metodos(a.gh).some((m) => !METODOS_OK.has(String(m).toUpperCase())))
      throw new ErroGov('TRAVA', `Método HTTP proibido: gh ${t}`);
    if (PROIBIDO.test(t + ' ' + (a.input || ''))) throw new ErroGov('TRAVA', `Ação proibida: gh ${t}`);
  }
}

function uniaoRevisores(atuais, novos) {
  const vistos = new Set(atuais.map((r) => `${r.type}:${r.id}`));
  return [...atuais, ...novos.filter((r) => !vistos.has(`${r.type}:${r.id}`))];
}

export function planejar(estado, ficha) {
  const acoes = [];
  const repo = ficha.repo;
  for (const a of estado.analistas) {
    if (a.erro) throw new ErroGov(a.erro, `${a.login}: ${ERROS[a.erro]}`);
    if (!a.colaborador)
      acoes.push({
        tipo: 'convite',
        descricao: `Convidar ${a.login} como colaborador (push) — sem acesso, a aprovação dele não conta`,
        gh: ['api', '-X', 'PUT', `repos/${repo}/collaborators/${a.login}`, '-f', 'permission=push'],
      });
  }
  const st = estado.status_project;
  if (!st) throw new ErroGov('GH_FALHOU', 'O Project não tem o campo Status.');
  const faltam = colunasFaltantes(st.opcoes, ficha.colunas);
  if (faltam.length)
    acoes.push({
      tipo: 'colunas',
      descricao: `Criar colunas: ${faltam.join(', ')}`,
      gh: ['api', 'graphql', '--input', '-'],
      input: JSON.stringify({
        query: MUTACAO_COLUNAS,
        variables: { input: { fieldId: st.campo_status_id, singleSelectOptions: opcoesMescladas(st.opcoes, faltam) } },
      }),
    });
  const ambs = new Map(estado.ambientes.map((e) => [e.nome, e]));
  const { hom, prd } = ficha.ambientes;
  if (!ambs.has(hom))
    acoes.push({ tipo: 'ambiente', descricao: `Criar ambiente ${hom}`, gh: ['api', '-X', 'PUT', `repos/${repo}/environments/${hom}`] });
  const prdAtual = ambs.get(prd);
  const atuais = prdAtual?.revisores || [];
  const revisores = uniaoRevisores(atuais, estado.analistas.map((a) => ({ type: 'User', id: a.id })));
  if (!prdAtual || revisores.length > atuais.length || !prdAtual.prevent_self_review)
    acoes.push({
      tipo: 'ambiente',
      descricao: `Ambiente ${prd} com aprovação obrigatória de: ${ficha.analistas.join(', ')}`,
      gh: ['api', '-X', 'PUT', `repos/${repo}/environments/${prd}`, '--input', '-'],
      input: JSON.stringify({
        reviewers: revisores,
        prevent_self_review: true,
        ...(prdAtual?.wait_timer ? { wait_timer: prdAtual.wait_timer } : {}),
        ...(prdAtual?.branch_policy ? { deployment_branch_policy: prdAtual.branch_policy } : {}),
      }),
    });
  const branch = ficha.branch_principal;
  if (estado.protecao.estado === 'indisponivel_no_plano') {
    if (!ficha.aceitar_protecao_parcial) throw new ErroGov('PLANO_SEM_PROTECAO');
    acoes.push({ tipo: 'protecao', descricao: `Proteção de ${branch} indisponível no plano (aceito: parcial)`, gh: null });
  } else {
    const atual = estado.protecao.estado === 'ativa' ? estado.protecao.regras : null;
    const corpo = mesclarProtecao(atual);
    const mudancas = diffProtecao(atual, corpo);
    if (mudancas.length)
      acoes.push({
        tipo: 'protecao',
        descricao: `Proteger ${branch}: ${mudancas.join('; ')}`,
        mudancas,
        gh: ['api', '-X', 'PUT', `repos/${repo}/branches/${branch}/protection`, '--input', '-'],
        input: JSON.stringify(corpo),
      });
  }
  return acoes;
}

export function executar(acoes, ficha, { dryRun = false } = {}) {
  verificarTravas(acoes);
  const feitas = [];
  const avisos = [];
  let nivel = 'completa';
  const resumo = (a, status, extra = {}) => ({ tipo: a.tipo, descricao: a.descricao, ...(a.mudancas ? { mudancas: a.mudancas } : {}), status, ...extra });
  for (const a of acoes) {
    if (!a.gh) {
      avisos.push(a.descricao);
      nivel = 'parcial';
      feitas.push(resumo(a, 'pulado'));
      continue;
    }
    if (dryRun) {
      feitas.push(resumo(a, 'planejado', { comando: `gh ${a.gh.join(' ')}` }));
      continue;
    }
    try {
      gh(a.gh, { input: a.input });
      feitas.push(resumo(a, 'feito'));
    } catch (e) {
      if (e.codigo === 'PLANO_SEM_PROTECAO' && ficha.aceitar_protecao_parcial) {
        avisos.push(`${a.descricao}: indisponível no plano`);
        nivel = 'parcial';
        feitas.push(resumo(a, 'pulado'));
      } else throw e;
    }
  }
  return { acoes: feitas, avisos, nivel };
}

export function aplicar(cwd, ficha, { dryRun = false } = {}) {
  const estado = detect(cwd, { owner: ficha.project.owner, project: ficha.project.number, analistas: ficha.analistas });
  if (!estado.repo) throw new ErroGov('SEM_REMOTO');
  if (estado.repo.toLowerCase() !== ficha.repo.toLowerCase())
    throw new ErroGov('FICHA_INVALIDA', `A ficha aponta ${ficha.repo}, mas o origin é ${estado.repo}.`);
  const r = executar(planejar(estado, ficha), ficha, { dryRun });
  if (dryRun) return { ok: true, dry_run: true, ...r };
  const st = statusDoProject(ficha.project.owner, ficha.project.number);
  if (!st) throw new ErroGov('GH_FALHOU', 'O Project não tem o campo Status.');
  const nova = {
    ...ficha,
    project: { ...ficha.project, campo_status_id: st.campo_status_id },
    colunas_ids: mapearIds(st.opcoes, ficha.colunas),
    protecao_aplicada: { em: new Date().toISOString(), nivel: r.nivel, motivo: r.avisos.join('; ') },
  };
  return { ok: true, ...r, ficha: nova };
}
