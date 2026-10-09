// Lógica pura de roteamento — sem I/O, testável (scripts/tests/router.test.mjs).
// O classificador (Jev) só opina; quem decide o nível é este código.
//
// Ordem de decisão (route.mjs): bypass → override → rules → continuação → Jev + policy
// → escalate_on (só eleva o piso) → teto. Sem as chaves da v1.7, o resultado é o da v1.6.0.

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Índice do tier inicial a partir da classe devolvida pelo classificador.
export function baseIndex(tiers, nivel) {
  const i = tiers.findIndex((t) => t.nivel === nivel);
  return i === -1 ? tiers.length - 1 : i; // classe desconhecida → mais forte
}

// Índice de um tier por id ou agente (-1 se não existir).
export function tierIndex(tiers, ref) {
  if (ref == null) return -1;
  const r = strip(String(ref));
  return tiers.findIndex((t) => strip(t.id) === r || strip(t.agent) === r);
}

// Override explícito do usuário: "nivel:avancado <pedido>".
// Retorna { tierIndex, prompt } ou null.
export function parseOverride(prompt, tiers, prefix = 'nivel:') {
  const m = strip(prompt.trimStart()).match(new RegExp('^' + prefix + '([a-z]+)\\b'));
  if (!m) return null;
  const i = tiers.findIndex((t) => strip(t.id) === m[1] || strip(t.agent) === m[1]);
  if (i === -1) return null;
  const rest = prompt.trimStart().slice(prefix.length + m[1].length).trimStart();
  return { tierIndex: i, prompt: rest };
}

// Mensagens que o próprio Claude Code injeta como prompt (ex.: aviso de subagente em segundo
// plano concluído) — nunca são pedidos do usuário, logo nunca são roteadas.
const SYSTEM_PREFIXES = ['<task-notification>', '<command-name>', '<command-message>', '<local-command-'];

export function isBypass(prompt, prefixes = ['!', '/']) {
  const p = prompt.trimStart();
  return [...SYSTEM_PREFIXES, ...prefixes].some((x) => p.startsWith(x));
}

const safeRegex = (src) => {
  if (typeof src !== 'string' || !src) return null;
  try {
    return new RegExp(src, 'i');
  } catch {
    return null; // regex inválida → ignorada (nunca derruba o hook)
  }
};

// rules: [{ nome, match, tier }] avaliadas no pedido antes do Jev. Primeira que casar decide.
// Retorna { tierIndex, nome } ou null. Regra com regex inválida ou tier inexistente é pulada.
export function matchRule(cfg, pedido) {
  for (const r of Array.isArray(cfg.rules) ? cfg.rules : []) {
    const re = safeRegex(r?.match);
    const i = tierIndex(cfg.tiers, r?.tier);
    if (!re || i === -1) continue;
    if (re.test(pedido)) return { tierIndex: i, nome: String(r.nome || r.match) };
  }
  return null;
}

// continuacao: { match, max_chars } — confirmação curta herda o tier da decisão anterior da sessão.
// anterior = { subagente, pedido? } (lib.previousDecision). Retorna { tierIndex } ou null.
export function matchContinuacao(cfg, pedido, anterior) {
  const c = cfg.continuacao;
  if (!c || !anterior?.subagente) return null;
  const re = safeRegex(c.match);
  const max = c.max_chars ?? 40;
  const p = pedido.trim();
  if (!re || p.length > max || !re.test(p)) return null;
  const i = tierIndex(cfg.tiers, anterior.subagente);
  return i === -1 ? null : { tierIndex: i };
}

