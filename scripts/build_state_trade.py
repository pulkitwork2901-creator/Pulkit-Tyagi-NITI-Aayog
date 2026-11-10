"""
Exports by state of origin, from DGCI&S "State of Origin" downloads.

Input: one folder per calendar year of DGCI&S data bank downloads (commodity
at HS 8-digit by state and country, cumulative January to December, US$ and
INR), each year split into many .xls files because a query returns at most
10,000 rows. The raw files are large (about 1.25 GB for 2021 to 2026) and stay
in Google Drive; only the summaries below are committed.

Output (public/data/trade/):
  states.json            states by year, where India's leading products come
                         from, and the reconciliation with India's total
  state/<slug>.json      one state: totals by year, top products, destinations
                         and product groups, each with a value for every year

The state database picks up newly created 8-digit codes a year late (for
example smartphones in 2022, gold jewellery in 2023, rice in 2025), so those
years fall short of India's total. The script lists the missing codes, marks
growth for affected states and products as not like for like, and names the
states likely to be understated.

Checks: every year's files must be numbered 1..N without gaps, rows must not
repeat across files, and the year must be read from the column headings. The
state totals are compared with India's DGCI&S total already on the board
(public/data/trade/exports.json), and the gap is published, never hidden.

A year whose December column is zero everywhere is a part year: pass its
label (for example "2026 Jan-Aug"), checked against Commerce or RBI figures.

Usage:
  python3 scripts/build_state_trade.py <folder with one subfolder per year> --partial "2026 Jan-Aug"
"""

from __future__ import annotations

import argparse
import collections
import glob
import json
import re
import sys
from pathlib import Path

import xlrd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_trade import pretty  # DGCI&S country abbreviations -> names, as on the country pages  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "trade"
NATIONAL = OUT / "exports.json"

# DGCI&S spells several states differently across years; map to one name each.
CANON = {
    "ANDAMAN & NICOBAR": "Andaman and Nicobar Islands",
    "ANDAMAN AND NICOBAR ISLANDS": "Andaman and Nicobar Islands",
    "CHATTISGARH": "Chhattisgarh",
    "DADRA & NAGAR HAVELI": "Dadra and Nagar Haveli and Daman and Diu",
    "DADRA AND NAGAR HAVELI": "Dadra and Nagar Haveli and Daman and Diu",
    "DAMAN & DIU": "Dadra and Nagar Haveli and Daman and Diu",
    "DAMAN AND DIU": "Dadra and Nagar Haveli and Daman and Diu",
    "DADRA,NH,DAMAN,DIU": "Dadra and Nagar Haveli and Daman and Diu",
    "JAMMU & KASHMIR": "Jammu and Kashmir",
    "PONDICHERRY": "Puducherry",
    "UTTARANCHAL": "Uttarakhand",
    "UNSPECIFIED": "State not specified",
}
UTS = {"Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
       "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"}
SMALL = {"AND", "OF"}


def canon(name: str) -> str:
    n = re.sub(r"\s+", " ", name.strip().upper())
    if n in CANON:
        return CANON[n]
    return " ".join(w.lower() if w in SMALL else w.capitalize() for w in n.split(" "))


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def num(x) -> float:
    s = str(x).strip().replace(",", "")
    return float(s) if s not in ("", "-") else 0.0


