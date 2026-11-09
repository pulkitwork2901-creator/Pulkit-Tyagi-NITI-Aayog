"""
Services trade, remittances and the balance of payments from RBI press releases.

RBI publishes these as ordinary web pages on www.rbi.org.in (its document
server, rbidocs, answers scripts with a browser check, so it is not used):

  * "Monthly Data on India's International Trade in Services" (monthly):
    services receipts (exports) and payments (imports), US$ million, for the
    months of the current fiscal year. Later releases revise earlier months.
  * "Developments in India's Balance of Payments during the ... Quarter"
    (quarterly): Table 1 with goods, services, primary and secondary income,
    NRI deposits and the current account, for the quarter and a year earlier.
    The text gives personal transfer receipts (remittances).
  * "Sectoral Deployment of Bank Credit" (monthly): y-o-y credit growth to
    agriculture, industry, services and personal loans, from the highlights.
  * "Developments in India's Balance of Payments for the Month of ..."
    (monthly, from April 2026): the same items for one month.
  * "RBI releases the results of Forward Looking Surveys" (with each
    monetary policy statement, six a year): the links lead to the
    Inflation Expectations Survey of Households (Table 3: median and mean
    current perception, three months and one year ahead; seven rounds a
    page) and, every other quarter-end, the Order Books, Inventories and
    Capacity Utilisation Survey (Table 1: capacity utilisation, seasonally
    adjusted from Q4 2022-23). History goes back to late 2018.

Each release is parsed once and kept in data/rbi_releases.json, so a daily
run fetches only releases it has not seen. Values from a later release
replace those from an earlier one (RBI revises).

Usage: python3 scripts/rbi_releases.py [--full]   (--full rescans every year)
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "rbi_releases.json"
BASE = "https://www.rbi.org.in/Scripts"
UA = {"User-Agent": "NITI-EF2-dashboard/1.0 (data refresh)"}
FIRST_YEAR = 2020
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]


def _clean(x: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x))).strip()


def _rows(page: str) -> list[list[str]]:
    out = []
    for tb in re.findall(r"<table.*?</table>", page, re.S):
        for tr in re.findall(r"<tr.*?</tr>", tb, re.S):
            cells = [_clean(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
            if any(cells):
                out.append(cells)
    return out


def _num(x: str) -> float | None:
    m = re.match(r"\s*(-?[\d,]*\.?\d+)", x or "")
    return float(m.group(1).replace(",", "")) if m else None


def _form(page: str) -> dict:
    return dict(re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', page))


def _listing(s: requests.Session, url: str, periods: list[tuple[int, int]]) -> dict[str, str]:
    """prid -> title for each (year, month) page of an RBI listing (month 0 = whole year)."""
    first = s.get(url, timeout=40).text
    form = _form(first)
    found = {}
    for y, m in periods:
        f = dict(form, hdnYear=str(y), hdnMonth=str(m), __EVENTTARGET="", __EVENTARGUMENT="")
        try:
            page = s.post(url, data=f, timeout=40).text
        except requests.RequestException as e:
            print(f"  listing {y}-{m}: {e}")
            continue
        for p, t in re.findall(r"prid=(\d{5})[^>]*>(.*?)</a>", page, re.S):
            found[p] = _clean(t)
        time.sleep(0.4)
    return found


def _month_key(text: str) -> str | None:
    m = re.search(r"(january|february|march|april|may|june|july|august|september|october|november|december)\w*\W*(\d{4})", text, re.I)
    if not m:
        return None
    return f"{m.group(2)}-{MONTHS.index(m.group(1).lower()) + 1:02d}"


def parse_services(page: str) -> dict[str, dict]:
    """month -> {exports, imports} in US$ million."""
    out = {}
    for r in _rows(page):
        if len(r) >= 3:
            k = _month_key(r[0])
            x, m = _num(r[1]), _num(r[2])
            if k and x is not None and m is not None:
                out[k] = {"exports": x, "imports": m}
    return out


QUARTERS = {("april", "june"): 6, ("july", "september"): 9, ("october", "december"): 12, ("january", "march"): 3}


def _quarter_end(label: str) -> str | None:
    """'July – September 2025' -> '2025-09'; half-years such as April-September -> None."""
    m = re.search(r"(april|july|october|january)\s*[-\u2013\u2014]\s*(june|september|december|march)\D*(\d{4})", label, re.I)
    if not m:
        return None
    mm = QUARTERS.get((m.group(1).lower(), m.group(2).lower()))
    return f"{m.group(3)}-{mm:02d}" if mm else None


ITEMS = {  # row label pattern -> key
    r"^A\.\s*Current Account": "current_account",
    r"^1\.\s*Goods": "goods",
    r"^2\.\s*Services": "services",
    r"^3\.\s*Primary Income": "primary_income",
    r"^4\.\s*Secondary Income": "secondary_income",
    r"^NRI Deposits": "nri_deposits",
    r"^1\.\s*Direct Investment": "fdi",
    r"^2\.\s*Portfolio Investment": "fpi",
    r"^ECBs to India": "ecb",
}


def parse_bop_quarter(page: str) -> dict[str, dict]:
    """quarter-end month -> item -> {credit, debit, net} (US$ bn), plus remittances."""
    rows = _rows(page)
    head = next((r for r in rows if sum(bool(_quarter_end(c)) for c in r) >= 2), None)
    if not head:
        return {}
    qs = [_quarter_end(c) for c in head if _quarter_end(c)]
    out = {q: {} for q in qs}
    for r in rows:
        key = next((k for pat, k in ITEMS.items() if re.search(pat, r[0], re.I)), None)
        vals = [_num(c) for c in r[1:]]
        if not key or len(vals) < 6 or any(v is None for v in vals[:6]):
            continue
        for i, q in enumerate(qs[:2]):
            c, d, n = vals[3 * i: 3 * i + 3]
            out[q].setdefault(key, {"credit": c, "debit": d, "net": n})
    # Current account as % of GDP, and revisions of earlier quarters, from the text.
    def qkey(q, fy):
        y0 = int(fy[:4])
        return {1: f"{y0}-06", 2: f"{y0}-09", 3: f"{y0}-12", 4: f"{y0 + 1}-03"}[int(q)]
    text0 = _clean(page)
    for m in re.finditer(r"US\$\s*([\d.]+)\s*billion\s*\(([\d.]+)\s*per\s*cent of GDP\)\s*in\s*Q(\d)\s*:\s*(\d{4})-\d{2}", text0, re.I):
        before = text0[max(0, m.start() - 250):m.start()].lower()
        sign = -1 if before.rfind("deficit") > before.rfind("surplus") else 1
        out.setdefault(qkey(m.group(3), m.group(4)), {})["ca_pct_gdp"] = sign * float(m.group(2))
    for m in re.finditer(r"current account (deficit|surplus) for Q(\d)\s*:\s*(\d{4})-\d{2} has been revised.{0,160}?to US\$\s*([\d.]+)\s*billion\s*\(([\d.]+)\s*per\s*cent of GDP\)", text0, re.I):
        sign = -1 if m.group(1).lower() == "deficit" else 1
        k = qkey(m.group(2), m.group(3))
        out.setdefault(k, {}).update({"ca_revised": sign * float(m.group(4)), "ca_pct_gdp": sign * float(m.group(5))})

    # Remittances: personal (earlier "private") transfer receipts, stated in the text.
    text = _clean(page)
    m = re.search(r"(?:personal|private) transfer receipts[^.]*?US\$\s*([\d.]+)\s*billion(?:[^.]*?from US\$\s*([\d.]+)\s*billion)?", text, re.I)
    if m and qs:
        out[max(qs)]["remittances"] = float(m.group(1))
        if m.group(2) and len(qs) >= 2:
            out[min(qs)]["remittances"] = float(m.group(2))
    return out


MITEMS = {
    r"^A\.\s*Current Account": "current_account",
    r"^A\.1\s*Merchandise": "goods",
    r"^A\.2\s*Services": "services",
    r"^A\.3\s*Transfers": "transfers",
    r"^A\.4\s*Income": "income",
    r"^B\.1\s*Foreign Direct": "fdi",
    r"^B\.2\s*Foreign Portfolio": "fpi",
    r"^of which: NRI Deposits": "nri_deposits",
}


def parse_bop_month(page: str) -> dict[str, dict]:
    """month -> item -> net (US$ bn) for the release month and a year earlier."""
    rows = _rows(page)
    head = next((r for r in rows if r and r[0].lower() == "item"), None)
    if not head:
        return {}
    months = [_month_key(c) for c in head[1:3]]
    out = {m: {} for m in months if m}
    for r in rows:
        key = next((k for pat, k in MITEMS.items() if re.search(pat, r[0], re.I)), None)
        if not key or len(r) < 3:
            continue
        for i, m in enumerate(months):
            v = _num(r[1 + i])
            if m and v is not None:
                out[m].setdefault(key, v)
    return out


SECTORS = {
    "credit_agri": r"Credit (?:growth )?to agriculture",
    "credit_industry": r"Credit (?:growth )?to industry",
    "credit_services": r"Credit (?:growth )?to services sector",
    "credit_personal": r"Credit (?:growth )?to personal loans",
}


def parse_sectoral(page: str, title: str) -> dict[str, dict]:
    """Sectoral Deployment of Bank Credit: y-o-y growth by sector and the
    restated rate a year earlier, from the release's highlights text.
    The wording varies ("recorded a growth of", "moderated to", "expanded by");
    each sector sentence states this year's rate first, then last year's
    (or says it was the same)."""
    month = _month_key(title)
    if not month:
        return {}
    text = _clean(page)
    vals = {}
    for key, lead in SECTORS.items():
        m = re.search(lead, text, re.I)
        if not m:
            continue
        seg = text[m.end():m.end() + 330]
        nums = re.findall(r"(-?\d+(?:\.\d+)?)\s*per\s*cent", seg)
        if not nums:
            continue
        vals[key] = float(nums[0])
        cut = seg.find(nums[0]) + len(nums[0])
        rest = seg[cut:]
        if re.match(r".{0,120}?same as in the corresponding", rest, re.I):
            vals[key + "_year_ago"] = vals[key]
        elif len(nums) > 1:
            vals[key + "_year_ago"] = float(nums[1])
    return {month: vals} if vals else {}


MON3 = [m[:3] for m in MONTHS]


def parse_iesh(page: str) -> dict[str, dict]:
    """Inflation Expectations Survey of Households, Table 3: for each survey
    round, mean and median current inflation perception and expectations three
    months and one year ahead (per cent). Each row reads 'Sep-26' and then six
    estimate / standard error pairs."""
    t = _clean(page)
    # "Table 3:" (or "Table 3(a):" in rounds that also had an extension survey)
    h = re.search(r"Table 3\s*(?:\(a\))?\s*:\s*Household", t)
    if not h:
        return {}
    a = h.start()
    b = re.compile(r"Table (?:3\s*\(b\)|4)\s*:").search(t, a + 10)
    seg = t[a:b.start() if b else a + 4000]
    out = {}
    for m in re.finditer(r"\b([A-Z][a-z]{2})-(\d{2})((?:\s+-?\d+(?:\.\d+)?){12})", seg):
        mon = m.group(1).lower()
        if mon not in MON3:
            continue
        v = [float(x) for x in m.group(3).split()]
        k = f"20{m.group(2)}-{MON3.index(mon) + 1:02d}"
        out[k] = {"perception_mean": v[0], "perception": v[2], "exp_3m_mean": v[4], "exp_3m": v[6],
                  "exp_1y_mean": v[8], "exp_1y": v[10]}
    return out


def _fy_quarter(label: str) -> str | None:
    """'Q1:2026-27' -> '2026-06' (end month of the quarter)."""
    m = re.match(r"\s*Q([1-4])\s*:\s*(\d{4})-\d{2}", label)
    if not m:
        return None
    y0, q = int(m.group(2)), int(m.group(1))
    return {1: f"{y0}-06", 2: f"{y0}-09", 3: f"{y0}-12", 4: f"{y0 + 1}-03"}[q]


def parse_obicus(page: str) -> dict[str, dict]:
    """Order Books, Inventories and Capacity Utilisation Survey, Table 1:
    capacity utilisation in manufacturing (per cent) by quarter, and the
    seasonally adjusted figure where RBI publishes it. Columns are found by
    their headers, since the table's layout has changed over the years."""
    rows = _rows(page)
    out = {}
    for i, r in enumerate(rows):
        heads = [c.lower() for c in r]
        cu = next((j for j, c in enumerate(heads) if c.startswith("capacity utilisation")), None)
        if cu is None or not heads or not heads[0].startswith("quarter"):
            continue
        sa = next((j for j, c in enumerate(heads) if c.startswith("seasonally adjusted")), None)
        for r2 in rows[i + 1:]:
            k = _fy_quarter(r2[0]) if r2 else None
            if not k:
                break
            v = {"cu": _num(r2[cu]) if cu < len(r2) else None}
            if sa is not None and sa < len(r2):
                v["cu_sa"] = _num(r2[sa])
            out[k] = {x: y for x, y in v.items() if y is not None}
        break
    return out


