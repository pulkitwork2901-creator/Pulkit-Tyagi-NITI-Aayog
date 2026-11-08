"""
Build public/data/reform/evidence.json for the Reform Evidence Board.

Three live sources, each read straight from the publisher, plus one small
hand-kept sheet:

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


def fetch_wgi(sess) -> dict:
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


def fetch_ibbi(sess) -> dict:
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


def fetch_njdg(sess) -> dict:
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


# ---------------------------------------------------------------- milestones

def read_milestones() -> list[dict]:
    if not MILESTONES.exists():
        return []
    with MILESTONES.open(newline="", encoding="utf-8") as f:
        rows = [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]
    return sorted((r for r in rows if r.get("date")), key=lambda r: r["date"], reverse=True)


# ---------------------------------------------------------------- build

FETCHERS = {"wgi": fetch_wgi, "ibbi": fetch_ibbi, "njdg": fetch_njdg}


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
            out[key] = fn(sess)
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
