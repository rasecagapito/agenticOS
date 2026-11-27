#!/usr/bin/env node
// Governança GitHub do Agentic OS (camada F). Saída: JSON em stdout.
// Código de saída: 0 ok · 2 erro conhecido ({ok:false, erro:{codigo, mensagem, como_resolver}}) · 1 erro inesperado.
// Uso (na pasta do projeto):
//   node github-setup.mjs detect [--owner X] [--project N] [--analista login]...
//   node github-setup.mjs apply [--ficha arq] [--dry-run]
//   node github-setup.mjs card-start <ID> [--tipo feature|fix] [--desc texto] [--dry-run]
//   node github-setup.mjs card-pr <ID> [--dry-run]
//   node github-setup.mjs card-block <ID> --motivo "texto"
//   node github-setup.mjs card-queue <ID1,ID2,...> [--ids 1,2,3]
//   node github-setup.mjs review-check <ID>
//   node github-setup.mjs review-record <ID> --parecer <arquivo>
//   node github-setup.mjs review-decide <ID> (--seguir | --nova-rodada) --motivo "texto"   ← só com o "sim" do usuário
//   node github-setup.mjs card-hom <ID> [--furar-fila --motivo "..."] [--migracao-autorizada] [--confirmo-comando] [--publicado-manual] [--dry-run]
//   node github-setup.mjs card-sign <ID> [--pelo-chat --resultado aprovado|reprovado --frase "texto literal do usuário"]   ← chat só se a ficha permitir
//   node github-setup.mjs card-merge <ID> [--confirmo-merge-chat]   ← confirmação só com o "sim" do usuário (assinatura pelo chat)
//   node github-setup.mjs card-prd <ID> [--confirmo-prd] [--migracao-autorizada] [--publicado-manual] [--dry-run]
//   node github-setup.mjs release-check [--major | --minor | --patch | --versao X.Y.Z]
//   node github-setup.mjs release-publish [--major | --minor | --patch | --versao X.Y.Z] [--confirmo-release] [--dry-run]
//   node github-setup.mjs sprint-inspect
//   node github-setup.mjs sprint-plan --plano <arquivo.json>
//   node github-setup.mjs sprint-apply --plano <arquivo.json> [--confirmo-sprint] [--dry-run]
// Identidade: card-* e review-* rodam como o agente (ficha.identidade_agente); detect, apply, release-* e sprint-* como o usuário.
// Travas fixas: nunca push na branch principal; merge só pelo card-merge (assinatura válida do commit atual); nunca aprova PR; proteção só endurece.
import fs from 'node:fs';
import path from 'node:path';
import { aplicar } from './governanca/apply.mjs';
import { cardBlock, cardPr, cardQueue, cardStart } from './governanca/cartao.mjs';
import { detect } from './governanca/detect.mjs';
import { ErroGov } from './governanca/erros.mjs';
import { ativarIdentidade, exigirSeparacao } from './governanca/identidade.mjs';
import { exigirRemotoHttps } from './governanca/git.mjs';
import { ARQ_FICHA, gravarFicha, lerFicha, lerFichaParcial } from './governanca/ficha.mjs';
import { cardSign } from './governanca/assinatura.mjs';
import { cardHom } from './governanca/hom.mjs';
import { cardMerge } from './governanca/merge.mjs';
import { cardPrd } from './governanca/prd.mjs';
import { sprintApply, sprintInspect, sprintPlan } from './governanca/sprint.mjs';
import { reviewCheck, reviewDecide, reviewRecord } from './governanca/supervisor.mjs';
import { releaseCheck, releasePublish } from './governanca/versao.mjs';

const FLAGS = ['dry-run', 'owner', 'project', 'analista', 'ficha', 'tipo', 'desc', 'parecer', 'motivo', 'resultado', 'frase', 'versao', 'plano', 'ids'];
const BOOLEANAS = {
  '--dry-run': 'dryRun',
  '--seguir': 'seguir',
  '--nova-rodada': 'novaRodada',
  '--furar-fila': 'furarFila',
  '--migracao-autorizada': 'migracaoAutorizada',
  '--confirmo-comando': 'confirmoComando',
  '--publicado-manual': 'publicadoManual',
  '--pelo-chat': 'peloChat',
  '--confirmo-merge-chat': 'confirmoMergeChat',
  '--confirmo-prd': 'confirmoPrd',
  '--confirmo-release': 'confirmoRelease',
  '--confirmo-sprint': 'confirmoSprint',
  '--major': 'major',
  '--minor': 'minor',
  '--patch': 'patch',
};

function opcoes(argv) {
  const o = {
    _: [],
    analista: [],
    dryRun: false,
    seguir: false,
    novaRodada: false,
    furarFila: false,
    migracaoAutorizada: false,
    confirmoComando: false,
    publicadoManual: false,
    peloChat: false,
    confirmoMergeChat: false,
    confirmoPrd: false,
    confirmoRelease: false,
    confirmoSprint: false,
    major: false,
    minor: false,
    patch: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOLEANAS[a]) o[BOOLEANAS[a]] = true;
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      if (!FLAGS.includes(k)) throw new ErroGov('PARAMETRO', `Opção desconhecida: ${a}`);
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new ErroGov('PARAMETRO', `Falta valor para ${a}.`);
      if (k === 'analista') o.analista.push(v);
      else o[k] = v;
    } else o._.push(a);
  }
  return o;
}

