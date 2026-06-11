Mostra o estado atual do projeto. Executa em ordem:

1. Ler `CLAUDE.md` — secção "Estado do Projeto"
2. Ler ficheiro mais recente em `memory/history/` — extrair resumo e próximos passos
3. Ler módulos relevantes de `context/` conforme fase atual

Apresentar em formato compacto:

---
**Fase**: [fase atual]
**Última sessão**: [data] — [resumo 1 linha]

**Contexto carregado**:
- [módulos de /context/ relevantes para fase atual]

**Próximos passos**:
1. [top 3 pendências]
---