def read_year(folder: str):
    files = glob.glob(folder + "/*.xls")
    order = {p: int(re.search(r"_(\d+)\.xls$", p).group(1)) for p in files}
    files.sort(key=order.get)
    idx = [order[p] for p in files]
    if not idx or idx != list(range(1, len(idx) + 1)):
        missing = sorted(set(range(1, max(idx or [0]) + 1)) - set(idx))
        raise SystemExit(f"{folder}: files are not numbered 1..N (missing {missing[:10]})")
    year, rows, december, seen = None, [], 0.0, set()
    for p in files:
        sh = xlrd.open_workbook(p).sheet_by_index(0)
        head = [str(c.value).strip() for c in sh.row(1)]
        try:
            col = {"hs": head.index("Hs Code"), "state": head.index("State"), "desc": head.index("Commodity Description"),
                   "country": head.index("Country"), "unit": head.index("Unit")}
        except ValueError:
            raise SystemExit(f"{p}: unexpected headings {head}")
        cum = next(i for i, h in enumerate(head) if re.search(r"January, \d\d To December, \d\d Value\(US \$\)", h))
        mon = next(i for i, h in enumerate(head) if re.fullmatch(r"December, \d\d Value\(US \$\)", h))
        y = 2000 + int(re.search(r"January, (\d\d)", head[cum]).group(1))
        if year is None:
            year = y
        elif y != year:
            raise SystemExit(f"{p}: year {y} in a folder of {year}")
        for r in range(2, sh.nrows):
            v = sh.row_values(r)
            hs = str(v[col["hs"]]).strip()
            if not hs:
                continue
            key = (hs, str(v[col["state"]]).strip(), str(v[col["country"]]).strip(), str(v[col["unit"]]).strip())
            if key in seen:
                raise SystemExit(f"{p}: row repeated across files: {key}")
            seen.add(key)
            december += num(v[mon])
            rows.append((hs, canon(key[1]), str(v[col["desc"]]).strip(), key[2], num(v[cum])))
    return year, rows, december


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("raw", help="folder holding one subfolder of .xls files per year")
    ap.add_argument("--partial", help='label for a year with no December data, e.g. "2026 Jan-Aug"')
    a = ap.parse_args(argv)

    total = collections.defaultdict(float)            # (period, state)
    prod = collections.defaultdict(float)             # (period, state, hs8)
    dest = collections.defaultdict(float)             # (period, state, country)
    chap = collections.defaultdict(float)             # (period, state, chapter)
    nat_prod = collections.defaultdict(float)         # (period, hs8)
    desc = {}
    periods = []
    for folder in sorted(glob.glob(a.raw.rstrip("/") + "/*")):
        year, rows, december = read_year(folder)
        if december == 0:
            if not a.partial or not a.partial.startswith(str(year)):
                raise SystemExit(f"{year} has no December figures: pass --partial \"{year} Jan-<month>\"")
            period = a.partial
        else:
            period = str(year)
        periods.append(period)
        for hs, st, d, ctry, val in rows:
            if val == 0:
                continue
            total[(period, st)] += val
            prod[(period, st, hs)] += val
            dest[(period, st, ctry)] += val
            chap[(period, st, hs[:2])] += val
            nat_prod[(period, hs)] += val
            if d and d.upper() not in ("OTHERS", "OTHER") and len(d) > len(desc.get(hs, "")):
                desc[hs] = d
        print(f"  {period}: {len(rows):,} rows, US$ {sum(v for (p, _), v in total.items() if p == period) / 1e9:,.2f} bn")
    periods.sort(key=lambda p: (p[:4], len(p)))
    states = sorted({s for (_, s) in total})
    full = [p for p in periods if len(p) == 4]
    latest_full = full[-1]
    partial = [p for p in periods if len(p) > 4]

    nat = json.loads(NATIONAL.read_text()) if NATIONAL.exists() else {}
    nat_total = dict(zip(nat.get("periods", []), nat.get("total", [])))  # US$ million
    nat_chap = {}
    for c in nat.get("chapters", []):  # [{"hs2": "27", "name": ..., "v": [one value per period]}]
        for p, v in zip(nat.get("periods", []), c.get("v", [])):
            nat_chap[(p, c["hs2"])] = v
    chapter_names = {c["hs2"]: c.get("name") for c in nat.get("chapters", [])}
    nat_prod = {pr["hs8"]: dict(zip(nat.get("periods", []), pr["v"])) for pr in nat.get("products", [])}
    # Product names: the national file's cleaned descriptions first, then the state files' own.
    nat_desc = {pr["hs8"]: pr.get("desc", "") for pr in nat.get("products", [])}

    def name(hs):
        d_ = nat_desc.get(hs) or desc.get(hs, "")
        return d_[:1].upper() + d_[1:].lower() if d_.isupper() else d_

    def m(v):  # US$ -> US$ million, 1 decimal
        return round(v / 1e6, 1)

    pi = {p: i for i, p in enumerate(periods)}
    st_prod_period = collections.defaultdict(float)  # (period, hs8) from the state data
    for (p, _, hs), v in prod.items():
        st_prod_period[(p, hs)] += v

    # Codes India created that year that the state data does not carry yet (DGCI&S's
    # state database picks new 8-digit codes up a year late): national value
    # (from the board's top products) with nothing in the state files.
    missing = {}
    for p in periods:
        rows = []
        for hs, by in nat_prod.items():
            n = by.get(p) or 0
            if n >= 50 and st_prod_period.get((p, hs), 0) / 1e6 < 0.01 * n:
                rows.append({"hs8": hs, "description": name(hs) or f"HS {hs}", "india": round(n, 1)})
        missing[p] = sorted(rows, key=lambda r: -r["india"])

    # States likely understated in such a year: those that export the missing
    # codes in the next period the state data carries them.
    understated = collections.defaultdict(dict)  # state -> period -> products
    for p, rows in missing.items():
        if not rows:
            continue
        nxt = periods[pi[p] + 1] if pi[p] + 1 < len(periods) else None
        if not nxt:
            continue
        est = collections.defaultdict(float)
        for r in rows:
            tot_next = st_prod_period.get((nxt, r["hs8"]), 0)
            if not tot_next:
                continue
            for st in states:
                share = prod.get((nxt, st, r["hs8"]), 0) / tot_next
                est[st] += share * r["india"]
        for st, e in est.items():
            if e >= max(50, 0.02 * total.get((p, st), 0) / 1e6):
                hit = sorted((r for r in rows if prod.get((nxt, st, r["hs8"]))), key=lambda r: -prod.get((nxt, st, r["hs8"]), 0))
                groups = []
                for r in hit:  # product groups (HS chapters) of the missing codes this state exports, largest first
                    g = chapter_names.get(r["hs8"][:2]) or f"HS chapter {r['hs8'][:2]}"
                    if g not in groups:
                        groups.append(g)
                understated[st][p] = groups[:3]

    recon = []
    for p in periods:
        s_ = sum(v for (pp, _), v in total.items() if pp == p)
        n = nat_total.get(p)
        recon.append({"period": p, "states_sum": m(s_), "india_total": n,
                      "gap_pct": round((s_ / 1e6 / n - 1) * 100, 2) if n else None,
                      "not_specified": m(total.get((p, "State not specified"), 0)),
                      "missing_new_codes": missing[p][:8],
                      "missing_groups": list(dict.fromkeys(chapter_names.get(r["hs8"][:2], r["hs8"][:2]) for r in missing[p]))[:3],
                      "missing_value": round(sum(r["india"] for r in missing[p]), 1)})

    def arr(fn):
        return [fn(p) for p in periods]

    def breaks_for(st):
        # growth is not like for like in a flagged year and the year after it
        out = set()
        for p in understated.get(st, {}):
            out.add(p)
            if pi[p] + 1 < len(periods):
                out.add(periods[pi[p] + 1])
        return sorted(out, key=pi.get)

    show = [latest_full] + partial
    ranking = []
    for st in states:
        ranking.append({"name": st, "slug": slug(st), "ut": st in UTS, "unspecified": st == "State not specified",
                        "v": arr(lambda p: m(total.get((p, st), 0))), "breaks": breaks_for(st),
                        "understated": understated.get(st, {})})
    ranking.sort(key=lambda r: -r["v"][pi[latest_full]])

    OUT.joinpath("state").mkdir(parents=True, exist_ok=True)
    missing_codes = {p: {r["hs8"] for r in rows} for p, rows in missing.items()}
    for st in states:
        def pick(dic, k):
            keys = set()
            for p in show:
                keys |= {key for v, key in sorted(((v, key[2]) for key, v in dic.items() if key[0] == p and key[1] == st), reverse=True)[:k]}
            return keys
        prods = []
        for hs in pick(prod, 30):
            brk = [p for p in periods if hs in missing_codes.get(p, ())]
            brk += [periods[pi[p] + 1] for p in list(brk) if pi[p] + 1 < len(periods)]
            prods.append({"hs8": hs, "desc": name(hs) or f"HS {hs}", "hs2": hs[:2], "chapter": chapter_names.get(hs[:2], ""),
                          "v": arr(lambda p: m(prod.get((p, st, hs), 0))), "breaks": sorted(set(brk), key=pi.get)})
        ctry = [{"name": pretty(c), "v": arr(lambda p: m(dest.get((p, st, c), 0)))} for c in pick(dest, 20)]
        chs = [{"hs2": ch, "name": chapter_names.get(ch, f"Chapter {ch}"), "v": arr(lambda p: m(chap.get((p, st, ch), 0)))} for ch in pick(chap, 12)]
        detail = {"name": st, "slug": slug(st), "ut": st in UTS, "periods": periods, "partial": partial, "latest_full": latest_full,
                  "v": arr(lambda p: m(total.get((p, st), 0))), "india": arr(lambda p: nat_total.get(p)),
                  "breaks": breaks_for(st), "understated": understated.get(st, {}),
                  "products": sorted(prods, key=lambda r: -r["v"][pi[latest_full]]),
                  "countries": sorted(ctry, key=lambda r: -r["v"][pi[latest_full]]),
                  "chapters": sorted(chs, key=lambda r: -r["v"][pi[latest_full]])}
        OUT.joinpath("state", f"{slug(st)}.json").write_text(json.dumps(detail, ensure_ascii=False, separators=(",", ":")))

    # Where India's leading products come from: the top 100 products of each shown period, top 5 states each.
    leaders = {}
    for p in show:
        items = sorted(((v, hs) for (pp, hs), v in st_prod_period.items() if pp == p), reverse=True)[:100]
        leaders[p] = [{"hs8": hs, "desc": name(hs) or f"HS {hs}", "chapter": chapter_names.get(hs[:2], ""), "value": m(v),
                       "states": [{"name": s2, "slug": slug(s2), "value": m(vv)} for vv, s2 in
                                  sorted(((vv, s2) for (pp, s2, h), vv in prod.items() if pp == p and h == hs), reverse=True)[:5]]}
                      for v, hs in items]

    summary = {
        "source": "DGCI&S, export data by state of origin (HS 8-digit by country)",
        "unit": "US$ million", "periods": periods, "latest_full": latest_full, "partial": partial,
        "total": [r["states_sum"] for r in recon], "india": [r["india_total"] for r in recon],
        "states": ranking, "reconciliation": recon, "leading_products": leaders,
    }
    OUT.joinpath("states.json").write_text(json.dumps(summary, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote states.json and {len(states)} state files ({', '.join(periods)})")
    for r in recon:
        print(f"  {r['period']}: states US$ {r['states_sum']:,} m vs India US$ {r['india_total']:,} m ({r['gap_pct']}%); "
              f"new codes missing: US$ {r['missing_value']:,} m in {len(missing[r['period']])} lines")
    for st, d_ in understated.items():
        print(f"  likely understated: {st}: " + "; ".join(f"{p} ({', '.join(v)})" for p, v in d_.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
