"""
Read RBI's DBIE "Macro-economic Indicators" workbook and turn selected columns
into board indicators with full history.

The workbook is the Excel download from RBI's Database on Indian Economy
(data.rbi.org.in). It has four sheets, Weekly, Fortnightly, Monthly and
Quarterly, each with a "Period" column followed by one column per series,
newest period first. Replace data/rbi/macro-indicators.xlsx with a fresh
download to update the board; nothing else needs to change.

Columns are found by their header text, never by position, so a reordered
download cannot put numbers under the wrong label. A series whose header is
missing is skipped and reported, not guessed.

Deliberately NOT used (see README):
  - "Index of Industrial Production": splices the 2011-12 and 2022-23 bases in
    one column without a marker, so growth computed across Jan 2026 is wrong.
  - "Gross External Debt Position": no unit, and it halves between Sep and
    Dec 2025. "India's External Debt - Gross Total (US $ Million)" is used.
  - WPI (2011-12), CPI (2012) and CPI food (2012): stop at old base years.
  - The ready-made cash-deposit and credit-deposit ratio columns stop in 2025;
    the credit-deposit ratio is computed from the levels instead.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from pathlib import Path

SOURCE = "RBI Database on Indian Economy (DBIE), Macro-economic Indicators"
SOURCE_URL = "https://data.rbi.org.in"
HISTORY_MONTHS = 60          # five years of monthly points per chart
HISTORY_QUARTERS = 24        # six years of quarterly points

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# One entry per board indicator.
#   sheet     : workbook sheet
#   header    : text that must appear in the column header (case-insensitive)
#   header2   : second column, for ratios (header / header2 * 100)
#   calc      : "level" | "yoy" (growth on a year earlier, %) | "ratio"
#   scale     : multiply the raw value (US$ million -> US$ bn is 1/1000)
#   compare   : "prev" (previous point), "yoy" (same month a year earlier),
#               "prev_week" (previous weekly reading), "last_change" (the
#               value before the most recent change, for policy rates)
#   manual    : how rows for the same id in data/manual-indicators.csv are used
#               "merge"  : manual rows replace RBI points for the same month
#                          and newer manual rows are added on top
#               "ignore" : RBI series only (manual rows use a different source)
SPECS = {
    # ---- External sector
    "exports":        dict(sheet="Monthly", header="Foreign Trade Exports Total", calc="level", scale=1e-3, unit="US$ bn", compare="yoy", manual="merge"),
    "imports":        dict(sheet="Monthly", header="Foreign Trade Imports Total", calc="level", scale=1e-3, unit="US$ bn", compare="yoy", manual="merge"),
    "trade_balance":  dict(sheet="Monthly", header="Foreign Trade Balance Total", calc="level", scale=1e-3, unit="US$ bn", compare="yoy", manual="merge"),
    "fx_reserves":    dict(sheet="Weekly", header="Foreign Exchange Reserves", calc="level", scale=1e-3, unit="US$ bn", compare="prev_week", manual="merge"),
    "inr_usd":        dict(sheet="Monthly", header="Exchange Rate of Indian Rupee vis-à-vis US Dollar", calc="level", scale=1, unit="₹ per US$ (month end)", compare="prev", manual="ignore"),
    "fwd_premia_3m":  dict(sheet="Weekly", header="Forward Premia of US$ 3-month", calc="level", scale=1, unit="% a year", compare="prev_week", manual="ignore"),
    "ext_debt":       dict(sheet="Quarterly", header="India's External Debt - Gross Total", calc="level", scale=1e-3, unit="US$ bn", compare="prev", manual="ignore"),
    "niip":           dict(sheet="Quarterly", header="International Investment Position Net", calc="level", scale=1e-3, unit="US$ bn", compare="prev", manual="ignore"),
    # ---- Fiscal and monetary
    "repo":           dict(sheet="Weekly", header="Policy Repo Rate", calc="level", scale=1, unit="%", compare="last_change", manual="merge"),
    "sdf_rate":       dict(sheet="Weekly", header="Standing Deposit Facility", calc="level", scale=1, unit="%", compare="last_change", manual="ignore"),
    "msf_rate":       dict(sheet="Weekly", header="Marginal Standing Facility", calc="level", scale=1, unit="%", compare="last_change", manual="ignore"),
    "crr":            dict(sheet="Weekly", header="Cash Reserve Ratio", calc="level", scale=1, unit="% of deposits", compare="last_change", manual="ignore"),
    "tbill_91":       dict(sheet="Weekly", header="91-Day Treasury Bill", calc="level", scale=1, unit="%", compare="prev_week", manual="ignore"),
    "gsec10":         dict(sheet="Weekly", header="10-Year G-Sec Yield", calc="level", scale=1, unit="% (FBIL)", compare="prev_week", manual="ignore"),
    "sdl_borrowing":  dict(sheet="Monthly", header="Market Borrowing SG Gross Amount Raised", calc="level", scale=1e-3, unit="₹ '000 crore", compare="yoy", manual="ignore"),
    # ---- Money, credit and capital flows
    "credit_nonfood": dict(sheet="Fortnightly", header="Non Food Credit", calc="yoy", scale=1, unit="% YoY", compare="prev", manual="merge"),
    "deposit_growth": dict(sheet="Fortnightly", header="Aggregate Desposits", calc="yoy", scale=1, unit="% YoY", compare="prev", manual="ignore"),
    "m3_growth":      dict(sheet="Fortnightly", header="M3", calc="yoy", scale=1, unit="% YoY", compare="prev", manual="ignore"),
    "cd_ratio":       dict(sheet="Fortnightly", header="Bank Credit", header2="Aggregate Desposits", calc="ratio", scale=1, unit="%", compare="prev", manual="ignore"),
    "fdi_net":        dict(sheet="Monthly", header="Net Foreign Direct Investment", calc="level", scale=1e-3, unit="US$ bn", compare="prev", manual="merge"),
    "fdi_gross":      dict(sheet="Monthly", header="Direct Investment to India", calc="level", scale=1e-3, unit="US$ bn", compare="prev", manual="ignore"),
    "fpi_net":        dict(sheet="Monthly", header="Net Portfolio Investment", calc="level", scale=1e-3, unit="US$ bn", compare="prev", manual="ignore"),
    "ecb_reg":        dict(sheet="Monthly", header="External Commercial Borrowings", calc="level", scale=1e-3, unit="US$ bn", compare="yoy", manual="ignore"),
    "digital_payments": dict(sheet="Monthly", header="Total Digital Payments", calc="level", scale=1e-5, unit="₹ lakh crore", compare="yoy", manual="ignore"),
}

# Notes shown with the indicator where the RBI series needs explaining.
NOTES = {
    "credit_nonfood": "Growth computed from fortnightly outstanding credit. From Dec 2025 RBI reports month-end figures instead of the last reporting Friday, so growth around that change compares dates up to two weeks apart. The latest month uses RBI's published figure where entered.",
    "deposit_growth": "Growth computed from fortnightly outstanding deposits; see the note on reporting dates under bank credit.",
    "m3_growth": "Growth computed from fortnightly M3 outstanding.",
    "cd_ratio": "Bank credit as a share of aggregate deposits, computed from RBI's fortnightly levels.",
    "fpi_net": "RBI's net portfolio investment, which is wider than FPI equity and debt flows reported by NSDL.",
    "inr_usd": "RBI reference rate at month end.",
    "gsec10": "FBIL benchmark 10-year yield, last reading of the week.",
}


# --------------------------------------------------------------------------
# Reading the workbook
# --------------------------------------------------------------------------

def _norm(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _period(value) -> date | None:
    """Period cell -> a date. Monthly sheet uses 'Sep-2026' (-> month end)."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    m = re.fullmatch(r"([A-Za-z]{3})-(\d{4})", str(value or "").strip())
    if m and m.group(1).title() in MONTHS:
        y, mo = int(m.group(2)), MONTHS.index(m.group(1).title()) + 1
        nxt = date(y + (mo == 12), 1 if mo == 12 else mo + 1, 1)
        return nxt - timedelta(days=1)
    return None


