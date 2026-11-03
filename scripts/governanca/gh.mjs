// Executa o GitHub CLI. Testes: AGENTIC_OS_GH_FAKE=<script.mjs> roda o gh falso com o node;
// AGENTIC_OS_GH_BIN troca o executável (ex.: simular gh ausente). Nunca imprime token.
import { spawnSync } from 'node:child_process';
import { ErroGov } from './erros.mjs';

export function gh(args, { input, permitirFalha = false } = {}) {
  const fake = process.env.AGENTIC_OS_GH_FAKE;
  const bin = fake ? process.execPath : process.env.AGENTIC_OS_GH_BIN || 'gh';
  const argv = fake ? [fake, ...args] : args;
  const r = spawnSync(bin, argv, {
    input,
    encoding: 'utf8',
    env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
  });
  if (r.error?.code === 'ENOENT') throw new ErroGov('GH_AUSENTE');
  const saida = { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
  if (saida.code !== 0 && !permitirFalha) throw classificar(saida, args);
  return saida;
}

export function ghJson(args, opts) {
  const { stdout } = gh(args, opts);
  return stdout.trim() ? JSON.parse(stdout) : null;
}

export function classificar({ stdout = '', stderr = '' }, args = []) {
  const t = `${stderr}\n${stdout}`;
  if (/not logged in|gh auth login/i.test(t)) return new ErroGov('GH_DESLOGADO');
  if (/INSUFFICIENT_SCOPES|required scopes?.*project|missing required scope/i.test(t)) return new ErroGov('SEM_ESCOPO_PROJECT');
  if (/Upgrade to GitHub Pro|make this repository public/i.test(t)) return new ErroGov('PLANO_SEM_PROTECAO');
  if (/could not resolve host|timed? ?out|ECONNRESET|HTTP 50\d/i.test(t)) return new ErroGov('REDE');
  return new ErroGov('GH_FALHOU', `gh ${args.join(' ')} → ${t.trim().slice(0, 300)}`);
}
