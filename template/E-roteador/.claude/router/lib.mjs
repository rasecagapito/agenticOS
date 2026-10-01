// Utilitários de I/O do roteador (config, log, resumo do projeto).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROUTER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_DIR = path.resolve(ROUTER_DIR, '..', '..');
export const LOG_FILE = path.join(ROUTER_DIR, 'decisions.jsonl');

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, 'config.json'), 'utf8'));
  } catch {
    return null; // sem config → roteador desligado (opt-in)
  }
}

export function appendLog(entry) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    /* log nunca derruba o fluxo */
  }
}

// Última linha válida do log (lê só o fim do arquivo).
export function lastLog(file = LOG_FILE) {
  try {
    const fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 8192);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').trim().split('\n').reverse();
    for (const l of lines) {
      try {
        return JSON.parse(l);
      } catch {
        /* linha cortada no início do buffer */
      }
    }
  } catch {
    /* sem log ainda */
  }
  return null;
}

// Resumo do projeto: config.project_summary, senão monta a partir do cérebro do próprio projeto.
export function projectSummary(cfg) {
  const max = cfg.project_summary_max_chars || 4000;
  if (cfg.project_summary) return cfg.project_summary.slice(0, max);
  const parts = [];
  let used = 0;
  for (const rel of cfg.project_summary_sources || []) {
    if (used >= max) break;
    try {
      const txt = fs
        .readFileSync(path.join(PROJECT_DIR, rel), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!txt) continue;
      const chunk = `# ${rel}\n${txt}`.slice(0, Math.max(0, max - used));
      parts.push(chunk);
      used += chunk.length;
    } catch {
      /* fonte ausente */
    }
  }
  return parts.join('\n\n') || 'Projeto sem descrição disponível.';
}