SURVEYS = {"iesh": (r"Inflation Expectations", parse_iesh),
           "obicus": (r"Capacity Utili[sz]ation|OBICUS", parse_obicus)}


def parse_surveys(s: requests.Session, page: str) -> dict:
    """'RBI releases the results of Forward Looking Surveys': follow the links
    to the household inflation expectations and capacity utilisation results.
    Links are matched by their text; if that fails, by the linked page's title."""
    links = [(i, _clean(t)) for i, t in re.findall(r'<a[^>]*PublicationsView\.aspx\?id=(\d+)[^>]*>(.*?)</a>', page, re.S | re.I)]
    data, pubs = {}, {}
    for key, (pat, parser) in SURVEYS.items():
        pid = next((i for i, t in links if re.search(pat, t, re.I)), None)
        pg = None
        if pid is None:  # older releases: look inside each linked page
            for i, _ in links:
                if i in pubs.values():
                    continue
                try:
                    cand = s.get(f"{BASE}/PublicationsView.aspx?id={i}", timeout=40).text
                except requests.RequestException:
                    continue
                head = re.search(r"Date\s*:\s*\w{3} \d{1,2}, \d{4}(.{0,200})", _clean(cand))
                if head and re.search(pat, head.group(1), re.I):
                    pid, pg = i, cand
                    break
                time.sleep(0.3)
        if pid is None:
            continue
        if pg is None:
            try:
                pg = s.get(f"{BASE}/PublicationsView.aspx?id={pid}", timeout=40).text
            except requests.RequestException as e:
                print(f"  survey {key} {pid}: {e}")
                continue
            time.sleep(0.3)
        pubs[key] = pid
        data[key] = parser(pg)
    return {"data": data, "pubs": pubs}


