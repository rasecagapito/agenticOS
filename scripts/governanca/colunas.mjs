// Colunas do GitHub Project (opções do campo Status).
export const COLUNAS_SCRUM = {
  backlog: 'Backlog',
  a_fazer: 'A Fazer',
  em_andamento: 'Em andamento',
  em_validacao: 'Em validação',
  concluido: 'Concluído',
};

export const COLUNAS_COMPLETAS = {
  backlog: 'Backlog',
  a_fazer: 'A Fazer',
  em_andamento: 'Em andamento',
  em_validacao: 'Em validação',
  aprovado: 'Aprovado',
  concluido: 'Concluído',
  bloqueado: 'Bloqueado',
};

// Compatibilidade com fichas existentes (7 colunas) e opção de 5 colunas Scrum.
export const COLUNAS_PADRAO = COLUNAS_COMPLETAS;

export const colunasParaModo = (modo = 'completo') => (modo === 'scrum' ? { ...COLUNAS_SCRUM } : { ...COLUNAS_COMPLETAS });

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function colunasFaltantes(opcoes, colunas) {
  const tem = new Set(opcoes.map((o) => norm(o.name)));
  return Object.values(colunas).filter((n) => n && !tem.has(norm(n)));
}

// A API substitui a lista inteira: as existentes vão primeiro, com id (sem id o GitHub recria a opção e
// os cartões perdem o status — confirmado no teste real), cor e descrição originais.
export function opcoesMescladas(opcoes, faltantes) {
  return [
    ...opcoes.map((o) => ({ ...(o.id ? { id: o.id } : {}), name: o.name, color: o.color || 'GRAY', description: o.description || '' })),
    ...faltantes.map((name) => ({ name, color: 'GRAY', description: '' })),
  ];
}

export function mapearIds(opcoes, colunas) {
  const porNome = new Map(opcoes.map((o) => [norm(o.name), o.id]));
  return Object.fromEntries(Object.entries(colunas).map(([k, n]) => [k, porNome.get(norm(n)) || null]));
}
