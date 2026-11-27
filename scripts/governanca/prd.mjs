// PRD (Parte 4b da governança): publica o commit integrado em PRD após merge e aprovação,
// move o cartão para Concluído e fecha a issue sincronizada com o Project.
import fs from 'node:fs';
import path from 'node:path';
import { acharCartao, moverCartao } from './cartao.mjs';
import { ErroGov } from './erros.mjs';
import { executar } from './executar.mjs';
import { gh, ghJson } from './gh.mjs';
import { arvoreLimpa, branchAtual, git } from './git.mjs';
import { lerEstadoHom } from './hom.mjs';
import { identidadeDe } from './identidade.mjs';
import { acharTask, validarId } from './supervisor.mjs';

export const DIR_PRD = '.agentic-os/prd';
const agora = () => new Date().toISOString();
const arqPrd = (cwd, id) => path.join(cwd, DIR_PRD, `${id}.json`);

export function lerEstadoPrd(cwd, id) {
  const p = arqPrd(cwd, id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    throw new ErroGov('PARAMETRO', `Estado ilegível: ${DIR_PRD}/${id}.json`);
  }
}

export function gravarEstadoPrd(cwd, id, e) {
  const p = arqPrd(cwd, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(e, null, 2) + '\n');
}

function criarDeployPrd(ficha, sha, payload) {
  const corpo = {
    ref: sha,
    environment: ficha.ambientes.prd,
    auto_merge: false,
    required_contexts: [],
    payload,
    description: `Cartão #${payload.cartao} (PRD)`,
    transient_environment: false,
    production_environment: true,
  };
  return ghJson(['api', '-X', 'POST', `repos/${ficha.repo}/deployments`, '--input', '-'], { input: JSON.stringify(corpo) });
}

function marcarStatusPrd(ficha, depId, state, { descricao = '', url } = {}) {
  const corpo = { state, description: descricao.slice(0, 140), ...(url ? { environment_url: url } : {}) };
  gh(['api', '-X', 'POST', `repos/${ficha.repo}/deployments/${depId}/statuses`, '--input', '-'], { input: JSON.stringify(corpo) });
}

function concluirPrd(cwd, ficha, n, pend) {
  const salvar = () => gravarEstadoPrd(cwd, n, { ...pend });
  const feito = (k, fn) => {
    if (pend.efeitos[k]) return;
    fn();
    pend.efeitos[k] = true;
    salvar();
  };
  salvar();
  const cartao = acharCartao(ficha, n);
  feito('mover', () => moverCartao(ficha, cartao.itemId, 'concluido'));
  feito('fechar_issue', () =>
    gh(['issue', 'close', String(n), '--repo', ficha.repo, '--comment',
      `Publicado em ${ficha.ambientes.prd} em ${pend.em} (commit ${String(pend.sha).slice(0, 7)}). Cartão movido para ${ficha.colunas.concluido}.`]),
  );
  const { efeitos: _x, ...finalizado } = pend;
  const registro = { ...finalizado, concluido: true };
  gravarEstadoPrd(cwd, n, registro);
  return {
    ok: true,
    situacao: 'concluido',
    sha: registro.sha,
    deploy_id: registro.deploy_id,
    cartao: ficha.colunas.concluido,
    issue_fechada: true,
  };
}

export function cardPrd(cwd, ficha, id, o = {}) {
  const n = validarId(id);
  const anterior = lerEstadoPrd(cwd, n);
  if (anterior?.concluido) {
    return { ok: true, situacao: 'ja_concluido', sha: anterior.sha, deploy_id: anterior.deploy_id, cartao: ficha.colunas.concluido };
  }
  if (anterior?.efeitos?.deploy) return concluirPrd(cwd, ficha, n, anterior);

  const hom = lerEstadoHom(cwd, n);
  if (!hom?.merge) throw new ErroGov('SEM_MERGE');
  const branch = branchAtual(cwd);
  if (branch !== ficha.branch_principal) {
    throw new ErroGov('BRANCH_NAO_PRINCIPAL', `Publicação em PRD deve rodar na branch principal "${ficha.branch_principal}" (atual: "${branch}").`);
  }
  if (!arvoreLimpa(cwd)) throw new ErroGov('ARVORE_SUJA');
  if (ficha.migracao_prd && !o.migracaoAutorizada)
    throw new ErroGov('MIGRACAO_NAO_AUTORIZADA', `Migração PRD: ${ficha.migracao_prd}`);

  const sha = hom.merge.sha || git(cwd, ['rev-parse', 'HEAD']).out;
  const manual = !ficha.deploy_prd;
  const acoes = [
    `deployment ${ficha.ambientes.prd} do commit ${sha.slice(0, 7)}`,
    ...(manual ? ['modo manual: o usuário publica em PRD'] : [`deploy PRD: ${ficha.deploy_prd}`]),
    ...(ficha.migracao_prd ? [`migração PRD: ${ficha.migracao_prd}`] : []),
    ...(ficha.testes_prd ? [`testes PRD: ${ficha.testes_prd}`] : []),
    `mover cartão #${n} → ${ficha.colunas.concluido}`,
    `fechar issue #${n}`,
  ];
  if (o.dryRun) return { ok: true, dry_run: true, sha, acoes };
  if (!o.confirmoPrd) throw new ErroGov('PRD_NAO_APROVADO');
  if (manual && !o.publicadoManual) {
    return {
      ok: true,
      modo: 'manual',
      sha,
      instrucao: `Publique o commit ${sha.slice(0, 7)} em PRD e confirme; depois rode: card-prd ${n} --confirmo-prd --publicado-manual`,
    };
  }

  const dep = criarDeployPrd(ficha, sha, { cartao: n, pr: hom.merge.pr, task: acharTask(cwd, n) || null });
  marcarStatusPrd(ficha, dep.id, 'in_progress', { descricao: `Cartão #${n} PRD` });
  const log = path.join(cwd, DIR_PRD, `${n}.log`);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `\n# ${agora()} — PRD cartão #${n}, commit ${sha}\n`);
  const ident = identidadeDe(ficha);
  const limite = (Number(ficha.limite_prd_min) || 30) * 60000;
  const etapas = [['deploy', manual ? null : ficha.deploy_prd], ['migracao', ficha.migracao_prd], ['testes', ficha.testes_prd]].filter(([, c]) => c);
  for (const [etapa, cmd] of etapas) {
    const r = executar(cwd, cmd, limite, { semVariaveis: ident.modo === 'token' ? [ident.token_env] : [] });
    const fim = r.tempo_esgotado ? 'tempo esgotado' : r.erro ? `${r.erroCodigo}: ${r.erro}` : `saída ${r.codigo}`;
    fs.appendFileSync(log, `\n## ${etapa}: ${cmd}\n${r.saida}\n→ ${fim}\n`);
    if (!r.ok) {
      marcarStatusPrd(ficha, dep.id, 'failure', { descricao: `Falhou PRD em ${etapa}` });
      const motivo = r.tempo_esgotado ? `tempo esgotado em ${Number(ficha.limite_prd_min) || 30} min` : fim;
      throw new ErroGov('PRD_FALHOU', `Etapa PRD "${etapa}" falhou (${motivo}). Log: ${DIR_PRD}/${n}.log.`);
    }
  }
  marcarStatusPrd(ficha, dep.id, 'success', { descricao: `Cartão #${n} em PRD`, url: ficha.url_prd || undefined });
  return concluirPrd(cwd, ficha, n, {
    id: n,
    sha,
    deploy_id: dep.id,
    em: agora(),
    etapas: etapas.map(([e]) => e),
    efeitos: { deploy: true },
  });
}
