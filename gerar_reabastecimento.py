"""
Gera a planilha de reabastecimento por loja a partir do export bruto do OneBeat
e da base RITMO POSICAO, substituindo o fluxo antigo (formulas matriciais +
macros gravadas manualmente por loja).

Uso:
    python gerar_reabastecimento.py --onebeat "export_onebeat.xlsx" \
                                     --ritmo "arquivo_anterior.xlsm" \
                                     --anterior "arquivo_anterior.xlsm" \
                                     --out "reabastecimento_novo.xlsx"

- --onebeat: export bruto do OneBeat (aba unica, colunas Loja/Codigo/Rotulo/
  Alvo/Estoque Loja/Estoque CD/Reposicao). Pode ter linhas de rodape
  ("Total", "Filtros aplicados...") -- sao descartadas automaticamente.
- --ritmo: arquivo (xlsx/xlsm) que contenha a aba 'RITMO POSIÇÃO'. Se nao for
  passado, tenta usar o mesmo valor de --anterior.
- --anterior: ultima planilha final gerada (para preservar os valores de
  ENVIAR que o time already editou manualmente por loja/codigo).
- --out: caminho do arquivo novo a ser gerado.

PARA ADICIONAR UMA LOJA NOVA: so incluir o codigo de 3 letras da aba na lista
STORE_SHEETS abaixo. Nao precisa mexer em formula nenhuma.
"""
import argparse
import re
import sys
from datetime import datetime

import openpyxl
import pandas as pd

# ---------------------------------------------------------------------------
# CONFIG: lista de lojas / abas. Adicionar uma loja nova = uma linha aqui.
# ---------------------------------------------------------------------------
STORE_SHEETS = ["ACV", "ACR", "MCO", "CSH", "REC", "ABI", "VIA", "ICA", "RIO", "SHT", "BSH"]

STORE_SHEET_COLUMNS = ["CÓDIGO", "NOME", "SUJESTÃO", "DISPONIVEL", "POSIÇÃO", "CLASSE", "LOJA", "ENVIAR"]


