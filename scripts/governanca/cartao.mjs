// Fluxo do cartão: card-start (A Fazer → branch + TASK → Em andamento) e card-pr (push + PR ligado).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { norm } from './colunas.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';
import { arvoreLimpa, branchAtual, branchExiste, git, pushBranch } from './git.mjs';
import { caminhoTask, nomeBranch, slug } from './nomes.mjs';
import { arquivosSujos, exigirRevisao, secaoSupervisor } from './supervisor.mjs';

export function acharCartao(ficha, id) {
  const { owner, number } = ficha.project;
  const lista = ghJson(['project', 'item-list', String(number), '--owner', owner, '--format', 'json', '--limit', '1000']);
  const items = lista?.items || [];
  const repo = ficha.repo.toLowerCase();
  const item = items.find(
    (i) => i.content?.number === Number(id) && (!i.content.repository || String(i.content.repository).toLowerCase() === repo),
  );
  if (!item) {
    const aviso = items.length >= 1000 ? ' (atenção: Project atingiu 1000 itens retornados; arquive cartões antigos)' : '';
    throw new ErroGov('CARTAO_INEXISTENTE', `Cartão #${id} não encontrado no Project ${ficha.project.url}.${aviso}`);
  }
  return { itemId: item.id, titulo: item.content.title || item.title || `cartao-${id}`, status: item.status || '', labels: item.labels || [] };
}

export function moverCartao(ficha, itemId, chave) {
  const opcao = ficha.colunas_ids?.[chave];
  if (!opcao) throw new ErroGov('FICHA_INVALIDA', `Sem id da coluna "${ficha.colunas[chave]}". Rode: github-setup.mjs apply`);
  gh(['project', 'item-edit', '--id', itemId, '--project-id', ficha.project.id, '--field-id', ficha.project.campo_status_id, '--single-select-option-id', opcao]);
}

export function textoTask({ id, desc, titulo, repo, branch, agora }) {
  return `# TASK-${id} — ${titulo}

| Campo | Valor |
|---|---|
| Cartão | #${id} |
| Repositório | ${repo} |
| Branch | ${branch} |
| Início | ${agora} |
| PR | (pendente: /cartao pr ${id}) |

## Plano
Ver \`changes/${id}-${desc}/\` (proposal.md, tasks.md).

## Histórico
- ${agora} — cartão movido para Em andamento; branch criada.
`;
}

export function cardStart(cwd, ficha, id, { tipo = 'feature', desc, dryRun = false } = {}) {
  if (!['feature', 'fix'].includes(tipo)) throw new ErroGov('PARAMETRO', '--tipo deve ser feature ou fix.');
  if (!/^\d+$/.test(String(id))) throw new ErroGov('PARAMETRO', 'O ID do cartão é o número da issue.');
  const c = acharCartao(ficha, id);
  if (norm(c.status) !== norm(ficha.colunas.a_fazer))
    throw new ErroGov('CARTAO_FORA_DE_A_FAZER', `Cartão #${id} está em "${c.status || 'sem coluna'}"; mova para "${ficha.colunas.a_fazer}".`);
  if (!arvoreLimpa(cwd)) throw new ErroGov('ARVORE_SUJA');
  const d = slug(desc || c.titulo) || `cartao-${id}`;
  const branch = nomeBranch(ficha, tipo, id, d);
  const task = caminhoTask(id, d);
  if (branchExiste(cwd, branch)) throw new ErroGov('BRANCH_EXISTE', `A branch ${branch} já existe. Retome nela (git switch ${branch}) ou pare.`);
  const principal = ficha.branch_principal;
  const acoes = [
    `git fetch origin ${principal}`,
    `git switch --no-track -c ${branch} origin/${principal}`,
    `criar ${task}`,
    `git commit (TASK-${id})`,
    `mover cartão #${id} → ${ficha.colunas.em_andamento}`,
  ];
  if (dryRun) return { ok: true, dry_run: true, branch, task, acoes };
  git(cwd, ['fetch', 'origin', principal]);
  git(cwd, ['switch', '--no-track', '-c', branch, `origin/${principal}`]);
  const abs = path.join(cwd, task);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, textoTask({ id, desc: d, titulo: c.titulo, repo: ficha.repo, branch, agora: new Date().toISOString() }));
  git(cwd, ['add', task]);
  git(cwd, ['commit', '-q', '-m', `docs(task): TASK-${id} ${d}`]);
  try {
    moverCartao(ficha, c.itemId, 'em_andamento');
  } catch (e) {
    if (!(e instanceof ErroGov)) throw e;
    throw new ErroGov(e.codigo, `${e.message} Branch ${branch} e TASK já criados; mova o cartão #${id} para "${ficha.colunas.em_andamento}" no Project à mão.`);
  }
  return { ok: true, branch, task, acoes };
}

