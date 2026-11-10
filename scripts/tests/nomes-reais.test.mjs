// O repo do plugin é distribuído: não pode citar login/org de usuários reais.
// Só o autor do plugin, caminhos genéricos do GitHub e nomes fictícios (lista em donos-permitidos.txt).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('repo do plugin não cita donos fora da lista permitida', () => {
  const permitidos = new Set(
    fs.readFileSync(path.join(REPO, 'scripts/tests/donos-permitidos.txt'), 'utf8')
      .split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')),
  );
  const arquivos = spawnSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).stdout
    .split('\n').filter((f) => f && /\.(md|mjs|js|json|html|sh|txt|ya?ml)$/.test(f));
  const padroes = [
    /github\.com[/:]([A-Za-z0-9][A-Za-z0-9-]*)/g,
    /\brepos\/([A-Za-z0-9][A-Za-z0-9-]*)\//g,
    /"repo":\s*"([A-Za-z0-9][A-Za-z0-9-]*)\//g,
    /analistas['"]?\s*:\s*\[\s*['"]([A-Za-z0-9][A-Za-z0-9-]*)/g,
  ];
  const achados = [];
  for (const f of arquivos) {
    const abs = path.join(REPO, f);
    if (!fs.existsSync(abs)) continue;
    const t = fs.readFileSync(abs, 'utf8');
    for (const re of padroes) for (const m of t.matchAll(re)) if (!permitidos.has(m[1].toLowerCase())) achados.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(achados, []);
});
