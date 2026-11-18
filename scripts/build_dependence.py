"""
Import dependence: where India relies on one supplier country.

Writes public/data/trade/dependence.json for the Import dependence page
(#/dependence). For each imported product (HS 8-digit) and each period it
works out the main supplier's share, the concentration of supply (Herfindahl
index) and the number of supplier countries, and summarises how much of the
import bill comes from products where one country supplies more than half.

Two ways to run it:

1. From the board's published product files (the 300 largest imports, about
   three quarters of the import bill), which is what the daily site has:
       python3 scripts/build_dependence.py
2. Automatically for every product, from build_trade.py whenever the full
   DGCI&S import files are processed (scripts/trade_pipeline.py or
   build_trade.py imports.csv.gz imports). A file built from every product is
   never overwritten by the smaller version unless --force is given.

Country is the country of consignment, as DGCI&S records it, which is not
always where the goods were made (goods shipped through Singapore, Hong Kong
or the UAE count against those places). Values are US$ million.
"""

from __future__ import annotations

import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRADE = ROOT / "public" / "data" / "trade"
OUT = TRADE / "dependence.json"
THRESHOLD = 50.0     # % from one country that counts as dependence
MIX = 5              # suppliers kept per product (plus "all others")

# Imported inputs and the exports they feed, by HS 8-digit prefixes. Old and new
# codes are both listed because India recoded these lines in 2022.
CHAINS = [
    {
        "id": "phones", "name": "Mobile phones", "name_hi": "मोबाइल फ़ोन",
        "imports": ["85177090", "85177990", "85177010", "85177910"], "imports_label": "Phone and network equipment parts, and loaded circuit boards",
        "imports_label_hi": "फ़ोन और नेटवर्क उपकरणों के पुर्ज़े, और लोडेड सर्किट बोर्ड",
        "exports": ["85171300", "85171211"], "exports_label": "Smartphones", "exports_label_hi": "स्मार्टफ़ोन",
    },
    {
        "id": "solar", "name": "Solar power", "name_hi": "सौर ऊर्जा",
        "imports": ["85414011", "85414012", "85414200", "85414300"], "imports_label": "Solar cells and modules",
        "imports_label_hi": "सौर सेल और मॉड्यूल",
        "exports": ["85414300", "85414012"], "exports_label": "Solar modules", "exports_label_hi": "सौर मॉड्यूल",
    },
    {
        "id": "medicines", "name": "Medicines", "name_hi": "दवाइयाँ",
        "imports": ["2941", "2933", "2942"], "imports_label": "Antibiotics and other drug ingredients (HS 2933, 2941, 2942)",
        "imports_label_hi": "एंटीबायोटिक और दवाओं के अन्य कच्चे रसायन (HS 2933, 2941, 2942)",
        "exports": ["3004"], "exports_label": "Medicines in doses (HS 3004)", "exports_label_hi": "खुराक के रूप में दवाइयाँ (HS 3004)",
    },
]


def r(x, d=3):
    return None if x is None else round(x, d)


def product_stats(p: dict, periods: list, missing: list) -> dict:
    """Top supplier, its share, Herfindahl index and supplier count for each period."""
    named = [c for c in p["countries"] if c.get("id")]
    other = next((c for c in p["countries"] if not c.get("id")), None)
    n_other = 0
    if other:
        try:
            n_other = int(other["name"].split("(")[1].rstrip(")"))
        except (IndexError, ValueError):
            n_other = 0
    top, share, hhi, n = [], [], [], []
    for i, per in enumerate(periods):
        tot = p["v"][i]
        if per in missing or not tot:
            top.append(None); share.append(None); hhi.append(None); n.append(None)
            continue
        vals = [(c["name"], c["v"][i] or 0) for c in named]
        best = max(vals, key=lambda t: t[1]) if vals else (None, 0)
        top.append(best[0] if best[1] > 0 else None)
        share.append(r(best[1] / tot * 100, 1))
        # Herfindahl index on a 0 to 10,000 scale; "all others" is a spread of small
        # suppliers, so it adds little and is left out.
        hhi.append(round(sum((v / tot * 100) ** 2 for _, v in vals)))
        n.append(sum(1 for _, v in vals if v > 0) + (n_other if other and (other["v"][i] or 0) > 0 else 0))
    own = max((i for i in range(len(periods)) if p["v"][i] and periods[i] not in PARTIAL), default=periods.index(LATEST))
    ranked = sorted(named, key=lambda c: -(c["v"][own] or 0))
    keep = ranked[:MIX]
    rest = [c for c in p["countries"] if c not in keep]
    mix = [{"name": c["name"], "v": [r(x) for x in c["v"]]} for c in keep]
    if rest:
        mix.append({"name": None, "v": [r(sum((c["v"][i] or 0) for c in rest)) for i in range(len(periods))]})
    return {"top": top, "share": share, "hhi": hhi, "n": n, "mix": mix}


def summarise(products: list, periods: list, missing: list, totals: list) -> list:
    out = []
    for i, per in enumerate(periods):
        if per in missing:
            out.append(None)
            continue
        dep = [p for p in products if (p["share"][i] or 0) > THRESHOLD]
        china = [p for p in dep if p["top"][i] == "China"]
        cov = sum(p["v"][i] or 0 for p in products)
        val = sum(p["v"][i] or 0 for p in dep)
        out.append({"period": per, "covered": r(cov, 1), "total": r(totals[i], 1),
                    "dependent_count": len(dep), "dependent_value": r(val, 1),
                    "dependent_share_of_imports": r(val / totals[i] * 100, 1) if totals[i] else None,
                    "china_count": len(china), "china_value": r(sum(p["v"][i] or 0 for p in china), 1)})
    return out


