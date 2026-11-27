// Utilitários de I/O do roteador (config, log, resumo do projeto).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROUTER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_DIR = path.resolve(ROUTER_DIR, '..', '..');
export const LOG_FILE = path.join(ROUTER_DIR, 'decisions.jsonl');
export const LOG_MAX_BYTES = 2 * 1024 * 1024;
export const LOG_KEEP_BYTES = 1024 * 1024;

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, 'config.json'), 'utf8'));
  } catch {
    return null; // sem config → roteador desligado (opt-in)
  }
}

export function readTailLines(file = LOG_FILE, maxBytes = 65536) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      if (size === 0) return [];
      const len = Math.min(size, maxBytes);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const txt = buf.toString('utf8');
      const lines = txt.split('\n');
      if (len < size) lines.shift(); // descarta linha parcial no início do buffer
      return lines.filter((l) => l.trim());
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

export function rotateLogIfNeeded(file = LOG_FILE, maxBytes = LOG_MAX_BYTES, keepBytes = LOG_KEEP_BYTES) {
  try {
    const stat = fs.statSync(file);
    if (stat.size <= maxBytes) return false;
    const kept = readTailLines(file, keepBytes).join('\n');
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, kept ? kept + '\n' : '', 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

export function appendLog(entry, file = LOG_FILE) {
  try {
    rotateLogIfNeeded(file);
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    /* log nunca derruba o fluxo */
  }
}

// Última linha válida do log (lê só o fim do arquivo).
export function lastLog(file = LOG_FILE) {
  const lines = readTailLines(file, 8192).reverse();
  for (const l of lines) {
    try {
      return JSON.parse(l);
    } catch {
      /* linha inválida */
    }
  }
  return null;
}

// Pedido anterior da mesma sessão + subagente efetivo (considera escalonamento apenas da mesma sessão).
// Dá contexto ao classificador para respostas curtas ("sim", "pode seguir").
export function previousDecision(sessao, file = LOG_FILE) {
  if (!sessao) return null;
  let escalado = null;
  for (const l of readTailLines(file, 65536).reverse()) {
    let e;
    try {
      e = JSON.parse(l);
    } catch {
      continue;
    }
    if (e.tipo === 'escalonamento' && !escalado && (!e.sessao || e.sessao === sessao)) escalado = e.subagente;
    if (e.tipo === 'decisao' && e.sessao === sessao && e.origem !== 'envelope') {
      const a = { subagente: escalado || e.subagente };
      if (e.preview) a.pedido = e.preview;
      return a;
    }
  }
  return null;
}

// true se esta sessão já recebeu o aviso de chave do Jev (evita repetir a cada mensagem).
export function keyWarnedThisSession(sessao, file = LOG_FILE) {
  if (!sessao) return false;
  for (const l of readTailLines(file, 262144)) {
    if (!l.includes('"aviso_chave":true')) continue;
    try {
      if (JSON.parse(l).sessao === sessao) return true;
    } catch {
      /* linha inválida */
    }
  }
  return false;
}

// Limite do resumo do projeto no state: state_project_summary_max_chars (v1.7) →
// project_summary_max_chars (legado; 0 = 4000, como na v1.6) → 4000. 0 na chave nova = não envia `projeto`.
export function summaryMaxChars(cfg) {
  const v = cfg.state_project_summary_max_chars ?? (cfg.project_summary_max_chars || 4000);
  return typeof v === 'number' && v >= 0 ? v : 4000;
}

// Resumo do projeto: config.project_summary, senão monta a partir do cérebro do próprio projeto.
export function projectSummary(cfg, max = summaryMaxChars(cfg) || 4000) {
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

// state_command: { cmd, timeout_ms } executado na raiz do projeto. stdout deve ser um objeto JSON.
// Nunca bloqueia: falha, timeout ou JSON inválido → { erro } (o hook segue sem `situacao`).
export function runStateCommand(sc, cwd = PROJECT_DIR) {
  return new Promise((resolve) => {
    if (!sc || typeof sc.cmd !== 'string' || !sc.cmd.trim()) return resolve(null);
    const ms = sc.timeout_ms ?? 1500;
    let out = '';
    let done = false;
    let child;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child?.stdout?.destroy();
        child?.stderr?.destroy();
      } catch {
        /* ignore */
      }
      resolve(r);
    };
    const win = process.platform === 'win32';
    const timer = setTimeout(() => {
      try {
        // No Windows, taskkill síncrono garante que o diretório/processos filhos sejam liberados antes de resolver.
        if (win && child?.pid) {
          spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else if (child?.pid) {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch {
        try {
          child?.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
      child?.unref?.();
      finish({ erro: `timeout ${ms}ms` });
    }, ms);
    try {
      child = spawn(sc.cmd, { cwd, shell: true, detached: !win, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return finish({ erro: e.message });
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', () => {});
    child.on('error', (e) => finish({ erro: e.message }));
    child.on('close', (code) => {
      if (code !== 0) return finish({ erro: `saida ${code}` });
      finish(parseSituacao(out));
    });
  });
}

// stdout do state_command → { situacao } se for objeto JSON, senão { erro }.
export function parseSituacao(stdout) {
  try {
    const v = JSON.parse(String(stdout).trim());
    if (v && typeof v === 'object' && !Array.isArray(v)) return { situacao: v };
    return { erro: 'json nao e objeto' };
  } catch {
    return { erro: 'json invalido' };
  }
}
