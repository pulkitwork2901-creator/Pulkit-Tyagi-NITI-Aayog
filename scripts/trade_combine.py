"""Combine all DGCI&S slices into one long CSV.

Columns: period, country, hs8, description, unit, quantity, value_usd
- dataquery files: calendar-year cumulative columns ("January, YY To December, YY")
- yearlytimeseries files: the current year to date. These files do not say
  which month they run to, so pass it: check the total against RBI's or
  Commerce's monthly figures (the 2026 download of 7 Nov 2026 matched
  January-August to within 0.05%).

Works for both export (country of destination) and import (country of consignment)
downloads; keep each flow in its own folder.

Usage: python3 scripts/trade_combine.py <raw dir> <out csv.gz> "2026 Jan-Aug"
"""
import csv
import gzip
import pathlib
import re
import sys

import xlrd

raw, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
ytd_label = sys.argv[3] if len(sys.argv) > 3 else None


def num(x, path, row_number, column):
    try:
        text = str(x).strip()
        if text in ("", "-"):
            return 0.0
        return float(text.replace(",", ""))
    except ValueError:
        raise ValueError(f"{path.name}: row {row_number}, {column} is not numeric: {x!r}") from None


n = 0
files = sorted(raw.glob("*.xls"))
if not files:
    sys.exit(f"No .xls files found in {raw}")
seen = set()
with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["period", "country", "hs8", "description", "unit", "quantity", "value_usd"])
    for p in files:
        if p.stat().st_size == 0:
            sys.exit(f"Empty DGCI&S download: {p}")
        sh = xlrd.open_workbook(p).sheet_by_index(0)
        cells = [[str(c.value).strip() for c in sh.row(r)] for r in range(sh.nrows)]
        try:
            hi = next(i for i, r in enumerate(cells) if any(
                x.upper() in ("HS CODE", "COUNTRY OF DESTINATION", "COUNTRY OF CONSIGNMENT") for x in r
            ))
        except StopIteration:
            sys.exit(f"{p.name}: could not find a DGCI&S header row")
        hdr = cells[hi]
        if "yearlytimeseries" in p.name:
            if not ytd_label:
                sys.exit("Year-to-date files found: pass their period label, e.g. \"2026 Jan-Aug\" or \"2026-27 Apr-Aug\"")
            # Yearly time series: country, HS code, description, then three columns per
            # year ("2023-24 Unit", "2023-24 Qty", "2023-24 Value($)"). A file can hold
            # several years. The year matching ytd_label is the part year; the others are
            # full years. Older one-year downloads have no year in the heading.
            years = []
            for j, h in enumerate(hdr):
                m = re.match(r"(\d{4}(?:-\d{2})?)\s+Value", h)
                if m:
                    years.append((m.group(1), j))
            if not years:
                years = [(None, 5)]
            label = lambda y: ytd_label if y is None or ytd_label.split(" ")[0] == y else y
            for row_number, r in enumerate(cells[hi + 1:], hi + 2):
                if not any(r):
                    continue
                if len(r) < max(vc for _, vc in years) + 1:
                    sys.exit(f"{p.name}: row {row_number} has {len(r)} columns; expected {max(vc for _, vc in years) + 1}")
                hs8 = r[1].split(".")[0].zfill(8)
                for y, vc in years:
                    value = num(r[vc], p, row_number, "value")
                    if not value and len(years) > 1:
                        continue  # a multi-year file lists every country-product pair in every year
                    period = label(y)
                    key = (period, r[0], hs8)
                    if key in seen:
                        sys.exit(f"Duplicate DGCI&S slice row: {p.name}, {key}")
                    seen.add(key)
                    w.writerow([period, r[0], hs8, r[2], r[vc - 2], num(r[vc - 1], p, row_number, "quantity"), value])
                    n += 1
        else:
            # Calendar-year files run "January, YY To December, YY"; financial-year
            # files run "April, YY To March, YY+1" and are labelled "20YY-YY+1".
            fy = re.search(r"April, (\d\d) To March, (\d\d)", " ".join(hdr))
            match = re.search(r"December, (\d\d)", " ".join(hdr))
            if fy:
                period = f"20{fy.group(1)}-{fy.group(2)}"
            elif match:
                period = f"20{match.group(1)}"
            else:
                sys.exit(f"{p.name}: could not determine the calendar or financial year from the header")
            for row_number, r in enumerate(cells[hi + 1:], hi + 2):
                if not any(r):
                    continue
                if len(r) < 8:
                    sys.exit(f"{p.name}: row {row_number} has {len(r)} columns; expected at least 8")
                hs8 = r[0].split(".")[0].zfill(8)
                key = (period, r[2], hs8)
                if key in seen:
                    sys.exit(f"Duplicate DGCI&S slice row: {p.name}, {key}")
                seen.add(key)
                w.writerow([period, r[2], hs8, r[1], r[3], num(r[6], p, row_number, "quantity"),
                            num(r[7], p, row_number, "value")])
                n += 1
if not n:
    sys.exit(f"No data rows found in {raw}")
print("rows written", n)