// Política do modo jev. Retorna { i, trail[] } a partir da classificação.
//  - { type: "confianca" } (padrão/legado): vale a escolha; confiança < limiar sobe 1.
//  - { type: "probabilidades", subir_se_prob_acima: { <agent>: limiar } }: argmax das
//    probabilidades; para cada tier acima (do topo para baixo), se P(tier) + P(tiers acima) ≥
//    limiar do tier → sobe até ele. Confiança não sobe nada (só vai para o log).
//    Sem probabilidades na resposta → vale a escolha do Jev, sem subida.
function jevPolicy(cfg, cls, fmt) {
  const { tiers, thresholds } = cfg;
  const top = tiers.length - 1;
  const policy = cfg.policy || { type: 'confianca' };
  const trail = [];
  const { escolha, confianca, probabilidades } = cls;

  if (policy.type === 'probabilidades') {
    const p = probabilidades && typeof probabilidades === 'object' ? probabilidades : null;
    const prob = (t) => (p && typeof p[t.agent] === 'number' ? p[t.agent] : 0);
    let i;
    if (p && Object.keys(p).length) {
      i = 0;
      tiers.forEach((t, k) => {
        if (prob(t) > prob(tiers[i])) i = k;
      });
      trail.push(`argmax=${tiers[i].agent} ${fmt(prob(tiers[i]))}`);
    } else {
      i = tiers.findIndex((t) => t.agent === escolha);
      if (i === -1) i = top;
      trail.push(`jev=${escolha} (sem probabilidades)`);
      return { i, trail };
    }
    const lim = policy.subir_se_prob_acima || {};
    for (let k = top; k > i; k--) {
      const l = lim[tiers[k].agent] ?? lim[tiers[k].id];
      if (typeof l !== 'number') continue;
      let soma = 0;
      for (let j = k; j <= top; j++) soma += prob(tiers[j]);
      if (soma >= l) {
        trail.push(`P(>=${tiers[k].agent}) ${fmt(soma)}>=${fmt(l)} ↑`);
        i = k;
        break;
      }
    }
    return { i, trail };
  }

  let i = tiers.findIndex((t) => t.agent === escolha);
  if (i === -1) i = top; // escolha desconhecida → mais forte
  trail.push(`jev=${escolha}`);
  if (confianca != null && confianca < thresholds.confidence_below) {
    i += 1;
    trail.push(`conf ${fmt(confianca)}<${fmt(thresholds.confidence_below)} +1`);
  }
  return { i, trail };
}

// escalate_on: [{ question, noul_acima, tier_minimo }] — Noul extra acima do limiar eleva o piso.
function applyEscalateOn(cfg, i, extras, fmt, trail) {
  for (const r of Array.isArray(cfg.escalate_on) ? cfg.escalate_on : []) {
    const v = extras?.[r?.question]?.noul;
    const min = tierIndex(cfg.tiers, r?.tier_minimo);
    if (typeof v !== 'number' || min === -1 || typeof r.noul_acima !== 'number') continue;
    if (v > r.noul_acima && i < min) {
      trail.push(`${r.question} ${fmt(v)}>${fmt(r.noul_acima)} → min ${cfg.tiers[min].agent}`);
      i = min;
    }
  }
  return i;
}

// Decide o tier. classification | null (falha):
//  - modo "jev":    { escolha, confianca, probabilidades?, risco, extras? } → policy (confianca|probabilidades).
//  - modo "regras": { nivel, confianca, risco, extras? } → classe define o tier; risco e confiança sobem.
// opts: { override: tierIndex, regra: {tierIndex, nome}, continuacao: {tierIndex}, erro }
export function decide(cfg, classification, { override = null, regra = null, continuacao = null, erro = null } = {}) {
  const { tiers, thresholds } = cfg;
  const top = tiers.length - 1;
  const fmt = (n) => (n == null ? '?' : n.toFixed(2).replace(/^0/, ''));

  if (override != null) {
    return pack(tiers[override], 'override', `override do usuario → ${tiers[override].agent}`);
  }
  if (regra) {
    const t = tiers[regra.tierIndex];
    return pack(t, `regra:${regra.nome}`, `regra ${regra.nome} → ${t.agent}`);
  }
  if (continuacao) {
    const t = tiers[continuacao.tierIndex];
    return pack(t, 'continuacao', `continuação da tarefa anterior → ${t.agent}`);
  }
  if (!classification || erro) {
    const fb = tiers.findIndex((t) => t.id === cfg.fallback_tier);
    const i = fb === -1 ? top : fb;
    return pack(tiers[i], 'fallback', `classificador falhou (${erro || 'sem resposta'}) → ${tiers[i].agent}`);
  }

  const { nivel, escolha, confianca, risco, extras } = classification;
  let i;
  let trail = [];
  if (escolha != null) {
    ({ i, trail } = jevPolicy(cfg, classification, fmt));
  } else {
    i = baseIndex(tiers, nivel);
    trail.push(`base=${nivel}`);
    if (risco != null && risco > thresholds.risk_above) {
      i += 1;
      trail.push(`risco ${fmt(risco)}>${fmt(thresholds.risk_above)} +1`);
    }
    if (confianca != null && confianca < thresholds.confidence_below) {
      i += 1;
      trail.push(`conf ${fmt(confianca)}<${fmt(thresholds.confidence_below)} +1`);
    }
  }
  i = applyEscalateOn(cfg, i, extras, fmt, trail);
  if (i > top) {
    i = top;
    trail.push('teto');
  }
  return pack(tiers[i], 'jev', `${trail.join('; ')} → ${tiers[i].agent}`);
}

function pack(tier, origem, justificativa) {
  return { tier: tier.id, subagente: tier.agent, modelo: tier.model_label, origem, justificativa };
}

// Próximo tier para escalonamento (null se já no topo).
export function nextTier(tiers, agent) {
  const i = tiers.findIndex((t) => t.agent === agent);
  return i === -1 || i === tiers.length - 1 ? null : tiers[i + 1];
}
