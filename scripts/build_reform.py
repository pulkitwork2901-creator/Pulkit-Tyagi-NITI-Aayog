"""
Build public/data/reform/evidence.json for the Reform Evidence Board.

Six live sources, each read straight from the publisher, plus one small
hand-kept sheet:

  DARPG CPGRAMS dashboard (pgportal.gov.in/darpgdashboard)
      Public grievances received, disposed and pending by age, for every
      central ministry/department and every State/UT, year to date.
  Ministry of MSME dashboard (dashboard.msme.gov.in)
      Udyam registrations by State/UT (micro, small, medium) and informal
      enterprises on the Udyam Assist Platform. Each run appends a dated row
      to data/reform/msme-snapshots.csv.
  Regulator consultations (SEBI, RBI, TRAI, IRDAI)
      The latest consultation papers and draft regulations from each
      regulator's own listing page.

  World Bank, Worldwide Governance Indicators (api.worldbank.org, source 3)
      Six governance scores on the 0-100 absolute scale introduced in the 2025
      methodology revision, with their 90% confidence intervals, for India and
      a peer set; India's rank among all economies scored that year.
  IBBI quarterly newsletter data annex (ibbi.gov.in/publication)
      The Excel file published with each quarterly newsletter. Tables 1, 2, 6
      and 8 give CIRP outcomes, the year-wise flow, average time to resolution
      and amounts realised. Columns and rows are found by their text, never by
      position.
  National Judicial Data Grid (njdg.ecourts.gov.in)
      Pending cases in district courts and High Courts, read from the public
      dashboards. Each run also appends a dated row to
      data/reform/njdg-snapshots.csv, so a pendency trend builds up over time.
  data/reform/milestones.csv
      Reform milestones, each with an official source link.

If a source fails, its last good block is kept from the existing output file
and marked stale, so one broken website never blanks the board.

Usage:
  python scripts/build_reform.py
  python scripts/build_reform.py --only wgi        # rebuild one source
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "reform" / "evidence.json"
SNAPSHOTS = ROOT / "data" / "reform" / "njdg-snapshots.csv"
MILESTONES = ROOT / "data" / "reform" / "milestones.csv"

WB = "https://api.worldbank.org/v2"
IBBI_LIST = "https://ibbi.gov.in/publication"
NJDG_DISTRICT = "https://njdg.ecourts.gov.in/njdg_v3/"
NJDG_HC = "https://njdg.ecourts.gov.in/hcnjdg_v2/"
UA = "Mozilla/5.0 (compatible; reform-evidence-board/1.0)"

# Definitions quoted from "The Worldwide Governance Indicators: Methodology for
# Measuring Governance Using Perception Data", World Bank, September 2026.
WGI_DIMS = [
    ("RQ", "Regulatory quality", "Perceptions of the government's ability to design and implement policies and regulations that promote private sector development."),
    ("RL", "Rule of law", "Perceptions of the extent to which agents respect and follow the rules of society, including contract enforcement, property rights, the police, courts, and the likelihood of crime and violence."),
    ("GE", "Government effectiveness", "Perceptions of the quality of public services, the civil service, policy formulation and implementation, and the credibility of a government's commitment to such policies."),
    ("CC", "Control of corruption", "Perceptions of the extent to which public power is used for private gain, including both petty and grand corruption, as well as capture of the state by elites and private interests."),
    ("VA", "Voice and accountability", "Perceptions of the extent to which citizens can participate in selecting their government, and of accountability mechanisms such as access to information, oversight bodies and the media."),
    ("PV", "Political stability", "Perceptions of the likelihood of political instability and of challenges to or changes in political authority through violent, coercive, or unconstitutional means."),
]
# Large emerging economies and regional neighbours India is usually compared with.
PEERS = ["IND", "CHN", "IDN", "BRA", "MEX", "ZAF", "TUR", "VNM", "THA", "MYS", "PHL", "BGD"]
SHORT_NAMES = {"Korea, Rep.": "Korea", "Viet Nam": "Vietnam", "Turkiye": "Türkiye", "Russian Federation": "Russia"}


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


def html_text(html: str) -> str:
    """Visible text of a page on one line, scripts and styles removed."""
    t = re.sub(r"<script.*?</script>|<style.*?</style>|<!--.*?-->", " ", html, flags=re.S | re.I)
    t = unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"\s+", " ", t.replace("\xa0", " ")).strip()


def num(s) -> float | None:
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    s = str(s).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


# ---------------------------------------------------------------- World Bank WGI

def _wb_rows(sess, path: str) -> list[dict]:
    rows, page = [], 1
    while True:
        r = sess.get(f"{WB}/{path}", params={"format": "json", "source": 3, "per_page": 20000, "page": page}, timeout=60)
        r.raise_for_status()
        body = r.json()
        if not isinstance(body, list) or len(body) < 2:
            raise ValueError(f"World Bank API returned no data for {path}: {str(body)[:200]}")
        rows += body[1] or []
        if page >= int(body[0].get("pages", 1)):
            return rows
        page += 1


def fetch_wgi(sess, old=None) -> dict:
    countries = sess.get(f"{WB}/country", params={"format": "json", "per_page": 400}, timeout=60).json()[1]
    economies = {c["id"] for c in countries if c.get("region", {}).get("id") != "NA"}  # drops aggregates
    meta = sess.get(f"{WB}/sources", params={"format": "json", "per_page": 100}, timeout=60).json()[1]
    updated = next((s.get("lastupdated") for s in meta if str(s.get("id")) == "3"), None)

    dims = []
    for code, label, definition in WGI_DIMS:
        score = _wb_rows(sess, f"country/all/indicator/GOV_WGI_{code}.SC")
        lo = {r["date"]: r["value"] for r in _wb_rows(sess, f"country/IND/indicator/GOV_WGI_{code}.SC_LB")}
        hi = {r["date"]: r["value"] for r in _wb_rows(sess, f"country/IND/indicator/GOV_WGI_{code}.SC_UB")}
        peer_lo = {(r["countryiso3code"], r["date"]): r["value"] for r in _wb_rows(sess, f"country/{';'.join(PEERS)}/indicator/GOV_WGI_{code}.SC_LB")}
        peer_hi = {(r["countryiso3code"], r["date"]): r["value"] for r in _wb_rows(sess, f"country/{';'.join(PEERS)}/indicator/GOV_WGI_{code}.SC_UB")}

        india = sorted(
            ({"year": int(r["date"]), "value": round(r["value"], 2),
              "lo": round(lo[r["date"]], 2) if lo.get(r["date"]) is not None else None,
              "hi": round(hi[r["date"]], 2) if hi.get(r["date"]) is not None else None}
             for r in score if r["countryiso3code"] == "IND" and r["value"] is not None),
            key=lambda p: p["year"])
        if not india:
            raise ValueError(f"No India values for {code}")
        latest = india[-1]["year"]
        field = sorted(((r["countryiso3code"], r["value"]) for r in score
                        if r["date"] == str(latest) and r["value"] is not None and r["countryiso3code"] in economies),
                       key=lambda x: -x[1])
        rank = next(i + 1 for i, (iso, _) in enumerate(field) if iso == "IND")
        vals = sorted(v for _, v in field)
        median = vals[len(vals) // 2] if len(vals) % 2 else (vals[len(vals) // 2 - 1] + vals[len(vals) // 2]) / 2
        names = {r["countryiso3code"]: r["country"]["value"] for r in score}
        peers = sorted(
            ({"iso": iso, "name": SHORT_NAMES.get(names.get(iso), names.get(iso)), "value": round(v, 2),
              "lo": round(peer_lo[(iso, str(latest))], 2) if peer_lo.get((iso, str(latest))) is not None else None,
              "hi": round(peer_hi[(iso, str(latest))], 2) if peer_hi.get((iso, str(latest))) is not None else None}
             for iso, v in field if iso in PEERS),
            key=lambda p: -p["value"])
        # Change judged the World Bank's way: significant only if the 90% intervals do not overlap.
        base = next((p for p in india if p["year"] == latest - 10), None)
        now = india[-1]
        sig = None
        if base and None not in (base["lo"], base["hi"], now["lo"], now["hi"]):
            sig = "up" if now["lo"] > base["hi"] else "down" if now["hi"] < base["lo"] else "none"
        dims.append({
            "code": code, "label": label, "definition": definition,
            "latest_year": latest, "value": now["value"], "lo": now["lo"], "hi": now["hi"],
            "rank": rank, "of": len(field), "world_median": round(median, 2),
            "base_year": base["year"] if base else None, "base_value": base["value"] if base else None,
            "ten_year_change": sig, "series": india, "peers": peers,
        })
    return {
        "source": "World Bank, Worldwide Governance Indicators",
        "source_url": "https://www.worldbank.org/en/publication/worldwide-governance-indicators",
        "api": f"{WB}/sources/3",
        "updated": updated, "dimensions": dims,
    }


# ---------------------------------------------------------------- IBBI

def _ibbi_latest(sess) -> tuple[str, str, str]:
    html = sess.get(IBBI_LIST, timeout=60).text
    for row in re.findall(r"<tr.*?</tr>", html, flags=re.S | re.I):
        text = html_text(row)
        m = re.search(r"QUARTERLY NEWSLETTER FOR ([A-Z ,\-]+?\d{4})", text, flags=re.I)
        xlsx = re.search(r'href="([^"]+\.xlsx)"', row, flags=re.I)
        if m and xlsx:
            url = xlsx.group(1)
            if url.startswith("/"):
                url = "https://ibbi.gov.in" + url
            return re.sub(r"\s+", " ", m.group(1)).strip(), url, IBBI_LIST
    raise ValueError("No quarterly newsletter with a data file found on the IBBI publication page")


def _rows(ws) -> list[list]:
    return [list(r) for r in ws.iter_rows(values_only=True)]


def _find_sheet(wb, *words):
    for ws in wb.worksheets:
        head = " ".join(str(c) for r in ws.iter_rows(min_row=1, max_row=3, values_only=True) for c in r if c)
        if all(w.lower() in head.lower() for w in words):
            return ws
    raise ValueError(f"No sheet whose title mentions {words}")


def _cells(row):
    return [str(c).strip() if c is not None else "" for c in row]


def parse_ibbi(xlsx_bytes: bytes) -> dict:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)

    # Table 1: status of all CIRPs
    t1 = _rows(_find_sheet(wb, "Details of CIRP cases"))
    title = " ".join(c for r in t1[:4] for c in _cells(r) if c)
    as_on = re.search(r"as on (\w+ \d{1,2}, \d{4})", title, flags=re.I)
    as_on = datetime.strptime(as_on.group(1), "%B %d, %Y").date().isoformat() if as_on else None
    status_keys = {
        "admitted": r"^admitted$", "withdrawn": r"withdrawn under section 12a", "appeal": r"appeal or review or settled",
        "resolved": r"resolution plans approved", "liquidated": r"liquidation orders passed", "ongoing": r"ongoing cirp",
    }
    status = {}
    for r in t1:
        c = _cells(r)
        label = c[0].lower() if c else ""
        for k, pat in status_keys.items():
            if re.search(pat, label) and num(r[1]) is not None:
                status[k] = int(num(r[1]))
    missing = set(status_keys) - set(status)
    if missing:
        raise ValueError(f"IBBI Table 1: could not find {sorted(missing)}")

    # Table 2: year-wise flow of CIRPs
    t2 = _rows(_find_sheet(wb, "Corporate Insolvency Resolution Process"))
    hi = next(i for i, r in enumerate(t2) if any("year / quarter" in c.lower() for c in _cells(r)))
    head = [" ".join(x).lower() for x in zip(_cells(t2[hi]), _cells(t2[hi + 1]))]

    def col(*words):
        for j, h in enumerate(head):
            if all(w in h for w in words):
                return j
        raise ValueError(f"IBBI Table 2: no column for {words}")
    cy, ca = col("year / quarter"), col("admitted")
    cap, cw, cr, cl = col("appeal"), col("withdrawal"), col("resolution plan"), col("liquidation")
    ce = col("end of the period")
    flow = []
    for r in t2[hi + 2:]:
        c = _cells(r)
        period = c[cy]
        if not period or period.lower().startswith("total") or num(r[ca]) is None:
            if period.lower().startswith("total"):
                break
            continue
        flow.append({"period": re.sub(r"\s*-\s*", "-", period).replace("June", "Jun").strip(),
                     "admitted": int(num(r[ca])), "appeal": int(num(r[cap])), "withdrawn": int(num(r[cw])),
                     "resolved": int(num(r[cr])), "liquidated": int(num(r[cl])), "ongoing_end": int(num(r[ce]))})

    # Table 6: average days from insolvency commencement to approval of a resolution plan
    t6 = _rows(_find_sheet(wb, "Average Time for approval"))
    ph = next(i for i, r in enumerate(t6) if sum(1 for c in _cells(r) if re.match(r"(as on|apr|jan|jul|oct)", c.lower())) >= 2)
    periods = [(j, c) for j, c in enumerate(_cells(t6[ph])) if re.match(r"(as on|apr|jan|jul|oct)", c.lower())]
    days = []
    for r in t6:
        if any("icd to approval of resolution plan" in c.lower() for c in _cells(r)):
            for j, p in periods:
                if num(r[j]) is not None and num(r[j + 1]) is not None:
                    days.append({"period": p.replace("As on ", "To end-"), "processes": int(num(r[j])),
                                 "days": int(num(r[j + 1])), "days_excl": int(num(r[j + 2])) if num(r[j + 2]) is not None else None})
            break
    if not days:
        raise ValueError("IBBI Table 6: no row for time to approval of resolution plans")

    # Table 8: amounts in CIRPs that yielded resolution plans (cumulative total row)
    t8 = _rows(_find_sheet(wb, "CIRPs yielding Resolution Plans"))
    tot = next((r for r in t8 if any(re.match(r"total \(till", c.lower()) for c in _cells(r))), None)
    if tot is None:
        raise ValueError("IBBI Table 8: no cumulative total row")
    vals = [num(c) for c in tot if num(c) is not None]
    claims, liq, fair, realised = vals[:4]
    # IBBI prints the three percentages as fractions in the total row (0.3052 = 30.52%).
    pct = [v * 100 if v < 10 else v for v in vals[4:7]]
    if len(pct) != 3 or not (claims > realised > 0) or abs(pct[0] - 100 * realised / claims) > 1:
        raise ValueError(f"IBBI Table 8: unexpected totals {vals[:7]}")
    notes = " ".join(c for r in t8 for c in _cells(r) if c)
    fv_cases = re.search(r"based on (\d+) cases where fair value", notes, flags=re.I)

    return {
        "as_on": as_on, "status": status, "flow": flow, "days_to_resolution": days,
        "realisation": {
            "claims_cr": round(claims, 2), "liquidation_value_cr": round(liq, 2),
            "fair_value_cr": round(fair, 2), "realised_cr": round(realised, 2),
            "pct_of_claims": round(pct[0], 2), "pct_of_liquidation_value": round(pct[1], 2),
            "pct_of_fair_value": round(pct[2], 2),
            "fair_value_cases": int(fv_cases.group(1)) if fv_cases else None,
        },
    }


def fetch_ibbi(sess, old=None) -> dict:
    quarter, url, listing = _ibbi_latest(sess)
    r = sess.get(url, timeout=180)
    r.raise_for_status()
    out = parse_ibbi(r.content)
    out.update({"source": "Insolvency and Bankruptcy Board of India, quarterly newsletter data annex",
                "newsletter": f"Quarterly newsletter for {quarter.title()}", "file_url": url, "source_url": listing})
    return out


# ---------------------------------------------------------------- NJDG

AGE_BANDS = [("Less than one year", "Under 1 year"), ("1 to 3 Years", "1 to 3 years"), ("3 to 5 Years", "3 to 5 years"),
             ("5 to 10 Years", "5 to 10 years"), ("Above 10 Years", "Over 10 years")]
N = r"([\d,]+)"


def parse_njdg(html: str, level: str) -> dict:
    t = html_text(html)
    m = re.search(r"Civil Cases " + N + r"(?:(?!Civil Cases).){0,80}?Criminal Cases " + N + r"(?:(?!Total Cases).){0,80}?Total Cases " + N, t)
    if not m:
        raise ValueError(f"NJDG {level}: pending totals not found")
    civil, criminal, total = (int(num(g)) for g in m.groups())
    if civil + criminal != total:
        raise ValueError(f"NJDG {level}: civil + criminal ({civil + criminal}) does not equal total ({total})")
    ages = []
    for key, label in AGE_BANDS:
        a = re.search(re.escape(key) + r" " + N + r" " + N + r" " + N, t)
        if not a:
            raise ValueError(f"NJDG {level}: age band '{key}' not found")
        ages.append({"band": label, "civil": int(num(a.group(1))), "criminal": int(num(a.group(2))), "total": int(num(a.group(3)))})

    def flow(label):
        f = re.search(label + r" " + N + r" " + N + r" " + N, t)
        return int(num(f.group(3))) if f else None
    return {"civil": civil, "criminal": criminal, "total": total, "ages": ages,
            "instituted_last_month": flow("Cases Instituted in Last Month"),
            "disposed_last_month": flow("Cases Disposed in Last Month")}


def fetch_njdg(sess, old=None) -> dict:
    out = {"source": "National Judicial Data Grid (eCommittee, Supreme Court of India)", "read_at": now_iso(), "levels": {}}
    for level, url in (("district", NJDG_DISTRICT), ("high_courts", NJDG_HC)):
        r = sess.get(url, timeout=90)
        r.raise_for_status()
        out["levels"][level] = parse_njdg(r.text, level) | {"source_url": url}
    return out


def record_snapshot(njdg: dict) -> list[dict]:
    """Append today's reading (one row per level, replacing any earlier row for the same day); return all rows."""
    fields = ["date", "level", "total", "civil", "criminal", "over_10_years", "instituted_last_month", "disposed_last_month"]
    rows = []
    if SNAPSHOTS.exists():
        with SNAPSHOTS.open(newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
    day = njdg["read_at"][:10]
    rows = [r for r in rows if r["date"] != day]
    for level, d in njdg["levels"].items():
        rows.append({"date": day, "level": level, "total": d["total"], "civil": d["civil"], "criminal": d["criminal"],
                     "over_10_years": d["ages"][-1]["total"], "instituted_last_month": d["instituted_last_month"] or "",
                     "disposed_last_month": d["disposed_last_month"] or ""})
    rows.sort(key=lambda r: (r["date"], r["level"]))
    SNAPSHOTS.parent.mkdir(parents=True, exist_ok=True)
    with SNAPSHOTS.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return rows


def snapshot_history() -> dict:
    hist = {}
    if SNAPSHOTS.exists():
        with SNAPSHOTS.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                hist.setdefault(r["level"], []).append({"date": r["date"], "total": int(r["total"]), "over_10_years": int(r["over_10_years"])})
    return hist


# ---------------------------------------------------------------- tables

def html_tables(html: str) -> list[list[list[str]]]:
    """Every <table> on a page as rows of cell text."""
    out = []
    for t in re.findall(r"<table.*?</table>", html, flags=re.S | re.I):
        rows = []
        for r in re.findall(r"<tr.*?</tr>", t, flags=re.S | re.I):
            cells = [re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                     for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, flags=re.S | re.I)]
            if any(cells):
                rows.append(cells)
        out.append(rows)
    return out


