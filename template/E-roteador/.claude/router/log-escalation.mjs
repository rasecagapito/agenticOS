#!/usr/bin/env node
// Registra um escalonamento entre tiers e imprime o próximo subagente.
// Uso: node .claude/router/log-escalation.mjs <subagente-atual> "<motivo>"
// Saída: subagent_type do próximo tier, ou "LIMITE" (topo/limite atingido → reportar ao usuário).
import { nextTier } from './decide.mjs';
import { appendLog, loadConfig, LOG_FILE } from './lib.mjs';
import fs from 'node:fs';

const [atual, motivo = ''] = process.argv.slice(2);
const cfg = loadConfig();
if (!cfg || !atual) {
  console.error('uso: log-escalation.mjs <subagente-atual> "<motivo>"');
  process.exit(1);
}

// Escalonamentos desde a última decisão do roteador.
let count = 0;
try {
  const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').reverse();
  for (const l of lines) {
    const e = JSON.parse(l);
    if (e.tipo === 'decisao') break;
    if (e.tipo === 'escalonamento') count++;
  }
} catch {
  /* sem log */
}

const prox = nextTier(cfg.tiers, atual);
if (!prox || count >= (cfg.max_escalations ?? 1)) {
  console.log('LIMITE');
  process.exit(0);
}
appendLog({
  ts: new Date().toISOString(),
  tipo: 'escalonamento',
  de: atual,
  tier: prox.id,
  subagente: prox.agent,
  modelo: prox.model_label,
  justificativa: motivo.slice(0, 200),
});
console.log(prox.agent);
