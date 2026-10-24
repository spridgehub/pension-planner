"""Build the engine's data files from the raw sources.

Raw files (data/raw/, not committed; re-download with the URLs below):
  JSTdatasetR6.dta  Jorda-Schularick-Taylor Macrohistory Database, release 6
                    https://www.macrohistory.net/app/download/9834512469/JSTdatasetR6.xlsx (Stata file despite the name)
  ons_qx_england_2022based.xlsx  ONS past and projected qx, 2022-based England life tables, ages 0-125
                    https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/lifeexpectancies/adhocs/2652pastandprojectedperiodandcohortmortalityratesqfromthe2022basedenglandlifetablesages0to125
"""
import json, os
import pandas as pd
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
RAW = os.path.join(DATA, "raw")

# JST ends in 2020. These five years are approximate published figures entered by hand
# (CPI annual average change; FTSE All-Share total return; FTSE Actuaries UK Gilts All Stocks
# total return; average Bank Rate; average 10-year gilt yield). Treat as provisional and replace with official series if available.
EXTENSION = {
    2021: dict(cpi=0.026, eq=0.183, bond=-0.052, bill=0.001, lt=0.0079),
    2022: dict(cpi=0.091, eq=0.003, bond=-0.250, bill=0.015, lt=0.0240),
    2023: dict(cpi=0.073, eq=0.079, bond=0.037, bill=0.047, lt=0.0407),
    2024: dict(cpi=0.025, eq=0.095, bond=-0.033, bill=0.051, lt=0.0420),
    2025: dict(cpi=0.034, eq=0.240, bond=0.050, bill=0.043, lt=0.0460),
}


def history():
    d = pd.read_stata(os.path.join(RAW, "JSTdatasetR6.dta"))
    u = d[d.iso == "GBR"].sort_values("year")
    u = u[["year", "cpi", "eq_tr", "bond_tr", "bill_rate", "ltrate"]].dropna()
    rows = []
    prev = None
    for r in u.itertuples():
        if prev is not None:
            rows.append(dict(year=int(r.year), inflation=round(r.cpi / prev - 1, 5),
                             equity=round(float(r.eq_tr), 5), bonds=round(float(r.bond_tr), 5),
                             cash=round(float(r.bill_rate), 5), longYield=round(float(r.ltrate) / 100, 5), source="JST R6"))
        prev = r.cpi
    for y, e in EXTENSION.items():
        rows.append(dict(year=y, inflation=e["cpi"], equity=e["eq"], bonds=e["bond"], cash=e["bill"], longYield=e["lt"],
                         source="approx. published (provisional)"))
    out = dict(
        description="UK annual nominal total returns and CPI inflation",
        sources={"JST R6": "Jorda, Knoll, Kuvshinov, Schularick & Taylor, Macrohistory Database R6 (macrohistory.net)",
                 "approx. published (provisional)": "Hand-entered 2021-2025: ONS CPI, FTSE All-Share TR, FTSE Actuaries Gilts All Stocks TR, Bank Rate"},
        rows=rows)
    with open(os.path.join(DATA, "uk-history.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("history", rows[0]["year"], "-", rows[-1]["year"], len(rows), "years")


def mortality():
    wb = openpyxl.load_workbook(os.path.join(RAW, "ons_qx_england_2022based.xlsx"), read_only=True, data_only=True)
    out = dict(description="ONS 2022-based England life tables, principal projection, period qx by calendar year (diagonals give cohort rates)",
               source="ONS adhoc 2652, periodcohort2022basedqxen1981onwardsfinal.xlsx", minAge=40, maxAge=125)
    for sex, sheet in (("male", "Period Males qx"), ("female", "Period Females qx")):
        rows = list(wb[sheet].iter_rows(values_only=True))
        header = rows[3]
        years = [int(str(h).split()[-1]) for h in header[1:] if h is not None]
        table = {}
        for r in rows[4:]:
            if r[0] is None or not isinstance(r[0], (int, float)):
                continue
            age = int(r[0])
            if age < out["minAge"]:
                continue
            table[age] = [round(v / 100000, 6) if v is not None else None for v in r[1:1 + len(years)]]
        first = years.index(2020)
        out["years"] = years[first:]
        out[sex] = [table[a][first:] for a in range(out["minAge"], out["maxAge"] + 1)]
    with open(os.path.join(DATA, "ons-qx-2022.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("mortality years", out["years"][0], "-", out["years"][-1])


if __name__ == "__main__":
    history()
    mortality()
