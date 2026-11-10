// Executa um comando de shell com limite de tempo pelo runner, que mata a árvore de processos no estouro.
// Usado pelo B1 do Supervisor (testes) e pelas etapas do HOM.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tokenAgenteAtual } from './gh.mjs';

const RUNNER = fileURLToPath(new URL('./rodar-comando.mjs', import.meta.url));
const MARCADOR_TEMPO = '__AGENTIC_OS_TEMPO_ESGOTADO__';

// semVariaveis: nomes que o comando não deve herdar (ex.: a variável do token do agente).
// GH_TOKEN também sai, mas só se for o token do agente (o do usuário continua valendo).
export function executar(cwd, comando, limiteMs, { semVariaveis = [] } = {}) {
  const env = { ...process.env };
  for (const nome of semVariaveis) delete env[nome];
  const tok = tokenAgenteAtual();
  if (tok && env.GH_TOKEN === tok) delete env.GH_TOKEN;
  const r = spawnSync(process.execPath, [RUNNER, comando, String(limiteMs)], {
    cwd, encoding: 'utf8', env, timeout: limiteMs + 30000, maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error)
    return { ok: false, codigo: null, tempo_esgotado: r.error.code === 'ETIMEDOUT', erroCodigo: r.error.code || 'erro', erro: r.error.message, saida: '' };
  const bruta = `${r.stdout || ''}${r.stderr || ''}`;
  const tempo = bruta.includes(MARCADOR_TEMPO);
  return { ok: !tempo && r.status === 0, codigo: r.status, tempo_esgotado: tempo, erroCodigo: null, erro: null, saida: bruta.replace(MARCADOR_TEMPO, '').trim() };
}
