// Runner do B1: roda um comando de shell com limite de tempo e, no estouro, mata a ÁRVORE de processos
// (spawnSync com shell mataria só o shell no Windows e deixaria netos órfãos).
// Uso: node rodar-comando.mjs "<comando>" <limite_ms>. Estouro: sai com 124 e escreve o marcador em stderr.
import { spawn, spawnSync } from 'node:child_process';

export const MARCADOR_TEMPO = '__AGENTIC_OS_TEMPO_ESGOTADO__';
export const CODIGO_TEMPO = 124;

const [comando, limite] = process.argv.slice(2);
const win = process.platform === 'win32';
const filho = spawn(comando, { shell: true, detached: !win, stdio: ['ignore', 'pipe', 'pipe'] });
filho.stdout.pipe(process.stdout, { end: false });
filho.stderr.pipe(process.stderr, { end: false });

let estourou = false;
const timer = setTimeout(() => {
  estourou = true;
  try {
    if (win) spawnSync('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-filho.pid, 'SIGKILL');
  } catch {
    /* já terminou */
  }
  process.stderr.write(`\n${MARCADOR_TEMPO}\n`, () => process.exit(CODIGO_TEMPO));
}, Number(limite) || 600000);

filho.on('error', (e) => {
  clearTimeout(timer);
  process.stderr.write(`erro ao iniciar: ${e.message}\n`, () => process.exit(1));
});
filho.on('close', (code) => {
  if (estourou) return;
  clearTimeout(timer);
  process.exitCode = code ?? 1;
  process.stdout.write('', () => process.stderr.write('', () => process.exit(code ?? 1)));
});
