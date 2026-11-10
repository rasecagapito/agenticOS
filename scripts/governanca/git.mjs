// Operações git locais da governança. Trava 1: nunca push na branch principal.
import { spawnSync } from 'node:child_process';
import { ErroGov } from './erros.mjs';
import { tokenAgenteAtual } from './gh.mjs';

// Credencial do agente só no ambiente do comando (nunca em .git/config nem na linha de comando).
export function envPush(token) {
  if (!token) return {};
  const b = Buffer.from(`x-access-token:${token}`).toString('base64');
  return { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${b}` };
}

// Todo comando que fala com o remoto usa a credencial do agente (se houver); os locais, não.
const REMOTOS = new Set(['push', 'fetch', 'ls-remote', 'pull']);
export const envGit = (args) => (REMOTOS.has(args[0]) ? envPush(tokenAgenteAtual()) : {});

// Com identidade do agente, o origin precisa ser https (o cabeçalho de credencial não vale em SSH:
// o push sairia com a chave SSH do usuário).
export function exigirRemotoHttps(cwd) {
  const urls = [
    ...git(cwd, ['remote', 'get-url', 'origin'], { permitirFalha: true }).out.split('\n'),
    ...git(cwd, ['remote', 'get-url', '--push', '--all', 'origin'], { permitirFalha: true }).out.split('\n'),
  ].map((u) => u.trim()).filter(Boolean);
  const ruim = urls.find((u) => !/^https:\/\/github\.com\//i.test(u));
  if (ruim)
    throw new ErroGov('REMOTO_SSH', `O remoto é ${ruim.replace(/\/\/[^@/]*@/, '//')}; com identidade do agente o origin (fetch e push) precisa ser https em github.com.`);
}

export function git(cwd, args, { permitirFalha = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -o BatchMode=yes', ...envGit(args) }, timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
  const res = { code: r.status ?? 1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  if (res.code !== 0 && !permitirFalha) throw new ErroGov('GIT_FALHOU', `git ${args.join(' ')} → ${res.err}`);
  return res;
}

export const ehRepo = (cwd) => git(cwd, ['rev-parse', '--is-inside-work-tree'], { permitirFalha: true }).out === 'true';

export function parseRemoto(url) {
  const m = String(url).match(/(?:^|[/@])github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
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
