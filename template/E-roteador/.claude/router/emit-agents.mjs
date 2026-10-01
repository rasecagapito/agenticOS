#!/usr/bin/env node
// Gera .claude/agents/<agente>.md para cada tier do config.json a partir de agent-body.md
// (fonte única; os agentes só diferem no modelo). `--check` falha se o emitido divergir.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROUTER_DIR } from './lib.mjs';

export function render(tier, body) {
  return [
    '---',
    `name: ${tier.agent}`,
    `description: Executor do roteador de modelos — nível ${tier.id} (${tier.model_label}). ` +
      `Use quando o bloco ROTEADOR indicar subagent_type="${tier.agent}" ou ao escalonar para este nível.`,
    `model: ${tier.model}`,
    '---',
    '<!-- GERADO por .claude/router/emit-agents.mjs a partir de agent-body.md. Não editar à mão. -->',
    '',
    body.replaceAll('{{TIER}}', `${tier.id} / ${tier.model_label}`).trimEnd(),
    '',
  ].join('\n');
}

const cfg = loadConfig();
const body = fs.readFileSync(path.join(ROUTER_DIR, 'agent-body.md'), 'utf8').replace(/\r\n/g, '\n');
const outDir = path.join(ROUTER_DIR, '..', 'agents');
const check = process.argv.includes('--check');
let fail = 0;
fs.mkdirSync(outDir, { recursive: true });
for (const t of cfg.tiers) {
  const file = path.join(outDir, `${t.agent}.md`);
  const want = render(t, body);
  if (check) {
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (have !== want) {
      console.log(`FAIL: ${path.relative(process.cwd(), file)} divergente de agent-body.md/config.json`);
      fail = 1;
    }
  } else {
    fs.writeFileSync(file, want, 'utf8');
    console.log(`emitido: ${t.agent}.md (model: ${t.model})`);
  }
}
if (check) {
  if (fail) {
    console.log('-> rode: node .claude/router/emit-agents.mjs');
    process.exit(1);
  }
  console.log('OK: agentes sincronizados com agent-body.md');
}