def read_workbook(path: Path) -> dict[str, dict]:
    """{sheet: {"headers": [normalised header, ...], "rows": [(date, [values])]}}"""
    import warnings
    import openpyxl  # imported here so the board still builds without it
    warnings.filterwarnings("ignore", message="Workbook contains no default style")

    wb = openpyxl.load_workbook(path, data_only=True)  # not read_only: it can drop the last column of DBIE exports
    out = {}
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        hi = next((i for i, r in enumerate(rows) if r and any(_norm(c) == "period" for c in r)), None)
        if hi is None:
            continue
        hdr = [_norm(c) for c in rows[hi]]
        pc = hdr.index("period")
        data = []
        for r in rows[hi + 1:]:
            if not r or len(r) <= pc:
                continue
            d = _period(r[pc])
            if d:
                data.append((d, list(r)))
        out[ws.title] = {"headers": hdr, "rows": sorted(data, key=lambda t: t[0])}
    return out


def _column(sheet: dict, header: str) -> list[tuple[date, float]]:
    want = _norm(header)
    matches = [i for i, h in enumerate(sheet["headers"]) if want in h]
    if len(matches) != 1:
        raise KeyError(f'header "{header}" matched {len(matches)} columns')
    j = matches[0]
    return [(d, float(r[j])) for d, r in sheet["rows"]
            if j < len(r) and isinstance(r[j], (int, float)) and not isinstance(r[j], bool)]


