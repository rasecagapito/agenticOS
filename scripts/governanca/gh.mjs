// Executa o GitHub CLI. Testes: AGENTIC_OS_GH_FAKE=<script.mjs> roda o gh falso com o node;
// AGENTIC_OS_GH_BIN troca o executável (ex.: simular gh ausente). Nunca imprime token.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { ErroGov } from './erros.mjs';

// Trava fixa: o plugin nunca escreve em reviews nem faz merge/close/review de PR (só o analista assina).
const MUTACOES_PR = /addPullRequestReview|submitPullRequestReview|updatePullRequestReview|dismissPullRequestReview|deletePullRequestReview|mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest|closePullRequest|mergeBranch/i;

function metodoDe(args) {
  let metodo = null;
  let temCampo = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-X' || a === '--method') metodo = String(args[i + 1] || '');
    else if (a.startsWith('--method=')) metodo = a.slice(9);
    else if (/^-X./.test(a)) metodo = a.slice(2);
    else if (['-f', '-F', '--field', '--raw-field', '--input'].includes(a) || /^-[fF]./.test(a) || /^--(field|raw-field|input)=/.test(a)) temCampo = true;
  }
  return (metodo ?? (temCampo ? 'POST' : 'GET')).toUpperCase();
}

export function verificarChamada(args, input = '') {
  // Ignora flags globais antes do subcomando (-R/--repo e valor).
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-R' || a === '--repo') i++;
    else if (a.startsWith('--repo=') || /^-R./.test(a)) continue;
    else pos.push(a);
  }
  if (pos[0] === 'pr' && ['merge', 'review', 'close'].includes(pos[1]))
    throw new ErroGov('TRAVA', 'gh pr ' + pos[1] + ' é proibido pela governança.');
  if (pos[0] !== 'api') return;
  const linha = args.join(' ');
  if (/pulls\/\d+\/(reviews|merge)|repos\/[^/\s]+\/[^/\s]+\/merges/.test(linha) && metodoDe(args) !== 'GET')
    throw new ErroGov('TRAVA', 'Escrever em reviews ou merge de PR é proibido pela governança.');
  if (args.includes('graphql')) {
    let texto = linha + '\n' + (input || '');
    const arquivos = [];
    for (let i = 0; i < args.length; i++) {
      const x = args[i];
      let v = null;
      if (['-f', '-F', '--field', '--raw-field'].includes(x)) v = args[i + 1];
      else if (/^-[fF]./.test(x)) v = x.slice(2);
      else if (/^--(field|raw-field)=/.test(x)) v = x.slice(x.indexOf('=') + 1);
      const m = String(v || '').match(/=@(.+)$/);
      if (m) arquivos.push(m[1]);
      if (x === '--input' && args[i + 1] && args[i + 1] !== '-') arquivos.push(args[i + 1]);
      else if (x.startsWith('--input=')) arquivos.push(x.slice(8));
    }
    for (const arq of arquivos) {
      try {
        texto += fs.readFileSync(arq, 'utf8');
      } catch {}
    }
    if (MUTACOES_PR.test(texto)) throw new ErroGov('TRAVA', 'Mutation GraphQL de review/merge/close de PR é proibida pela governança.');
  }
}

// Token do agente (identidade separada): só em memória deste processo. null = login do gh local.
let tokenAgente = null;
let expira = 0;
let renovar = null;
export function usarTokenAgente(token, { expiraEm = 0, renovador = null } = {}) {
  tokenAgente = token || null;
  expira = expiraEm;
  renovar = renovador;
}
export const tokenAgenteAtual = () => tokenAgente;

export function gh(args, { input, permitirFalha = false, token } = {}) {
  verificarChamada(args, input);
  if (token === undefined && tokenAgente && renovar && expira && expira - Date.now() < 5 * 60000) {
    const n = renovar();
    tokenAgente = n.token;
    expira = n.expira;
  }
  const t = token !== undefined ? token : tokenAgente;
  const esconder = (s) => [t, tokenAgente].filter(Boolean).reduce((a, x) => a.split(x).join('***'), String(s ?? ''));
  const fake = process.env.AGENTIC_OS_GH_FAKE;
  const bin = fake ? process.execPath : process.env.AGENTIC_OS_GH_BIN || 'gh';
  const argv = fake ? [fake, ...args] : args;
  const r = spawnSync(bin, argv, {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', ...(t ? { GH_TOKEN: t } : {}) },
  });
  if (r.error?.code === 'ENOENT') throw new ErroGov('GH_AUSENTE');
  const saida = { code: r.status ?? 1, stdout: r.stdout || '', stderr: esconder(r.stderr || '') };
  if (saida.code !== 0 && !permitirFalha) throw classificar({ ...saida, stdout: esconder(saida.stdout) }, args.map(esconder));
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
  if (/Upgrade to GitHub Pro|make this repository public|billing plan supports/i.test(t)) return new ErroGov('PLANO_SEM_PROTECAO');
  if (/could not resolve host|no such host|dial tcp|connection refused|EAI_AGAIN|ECONNRESET|i\/o timeout|HTTP 50\d/i.test(t)) return new ErroGov('REDE');
  return new ErroGov('GH_FALHOU', `gh ${args.join(' ')} → ${t.trim().slice(0, 300)}`);
}
