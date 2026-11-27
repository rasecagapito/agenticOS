// Controle de Sprints no GitHub Project (#8 — integração Ágil · Scrum Master).
// Registra tudo nos campos do Project (Funcionalidade, Camada, Tamanho, Iteração) e no corpo da issue.
// Nunca calcula porcentagem nem fecha sprints; nunca aplica alterações sem confirmação explícita (--confirmo-sprint).
import { norm } from './colunas.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';

export const CAMADAS_PADRAO = ['Infra Estrutura', 'Back-end', 'Banco de Dados', 'Front End', 'Documentação'];
export const TAMANHOS_VALIDOS = [1, 2, 3, 5, 8];
export const CAPACIDADE_PADRAO = 30;
export const ESTIMATIVA_RE = /^Estimativa:\s*(1|2|3|5|8)\s+pontos?,\s*porque\s+\S+/im;

const Q_SINGLE = 'query($id:ID!){node(id:$id){... on ProjectV2SingleSelectField{options{id name}}}}';
const Q_ITER = 'query($id:ID!){node(id:$id){... on ProjectV2IterationField{configuration{iterations{id title startDate duration}}}}}';

export function lerCamposSprint(ficha) {
  const { owner, number } = ficha.project;
  const nomes = ficha.sprint?.campos || {
    funcionalidade: 'Funcionalidade',
    camada: 'Camada',
    tamanho: 'Tamanho',
    iteracao: 'Iteração',
  };
  const lista = ghJson(['project', 'field-list', String(number), '--owner', owner, '--format', 'json', '--limit', '100']);
  const fields = lista?.fields || [];
  const achar = (nome) => fields.find((x) => norm(x.name) === norm(nome));

  const fFunc = achar(nomes.funcionalidade);
  const fCam = achar(nomes.camada);
  const fTam = achar(nomes.tamanho);
  const fIter = achar(nomes.iteracao);
  const faltando = [
    !fFunc && nomes.funcionalidade,
    !fCam && nomes.camada,
    !fTam && nomes.tamanho,
    !fIter && nomes.iteracao,
  ].filter(Boolean);
  if (faltando.length) {
    throw new ErroGov('CAMPOS_SPRINT_AUSENTES', `Campos ausentes no Project: ${faltando.join(', ')}.`);
  }

  const funcOpts = ghJson(['api', 'graphql', '-f', `query=${Q_SINGLE}`, '-f', `id=${fFunc.id}`])?.data?.node?.options || [];
  const camOpts = ghJson(['api', 'graphql', '-f', `query=${Q_SINGLE}`, '-f', `id=${fCam.id}`])?.data?.node?.options || [];
  const iteracoes = ghJson(['api', 'graphql', '-f', `query=${Q_ITER}`, '-f', `id=${fIter.id}`])?.data?.node?.configuration?.iterations || [];

  return {
    funcionalidade: { id: fFunc.id, nome: fFunc.name, opcoes: funcOpts },
    camada: { id: fCam.id, nome: fCam.name, opcoes: camOpts },
    tamanho: { id: fTam.id, nome: fTam.name },
    iteracao: { id: fIter.id, nome: fIter.name, opcoes: iteracoes },
  };
}

export function atualizarEstimativaCorpo(body, tamanho, motivo) {
  const linha = `Estimativa: ${tamanho} pontos, porque ${String(motivo || '').trim()}`;
  const texto = String(body || '');
  if (ESTIMATIVA_RE.test(texto)) return texto.replace(ESTIMATIVA_RE, linha);
  return (texto.trimEnd() ? texto.trimEnd() + '\n\n' : '') + linha + '\n';
}

export function sprintInspect(ficha) {
  const campos = lerCamposSprint(ficha);
  const { owner, number } = ficha.project;
  const lista = ghJson(['project', 'item-list', String(number), '--owner', owner, '--format', 'json', '--limit', '1000']);
  const items = (lista?.items || []).filter(
    (i) => !i.content?.repository || String(i.content.repository).toLowerCase() === ficha.repo.toLowerCase(),
  );
  return { ok: true, campos, total_itens: items.length, itens: items };
}

function resolverOpcao(opcoes, alvo) {
  return opcoes.find((o) => norm(o.name) === norm(alvo)) || null;
}

