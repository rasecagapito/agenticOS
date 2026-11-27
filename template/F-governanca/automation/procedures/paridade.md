# Procedimento: /paridade (Oracle Testing / Diff Zero)

Em migrações ou reescritas de código que já funciona (ex.: consulta SQL Server → SAP HANA, API v1 → v2), usar a versão antiga como **juíza objetiva**. "Pronto" não é opinião da IA — é **`total_diferencas === 0`** em `diff.json`.

## Estrutura de `paridade/<alvo>/`
- `casos.csv`: 20 a 30 combinações reais cobrindo casos de borda (datas limite, filiais, devoluções, cancelados, nulos).
- `config.json`: `alvo`, `ignorar_ordem` (`true/false`), `casas_decimais` (`2`), `colunas_ignoradas`, `comando_antigo`, `comando_novo`.
- `diff.json`: gerado automaticamente agrupando diferenças por `tipo`.

## Passos
1. **Preparar:** criar `paridade/<alvo>/casos.csv` e `config.json` (ver exemplos em `template/paridade/`).
2. **Rodar:** `node .agentic-os/bin/paridade.mjs run paridade/<alvo>` (ou o comparador Python/custom do projeto).
3. **Iterar por grupo:** escolher **um grupo de diferenças por vez** de `diff.json`, corrigir a nova implementação e rodar novamente até `total_diferencas === 0` e `casos_ok === casos_total`.
4. **Validar no Supervisor:** incluir `## Paridade: <alvo>` no `proposal.md` (ou `comando_paridade` na ficha); o `review-check` verifica o critério **B5** automaticamente.

## Proibido
- Declarar migração/reescrita pronta com `total_diferencas > 0`.
- Editar ou remover casos de `casos.csv` para zerar o diff sem aprovação explícita do usuário.
