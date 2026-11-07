"""
Build the board's export-partners data from DGCI&S HS 8-digit x country files.

Input : the combined CSV written by scripts/trade_combine.py from the DGCI&S
        "data query" (calendar year, cumulative) and "yearly time series"
        downloads. Columns: period, country, hs8, description, unit,
        quantity, value_usd.
Output: public/data/trade/exports.json          summary for the trade page
        public/data/trade/country/<id>.json     one file per destination
        public/data/trade/product/<hs8>.json    one file per major product
        public/data/trade/exports_summary.csv   country x year, for download

The raw DGCI&S files are not kept in the repository (about 470 MB); keep them
in the team's Drive and rerun:
    python3 scripts/trade_combine.py <folder of .xls> exports.csv.gz
    python3 scripts/build_trade.py exports.csv.gz

Values are US$ million. A period that does not cover a full year (for example
"2026 Jan-Aug") is marked partial and never compared with a full year.
"""

from __future__ import annotations

import csv
import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "trade"
TOP_PRODUCTS = 300          # products listed and given their own file
COUNTRY_PRODUCTS = 40       # products listed on each country page
PRODUCT_COUNTRIES = 25      # destinations listed on each product page

SOURCE = "DGCI&S, Ministry of Commerce and Industry: export data bank, HS 8-digit by country (including re-exports)"

# DGCI&S abbreviations -> names people use. Anything not listed is title-cased.
NAMES = {
    "U S A": "United States", "U ARAB EMTS": "United Arab Emirates", "NETHERLAND": "Netherlands",
    "CHINA P RP": "China", "U K": "United Kingdom", "BANGLADESH PR": "Bangladesh", "SAUDI ARAB": "Saudi Arabia",
    "KOREA RP": "South Korea", "KOREA DP RP": "North Korea", "VIETNAM SOC REP": "Vietnam", "SRI LANKA DSR": "Sri Lanka",
    "TANZANIA REP": "Tanzania", "EGYPT A RP": "Egypt", "YEMEN REPUBLC": "Yemen", "COTE D' IVOIRE": "Cote d'Ivoire",
    "BAHARAIN IS": "Bahrain", "CONGO D. REP.": "DR Congo", "CONGO P REP": "Republic of the Congo",
    "PAKISTAN IR": "Pakistan", "DOMINIC REP": "Dominican Republic", "PANAMA REPUBLIC": "Panama",
    "SLOVAK REP": "Slovakia", "TRINIDAD": "Trinidad and Tobago", "FIJI IS": "Fiji", "PAPUA N GNA": "Papua New Guinea",
    "KYRGHYZSTAN": "Kyrgyzstan", "LAO PD RP": "Laos", "C AFRI REP": "Central African Republic",
    "BOSNIA-HRZGOVIN": "Bosnia and Herzegovina", "EQUTL GUINEA": "Equatorial Guinea", "SWAZILAND": "Eswatini",
    "FR POLYNESIA": "French Polynesia", "VIRGIN IS US": "US Virgin Islands", "ST LUCIA": "Saint Lucia",
    "ANTIGUA": "Antigua and Barbuda", "CAPE VERDE IS": "Cabo Verde", "FAROE IS.": "Faroe Islands",
    "ST KITT N A": "Saint Kitts and Nevis", "VANUATU REP": "Vanuatu", "SOLOMON IS": "Solomon Islands",
    "ST VINCENT": "Saint Vincent and the Grenadines", "FR GUIANA": "French Guiana", "KIRIBATI REP": "Kiribati",
    "AMERI SAMOA": "American Samoa", "SAO TOME": "Sao Tome and Principe", "MARSHALL ISLAND": "Marshall Islands",
    "TURKS C IS": "Turks and Caicos Islands", "BR VIRGN IS": "British Virgin Islands", "CAYMAN IS": "Cayman Islands",
    "NETHERLANDANTIL": "Netherlands Antilles", "N. MARIANA IS.": "Northern Mariana Islands", "NAURU RP": "Nauru",
    "COOK IS": "Cook Islands", "TOKELAU IS": "Tokelau", "SAHARWI A.DM RP": "Western Sahara", "NORFOLK IS": "Norfolk Island",
    "CHRISTMAS IS.": "Christmas Island", "WALLIS F IS": "Wallis and Futuna", "FALKLAND IS": "Falkland Islands",
    "PITCAIRN IS.": "Pitcairn Islands", "NIUE IS": "Niue", "COCOS IS": "Cocos Islands", "ANTARTICA": "Antarctica",
    "SERBIA MONTNGRO": "Serbia and Montenegro (former)", "MACEDONIA": "North Macedonia", "TURKEY": "Turkiye",
    "RUSSIA": "Russia", "IRAN": "Iran", "SYRIA": "Syria", "TAIWAN": "Taiwan", "MACAO": "Macao",
    "SVALLBARD AND JAN MAYEN": "Svalbard and Jan Mayen", "ST HELENA": "Saint Helena", "UNSPECIFIED": "Unspecified",
    "SINT MAARTEN (DUTCH PART)": "Sint Maarten", "US MINOR OUTLYING ISLANDS": "US Minor Outlying Islands",
}