def refresh(full: bool = False) -> dict:
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {"releases": {}}
    rel = cache["releases"]
    s = requests.Session()
    s.headers.update(UA)
    today = date.today()
    years = range(FIRST_YEAR, today.year + 1) if full or not rel else range(today.year - 1, today.year + 1)

    services = _listing(s, f"{BASE}/Pr_DataRelease.aspx?SectionID=352", [(y, 0) for y in years])
    services = {p: t for p, t in services.items() if "trade in services" in t.lower()}
    months = [(y, m) for y in years for m in range(1, 13) if date(y, m, 1) <= today]
    if not full and rel:
        months = months[-4:]
    if not any(r["kind"] == "surveys" for r in rel.values()):  # first run of the survey reader: go back to 2020
        months = [(y, m) for y in range(FIRST_YEAR, today.year + 1) for m in range(1, 13) if date(y, m, 1) <= today]
    press = _listing(s, f"{BASE}/BS_PressReleaseDisplay.aspx", months)
    bop = {p: t for p, t in press.items() if re.search(r"Developments in India.s Balance of Payments", t, re.I)}
    surveys = {p: t for p, t in press.items() if re.search(r"results of forward looking surveys", t, re.I)}

    sec_years = range(2025, today.year + 1) if full or not any(r["kind"] == "sectoral" for r in rel.values()) else range(today.year - 1, today.year + 1)
    sectoral = _listing(s, f"{BASE}/Pr_DataRelease.aspx?SectionID=348", [(y, 0) for y in sec_years])
    sectoral = {p: t for p, t in sectoral.items() if "sectoral deployment of bank credit" in t.lower()}
    todo = [(p, "sectoral", t) for p, t in sectoral.items()] + \
           [(p, "services", t) for p, t in services.items()] + \
           [(p, "bop_month" if "for the month" in t.lower() else "bop_quarter", t) for p, t in bop.items()] + \
           [(p, "surveys", t) for p, t in surveys.items()]
    for p, kind, title in sorted(todo):
        if p in rel:
            continue
        try:
            page = s.get(f"{BASE}/BS_PressReleaseDisplay.aspx?prid={p}", timeout=40).text
        except requests.RequestException as e:
            print(f"  {p}: {e}")
            continue
        d = re.search(r"Date\s*:\s*([A-Za-z]{3} \d{1,2}, \d{4})", _clean(page))
        if kind == "surveys":
            got = parse_surveys(s, page)
            if not got["data"]:  # links not readable this time: try again on the next run
                print(f"  {p} surveys: no survey tables found")
                continue
            rel[p] = {"kind": kind, "title": title, "date": d.group(1) if d else None, **got}
            print(f"  {p} surveys: " + ", ".join(f"{k} {len(v)} periods" for k, v in got["data"].items()))
            time.sleep(0.4)
            continue
        parser = {"services": parse_services, "bop_quarter": parse_bop_quarter, "bop_month": parse_bop_month,
                  "sectoral": lambda pg: parse_sectoral(pg, title)}[kind]
        data = parser(page)
        rel[p] = {"kind": kind, "title": title, "date": d.group(1) if d else None, "data": data}
        print(f"  {p} {kind}: {len(data)} periods  {title[:70]}")
        time.sleep(0.4)
    cache["fetched_at"] = today.isoformat()
    CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
    return cache


def merged(cache: dict | None = None) -> dict[str, dict]:
    """kind -> period -> values, later releases overriding earlier ones."""
    cache = cache or (json.loads(CACHE.read_text()) if CACHE.exists() else {"releases": {}})
    out = {"services": {}, "bop_quarter": {}, "bop_month": {}, "sectoral": {}, "iesh": {}, "obicus": {}}
    for p in sorted(cache["releases"], key=int):
        r = cache["releases"][p]
        if r["kind"] == "surveys":  # one bundle, several surveys
            for key, periods in r["data"].items():
                for period, vals in periods.items():
                    out[key].setdefault(period, {}).update(vals)
            continue
        for period, vals in r["data"].items():
            out[r["kind"]].setdefault(period, {}).update(vals)
    return out


if __name__ == "__main__":
    c = refresh(full="--full" in sys.argv)
    m = merged(c)
    print({k: f"{len(v)} periods, {min(v) if v else ''} to {max(v) if v else ''}" for k, v in m.items()})