def write_snapshot(path: Path, fields: list[str], new_rows: list[dict], key=("date",)) -> list[dict]:
    """Merge dated rows into a CSV, replacing rows with the same key; return all rows."""
    rows = []
    if path.exists():
        with path.open(newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
    keys = {tuple(str(r[k]) for k in key) for r in new_rows}
    rows = [r for r in rows if tuple(r[k] for k in key) not in keys] + [{k: r.get(k, "") for k in fields} for r in new_rows]
    rows.sort(key=lambda r: tuple(r[k] for k in key))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return rows


# ---------------------------------------------------------------- CPGRAMS (public grievances)

CPGRAMS = "https://pgportal.gov.in/darpgdashboard"
PENDING_BANDS = ["0 to 60 days", "60 to 180 days", "180 to 365 days", "Over 1 year"]


def parse_cpgrams(html: str) -> dict:
    period = re.search(r"between\s*(\d\d)/(\d\d)/(\d{4})\s*and\s*(\d\d)/(\d\d)/(\d{4})", html)
    if not period:
        raise ValueError("CPGRAMS: reporting period not found")
    d1, m1, y1, d2, m2, y2 = period.groups()
    blocks = []
    for rows in html_tables(html):
        head = [c.lower() for c in rows[0]] if rows else []
        if not (head and "received" in " ".join(head) and "% disposed" in " ".join(head)):
            continue
        col = {name: next(i for i, h in enumerate(head) if pat in h) for name, pat in
               (("name", "organization"), ("received", "received"), ("disposed", "# disposed"), ("pct", "% disposed"),
                ("p60", "0-60"), ("p180", "60-180"), ("p365", "180-365"), ("p1y", "more than 1 year"))}
        orgs = []
        for r in rows[1:]:
            if len(r) < len(head) or num(r[col["received"]]) is None:
                continue
            o = {"name": r[col["name"]], "received": int(num(r[col["received"]])), "disposed": int(num(r[col["disposed"]])),
                 "pct_disposed": num(r[col["pct"]]),
                 "pending": [int(num(r[col[k]]) or 0) for k in ("p60", "p180", "p365", "p1y")]}
            # The portal's own % disposed must match its counts, or the columns are not what we think.
            if o["received"] and abs(100 * o["disposed"] / o["received"] - o["pct_disposed"]) > 0.6:
                raise ValueError(f"CPGRAMS: % disposed does not match counts for {o['name']}")
            orgs.append(o)
        blocks.append(orgs)
    if len(blocks) < 2 or len(blocks[0]) < 20:
        raise ValueError(f"CPGRAMS: expected ministry and state tables, found {[len(b) for b in blocks]}")
    # The page shows ministries first, then States/UTs.
    def total(orgs):
        rec = sum(o["received"] for o in orgs)
        dis = sum(o["disposed"] for o in orgs)
        pend = [sum(o["pending"][i] for o in orgs) for i in range(4)]
        return {"received": rec, "disposed": dis, "pct_disposed": round(100 * dis / rec, 2) if rec else None, "pending": pend}
    return {"from": f"{y1}-{m1}-{d1}", "to": f"{y2}-{m2}-{d2}", "pending_bands": PENDING_BANDS,
            "central": {"total": total(blocks[0]), "orgs": blocks[0]},
            "states": {"total": total(blocks[1]), "orgs": blocks[1]}}


def fetch_grievances(sess, old=None) -> dict:
    r = sess.get(CPGRAMS, timeout=90)
    r.raise_for_status()
    return parse_cpgrams(r.text) | {
        "source": "DARPG, Centralized Public Grievance Redress and Monitoring System (CPGRAMS) dashboard",
        "source_url": CPGRAMS, "read_at": now_iso()}


# ---------------------------------------------------------------- MSME (Udyam registrations)

MSME_STATES = "https://dashboard.msme.gov.in/Udyam_Statewise.aspx"
MSME_SNAPSHOTS = ROOT / "data" / "reform" / "msme-snapshots.csv"
# The dashboard's server omits its intermediate certificate. Rather than turn
# verification off, fetch that intermediate from the issuer (GlobalSign) and
# verify the full chain to GlobalSign's root in the normal trust store.
MSME_INTERMEDIATE = "https://secure.globalsign.com/cacert/gsgccr46ovtlsca2025.crt"


def _msme_bundle(sess) -> str:
    import tempfile
    import certifi
    from cryptography import x509
    from cryptography.hazmat.primitives.serialization import Encoding
    cert = x509.load_der_x509_certificate(sess.get(MSME_INTERMEDIATE, timeout=60).content)
    f = tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False)
    f.write(Path(certifi.where()).read_text() + "\n" + cert.public_bytes(Encoding.PEM).decode())
    f.close()
    return f.name


