// Controle de versões no GitHub (#6): fecha v1.0.0 quando todos os cartões do escopo estão em
// Concluído e sugere/publica novas versões SemVer conforme novas entregas concluídas na principal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { norm } from './colunas.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';
import { arvoreLimpa, branchAtual, git } from './git.mjs';

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(tag) {
  const m = String(tag || '').trim().match(SEMVER_RE);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function ultimaTagVersao(cwd, prefixo = 'v') {
  const out = git(cwd, ['tag', '--list', `${prefixo}*`, '--merged', 'HEAD'], { permitirFalha: true }).out;
  const tags = out
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => parseSemver(t));
  if (!tags.length) return null;
  tags.sort((a, b) => compareSemver(b, a));
  return tags[0];
}

export function sugerirProximaVersao(ultimaTag, commits = [], opts = {}) {
  const prefixo = opts.prefixo || 'v';
  if (opts.versao) {
    const p = parseSemver(opts.versao);
    if (!p) throw new ErroGov('PARAMETRO', `Versão inválida: ${opts.versao}. Use X.Y.Z ou vX.Y.Z.`);
    return `${prefixo}${p.join('.')}`;
  }
  if (!ultimaTag) return `${prefixo}1.0.0`;
  const [maj, min, pat] = parseSemver(ultimaTag);
  if (opts.major) return `${prefixo}${maj + 1}.0.0`;
  if (opts.minor) return `${prefixo}${maj}.${min + 1}.0`;
  if (opts.patch) return `${prefixo}${maj}.${min}.${pat + 1}`;
  const temFeature = commits.some((c) => /\b(feat|feature)\b/i.test(c.subject) || /(#\d+).*\b(feat|feature)\b/i.test(c.subject));
  return temFeature ? `${prefixo}${maj}.${min + 1}.0` : `${prefixo}${maj}.${min}.${pat + 1}`;
}

function verificarPrincipalLimpa(cwd, ficha) {
  const atual = branchAtual(cwd);
  if (atual !== ficha.branch_principal) {
    throw new ErroGov('BRANCH_NAO_PRINCIPAL', `Branch atual é "${atual}"; mude para "${ficha.branch_principal}".`);
  }
  if (!arvoreLimpa(cwd)) throw new ErroGov('ARVORE_SUJA');
  const head = git(cwd, ['rev-parse', 'HEAD']).out;
  const remote = git(cwd, ['rev-parse', `origin/${ficha.branch_principal}`], { permitirFalha: true });
  if (remote.code === 0 && remote.out && remote.out !== head) {
    throw new ErroGov('BRANCH_NAO_PRINCIPAL', `Branch local ${head.slice(0, 7)} difere de origin/${ficha.branch_principal} (${remote.out.slice(0, 7)}). Sincronize antes.`);
  }
  return head;
}

function listarPendentesProject(ficha) {
  const { owner, number } = ficha.project;
  const lista = ghJson(['project', 'item-list', String(number), '--owner', owner, '--format', 'json', '--limit', '1000']);
  const items = lista?.items || [];
  const repo = ficha.repo.toLowerCase();
  const doRepo = items.filter((i) => !i.content?.repository || String(i.content.repository).toLowerCase() === repo);
  const concluido = norm(ficha.colunas.concluido);
  const backlog = norm(ficha.colunas.backlog);
  const ignorarBacklog = ficha.versoes?.ignorar_backlog !== false;

  const pendentes = [];
  const concluidos = [];
  for (const i of doRepo) {
    const st = norm(i.status);
    if (st === concluido) concluidos.push({ number: i.content?.number || null, title: i.content?.title || i.title || '', status: i.status });
    else if (ignorarBacklog && st === backlog) continue;
    else pendentes.push({ number: i.content?.number || null, title: i.content?.title || i.title || '', status: i.status || '(sem coluna)' });
  }
  return { pendentes, concluidos };
}

function commitsDesde(cwd, ultimaTag) {
  const range = ultimaTag ? `${ultimaTag}..HEAD` : 'HEAD';
  const raw = git(cwd, ['log', range, '--format=%H%x09%s'], { permitirFalha: true }).out;
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, ...rest] = l.split('\t');
      return { sha, subject: rest.join('\t') };
    });
}

