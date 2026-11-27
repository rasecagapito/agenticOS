// Requisições HTTP síncronas via stdin para o subprocesso Node (nunca expõe bearer/JWT em argv ou env).
import { spawnSync } from 'node:child_process';
import { ErroGov } from './erros.mjs';

const WORKER = `
const fs = require('node:fs');
const req = JSON.parse(fs.readFileSync(0, 'utf8'));
(async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs || 15000);
  try {
    const res = await fetch(req.url, {
      method: req.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + req.bearer,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'agentic-os',
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    process.stdout.write(JSON.stringify({ ok: res.ok, status: res.status, text }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, status: 0, text: e.name === 'AbortError' ? 'timeout' : (e.message || 'fetch failed') }));
  } finally {
    clearTimeout(timer);
  }
})();
`;

export function githubAppRequest({ endpoint, method = 'GET', bearer, timeoutMs = 15000 }) {
  const base = (process.env.AGENTIC_OS_GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const url = `${base}/${String(endpoint).replace(/^\/+/, '')}`;
  const r = spawnSync(process.execPath, ['-e', WORKER], {
    input: JSON.stringify({ url, method, bearer, timeoutMs }),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new ErroGov('REDE', `Falha ao consultar GitHub App: ${r.error.message}`);
  let res;
  try {
    res = JSON.parse((r.stdout || '').trim());
  } catch {
    throw new ErroGov('GH_FALHOU', `Resposta inválida ao autenticar GitHub App: ${(r.stderr || r.stdout || '').slice(0, 200)}`);
  }
  if (res.status === 0) throw new ErroGov('REDE', `Falha de rede ao autenticar GitHub App: ${res.text}`);
  return res;
}
