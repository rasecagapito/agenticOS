#!/usr/bin/env node
// Hook UserPromptSubmit: classifica o pedido (Jev) → decide o tier → registra → injeta instrução.
// Qualquer falha do classificador cai no fallback_tier (padrão: o mais forte). Nunca bloqueia o prompt.
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { decide, isBypass, matchContinuacao, matchRule, parseOverride } from './decide.mjs';
import { appendLog, loadConfig, previousDecision, projectSummary, runStateCommand, summaryMaxChars } from './lib.mjs';

const readStdin = () =>
  new Promise((resolve) => {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
  });

const RISCO = {
  type: 'noul',
  instructions: 'Implementar o `pedido` tem risco de quebrar algo que já funciona no `projeto`?',
  criteria: {
    true: 'Toca código compartilhado, dados, autenticação, contratos de API ou fluxos já em uso.',
    false: 'Alteração isolada ou aditiva, sem efeito em comportamento existente.',
  },
};

// Instrução da Choice no modo jev. Sem `instructions_choice` no config = texto da v1.6.0.
export const LEGACY_INSTRUCTIONS =
  'Qual executor deve fazer o `pedido` no `projeto` descrito? Pese complexidade e risco de ' +
  'quebrar algo que já funciona; na dúvida, prefira o mais capaz.';
const RESERVED = new Set(['subagente', 'nivel', 'risco']);

// Acrescenta o texto de contexto (pedido anterior) a uma instrução string | objeto | array.
function withCtx(instr, ctx) {
  if (!ctx) return instr;
  if (typeof instr === 'string') return instr + ctx;
  if (Array.isArray(instr)) return [...instr, ctx.trim()];
  if (instr && typeof instr === 'object') return [instr, ctx.trim()];
  return LEGACY_INSTRUCTIONS + ctx;
}

// Monta as perguntas conforme o modo. "jev": o Jev escolhe o subagente; "regras": o Jev só classifica.
// agent_criteria por agente: string ou objeto { definicao, exemplos[], exclusoes[] } (vai como objeto).
// extra_questions: { id: question } enviadas junto; risk_question: false remove a pergunta `risco`.
export function buildQuestions(cfg, temAnterior) {
  const ctx = temAnterior
    ? ' Se o `pedido` for só confirmação ou continuação (ex.: "sim", "pode seguir", "opção 2"), ' +
      'ele se refere à `anterior`: avalie a tarefa em andamento, não só a frase.'
    : '';
  const q = {};
  if ((cfg.decision_mode || 'jev') === 'jev') {
    const criteria = {};
    for (const t of cfg.tiers) {
      criteria[t.agent] = cfg.agent_criteria?.[t.agent] || `Nível ${t.id} (${t.model_label}).`;
    }
    q.subagente = {
      type: 'choice',
      instructions: withCtx(cfg.instructions_choice ?? LEGACY_INSTRUCTIONS, ctx),
      criteria,
    };
  } else {
    q.nivel = {
      type: 'choice',
      instructions: 'Qual o nível de complexidade para implementar o `pedido` dentro do `projeto` descrito?' + ctx,
      criteria: cfg.levels,
    };
  }
  if (cfg.risk_question !== false) q.risco = RISCO;
  const extra = cfg.extra_questions && typeof cfg.extra_questions === 'object' ? cfg.extra_questions : {};
  for (const [id, question] of Object.entries(extra)) {
    if (!RESERVED.has(id) && question && typeof question === 'object') q[id] = question;
  }
  return q;
}

// State enviado ao Jev: objeto com campos nomeados, só o relevante.
// { pedido, anterior?, dominio?, projeto? (max_chars > 0), situacao? (state_command) }
export function buildState(cfg, pedido, anterior = null, situacao = null) {
  const state = { pedido };
  if (anterior) state.anterior = anterior;
  if (typeof cfg.domain_summary === 'string' && cfg.domain_summary.trim()) state.dominio = cfg.domain_summary.trim();
  const max = summaryMaxChars(cfg);
  if (max > 0) state.projeto = projectSummary(cfg, max);
  if (situacao) state.situacao = situacao;
  return state;
}

