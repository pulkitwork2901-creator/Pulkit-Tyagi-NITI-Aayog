"""
Direct taxes from CBDT's "Income Tax Department Time Series Data" (PDF).

CBDT publishes the series once a year on the Income Tax Department's site
(www.incometaxindia.gov.in, Miscellaneous Communications, category 13540090).
That site sits behind a bot filter that refuses scripted downloads, so the PDF
is saved by hand into data/uploads/direct-taxes/ (any file name). This script
reads the newest one there, by the "Financial Year 2000-01 to YYYY-YY" on its
cover, and writes data/direct_taxes.json.

Tables read (numbering as in the PDF):
  1.1 Collections: corporate, non-corporate, other, total (Rs crore)
  1.2 State and UT break-up of collections (by the taxpayer's address)
  1.3 Direct taxes as a share of total tax revenue
  1.4 Direct tax to GDP ratio, growth rates and buoyancy
  1.5 Gross collections by mode: TDS, advance tax, self-assessment, ...
  1.6 Cost of collection
  1.7 Income-tax returns filed, 1.8 return filers, 1.9 taxpayers

Checks: corporate + non-corporate + other must equal the total in 1.1; the
totals in 1.1, 1.3, 1.4 and 1.6 must agree; the state sub-total must equal the
sum of the states. If a check fails, nothing is written, so the board keeps
the last good copy.

Usage: python3 scripts/direct_taxes.py [path/to/file.pdf]
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "data" / "uploads" / "direct-taxes"
OUT = ROOT / "data" / "direct_taxes.json"
SOURCE_URL = "https://www.incometaxindia.gov.in/en/miscellaneous-communications?categoryId=13540090"

FY = re.compile(r"^\s*(\d{4})-(\d{2})")


def _num(cell) -> float | None:
    """'9,86,767#' -> 986767.0, '58.81%' -> 58.81, '4,73, 179' -> 473179.0; '-', '', '--**' -> None."""
    if cell is None:
        return None
    s = re.sub(r"[\s#@*$%]", "", str(cell))
    if not re.fullmatch(r"-?[\d,]*\.?\d+", s):
        return None
    return float(s.replace(",", ""))


def _cover_years(pdf) -> str | None:
    t = pdf.pages[0].extract_text() or ""
    m = re.search(r"(\d{4}-\d{2})\s*to\s*(\d{4}-\d{2})", t)
    return m.group(2) if m else None


def newest_pdf() -> Path | None:
    import pdfplumber
    best = None
    for p in sorted(PDF_DIR.glob("*.pdf")):
        try:
            with pdfplumber.open(p) as pdf:
                end = _cover_years(pdf)
        except Exception as e:  # a damaged upload must not stop the others
            print(f"  skipped {p.name}: {e}")
            continue
        if end and (best is None or end > best[0]):
            best = (end, p)
    return best[1] if best else None


def _tables_by_section(pdf) -> dict[str, list[list]]:
    """Section number ('1.1' ...) -> all table rows on its pages. A page with
    no section heading continues the previous section."""
    out, current = {}, None
    for page in pdf.pages:
        text = page.extract_text() or ""
        heads = re.findall(r"^\s*(1\.\d)\s+[A-Z]", text, re.M)
        if heads:
            current = heads[0]
        if current is None:
            continue
        for t in page.extract_tables():
            out.setdefault(current, []).extend(t)
    return out


def _fy_rows(rows: list[list], ncols: int) -> dict[str, dict]:
    """Rows that start with a financial year -> {fy: {values, provisional}}."""
    out = {}
    for r in rows:
        if not r or not r[0] or not FY.match(str(r[0])):
            continue
        fy = FY.match(str(r[0])).group(0).strip()
        cells = [c for c in r[1:] if c is not None]
        vals = [_num(c) for c in cells][:ncols]
        if len(vals) < ncols:
            continue
        # '#' and '@' mark provisional figures in the PDF ('*' only names the source).
        out[fy] = {"v": vals, "provisional": any(re.search(r"[#@]", str(c or "")) for c in r)}
    return out


CATEGORIES = ["INDIVIDUAL", "HUF", "FIRM", "COMPANY", "AOP(TRUST)", "OTHER AOP/BOI", "LOCAL AUTHORITY", "AJP", "OTHERS", "TOTAL"]


def _wide(rows: list[list], prefix: str) -> dict[str, dict[str, float]]:
    """Tables 1.7 to 1.9: one row per PAN category, one column per year.
    Year headings are split across cells in the PDF ('FY 2013-' / '14'), so
    the years are read from their start years in order."""
    head = next((r for r in rows if any(re.search(rf"{prefix}\s*\d{{4}}", str(c or "")) for c in r)), None)
    if not head:
        return {}
    starts = [int(y) for c in head for y in re.findall(rf"{prefix}\s*(\d{{4}})", str(c or ""))]
    years = [f"{y}-{str(y + 1)[2:]}" for y in starts]
    out = {}
    for r in rows:
        label = " ".join(str(c) for c in r if c and re.search(r"[A-Za-z]{2}", str(c)) and not re.search(rf"{prefix}\s*\d", str(c)))
        label = re.sub(r"\s+", " ", label).strip().upper()
        cat = next((c for c in CATEGORIES if label == c or label.endswith(" " + c) or label.startswith(c + " ")), None)
        if label.startswith("OTHER AOP"):
            cat = "OTHER AOP/BOI"
        if not cat:
            continue
        # Numbers after the category name only (the serial number comes before it).
        at = next(i for i, c in enumerate(r) if c and re.search(r"[A-Za-z]{2}", str(c)))
        nums = [_num(c) for c in r[at + 1:] if c and re.fullmatch(r"[\d,\s]+", str(c).strip())]
        nums = [n for n in nums if n is not None]
        if len(nums) != len(years):
            raise ValueError(f"{prefix} table, {cat}: {len(nums)} numbers for {len(years)} years")
        out[cat] = dict(zip(years, nums))
    return out


def _states(rows: list[list]) -> dict:
    """Table 1.2. Columns are kept by position: '' means no figure, None means
    the cell is merged with the row above (Daman and Diu with Dadra and Nagar
    Haveli after their 2020 merger)."""
    head = next((r for r in rows if r and r[0] and "States" in str(r[0])), None)
    if not head:
        return {}
    years = [FY.search(str(c).replace("FY", "").strip()).group(0).strip() for c in head[1:] if c and re.search(r"\d{4}-\d{2}", str(c))]
    states, uts, totals = {}, {}, {}
    section = states
    as_printed = {"states": {}, "uts": {}}  # section sums as the PDF groups them, for the sub-total checks
    names = {"Jammu Kashmir": "Jammu and Kashmir", "Daman and Diu": "Dadra and Nagar Haveli and Daman and Diu",
             "Dadar N. Haveli": "Dadra and Nagar Haveli and Daman and Diu", "Andaman Nicobar": "Andaman and Nicobar Islands",
             "Lakshadweep": "Lakshadweep", "Delhi": "Delhi"}
    for r in rows:
        if not r or not r[0] or r is head or "States" in str(r[0]):
            continue
        name = re.sub(r"\s+", " ", str(r[0])).strip()
        vals = {}
        for y, c in zip(years, r[1:1 + len(years)]):
            v = _num(c)
            if v is not None:
                vals[y] = v
        if name == "State Sub-total":
            totals["states"] = vals
            section = uts
            continue
        if name == "UT Sub-total":
            totals["uts"] = vals
            section = None
            continue
        if name == "Grand Total":
            totals["grand"] = vals
            continue
        if section is None:  # C.T.D.S., Foreign, Unapportioned
            totals[name.rstrip(".")] = vals
            continue
        for y, v in vals.items():
            grp = as_printed["states" if section is states else "uts"]
            grp[y] = grp.get(y, 0) + v
        key = names.get(name, name)
        # Jammu and Kashmir is listed as a state for 2018-19 and as a UT after.
        tgt = uts if key == "Jammu and Kashmir" else section
        for y, v in vals.items():
            tgt.setdefault(key, {})
            tgt[key][y] = round(tgt[key].get(y, 0) + v, 2)
    return {"years": years, "states": states, "uts": uts, "totals": totals, "as_printed": as_printed}


def parse(path: Path) -> dict:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        end = _cover_years(pdf)
        sec = _tables_by_section(pdf)

    t11 = _fy_rows(sec.get("1.1", []), 4)
    t13 = _fy_rows(sec.get("1.3", []), 4)
    t14 = _fy_rows(sec.get("1.4", []), 6)
    t15 = _fy_rows(sec.get("1.5", []), 6)
    t16 = _fy_rows(sec.get("1.6", []), 3)
    if not t11:
        raise ValueError("table 1.1 (collections) not found")

    fy = {}
    problems = []
    for y, r in t11.items():
        c, n, o, tot = r["v"]
        if abs(c + n + o - tot) > 3:
            problems.append(f"1.1 {y}: {c}+{n}+{o} != {tot}")
        fy[y] = {"corporate": c, "non_corporate": n, "other": o, "net": tot, "provisional": r["provisional"]}
    for y, r in t13.items():
        d, ind, tt, share = r["v"]
        if y in fy and abs(d - fy[y]["net"]) > 1:
            problems.append(f"1.3 {y}: direct taxes {d} != 1.1 total {fy[y]['net']}")
        fy.setdefault(y, {}).update({"indirect": ind, "total_taxes": tt, "direct_share": share})
    for y, r in t14.items():
        net, gdp, ratio, gdp_g, tax_g, buoy = r["v"] if len(r["v"]) == 6 else (r["v"] + [None] * 6)[:6]
        if y in fy and abs(net - fy[y]["net"]) > 1:
            problems.append(f"1.4 {y}: net {net} != 1.1 total {fy[y]['net']}")
        if gdp and ratio and abs(net / gdp * 100 - ratio) > 0.06:
            problems.append(f"1.4 {y}: ratio {ratio}% but {net}/{gdp} = {net / gdp * 100:.2f}%")
        fy.setdefault(y, {}).update({"gdp_current": gdp, "dt_gdp": ratio, "gdp_growth": gdp_g, "tax_growth": tax_g, "buoyancy": buoy})
    # 2020-21 buoyancy is '--**' in the PDF (both growth rates negative), so
    # the row has five numbers; keep it with buoyancy left empty.
    for r in sec.get("1.4", []):
        if r and r[0] and FY.match(str(r[0])):
            y = FY.match(str(r[0])).group(0).strip()
            if y not in t14:
                vals = [_num(c) for c in r[1:] if c is not None]
                if len(vals) >= 5 and vals[0] is not None:
                    fy.setdefault(y, {}).update({"gdp_current": vals[1], "dt_gdp": vals[2], "gdp_growth": vals[3], "tax_growth": vals[4], "buoyancy": None})
    notes = []
    for y, r in t15.items():
        tds, adv, sat, rat, oth, gross = r["v"]
        gap = tds + adv + sat + rat + oth - gross
        if abs(gap) > 0.001 * gross:  # more than rounding: a misread
            problems.append(f"1.5 {y}: modes add to {tds + adv + sat + rat + oth}, total {gross}")
        elif abs(gap) > 5:  # the PDF's own small inconsistency (2017-18: 257 crore)
            notes.append(f"Table 1.5, {y}: the components add up to Rs {tds + adv + sat + rat + oth:,.0f} crore against a printed total of Rs {gross:,.0f} crore.")
        fy.setdefault(y, {}).update({"tds": tds, "advance_tax": adv, "self_assessment": sat, "regular_assessment": rat,
                                     "other_receipts": oth, "gross": gross})
    for y, r in t16.items():
        tot, exp, pct = r["v"]
        if y in fy and abs(tot - fy[y]["net"]) > 1:
            problems.append(f"1.6 {y}: collections {tot} != 1.1 total {fy[y]['net']}")
        fy.setdefault(y, {}).update({"collection_cost": exp, "cost_pct": pct})

    returns = _wide(sec.get("1.7", []), "FY")
    filers = _wide(sec.get("1.8", []), "FY")
    taxpayers = _wide(sec.get("1.9", []), "AY")
    for name, tab in (("1.7", returns), ("1.8", filers), ("1.9", taxpayers)):
        if "TOTAL" in tab:
            for y in tab["TOTAL"]:
                s = sum(tab[c][y] for c in tab if c != "TOTAL" and y in tab[c])
                if abs(s - tab["TOTAL"][y]) > 2:
                    problems.append(f"{name} {y}: categories add to {s:.0f}, total {tab['TOTAL'][y]:.0f}")

    st = _states(sec.get("1.2", []))
    for y in st.get("years", []):
        sub = st["totals"].get("states", {}).get(y)
        s = st["as_printed"]["states"].get(y, 0)
        if sub is not None and abs(s - sub) > 1:
            problems.append(f"1.2 {y}: states add to {s:.2f}, sub-total {sub}")

    if problems:
        raise ValueError("checks failed:\n  " + "\n  ".join(problems))
    st.pop("as_printed", None)
    return {
        "source": "CBDT, Income Tax Department Time Series Data",
        "source_url": SOURCE_URL,
        "file": path.name,
        "covers_to": end,
        "parsed_on": date.today().isoformat(),
        "fy": dict(sorted(fy.items())),
        "returns_filed": returns,
        "return_filers": filers,
        "taxpayers_by_ay": taxpayers,
        "by_state": st,
        "source_inconsistencies": notes,
    }


def main(argv: list[str]) -> int:
    path = Path(argv[1]) if len(argv) > 1 else newest_pdf()
    if not path:
        print(f"No CBDT time series PDF in {PDF_DIR}")
        return 1
    try:
        data = parse(path)
    except Exception as e:
        print(f"Direct taxes: kept the last good copy. {path.name}: {e}")
        return 1
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    last = max(data["fy"])
    print(f"Direct taxes: {path.name}, {min(data['fy'])} to {last}; net {data['fy'][last]['net']:,.0f} crore in {last}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