# --------------------------------------------------------------------------
# Shaping
# --------------------------------------------------------------------------

def _month_end_sample(points):
    """Last observation in each calendar month -> {(y, m): (date, value)}."""
    out = {}
    for d, v in points:
        out[(d.year, d.month)] = (d, v)
    return out


def _leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _is_mid_period(d: date) -> bool:
    """True when a weekly or fortnightly reading falls well before month end."""
    nxt = date(d.year + (d.month == 12), 1 if d.month == 12 else d.month + 1, 1)
    return (nxt - d).days > 8


def _fy_quarter(d: date) -> str:
    q = {6: 1, 9: 2, 12: 3, 3: 4}[d.month]
    start = d.year if d.month >= 4 else d.year - 1
    return f"Q{q} {start}-{str(start + 1)[2:]}"


def _label(d: date, kind: str):
    if kind == "quarter":
        lab = _fy_quarter(d)
        return lab, lab.replace(" 20", " ")
    if kind == "week":
        return f"Week to {d.day} {MONTHS[d.month - 1]} {d.year}", f"{MONTHS[d.month - 1]} {str(d.year)[2:]}"
    if kind == "fortnight":
        return f"Fortnight to {d.day} {MONTHS[d.month - 1]} {d.year}", f"{d.day} {MONTHS[d.month - 1]}"
    return f"{MONTHS[d.month - 1]} {d.year}", f"{MONTHS[d.month - 1]} {str(d.year)[2:]}"


def build_series(book: dict, ind_id: str, spec: dict) -> dict:
    sheet = book[spec["sheet"]]
    raw = _column(sheet, spec["header"])
    if not raw:
        raise ValueError("column has no numbers")
    freq = {"Weekly": "week", "Fortnightly": "fortnight", "Monthly": "month", "Quarterly": "quarter"}[spec["sheet"]]

    if spec["calc"] == "ratio":
        den = dict(_column(sheet, spec["header2"]))
        raw = [(d, v / den[d] * 100) for d, v in raw if den.get(d)]

    if freq == "quarter":
        pts = [(d, v) for d, v in raw][-HISTORY_QUARTERS:]
        kinds = ["quarter"] * len(pts)
    else:
        if spec["calc"] == "yoy":
            # Compare each reading with the reading closest to exactly one year
            # earlier (within 10 days). Comparing "last reading of the month"
            # instead mismatches dates by up to two weeks after RBI moved to
            # month-end reporting in Dec 2025, and quarter-end balance sheet
            # spikes then distort growth by two to three points.
            grown = []
            for d, v in raw:
                target = d - timedelta(days=365 + (d.month > 2 and _leap(d.year)))
                base = min(raw, key=lambda t: abs((t[0] - target).days))
                if abs((base[0] - target).days) <= 10 and base[1]:
                    grown.append((d, (v / base[1] - 1) * 100))
            raw = grown
        monthly = _month_end_sample(raw) if freq in ("week", "fortnight") else {(d.year, d.month): (d, v) for d, v in raw}
        keys = sorted(monthly)[-HISTORY_MONTHS:]
        pts = [monthly[k] for k in keys]
        kinds = ["month"] * len(pts)
        if freq in ("week", "fortnight") and _is_mid_period(pts[-1][0]):
            kinds[-1] = freq            # latest reading is not a month end: show its date
        elif freq == "week" and spec["calc"] == "level":
            kinds[-1] = "week"          # latest point is a dated weekly reading

    history = []
    for (d, v), kind in zip(pts, kinds):
        label, short = _label(d, kind)
        history.append({"date": d.isoformat(), "label": label, "short": short, "value": round(v * spec["scale"], 4)})

    # Comparison for the latest reading
    last = history[-1]
    cmp_value, cmp_period = None, None
    if spec["compare"] == "prev" and len(history) > 1:
        cmp_value, cmp_period = history[-2]["value"], history[-2]["label"]
    elif spec["compare"] == "yoy":
        d = date.fromisoformat(last["date"])
        prior = next((h for h in history if date.fromisoformat(h["date"]).year == d.year - 1
                      and date.fromisoformat(h["date"]).month == d.month), None)
        if prior:
            cmp_value, cmp_period = prior["value"], prior["label"]
    elif spec["compare"] == "prev_week" and len(raw) > 1:
        d0, v0 = raw[-2]
        cmp_value, cmp_period = round(v0 * spec["scale"], 4), _label(d0, "week")[0]
    elif spec["compare"] == "last_change":
        cur = raw[-1][1]
        for i in range(len(raw) - 2, -1, -1):
            if raw[i][1] != cur:
                changed = raw[i + 1][0]   # first weekly reading at the new value
                cmp_value = round(raw[i][1] * spec["scale"], 4)
                cmp_period = f"Before week to {changed.day} {MONTHS[changed.month - 1]} {changed.year}"
                break

    item = {
        "id": ind_id, "mode": "rbi", "value": last["value"], "unit": spec["unit"],
        "period": last["label"], "compare_value": cmp_value, "compare_period": cmp_period,
        "change": None if cmp_value is None else round(last["value"] - cmp_value, 4),
        "source": SOURCE, "source_url": SOURCE_URL, "released": None,
        "history": history,
    }
    if ind_id in NOTES:
        item["note"] = NOTES[ind_id]
    return item


