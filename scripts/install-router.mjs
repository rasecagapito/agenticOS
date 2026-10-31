#!/usr/bin/env node
// Instala/atualiza o Roteador de Modelos (template/E-roteador) num projeto. Idempotente.
// Uso: node scripts/install-router.mjs <pasta-do-projeto> [--dry-run]
//  - Sobrescreve código do plugin (scripts do roteador, procedimento, agentes gerados, comando).
//  - Preserva config.json local (só acrescenta chaves novas) e decisions.jsonl.
//  - Faz merge de .claude/settings.json (model + hook) e .claude/settings.local.json (statusLine),
//    sem apagar hooks/permissões existentes. Upsert do bloco do roteador no CLAUDE.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'template', 'E-roteador');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const DEST = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
const VERSION = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const START = '<!-- agentic-os:router:start';
const END = '<!-- agentic-os:router:end -->';
const log = [];
const note = (m) => log.push(m);

const readJson = (f, dflt) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return dflt;
  }
};
function write(rel, content) {
  const f = path.join(DEST, rel);
  const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (old === content) return;
  note(`${old == null ? 'criado' : 'atualizado'}: ${rel}`);
  if (DRY) return;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content, 'utf8');
}
const copy = (rel) => write(rel, fs.readFileSync(path.join(SRC, rel), 'utf8'));

if (!fs.existsSync(DEST) || !fs.statSync(DEST).isDirectory()) {
  console.error(`Pasta do projeto não existe: ${DEST}`);
  process.exit(1);
}

// 1. Código do plugin (sempre sobrescreve)
for (const f of fs.readdirSync(path.join(SRC, '.claude', 'router'))) {
  if (f === 'config.json' || f === 'decisions.jsonl') continue;
  copy(path.join('.claude', 'router', f));
}
copy(path.join('automation', 'procedures', 'route.md'));
copy(path.join('.claude', 'commands', 'router-update.md'));
write(path.join('.claude', 'router', 'VERSION'), VERSION + '\n');

// 2. config.json: preserva o local, só acrescenta chaves novas do template
const tplCfg = readJson(path.join(SRC, '.claude', 'router', 'config.json'), {});
const cfgRel = path.join('.claude', 'router', 'config.json');
const localCfg = readJson(path.join(DEST, cfgRel), null);
// Chaves da v1.7 que mudam o comportamento: só entram em instalações novas. Num config existente
// ficam de fora (ausentes = comportamento da v1.6.0); o usuário ativa quando quiser (docs/ROUTER.md).
const OPT_IN = [
  'instructions_choice',
  'policy',
  'rules',
  'continuacao',
  'extra_questions',
  'escalate_on',
  'risk_question',
  'state_project_summary_max_chars',
  'domain_summary',
  'state_command',
];
const tplBase = localCfg ? Object.fromEntries(Object.entries(tplCfg).filter(([k]) => !OPT_IN.includes(k))) : tplCfg;
const merged = localCfg ? { ...tplBase, ...localCfg } : tplCfg;
const added = localCfg ? Object.keys(tplBase).filter((k) => !(k in localCfg)) : [];
if (added.length) note(`config.json: chaves novas ${added.join(', ')}`);
const optional = localCfg ? OPT_IN.filter((k) => k in tplCfg && !(k in localCfg)) : [];
if (optional.length) note(`config.json: opcionais da v1.7 não ativadas (ver docs/ROUTER.md): ${optional.join(', ')}`);
write(cfgRel, JSON.stringify(merged, null, 2) + '\n');

