#!/usr/bin/env node
// Wrapper padrão para executar o Motor de Paridade em um diretório alvo.
// Uso: node template/paridade/comparador-generico.mjs <dir-alvo>
import { executarParidade } from '../../scripts/paridade.mjs';

const alvo = process.argv[2] || 'paridade/exemplo';
const res = executarParidade(alvo, process.cwd());
process.stdout.write(JSON.stringify(res, null, 2) + '\n');
process.exit(res.total_diferencas === 0 ? 0 : 2);
