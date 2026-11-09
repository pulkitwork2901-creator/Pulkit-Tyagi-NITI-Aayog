"""
Monthly GST collections from GSTN's revenue reports.

Since November 2025 the monthly figures appear only in a PDF that GSTN posts on
the GST portal (tutorial.gst.gov.in), with a new file name each month. The
portal's news feed (www.gst.gov.in/fomessage/newsupdates) lists the recent
"Gross and Net GST revenue collections for the month of ..." notices with their
PDF links, so this script reads the feed, downloads any report it has not seen,
and takes the headline rows from the PDF's first table:

    Gross Domestic Revenue, Gross Import Revenue, Total Gross GST Revenue
    (each for the month and the same month a year earlier, ₹ crore)

Parsed months are kept in data/gst_reports.json; a failed run keeps them.
Usage: python3 scripts/gst_reports.py
"""

from __future__ import annotations

import io
import json
import re
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "gst_reports.json"
FEED = "https://www.gst.gov.in/fomessage/newsupdates"
UA = {"User-Agent": "NITI-EF2-dashboard/1.0 (data refresh)"}
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]
ROWS = {"domestic": r"Gross Domestic Revenue", "imports": r"Gross Import Revenue", "gross": r"Total Gross GST Revenue"}


def _crore(x: str) -> float:
    return float(x.replace(",", ""))


def parse_pdf(data: bytes) -> dict:
    import logging
    logging.getLogger("pypdf").setLevel(logging.ERROR)  # GSTN's PDFs carry harmless xref warnings
    from pypdf import PdfReader
    text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages[:1])
    text = re.sub(r"[ \t]+", " ", text)
    out = {}
    for key, label in ROWS.items():
        m = re.search(label + r"\s*([\d,]+)\s+([\d,]+)", text)
        if m:
            out[key + "_year_ago"], out[key] = _crore(m.group(1)), _crore(m.group(2))
    return out


def refresh() -> dict:
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {"months": {}}
    try:
        s = requests.Session()
        s.headers.update(UA)
        feed = s.get(FEED, timeout=40).json().get("data") or []
        for it in feed:
            m = re.search(r"GST revenue collections for the month of (\w+),?\s*(\d{4})", it.get("title", ""), re.I)
            if not m or m.group(1).lower() not in MONTHS:
                continue
            key = f"{m.group(2)}-{MONTHS.index(m.group(1).lower()) + 1:02d}"
            links = re.findall(r"https?://[^\"'\s<>]+\.pdf", json.dumps(it).replace("\\/", "/"))
            if key in cache["months"] or not links:
                continue
            pdf = s.get(links[0], timeout=60)
            pdf.raise_for_status()
            vals = parse_pdf(pdf.content)
            if "gross" not in vals:
                print(f"  {key}: could not read the totals from {links[0]}")
                continue
            cache["months"][key] = {**vals, "source_url": links[0], "posted": it.get("date")}
            print(f"  {key}: gross ₹{vals['gross']:,.0f} crore")
        cache["fetched_at"] = date.today().isoformat()
        CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
    except Exception as exc:
        print(f"GST reports: kept last copy ({exc})")
    return cache


if __name__ == "__main__":
    c = refresh()
    print(f"{len(c['months'])} months: {sorted(c['months'])}")