export function validarPlanoSprint(plano, campos, ficha) {
  if (!Array.isArray(plano) || plano.length === 0) throw new ErroGov('PARAMETRO', 'O plano de sprint precisa ser uma lista não-vazia de cartões.');
  const cap = Number(ficha.sprint?.capacidade_pontos) || CAPACIDADE_PADRAO;
  const col = ficha.colunas;
  const concluidoN = norm(col.concluido);
  const ativoN = new Set([norm(col.em_andamento), norm(col.em_validacao)]);
  const backlogN = new Set([norm(col.backlog), norm(col.a_fazer)]);

  const sugestoesFunc = new Set();
  const pontosPorSprint = {};
  const itens = [];
  const sprintAtual = campos.iteracao.opcoes[0] || null;
  const iters = campos.iteracao.opcoes;

  const normalizados = plano.map((c) => {
    const id = Number(c.id);
    if (!Number.isInteger(id) || id < 1) throw new ErroGov('PARAMETRO', `ID de cartão inválido no plano: ${c.id}`);
    if (Array.isArray(c.camadas) && c.camadas.length > 1) {
      throw new ErroGov('MULTICAMADA_SEM_QUEBRA', `Cartão #${id} toca ${c.camadas.join(', ')}: quebre em sub-issues (1 por camada).`);
    }
    const camadaTxt = Array.isArray(c.camadas) ? c.camadas[0] : c.camada;
    const camadaCanon = CAMADAS_PADRAO.find((x) => norm(x) === norm(camadaTxt));
    if (!camadaCanon) {
      throw new ErroGov('PARAMETRO', `Camada inválida no cartão #${id}: "${camadaTxt}". Use: ${CAMADAS_PADRAO.join(', ')}.`);
    }
    const camOpt = resolverOpcao(campos.camada.opcoes, camadaCanon);
    const funcSolicitada = String(c.funcionalidade || '').trim();
    const funcMatch = funcSolicitada ? resolverOpcao(campos.funcionalidade.opcoes, funcSolicitada) : null;
    const funcDef = resolverOpcao(campos.funcionalidade.opcoes, 'A definir');
    let funcNome = funcMatch ? funcMatch.name : funcDef ? funcDef.name : 'A definir';
    const funcId = funcMatch ? funcMatch.id : funcDef ? funcDef.id : null;
    if (!funcMatch && funcSolicitada && norm(funcSolicitada) !== norm('A definir')) {
      sugestoesFunc.add(funcSolicitada);
    }

    const stN = norm(c.status);
    const ehConcluido = stN === concluidoN;
    if (ehConcluido) {
      return {
        ...c,
        id,
        itemId: c.itemId || null,
        concluido: true,
        funcionalidade: funcNome,
        funcionalidadeId: funcId,
        camada: camadaCanon,
        camadaId: camOpt?.id || null,
        tamanho: null,
        motivo: '(Concluído — histórico sem Tamanho/Iteração)',
        iteracao: null,
        iteracaoId: null,
      };
    }

    const tam = Number(c.tamanho);
    if (!TAMANHOS_VALIDOS.includes(tam)) {
      throw new ErroGov('PARAMETRO', `Tamanho inválido no cartão #${id}: ${c.tamanho}. Use 1, 2, 3, 5 ou 8.`);
    }
    const motivo = String(c.motivo || '').trim();
    if (!motivo) throw new ErroGov('PARAMETRO', `Cartão #${id} exige motivo para a estimativa (${tam} pontos).`);

    return {
      ...c,
      id,
      itemId: c.itemId || null,
      concluido: false,
      ativo: ativoN.has(stN),
      backlog: backlogN.has(stN),
      prioridade: Number.isFinite(Number(c.prioridade)) ? Number(c.prioridade) : 999,
      funcionalidade: funcNome,
      funcionalidadeId: funcId,
      camada: camadaCanon,
      camadaId: camOpt?.id || null,
      tamanho: tam,
      motivo,
      iteracaoSolicitada: c.iteracao || null,
    };
  });

  // 1. Aloca primeiro Em andamento / Em validação na sprint atual (ou explícita).
  for (const it of normalizados) {
    if (it.concluido) {
      itens.push(it);
      continue;
    }
    if (it.ativo || it.iteracaoSolicitada) {
      if (it.tamanho === 8) {
        throw new ErroGov('TAMANHO_OITO_SEM_QUEBRA', `Cartão #${it.id} tem tamanho 8 e não pode entrar na sprint sem ser quebrado antes.`);
      }
      const alvo = it.iteracaoSolicitada ? resolverOpcaoByTitle(iters, it.iteracaoSolicitada) : sprintAtual;
      const nome = alvo ? alvo.title : it.iteracaoSolicitada || 'Sprint 1';
      pontosPorSprint[nome] = (pontosPorSprint[nome] || 0) + it.tamanho;
      if (pontosPorSprint[nome] > cap) {
        throw new ErroGov('SPRINT_CAPACIDADE_EXCEDIDA', `${nome} atingiu ${pontosPorSprint[nome]} pontos (máximo ~${cap}).`);
      }
      itens.push({ ...it, iteracao: nome, iteracaoId: alvo?.id || null });
    }
  }

  // 2. Depois aloca Backlog / A Fazer por prioridade até o limite ~30 pts por sprint.
  const restantes = normalizados
    .filter((it) => !it.concluido && !it.ativo && !it.iteracaoSolicitada)
    .sort((a, b) => a.prioridade - b.prioridade || a.id - b.id);

  for (const it of restantes) {
    if (it.tamanho === 8) {
      // Tamanho 8 não entra na sprint sem quebra prévia.
      itens.push({ ...it, iteracao: null, iteracaoId: null, requer_quebra: true });
      continue;
    }
    let escolhido = null;
    for (const sp of iters) {
      const atual = pontosPorSprint[sp.title] || 0;
      if (atual + it.tamanho <= cap) {
        escolhido = sp;
        pontosPorSprint[sp.title] = atual + it.tamanho;
        break;
      }
    }
    itens.push({
      ...it,
      iteracao: escolhido ? escolhido.title : null,
      iteracaoId: escolhido ? escolhido.id : null,
    });
  }

  const tabela = [
    '| Cartão | Funcionalidade | Camada | Tamanho | Sprint | Motivo do tamanho |',
    '|---|---|---|---|---|---|',
    ...itens.map((x) => {
      const sp = x.requer_quebra ? '⚠️ Quebrar antes (tam 8)' : x.iteracao || '—';
      const tam = x.tamanho ?? '—';
      return `| #${x.id} | ${x.funcionalidade} | ${x.camada} | ${tam} | ${sp} | ${x.motivo} |`;
    }),
  ].join('\n');

  return {
    ok: true,
    capacidade_pontos: cap,
    itens,
    pontos_por_sprint: pontosPorSprint,
    funcionalidades_sugeridas: [...sugestoesFunc],
    tabela_markdown: tabela,
  };
}