def parse_msme(html: str) -> dict:
    tables = [t for t in html_tables(html) if any(len(r) >= 7 and r[-1].replace(",", "").isdigit() for r in t)]
    if not tables:
        raise ValueError("MSME: state table not found")
    if not re.search(r"Micro.*?Small.*?Medium.*?Total Udyam.*?IMEs \(UAP\).*?Total MSMEs", re.sub(r"<[^>]+>", " ", html), flags=re.S):
        raise ValueError("MSME: column headings have changed")
    states, total = [], None
    for r in tables[0]:
        vals = [num(c) for c in r[-6:]]
        if None in vals:
            continue
        micro, small, medium, udyam, uap, all_ = (int(v) for v in vals)
        row = {"micro": micro, "small": small, "medium": medium, "udyam": udyam, "uap": uap, "total": all_}
        if micro + small + medium != udyam or udyam + uap != all_:
            raise ValueError(f"MSME: row does not add up: {r}")
        if r[0].lower().startswith("total"):
            total = row
        else:
            states.append({"name": r[-7].title().replace(" And ", " and ").replace(" Of ", " of "), **row})
    if not total or sum(s["total"] for s in states) != total["total"]:
        raise ValueError("MSME: states do not add up to the national total")
    return {"states": sorted(states, key=lambda s: -s["udyam"]), "total": total}


