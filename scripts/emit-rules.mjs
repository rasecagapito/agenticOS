#!/usr/bin/env node
// Transpila as regras provider-neutras de um perfil para Cursor (.mdc), Copilot (.instructions.md)
// e Claude (.claude/rules/*.md). Zero dependências; compatível com Windows (CRLF) e Unix (LF).
// Uso: node scripts/emit-rules.mjs <perfil> <dir-de-saida>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseRule(texto, filePath = '') {
  const norm = String(texto).replace(/\r\n/g, '\n');
  const m = norm.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`FAIL: sem frontmatter em ${filePath}`);
  const fm = m[1];
  const body = m[2].trim();
  const d = {};
  for (const line of fm.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      d[k] = v
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (v === 'true' || v === 'false') {
      d[k] = v === 'true';
    } else {
      d[k] = v.replace(/^["']|["']$/g, '');
    }
  }
  return { meta: d, body };
}

export function emitRules(profile, outDir, repoRoot = REPO) {
  const src = path.join(repoRoot, 'structure-profiles', profile, 'rules');
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    throw new Error(`perfil '${profile}' nao encontrado (${src})`);
  }
  const cur = path.join(outDir, '.cursor', 'rules');
  const cop = path.join(outDir, '.github', 'instructions');
  const cld = path.join(outDir, '.claude', 'rules');
  fs.mkdirSync(cur, { recursive: true });
  fs.mkdirSync(cop, { recursive: true });
  fs.mkdirSync(cld, { recursive: true });

  let count = 0;
  for (const fn of fs.readdirSync(src).sort()) {
    if (!fn.endsWith('.md')) continue;
    const { meta, body } = parseRule(fs.readFileSync(path.join(src, fn), 'utf8'), path.join(src, fn));
    const name = meta.name || fn.slice(0, -3);
    const globs = Array.isArray(meta.globs) ? meta.globs : [];
    const desc = String(meta.description || '');
    const always = Boolean(meta.alwaysApply);

    const mdc = ['---', `description: ${desc}`, `globs: ${globs.join(', ')}`, `alwaysApply: ${always}`, '---', '', body, ''].join('\n');
    fs.writeFileSync(path.join(cur, `${name}.mdc`), mdc, 'utf8');

    const ins = ['---', `applyTo: "${globs.join(',')}"`, `description: ${desc}`, '---', '', body, ''].join('\n');
    fs.writeFileSync(path.join(cop, `${name}.instructions.md`), ins, 'utf8');

    const cldPaths = globs.length ? ['paths:', ...globs.map((g) => `  - "${g}"`)] : [];
    const cldDoc = ['---', `description: ${desc}`, ...cldPaths, '---', '', body, ''].join('\n');
    fs.writeFileSync(path.join(cld, `${name}.md`), cldDoc, 'utf8');

    count++;
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [profile, out] = process.argv.slice(2);
  if (!profile || !out) {
    console.error('uso: emit-rules.mjs <perfil> <dir-saida>');
    process.exit(1);
  }
  try {
    const count = emitRules(profile, out);
    console.log(`emit ok: perfil '${profile}' -> ${count} regra(s) em ${out} (.cursor/rules + .github/instructions + .claude/rules)`);
  } catch (e) {
    console.error(`erro: ${e.message}`);
    process.exit(1);
  }
}