// Resumo compacto das respostas extras para o log.
function compactAnswer(a) {
  if (!a || typeof a !== 'object') return null;
  if (typeof a.noul === 'number') return a.noul;
  if (a.choice != null) return { choice: a.choice, confidence: a.confidence ?? null };
  if (typeof a.score === 'number') return a.score;
  return a;
}

export async function classify(cfg, pedido, anterior = null, situacao = null) {
  const c = cfg.classifier;
  const key = process.env[c.api_key_env];
  if (!key) throw new Error(`sem ${c.api_key_env}`);
  const state = buildState(cfg, pedido, anterior, situacao);
  const questions = buildQuestions(cfg, !!anterior);
  const body = { model: c.model, state, questions };
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
    const r = j.answers?.risco?.noul ?? null;
    const extras = {};
    for (const id of Object.keys(questions)) {
      if (!RESERVED.has(id) && j.answers?.[id]) extras[id] = j.answers[id];
    }
    const ex = Object.keys(extras).length ? { extras } : {};
    const s = j.answers?.subagente;
    if (s) {
      if (!s.choice) throw new Error('resposta sem subagente');
      const probabilidades = s.probabilities && Object.keys(s.probabilities).length ? { probabilidades: s.probabilities } : {};
      return { escolha: s.choice, confianca: s.confidence ?? null, ...probabilidades, risco: r, ...ex };
    }
    const n = j.answers?.nivel;
    if (!n?.choice) throw new Error('resposta sem nivel');
    return { nivel: n.choice, confianca: n.confidence ?? null, risco: r, ...ex };
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
      ? `${cls.escolha != null ? `jev escolheu=${cls.escolha}` : `nível=${cls.nivel}`} conf=${f(cls.confianca)} risco=${f(cls.risco)}`
      : d.origem === 'override'
        ? 'nível escolhido pelo usuário'
        : d.origem.startsWith('regra:')
          ? `${d.origem} (sem Jev)`
          : d.origem === 'continuacao'
            ? 'continuação da tarefa anterior (sem Jev)'
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
  // Ordem: override → rules → continuação → Jev (+ policy, escalate_on). Rules/continuação não chamam o Jev.
  const regra = ov ? null : matchRule(cfg, pedido);
  const prev =
    ov || regra || (cfg.context_previous === false && !cfg.continuacao) ? null : previousDecision(input.session_id);
  const cont = ov || regra ? null : matchContinuacao(cfg, pedido, prev);
  const semJev = !!(ov || regra || cont);
  let cls = null;
  let erro = null;
  let stateErro;
  const t0 = Date.now();
  if (!semJev) {
    try {
      let situacao = null;
      if (cfg.state_command) {
        const r = await runStateCommand(cfg.state_command);
        if (r?.situacao) situacao = r.situacao;
        else if (r?.erro) stateErro = r.erro;
      }
      const anterior = cfg.context_previous === false ? null : prev;
      cls = await classify(cfg, pedido, anterior, situacao);
    } catch (e) {
      erro = e.message;
    }
  }
  const jev_ms = semJev ? 0 : Date.now() - t0;
  const d = decide(cfg, cls, { override: ov ? ov.tierIndex : null, regra, continuacao: cont, erro });

  const n = cfg.preview_chars ?? 80;
  const extras = cls?.extras
    ? Object.fromEntries(Object.entries(cls.extras).map(([k, v]) => [k, compactAnswer(v)]))
    : undefined;
  appendLog({
    ts: new Date().toISOString(),
    tipo: 'decisao',
    sessao: input.session_id || null,
    preview: n > 0 ? pedido.slice(0, n).replace(/\s+/g, ' ') : undefined,
    sha1: crypto.createHash('sha1').update(pedido).digest('hex').slice(0, 12),
    modo: semJev ? undefined : cfg.decision_mode || 'jev',
    politica: cls?.escolha != null && cfg.policy?.type ? cfg.policy.type : undefined,
    nivel: cls?.nivel ?? null,
    escolha_jev: cls?.escolha ?? undefined,
    confianca: cls?.confianca ?? null,
    probabilidades: cls?.probabilidades ?? undefined,
    risco: cls?.risco ?? null,
    extras,
    state_command_falhou: stateErro,
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