// 3. Agentes gerados do config do projeto (fonte única agent-body.md)
if (!DRY) {
  const r = spawnSync(process.execPath, [path.join(DEST, '.claude', 'router', 'emit-agents.mjs')], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  note(`agentes: ${merged.tiers.map((t) => `${t.agent}(${t.model})`).join(', ')}`);
} else note(`agentes (dry-run): ${merged.tiers.map((t) => t.agent).join(', ')}`);

// 4. settings.json (compartilhado): sessão principal em haiku + hook UserPromptSubmit
const setRel = path.join('.claude', 'settings.json');
const settings = readJson(path.join(DEST, setRel), {});
const recepcao = merged.tiers[0].model;
if (settings.model !== recepcao) {
  note(`settings.json: model ${settings.model ?? '(padrão)'} → ${recepcao} (sessão principal = recepção)`);
  settings.model = recepcao;
}
settings.hooks ??= {};
settings.hooks.UserPromptSubmit ??= [];
const hasHook = JSON.stringify(settings.hooks.UserPromptSubmit).includes('router/route.mjs');
if (!hasHook) {
  settings.hooks.UserPromptSubmit.push({
    hooks: [
      {
        type: 'command',
        command: 'node',
        args: ['${CLAUDE_PROJECT_DIR}/.claude/router/route.mjs'],
        timeout: 10,
      },
    ],
  });
}
write(setRel, JSON.stringify(settings, null, 2) + '\n');

// 5. settings.local.json (máquina): statusLine com caminho absoluto (barras normais p/ Git Bash)
const locRel = path.join('.claude', 'settings.local.json');
const local = readJson(path.join(DEST, locRel), {});
const shared = settings.statusLine?.command;
const slCmd = `node "${path.join(DEST, '.claude', 'router', 'statusline.mjs').replace(/\\/g, '/')}"`;
if (shared && !shared.includes('router/statusline.mjs')) {
  note(`statusLine: projeto já tem uma própria em settings.json — mantida. Para o indicador, use: ${slCmd}`);
} else if (local.statusLine?.command && !local.statusLine.command.includes('router/statusline.mjs')) {
  note(`statusLine: settings.local.json já tem uma própria — mantida. Para o indicador, use: ${slCmd}`);
} else {
  local.statusLine = { type: 'command', command: slCmd };
  write(locRel, JSON.stringify(local, null, 2) + '\n');
}

// 6. CLAUDE.md: upsert do bloco do roteador entre marcadores
const block = fs.readFileSync(path.join(SRC, 'CLAUDE.router.md'), 'utf8').trim();
const cmdPath = path.join(DEST, 'CLAUDE.md');
let brain = fs.existsSync(cmdPath) ? fs.readFileSync(cmdPath, 'utf8') : '';
const s = brain.indexOf(START);
const e = brain.indexOf(END);
brain =
  s !== -1 && e !== -1
    ? brain.slice(0, s) + block + brain.slice(e + END.length)
    : (brain.trimEnd() ? brain.trimEnd() + '\n\n' : '') + block + '\n';
write('CLAUDE.md', brain);

// 7. .gitignore: log é local
const giRel = '.gitignore';
const gi = fs.existsSync(path.join(DEST, giRel)) ? fs.readFileSync(path.join(DEST, giRel), 'utf8') : '';
if (!gi.includes('.claude/router/decisions.jsonl')) {
  write(giRel, (gi.trimEnd() ? gi.trimEnd() + '\n\n' : '') + '# Roteador de modelos (log local)\n.claude/router/decisions.jsonl\n');
}

console.log(`Roteador de modelos v${VERSION} ${DRY ? '(dry-run) ' : ''}→ ${DEST}`);
console.log(log.length ? log.map((l) => '  - ' + l).join('\n') : '  - nada a mudar (já atualizado)');
// Chave do Jev: cada pessoa usa a sua (variável de ambiente; nunca em arquivo do projeto).
const KEY_URL = 'https://console.typesafe.ai/keys';
const keyEnv = merged.classifier?.api_key_env || 'TYPESAFE_API_KEY';
const semChaveId = merged.fallback_sem_chave || merged.fallback_tier;
const semChaveTier = merged.tiers?.find((t) => t.id === semChaveId || t.agent === semChaveId);
const semChave = semChaveTier ? `${semChaveTier.agent} (${semChaveTier.model_label})` : semChaveId;
const comoDefinir = () => {
  console.log(`  1. Obtenha sua chave em ${KEY_URL}`);
  console.log(`  2. Windows: setx ${keyEnv} "<sua-chave>"   |   macOS/Linux: export ${keyEnv}=<sua-chave>`);
  console.log('  3. Reabra o terminal e o editor (variáveis novas só valem em processos novos).');
};
if (!process.env[keyEnv]) {
  console.log(`\nAtenção: ${keyEnv} não definida. Sem ela todo pedido vai para ${semChave} e o Claude avisa uma vez por sessão.`);
  comoDefinir();
} else if (!DRY && !args.includes('--no-key-check')) {
  // Chamada mínima ao classificador para validar a chave (custo desprezível; desligue com --no-key-check).
  const r = await checkKey(merged.classifier, process.env[keyEnv]);
  if (r === 'ok') console.log(`\nChave do Jev (${keyEnv}): OK.`);
  else if (r === 'recusada') {
    console.log(`\nAtenção: a chave em ${keyEnv} foi RECUSADA pelo Jev. Pedidos irão para ${semChave} até corrigir.`);
    comoDefinir();
  } else console.log(`\nNão foi possível testar a chave agora (${r}). O roteador tenta de novo a cada pedido.`);
}
console.log('Reinicie o Claude Code no projeto para carregar hook, agentes e statusline.');

async function checkKey(c, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), c?.timeout_ms || 5000);
  try {
    const res = await fetch(c.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: c.model,
        state: 'teste de chave do instalador',
        questions: { ok: { type: 'noul', instructions: 'Este texto é um teste?' } },
      }),
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) return 'recusada';
    return res.ok ? 'ok' : `HTTP ${res.status}`;
  } catch (e) {
    return e.name === 'AbortError' ? 'timeout' : 'sem conexão';
  } finally {
    clearTimeout(timer);
  }
}
