#!/usr/bin/env node
// Governança GitHub do Agentic OS (camada F). Saída: JSON em stdout.
// Código de saída: 0 ok · 2 erro conhecido ({ok:false, erro:{codigo, mensagem, como_resolver}}) · 1 erro inesperado.
// Uso (na pasta do projeto):
//   node github-setup.mjs detect [--owner X] [--project N] [--analista login]...
//   node github-setup.mjs apply [--ficha arq] [--dry-run]
//   node github-setup.mjs card-start <ID> [--tipo feature|fix] [--desc texto] [--dry-run]
//   node github-setup.mjs card-pr <ID> [--dry-run]
//   node github-setup.mjs review-check <ID>
//   node github-setup.mjs review-record <ID> --parecer <arquivo>
//   node github-setup.mjs review-decide <ID> (--seguir | --nova-rodada) --motivo "texto"   ← só com o "sim" do usuário
// Travas fixas: nunca push/merge na branch principal, nunca aprova PR, proteção só endurece.
import { aplicar } from './governanca/apply.mjs';
import { cardPr, cardStart } from './governanca/cartao.mjs';
import { detect } from './governanca/detect.mjs';
import { ErroGov } from './governanca/erros.mjs';
import { ARQ_FICHA, gravarFicha, lerFicha } from './governanca/ficha.mjs';
import { reviewCheck, reviewDecide, reviewRecord } from './governanca/supervisor.mjs';

const FLAGS = ['dry-run', 'owner', 'project', 'analista', 'ficha', 'tipo', 'desc', 'parecer', 'motivo'];
const BOOLEANAS = { '--dry-run': 'dryRun', '--seguir': 'seguir', '--nova-rodada': 'novaRodada' };

function opcoes(argv) {
  const o = { _: [], analista: [], dryRun: false, seguir: false, novaRodada: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOLEANAS[a]) o[BOOLEANAS[a]] = true;
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      if (!FLAGS.includes(k)) throw new ErroGov('PARAMETRO', `Opção desconhecida: ${a}`);
      const v = argv[++i];
      if (v === undefined) throw new ErroGov('PARAMETRO', `Falta valor para ${a}.`);
      if (k === 'analista') o.analista.push(v);
      else o[k] = v;
    } else o._.push(a);
  }
  return o;
}

function rodar(argv, cwd) {
  const [sub, ...resto] = argv;
  const o = opcoes(resto);
  const arq = o.ficha || ARQ_FICHA;
  switch (sub) {
    case 'detect':
      return { ok: true, ...detect(cwd, { owner: o.owner, project: o.project ? Number(o.project) : undefined, analistas: o.analista }) };
    case 'apply': {
      const r = aplicar(cwd, lerFicha(cwd, arq), { dryRun: o.dryRun });
      if (r.ficha) gravarFicha(cwd, r.ficha, arq);
      return r;
    }
    case 'card-start':
      return cardStart(cwd, lerFicha(cwd, arq), o._[0], { tipo: o.tipo, desc: o.desc, dryRun: o.dryRun });
    case 'card-pr':
      return cardPr(cwd, lerFicha(cwd, arq), o._[0], { dryRun: o.dryRun });
    case 'review-check':
      return reviewCheck(cwd, lerFicha(cwd, arq), o._[0]);
    case 'review-record':
      return reviewRecord(cwd, lerFicha(cwd, arq), o._[0], o.parecer);
    case 'review-decide':
      return reviewDecide(cwd, lerFicha(cwd, arq), o._[0], { seguir: o.seguir, novaRodada: o.novaRodada, motivo: o.motivo });
    default:
      throw new ErroGov('PARAMETRO', `Subcomando desconhecido: ${sub ?? '(nenhum)'}. Use detect | apply | card-start | card-pr | review-check | review-record | review-decide.`);
  }
}

try {
  process.stdout.write(JSON.stringify(rodar(process.argv.slice(2), process.cwd()), null, 2) + '\n');
} catch (e) {
  if (e instanceof ErroGov) {
    process.stdout.write(JSON.stringify({ ok: false, erro: { codigo: e.codigo, mensagem: e.message, como_resolver: e.como_resolver } }, null, 2) + '\n');
    process.exit(2);
  }
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
}
