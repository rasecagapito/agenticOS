#!/usr/bin/env python3
"""Template Python de comparador de paridade (zero dependências externas).

Use para migrações de banco/relatório (ex.: SQL Server -> SAP HANA):
1. Implemente `rodar_antigo(caso)` e `rodar_novo(caso)` devolvendo listas de dicts.
2. Rode: `python template/paridade/comparador-python.py paridade/<alvo>`.
3. Corrija um grupo de `diff.json` por vez até `total_diferencas == 0`.
"""
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def normalizar_valor(v, casas=2):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return round(float(v), casas)
    if isinstance(v, str):
        t = v.strip()
        try:
            return round(float(t), casas)
        except ValueError:
            return t
    return v


def normalizar_registro(reg, casas=2, ignorar=()):
    ign = set(ignorar)
    return {k: normalizar_valor(reg[k], casas) for k in sorted(reg) if k not in ign}


def rodar_antigo(caso: dict) -> list[dict]:
    """Substituir pela execução na versão antiga (oráculo)."""
    raise NotImplementedError("Implementar consulta/execução antiga")


def rodar_novo(caso: dict) -> list[dict]:
    """Substituir pela execução na versão nova."""
    raise NotImplementedError("Implementar consulta/execução nova")


def comparar(antigo: list[dict], novo: list[dict], cfg: dict) -> list[dict]:
    casas = int(cfg.get("casas_decimais", 2))
    ign = cfg.get("colunas_ignoradas", [])
    norm_a = [normalizar_registro(r, casas, ign) for r in antigo]
    norm_n = [normalizar_registro(r, casas, ign) for r in novo]
    if cfg.get("ignorar_ordem", True):
        norm_a.sort(key=lambda r: json.dumps(r, sort_keys=True))
        norm_n.sort(key=lambda r: json.dumps(r, sort_keys=True))
    diffs = []
    if len(norm_a) != len(norm_n):
        diffs.append({"tipo": "contagem_linhas", "antigo": len(norm_a), "novo": len(norm_n)})
    for i in range(min(len(norm_a), len(norm_n))):
        a, n = norm_a[i], norm_n[i]
        for col in sorted(set(a) | set(n)):
            if a.get(col) != n.get(col):
                num = isinstance(a.get(col), (int, float)) and isinstance(n.get(col), (int, float))
                diffs.append({
                    "tipo": "divergencia_numerica" if num else "divergencia_campo",
                    "coluna": col,
                    "linha_indice": i,
                    "antigo": a.get(col),
                    "novo": n.get(col),
                })
    return diffs


def main():
    alvo = Path(sys.argv[1] if len(sys.argv) > 1 else "paridade/exemplo")
    cfg = json.loads((alvo / "config.json").read_text(encoding="utf-8"))
    with (alvo / "casos.csv").open(encoding="utf-8", newline="") as f:
        casos = list(csv.DictReader(f))
    grupos = {}
    casos_ok = 0
    total_diferencas = 0
    for idx, caso in enumerate(casos, start=2):
        try:
            diffs = comparar(rodar_antigo(caso), rodar_novo(caso), cfg)
            if not diffs:
                casos_ok += 1
            else:
                total_diferencas += len(diffs)
                for d in diffs:
                    g = grupos.setdefault(d["tipo"], {"tipo": d["tipo"], "ocorrencias": 0, "exemplos": []})
                    g["ocorrencias"] += 1
                    if len(g["exemplos"]) < 5:
                        g["exemplos"].append({"caso_linha": idx, **d})
        except Exception as exc:
            total_diferencas += 1
            g = grupos.setdefault("erro_execucao", {"tipo": "erro_execucao", "ocorrencias": 0, "exemplos": []})
            g["ocorrencias"] += 1
            if len(g["exemplos"]) < 5:
                g["exemplos"].append({"caso_linha": idx, "erro": str(exc)})

    out = {
        "alvo": cfg.get("alvo", alvo.name),
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "casos_total": len(casos),
        "casos_ok": casos_ok,
        "total_diferencas": total_diferencas,
        "grupos": list(grupos.values()),
    }
    (alvo / "diff.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(out, indent=2, ensure_ascii=False))
    sys.exit(0 if total_diferencas == 0 else 2)


if __name__ == "__main__":
    main()
