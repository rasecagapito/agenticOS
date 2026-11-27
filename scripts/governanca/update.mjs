#!/usr/bin/env node
// Localiza a versão mais nova do plugin agentic-os instalada e reaplica a camada F neste projeto,
// preservando .agentic-os/governanca.json (e seus IDs/proteção).
// Ordem: env AGENTIC_OS_HOME → ~/.claude/plugins/installed_plugins.json (maior versão).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const semver = (v) => String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

function pluginRoot() {
  if (process.env.AGENTIC_OS_HOME) return process.env.AGENTIC_OS_HOME;
  try {
    const f = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
    const all = JSON.parse(fs.readFileSync(f, 'utf8')).plugins?.['agentic-os@agentic-os'] || [];
    let best = null;
    for (const p of all) if (!best || newer(p.version, best.version)) best = p;
    return best?.installPath || null;
  } catch {
    return null;
  }
}

const root = pluginRoot();
const installer = root && path.join(root, 'scripts', 'install-governanca.mjs');
const ficha = path.join(PROJECT_DIR, '.agentic-os', 'governanca.json');
if (!installer || !fs.existsSync(installer)) {
  console.error(
    'Plugin agentic-os com scripts/install-governanca.mjs não encontrado.\n' +
      'Rode: claude plugin marketplace update agentic-os && claude plugin update agentic-os@agentic-os\n' +
      'ou defina AGENTIC_OS_HOME apontando para um clone do repositório.',
  );
  process.exit(1);
}
if (!fs.existsSync(ficha)) {
  console.error('Ficha .agentic-os/governanca.json não encontrada neste projeto.');
  process.exit(1);
}
const r = spawnSync(process.execPath, [installer, PROJECT_DIR, '--ficha-json', ficha], { stdio: 'inherit' });
process.exit(r.status ?? 1);
