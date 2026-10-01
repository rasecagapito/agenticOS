// Lógica pura de roteamento — sem I/O, testável (decide.test.mjs).
// O classificador (Jev) só opina; quem decide o nível é este código.

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Índice do tier inicial a partir da classe devolvida pelo classificador.
export function baseIndex(tiers, nivel) {
  const i = tiers.findIndex((t) => t.nivel === nivel);
  return i === -1 ? tiers.length - 1 : i; // classe desconhecida → mais forte
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

export function isBypass(prompt, prefixes = ['!', '/']) {
  const p = prompt.trimStart();
  return prefixes.some((x) => p.startsWith(x));
}

// Decide o tier. classification = { nivel, confianca, risco } | null (falha).
export function decide(cfg, classification, { override = null, erro = null } = {}) {
  const { tiers, thresholds } = cfg;
  const top = tiers.length - 1;
  const fmt = (n) => (n == null ? '?' : n.toFixed(2).replace(/^0/, ''));

  if (override != null) {
    return pack(tiers[override], 'override', `override do usuario → ${tiers[override].agent}`);
  }
  if (!classification || erro) {
    const fb = tiers.findIndex((t) => t.id === cfg.fallback_tier);
    const i = fb === -1 ? top : fb;
    return pack(tiers[i], 'fallback', `classificador falhou (${erro || 'sem resposta'}) → ${tiers[i].agent}`);
  }

  const { nivel, confianca, risco } = classification;
  let i = baseIndex(tiers, nivel);
  const trail = [`base=${nivel}`];
  if (risco != null && risco > thresholds.risk_above) {
    i += 1;
    trail.push(`risco ${fmt(risco)}>${fmt(thresholds.risk_above)} +1`);
  }
  if (confianca != null && confianca < thresholds.confidence_below) {
    i += 1;
    trail.push(`conf ${fmt(confianca)}<${fmt(thresholds.confidence_below)} +1`);
  }
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