function lerJsonPlano(cwd, arq) {
  if (!arq) throw new ErroGov('PARAMETRO', 'Informe --plano <arquivo.json>.');
  try {
    return JSON.parse(fs.readFileSync(path.resolve(cwd, arq), 'utf8'));
  } catch (e) {
    throw new ErroGov('PARAMETRO', `Não consegui ler o plano (${arq}): ${e.message}`);
  }
}

function rodar(argv, cwd) {
  const [sub, ...resto] = argv;
  const o = opcoes(resto);
  const arq = o.ficha || ARQ_FICHA;
  const comoAgente = ({ separar = false } = {}) => {
    const f = lerFicha(cwd, arq);
    if (ativarIdentidade(f).modo !== 'nenhuma') exigirRemotoHttps(cwd);
    if (separar) exigirSeparacao(f);
    return f;
  };
  switch (sub) {
    case 'detect':
      return { ok: true, ...detect(cwd, { owner: o.owner, project: o.project ? Number(o.project) : undefined, analistas: o.analista, parcial: lerFichaParcial(cwd, arq) }) };
    case 'apply': {
      const r = aplicar(cwd, lerFicha(cwd, arq), { dryRun: o.dryRun });
      if (r.ficha) gravarFicha(cwd, r.ficha, arq);
      return r;
    }
    case 'card-start':
      return cardStart(cwd, comoAgente(), o._[0], { tipo: o.tipo, desc: o.desc, dryRun: o.dryRun });
    case 'card-pr':
      return cardPr(cwd, comoAgente(), o._[0], { dryRun: o.dryRun });
    case 'card-block':
      return cardBlock(comoAgente(), o._[0], { motivo: o.motivo });
    case 'card-queue': {
      const ids = (o.ids ? o.ids.split(',') : o._.flatMap((x) => x.split(','))).map((x) => x.trim()).filter(Boolean);
      return cardQueue(comoAgente(), ids);
    }
    case 'review-check':
      return reviewCheck(cwd, comoAgente(), o._[0]);
    case 'review-record':
      return reviewRecord(cwd, comoAgente(), o._[0], o.parecer);
    case 'review-decide':
      return reviewDecide(cwd, comoAgente(), o._[0], { seguir: o.seguir, novaRodada: o.novaRodada, motivo: o.motivo });
    case 'card-hom':
      return cardHom(cwd, comoAgente({ separar: true }), o._[0], {
        dryRun: o.dryRun, furarFila: o.furarFila, motivo: o.motivo, migracaoAutorizada: o.migracaoAutorizada,
        confirmoComando: o.confirmoComando, publicadoManual: o.publicadoManual,
      });
    case 'card-sign':
      return cardSign(cwd, comoAgente({ separar: true }), o._[0], { peloChat: o.peloChat, resultado: o.resultado, frase: o.frase });
    case 'card-merge':
      return cardMerge(cwd, comoAgente({ separar: true }), o._[0], { confirmoMergeChat: o.confirmoMergeChat });
    case 'card-prd':
      return cardPrd(cwd, lerFicha(cwd, arq), o._[0], {
        dryRun: o.dryRun,
        migracaoAutorizada: o.migracaoAutorizada,
        publicadoManual: o.publicadoManual,
        confirmoPrd: o.confirmoPrd,
      });
    case 'release-check':
      return releaseCheck(cwd, lerFicha(cwd, arq), { major: o.major, minor: o.minor, patch: o.patch, versao: o.versao });
    case 'release-publish':
      return releasePublish(cwd, lerFicha(cwd, arq), {
        major: o.major, minor: o.minor, patch: o.patch, versao: o.versao,
        dryRun: o.dryRun, confirmoRelease: o.confirmoRelease,
      });
    case 'sprint-inspect':
      return sprintInspect(lerFicha(cwd, arq));
    case 'sprint-plan':
      return sprintPlan(lerFicha(cwd, arq), lerJsonPlano(cwd, o.plano));
    case 'sprint-apply':
      return sprintApply(lerFicha(cwd, arq), lerJsonPlano(cwd, o.plano), { dryRun: o.dryRun, confirmoSprint: o.confirmoSprint });
    default:
      throw new ErroGov(
        'PARAMETRO',
        `Subcomando desconhecido: ${sub ?? '(nenhum)'}. Use detect | apply | card-start | card-pr | card-block | card-queue | review-check | review-record | review-decide | card-hom | card-sign | card-merge | card-prd | release-check | release-publish | sprint-inspect | sprint-plan | sprint-apply.`,
      );
  }
}

try {
  process.stdout.write(JSON.stringify(rodar(process.argv.slice(2), process.cwd()), null, 2) + '\n');
} catch (e) {
  if (e instanceof ErroGov) {
    process.stdout.write(JSON.stringify({ ok: false, erro: { codigo: e.codigo, mensagem: e.message, como_resolver: e.como_resolver, ...(e.extra ? { extra: e.extra } : {}) } }, null, 2) + '\n');
    process.exit(2);
  }
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
}
