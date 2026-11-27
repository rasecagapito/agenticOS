#!/usr/bin/env node
// Garante que todos os manifestos, package.json e guia-completo.html apontam a mesma versão.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));

const pkg = readJson('package.json');
const claudePlugin = readJson('.claude-plugin/plugin.json');
const codexPlugin = readJson('.codex-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
const painelPlugin = readJson('plugins/agentic-os-painel/.claude-plugin/plugin.json');
const guiaHtml = fs.readFileSync(path.join(REPO, 'docs/guia-completo.html'), 'utf8');

const nucleoEsperado = claudePlugin.version;
const painelEsperado = painelPlugin.version;
const erros = [];

if (pkg.version !== nucleoEsperado) erros.push(`package.json (${pkg.version}) != .claude-plugin/plugin.json (${nucleoEsperado})`);
if (codexPlugin.version !== nucleoEsperado) erros.push(`.codex-plugin/plugin.json (${codexPlugin.version}) != ${nucleoEsperado}`);

const mNucleo = marketplace.plugins?.find((p) => p.name === 'agentic-os')?.version;
const mPainel = marketplace.plugins?.find((p) => p.name === 'agentic-os-painel')?.version;
if (mNucleo !== nucleoEsperado) erros.push(`.claude-plugin/marketplace.json agentic-os (${mNucleo}) != ${nucleoEsperado}`);
if (mPainel !== painelEsperado) erros.push(`.claude-plugin/marketplace.json agentic-os-painel (${mPainel}) != ${painelEsperado}`);

if (!guiaHtml.includes(`v${nucleoEsperado}`) || !guiaHtml.includes(`Versão ${nucleoEsperado}`)) {
  erros.push(`docs/guia-completo.html não referencia v${nucleoEsperado} / Versão ${nucleoEsperado}`);
}

if (erros.length) {
  for (const e of erros) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log(`OK: versões sincronizadas (agentic-os=${nucleoEsperado}, agentic-os-painel=${painelEsperado})`);