def fetch_msme(sess, old=None) -> dict:
    r = sess.get(MSME_STATES, timeout=90, verify=_msme_bundle(sess))
    r.raise_for_status()
    out = parse_msme(r.text) | {"source": "Ministry of MSME dashboard, state-wise Udyam registration",
                                "source_url": MSME_STATES, "read_at": now_iso()}
    t = out["total"]
    rows = write_snapshot(MSME_SNAPSHOTS, ["date", "micro", "small", "medium", "udyam", "uap", "total"],
                          [{"date": out["read_at"][:10], **t}])
    out["history"] = [{"date": x["date"], "udyam": int(x["udyam"]), "total": int(x["total"])} for x in rows]
    return out


# ---------------------------------------------------------------- regulator consultations

def _abs(base: str, href: str) -> str:
    from urllib.parse import urljoin
    return urljoin(base, href.strip())


def _date(s: str, *fmts) -> str | None:
    for f in fmts:
        try:
            return datetime.strptime(s.strip(), f).date().isoformat()
        except ValueError:
            pass
    return None


def cons_sebi(sess) -> list[dict]:
    url = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=4&ssid=38&smid=35"
    html = sess.get(url, timeout=60).text
    if "consultation" not in html.lower():
        raise ValueError("SEBI: consultation papers list not found")
    items = []
    for r in re.findall(r"<tr.*?</tr>", html, flags=re.S | re.I):
        # SEBI's title cell is not closed and nests a second link inside the
        # title attribute, so read the date cell and the first link's attributes.
        first = re.search(r"<td[^>]*>\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s*</td>", r)
        link = re.search(r'<a href="([^"]+)"[^>]*?title="([^"<]+)', r)
        if not (first and link):
            continue
        d = _date(first.group(1), "%b %d, %Y")
        title = re.sub(r"\s+", " ", unescape(link.group(2))).strip().rstrip(".")
        if d and title:
            items.append({"regulator": "SEBI", "date": d, "title": title, "url": _abs(url, link.group(1)), "kind": "Consultation paper"})
    return items


