// Operações git locais da governança. Trava 1: nunca push na branch principal.
import { spawnSync } from 'node:child_process';
import { ErroGov } from './erros.mjs';

export function git(cwd, args, { permitirFalha = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const res = { code: r.status ?? 1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  if (res.code !== 0 && !permitirFalha) throw new ErroGov('GIT_FALHOU', `git ${args.join(' ')} → ${res.err}`);
  return res;
}

export const ehRepo = (cwd) => git(cwd, ['rev-parse', '--is-inside-work-tree'], { permitirFalha: true }).out === 'true';

export function parseRemoto(url) {
  const m = String(url).match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function remotoOrigin(cwd) {
  const r = git(cwd, ['remote', 'get-url', 'origin'], { permitirFalha: true });
  return r.code === 0 ? parseRemoto(r.out) : null;
}

export const arvoreLimpa = (cwd) => git(cwd, ['status', '--porcelain']).out === '';

export const branchAtual = (cwd) => git(cwd, ['branch', '--show-current']).out;

export function branchExiste(cwd, nome) {
  if (git(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${nome}`], { permitirFalha: true }).code === 0) return true;
  return git(cwd, ['ls-remote', '--exit-code', '--heads', 'origin', nome], { permitirFalha: true }).code === 0;
}

export function pushBranch(cwd, branch, principal) {
  if (!branch || branch === principal) throw new ErroGov('TRAVA', `Push na branch principal (${principal}) é proibido.`);
  git(cwd, ['push', '-u', 'origin', `${branch}:${branch}`]);
}