# HS 2-digit chapters (Harmonized System nomenclature, short titles).
CHAPTERS = {
    "01": "Live animals", "02": "Meat", "03": "Fish and crustaceans", "04": "Dairy, eggs, honey",
    "05": "Other animal products", "06": "Live plants, flowers", "07": "Vegetables", "08": "Fruit and nuts",
    "09": "Coffee, tea, spices", "10": "Cereals", "11": "Milling products", "12": "Oil seeds",
    "13": "Lac, gums, resins", "14": "Vegetable plaiting materials", "15": "Fats and oils",
    "16": "Meat and fish preparations", "17": "Sugar", "18": "Cocoa", "19": "Cereal preparations",
    "20": "Vegetable and fruit preparations", "21": "Miscellaneous food preparations", "22": "Beverages",
    "23": "Food industry residues, animal feed", "24": "Tobacco", "25": "Salt, stone, cement",
    "26": "Ores, slag and ash", "27": "Mineral fuels and oils", "28": "Inorganic chemicals",
    "29": "Organic chemicals", "30": "Pharmaceutical products", "31": "Fertilisers", "32": "Dyes, paints, inks",
    "33": "Essential oils, cosmetics", "34": "Soap, waxes", "35": "Albuminoids, glues, enzymes",
    "36": "Explosives, matches", "37": "Photographic goods", "38": "Miscellaneous chemicals",
    "39": "Plastics", "40": "Rubber", "41": "Raw hides and leather", "42": "Leather articles, handbags",
    "43": "Furskins", "44": "Wood", "45": "Cork", "46": "Basketware", "47": "Pulp", "48": "Paper and paperboard",
    "49": "Printed matter", "50": "Silk", "51": "Wool", "52": "Cotton", "53": "Other vegetable fibres",
    "54": "Man-made filaments", "55": "Man-made staple fibres", "56": "Wadding, cordage", "57": "Carpets",
    "58": "Special woven fabrics", "59": "Coated textiles", "60": "Knitted fabrics",
    "61": "Apparel, knitted", "62": "Apparel, not knitted", "63": "Other made-up textiles",
    "64": "Footwear", "65": "Headgear", "66": "Umbrellas", "67": "Feathers, artificial flowers",
    "68": "Stone and cement articles", "69": "Ceramics", "70": "Glass",
    "71": "Gems, jewellery, precious metals", "72": "Iron and steel", "73": "Iron and steel articles",
    "74": "Copper", "75": "Nickel", "76": "Aluminium", "78": "Lead", "79": "Zinc", "80": "Tin",
    "81": "Other base metals", "82": "Tools, cutlery", "83": "Miscellaneous base metal articles",
    "84": "Machinery, nuclear reactors, boilers", "85": "Electrical machinery and electronics",
    "86": "Railway equipment", "87": "Vehicles", "88": "Aircraft and spacecraft", "89": "Ships and boats",
    "90": "Optical, medical, measuring instruments", "91": "Clocks and watches", "92": "Musical instruments",
    "93": "Arms and ammunition", "94": "Furniture, bedding, lighting", "95": "Toys, games, sports goods",
    "96": "Miscellaneous manufactures", "97": "Works of art, antiques", "98": "Project goods, special",
    "99": "Special transactions",
}