def chain_values(prefixes: list, products: list, periods: list) -> dict:
    sel = [p for p in products if any(p["hs8"].startswith(x) for x in prefixes)]
    return {"v": [r(sum((p["v"][i] or 0) for p in sel), 1) for i in range(len(periods))],
            "codes": sorted(p["hs8"] for p in sel)}


def build(products_in: list, periods: list, missing: list, partial: list, totals: list, source: str,
          mode: str, exports_products: list, imports_list: list) -> dict:
    global LATEST
    LATEST = [p for p in periods if p not in partial and p not in missing][-1]
    li = periods.index(LATEST)
    global PARTIAL
    PARTIAL = partial
    every = []
    for p in products_in:
        st = product_stats(p, periods, missing)
        every.append({"hs8": p["hs8"], "desc": p.get("desc", ""), "chapter": p.get("chapter", ""),
                      "v": [r(x) for x in p["v"]], "breaks": p.get("breaks", []), **st})
    # Codes retired before the latest year still count in their own years' totals,
    # but the product list shows only products imported in the latest periods.
    products = [p for p in every if p["v"][li] or any(p["v"][i] for i in range(len(periods)) if periods[i] in partial)]
    products.sort(key=lambda p: -(p["v"][li] or 0))
    exp_by = {p["hs8"]: p["v"] for p in exports_products}
    for p in products:
        if p["hs8"] in exp_by:
            p["exports"] = [r(x) for x in exp_by[p["hs8"]]]

    # Main suppliers of dependent products in the latest full year.
    by_sup = {}
    for p in products:
        if (p["share"][li] or 0) > THRESHOLD:
            s = by_sup.setdefault(p["top"][li], {"name": p["top"][li], "count": 0, "value": 0.0, "products": []})
            s["count"] += 1
            s["value"] += p["v"][li] or 0
            s["products"].append(p["hs8"])
    suppliers = sorted(by_sup.values(), key=lambda s: -s["value"])
    for s in suppliers:
        s["value"] = r(s["value"], 1)

    by_ch = {}
    for p in products:
        if (p["share"][li] or 0) > THRESHOLD:
            c = by_ch.setdefault(p["chapter"], {"chapter": p["chapter"], "count": 0, "value": 0.0})
            c["count"] += 1
            c["value"] += p["v"][li] or 0
    chapters = sorted(by_ch.values(), key=lambda c: -c["value"])
    for c in chapters:
        c["value"] = r(c["value"], 1)

    # The same products in the first full year, for a like-for-like comparison.
    first = [p for p in periods if p not in partial and p not in missing][0]

    chains = []
    for ch in CHAINS:
        imp = chain_values(ch["imports"], imports_list, periods)
        exp = chain_values(ch["exports"], exports_products, periods)
        # Main supplier share of the chain's imports, from the product detail.
        sel = [p for p in products_in if any(p["hs8"].startswith(x) for x in ch["imports"])]
        china = []
        for i in range(len(periods)):
            tot = sum(p["v"][i] or 0 for p in sel)
            cv = sum(next((c["v"][i] or 0 for c in p["countries"] if c["name"] == "China"), 0) for p in sel)
            china.append(r(cv / tot * 100, 1) if tot else None)
        chains.append({**{k: ch[k] for k in ("id", "name", "name_hi", "imports_label", "imports_label_hi", "exports_label", "exports_label_hi")},
                       "imports": imp["v"], "exports": exp["v"], "import_codes": imp["codes"], "export_codes": exp["codes"],
                       "china_share_of_imports": china})

    return {
        "source": source, "unit": "US$ million", "periods": periods, "partial": partial, "missing": missing,
        "latest_full": LATEST, "first_full": first, "threshold": THRESHOLD,
        "coverage": {"mode": mode, "products": len(products),
                     "note": ("every imported product" if mode == "all" else
                              f"the {len(products)} largest imported products, which make up most of the import bill")},
        "summary": summarise(every, periods, missing, totals),
        "suppliers": suppliers, "chapters": chapters, "chains": chains, "products": products,
    }


def from_product_files(force: bool = False) -> dict | None:
    if OUT.exists() and not force:
        try:
            if json.loads(OUT.read_text()).get("coverage", {}).get("mode") == "all":
                print("dependence.json was built from every product; keeping it (use --force to replace)")
                return None
        except ValueError:
            pass
    imp = json.loads((TRADE / "imports.json").read_text())
    exp = json.loads((TRADE / "exports.json").read_text())
    files = [json.loads(Path(f).read_text()) for f in sorted(glob.glob(str(TRADE / "imports" / "product" / "*.json")))]
    if exp["periods"] != imp["periods"]:
        exp_products = []
    else:
        exp_products = exp["products"]
    return build(files, imp["periods"], imp.get("missing", []), imp.get("partial", []), imp["total"], imp["source"],
                 "top", exp_products, imp["products"])


def write(doc: dict) -> None:
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    li = doc["periods"].index(doc["latest_full"])
    s = doc["summary"][li]
    print(f"Wrote {OUT.relative_to(ROOT)}: {doc['coverage']['products']} products ({doc['coverage']['mode']}); "
          f"{doc['latest_full']}: {s['dependent_count']} products over {THRESHOLD:.0f}% from one country, "
          f"US$ {s['dependent_value'] / 1000:.1f} bn ({s['dependent_share_of_imports']}% of imports); "
          f"China main supplier for {s['china_count']} (US$ {s['china_value'] / 1000:.1f} bn)")


LATEST = None
PARTIAL: list = []

if __name__ == "__main__":
    doc = from_product_files(force="--force" in sys.argv)
    if doc:
        write(doc)
