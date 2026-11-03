// Nomes derivados do cartão: slug, branch e arquivo TASK.
export function slug(texto, max = 40) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

export const nomeBranch = (ficha, tipo, id, desc) =>
  `${ficha.prefixos_branch[tipo] ?? ficha.prefixos_branch.feature}${id}-${desc}`;

export const caminhoTask = (id, desc) => `docs/tasks/TASK-${id}-${desc}.md`;
