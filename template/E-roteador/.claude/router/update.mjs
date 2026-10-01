#!/usr/bin/env node
// Localiza a versão mais nova do plugin agentic-os instalada e reaplica o instalador neste projeto.
// Ordem: env AGENTIC_OS_HOME → ~/.claude/plugins/installed_plugins.json (maior versão).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_DIR } from './lib.mjs';

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
const installer = root && path.join(root, 'scripts', 'install-router.mjs');
if (!installer || !fs.existsSync(installer)) {
  console.error(
    'Plugin agentic-os com scripts/install-router.mjs não encontrado.\n' +
      'Rode: claude plugin marketplace update agentic-os && claude plugin update agentic-os@agentic-os\n' +
      'ou defina AGENTIC_OS_HOME apontando para um clone do repositório.',
  );
  process.exit(1);
}
const r = spawnSync(process.execPath, [installer, PROJECT_DIR], { stdio: 'inherit' });
process.exit(r.status ?? 1);
