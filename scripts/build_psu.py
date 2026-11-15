"""
Build public/data/psu/psu.json for the PSU Performance Board (psu.html).

Official sources only:

  DIPAM (dipam.gov.in), Department of Investment and Public Asset Management
      * Total receipts: dividend, disinvestment and asset monetisation received
        by the Centre each financial year since 2014-15 (totalReceiptsDtls).
      * Dividend received from each CPSE and other entity, every year since
        2013-14 (the JSON behind the dividendReceiptsDtls page).
      * Disinvestment transactions of the current year: company, share sold,
        method, receipts and the Government's holding afterwards. DIPAM's page
        only shows the current year, so each year's list is kept in
        data/psu/disinvestment-deals.csv as it is read.
      * Market value of the Government's shares in listed CPSEs and in public
        financial institutions (viewAllCPSE). The page carries no "as on" date,
        so the board records the day it read it and keeps one row a day in
        data/psu/mcap-snapshots.csv.
  PIB, Lok Sabha Unstarred Question 2941 of 10 March 2026 ("Profit by CPSEs")
      Company-wise net profit or loss of every operating CPSE for 2022-23,
      2023-24 and 2024-25, by cognate group, from the Public Enterprises Survey
      2024-25 (DPE).
  DPE, Public Enterprises Survey 2024-25, Statement J
      Contribution to Central Exchequer, grand total (checked each run).
  data/psu/pe-survey-headlines.csv and data/psu/pe-survey-tables.json
      Headline figures of earlier surveys (2017-18 onward) and tables from the
      2023-24 survey (counts, capex, MoU ratings, employment, value added),
      each row with its source.

If a source fails, its last good block is kept and marked stale.

Usage:
  python scripts/build_psu.py
  python scripts/build_psu.py --only dividends
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "psu" / "psu.json"
DATA = ROOT / "data" / "psu"
MCAP_SNAPSHOTS = DATA / "mcap-snapshots.csv"
DEALS = DATA / "disinvestment-deals.csv"
HEADLINES = DATA / "pe-survey-headlines.csv"
TABLES = DATA / "pe-survey-tables.json"

DIPAM = "https://dipam.gov.in/"
PIB_PROFIT = "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2237538&reg=3&lang=2"
DPE_STATEMENT_J = "https://www.dpe.gov.in/static/uploads/2026/01/1e35ffc1b3c9a729e5e95e32b634f4fe.pdf"
UA = "NITI-EF2-dashboard/1.0"
IST = timezone(timedelta(hours=5, minutes=30))


# ---------------------------------------------------------------- helpers

def session():
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    s = requests.Session()
    s.headers["User-Agent"] = UA
    retry = Retry(total=3, backoff_factor=2, status_forcelist=(429, 500, 502, 503, 504))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def today_ist() -> str:
    return datetime.now(IST).date().isoformat()


def num(s) -> float | None:
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    s = str(s).replace(",", "").replace("−", "-").strip()
    try:
        return float(s)
    except ValueError:
        return None


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ")).strip()


def html_tables(html: str) -> list[list[list[str]]]:
    """Every <table> on a page as rows of cell text."""
    out = []
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    for t in re.findall(r"<table.*?</table>", html, flags=re.S | re.I):
        rows = []
        for r in re.findall(r"<tr.*?</tr>", t, flags=re.S | re.I):
            cells = [clean(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, flags=re.S | re.I)]
            if any(cells):
                rows.append(cells)
        out.append(rows)
    return out


def fy_label(fy: str) -> str:
    """'2025-2026' -> '2025-26'."""
    m = re.fullmatch(r"(\d{4})-(\d{2})(\d{2})", fy.strip())
    return f"{m.group(1)}-{m.group(3)}" if m else fy.strip()


ACRONYMS = {"NTPC", "NHPC", "SJVN", "NLC", "GAIL", "ONGC", "BEML", "HMT", "ITI", "KIOCL", "MOIL", "NMDC", "IRCON", "RITES", "HUDCO",
            "IREDA", "IRFC", "IRCTC", "REC", "PFC", "BHEL", "BEL", "HAL", "SAIL", "MSTC", "NBCC", "ECGC", "SIDBI", "NABARD", "EXIM",
            "LIC", "GIC", "SBI", "IDBI", "UTI", "SUUTI", "NIIFL", "SWAMIH", "MMTC", "STC", "PEC", "EIL", "CIL", "BPCL", "HPCL",
            "IOCL", "NEEPCO", "THDC", "NHDC", "DFCCIL", "RVNL", "CONCOR", "KRCL", "MDL", "GRSE", "BDL", "HSL", "GSL", "MIDHANI",
            "AAI", "ITDC", "NSIC", "NFL", "RCF", "FACT", "MFL", "HOCL", "HLL", "TCIL", "BSNL", "MTNL", "WAPCOS", "NPCC", "EPI",
            "BRBCL", "NHAI", "DVC", "UCIL", "IREL", "NINL", "FSNL", "IMPCL", "CSL", "HCL", "UCO", "IDPL", "BBUNL", "MECON", "KAPL",
            "NSC", "CWC", "FCI", "NIDC", "BPCL", "ECIL", "IFCI", "PSU", "CPSE", "ETF", "II", "III", "IV"}
SMALL_WORDS = {"of", "and", "the", "for", "to", "on", "in", "at", "by"}


def title_case(name: str) -> str:
    """'COAL INDIA LTD.' -> 'Coal India Ltd.', keeping known acronyms. Names
    already in mixed case are left as they are."""
    name = re.sub(r"\s+", " ", name or "").strip()
    if not name or name != name.upper():
        return name

    def word(m):
        w = m.group(0)
        if w in ACRONYMS:
            return w
        if w.lower() in SMALL_WORDS and m.start() > 0:
            return w.lower()
        return w.capitalize()
    return re.sub(r"[A-Z][A-Z']*", word, name)


# ---------------------------------------------------------------- DIPAM: total receipts

def parse_total_receipts(html: str) -> list[dict]:
    for t in html_tables(html):
        head = " ".join(t[0]).lower() if t else ""
        if "dividend" in head and "disinvestment" in head and "financial year" in head:
            rows = []
            for r in t[1:]:
                if len(r) >= 5 and re.fullmatch(r"\d{4}-\d{4}", r[1]):
                    d, dis, mon, tot = (num(x) for x in r[2:6])
                    if None in (d, dis, mon, tot) or abs(d + dis + mon - tot) > 1:
                        raise ValueError(f"DIPAM totals: row {r[1]} does not add up")
                    rows.append({"fy": fy_label(r[1]), "dividend": d, "disinvestment": dis, "monetisation": mon, "total": tot})
            if len(rows) >= 10:
                return sorted(rows, key=lambda x: x["fy"])
    raise ValueError("DIPAM totals: receipts table not found")


def fetch_receipts(sess, old=None) -> dict:
    r = sess.get(DIPAM + "totalReceiptsDtls", timeout=90)
    r.raise_for_status()
    m = re.search(r"Last Updated on\s*:?\s*(\d{2})/(\d{2})/(\d{4})", clean(r.text))
    return {"years": parse_total_receipts(r.text), "site_updated": f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None,
            "source_url": DIPAM + "totalReceiptsDtls"}


# ---------------------------------------------------------------- DIPAM: dividends by company

def dividend_years(html: str) -> list[str]:
    sel = re.search(r'<select[^>]*id="financialyear".*?</select>', html, flags=re.S)
    years = re.findall(r'<option value="(\d{4}-\d{4})"', sel.group(0) if sel else "")
    if len(years) < 5:
        raise ValueError("DIPAM dividends: year list not found")
    return years


def fetch_dividends(sess, old=None) -> dict:
    page = sess.get(DIPAM + "dividendReceiptsDtls", timeout=90)
    page.raise_for_status()
    years = dividend_years(page.text)
    entities: dict[str, dict] = {}
    totals = {}
    for fy in years:
        r = sess.get(DIPAM + "DividendByFnclYearCPSEWise", params={"fy": fy}, timeout=90)
        r.raise_for_status()
        rows = r.json()
        label = fy_label(fy)
        tot = 0.0
        for x in rows:
            if x.get("deleted"):
                continue
            amt = num(x.get("dividendActual"))
            cm = x.get("cpseMaster") or {}
            name = (cm.get("companyName") or "").strip()
            if amt is None or not name:
                continue
            ministry = ((cm.get("ministry") or x.get("ministry") or {}).get("ministryDeptName") or "").strip()
            short = (cm.get("companyShortName") or "").strip()
            other = "(*)" in short or "OTHER AGENCIES" in name.upper()
            label_name = re.sub(r"^DIVIDENDS? (AND PROFITS EARNED ON THE FUNDS RELEASED TO |FROM )", "", name, flags=re.I)
            label_name = re.sub(r"\s*\((OTHER AGENCIES)\)", "", label_name, flags=re.I).strip()
            e = entities.setdefault(name, {"name": title_case(label_name), "short": short.replace("(*)", "").strip(), "other_agency": other,
                                           "ministry": title_case(ministry) if ministry else "", "by_year": {}})
            e["by_year"][label] = round(e["by_year"].get(label, 0) + amt, 2)
            tot += amt
        totals[label] = round(tot, 2)
    labels = [fy_label(y) for y in sorted(years) if totals.get(fy_label(y))]  # DIPAM lists companies only from 2019-20
    return {"years": labels, "totals": {k: v for k, v in totals.items() if k in labels},
            "entities": sorted(entities.values(), key=lambda e: -sum(e["by_year"].values())),
            "source_url": DIPAM + "dividendReceiptsDtls"}


# ---------------------------------------------------------------- DIPAM: disinvestment deals

DEAL_FIELDS = ["fy", "short", "company", "pct_sold", "method", "receipts_cr", "goi_after_pct", "first_seen"]
METHODS = {"OFS": "Offer for sale", "SD": "Strategic sale", "IPO": "Initial public offer", "FPO": "Follow-on offer", "QIP": "Qualified institutional placement",
           "ETF": "Exchange traded fund", "BUYBACK": "Buyback", "OTHER": "Other", "SALE": "Sale", "CPSE ETF": "CPSE ETF", "BHARAT 22 ETF": "Bharat 22 ETF"}


def parse_deals(html: str) -> tuple[str, list[dict], float]:
    sel = re.search(r'<select[^>]*id="financialyear".*?</select>', html, flags=re.S)
    opts = re.findall(r'<option value="(\d{4}-\d{4})"', sel.group(0) if sel else "")
    if not opts:
        raise ValueError("DIPAM disinvestment: year not found")
    fy = fy_label(max(opts))
    for t in html_tables(html):
        if not t or "Method of Disinvestment" not in " ".join(t[0]):
            continue
        deals, total = [], None
        for r in t[1:]:
            if r and r[0] == "Total Sum":
                total = num(r[1])
            elif len(r) >= 7 and r[0].isdigit():
                deals.append({"short": r[1], "company": title_case(r[2]), "pct_sold": num(r[3]), "method": r[4].strip(),
                              "receipts_cr": num(r[5]), "goi_after_pct": num(r[6])})
        if total is None or abs(sum(d["receipts_cr"] or 0 for d in deals) - total) > 1:
            raise ValueError("DIPAM disinvestment: deals do not add up to the page total")
        return fy, deals, total
    raise ValueError("DIPAM disinvestment: table not found")


def fetch_disinvestment(sess, old=None) -> dict:
    r = sess.get(DIPAM + "disinvestmentReceiptsDtls", timeout=90)
    r.raise_for_status()
    fy, deals, total = parse_deals(r.text)
    kept = []
    if DEALS.exists():
        with DEALS.open(newline="", encoding="utf-8") as f:
            kept = list(csv.DictReader(f))
    first_seen = {(k["fy"], k["company"], k["receipts_cr"]): k["first_seen"] for k in kept}
    today = today_ist()
    rows = [k for k in kept if k["fy"] != fy]
    for d in deals:
        key = (fy, d["company"], f'{d["receipts_cr"]:.2f}')
        rows.append({"fy": fy, **{k: (f"{v:.2f}" if isinstance(v, float) else v) for k, v in d.items()}, "first_seen": first_seen.get(key, today)})
    rows.sort(key=lambda x: (x["fy"], x["first_seen"], -float(x["receipts_cr"] or 0)))
    DEALS.parent.mkdir(parents=True, exist_ok=True)
    with DEALS.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=DEAL_FIELDS)
        w.writeheader()
        w.writerows(rows)
    by_year: dict[str, list] = {}
    for x in rows:
        by_year.setdefault(x["fy"], []).append({"short": x["short"], "company": x["company"], "pct_sold": num(x["pct_sold"]), "method": x["method"],
                                                "method_label": METHODS.get(x["method"].upper(), x["method"]), "receipts_cr": num(x["receipts_cr"]),
                                                "goi_after_pct": num(x["goi_after_pct"]), "first_seen": x["first_seen"]})
    return {"current_fy": fy, "current_total": total, "by_year": by_year, "source_url": DIPAM + "disinvestmentReceiptsDtls"}


# ---------------------------------------------------------------- DIPAM: market value of GoI shares

def parse_mcap(html: str) -> dict:
    for t in html_tables(html):
        if not t or "Closing Price" not in " ".join(t[0]):
            continue
        rows, total = [], None
        for r in t[1:]:
            if any(c.startswith("Total") for c in r[:3]):
                vals = [num(x) for x in r if num(x) is not None]
                total = {"goi_value": vals[-2], "mcap": vals[-1]} if len(vals) >= 2 else None
            elif len(r) >= 6 and r[0].isdigit():
                name = r[1]
                parent = re.search(r"\(SUBSIDIARY OF ([^)]+)\)", name)
                rows.append({"name": title_case(re.sub(r"\s*\(SUBSIDIARY OF [^)]+\)|-\$$|\s*-\s*\$", "", name).strip()),
                             "subsidiary_of": title_case(parent.group(1).strip().rstrip(".")) if parent else None,
                             "goi_shares": num(r[2]), "price": num(r[3]), "goi_value": num(r[4]), "mcap": num(r[5])})
        if not rows or total is None:
            raise ValueError("DIPAM market value: rows or total missing")
        if abs(sum(x["goi_value"] or 0 for x in rows) - total["goi_value"]) > 5 or abs(sum(x["mcap"] or 0 for x in rows) - total["mcap"]) > 5:
            raise ValueError("DIPAM market value: rows do not add up to the page total")
        for x in rows:
            x["goi_pct"] = round(100 * x["goi_value"] / x["mcap"], 2) if x["mcap"] else None
        return {"rows": sorted(rows, key=lambda x: -(x["mcap"] or 0)), "total": total}
    raise ValueError("DIPAM market value: table not found")


MCAP_FIELDS = ["date", "cpse_goi_value", "cpse_mcap", "cpse_count", "pfi_goi_value", "pfi_mcap", "pfi_count"]


def fetch_mcap(sess, old=None) -> dict:
    out = {"read_on": today_ist(), "source_url": DIPAM + "viewAllCPSE?enty=C"}
    for key, enty in (("cpse", "C"), ("pfi", "B")):
        r = sess.get(DIPAM + "viewAllCPSE", params={"enty": enty}, timeout=90)
        r.raise_for_status()
        out[key] = parse_mcap(r.text)
    row = {"date": out["read_on"],
           "cpse_goi_value": f'{out["cpse"]["total"]["goi_value"]:.2f}', "cpse_mcap": f'{out["cpse"]["total"]["mcap"]:.2f}', "cpse_count": len(out["cpse"]["rows"]),
           "pfi_goi_value": f'{out["pfi"]["total"]["goi_value"]:.2f}', "pfi_mcap": f'{out["pfi"]["total"]["mcap"]:.2f}', "pfi_count": len(out["pfi"]["rows"])}
    rows = []
    if MCAP_SNAPSHOTS.exists():
        with MCAP_SNAPSHOTS.open(newline="", encoding="utf-8") as f:
            rows = [x for x in csv.DictReader(f) if x["date"] != row["date"]]
    rows = sorted(rows + [row], key=lambda x: x["date"])
    MCAP_SNAPSHOTS.parent.mkdir(parents=True, exist_ok=True)
    with MCAP_SNAPSHOTS.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=MCAP_FIELDS)
        w.writeheader()
        w.writerows(rows)
    out["history"] = [{"date": x["date"], "cpse_goi_value": num(x["cpse_goi_value"]), "cpse_mcap": num(x["cpse_mcap"]),
                       "pfi_goi_value": num(x["pfi_goi_value"]), "pfi_mcap": num(x["pfi_mcap"])} for x in rows]
    return out


# ---------------------------------------------------------------- PE Survey 2024-25 via PIB (company-wise net profit)

SURVEY_YEARS = ["2022-23", "2023-24", "2024-25"]


def parse_profit_tables(html: str) -> dict:
    """Annexure I (profit-making) and II (loss-incurring) of LSUQ 2941, 10 Mar 2026."""
    found = {}
    for t in html_tables(html):
        hdr = next((i for i, r in enumerate(t) if len(r) >= 5 and r[2:5] == ["2024-25", "2023-24", "2022-23"]), None)
        if hdr is None:
            continue
        group, firms, subtotals, grand = None, [], {}, None
        for r in t[hdr + 1:]:
            r = r + [""] * (5 - len(r))
            label = r[1]
            vals = [num(v) for v in r[2:5]]
            if label.upper().startswith("GRAND TOTAL"):
                grand = vals
            elif label.upper().startswith("SUB TOTAL"):
                subtotals[group] = vals
            elif r[0].strip().isdigit() and None not in vals:
                firms.append({"name": label, "group": group, "lakh": dict(zip(["2024-25", "2023-24", "2022-23"], vals))})
            elif label and not r[0].strip() and all(v is None for v in vals):
                group = label
        if not firms or grand is None:
            continue
        for i, y in enumerate(["2024-25", "2023-24", "2022-23"]):
            if abs(sum(f["lakh"][y] for f in firms) - grand[i]) > 2:
                raise ValueError(f"PIB annexure: CPSE rows do not add up to the grand total for {y}")
        for g, v in subtotals.items():
            if abs(sum(f["lakh"]["2024-25"] for f in firms if f["group"] == g) - v[0]) > 2:
                raise ValueError(f"PIB annexure: rows for {g} do not add up to the sub total")
        kind = "profit" if grand[0] > 0 else "loss"
        found.setdefault(kind, firms)
    if set(found) != {"profit", "loss"}:
        raise ValueError("PIB annexure: profit and loss tables not both found")
    return found


SECTOR = {  # DPE's four sectors (PE Survey 2023-24, Table 1.2)
    "Agro Based Industries": "Agriculture",
    "Coal": "Mining and exploration", "Crude Oil": "Mining and exploration", "Other Minerals & Metals": "Mining and exploration",
    "Chemicals & Pharmaceuticals": "Manufacturing, processing and generation", "Defence Production": "Manufacturing, processing and generation",
    "Fertilizers": "Manufacturing, processing and generation", "Heavy & Medium Engineering": "Manufacturing, processing and generation",
    "Industrial and Consumer Goods": "Manufacturing, processing and generation", "Petroleum (Refinery & Marketing)": "Manufacturing, processing and generation",
    "Power Generation": "Manufacturing, processing and generation", "Steel": "Manufacturing, processing and generation", "Textiles": "Manufacturing, processing and generation",
}


def sector_of(group: str) -> str:
    return SECTOR.get(group, "Services")


def fetch_pe_survey(sess, old=None) -> dict:
    r = sess.get(PIB_PROFIT, timeout=90)
    r.raise_for_status()
    t = parse_profit_tables(r.text)
    firms = []
    for kind in ("profit", "loss"):
        for f in t[kind]:
            cr = {y: round(f["lakh"][y] / 100, 2) for y in SURVEY_YEARS}
            firms.append({"name": f["name"], "group": f["group"], "sector": sector_of(f["group"]), "np": cr, "status_2024_25": kind})
    groups: dict[str, dict] = {}
    for f in firms:
        g = groups.setdefault(f["group"], {"group": f["group"], "sector": f["sector"], "np": {y: 0.0 for y in SURVEY_YEARS}, "firms": 0, "loss_makers": 0})
        g["firms"] += 1
        g["loss_makers"] += f["np"]["2024-25"] < 0
        for y in SURVEY_YEARS:
            g["np"][y] = round(g["np"][y] + f["np"][y], 2)
    totals = {}
    for y in SURVEY_YEARS:
        pos = sum(f["np"][y] for f in firms if f["np"][y] > 0)
        neg = sum(f["np"][y] for f in firms if f["np"][y] < 0)
        totals[y] = {"profit": round(pos, 2), "loss": round(-neg, 2), "net": round(pos + neg, 2),
                     "profit_makers": sum(f["np"][y] > 0 for f in firms), "loss_makers": sum(f["np"][y] < 0 for f in firms)}
    # Statement J grand total: contribution to the Central Exchequer (Rs lakh), three years.
    cce = None
    try:
        import pdfplumber
        pdf = sess.get(DPE_STATEMENT_J, timeout=120)
        pdf.raise_for_status()
        with pdfplumber.open(io.BytesIO(pdf.content)) as p:
            text = "\n".join((pg.extract_text() or "") for pg in p.pages)
        m = re.findall(r"^TOTAL\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$", text, flags=re.M)
        if m:
            a, b, c = (int(x) / 100 for x in m[-1])
            cce = {"2024-25": round(a, 2), "2023-24": round(b, 2), "2022-23": round(c, 2), "source_url": DPE_STATEMENT_J}
    except Exception as e:  # the profit tables still stand on their own
        print(f"pe_survey: Statement J not read ({e})", file=sys.stderr)
    return {"years": SURVEY_YEARS, "firms": firms, "groups": sorted(groups.values(), key=lambda g: -g["np"]["2024-25"]), "totals": totals,
            "cce": cce or (old or {}).get("cce"), "source_url": PIB_PROFIT,
            "source_label": "Lok Sabha Unstarred Question 2941, 10 March 2026 (PIB), from DPE's Public Enterprises Survey 2024-25"}


# ---------------------------------------------------------------- hand-kept survey history

def read_history(pe: dict | None) -> dict:
    by_year: dict[str, dict] = {}
    with HEADLINES.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            y = by_year.setdefault(r["year"], {"year": r["year"], "sources": {}})
            y[r["metric"]] = float(r["value_crore"])
            y["sources"][r["metric"]] = {"label": r["source"], "url": r["url"], "precision": r["precision"]}
    for y in by_year.values():  # 2019-20: the release gives profit and loss but not their sum
        if "overall_net_profit" not in y and "profit_of_profit_makers" in y and "loss_of_loss_makers" in y:
            y["overall_net_profit"] = y["profit_of_profit_makers"] - y["loss_of_loss_makers"]
            y["sources"]["overall_net_profit"] = {**y["sources"]["profit_of_profit_makers"], "label": y["sources"]["profit_of_profit_makers"]["label"] + "; profit less loss"}
    if pe:  # 2024-25 from the company-wise tables
        t = pe["totals"]["2024-25"]
        y = by_year.setdefault("2024-25", {"year": "2024-25", "sources": {}})
        src = {"label": "PE Survey 2024-25, company tables (Lok Sabha reply, 10 Mar 2026)", "url": pe["source_url"], "precision": "crore"}
        for k, v in (("overall_net_profit", t["net"]), ("profit_of_profit_makers", t["profit"]), ("loss_of_loss_makers", t["loss"]),
                     ("profit_makers", t["profit_makers"]), ("loss_makers", t["loss_makers"])):
            y[k] = v
            y["sources"][k] = src
        if pe.get("cce"):
            y["contribution_to_exchequer"] = pe["cce"]["2024-25"]
            y["sources"]["contribution_to_exchequer"] = {"label": "PE Survey 2024-25, Statement J", "url": pe["cce"]["source_url"], "precision": "crore"}
    return {"years": sorted(by_year.values(), key=lambda y: y["year"]), "tables": json.loads(TABLES.read_text(encoding="utf-8"))}


# ---------------------------------------------------------------- build

FETCHERS = {
    "receipts": fetch_receipts,
    "dividends": fetch_dividends,
    "disinvestment": fetch_disinvestment,
    "mcap": fetch_mcap,
    "pe_survey": fetch_pe_survey,
}


def build(only: list[str] | None = None) -> dict:
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    sess = session()
    out = {"generated_at": now_iso(), "status": {}}
    for key, fn in FETCHERS.items():
        if only and key not in only:
            out[key] = old.get(key)
            out["status"][key] = (old.get("status") or {}).get(key, {"state": "missing"})
            continue
        try:
            out[key] = fn(sess, old.get(key))
            out["status"][key] = {"state": "ok", "checked_at": out["generated_at"]}
            print(f"{key}: ok")
        except Exception as e:  # keep the last good copy
            out[key] = old.get(key)
            prev = (old.get("status") or {}).get(key, {})
            out["status"][key] = {"state": "stale" if out[key] else "missing", "error": f"{type(e).__name__}: {e}"[:300],
                                  "checked_at": out["generated_at"], "last_ok": prev.get("checked_at") if prev.get("state") == "ok" else prev.get("last_ok")}
            print(f"{key}: FAILED, kept last good copy ({e})", file=sys.stderr)
    out["history"] = read_history(out.get("pe_survey"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", action="append", choices=sorted(FETCHERS), help="rebuild only this source (repeatable)")
    args = ap.parse_args(argv)
    out = build(args.only)
    bad = [k for k, s in out["status"].items() if s["state"] != "ok"]
    print(f"Wrote {OUT.relative_to(ROOT)}" + (f"; not refreshed: {', '.join(bad)}" if bad else ""))
    return 1 if bad and not any(s["state"] == "ok" for s in out["status"].values()) else 0


if __name__ == "__main__":
    sys.exit(main())
