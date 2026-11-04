#!/usr/bin/env node
// gh falso para testes: responde conforme AGENTIC_OS_GH_SCENARIO (lista de regras {re, stdout, stderr, code};
// a primeira cujo regex casa com os argumentos unidos por espaço vence) e registra cada chamada
// em AGENTIC_OS_GH_LOG (uma linha JSON {args, input}).
import fs from 'node:fs';

const args = process.argv.slice(2);
const linha = args.join(' ');
let input = '';
if (args.includes('--input')) {
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {}
}
// --body-file: o arquivo é temporário (apagado depois); registra o conteúdo para os testes conferirem.
let body_file;
const bf = args.indexOf('--body-file');
if (bf >= 0) {
  try {
    body_file = fs.readFileSync(args[bf + 1], 'utf8');
  } catch {}
}
if (process.env.AGENTIC_OS_GH_LOG) fs.appendFileSync(process.env.AGENTIC_OS_GH_LOG, JSON.stringify({ args, input, body_file }) + '\n');
const regras = JSON.parse(fs.readFileSync(process.env.AGENTIC_OS_GH_SCENARIO, 'utf8'));
const r = regras.find((x) => new RegExp(x.re).test(linha));
if (!r) {
  process.stderr.write(`fake-gh: sem cenário para: ${linha}\n`);
  process.exit(1);
}
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.code ?? 0);
