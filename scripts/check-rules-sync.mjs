#!/usr/bin/env node
// Gate anti-drift das regras de estrutura (DS1) em Node puro (Windows + Unix).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitRules, parseRule } from './emit-rules.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilesDir = path.join(REPO, 'structure-profiles');
let fail = 0;

for (const name of fs.readdirSync(profilesDir).sort()) {
  const prof = path.join(profilesDir, name);
  const rulesDir = path.join(prof, 'rules');
  const globsDoc = path.join(prof, 'globs.md');
  if (!fs.existsSync(rulesDir) || !fs.statSync(rulesDir).isDirectory()) continue;
  if (!fs.existsSync(globsDoc)) {
    console.error(`FAIL[${name}]: falta globs.md`);
    fail = 1;
  }
  const globsTxt = fs.existsSync(globsDoc) ? fs.readFileSync(globsDoc, 'utf8') : '';
  const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md')).sort();
  for (const rf of ruleFiles) {
    const rn = rf.slice(0, -3);
    try {
      const { meta } = parseRule(fs.readFileSync(path.join(rulesDir, rf), 'utf8'), rf);
      if (!meta.description || !Array.isArray(meta.globs)) {
        console.error(`FAIL[${name}/${rn}]: frontmatter sem globs ou description`);
        fail = 1;
      }
    } catch (e) {
      console.error(`FAIL[${name}/${rn}]: ${e.message}`);
      fail = 1;
    }
    if (!globsTxt.includes(rn)) {
      console.error(`FAIL[${name}/${rn}]: nao mapeado em globs.md`);
      fail = 1;
    }
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-sync-'));
  try {
    emitRules(name, tmp, REPO);
    for (const rf of ruleFiles) {
      const rn = rf.slice(0, -3);
      for (const rel of [
        path.join('.cursor', 'rules', `${rn}.mdc`),
        path.join('.github', 'instructions', `${rn}.instructions.md`),
        path.join('.claude', 'rules', `${rn}.md`),
      ]) {
        const p = path.join(tmp, rel);
        if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
          console.error(`FAIL[${name}/${rn}]: ${rel} vazio ou ausente`);
          fail = 1;
        }
      }
    }
  } catch (e) {
    console.error(`FAIL[${name}]: ${e.message}`);
    fail = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (fail) {
  console.error('-> ha divergencias');
  process.exit(1);
}
console.log('OK: todos os perfis emitem regras sincronizadas');
