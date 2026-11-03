// Proteção da branch principal. Trava 3: o corpo gerado nunca é mais fraco que a regra atual.
// `atual` = resposta de GET repos/{repo}/branches/{b}/protection (ou null se não protegida).
export function mesclarProtecao(atual) {
  const a = atual || {};
  const rev = a.required_pull_request_reviews || {};
  const sc = a.required_status_checks;
  return {
    required_status_checks: sc
      ? sc.checks?.length
        ? { strict: !!sc.strict, checks: sc.checks }
        : { strict: !!sc.strict, contexts: sc.contexts || [] }
      : null,
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      require_last_push_approval: true,
      required_approving_review_count: Math.max(1, rev.required_approving_review_count || 0),
    },
    restrictions: a.restrictions
      ? {
          users: (a.restrictions.users || []).map((u) => u.login),
          teams: (a.restrictions.teams || []).map((t) => t.slug),
          apps: (a.restrictions.apps || []).map((x) => x.slug),
        }
      : null,
    required_linear_history: !!a.required_linear_history?.enabled,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: !!a.required_conversation_resolution?.enabled,
    lock_branch: !!a.lock_branch?.enabled,
  };
}

// Linhas "nome: antes → depois" só do que muda (para o wizard mostrar).
export function diffProtecao(atual, novo) {
  const a = atual || {};
  const r = a.required_pull_request_reviews || {};
  const n = novo.required_pull_request_reviews;
  const flag = (o, semRegra) => (o ? !!o.enabled : semRegra);
  const linhas = [];
  const add = (nome, antes, depois) => {
    if (antes !== depois) linhas.push(`${nome}: ${antes} → ${depois}`);
  };
  add('PR obrigatório', !!a.required_pull_request_reviews, true);
  add('Aprovações mínimas', r.required_approving_review_count || 0, n.required_approving_review_count);
  add('Descartar aprovação em commit novo', !!r.dismiss_stale_reviews, n.dismiss_stale_reviews);
  add('Exigir revisão do analista (CODEOWNERS)', !!r.require_code_owner_reviews, n.require_code_owner_reviews);
  add('Aprovação do último push', !!r.require_last_push_approval, n.require_last_push_approval);
  add('Regra vale para admins', flag(a.enforce_admins, false), novo.enforce_admins);
  add('Force-push permitido', flag(a.allow_force_pushes, !atual), novo.allow_force_pushes);
  add('Apagar branch permitido', flag(a.allow_deletions, !atual), novo.allow_deletions);
  return linhas;
}
