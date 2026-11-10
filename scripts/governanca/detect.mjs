// Leitura do estado. Nunca escreve nada (nem local, nem no GitHub).
import { classificar, gh, ghJson } from './gh.mjs';
import { ErroGov } from './erros.mjs';
import { ehRepo, git, remotoOrigin } from './git.mjs';
import { ativarIdentidade, desativarIdentidade, identidadeDe } from './identidade.mjs';

export function lerProtecao(repo, branch) {
  const s = gh(['api', `repos/${repo}/branches/${branch}/protection`], { permitirFalha: true });
  if (s.code === 0) return { estado: 'ativa', regras: JSON.parse(s.stdout) };
  const e = classificar(s);
  if (e.codigo === 'PLANO_SEM_PROTECAO') return { estado: 'indisponivel_no_plano' };
  if (/Branch not protected/i.test(s.stderr + s.stdout)) return { estado: 'nenhuma' };
  throw e;
}

export function lerAmbientes(repo) {
  const s = gh(['api', `repos/${repo}/environments?per_page=100`], { permitirFalha: true });
  if (s.code !== 0) {
    if (classificar(s).codigo === 'PLANO_SEM_PROTECAO' || /HTTP 404/.test(s.stderr)) return [];
    throw classificar(s);
  }
  const d = JSON.parse(s.stdout || '{}');
  return (d.environments || []).map((e) => ({
    nome: e.name,
    wait_timer: (e.protection_rules || []).find((p) => p.type === 'wait_timer')?.wait_timer || 0,
    branch_policy: e.deployment_branch_policy || null,
    prevent_self_review: !!(e.protection_rules || []).find((p) => p.type === 'required_reviewers')?.prevent_self_review,
    revisores: (e.protection_rules || [])
      .filter((p) => p.type === 'required_reviewers')
      .flatMap((p) => p.reviewers || [])
      .map((x) => ({ type: x.type, id: x.reviewer?.id })),
  }));
}

export function statusDoProject(owner, number) {
  const f = ghJson(['project', 'field-list', String(number), '--owner', owner, '--format', 'json', '--limit', '100']);
  const st = (f?.fields || []).find((x) => x.name === 'Status');
  if (!st) return null;
  const q = 'query($id:ID!){node(id:$id){... on ProjectV2SingleSelectField{options{id name color description}}}}';
  const d = ghJson(['api', 'graphql', '-f', `query=${q}`, '-f', `id=${st.id}`]);
  return { campo_status_id: st.id, opcoes: d?.data?.node?.options || [] };
}

export function checarAnalista(repo, login, loginAgente, { permitirIgual = false } = {}) {
  const igual = String(login).toLowerCase() === String(loginAgente).toLowerCase();
  if (igual && !permitirIgual) return { login, erro: 'ANALISTA_IGUAL_AGENTE' };
  const u = gh(['api', `users/${login}`], { permitirFalha: true });
  if (u.code !== 0) return { login, erro: 'ANALISTA_INEXISTENTE' };
  const id = JSON.parse(u.stdout).id;
  const colaborador = repo ? gh(['api', `repos/${repo}/collaborators/${login}`], { permitirFalha: true }).code === 0 : false;
  return { login, id, colaborador, ...(igual ? { igual_agente: true } : {}) };
}

// Quem age como agente neste projeto. Falha de identidade vira aviso (o wizard mostra e orienta).
export function lerIdentidade(parcial, r) {
  const ia = identidadeDe(parcial);
  const out = { modo: ia.modo, login_agente: ia.modo === 'nenhuma' ? r.login : null, login_gh_local: r.login, conflito: false, avisos: [] };
  const analistas = (parcial?.analistas || []).map((a) => String(a).toLowerCase());
  if (ia.modo !== 'nenhuma') {
    try {
      out.login_agente = ativarIdentidade({ ...parcial, repo: parcial?.repo || r.repo, identidade_agente: ia }).login;
    } catch (e) {
      if (!(e instanceof ErroGov)) throw e;
      out.avisos.push(e.codigo);
    } finally {
      desativarIdentidade();
    }
    if (analistas.includes(String(r.login).toLowerCase())) out.avisos.push('GH_LOCAL_E_ANALISTA');
  }
  out.conflito = !!out.login_agente && analistas.includes(String(out.login_agente).toLowerCase());
  return out;
}

export function detect(cwd, { owner, project, analistas = [], parcial = null } = {}) {
  const r = { git: ehRepo(cwd), repo: null, avisos: [] };
  r.login = ghJson(['api', 'user']).login;
  if (!r.git) r.avisos.push('NAO_E_GIT');
  else {
    r.repo = remotoOrigin(cwd);
    if (!r.repo) r.avisos.push('SEM_REMOTO');
    r.branch_local = git(cwd, ['branch', '--show-current'], { permitirFalha: true }).out || null;
  }
  if (r.repo) {
    const info = ghJson(['api', `repos/${r.repo}`]);
    r.branch_principal = info.default_branch;
    r.privado = !!info.private;
    r.tipo_dono = info.owner?.type || 'User';
    r.protecao = lerProtecao(r.repo, r.branch_principal);
    r.ambientes = lerAmbientes(r.repo);
  }
  r.owner = owner || r.repo?.split('/')[0] || r.login;
  r.projects = (ghJson(['project', 'list', '--owner', r.owner, '--format', 'json'])?.projects || []).map((p) => ({
    number: p.number,
    title: p.title,
    url: p.url,
    id: p.id,
  }));
  if (project) r.status_project = statusDoProject(r.owner, project);
  r.identidade = lerIdentidade(parcial, r);
  const agente = r.identidade.login_agente || r.login;
  r.analistas = analistas.map((l) => checarAnalista(r.repo, l, agente, { permitirIgual: parcial?.aprovacao_pelo_chat === true }));
  return r;
}