def pretty(name: str) -> str:
    if name in NAMES:
        return NAMES[name]
    return " ".join(w.capitalize() if len(w) > 2 else w.title() for w in name.split())


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# DGCI&S squeezes descriptions into a fixed width by dropping vowels.
ABBR = {
    "othr": "other", "otr": "other", "oth": "other", "thn": "than", "wth": "with", "indstrl": "industrial",
    "medcne": "medicine", "mdcmnts": "medicaments", "cylndr": "cylinder", "cpcty": "capacity", "sprk": "spark",
    "prts": "parts", "accssrs": "accessories", "vhcls": "vehicles", "artcls": "articles", "jwellery": "jewellery",
    "prdcts": "products", "prdct": "product", "prodcts": "products", "prdctn": "production", "matress": "mattress",
    "suport": "support", "bedng": "bedding", "bords": "boards", "brds": "boards", "vlts": "volts",
    "popltd": "populated", "stuffd": "stuffed", "prntd": "printed", "crcuit": "circuit", "crcit": "circuit",
    "excptg": "excepting", "excl": "excluding", "hdng": "heading", "hdngs": "headings", "hdg": "heading",
    "refnd": "refined", "includng": "including", "sugr": "sugar", "motr": "motor", "bt": "but",
    "armtc": "aromatic", "hydcrbn": "hydrocarbon", "mxtrs": "mixtures", "prcnt": "per cent", "vl": "volume",
    "mntd": "mounted", "thckns": "thickness", "rold": "rolled", "applncs": "appliances", "cbls": "cables",
    "cmpnds": "compounds", "cndctrs": "conductors", "cntng": "containing", "contng": "containing",
    "drvtvs": "derivatives", "elmnts": "elements", "ftwr": "footwear", "grmnts": "garments", "hvng": "having",
    "insltd": "insulated", "intrnl": "internal", "lthr": "leather", "machns": "machines", "macnry": "machinery",
    "mchnry": "machinery", "mchncl": "mechanical", "nckl": "nickel", "plstcs": "plastics", "plstic": "plastic",
    "pltd": "plated", "prcs": "pieces", "prsntd": "presented", "rgltng": "regulating", "smlr": "similar",
    "stl": "steel", "strctr": "structure", "trnsmsn": "transmission", "vrnshd": "varnished", "cmbstn": "combustion",
    "cmprsn": "compression", "cntrlng": "controlling", "crchtd": "crocheted", "drllng": "drilling",
    "excvtng": "excavating", "excvtrs": "excavators", "functns": "functions", "indvdl": "individual",
    "pstn": "piston", "rvlvng": "revolving", "sctn": "section", "sectns": "sections", "shovls": "shovels",
    "synth": "synthetic", "thrmstc": "thermostatic", "tmpng": "tamping", "cnvynce": "conveyance",
    "frctns": "fractions", "hydrgntd": "hydrogenated", "lvlng": "levelling", "igntn": "ignition",
    "pencllns": "penicillins", "pencllnc": "penicillanic", "phosphrs": "phosphorus", "pyrdn": "pyridine",
    "rdctn": "reduction", "stmd": "stemmed", "dgr": "degree", "drct": "direct", "flt": "flat",
}
SPLITS = {"prtsandaccssrs": "prts and accssrs", "cyclwth": "cycle wth", "excvtngmchnry": "excvtng mchnry",
          "instrmntsandapprts": "instruments and apparatus", "ofthckns": "of thckns", "whollystmd": "wholly stmd",
          "frthrwrkd": "further worked", "ntkntd": "not knitted"}


def clean(desc: str) -> str:
    """DGCI&S descriptions: collapse spaces, sentence case, expand squeezed words."""
    d = re.sub(r"\s+", " ", desc).strip(" .")
    caps = sum(c.isupper() for c in d) > 0.6 * sum(c.isalpha() for c in d)
    if caps:
        d = d.lower()
    d = re.sub(r"\s*\(\s*", " (", d)
    d = re.sub(r"\s*,\s*", ", ", d)
    d = re.sub(r"\)(?=\w)", ") ", d)
    d = re.sub(r"\bexcl\.", "excl", d, flags=re.I)
    for k, v in SPLITS.items():
        d = re.sub(k, v, d, flags=re.I)
    d = re.sub(r"[A-Za-z]+", lambda m: ABBR.get(m.group(0).lower(), m.group(0)), d)
    if caps:
        d = re.sub(r"\b(nes|n\.e\.s|is|cc|kn|kg|mm|cm|kw|kva|pvc|led|lcd|usb|hdpe|ldpe)\b", lambda m: m.group(0).upper(), d)
    return (d[:1].upper() + d[1:]).strip()


