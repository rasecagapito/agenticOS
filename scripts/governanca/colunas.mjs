// Colunas do GitHub Project (opções do campo Status).
export const COLUNAS_PADRAO = {
  backlog: 'Backlog',
  a_fazer: 'A Fazer',
  em_andamento: 'Em andamento',
  em_validacao: 'Em validação',
  aprovado: 'Aprovado',
  concluido: 'Concluído',
  bloqueado: 'Bloqueado',
};

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

export function colunasFaltantes(opcoes, colunas) {
  const tem = new Set(opcoes.map((o) => norm(o.name)));
  return Object.values(colunas).filter((n) => !tem.has(norm(n)));
}

// A API substitui a lista inteira: as existentes vão primeiro, com cor e descrição originais.
export function opcoesMescladas(opcoes, faltantes) {
  return [
    ...opcoes.map((o) => ({ name: o.name, color: o.color || 'GRAY', description: o.description || '' })),
    ...faltantes.map((name) => ({ name, color: 'GRAY', description: '' })),
  ];
}

export function mapearIds(opcoes, colunas) {
  const porNome = new Map(opcoes.map((o) => [norm(o.name), o.id]));
  return Object.fromEntries(Object.entries(colunas).map(([k, n]) => [k, porNome.get(norm(n)) || null]));
}
