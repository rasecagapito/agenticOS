// Identidade do agente no GitHub, por projeto (ficha.identidade_agente).
// nenhuma = login do gh local · token = token pronto numa variável de ambiente · app = token de instalação de um GitHub App.
// O token fica só em memória (gh.mjs); nunca em ficha, log, estado ou .git/config.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson, usarTokenAgente } from './gh.mjs';

export const PADRAO = { modo: 'nenhuma', token_env: 'AGENTIC_OS_GH_TOKEN', app_id: null, chave_privada_env: 'AGENTIC_OS_APP_KEY_PATH' };
export const identidadeDe = (ficha) => ({ ...PADRAO, ...(ficha?.identidade_agente || {}) });

let atual = null; // { modo, login }

export function desativarIdentidade() {
  usarTokenAgente(null);
  atual = null;
}

export function ativarIdentidade(ficha) {
  const ia = identidadeDe(ficha);
  if (ia.modo === 'token') {
    const token = String(process.env[ia.token_env] || '').trim();
    if (!token) throw new ErroGov('TOKEN_AUSENTE', `Variável ${ia.token_env} vazia.`);
    usarTokenAgente(token);
    atual = { modo: 'token', login: ghJson(['api', 'user'])?.login || null };
    return atual;
  }
  if (ia.modo === 'app') return ativarApp(ficha, ia);
  usarTokenAgente(null);
  atual = { modo: 'nenhuma', login: null };
  return atual;
}

// Login de quem age como agente. No modo nenhuma, pergunta ao gh local a cada vez (sem cache entre testes/projetos).
export function loginAgente() {
  if (atual && atual.modo !== 'nenhuma' && atual.login) return atual.login;
  return ghJson(['api', 'user'])?.login || null;
}

export const modoAtivo = () => atual?.modo || 'nenhuma';

export function exigirSeparacao(ficha) {
  const login = loginAgente();
  const igual = (ficha.analistas || []).some((a) => String(a).toLowerCase() === String(login || '').toLowerCase());
  if (igual && ficha.aprovacao_pelo_chat !== true)
    throw new ErroGov('IDENTIDADE_IGUAL_ANALISTA', `O agente age como "${login}", que está em analistas.`);
  return { login, igual };
}

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function jwtApp(appId, pem, agoraMs = Date.now()) {
  const s = Math.floor(agoraMs / 1000);
  const corpo = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iat: s - 60, exp: s + 540, iss: String(appId) }))}`;
  let assinatura;
  try {
    assinatura = crypto.sign('RSA-SHA256', Buffer.from(corpo), pem);
  } catch {
    throw new ErroGov('APP_CHAVE_INVALIDA', 'A chave privada não assina (formato .pem inválido).');
  }
  return `${corpo}.${b64url(assinatura)}`;
}

function lerChave(ia) {
  const caminho = String(process.env[ia.chave_privada_env] || '').trim();
  if (!caminho) throw new ErroGov('APP_CHAVE_INVALIDA', `Variável ${ia.chave_privada_env} vazia.`);
  try {
    return fs.readFileSync(caminho, 'utf8');
  } catch {
    throw new ErroGov('APP_CHAVE_INVALIDA', `Não consegui ler a chave indicada por ${ia.chave_privada_env}.`);
  }
}

function emitir(ficha, ia, pem) {
  const jwt = jwtApp(ia.app_id, pem);
  const H = ['-H', `Authorization: Bearer ${jwt}`];
  const inst = gh(['api', ...H, `repos/${ficha.repo}/installation`], { token: jwt, permitirFalha: true });
  if (inst.code !== 0) {
    const t = `${inst.stderr}\n${inst.stdout}`;
    if (/404|Not Found/i.test(t)) throw new ErroGov('APP_NAO_INSTALADO', `O App ${ia.app_id} não está instalado em ${ficha.repo}.`);
    if (/401|JSON web token|Bad credentials|Integration not found/i.test(t)) throw new ErroGov('APP_CHAVE_INVALIDA', 'O GitHub recusou a assinatura do App (app_id ou chave errada).');
    throw new ErroGov('GH_FALHOU', `instalação do App → ${t.trim().slice(0, 300)}`);
  }
  const id = JSON.parse(inst.stdout).id;
  const r = ghJson(['api', '-X', 'POST', ...H, `app/installations/${id}/access_tokens`], { token: jwt });
  return { token: r.token, expira: Date.parse(r.expires_at) || Date.now() + 3600000, jwt };
}

function ativarApp(ficha, ia) {
  const pem = lerChave(ia);
  const e = emitir(ficha, ia, pem);
  const slug = ghJson(['api', '-H', `Authorization: Bearer ${e.jwt}`, 'app'], { token: e.jwt })?.slug;
  usarTokenAgente(e.token, {
    expiraEm: e.expira,
    renovador: () => {
      const n = emitir(ficha, ia, pem);
      return { token: n.token, expira: n.expira };
    },
  });
  atual = { modo: 'app', login: slug ? `${slug}[bot]` : null };
  return atual;
}
