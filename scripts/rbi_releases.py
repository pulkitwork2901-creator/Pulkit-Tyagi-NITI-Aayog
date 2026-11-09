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
  * "Developments in India's Balance of Payments for the Month of ..."
    (monthly, from April 2026): the same items for one month.

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
    bop = _listing(s, f"{BASE}/BS_PressReleaseDisplay.aspx", months)
    bop = {p: t for p, t in bop.items() if re.search(r"Developments in India.s Balance of Payments", t, re.I)}

    todo = [(p, "services", t) for p, t in services.items()] + \
           [(p, "bop_month" if "for the month" in t.lower() else "bop_quarter", t) for p, t in bop.items()]
    for p, kind, title in sorted(todo):
        if p in rel:
            continue
        try:
            page = s.get(f"{BASE}/BS_PressReleaseDisplay.aspx?prid={p}", timeout=40).text
        except requests.RequestException as e:
            print(f"  {p}: {e}")
            continue
        parser = {"services": parse_services, "bop_quarter": parse_bop_quarter, "bop_month": parse_bop_month}[kind]
        data = parser(page)
        d = re.search(r"Date\s*:\s*([A-Za-z]{3} \d{1,2}, \d{4})", _clean(page))
        rel[p] = {"kind": kind, "title": title, "date": d.group(1) if d else None, "data": data}
        print(f"  {p} {kind}: {len(data)} periods  {title[:70]}")
        time.sleep(0.4)
    cache["fetched_at"] = today.isoformat()
    CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
    return cache


def merged(cache: dict | None = None) -> dict[str, dict]:
    """kind -> period -> values, later releases overriding earlier ones."""
    cache = cache or (json.loads(CACHE.read_text()) if CACHE.exists() else {"releases": {}})
    out = {"services": {}, "bop_quarter": {}, "bop_month": {}}
    for p in sorted(cache["releases"], key=int):
        r = cache["releases"][p]
        for period, vals in r["data"].items():
            out[r["kind"]].setdefault(period, {}).update(vals)
    return out


if __name__ == "__main__":
    c = refresh(full="--full" in sys.argv)
    m = merged(c)
    print({k: f"{len(v)} periods, {min(v) if v else ''} to {max(v) if v else ''}" for k, v in m.items()})
