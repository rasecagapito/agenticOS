#!/usr/bin/env node
// Instala/atualiza a camada F (Governança GitHub) num projeto. Idempotente.
// Uso: node scripts/install-governanca.mjs <projeto> --ficha-json <arquivo> [--dry-run]
//  - Valida e grava .agentic-os/governanca.json (preserva colunas_ids, ids do Project e protecao_aplicada já gravados).
//  - Copia scripts/github-setup.mjs + scripts/governanca/ para .agentic-os/bin/ (o procedimento usa esta cópia).
//  - Copia procedimento /cartao, comando e docs/tasks/README.md (este só se não existir).
//  - Upsert de blocos marcados em automation/guardrails.md, .github/CODEOWNERS e .gitignore.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'template', 'F-governanca');
const { ARQ_FICHA, validarFicha } = await import(pathToFileURL(path.join(REPO, 'scripts', 'governanca', 'ficha.mjs')).href);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function upsertBloco(texto, id, conteudo, marca = (s) => `<!-- ${s} -->`) {
  const ini = marca(`agentic-os:${id}:start`);
  const fim = marca(`agentic-os:${id}:end`);
  const bloco = `${ini}\n${conteudo.trim()}\n${fim}`;
  const re = new RegExp(`${esc(ini)}[\\s\\S]*?${esc(fim)}`);
  if (re.test(texto)) return texto.replace(re, () => bloco);
  return (texto.trimEnd() ? texto.trimEnd() + '\n\n' : '') + bloco + '\n';
}

function mesclarFicha(nova, antiga) {
  if (!antiga) return nova;
  const vazio = (v) => v === undefined || v === null || v === '' || (typeof v === 'object' && !Object.keys(v).length);
  return {
    ...nova,
    project: {
      ...nova.project,
      id: nova.project.id || antiga.project?.id || '',
      campo_status_id: nova.project.campo_status_id || antiga.project?.campo_status_id || '',
    },
    colunas_ids: vazio(nova.colunas_ids) ? antiga.colunas_ids || {} : nova.colunas_ids,
    protecao_aplicada: vazio(nova.protecao_aplicada) ? antiga.protecao_aplicada ?? null : nova.protecao_aplicada,
  };
}

export function instalar(dest, ficha, { dryRun = false } = {}) {
  const erros = validarFicha(ficha);
  if (erros.length) throw new Error(`Ficha inválida: ${erros.join('; ')}`);
  const plano = [];
  const escrever = (rel, conteudo) => {
    const abs = path.join(dest, rel);
    const atual = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (atual === conteudo) return;
    plano.push(`${atual === null ? 'criar' : 'atualizar'} ${rel}`);
    if (dryRun) return;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, conteudo);
  };
  const ler = (rel) => (fs.existsSync(path.join(dest, rel)) ? fs.readFileSync(path.join(dest, rel), 'utf8') : '');
  const lerSrc = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

  let antiga = null;
  try {
    antiga = JSON.parse(ler(ARQ_FICHA) || 'null');
  } catch {}
  escrever(ARQ_FICHA, JSON.stringify(mesclarFicha(ficha, antiga), null, 2) + '\n');

  escrever('.agentic-os/bin/github-setup.mjs', fs.readFileSync(path.join(REPO, 'scripts', 'github-setup.mjs'), 'utf8'));
  for (const f of fs.readdirSync(path.join(REPO, 'scripts', 'governanca')))
    escrever(`.agentic-os/bin/governanca/${f}`, fs.readFileSync(path.join(REPO, 'scripts', 'governanca', f), 'utf8'));
  const versao = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  escrever('.agentic-os/bin/VERSION', `${versao}\n`);

  escrever('automation/procedures/cartao.md', lerSrc('automation/procedures/cartao.md'));
  escrever('.claude/commands/cartao.md', lerSrc('.claude/commands/cartao.md'));
  if (!fs.existsSync(path.join(dest, 'docs/tasks/README.md'))) escrever('docs/tasks/README.md', lerSrc('docs/tasks/README.md'));

  escrever('automation/guardrails.md', upsertBloco(ler('automation/guardrails.md'), 'governanca', lerSrc('guardrails-bloco.md')));
  const hash = (s) => `# ${s}`;
  const donos = ficha.analistas.map((l) => `@${l}`).join(' ');
  escrever('.github/CODEOWNERS', upsertBloco(ler('.github/CODEOWNERS'), 'governanca', `* ${donos}`, hash));
  escrever('.gitignore', upsertBloco(ler('.gitignore'), 'governanca', '.agentic-os/wizard-estado.json', hash));
  return { ok: true, dry_run: dryRun, plano };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const dest = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
  const i = args.indexOf('--ficha-json');
  try {
    if (i < 0 || !args[i + 1]) throw new Error('Uso: install-governanca.mjs <projeto> --ficha-json <arquivo> [--dry-run]');
    const ficha = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'));
    const r = instalar(dest, ficha, { dryRun: args.includes('--dry-run') });
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, erro: e.message }) + '\n');
    process.exit(2);
  }
}
