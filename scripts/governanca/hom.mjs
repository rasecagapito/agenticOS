// HOM (Parte 3): publica o commit revisado no ambiente HOM pelos comandos da ficha. Fila: GitHub Deployments.
// Nada é commitado na branch depois do deploy (commit depois da aprovação do analista a descartaria).
import fs from 'node:fs';
import path from 'node:path';
import { acharCartao, anexarNaSecao, ghComCorpo, moverCartao, prAberto } from './cartao.mjs';
import { ErroGov } from './erros.mjs';
import { executar } from './executar.mjs';
import { gh, ghJson } from './gh.mjs';
import { branchAtual, git, pushBranch } from './git.mjs';
import { identidadeDe } from './identidade.mjs';
import { acharTask, arquivosSujos, exigirRevisao, lerCriterios, validarId } from './supervisor.mjs';

export const DIR_HOM = '.agentic-os/hom';
const agora = () => new Date().toISOString();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const arqEstado = (cwd, id) => path.join(cwd, DIR_HOM, `${id}.json`);

export function lerEstadoHom(cwd, id) {
  const p = arqEstado(cwd, id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    throw new ErroGov('PARAMETRO', `Estado ilegível: ${DIR_HOM}/${id}.json`);
  }
}

export function gravarEstadoHom(cwd, id, e) {
  const p = arqEstado(cwd, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(e, null, 2) + '\n');
}

const payloadDe = (d) => {
  if (typeof d?.payload === 'string') {
    try {
      return JSON.parse(d.payload);
    } catch {
      return {};
    }
  }
  return d?.payload || {};
};

export function listarDeploys(ficha) {
  return ghJson(['api', `repos/${ficha.repo}/deployments?environment=${encodeURIComponent(ficha.ambientes.hom)}&per_page=100`]) || [];
}

export function ultimoStatus(ficha, depId) {
  const l = ghJson(['api', `repos/${ficha.repo}/deployments/${depId}/statuses?per_page=1`]) || [];
  return l[0]?.state || 'pending';
}

export function marcarStatus(ficha, depId, state, { descricao = '', url } = {}) {
  const corpo = { state, description: descricao.slice(0, 140), ...(url ? { environment_url: url } : {}) };
  gh(['api', '-X', 'POST', `repos/${ficha.repo}/deployments/${depId}/statuses`, '--input', '-'], { input: JSON.stringify(corpo) });
}

function criarDeploy(ficha, sha, payload) {
  const corpo = {
    ref: sha, environment: ficha.ambientes.hom, auto_merge: false, required_contexts: [], payload,
    description: `Cartão #${payload.cartao}`, transient_environment: false, production_environment: false,
  };
  return ghJson(['api', '-X', 'POST', `repos/${ficha.repo}/deployments`, '--input', '-'], { input: JSON.stringify(corpo) });
}

// Cartão que ocupa o HOM: dono do deployment mais recente com status "success" (não inativo).
// Também ocupa: deployment de outro cartão ainda em andamento (in_progress/queued/pending) criado há menos de limite_hom_min + 5 min.
export function quemOcupa(ficha, id) {
  const janela = ((Number(ficha.limite_hom_min) || 30) + 5) * 60000;
  for (const d of listarDeploys(ficha).slice(0, 20)) {
    const st = ultimoStatus(ficha, d.id);
    const p = payloadDe(d);
    const c = Number(p.cartao);
    const info = { cartao: c, pr: p.pr, sha: String(d.sha || '') };
    if (st === 'success') return c && c !== Number(id) ? info : null;
    const recente = d.created_at && Date.now() - Date.parse(d.created_at) < janela;
    if (['in_progress', 'queued', 'pending'].includes(st) && recente && c && c !== Number(id)) return info;
  }
  return null;
}

export function comandosSuspeitos(ficha) {
  const nomes = [...new Set(['prd', ficha.ambientes?.prd].filter(Boolean).map((s) => escRe(String(s))))];
  const re = new RegExp(`(^|[^A-Za-z0-9])(${nomes.join('|')})([^A-Za-z0-9]|$)`, 'i');
  return ['deploy_hom', 'migracao_hom', 'testes_hom'].filter((k) => ficha[k] && re.test(ficha[k]));
}