# HS 4-digit headings for lines whose own description says little ("Other", "Of gold ...").
HEADINGS = {
    "0904": "pepper and capsicum", "1005": "maize", "1006": "rice", "2710": "petroleum oils", "2711": "petroleum gases",
    "2933": "nitrogen heterocyclic compounds", "2934": "nucleic acids and heterocyclic compounds",
    "3002": "vaccines, blood and immunological products", "3004": "medicines in measured doses",
    "3304": "beauty and skin-care preparations", "3808": "insecticides, herbicides and fungicides",
    "3824": "chemical products n.e.s.", "4011": "new rubber tyres", "5208": "woven cotton fabrics",
    "6203": "men's suits and trousers", "6204": "women's suits and dresses", "6205": "men's shirts",
    "6206": "women's blouses and shirts", "6802": "worked monumental and building stone",
    "6907": "ceramic tiles", "7102": "diamonds", "7113": "jewellery", "7207": "semi-finished iron and steel",
    "7213": "iron and steel bars in coils", "7214": "iron and steel bars and rods", "8408": "diesel engines",
    "8413": "pumps", "8414": "air pumps, compressors and fans", "8479": "machines n.e.s.",
    "8481": "taps and valves", "8504": "transformers and converters", "8517": "phones and network equipment",
    "8536": "electrical switches and connectors", "8537": "electrical control panels", "8807": "aircraft parts",
    "8905": "special vessels and floating platforms", "8906": "other vessels", "9404": "mattresses and bedding",
    "2601": "iron ore", "1701": "cane and beet sugar",
}
GENERIC = re.compile(r"^(others?( under heading \d+)?( n\.?e\.?s)?$|of\b|grade\b|\d)", re.I)


def label(h: str, d: str) -> str:
    if not GENERIC.match(d):
        return d
    head = HEADINGS.get(h[:4]) or CHAPTERS.get(h[:2], "").lower()
    if "heading" in d.lower():
        return f"{d} ({head})" if head else d
    return f"{d} ({head}, heading {h[:4]})" if head else f"{d} (heading {h[:4]})"


def code_breaks(by_prod: dict, order: list) -> dict:
    """Years in which an HS 8-digit line's change on the year before is not like for like.

    India revises its 8-digit tariff lines (HS 2022 created a smartphone code; gold
    jewellery was recoded in 2023; rice in 2025). A line is flagged for a year if it
    was born or retired that year, or if codes born or retired in the same 4-digit
    heading are worth at least a fifth of it.
    """
    full = [p for p in order if len(p) == 4]
    heads = defaultdict(list)
    for h in by_prod:
        heads[h[:4]].append(h)
    out = defaultdict(list)
    for a, b in zip(full, full[1:]):
        for hs4, codes in heads.items():
            moved = {h: by_prod[h].get(a, 0) + by_prod[h].get(b, 0) for h in codes
                     if (by_prod[h].get(a, 0) > 0) != (by_prod[h].get(b, 0) > 0)}
            if not moved:
                continue
            for h in codes:
                own = max(by_prod[h].get(a, 0), by_prod[h].get(b, 0))
                if h in moved or (own and sum(v for k, v in moved.items() if k != h) >= 0.2 * own):
                    out[h].append(b)
    return out


def mn(x: float) -> float:
    return round(x / 1e6, 3)


