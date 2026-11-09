"""
Indian basket crude oil price from PPAC (Petroleum Planning & Analysis Cell).

PPAC's page "International Prices of Crude Oil (Indian Basket)" fills its table
from a JSON endpoint, one fiscal year at a time: the monthly average FOB price
in US$ per barrel of the basket of sweet (Brent Dated) and sour (Oman and Dubai)
crude imported by Indian refineries. The current month is an average to date.

PPAC's endpoint has no monthly figures for 2022-23 (its 2022-23 slot holds an
early-April 2023 snapshot), so that year is left as a gap.

The parsed months are kept in data/ppac_crude.json, so a failed fetch keeps the
last good copy. Usage: python3 scripts/ppac_crude.py
"""

from __future__ import annotations

import json
import re
import time
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "ppac_crude.json"
PAGE = "https://ppac.gov.in/prices/international-prices-of-crude-oil"
ENDPOINT = "https://ppac.gov.in/AjaxController/getInternationalPricesCrudeOil"
UA = {"User-Agent": "NITI-EF2-dashboard/1.0 (data refresh)"}
FY_MONTHS = ["april", "may", "june", "july", "august", "september", "october", "november",
             "december", "january", "february", "march"]
FIRST_FY = 2020


def fetch() -> dict:
    s = requests.Session()
    s.headers.update(UA)
    page = s.get(PAGE, timeout=40).text
    m = re.search(r'id="page_id"[^>]*value="(\d+)"', page) or re.search(r'value="(\d+)"[^>]*id="page_id"', page)
    page_id = m.group(1) if m else "30"
    today = date.today()
    last_fy = today.year if today.month >= 4 else today.year - 1
    months, notes = {}, []
    for y in range(FIRST_FY, last_fy + 1):
        r = s.post(ENDPOINT, data={"financialYear": f"{y}-{y + 1}", "reportBy": "4", "pageId": page_id}, timeout=40)
        r.raise_for_status()
        rows = list(((r.json() or {}).get("result") or {}).values())
        row = next((x for x in rows if re.fullmatch(r"\d{4}-\d{2}", str(x.get("title", "")).strip())), None)
        # Use a row only if its title is this fiscal year (PPAC's 2022-23 slot is mislabelled).
        if row and row["title"].strip() == f"{y}-{str(y + 1)[2:]}":
            for i, name in enumerate(FY_MONTHS):
                v = row.get(name)
                if isinstance(v, (int, float)) or (isinstance(v, str) and re.fullmatch(r"-?\d+(\.\d+)?", v.strip())):
                    yy, mm = (y, i + 4) if i < 9 else (y + 1, i - 8)
                    months[f"{yy}-{mm:02d}"] = round(float(v), 2)
        if y == last_fy:
            notes = [str(x.get("title", "")).strip(" -") for x in rows if str(x.get("title", "")).startswith("-")]
        time.sleep(0.3)
    if not months:
        raise RuntimeError("PPAC returned no monthly prices")
    return {"fetched_at": today.isoformat(), "unit": "US$ per barrel", "months": months, "notes": notes,
            "source": "PPAC, Crude Oil FOB Price (Indian Basket)", "source_url": PAGE}


def refresh() -> dict:
    try:
        data = fetch()
        CACHE.write_text(json.dumps(data, indent=1, ensure_ascii=False))
        return data
    except Exception as exc:
        print(f"PPAC fetch failed, keeping last copy: {exc}")
        return json.loads(CACHE.read_text()) if CACHE.exists() else {}


if __name__ == "__main__":
    d = refresh()
    ks = sorted(d.get("months", {}))
    print(f"{len(ks)} months, {ks[0] if ks else ''} to {ks[-1] if ks else ''}; latest {d['months'][ks[-1]] if ks else ''}")
