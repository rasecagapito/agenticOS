// Fluxo do cartão: card-start (A Fazer → branch + TASK → Em andamento) e card-pr (push + PR ligado).
import fs from 'node:fs';
import path from 'node:path';
import { norm } from './colunas.mjs';
import { ErroGov } from './erros.mjs';
import { gh, ghJson } from './gh.mjs';
import { arvoreLimpa, branchAtual, branchExiste, git, pushBranch } from './git.mjs';
import { caminhoTask, nomeBranch, slug } from './nomes.mjs';

export function acharCartao(ficha, id) {
  const { owner, number } = ficha.project;
  const lista = ghJson(['project', 'item-list', String(number), '--owner', owner, '--format', 'json', '--limit', '1000']);
  const repo = ficha.repo.toLowerCase();
  const item = (lista?.items || []).find(
    (i) => i.content?.number === Number(id) && (!i.content.repository || String(i.content.repository).toLowerCase() === repo),
  );
  if (!item) throw new ErroGov('CARTAO_INEXISTENTE', `Cartão #${id} não encontrado no Project ${ficha.project.url}.`);
  return { itemId: item.id, titulo: item.content.title || item.title || `cartao-${id}`, status: item.status || '' };
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
  moverCartao(ficha, c.itemId, 'em_andamento');
  return { ok: true, branch, task, acoes };
}

export function corpoPr({ id, titulo, ficha, task }) {
  return [
    `Cartão #${id} — ${titulo}`,
    `Project: ${ficha.project.url}`,
    task ? `TASK: \`${task}\`` : null,
    '',
    `Este PR só entra na \`${ficha.branch_principal}\` com a aprovação do analista (revisão obrigatória). Commit novo depois da aprovação descarta a aprovação.`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function registrarPr(texto, url, agora) {
  if (texto.includes(url)) return texto;
  return texto.replace(/^\| PR \|.*\|$/m, `| PR | ${url} |`).trimEnd() + `\n- ${agora} — PR aberto: ${url}\n`;
}

export function cardPr(cwd, ficha, id, { dryRun = false } = {}) {
  const atual = branchAtual(cwd);
  if (!Object.values(ficha.prefixos_branch).some((p) => atual.startsWith(`${p}${id}-`)))
    throw new ErroGov('BRANCH_ERRADA', `A branch atual "${atual}" não é do cartão #${id}.`);
  if (!arvoreLimpa(cwd)) throw new ErroGov('ARVORE_SUJA');
  const c = acharCartao(ficha, id);
  const dirTasks = path.join(cwd, 'docs', 'tasks');
  const nome = fs.existsSync(dirTasks) ? fs.readdirSync(dirTasks).find((f) => f.startsWith(`TASK-${id}-`)) : null;
  const task = nome ? `docs/tasks/${nome}` : null;
  const existente = ghJson(['pr', 'list', '--repo', ficha.repo, '--head', atual, '--state', 'open', '--json', 'url']) || [];
  const acoes = [
    `git push -u origin ${atual}`,
    existente.length ? `PR já aberto: ${existente[0].url}` : `gh pr create --base ${ficha.branch_principal} --head ${atual}`,
    existente.length ? 'cartão já comentado' : `comentar o link do PR no cartão #${id}`,
    task ? `registrar o PR em ${task}` : 'sem TASK para registrar',
  ];
  if (dryRun) return { ok: true, dry_run: true, branch: atual, acoes };
  pushBranch(cwd, atual, ficha.branch_principal);
  let url = existente[0]?.url;
  if (!url) {
    url = gh(['pr', 'create', '--repo', ficha.repo, '--base', ficha.branch_principal, '--head', atual, '--title', `[#${id}] ${c.titulo}`, '--body', corpoPr({ id, titulo: c.titulo, ficha, task })]).stdout.trim();
    gh(['issue', 'comment', String(id), '--repo', ficha.repo, '--body', `PR aberto: ${url} — aguardando aprovação do analista.`]);
  }
  if (task) {
    const abs = path.join(cwd, task);
    const antes = fs.readFileSync(abs, 'utf8');
    const depois = registrarPr(antes, url, new Date().toISOString());
    if (depois !== antes) {
      fs.writeFileSync(abs, depois);
      git(cwd, ['add', task]);
      git(cwd, ['commit', '-q', '-m', `docs(task): TASK-${id} PR aberto`]);
      pushBranch(cwd, atual, ficha.branch_principal);
    }
  }
  return { ok: true, branch: atual, pr: url, acoes };
}
