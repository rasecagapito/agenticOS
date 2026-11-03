// Leitura do estado. Nunca escreve nada (nem local, nem no GitHub).
import { classificar, gh, ghJson } from './gh.mjs';
import { ehRepo, git, remotoOrigin } from './git.mjs';

export function lerProtecao(repo, branch) {
  const s = gh(['api', `repos/${repo}/branches/${branch}/protection`], { permitirFalha: true });
  if (s.code === 0) return { estado: 'ativa', regras: JSON.parse(s.stdout) };
  const e = classificar(s);
  if (e.codigo === 'PLANO_SEM_PROTECAO') return { estado: 'indisponivel_no_plano' };
  if (/not protected|Not Found|404/i.test(`${s.stderr}${s.stdout}`)) return { estado: 'nenhuma' };
  throw e;
}

export function lerAmbientes(repo) {
  const s = gh(['api', `repos/${repo}/environments`], { permitirFalha: true });
  if (s.code !== 0) return [];
  const d = JSON.parse(s.stdout || '{}');
  return (d.environments || []).map((e) => ({
    nome: e.name,
    revisores: (e.protection_rules || [])
      .filter((p) => p.type === 'required_reviewers')
      .flatMap((p) => p.reviewers || [])
      .map((x) => ({ type: x.type, id: x.reviewer?.id })),
  }));
}

export function statusDoProject(owner, number) {
  const f = ghJson(['project', 'field-list', String(number), '--owner', owner, '--format', 'json']);
  const st = (f?.fields || []).find((x) => x.name === 'Status');
  if (!st) return null;
  const q = 'query($id:ID!){node(id:$id){... on ProjectV2SingleSelectField{options{id name color description}}}}';
  const d = ghJson(['api', 'graphql', '-f', `query=${q}`, '-f', `id=${st.id}`]);
  return { campo_status_id: st.id, opcoes: d?.data?.node?.options || [] };
}

export function checarAnalista(repo, login, loginAgente) {
  if (String(login).toLowerCase() === String(loginAgente).toLowerCase()) return { login, erro: 'ANALISTA_IGUAL_AGENTE' };
  const u = gh(['api', `users/${login}`], { permitirFalha: true });
  if (u.code !== 0) return { login, erro: 'ANALISTA_INEXISTENTE' };
  const id = JSON.parse(u.stdout).id;
  const colaborador = repo ? gh(['api', `repos/${repo}/collaborators/${login}`], { permitirFalha: true }).code === 0 : false;
  return { login, id, colaborador };
}

export function detect(cwd, { owner, project, analistas = [] } = {}) {
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
  r.analistas = analistas.map((l) => checarAnalista(r.repo, l, r.login));
  return r;
}