def load_onebeat_export(path: str, sheet: str | None = None) -> pd.DataFrame:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet] if sheet else wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    header = [str(h).strip() if h else h for h in rows[0]]
    data = rows[1:]
    df = pd.DataFrame(data, columns=header)

    rename = {
        "Loja": "Loja", "Codigo": "Codigo", "Código": "Codigo",
        "Rótulo": "Rotulo", "Rotulo": "Rotulo",
        "Alvo": "Alvo", "Estoque Loja": "EstoqueLoja", "Estoque CD": "EstoqueCD",
        "Reposição": "Reposicao", "Reposicao": "Reposicao",
    }
    df = df.rename(columns={c: rename.get(c, c) for c in df.columns})

    required = ["Loja", "Codigo", "Rotulo", "Alvo", "EstoqueLoja", "EstoqueCD", "Reposicao"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Export do onebeat sem as colunas esperadas: {missing}. Colunas encontradas: {list(df.columns)}")

    # descarta rodape (linha "Total", linha de filtros aplicados, linhas em branco)
    df = df[df["Codigo"].notna() & df["Loja"].notna()]
    df = df[df["Loja"].astype(str).str.strip().str.lower() != "total"]
    df["Codigo"] = df["Codigo"].astype(str).str.strip()
    df["Reposicao"] = pd.to_numeric(df["Reposicao"], errors="coerce").fillna(0)
    # so entra no reabastecimento quem tem sugestao de reposicao > 0
    df = df[df["Reposicao"] > 0]
    df = df.drop_duplicates(subset=["Loja", "Codigo"], keep="first")
    return df[required].reset_index(drop=True)


def load_ritmo(path: str, sheet: str = "RITMO POSIÇÃO") -> pd.DataFrame:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    df = pd.DataFrame(rows[1:], columns=header)
    # colunas usadas pelo processo antigo: B=RECURSO, K=DISPONIVEL, M=SITUACAO, Q=CLASSE REC
    col_recurso = header[1]
    col_disp = header[10]
    col_situ = header[12]
    col_classe = header[16]
    out = df[[col_recurso, col_disp, col_situ, col_classe]].copy()
    out.columns = ["Codigo", "dispo", "situacao", "classe"]
    out = out[out["Codigo"].notna()]
    out["Codigo"] = out["Codigo"].astype(str).str.strip()
    out = out.drop_duplicates(subset="Codigo", keep="first")
    return out.reset_index(drop=True)


def load_previous_enviar(path: str | None) -> dict:
    """Le a ultima planilha final gerada e devolve {(loja, codigo): enviar}
    para preservar ajustes manuais feitos pelo time."""
    if not path:
        return {}
    wb = openpyxl.load_workbook(path, keep_vba=path.lower().endswith(".xlsm"), data_only=True)
    prev = {}
    for store in STORE_SHEETS:
        if store not in wb.sheetnames:
            continue
        ws = wb[store]
        for r in range(2, ws.max_row + 1):
            codigo = ws.cell(r, 1).value
            loja = ws.cell(r, 7).value
            enviar = ws.cell(r, 8).value
            if codigo and loja and enviar is not None and not str(enviar).startswith("="):
                prev[(str(loja).strip(), str(codigo).strip())] = enviar
    return prev


def assign_store(loja_text: str) -> str | None:
    if not isinstance(loja_text, str):
        return None
    tokens = re.split(r"\s+", loja_text.strip())
    for t in tokens:
        if t.upper() in STORE_SHEETS:
            return t.upper()
    return None


def build_analise(onebeat_df: pd.DataFrame, ritmo_df: pd.DataFrame) -> pd.DataFrame:
    df = onebeat_df.merge(ritmo_df, on="Codigo", how="left")
    df["dispo"] = df["dispo"].fillna(0)
    df["classe"] = df["classe"].fillna("")
    df["situacao"] = df["situacao"].fillna("")
    df["subclasse"] = df["classe"].astype(str).str[:7]
    df["aba"] = df["Loja"].apply(assign_store)
    return df


def build_store_sheets(analise_df: pd.DataFrame, prev_enviar: dict) -> dict:
    sheets = {}
    for store in STORE_SHEETS:
        sub = analise_df[analise_df["aba"] == store].copy()
        rows = []
        for _, row in sub.iterrows():
            key = (str(row["Loja"]).strip(), str(row["Codigo"]).strip())
            enviar = prev_enviar.get(key, row["Reposicao"])
            rows.append({
                "CÓDIGO": row["Codigo"],
                "NOME": row["Rotulo"],
                "SUJESTÃO": row["Reposicao"],
                "DISPONIVEL": row["dispo"],
                "POSIÇÃO": row["situacao"],
                "CLASSE": row["classe"],
                "LOJA": row["Loja"],
                "ENVIAR": enviar,
            })
        sheets[store] = pd.DataFrame(rows, columns=STORE_SHEET_COLUMNS)
    return sheets


def build_alertas(analise_df: pd.DataFrame) -> pd.DataFrame:
    contagem = analise_df.groupby("aba").size().to_dict()
    linhas = []
    for store in STORE_SHEETS:
        n = contagem.get(store, 0)
        status = "OK" if n > 0 else "SEM CODIGOS -- confira o filtro do export do OneBeat para esta loja"
        linhas.append({"Loja (aba)": store, "Codigos recebidos": n, "Status": status})
    sem_aba = analise_df[analise_df["aba"].isna()]
    if len(sem_aba):
        for loja in sem_aba["Loja"].unique():
            linhas.append({
                "Loja (aba)": loja,
                "Codigos recebidos": int((sem_aba["Loja"] == loja).sum()),
                "Status": "LOJA SEM ABA CORRESPONDENTE -- adicionar em STORE_SHEETS no script",
            })
    return pd.DataFrame(linhas)


def write_output(path: str, analise_df: pd.DataFrame, store_sheets: dict, alertas_df: pd.DataFrame):
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        alertas_df.to_excel(writer, sheet_name="ALERTAS", index=False)
        analise_cols = ["Loja", "Codigo", "Rotulo", "Alvo", "EstoqueLoja", "EstoqueCD", "Reposicao", "dispo", "classe", "situacao", "subclasse"]
        analise_df[analise_cols].to_excel(writer, sheet_name="analise", index=False)
        for store, df in store_sheets.items():
            df.to_excel(writer, sheet_name=store, index=False)

    wb = openpyxl.load_workbook(path)
    ws = wb["ALERTAS"]
    ws.insert_rows(1)
    ws["A1"].value = f"Gerado em {datetime.now():%d/%m/%Y %H:%M}"
    for col, width in zip("ABC", (35, 20, 70)):
        ws.column_dimensions[col].width = width
    wb.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--onebeat", required=True, help="export bruto do OneBeat (.xlsx)")
    ap.add_argument("--ritmo", help="arquivo com a aba RITMO POSIÇÃO (default: mesmo de --anterior)")
    ap.add_argument("--anterior", help="ultima planilha final gerada, para preservar ENVIAR")
    ap.add_argument("--out", required=True, help="arquivo de saida (.xlsx)")
    args = ap.parse_args()

    ritmo_path = args.ritmo or args.anterior
    if not ritmo_path:
        sys.exit("Preciso de --ritmo ou --anterior apontando para um arquivo com a aba 'RITMO POSIÇÃO'.")

    print("Lendo export do OneBeat...")
    onebeat_df = load_onebeat_export(args.onebeat)
    print(f"  {len(onebeat_df)} linhas validas, {onebeat_df['Loja'].nunique()} lojas distintas")

    print("Lendo RITMO POSIÇÃO...")
    ritmo_df = load_ritmo(ritmo_path)
    print(f"  {len(ritmo_df)} codigos")

    print("Lendo ENVIAR anterior (se houver)...")
    prev_enviar = load_previous_enviar(args.anterior)
    print(f"  {len(prev_enviar)} valores de ENVIAR preservados")

    analise_df = build_analise(onebeat_df, ritmo_df)
    store_sheets = build_store_sheets(analise_df, prev_enviar)
    alertas_df = build_alertas(analise_df)

    write_output(args.out, analise_df, store_sheets, alertas_df)

    print()
    print("=== RESUMO ===")
    print(alertas_df.to_string(index=False))
    print()
    print(f"Arquivo gerado: {args.out}")


if __name__ == "__main__":
    main()
