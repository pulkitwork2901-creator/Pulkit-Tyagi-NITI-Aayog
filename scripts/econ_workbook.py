"""
Series from the division's "India Economic Indicators" workbook.

The workbook (data/uploads/india-economic-indicators.xlsx) was compiled from
official releases, with every value cited on its Sources sheet and gaps listed
on its Coverage and Gaps sheet. It gives history for series the board
otherwise had only one or two readings of:

  Monthly Data   bank credit by sector (RBI), gross GST (Ministry of Finance),
                 Centre's fiscal deficit and capital expenditure as % of the
                 budget estimate (CGA), IIP growth on the 2022-23 base (MoSPI),
                 HSBC India manufacturing and services PMI (S&P Global)
  Quarterly Data current account balance, US$ bn and % of GDP (RBI)

Values are used as recorded. A newer reading typed into the manual sheet takes
over the latest point (see build_indicators.merge_history).

Usage: imported by build_indicators.py; `python3 scripts/econ_workbook.py` prints a summary.
"""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PATH = ROOT / "data" / "uploads" / "india-economic-indicators.xlsx"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# id -> (header starts with, unit, decimals, source, url, compare, note)
#   compare: "prev" = previous period, "year" = same period a year earlier
MONTHLY = {
    "credit_agri": ("1a.", "% YoY", 1, "RBI, Sectoral Deployment of Bank Credit", "https://rbi.org.in/scripts/Data_Sectoral_Deployment.aspx", "year",
                    "Growth as first published for each month (select banks covering about 92 to 95% of non-food credit). July 2023 to June 2025 exclude the HDFC merger, as RBI's headline does. From December 2025 RBI compares last-day-of-month figures, so the year-ago rate it now restates can differ slightly from the one first published."),
    "credit_industry": ("1b.", "% YoY", 1, "RBI, Sectoral Deployment of Bank Credit", "https://rbi.org.in/scripts/Data_Sectoral_Deployment.aspx", "year", None),
    "credit_services": ("1c.", "% YoY", 1, "RBI, Sectoral Deployment of Bank Credit", "https://rbi.org.in/scripts/Data_Sectoral_Deployment.aspx", "year", None),
    "credit_personal": ("1d.", "% YoY", 1, "RBI, Sectoral Deployment of Bank Credit", "https://rbi.org.in/scripts/Data_Sectoral_Deployment.aspx", "year", None),
    "gst_gross": ("2.", "₹ lakh crore", 2, "Ministry of Finance, GST collections (provisional)", "https://www.gst.gov.in", "year",
                  "Published gross collections. Up to October 2025 they include compensation cess; from November 2025 they do not, so the change against a year earlier is measured on the excluding-cess series."),
    "fiscal_deficit": ("3.", "% of BE", 1, "CGA, Union Government Accounts", "https://cga.nic.in", "year",
                       "Cumulative from April, as a share of the full-year budget estimate; resets each April."),
    "iip": ("5.", "% YoY", 1, "MoSPI, Index of Industrial Production, base 2022-23", "https://www.mospi.gov.in", "prev",
            "New 2022-23 base, back data from April 2023. MoSPI has not published June 2023 to March 2024 on this base."),
    "capex_centre": ("6.", "% of BE", 1, "CGA, Union Government Accounts", "https://cga.nic.in", "year",
                     "Capital expenditure, cumulative from April, as a share of the full-year budget estimate; resets each April."),
    "pmi_mfg": ("7a.", "index", 1, "HSBC India Manufacturing PMI, S&P Global", "https://www.pmi.spglobal.com", "prev",
                "Above 50 means activity is expanding. Only the latest readings are collected."),
    "pmi_services": ("7b.", "index", 1, "HSBC India Services PMI (business activity), S&P Global", "https://www.pmi.spglobal.com", "prev",
                     "Above 50 means activity is expanding. Only the latest readings are collected."),
}
GST_COMPARABLE = "GST gross EXCLUDING compensation cess"


def _month_end(y: int, m: int) -> str:
    nxt = date(y + (m == 12), 1 if m == 12 else m + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1).isoformat()


