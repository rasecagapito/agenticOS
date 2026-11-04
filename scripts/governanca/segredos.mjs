// Varredura de segredos nas linhas adicionadas de um diff unificado (critério B2 do Supervisor).
// Texto exato listado em .agentic-os/segredos-permitidos.txt (editado só pelo usuário) vira "liberado".
import fs from 'node:fs';
import path from 'node:path';

export const ARQ_PERMITIDOS = '.agentic-os/segredos-permitidos.txt';

// Valor que é referência (variável, chamada, acesso) e não segredo literal.
const ehReferencia = (v) => /[($[{]/.test(v) || /^[A-Za-z_]\w*\.[A-Za-z_]/.test(v);

const PADROES = [
  ['chave AWS', /\bAKIA[0-9A-Z]{16}\b/g],
  ['token GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/g],
  ['chave sk-', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['chave privada', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g],
  [
    'senha/chave literal',
    /\b(?:[A-Za-z0-9]+_)*(?:password|passwd|senha|api_?key|secret|token)["']?\s*[:=]\s*(?:"([^"\s]{6,})"|'([^'\s]{6,})'|([^\s"',;]{6,}))/gi,
    (m) => !ehReferencia(m[1] ?? m[2] ?? m[3] ?? ''),
  ],
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
  let emHunk = false;
  for (const l of String(diff).split('\n')) {
    if (l.startsWith('diff --git ')) {
      emHunk = false;
      continue;
    }
    if (!emHunk && l.startsWith('+++ ')) {
      arquivo = l.slice(4).replace(/^b\//, '');
      continue;
    }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) {
      emHunk = true;
      linha = Number(h[1]);
      continue;
    }
    if (!emHunk || !l.startsWith('+')) continue;
    const txt = l.slice(1);
    const cobertos = [];
    for (const [tipo, re, valida] of PADROES) {
      for (const m of txt.matchAll(re)) {
        const ini = m.index;
        const fim = ini + m[0].length;
        if (valida && !valida(m)) continue;
        if (cobertos.some(([a, b]) => ini < b && fim > a)) continue;
        cobertos.push([ini, fim]);
        const hit = { arquivo, linha, tipo, trecho: mascarar(m[0]) };
        (permitidos.some((p) => m[0].includes(p)) ? liberados : achados).push(hit);
      }
    }
    linha++;
  }
  return { achados, liberados };
}