function gerarNotas(versao, ultimaTag, commits, concluidos) {
  const linhas = [`## ${versao}`, ''];
  if (ultimaTag) linhas.push(`Mudanças desde \`${ultimaTag}\`:`, '');
  if (commits.length) {
    linhas.push('### Entregas integradas');
    for (const c of commits) linhas.push(`- ${c.subject} (\`${c.sha.slice(0, 7)}\`)`);
    linhas.push('');
  }
  if (concluidos.length) {
    linhas.push(`### Cartões concluídos no Project (${concluidos.length})`);
    for (const card of concluidos.slice(0, 30)) {
      linhas.push(`- ${card.number ? `#${card.number} — ` : ''}${card.title}`);
    }
    linhas.push('');
  }
  return linhas.join('\n');
}

export function releaseCheck(cwd, ficha, o = {}) {
  const head = verificarPrincipalLimpa(cwd, ficha);
  const prefixo = ficha.versoes?.prefixo_tag || 'v';
  const ultimaTag = ultimaTagVersao(cwd, prefixo);
  const { pendentes, concluidos } = listarPendentesProject(ficha);
  if (pendentes.length > 0) {
    const lista = pendentes.slice(0, 5).map((p) => `${p.number ? `#${p.number}` : p.title} (${p.status})`).join(', ');
    throw new ErroGov('VERSAO_BLOQUEADA', `Ainda há ${pendentes.length} cartão(ões) fora de "${ficha.colunas.concluido}": ${lista}.`, { pendentes });
  }
  const commits = commitsDesde(cwd, ultimaTag);
  if (ultimaTag && commits.length === 0) {
    throw new ErroGov('SEM_ENTREGAS_NOVAS', `Nenhum commit novo na "${ficha.branch_principal}" desde ${ultimaTag}.`);
  }
  if (!ultimaTag && concluidos.length === 0 && commits.length === 0) {
    throw new ErroGov('SEM_ENTREGAS_NOVAS', 'Não há cartões concluídos nem commits para publicar a primeira versão.');
  }
  const proxima = sugerirProximaVersao(ultimaTag, commits, { ...o, prefixo });
  const notas = gerarNotas(proxima, ultimaTag, commits, concluidos);
  return {
    ok: true,
    pronta: true,
    ultima_tag: ultimaTag,
    proxima_versao: proxima,
    head,
    commits_novos: commits.length,
    cartoes_concluidos: concluidos.length,
    notas,
  };
}

export function releasePublish(cwd, ficha, o = {}) {
  const chk = releaseCheck(cwd, ficha, o);
  const tag = chk.proxima_versao;
  const acoes = [
    `criar tag anotada ${tag} em ${chk.head.slice(0, 7)}`,
    `push da tag ${tag} para origin`,
    `publicar GitHub Release ${tag} em ${ficha.repo}`,
  ];
  if (o.dryRun) return { ok: true, dry_run: true, versao: tag, head: chk.head, notas: chk.notas, acoes };
  if (!o.confirmoRelease) throw new ErroGov('CONFIRMACAO_RELEASE');

  const jaExisteLocal = git(cwd, ['tag', '--list', tag]).out === tag;
  const jaExisteRemota = git(cwd, ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], { permitirFalha: true }).out.includes(tag);
  if (jaExisteLocal && jaExisteRemota) {
    const rel = gh(['release', 'view', tag, '--repo', ficha.repo, '--json', 'url'], { permitirFalha: true });
    if (rel.code === 0) {
      return { ok: true, situacao: 'ja_publicada', versao: tag, url: JSON.parse(rel.stdout).url };
    }
  } else if (jaExisteLocal || jaExisteRemota) {
    const shaTag = jaExisteLocal ? git(cwd, ['rev-list', '-n', '1', tag]).out : '';
    if (shaTag && shaTag !== chk.head) throw new ErroGov('TAG_EXISTE', `Tag ${tag} já aponta para outro commit (${shaTag.slice(0, 7)}).`);
  }

  if (!jaExisteLocal) git(cwd, ['tag', '-a', tag, '-m', `Release ${tag}`]);
  if (!jaExisteRemota) git(cwd, ['push', 'origin', `refs/tags/${tag}`]);

  const arqNotas = path.join(os.tmpdir(), `agentic-os-release-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(arqNotas, chk.notas, 'utf8');
  let url = '';
  try {
    const existeRel = gh(['release', 'view', tag, '--repo', ficha.repo, '--json', 'url'], { permitirFalha: true });
    if (existeRel.code === 0) {
      url = JSON.parse(existeRel.stdout).url;
    } else {
      url = gh(['release', 'create', tag, '--repo', ficha.repo, '--title', tag, '--notes-file', arqNotas]).stdout.trim();
    }
  } finally {
    fs.rmSync(arqNotas, { force: true });
  }
  return { ok: true, situacao: 'publicada', versao: tag, head: chk.head, url, acoes };
}