def merge_manual(item: dict, manual_rows: list[dict]) -> dict:
    """Manual rows replace RBI points for the same month and extend the series.

    Used where the team's sheet carries newer figures from the same underlying
    release (for example Commerce's trade data a month before RBI's table).
    """
    if not manual_rows:
        return item
    hist = {h["date"][:7]: h for h in item["history"]}
    for r in manual_rows:
        d = date.fromisoformat(r["date"])
        key = d.isoformat()[:7]
        # A sheet row wins only if it is at least as recent as the RBI reading
        # for that month (weekly series: 30 Oct from RBI beats 23 Oct typed in).
        if key in hist and hist[key]["date"] > d.isoformat():
            continue
        hist[key] = {"date": d.isoformat(), "label": r["period"],
                     "short": f"{MONTHS[d.month - 1]} {str(d.year)[2:]}", "value": r["value"]}
    merged = [hist[k] for k in sorted(hist)]
    latest_manual = max(manual_rows, key=lambda r: r["date"])
    out = {**item, "history": merged[-max(len(item["history"]), 1):]}
    if latest_manual["date"] >= item["history"][-1]["date"]:
        out.update({k: latest_manual[k] for k in ("value", "unit", "period", "compare_value", "compare_period",
                                                  "change", "source", "source_url", "released", "entered_by")
                    if k in latest_manual})
        out["mode"] = "manual"
    return out


def load(path: Path, manual_by_id: dict[str, list[dict]]) -> tuple[dict, dict]:
    """Return ({id: indicator}, status)."""
    status = {"status": "ok", "file": path.name, "message": None, "skipped": []}
    if not path.exists():
        return {}, {**status, "status": "missing", "message": f"{path.name} not found"}
    try:
        book = read_workbook(path)
    except Exception as exc:  # missing openpyxl, corrupt file
        return {}, {**status, "status": "error", "message": f"Could not read {path.name}: {exc}"}
    out = {}
    for ind_id, spec in SPECS.items():
        try:
            item = build_series(book, ind_id, spec)
        except Exception as exc:
            status["skipped"].append(f"{ind_id}: {exc}")
            continue
        if spec["manual"] == "merge":
            item = merge_manual(item, manual_by_id.get(ind_id, []))
            h = item["history"]
            if item["mode"] == "rbi" and spec["compare"] == "prev" and len(h) > 1:
                # the previous point may now be a published figure from the sheet
                item.update(compare_value=h[-2]["value"], compare_period=h[-2]["label"],
                            change=round(item["value"] - h[-2]["value"], 4))
        out[ind_id] = item
    if status["skipped"]:
        status["status"] = "partial"
        status["message"] = f'{len(status["skipped"])} series skipped'
    return out, status