def cons_rbi(sess) -> list[dict]:
    url = "https://www.rbi.org.in/Scripts/DraftNotificationsGuildelines.aspx"
    html = sess.get(url, timeout=60).text
    items, current = [], None
    for r in re.findall(r"<tr.*?</tr>", html, flags=re.S | re.I):
        text = html_text(r)
        d = _date(text, "%b %d, %Y")
        if d:
            current = d
            continue
        link = re.search(r"<a[^>]+class=['\"]?link2['\"]?[^>]+href=['\"]?([^'\" >]+)['\"]?[^>]*>(.*?)</a>", r, flags=re.S | re.I)
        if current and link:
            items.append({"regulator": "RBI", "date": current, "title": html_text(link.group(2)),
                          "url": _abs("https://www.rbi.org.in/Scripts/", link.group(1)), "kind": "Draft for comments"})
    return items


def cons_trai(sess) -> list[dict]:
    url = "https://www.trai.gov.in/release-publication/consultation"
    html = sess.get(url, timeout=60).text

    def field(it, cls):
        m = re.search(r'class="' + cls + r'[^"]*".*?<span class="field-content">(.*?)</span>', it, flags=re.S)
        return html_text(m.group(1)) if m else None
    items = []
    for it in re.findall(r'<li>\s*<div class="serial-number tablefield">.*?</li>', html, flags=re.S):
        title, d, status = field(it, "title-number"), _date(field(it, "release-date") or "", "%d/%m/%Y"), field(it, "status-feild")
        link = re.search(r'class="view-comments"><a href="([^"]+)"', it)
        if title and d:
            items.append({"regulator": "TRAI", "date": d, "title": title, "status": status, "division": field(it, "division-section"),
                          "url": _abs("https://www.trai.gov.in/", link.group(1)) if link else url, "kind": "Consultation paper"})
    if not items:
        raise ValueError("TRAI: no consultation entries found")
    return items


