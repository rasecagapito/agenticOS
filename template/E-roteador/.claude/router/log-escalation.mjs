#!/usr/bin/env node
// Registra um escalonamento entre tiers (isolado por sessão) e imprime o próximo subagente.
// Uso: node .claude/router/log-escalation.mjs <subagente-atual> "<motivo>" [--sessao <id>]
// Saída: subagent_type do próximo tier, ou "LIMITE" (topo/limite atingido → reportar ao usuário).
import { nextTier } from './decide.mjs';
import { appendLog, lastLog, loadConfig, LOG_FILE, readTailLines } from './lib.mjs';

const args = process.argv.slice(2);
let sessao = null;
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sessao' && args[i + 1]) {
    sessao = args[++i];
  } else if (args[i].startsWith('--sessao=')) {
    sessao = args[i].slice(9);
  } else {
    pos.push(args[i]);
  }
}

const [atual, motivo = ''] = pos;
const cfg = loadConfig();
if (!cfg || !atual) {
  console.error('uso: log-escalation.mjs <subagente-atual> "<motivo>" [--sessao <id>]');
  process.exit(1);
}

const sessaoEfetiva = sessao || process.env.CLAUDE_SESSION_ID || lastLog()?.sessao || null;

// Escalonamentos da mesma sessão desde a última decisão não-envelope dela.
let count = 0;
for (const l of readTailLines(LOG_FILE, 65536).reverse()) {
  let e;
  try {
    e = JSON.parse(l);
  } catch {
    continue;
  }
  const mesmaSessao = !sessaoEfetiva || !e.sessao || e.sessao === sessaoEfetiva;
  if (e.tipo === 'decisao' && e.origem !== 'envelope' && mesmaSessao) break;
  if (e.tipo === 'escalonamento' && mesmaSessao) count++;
}

const prox = nextTier(cfg.tiers, atual);
if (!prox || count >= (cfg.max_escalations ?? 1)) {
  console.log('LIMITE');
  process.exit(0);
}
appendLog({
  ts: new Date().toISOString(),
  tipo: 'escalonamento',
  sessao: sessaoEfetiva,
  de: atual,
  tier: prox.id,
  subagente: prox.agent,
  modelo: prox.model_label,
  justificativa: motivo.slice(0, 200),
});
console.log(prox.agent);
