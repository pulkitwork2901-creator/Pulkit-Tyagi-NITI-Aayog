"""Combine all DGCI&S slices into one long CSV.

Columns: period, country, hs8, description, unit, quantity, value_usd
- dataquery files: calendar-year cumulative columns ("January, YY To December, YY")
- yearlytimeseries files: the current year to date. These files do not say
  which month they run to, so pass it: check the total against RBI's or
  Commerce's monthly figures (the 2026 download of 7 Nov 2026 matched
  January-August to within 0.05%).

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


def num(x):
    try:
        return float(str(x).replace(",", "")) if str(x).strip() not in ("", "-") else 0.0
    except ValueError:
        return 0.0


n = 0
with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["period", "country", "hs8", "description", "unit", "quantity", "value_usd"])
    for p in sorted(raw.glob("*.xls")):
        sh = xlrd.open_workbook(p).sheet_by_index(0)
        cells = [[str(c.value).strip() for c in sh.row(r)] for r in range(sh.nrows)]
        hi = next(i for i, r in enumerate(cells) if any(x.upper() in ("HS CODE", "COUNTRY OF DESTINATION") for x in r))
        hdr = cells[hi]
        if "yearlytimeseries" in p.name:
            if not ytd_label:
                sys.exit("Year-to-date files found: pass their period label, e.g. \"2026 Jan-Aug\"")
            period = ytd_label
            for r in cells[hi + 1:]:
                if not any(r):
                    continue
                w.writerow([period, r[0], r[1].split(".")[0].zfill(8), r[2], r[3], num(r[4]), num(r[5])])
                n += 1
        else:
            yy = re.search(r"December, (\d\d)", hdr[4]).group(1)
            period = f"20{yy}"
            for r in cells[hi + 1:]:
                if not any(r):
                    continue
                w.writerow([period, r[2], r[0].split(".")[0].zfill(8), r[1], r[3], num(r[6]), num(r[7])])
                n += 1
print("rows written", n)
