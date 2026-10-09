// Utilitários de I/O do roteador (config, log, resumo do projeto).
import { spawn } from 'node:child_process';
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

// Pedido anterior da mesma sessão + subagente efetivo (considera escalonamento posterior).
// Dá contexto ao classificador para respostas curtas ("sim", "pode seguir").
export function previousDecision(sessao, file = LOG_FILE) {
  if (!sessao) return null;
  try {
    const fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 32768);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    let escalado = null;
    for (const l of buf.toString('utf8').trim().split('\n').reverse()) {
      let e;
      try {
        e = JSON.parse(l);
      } catch {
        continue;
      }
      if (e.tipo === 'escalonamento' && !escalado) escalado = e.subagente;
      if (e.tipo === 'decisao' && e.sessao === sessao) {
        const a = { subagente: escalado || e.subagente };
        if (e.preview) a.pedido = e.preview;
        return a;
      }
    }
  } catch {
    /* sem log */
  }
  return null;
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
    const timer = setTimeout(() => {
      try {
        // shell:true → no Windows o comando roda sob cmd.exe; mata a árvore inteira
        if (process.platform === 'win32' && child?.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).unref();
        } else child?.kill();
      } catch {
        /* ignore */
      }
      child?.unref?.();
      finish({ erro: `timeout ${ms}ms` });
    }, ms);
    try {
      child = spawn(sc.cmd, { cwd, shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