def _num(x):
    try:
        return None if x in (None, "", "—") else float(x)
    except (TypeError, ValueError):
        return None


def _item(ind_id, hist, unit, source, url, compare, note, compare_series=None):
    hist = [h for h in hist if h["value"] is not None]
    if not hist:
        return None
    last = hist[-1]
    if compare == "year":
        key = f"{int(last['date'][:4]) - 1}{last['date'][4:7]}"
        base = compare_series or {h["date"][:7]: h for h in hist}
        prev = base.get(key)
        prev_label = prev["label"] if prev else None
    else:
        prev = hist[-2] if len(hist) > 1 else None
        prev_label = prev["label"] if prev else None
    pv = prev["value"] if prev else None
    item = {"id": ind_id, "mode": "workbook", "value": last["value"], "unit": unit, "period": last["label"],
            "compare_value": pv, "compare_period": prev_label,
            "change": None if pv is None else round(last["value"] - pv, 2),
            "source": source, "source_url": url, "released": None, "history": hist}
    if note:
        item["note"] = note
    return item


def load(path: Path = DEFAULT_PATH) -> dict[str, dict]:
    if not path.exists():
        return {}
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    out: dict[str, dict] = {}

    ws = wb["Monthly Data"]
    header = [str(c.value or "") for c in ws[2]]
    rows = [r for r in ws.iter_rows(min_row=3, values_only=True) if isinstance(r[0], datetime)]

    def col(prefix):
        return next(i for i, h in enumerate(header) if h.startswith(prefix))

    def point(d: datetime, v, dec):
        return {"date": _month_end(d.year, d.month), "label": f"{MONTHS[d.month - 1]} {d.year}",
                "short": f"{MONTHS[d.month - 1]} {str(d.year)[2:]}", "value": None if v is None else round(v, dec)}

    gst_cmp = {}
    ci = col(GST_COMPARABLE)
    for r in rows:
        v = _num(r[ci])
        if v is not None:
            p = point(r[0], v, 2)
            gst_cmp[p["date"][:7]] = p
    for ind_id, (prefix, unit, dec, source, url, compare, note) in MONTHLY.items():
        i = col(prefix)
        hist = [point(r[0], _num(r[i]), dec) for r in rows if _num(r[i]) is not None]
        if unit == "% of BE":  # cumulative from April: label the span
            for h, r in zip(hist, [r for r in rows if _num(r[i]) is not None]):
                d = r[0]
                h["label"] = (f"Apr {d.year}" if d.month == 4 else f"Apr-{MONTHS[d.month - 1]} {d.year}" if d.month > 4
                              else f"Apr {d.year - 1}-{MONTHS[d.month - 1]} {d.year}")
        item = _item(ind_id, hist, unit, source, url, compare, note, gst_cmp if ind_id == "gst_gross" else None)
        if item:
            out[ind_id] = item

    q = wb["Quarterly Data"]
    qrows = [r for r in q.iter_rows(min_row=3, values_only=True) if r[0] and str(r[0]).startswith("Q")]
    end = {"Q1": (6, 0), "Q2": (9, 0), "Q3": (12, 0), "Q4": (3, 1)}
    hist = []
    for r in qrows:
        qq, fy = str(r[0]).split()[0], str(r[0]).split()[-1]
        m, add = end[qq]
        y = int(fy[:4]) + add
        hist.append({"date": _month_end(y, m), "label": f"{qq} {fy}", "short": f"{qq} {fy[2:4]}", "value": _num(r[4])})
    item = _item("cad", hist, "% of GDP", "RBI, Developments in India's balance of payments (latest release reporting each quarter)",
                 "https://www.rbi.org.in", "year",
                 "Surplus positive, deficit negative. Each quarter uses the most recent RBI release that reports it, so values come from different vintages.")
    if item:
        out["cad"] = item
    return out


if __name__ == "__main__":
    for k, v in load().items():
        print(f"{k:<16} {v['value']} {v['unit']} {v['period']} vs {v['compare_period']} {v['compare_value']}  n={len(v['history'])}")
