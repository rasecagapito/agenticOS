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
    'O analista precisa ser outra conta GitHub que a do agente (o GitHub não deixa quem abriu o PR aprová-lo). Configure identidade_agente (conta-robô ou GitHub App) ou ligue aprovacao_pelo_chat no wizard.',
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
  SEM_PR: 'Rode /cartao pr <ID> antes.',
  HOM_OCUPADO: 'O HOM está com outro cartão em validação. Espere a assinatura dele ou fure a fila com o "sim" do usuário (--furar-fila --motivo).',
  MIGRACAO_NAO_AUTORIZADA: 'Mostre o comando de migração ao usuário e peça o "sim" (--migracao-autorizada).',
  COMANDO_SUSPEITO_PRD: 'Um comando de HOM cita produção. Confira com o usuário antes de seguir (--confirmo-comando).',
  SEM_HOM: 'Rode /cartao hom <ID> antes.',
  HOM_FALHOU: 'Uma etapa do HOM falhou. Veja a etapa e o log em .agentic-os/hom/<ID>.log, corrija e rode de novo.',
  ASSINATURA_DE_OUTRO_COMMIT: 'O analista aprovou uma versão anterior. Peça a aprovação do commit atual no PR.',
  IDENTIDADE_IGUAL_ANALISTA:
    'O agente usa a mesma conta GitHub de um analista: a aprovação dessa conta não prova nada. Saídas: (1) configurar identidade_agente (token de uma conta-robô ou GitHub App) pelo wizard; (2) ligar aprovacao_pelo_chat na ficha (prova fraca, registrada como tal).',
  TOKEN_AUSENTE: 'Defina a variável de ambiente com o token do agente (nome em identidade_agente.token_env), no sistema ou num .env fora do git.',
  APP_CHAVE_INVALIDA: 'Confira a variável com o caminho da chave privada (.pem) do GitHub App (identidade_agente.chave_privada_env), o app_id e, se preciso, gere a chave de novo.',
  APP_NAO_INSTALADO: 'Instale o GitHub App no repositório (Settings da conta/org → GitHub Apps → Configure → acesso ao repo).',
  CHAT_DESLIGADO: 'A aprovação pelo chat está desligada (aprovacao_pelo_chat: false). Use a review no PR ou ligue pelo wizard.',
  JA_HA_REVIEW: 'Já há review do analista no PR para este commit: ela vale mais que o chat. Rode card-sign <ID> sem --pelo-chat.',
  GH_LOCAL_E_ANALISTA:
    'O gh desta máquina está logado com a conta de um analista: o agente consegue agir como ele. Deixe o gh logado só com a conta do agente ou use o modo app.',
  REMOTO_SSH: 'Com identidade do agente, o origin (fetch e push) precisa ser https em github.com: git remote set-url origin https://github.com/<dono>/<repo>.git e, se houver URL de push separada, git remote set-url --push origin https://github.com/<dono>/<repo>.git',
  CARTAO_FORA_DE_APROVADO: 'O merge só vale para cartão em "Aprovado". Conclua /cartao assinatura <ID> com a aprovação do analista.',
  SEM_ASSINATURA: 'Não há aprovação válida do analista para o commit atual. Rode /cartao assinatura <ID> depois da decisão dele.',
  ASSINATURA_REPROVADA: 'A última review do analista pede mudanças. Corrija e siga: /cartao revisar → /cartao pr → /cartao hom.',
  CHECKS_PENDENTES: 'Há check obrigatório (CI) pendente ou com falha. Espere terminar ou corrija e rode de novo.',
  PR_CONFLITO: 'O GitHub diz que o PR não pode ser integrado (conflito ou branch atrás). Atualize a branch; o commit novo exige revisar, hom e assinatura de novo.',
  MERGE_RECUSADO: 'O GitHub recusou o merge. Leia o motivo: proteção da branch, permissão do token/App (contents: write) ou commit novo no PR.',
  CONFIRMACAO_CHAT: 'A assinatura foi pelo chat (sem prova do GitHub). O merge exige um "sim" novo do usuário, escrito por iniciativa dele (--confirmo-merge-chat).',
};

export class ErroGov extends Error {
  constructor(codigo, detalhe, extra) {
    super(detalhe || ERROS[codigo] || codigo);
    this.codigo = codigo;
    this.como_resolver = ERROS[codigo] || '';
    if (extra) this.extra = extra;
  }
}
