# Procedimento: /versao (Controle de Versões e Releases)

Fonte única do controle de versões no GitHub.
Script: `node .agentic-os/bin/github-setup.mjs`.

## `/versao verificar`
1. Rodar `node .agentic-os/bin/github-setup.mjs release-check` na branch principal limpa e sincronizada.
2. Regras verificadas:
   - Todos os cartões do escopo estão em `Concluído` (`Backlog` ignorado por padrão). Se houver pendente (`VERSAO_BLOQUEADA`), listar os cartões e parar.
   - 1ª versão fecha como `v1.0.0`.
   - Versões seguintes exigem entregas novas concluídas desde a última tag (`fix/` → patch, `feature/` → minor, `--major` → major).
3. Mostrar a versão sugerida e o changelog gerado.

## `/versao publicar`
1. Rodar primeiro `node .agentic-os/bin/github-setup.mjs release-publish --dry-run` (passar `--major|--minor|--patch|--versao` se solicitado).
2. Mostrar: versão alvo, SHA na principal, lista de cartões/commits e notas da release.
3. Pedir confirmação explícita do usuário ("sim").
4. Só após o "sim": `node .agentic-os/bin/github-setup.mjs release-publish --confirmo-release` (+ flag de bump escolhida).
5. Nunca publicar a partir de branch de cartão nem com árvore suja.