export function instrucoesAnalista({ id, sha, ficha, criterios, nota }) {
  return [
    `## Homologação do cartão #${id}`,
    '',
    `Versão publicada no HOM: commit \`${sha.slice(0, 7)}\`${ficha.url_hom ? ` — ${ficha.url_hom}` : ''}`,
    `Nota do Supervisor: ${nota}`,
    '',
    '**O que testar:**',
    ...criterios.map((c) => `- [ ] ${c}`),
    '',
    '**Como responder:** neste PR, *Review changes* → **Approve** para aprovar, ou **Request changes** descrevendo o que falhou. Commit novo depois disso exige nova homologação.',
  ].join('\n');
}

export function cardHom(cwd, ficha, id, o = {}) {
  const n = validarId(id);
  const branch = branchAtual(cwd);
  if (!Object.values(ficha.prefixos_branch).some((p) => branch.startsWith(`${p}${n}-`)))
    throw new ErroGov('BRANCH_ERRADA', `A branch atual "${branch}" não é do cartão #${n}.`);
  const sujos = arquivosSujos(cwd, [`${DIR_HOM}/`]);
  if (sujos.length) throw new ErroGov('ARVORE_SUJA', `Alterações fora do commit (ignore artefatos no .gitignore): ${sujos.slice(0, 5).join(', ')}`);
  const pr = prAberto(ficha, branch);
  if (!pr) throw new ErroGov('SEM_PR');
  const rev = exigirRevisao(cwd, n);
  const anterior = lerEstadoHom(cwd, n);
  if (anterior?.assinatura?.commit && anterior.assinatura.commit === git(cwd, ['rev-parse', 'HEAD']).out)
    return { ok: true, situacao: 'ja_aprovado', sha: anterior.assinatura.commit, pr: pr.url };
  const ocupa = quemOcupa(ficha, n);
  if (o.furarFila && !String(o.motivo || '').trim()) throw new ErroGov('PARAMETRO', '--furar-fila exige --motivo.');
  if (ocupa && !o.furarFila)
    throw new ErroGov('HOM_OCUPADO', `O HOM está com o cartão #${ocupa.cartao} (PR #${ocupa.pr}, commit ${ocupa.sha.slice(0, 7)}).`);
  const susp = comandosSuspeitos(ficha);
  if (susp.length && !o.confirmoComando) throw new ErroGov('COMANDO_SUSPEITO_PRD', `Citam produção: ${susp.join(', ')}.`);
  if (ficha.migracao_hom && !o.migracaoAutorizada) throw new ErroGov('MIGRACAO_NAO_AUTORIZADA', `Migração HOM: ${ficha.migracao_hom}`);
  const manual = !ficha.deploy_hom;
  const marca = `docs(task): TASK-${n} homologacao`;
  const task = acharTask(cwd, n);
  const acoes = [
    task ? `registrar Homologação em ${task} (commit + push antes do deploy)` : 'sem TASK',
    `deployment ${ficha.ambientes.hom} do commit atual`,
    ...(manual ? ['modo manual: o usuário publica o commit'] : [`deploy: ${ficha.deploy_hom}`]),
    ...(ficha.migracao_hom ? [`migração: ${ficha.migracao_hom}`] : []),
    ...(ficha.testes_hom ? [`testes HOM: ${ficha.testes_hom}`] : []),
    `cartão #${n} → ${ficha.colunas.em_validacao}`,
    `instruções ao analista no PR ${pr.url}`,
  ];
  if (o.dryRun) return { ok: true, dry_run: true, acoes };

  if (task && git(cwd, ['log', '-1', '--format=%s']).out !== marca) {
    const abs = path.join(cwd, task);
    const fila = o.furarFila ? `\n- Fila furada com o "sim" do usuário. Motivo: ${String(o.motivo).trim()}` : '';
    fs.writeFileSync(abs, anexarNaSecao(fs.readFileSync(abs, 'utf8'), 'Homologação', `- ${agora()} — publicação no HOM pedida (PR ${pr.url}). O commit publicado é o que contém esta linha.${fila}`));
    git(cwd, ['add', task]);
    git(cwd, ['commit', '-q', '-m', marca]);
  }
  // Sempre empurra (idempotente): um push que falhou antes não pode deixar o deploy apontar para commit só local.
  pushBranch(cwd, branch, ficha.branch_principal);
  const sha = git(cwd, ['rev-parse', 'HEAD']).out;
  if (manual && !o.publicadoManual)
    return { ok: true, modo: 'manual', sha, pr: pr.url, instrucao: `Publique o commit ${sha.slice(0, 7)} no HOM e confirme; depois rode: card-hom ${n} --publicado-manual` };

  let dep = listarDeploys(ficha).find((d) => d.sha === sha && Number(payloadDe(d).cartao) === n);
  if (!dep) dep = criarDeploy(ficha, sha, { cartao: n, pr: pr.number, ...(o.furarFila ? { furou_fila: true, motivo: String(o.motivo).trim() } : {}) });
  marcarStatus(ficha, dep.id, 'in_progress', { descricao: `Cartão #${n}` });
  const log = path.join(cwd, DIR_HOM, `${n}.log`);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `\n# ${agora()} — cartão #${n}, commit ${sha}\n`);
  const ident = identidadeDe(ficha);
  const limite = (Number(ficha.limite_hom_min) || 30) * 60000;
  const etapas = [['deploy', manual ? null : ficha.deploy_hom], ['migracao', ficha.migracao_hom], ['testes', ficha.testes_hom]].filter(([, c]) => c);
  for (const [etapa, cmd] of etapas) {
    const r = executar(cwd, cmd, limite, { semVariaveis: ident.modo === 'token' ? [ident.token_env] : [] });
    const fim = r.tempo_esgotado ? 'tempo esgotado' : r.erro ? `${r.erroCodigo}: ${r.erro}` : `saída ${r.codigo}`;
    fs.appendFileSync(log, `\n## ${etapa}: ${cmd}\n${r.saida}\n→ ${fim}\n`);
    if (!r.ok) {
      marcarStatus(ficha, dep.id, 'failure', { descricao: `Falhou em ${etapa}` });
      const aviso = etapa === 'migracao' ? ' ATENÇÃO: o banco HOM pode estar pela metade; confira antes de tentar de novo.' : '';
      const motivo = r.tempo_esgotado ? `tempo esgotado em ${Number(ficha.limite_hom_min) || 30} min` : fim;
      throw new ErroGov('HOM_FALHOU', `Etapa "${etapa}" falhou (${motivo}). Log: ${DIR_HOM}/${n}.log.${aviso}\n${r.saida.split('\n').slice(-20).join('\n')}`, {
        etapa, codigo_saida: r.codigo, tempo_esgotado: !!r.tempo_esgotado, aviso_migracao: etapa === 'migracao',
      });
    }
  }
  marcarStatus(ficha, dep.id, 'success', { descricao: `Cartão #${n} em validação`, url: ficha.url_hom || undefined });
  moverCartao(ficha, acharCartao(ficha, n).itemId, 'em_validacao');
  const jaComentado = anterior?.sha === sha && anterior?.comentado;
  if (!jaComentado) {
    const criterios = lerCriterios(cwd, n).criterios.filter((c) => c.id.startsWith('C')).map((c) => c.texto);
    const v = rev.valida;
    const nota = `${v.nota}/10${v.tipo === 'liberado_pelo_usuario' ? ' (liberada pelo usuário)' : ''}`;
    ghComCorpo(['pr', 'comment', pr.url, '--repo', ficha.repo], instrucoesAnalista({ id: n, sha, ficha, criterios, nota }));
  }
  gravarEstadoHom(cwd, n, {
    id: n, sha, pr, deploy_id: dep.id, em: dep.created_at || agora(), branch, comentado: true,
    assinatura: anterior?.sha === sha ? anterior.assinatura || null : null, reprovacoes: anterior?.reprovacoes || [],
  });
  return { ok: true, sha, pr: pr.url, deploy_id: dep.id, etapas: etapas.map(([e]) => e), cartao: ficha.colunas.em_validacao };
}