def main(src: str) -> None:
    by_cty = defaultdict(lambda: defaultdict(float))       # country -> period -> US$
    by_ch = defaultdict(lambda: defaultdict(float))        # hs2 -> period
    by_prod = defaultdict(lambda: defaultdict(float))      # hs8 -> period
    cty_ch = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    cty_prod = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    prod_cty = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    desc, periods = {}, set()
    with gzip.open(src, "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            v = float(r["value_usd"] or 0)
            if not v:
                continue
            p, c, h = r["period"], r["country"], r["hs8"]
            periods.add(p)
            by_cty[c][p] += v
            by_ch[h[:2]][p] += v
            by_prod[h][p] += v
            cty_ch[c][h[:2]][p] += v
            cty_prod[c][h][p] += v
            prod_cty[h][c][p] += v
            # keep the longest description seen for a code (DGCI&S truncates some)
            if len(r["description"]) > len(desc.get(h, "")):
                desc[h] = r["description"].strip()
    desc = {h: label(h, clean(d)) for h, d in desc.items()}

    order = sorted(periods, key=lambda p: (p[:4], len(p)))      # "2026 Jan-Aug" after "2025"
    full = [p for p in order if len(p) == 4]
    latest_full = full[-1]
    vec = lambda d: [mn(d.get(p, 0)) for p in order]
    breaks = code_breaks(by_prod, order)

    def share_top(dct, k=10):
        out = []
        for p in order:
            vals = sorted((d.get(p, 0) for d in dct.values()), reverse=True)
            tot = sum(vals)
            out.append(round(sum(vals[:k]) / tot * 100, 2) if tot else None)
        return out

    countries = sorted(by_cty, key=lambda c: -by_cty[c].get(latest_full, 0))
    cid = {c: slug(pretty(c)) for c in countries}
    products = sorted(by_prod, key=lambda h: -max(by_prod[h].values()))[:TOP_PRODUCTS]
    pset = set(products)
    total = defaultdict(float)
    for d in by_cty.values():
        for p, v in d.items():
            total[p] += v

    summary = {
        "flow": "exports", "unit": "US$ million", "source": SOURCE,
        "periods": order, "partial": [p for p in order if len(p) > 4], "latest_full": latest_full,
        "total": vec(total),
        "partners": [sum(1 for c in by_cty if by_cty[c].get(p, 0) > 0) for p in order],
        "top10_partner_share": share_top(by_cty), "top10_product_share": share_top(by_prod),
        "countries": [{"id": cid[c], "name": pretty(c), "v": vec(by_cty[c])} for c in countries],
        "chapters": sorted(({"hs2": h, "name": CHAPTERS.get(h, f"Chapter {h}"), "v": vec(by_ch[h])} for h in by_ch),
                           key=lambda x: -x["v"][order.index(latest_full)]),
        "products": [{"hs8": h, "desc": desc.get(h, ""), "hs2": h[:2], "chapter": CHAPTERS.get(h[:2], ""),
                      "v": vec(by_prod[h]), **({"breaks": breaks[h]} if breaks.get(h) else {})} for h in products],
    }
    (OUT / "country").mkdir(parents=True, exist_ok=True)
    (OUT / "product").mkdir(parents=True, exist_ok=True)
    for old in list((OUT / "country").glob("*.json")) + list((OUT / "product").glob("*.json")):
        old.unlink()
    (OUT / "exports.json").write_text(json.dumps(summary, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    for c in countries:
        prods = sorted(cty_prod[c], key=lambda h: -sum(cty_prod[c][h].values()))[:COUNTRY_PRODUCTS]
        doc = {
            "id": cid[c], "name": pretty(c), "dgcis_name": c, "periods": order, "v": vec(by_cty[c]),
            "chapters": sorted(({"hs2": h, "name": CHAPTERS.get(h, h), "v": vec(cty_ch[c][h])} for h in cty_ch[c]),
                               key=lambda x: -max(x["v"]))[:25],
            "products": [{"hs8": h, "desc": desc.get(h, ""), "chapter": CHAPTERS.get(h[:2], ""),
                          "linked": h in pset, "v": vec(cty_prod[c][h]),
                          **({"breaks": breaks[h]} if breaks.get(h) else {})} for h in prods],
        }
        (OUT / "country" / f"{cid[c]}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    for h in products:
        dest = sorted(prod_cty[h], key=lambda c: -prod_cty[h][c].get(latest_full, 0))
        top, rest = dest[:PRODUCT_COUNTRIES], dest[PRODUCT_COUNTRIES:]
        others = defaultdict(float)
        for c in rest:
            for p, v in prod_cty[h][c].items():
                others[p] += v
        doc = {
            "hs8": h, "desc": desc.get(h, ""), "chapter": CHAPTERS.get(h[:2], ""), "periods": order,
            "v": vec(by_prod[h]), "breaks": breaks.get(h, []),
            "countries": [{"id": cid[c], "name": pretty(c), "v": vec(prod_cty[h][c])} for c in top]
                         + ([{"id": None, "name": f"All other ({len(rest)})", "v": vec(others)}] if rest else []),
        }
        (OUT / "product" / f"{h}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    with open(OUT / "exports_summary.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["country", "dgcis_name", *[f"{p} (US$ mn)" for p in order]])
        for c in countries:
            w.writerow([pretty(c), c, *vec(by_cty[c])])
    print(f"periods {order}; {len(countries)} countries, {len(by_ch)} chapters, {len(products)} product files")
    print("totals US$ bn:", {p: round(total[p] / 1e9, 2) for p in order})


if __name__ == "__main__":
    main(sys.argv[1])