function resolverOpcaoByTitle(iters, title) {
  return iters.find((o) => norm(o.title) === norm(title)) || null;
}

export function sprintPlan(ficha, plano) {
  const campos = lerCamposSprint(ficha);
  return validarPlanoSprint(plano, campos, ficha);
}

export function sprintApply(ficha, plano, o = {}) {
  const campos = lerCamposSprint(ficha);
  const validado = validarPlanoSprint(plano, campos, ficha);
  if (o.dryRun) return { ...validado, dry_run: true };
  if (!o.confirmoSprint) {
    throw new ErroGov('CONFIRMACAO_SPRINT', `${validado.tabela_markdown}\n\nConfirme com "ok" antes de gravar no Project.`);
  }
  const pid = ficha.project.id;
  const aplicados = [];
  for (const it of validado.itens) {
    const itemId = it.itemId;
    if (!itemId) throw new ErroGov('PARAMETRO', `itemId ausente para o cartão #${it.id}.`);
    if (it.funcionalidadeId) {
      gh(['project', 'item-edit', '--id', itemId, '--project-id', pid, '--field-id', campos.funcionalidade.id, '--single-select-option-id', it.funcionalidadeId]);
    }
    if (it.camadaId) {
      gh(['project', 'item-edit', '--id', itemId, '--project-id', pid, '--field-id', campos.camada.id, '--single-select-option-id', it.camadaId]);
    }
    if (it.concluido) {
      gh(['project', 'item-edit', '--id', itemId, '--project-id', pid, '--field-id', campos.tamanho.id, '--clear']);
      gh(['project', 'item-edit', '--id', itemId, '--project-id', pid, '--field-id', campos.iteracao.id, '--clear']);
    } else {
      gh(['project', 'item-edit', '--id', itemId, '--project-id', pid, '--field-id', campos.tamanho.id, '--number', String(it.tamanho)]);
      if (it.iteracaoId) {
        gh(['project', 'item-edit', '--id', itemId, '--project-id', pid, '--field-id', campos.iteracao.id, '--iteration-id', it.iteracaoId]);
      }
      const view = ghJson(['issue', 'view', String(it.id), '--repo', ficha.repo, '--json', 'body']);
      const novoBody = atualizarEstimativaCorpo(view?.body || '', it.tamanho, it.motivo);
      if (novoBody !== (view?.body || '')) {
        gh(['issue', 'edit', String(it.id), '--repo', ficha.repo, '--body', novoBody]);
      }
    }
    aplicados.push(it.id);
  }
  return { ...validado, aplicados };
}
