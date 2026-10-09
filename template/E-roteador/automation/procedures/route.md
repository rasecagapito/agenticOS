# Procedimento: route (roteador de modelos)

> Fonte única, provider-neutra. A sessão principal é a **recepção**: classifica via hook, delega,
> acompanha e devolve o resumo. Não executa o trabalho ela mesma.

## Quando aplica
Toda mensagem que chega com um bloco `ROTEADOR: ... subagent_type="<agente>"` no contexto.
Sem bloco (prefixo `!` = modo bash, `/` = comando, ou roteador desligado) → atender normalmente.

## Níveis
| Tier | Classe | Para |
|---|---|---|
| básico | simples | mudança pequena e localizada |
| intermediário | rotina | funcionalidade comum, complexidade moderada |
| avançado | difícil | causa desconhecida, mudança ampla, arquitetura, maior risco |

Agente e modelo de cada tier vivem em `.claude/router/config.json`. Dois modos (`decision_mode`):
- `jev` (padrão): o classificador **escolhe o subagente**; só confiança < limiar sobe um nível.
  Recebe também o pedido anterior da sessão, para respostas curtas ("sim", "pode seguir").
- `regras`: o classificador só dá a classe; risco > limiar e confiança < limiar sobem um nível cada.
Opcional (v1.7): `rules` (regex → tier) e `continuacao` (confirmação curta → mesmo tier) decidem sem
chamar o classificador; `policy: probabilidades` sobe só se P(tiers acima) ≥ limiar; `escalate_on` eleva
o piso por perguntas extras. A origem aparece no bloco ROTEADOR (`regra:<nome>`, `continuacao`).
Teto = avançado; classificador indisponível → `fallback_tier`. Risco e confiança são estimativas
orientativas, não probabilidades comprovadas.

## Passos da recepção
1. Ler o bloco ROTEADOR. Usar **exatamente** o `subagent_type` indicado.
2. Delegar com a ferramenta Agent (uma vez; nunca duplicar) passando: objetivo, critério de conclusão,
   contexto necessário, restrições aplicáveis e arquivos/componentes relevantes já identificados.
3. Ler o JSON de saída do subagente:
   - `concluido` → responder ao usuário só com o resumo: **feito / verificações / pendências**.
   - `pergunta` → repassar a pergunta ao usuário, sem inventar resposta.
   - `escalar` → rodar `node .claude/router/log-escalation.mjs <agente-atual> "<motivo>"`.
     Saída = próximo `subagent_type` → re-delegar com o progresso e as `descobertas`.
     Saída `LIMITE` → parar e reportar ao usuário o estado e as pendências.
4. Nunca simular delegação, verificação ou registro que não ocorreu. Se a ferramenta Agent ou o
   subagente indicado não existir, dizer isso ao usuário e pedir instrução.

## Controle do usuário
- `nivel:basico|intermediario|avancado <pedido>` → força o tier (pula o classificador).
- `!` no início → modo bash do Claude Code (não chega ao modelo).
- `/comando` → comandos passam sem roteamento.

## Registro
Hook grava cada decisão em `.claude/router/decisions.jsonl` (horário, prévia + hash do pedido,
classe, confiança, risco, tier, subagente, justificativa, tempo do classificador, erro). A statusline
mostra a última decisão. Não gravar credenciais nem o pedido completo.
