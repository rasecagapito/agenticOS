#!/usr/bin/env node
// Statusline do projeto: encadeia a statusline global do usuário (se houver) e acrescenta
// o indicador da última decisão do roteador. Ex.: "roteador: dificil, 0.91, profundo (Opus)".
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lastLog } from './lib.mjs';

export function segment(e) {
  if (!e) return 'roteador: aguardando';
  const alvo = `${e.subagente} (${e.modelo})`;
  if (e.tipo === 'escalonamento') return `roteador: escalou → ${alvo}`;
  if (e.origem === 'override') return `roteador: manual → ${alvo}`;
  if (e.origem === 'fallback') return `roteador: erro → ${alvo}`;
  if (e.origem?.startsWith('regra:')) return `roteador: ${e.origem} → ${alvo}`;
  if (e.origem === 'continuacao') return `roteador: continua → ${alvo}`;
  const conf = e.confianca == null ? '?' : e.confianca.toFixed(2);
  if (e.escolha_jev) {
    // Jev escolheu; "↑" = subiu um nível por confiança baixa
    return e.escolha_jev === e.subagente
      ? `roteador: jev ${conf} → ${alvo}`
      : `roteador: jev ${e.escolha_jev} ${conf} ↑ ${alvo}`;
  }
  return `roteador: ${e.nivel}, ${conf}, ${alvo}`;
}

function globalStatusline(input) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
    const cmd = s.statusLine?.command;
    if (!cmd || cmd.includes('router/statusline.mjs')) return '';
    return execSync(cmd, { input, encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'ignore'] }).trimEnd();
  } catch {
    return '';
  }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  const base = globalStatusline(input);
  const seg = segment(lastLog());
  process.stdout.write(base ? `${base} | ${seg}` : seg);
});
