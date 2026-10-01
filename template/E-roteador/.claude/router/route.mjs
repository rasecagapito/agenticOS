#!/usr/bin/env node
// Hook UserPromptSubmit: classifica o pedido (Jev) → decide o tier → registra → injeta instrução.
// Qualquer falha do classificador cai no fallback_tier (padrão: o mais forte). Nunca bloqueia o prompt.
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { decide, isBypass, parseOverride } from './decide.mjs';
import { appendLog, loadConfig, projectSummary } from './lib.mjs';

const readStdin = () =>
  new Promise((resolve) => {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
  });

export async function classify(cfg, pedido) {
  const c = cfg.classifier;
  const key = process.env[c.api_key_env];
  if (!key) throw new Error(`sem ${c.api_key_env}`);
  const body = {
    model: c.model,
    state: { pedido, projeto: projectSummary(cfg) },
    questions: {
      nivel: {
        type: 'choice',
        instructions:
          'Qual o nível de complexidade para implementar o `pedido` dentro do `projeto` descrito?',
        criteria: cfg.levels,
      },
      risco: {
        type: 'noul',
        instructions:
          'Implementar o `pedido` tem risco de quebrar algo que já funciona no `projeto`?',
        criteria: {
          true: 'Toca código compartilhado, dados, autenticação, contratos de API ou fluxos já em uso.',
          false: 'Alteração isolada ou aditiva, sem efeito em comportamento existente.',
        },
      },
    },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), c.timeout_ms || 5000);
  try {
    const res = await fetch(c.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const n = j.answers?.nivel;
    const r = j.answers?.risco;
    if (!n?.choice) throw new Error('resposta sem nivel');
    return { nivel: n.choice, confianca: n.confidence ?? null, risco: r?.noul ?? null };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `timeout ${c.timeout_ms}ms` : e.message);
  } finally {
    clearTimeout(timer);
  }
}

export function contextLine(d, cls) {
  const f = (n) => (n == null ? '?' : n.toFixed(2));
  const head =
    d.origem === 'jev'
      ? `nível=${cls.nivel} conf=${f(cls.confianca)} risco=${f(cls.risco)}`
      : d.origem === 'override'
        ? 'nível escolhido pelo usuário'
        : 'classificador indisponível';
  return (
    `ROTEADOR: ${head} → delegar a subagent_type="${d.subagente}" (${d.modelo}). ` +
    `Motivo: ${d.justificativa}. Siga automation/procedures/route.md: delegue via Agent tool, ` +
    `não execute o trabalho diretamente e responda só com o resumo do subagente.`
  );
}

async function main() {
  const cfg = loadConfig();
  if (!cfg) return;
  let input = {};
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return;
  }
  const prompt = String(input.prompt || '');
  if (!prompt.trim() || isBypass(prompt, cfg.bypass_prefixes)) return;

  const ov = parseOverride(prompt, cfg.tiers, cfg.override_prefix);
  const pedido = ov ? ov.prompt : prompt;
  let cls = null;
  let erro = null;
  const t0 = Date.now();
  if (!ov) {
    try {
      cls = await classify(cfg, pedido);
    } catch (e) {
      erro = e.message;
    }
  }
  const jev_ms = ov ? 0 : Date.now() - t0;
  const d = decide(cfg, cls, { override: ov ? ov.tierIndex : null, erro });

  const n = cfg.preview_chars ?? 80;
  appendLog({
    ts: new Date().toISOString(),
    tipo: 'decisao',
    sessao: input.session_id || null,
    preview: n > 0 ? pedido.slice(0, n).replace(/\s+/g, ' ') : undefined,
    sha1: crypto.createHash('sha1').update(pedido).digest('hex').slice(0, 12),
    nivel: cls?.nivel ?? null,
    confianca: cls?.confianca ?? null,
    risco: cls?.risco ?? null,
    origem: d.origem,
    tier: d.tier,
    subagente: d.subagente,
    modelo: d.modelo,
    justificativa: d.justificativa,
    jev_ms,
    erro: erro || undefined,
  });

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: contextLine(d, cls) },
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => process.exit(0));
}
