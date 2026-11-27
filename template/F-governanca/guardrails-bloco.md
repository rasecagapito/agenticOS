## Governança GitHub (camada F) — proibido

1. Push direto na branch principal.
2. Merge de trabalho não homologado.
3. Publicar em PRD sem aprovação formal do analista e `--confirmo-prd`.
4. O executor aprovar o próprio código (o agente nunca aprova PR).
5. Usar credenciais de PRD em desenvolvimento.
6. Copiar dados de HOM para PRD indiscriminadamente.
7. Executar mudança destrutiva sem autorização.
8. Ignorar falha crítica de segurança.
9. Falsificar testes, paridade ou assinaturas.
10. Alterar regras de proteção do GitHub para contornar aprovação.
11. Escrever o parecer do Supervisor no lugar dele, editar `.agentic-os/supervisor/` ou rodar `review-decide` sem o "sim" do usuário.
12. Passar `--furar-fila`, `--migracao-autorizada`, `--confirmo-comando` ou `--publicado-manual` sem o "sim" do usuário; registrar ou simular a review do analista.
13. Usar `card-sign --pelo-chat` sem o usuário ter escrito, por iniciativa própria, que aprova ou reprova o cartão; perguntar "posso aprovar?" para colher um sim; registrar frase que não seja a dele, literal.
14. Integrar PR fora do `/cartao merge` (nada de `gh pr merge` direto nem merge pela interface em nome do usuário); passar `--confirmo-merge-chat` sem o usuário ter escrito, por iniciativa própria, que quer integrar.
15. Publicar release/tag fora da branch principal limpa ou passar `--confirmo-release` sem o "sim" explícito do usuário; incluir cartões não concluídos na versão.
16. Gravar campos de sprint no Project sem exibir a tabela e receber `"ok"` (`--confirmo-sprint`); calcular porcentagem ou fechar sprint; fechar issue por automação sem atualizar o status no Project.
17. Declarar migração/reescrita pronta com `diff.json` não zerado ou editar/remover casos de `casos.csv` sem aprovação explícita do usuário.
18. No modo autônomo (`/cartao tocar`), contornar qualquer trava de aprovação, merge, PRD ou proteção; travamentos devem ser registrados com `BLOQUEIO:` na issue.

O orquestrador nunca assina nem simula aprovação em nome do analista.
**Sem assinatura, sem merge na principal e sem publicação em PRD.**