export function corpoPr({ id, titulo, ficha, task, supervisor }) {
  return [
    `Cartão #${id} — ${titulo}`,
    `Project: ${ficha.project.url}`,
    task ? `TASK: \`${task}\`` : null,
    '',
    `Este PR só entra na \`${ficha.branch_principal}\` com a aprovação do analista (revisão obrigatória). Commit novo depois da aprovação descarta a aprovação.`,
    supervisor ? `\n${supervisor}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Insere ou troca a seção "## <titulo>" (antes de "## Histórico", se houver). Preserva CRLF.
export function registrarSecao(original, titulo, secao) {
  const crlf = original.includes('\r\n');
  const texto = original.replace(/\r\n/g, '\n');
  const s = secao.replace(/\r\n/g, '\n').trimEnd() + '\n';
  const t = escRe(titulo);
  let r;
  if (new RegExp(`^## ${t}$`, 'm').test(texto)) r = texto.replace(new RegExp(`^## ${t}\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm'), () => `${s}\n`);
  else if (titulo !== 'Histórico' && /^## Histórico$/m.test(texto)) r = texto.replace(/^## Histórico$/m, () => `${s}\n## Histórico`);
  else r = texto.trimEnd() + `\n\n${s}`;
  return crlf ? r.replace(/\n/g, '\r\n') : r;
}

export const registrarSupervisor = (original, secao) => registrarSecao(original, 'Supervisor', secao);

// Acrescenta uma linha ao fim da seção "## <titulo>" (cria a seção se faltar). Preserva CRLF.
export function anexarNaSecao(original, titulo, linha) {
  const crlf = original.includes('\r\n');
  const texto = original.replace(/\r\n/g, '\n');
  const re = new RegExp(`(^## ${escRe(titulo)}\\n[\\s\\S]*?)(\\n*)(?=^## |(?![\\s\\S]))`, 'm');
  const r = re.test(texto)
    ? texto.replace(re, (_, corpo) => `${corpo.trimEnd()}\n${linha}\n\n`).replace(/\n{3,}$/, '\n')
    : registrarSecao(texto, titulo, `## ${titulo}\n\n${linha}`);
  const fim = r.endsWith('\n') ? r : `${r}\n`;
  return crlf ? fim.replace(/\n/g, '\r\n') : fim;
}

export function prAberto(ficha, branch) {
  const l = ghJson(['pr', 'list', '--repo', ficha.repo, '--head', branch, '--state', 'open', '--json', 'number,url']) || [];
  return l[0] || null;
}

// Corpo longo vai por arquivo temporário (--body-file), apagado em seguida.
export function ghComCorpo(args, corpo) {
  const arq = path.join(os.tmpdir(), `agentic-os-pr-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(arq, corpo);
  try {
    return gh([...args, '--body-file', arq]);
  } finally {
    fs.rmSync(arq, { force: true });
  }
}

export function registrarPr(texto, url, agora) {
  if (texto.includes(url)) return texto;
  return texto.replace(/^\| PR \|.*\|$/m, `| PR | ${url} |`).trimEnd() + `\n- ${agora} — PR aberto: ${url}\n`;
}

export function cardPr(cwd, ficha, id, { dryRun = false } = {}) {
  if (!/^\d+$/.test(String(id))) throw new ErroGov('PARAMETRO', 'O ID do cartão é o número da issue.');
  const atual = branchAtual(cwd);
  if (!Object.values(ficha.prefixos_branch).some((p) => atual.startsWith(`${p}${id}-`)))
    throw new ErroGov('BRANCH_ERRADA', `A branch atual "${atual}" não é do cartão #${id}.`);
  const sujos = arquivosSujos(cwd);
  if (sujos.length) throw new ErroGov('ARVORE_SUJA', `Alterações fora do commit (ignore artefatos no .gitignore): ${sujos.slice(0, 5).join(', ')}`);
  const supervisor = secaoSupervisor(exigirRevisao(cwd, Number(id)));
  const c = acharCartao(ficha, id);
  const dirTasks = path.join(cwd, 'docs', 'tasks');
  const nome = fs.existsSync(dirTasks) ? fs.readdirSync(dirTasks).find((f) => f.startsWith(`TASK-${id}-`)) : null;
  const task = nome ? `docs/tasks/${nome}` : null;
  const existente = prAberto(ficha, atual);
  const acoes = [
    'exigir revisão do Supervisor (nota 10 ou liberação do usuário)',
    `git push -u origin ${atual}`,
    existente ? `PR já aberto: ${existente.url}` : `gh pr create --base ${ficha.branch_principal} --head ${atual}`,
    existente ? `atualizar corpo do PR ${existente.url}` : 'corpo do PR com a seção Supervisor',
    existente ? 'cartão já comentado' : `comentar o link do PR no cartão #${id}`,
    task ? `registrar o PR em ${task}` : 'sem TASK para registrar',
  ];
  if (dryRun) return { ok: true, dry_run: true, branch: atual, acoes };
  pushBranch(cwd, atual, ficha.branch_principal);
  let url = existente?.url;
  const corpo = corpoPr({ id, titulo: c.titulo, ficha, task, supervisor });
  if (!url) {
    url = ghComCorpo(['pr', 'create', '--repo', ficha.repo, '--base', ficha.branch_principal, '--head', atual, '--title', `[#${id}] ${c.titulo}`], corpo).stdout.trim();
    gh(['issue', 'comment', String(id), '--repo', ficha.repo, '--body', `PR aberto: ${url} — aguardando aprovação do analista.`]);
  } else {
    ghComCorpo(['pr', 'edit', url, '--repo', ficha.repo], corpo);
  }
  if (task) {
    const abs = path.join(cwd, task);
    const antes = fs.readFileSync(abs, 'utf8');
    const depois = registrarSupervisor(registrarPr(antes, url, new Date().toISOString()), supervisor);
    if (depois !== antes) {
      fs.writeFileSync(abs, depois);
      git(cwd, ['add', task]);
      git(cwd, ['commit', '-q', '-m', `docs(task): TASK-${id} PR aberto`]);
      pushBranch(cwd, atual, ficha.branch_principal);
    }
  }
  return { ok: true, branch: atual, pr: url, acoes };
}

export function cardBlock(ficha, id, { motivo = '' } = {}) {
  if (!/^\d+$/.test(String(id))) throw new ErroGov('PARAMETRO', 'O ID do cartão é o número da issue.');
  const txt = String(motivo || '').trim();
  if (!txt) throw new ErroGov('PARAMETRO', '--motivo é obrigatório para registrar bloqueio.');
  const c = acharCartao(ficha, id);
  gh(['issue', 'comment', String(id), '--repo', ficha.repo, '--body', `BLOQUEIO: ${txt}`]);
  if (ficha.colunas?.bloqueado && ficha.colunas_ids?.bloqueado) {
    moverCartao(ficha, c.itemId, 'bloqueado');
  }
  return { ok: true, id: Number(id), status: ficha.colunas?.bloqueado && ficha.colunas_ids?.bloqueado ? ficha.colunas.bloqueado : c.status, motivo: txt };
}

// Prepara uma fila ordenada de 1..N cartões para execução autônoma contínua (/cartao tocar).
export function cardQueue(ficha, ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new ErroGov('PARAMETRO', 'Informe ao menos um ID de cartão.');
  const { owner, number } = ficha.project;
  const lista = ghJson(['project', 'item-list', String(number), '--owner', owner, '--format', 'json', '--limit', '1000']);
  const items = lista?.items || [];
  const repo = ficha.repo.toLowerCase();
  const fila = [];
  for (const rawId of ids) {
    if (!/^\d+$/.test(String(rawId))) throw new ErroGov('PARAMETRO', `ID inválido na fila: ${rawId}`);
    const n = Number(rawId);
    const item = items.find((i) => i.content?.number === n && (!i.content.repository || String(i.content.repository).toLowerCase() === repo));
    if (!item) throw new ErroGov('CARTAO_INEXISTENTE', `Cartão #${n} não encontrado no Project ${ficha.project.url}.`);
    if (norm(item.status) !== norm(ficha.colunas.a_fazer))
      throw new ErroGov('CARTAO_FORA_DE_A_FAZER', `Cartão #${n} está em "${item.status || 'sem coluna'}"; a fila autônoma exige "${ficha.colunas.a_fazer}".`);
    const tam = item[ficha.sprint?.campos?.tamanho || 'Tamanho'] ?? item.tamanho;
    if (Number(tam) === 8) throw new ErroGov('TAMANHO_OITO_SEM_QUEBRA', `Cartão #${n} tem Tamanho 8 e precisa ser quebrado antes de executar.`);
    const cam = item[ficha.sprint?.campos?.camada || 'Camada'] ?? item.camada;
    if (Array.isArray(cam) && cam.length > 1) throw new ErroGov('MULTICAMADA_SEM_QUEBRA', `Cartão #${n} tem múltiplas camadas e precisa ser quebrado.`);
    const titulo = item.content?.title || item.title || `cartao-${n}`;
    const labels = (item.labels || []).map((l) => String(typeof l === 'string' ? l : l?.name || '').toLowerCase());
    const tipo = labels.some((l) => /\b(bug|fix|hotfix)\b/.test(l)) || /\b(bug|corrig|fix|erro|falha)\b/i.test(titulo) ? 'fix' : 'feature';
    const d = slug(titulo) || `cartao-${n}`;
    fila.push({
      id: n,
      titulo,
      tipo,
      desc: d,
      branch: nomeBranch(ficha, tipo, n, d),
      task: caminhoTask(n, d),
      publicar_hom_automatico: fila.length === 0 && !!ficha.deploy_hom,
    });
  }
  return { ok: true, total: fila.length, deploy_hom_automatico: !!ficha.deploy_hom, fila };
}
