// Varredura de segredos nas linhas adicionadas de um diff unificado (critério B2 do Supervisor).
// Texto exato listado em .agentic-os/segredos-permitidos.txt (editado só pelo usuário) vira "liberado".
import fs from 'node:fs';
import path from 'node:path';

export const ARQ_PERMITIDOS = '.agentic-os/segredos-permitidos.txt';

const PADROES = [
  ['chave AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['token GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/],
  ['chave sk-', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['chave privada', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ['senha/chave literal', /\b(?:password|passwd|senha|api_?key|secret|token)\b\s*[:=]\s*["'][^"'\s]{6,}["']/i],
];

const mascarar = (s) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-2)}`);

export function lerPermitidos(cwd) {
  const p = path.join(cwd, ARQ_PERMITIDOS);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

export function varrerSegredos(diff, permitidos = []) {
  const achados = [];
  const liberados = [];
  let arquivo = '';
  let linha = 0;
  for (const l of String(diff).split('\n')) {
    if (l.startsWith('+++ ')) {
      arquivo = l.slice(4).replace(/^b\//, '');
      continue;
    }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) {
      linha = Number(h[1]);
      continue;
    }
    if (!l.startsWith('+')) continue;
    const txt = l.slice(1);
    for (const [tipo, re] of PADROES) {
      const m = txt.match(re);
      if (!m) continue;
      const hit = { arquivo, linha, tipo, trecho: mascarar(m[0]) };
      (permitidos.some((p) => txt.includes(p)) ? liberados : achados).push(hit);
      break;
    }
    linha++;
  }
  return { achados, liberados };
}