def cons_irdai(sess) -> list[dict]:
    url = "https://irdai.gov.in/exposure-drafts"
    html = sess.get(url, timeout=60).text
    items = []
    for r in re.findall(r"<tr.*?</tr>", html, flags=re.S | re.I):
        tds = [html_text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", r, flags=re.S | re.I)]
        if len(tds) < 4:
            continue
        d = next((_date(c, "%d-%m-%Y") for c in tds if re.fullmatch(r"\d\d-\d\d-\d{4}", c)), None)
        # Titles are bilingual, "Hindi / English": keep the English part, looking
        # in the description, sub-title and file name cells in that order.
        title = tds[2]
        for cell in (tds[2], tds[3] if len(tds) > 3 else "", tds[-1]):
            part = re.split(r"\s*/\s*", cell)[-1].strip()
            if re.search(r"[A-Za-z]{4}", part):
                title = re.sub(r"\.pdf.*$", "", part).replace("+", " ").strip()
                break
        link = re.search(r'href="(https://irdai\.gov\.in/documents/[^"]+)"', r)
        if d and title:
            kind = "Response to comments" if re.search(r"(?i)response|feedback|statement", title) else "Exposure draft"
            items.append({"regulator": "IRDAI", "date": d, "title": title, "url": link.group(1) if link else url, "kind": kind})
    return items


REGULATORS = {"SEBI": cons_sebi, "RBI": cons_rbi, "TRAI": cons_trai, "IRDAI": cons_irdai}
REG_PAGES = {
    "SEBI": "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=4&ssid=38&smid=35",
    "RBI": "https://www.rbi.org.in/Scripts/DraftNotificationsGuildelines.aspx",
    "TRAI": "https://www.trai.gov.in/release-publication/consultation",
    "IRDAI": "https://irdai.gov.in/exposure-drafts",
}


def fetch_consultations(sess, old=None) -> dict:
    """Latest drafts and consultation papers per regulator. One regulator failing keeps its previous items."""
    old_items = {}
    for it in (old or {}).get("items", []):
        old_items.setdefault(it["regulator"], []).append(it)
    items, regs = [], {}
    for name, fn in REGULATORS.items():
        try:
            got = sorted(fn(sess), key=lambda x: x["date"], reverse=True)[:12]
            if not got:
                raise ValueError("no items parsed")
            items += got
            regs[name] = {"state": "ok", "count": len(got), "page": REG_PAGES[name]}
        except Exception as e:
            items += old_items.get(name, [])
            regs[name] = {"state": "stale" if old_items.get(name) else "missing", "error": f"{type(e).__name__}: {e}"[:200], "page": REG_PAGES[name]}
            print(f"  consultations/{name}: FAILED ({e})", file=sys.stderr)
    if not any(r["state"] == "ok" for r in regs.values()):
        raise ValueError("no regulator page could be read")
    return {"items": sorted(items, key=lambda x: x["date"], reverse=True), "regulators": regs, "read_at": now_iso()}


# ---------------------------------------------------------------- milestones

def read_milestones() -> list[dict]:
    if not MILESTONES.exists():
        return []
    with MILESTONES.open(newline="", encoding="utf-8") as f:
        rows = [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]
    return sorted((r for r in rows if r.get("date")), key=lambda r: r["date"], reverse=True)


# ---------------------------------------------------------------- build

FETCHERS = {"wgi": fetch_wgi, "ibbi": fetch_ibbi, "njdg": fetch_njdg,
            "grievances": fetch_grievances, "msme": fetch_msme, "consultations": fetch_consultations}


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
    if out["status"].get("njdg", {}).get("state") == "ok" and (not only or "njdg" in only):
        record_snapshot(out["njdg"])
    if out.get("njdg"):
        out["njdg"]["history"] = snapshot_history()
    out["milestones"] = read_milestones()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
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
