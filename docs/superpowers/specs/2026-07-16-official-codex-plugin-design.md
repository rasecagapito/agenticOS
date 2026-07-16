# Agentic OS — Plugin oficial para Codex

## Objetivo

Oficializar o repositório Agentic OS como plugin Codex instalável, preservando o pacote existente do Claude Code e a arquitetura multi-provedor já documentada.

## Escopo

- Adicionar e versionar o manifesto oficial `.codex-plugin/plugin.json`.
- Adicionar o catálogo Codex necessário para distribuição pelo repositório GitHub.
- Manter `.claude-plugin/` funcional e alinhar seus metadados com a versão publicada.
- Atualizar o README com instruções separadas para Codex e Claude Code.
- Validar manifests, caminhos, versões e descoberta da skill antes da publicação.
- Publicar as alterações em uma branch dedicada e abrir uma pull request para `main`.

## Fora de escopo

- Criar novas funcionalidades no Agentic OS.
- Alterar templates, procedimentos ou regras de conformidade.
- Criar uma extensão nativa para Gemini ou outros provedores.
- Mudar a estrutura gerada dentro dos projetos que adotam o Agentic OS.
- Duplicar a skill ou manter cópias específicas por provedor.

## Arquitetura

O repositório continuará sendo um único pacote universal na raiz. O conteúdo funcional permanece compartilhado, enquanto cada plataforma utiliza apenas seu adaptador de empacotamento:

```text
agenticOS/
├── .agents/plugins/marketplace.json   # catálogo para Codex
├── .codex-plugin/plugin.json          # manifesto para Codex
├── .claude-plugin/
│   ├── marketplace.json               # catálogo para Claude Code
│   └── plugin.json                    # manifesto para Claude Code
├── skills/agentic-os/SKILL.md         # núcleo único
├── docs/                              # documentação compartilhada
├── template/                          # templates compartilhados
├── README.md
└── LICENSE
```

O marketplace Codex apontará para a raiz do pacote. Nenhum diretório funcional será movido, evitando quebra de referências relativas e preservando instalações já existentes.

## Compatibilidade por plataforma

### Codex

- Descobre a skill por `.codex-plugin/plugin.json`.
- Usa o catálogo `.agents/plugins/marketplace.json` para distribuição pelo GitHub.
- Mantém `skills` apontando para `./skills/`.
- Utiliza `AGENTS.md` e os procedimentos provider-neutros nos projetos gerados.

### Claude Code

- Continua usando `.claude-plugin/plugin.json` e `.claude-plugin/marketplace.json`.
- Mantém os comandos e wrappers Claude dentro dos templates.
- Recebe apenas alinhamento de versão e documentação de instalação.

### Gemini e demais provedores

- Não recebem manifests novos neste trabalho.
- Continuam suportados pela camada multi-provedor: `AGENTS.md`, `GEMINI.md`, `providers/registry.md`, `memory/handoff.md` e `automation/procedures/`.

## Metadados e versões

- Nome canônico: `agentic-os`.
- Versão publicada: `1.3.0`.
- Manifestos Codex e Claude Code devem declarar a mesma versão funcional.
- Cachebusters locais do Codex não serão publicados como versão oficial.
- O marketplace do Claude Code, atualmente divergente, será alinhado para `1.3.0`.

## Instalação documentada

O README apresentará duas rotas independentes:

1. Claude Code: adicionar o marketplace Git e instalar `agentic-os@agentic-os`.
2. Codex: adicionar o repositório como marketplace, instalar o plugin pela superfície disponível e iniciar uma nova tarefa para carregar a skill.

Se a versão local do Codex não oferecer instalação pelo terminal, o README direcionará para o diretório de Plugins do aplicativo, sem documentar comandos inexistentes.

## Tratamento de estado local

O arquivo `skills/agentic-os/SKILL.md` já possui uma alteração local de descrição. Ela será preservada e tratada como parte compatível do pacote, sem reverter conteúdo do usuário.

Os commits usarão caminhos explícitos. Nenhuma mudança fora do escopo será adicionada silenciosamente.

## Validação

Antes da publicação serão executados:

1. Validador oficial do manifesto Codex.
2. Validação da skill.
3. Parse JSON dos manifests e marketplaces.
4. Verificação de que todos os caminhos declarados existem e permanecem dentro do pacote.
5. Conferência de consistência de nome e versão entre os metadados.
6. Teste de descoberta/instalação usando uma cópia limpa do repositório ou marketplace local.
7. Revisão do diff completo e do status Git antes do commit final.

## Critérios de aceite

- O plugin Codex passa no validador oficial.
- A skill `agentic-os` é descoberta a partir do manifesto Codex.
- O fluxo Claude Code continua apontando para o mesmo núcleo funcional.
- Gemini e outros provedores não sofrem alteração estrutural.
- O README contém instruções compatíveis com as superfícies realmente disponíveis.
- Não existem versões divergentes entre manifestos publicados.
- O repositório pode ser distribuído sem duplicar a skill ou mover seu conteúdo.
