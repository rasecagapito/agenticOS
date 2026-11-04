// Códigos de erro da governança GitHub. A skill lê `codigo` e mostra `como_resolver` ao usuário.
export const ERROS = {
  GH_AUSENTE: 'Instale o GitHub CLI (https://cli.github.com) e rode: gh auth login',
  GH_DESLOGADO: 'Rode: gh auth login',
  SEM_ESCOPO_PROJECT: 'Rode: gh auth refresh -s project',
  GH_FALHOU: 'Veja a mensagem do gh; repetir é seguro (o script confere o estado antes de criar).',
  REDE: 'Falha de rede ou da API do GitHub. Repita: o script confere o estado antes de criar.',
  PLANO_SEM_PROTECAO:
    'O plano do GitHub não permite esta proteção neste repositório privado. Saídas: (1) tornar o repo público, (2) subir de plano (Pro/Team), (3) seguir com proteção parcial — o risco fica escrito na ficha.',
  NAO_E_GIT: 'A pasta não é um repositório git. Rode: git init',
  SEM_REMOTO: 'Sem remoto "origin" no GitHub. Crie com: gh repo create <dono>/<nome> --private --source . --push',
  GIT_FALHOU: 'Veja a mensagem do git.',
  FICHA_INVALIDA: 'Rode o wizard (/agentic-os) para recriar .agentic-os/governanca.json.',
  PARAMETRO: 'Parâmetro inválido. Veja o uso no topo de github-setup.mjs.',
  ANALISTA_IGUAL_AGENTE:
    'O analista precisa de uma conta GitHub diferente da usada pelo agente: o GitHub não deixa quem abriu o PR aprová-lo.',
  ANALISTA_INEXISTENTE: 'Login do GitHub não encontrado. Confira a grafia.',
  CARTAO_INEXISTENTE: 'O cartão precisa ser uma issue do repositório adicionada ao Project (rascunho não serve: converta em issue).',
  CARTAO_FORA_DE_A_FAZER: 'Mova o cartão para "A Fazer" no Project.',
  ARVORE_SUJA: 'Há alterações não commitadas. Commite ou guarde (git stash) antes.',
  BRANCH_EXISTE: 'A branch do cartão já existe. Retome nela (git switch <branch>) ou pare.',
  BRANCH_ERRADA: 'Rode na branch do cartão (git switch <branch>).',
  TRAVA: 'Ação proibida pela governança (push/merge na branch principal, aprovar PR ou afrouxar proteção).',
  SEM_CRITERIOS: 'Adicione "## Critérios de aceite" (lista de itens verificáveis) ao proposal.md do cartão (changes/<ID>-<desc>/).',
  PARECER_INVALIDO: 'Rode /cartao revisar <ID> de novo: o parecer precisa ser JSON do Supervisor para o commit atual.',
  AGUARDA_DECISAO: '3ª nota abaixo de 10: pergunte ao usuário se segue com a nota atual ou faz nova análise (review-decide).',
  SEM_REVISAO: 'Rode /cartao revisar <ID> antes de abrir o PR.',
  REVISAO_VENCIDA: 'Houve commit depois da revisão. Rode /cartao revisar <ID> de novo.',
};

export class ErroGov extends Error {
  constructor(codigo, detalhe) {
    super(detalhe || ERROS[codigo] || codigo);
    this.codigo = codigo;
    this.como_resolver = ERROS[codigo] || '';
  }
}
