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
//   node github-setup.mjs card-hom <ID> [--furar-fila --motivo "..."] [--migracao-autorizada] [--confirmo-comando] [--publicado-manual] [--dry-run]
//   node github-setup.mjs card-sign <ID> [--pelo-chat --resultado aprovado|reprovado --frase "texto literal do usuário"]   ← chat só se a ficha permitir
//   (flags de autorização --furar-fila, --migracao-autorizada, --confirmo-comando, --publicado-manual: só com o "sim" do usuário)
// Identidade: card-* e review-* rodam como o agente (ficha.identidade_agente); detect e apply, como o usuário.
// Travas fixas: nunca push/merge na branch principal, nunca aprova PR, proteção só endurece.
import { aplicar } from './governanca/apply.mjs';
import { cardPr, cardStart } from './governanca/cartao.mjs';
import { detect } from './governanca/detect.mjs';
import { ErroGov } from './governanca/erros.mjs';
import { ativarIdentidade, exigirSeparacao } from './governanca/identidade.mjs';
import { exigirRemotoHttps } from './governanca/git.mjs';
import { ARQ_FICHA, gravarFicha, lerFicha, lerFichaParcial } from './governanca/ficha.mjs';
import { cardSign } from './governanca/assinatura.mjs';
import { cardHom } from './governanca/hom.mjs';
import { reviewCheck, reviewDecide, reviewRecord } from './governanca/supervisor.mjs';

const FLAGS = ['dry-run', 'owner', 'project', 'analista', 'ficha', 'tipo', 'desc', 'parecer', 'motivo', 'resultado', 'frase'];
const BOOLEANAS = {
  '--dry-run': 'dryRun', '--seguir': 'seguir', '--nova-rodada': 'novaRodada',
  '--furar-fila': 'furarFila', '--migracao-autorizada': 'migracaoAutorizada', '--confirmo-comando': 'confirmoComando', '--publicado-manual': 'publicadoManual',
  '--pelo-chat': 'peloChat',
};

function opcoes(argv) {
  const o = {
    _: [], analista: [], dryRun: false, seguir: false, novaRodada: false,
    furarFila: false, migracaoAutorizada: false, confirmoComando: false, publicadoManual: false, peloChat: false,
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
    default:
      throw new ErroGov('PARAMETRO', `Subcomando desconhecido: ${sub ?? '(nenhum)'}. Use detect | apply | card-start | card-pr | review-check | review-record | review-decide | card-hom | card-sign.`);
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
