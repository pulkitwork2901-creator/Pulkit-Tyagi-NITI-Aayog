"""Discoveries: findings mined from the board's own data, refreshed daily.

Reads what the other scripts publish (indicators, trade by product, country
and state, CPI by state, direct taxes by state) and runs a set of plain
detectors over it: long streaks, records, widening gaps, supplier switches,
shifting trade partners, products that flipped between surplus and deficit,
surges, collapses, and shifts between states. Each finding is scored by how
unusual and how large it is, and written to public/data/insights.json as
structured facts. The page (#/discoveries) turns those facts into sentences in
English and Hindi, so every sentence traces back to a number in this file.

Rules that keep it honest:
- Trade products whose HS code changed inside the compared window are skipped,
  because a recoding looks like a collapse in the old code and a surge in the new.
- "All other" and "Unspecified" are never treated as countries.
- Records are only claimed against at least two years of history, and the
  claim names the date it is measured from.
- Part years (2026 Jan-Aug) are never compared with full years except to say a
  part year has already passed a full year, which needs no seasonal adjustment.

Run: python3 scripts/build_insights.py
"""

from __future__ import annotations

import json
import math
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
TRADE = DATA / "trade"
OUT = DATA / "insights.json"

# Policy rates move in steps the RBI sets, and fiscal figures are cumulative
# within the year, so streaks in them mean nothing.
NO_STREAK = {"repo", "sdf_rate", "msf_rate", "crr", "fiscal_deficit", "capex_centre",
             # real rates are the policy rate minus CPI, so their streaks repeat CPI's
             "real_repo", "real_gsec10"}
# Rural and urban CPI move with the headline; their story is the gap between them.
ECHO = {"cpi_rural": "cpi", "cpi_urban": "cpi"}
MAX_SWITCHES = 8
# Series where a record is news (rates, growth, ratios, flows), not levels that
# rise every year with the size of the economy.
RECORD_OK = {
    "cpi", "cpi_core", "cpi_rural", "cpi_urban", "infl_exp_1y", "infl_exp_3m", "infl_perception",
    "crude_basket", "crude_basket_inr", "gsec10", "tbill_91", "real_repo", "real_gsec10",
    "m3_growth", "credit_nonfood", "credit_agri", "credit_industry", "credit_services",
    "credit_personal", "deposit_growth", "cd_ratio", "capacity_util", "capacity_util_sa",
    "services_net", "services_exports", "remittances", "fx_reserves", "inr_usd", "dt_gdp",
    "dt_share", "exports", "imports", "trade_balance", "iip", "unemployment", "cad", "fdi_net",
    "niip", "wpi", "wpi_food",
}
GAPS = [
    # (a, b, key): a minus b
    ("credit_nonfood", "deposit_growth", "credit_deposit"),
    ("cpi_rural", "cpi_urban", "rural_urban"),
]
NOT_COUNTRY = ("All other", "Unspecified")

# Readable names (English, Hindi) for products whose DGCI&S descriptions are
# abbreviated or misspelt. Products not listed fall back to the official text.
NICE = {
    "27090010": ("crude petroleum", "कच्चा पेट्रोलियम"),
    "85423200": ("memory chips", "मेमोरी चिप"),
    "85423100": ("processor and controller chips", "प्रोसेसर और कंट्रोलर चिप"),
    "85423900": ("other integrated circuits", "अन्य इंटीग्रेटेड सर्किट"),
    "84715000": ("computer processing units", "कंप्यूटर प्रोसेसिंग यूनिट"),
    "31053000": ("DAP fertiliser (diammonium phosphate)", "DAP उर्वरक (डाइ-अमोनियम फॉस्फेट)"),
    "28092010": ("phosphoric acid", "फॉस्फोरिक एसिड"),
    "15111000": ("crude palm oil", "कच्चा पाम तेल"),
    "27111200": ("liquefied propane (LPG)", "द्रवीकृत प्रोपेन (LPG)"),
    "27111300": ("liquefied butane (LPG)", "द्रवीकृत ब्यूटेन (LPG)"),
    "71023910": ("cut and polished diamonds", "कटे और पॉलिश किए हीरे"),
    "71131911": ("plain gold jewellery", "सादे सोने के आभूषण"),
    "27101920": ("petroleum solvents", "पेट्रोलियम सॉल्वेंट"),
    "27101229": ("naphtha", "नैफ्था"),
    "89012000": ("tankers", "टैंकर जहाज़"),
    "71039990": ("cut coloured gemstones", "कटे हुए रंगीन रत्न"),
    "27101241": ("petrol (motor gasoline)", "पेट्रोल"),
    "10019910": ("wheat", "गेहूँ"),
    "28433000": ("gold compounds", "सोने के यौगिक"),
    "07132020": ("Bengal gram (desi chana)", "देसी चना"),
    "15121110": ("crude sunflower oil", "कच्चा सूरजमुखी तेल"),
    "27011990": ("coal (other bituminous)", "कोयला (अन्य बिटुमिनस)"),
    "31042000": ("potash (potassium chloride)", "पोटाश (पोटैशियम क्लोराइड)"),
    "29173600": ("terephthalic acid", "टेरेफ्थेलिक एसिड"),
    "39021000": ("polypropylene", "पॉलीप्रोपिलीन"),
    "85076000": ("lithium-ion batteries", "लिथियम-आयन बैटरी"),
    "27011200": ("steam coal", "भाप कोयला"),
    "27011910": ("coking coal", "कोकिंग कोयला"),
    "27111100": ("liquefied natural gas", "द्रवीकृत प्राकृतिक गैस"),
}


def names(hs8: str, desc: str) -> dict:
    en, hi = NICE.get(hs8, (None, None))
    if not en:
        en = desc if len(desc) <= 60 else desc[:57].rsplit(" ", 1)[0] + "..."
    return {"name": en, "name_hi": hi}


def load(path: Path):
    return json.loads(path.read_text())


def iso(d: str) -> date:
    return date.fromisoformat(d[:10])


def months_between(a: str, b: str) -> int:
    x, y = iso(a), iso(b)
    return (y.year - x.year) * 12 + (y.month - x.month)


def r1(x):
    return None if x is None else round(x, 1)


def r2(x):
    return None if x is None else round(x, 2)


def country_ok(name: str) -> bool:
    return bool(name) and not name.startswith(NOT_COUNTRY)


def clean(series_breaks, lo: str, hi: str) -> bool:
    """True if no HS code change falls inside (lo, hi]."""
    return not any(lo < b <= hi for b in (series_breaks or []))


# ------------------------------------------------------------------ indicators

def indicator_insights(ind: list) -> list:
    out = []
    by = {i["id"]: i for i in ind}
    for i in ind:
        h = [p for p in (i.get("history") or []) if p.get("value") is not None]
        if len(h) < 12:
            continue
        v = [p["value"] for p in h]
        tail = [{"l": p["short"], "v": r2(p["value"])} for p in h[-24:]]
        base = {"id": i["id"], "label": i["label"], "unit": i.get("unit", ""), "decimals": i.get("decimals", 1), "source": i.get("source", ""),
                "period": h[-1]["label"], "value": r2(v[-1]), "group": i.get("group")}
        span = months_between(h[0]["date"], h[-1]["date"])
        monthly = span / max(1, len(h) - 1) < 2

        # Streak of moves in one direction (monthly series only).
        if monthly and i["id"] not in NO_STREAK and i.get("group") != "Direct taxes" and len(v) >= 24:
            d = 1 if v[-1] > v[-2] else -1 if v[-1] < v[-2] else 0
            n = 0
            for j in range(len(v) - 1, 0, -1):
                if d and (v[j] - v[j - 1]) * d > 0:
                    n += 1
                else:
                    break
            if n >= 6:
                s = len(v) - 1 - n
                out.append({"kind": "streak", "theme": theme_of(i), "score": min(95, 45 + 4 * n),
                            "href": f"#/indicator/{i['id']}", "series": tail,
                            "p": {**base, "n": n, "dir": "up" if d > 0 else "down",
                                  "from_period": h[s]["label"], "from_value": r2(v[s])}})

        # Record high or low against at least two years of history.
        if i["id"] in RECORD_OK and span >= 24:
            for kind, better in (("high", lambda a, b: a >= b), ("low", lambda a, b: a <= b)):
                k = next((j for j in range(len(v) - 2, -1, -1) if better(v[j], v[-1])), None)
                if k is None:
                    since, months, alltime = h[0]["label"], span, True
                else:
                    since, months, alltime = h[k]["label"], months_between(h[k]["date"], h[-1]["date"]), False
                if (alltime and span >= 36) or (not alltime and months >= 24):
                    out.append({"kind": "record", "theme": theme_of(i),
                                "score": min(92, 50 + months // 2 + (8 if alltime else 0)),
                                "href": f"#/indicator/{i['id']}", "series": tail,
                                "p": {**base, "side": kind, "since": since, "alltime": alltime, "months": months,
                                      "start": h[0]["label"]}})

    # CPI against the RBI's tolerance band (4% target, 2% either side).
    c = by.get("cpi")
    if c:
        h = [p for p in c["history"] if p.get("value") is not None]
        if len(h) >= 2 and h[-1]["value"] > 6 >= h[-2]["value"]:
            k = next((j for j in range(len(h) - 2, -1, -1) if h[j]["value"] > 6), None)
            out.append({"kind": "band", "theme": "prices", "score": 90, "href": "#/theme/prices-and-inflation",
                        "series": [{"l": p["short"], "v": r2(p["value"])} for p in h[-24:]],
                        "p": {"value": r2(h[-1]["value"]), "period": h[-1]["label"], "prev": r2(h[-2]["value"]),
                              "last_above": h[k]["label"] if k is not None else None, "start": h[0]["label"]}})

    # Gaps between two related series.
    for a, b, key in GAPS:
        A, B = by.get(a), by.get(b)
        if not A or not B:
            continue
        hb = {p["date"]: p["value"] for p in B["history"] if p.get("value") is not None}
        g = [(p["date"], p["label"], p["short"], p["value"] - hb[p["date"]]) for p in A["history"]
             if p.get("value") is not None and p["date"] in hb]
        if len(g) < 24:
            continue
        last = g[-1][3]
        k = next((j for j in range(len(g) - 2, -1, -1) if abs(g[j][3]) >= abs(last) and (g[j][3] > 0) == (last > 0)), None)
        months = months_between(g[k][0], g[-1][0]) if k is not None else months_between(g[0][0], g[-1][0])
        if months >= 18 and abs(last) >= 1:
            out.append({"kind": "gap", "theme": "money" if key == "credit_deposit" else "prices",
                        "score": min(88, 55 + months // 2), "href": f"#/indicator/{a}",
                        "series": [{"l": s, "v": r2(x)} for _, _, s, x in g[-24:]],
                        "p": {"key": key, "a": a, "b": b, "a_label": A["label"], "b_label": B["label"],
                              "a_value": r2(A["value"]), "b_value": r2(B["value"]), "gap": r2(last),
                              "period": g[-1][1], "since": g[k][1] if k is not None else None,
                              "start": g[0][1]}})
    return out


def theme_of(i: dict) -> str:
    g = i.get("group", "")
    if "Prices" in g:
        return "prices"
    if "Growth" in g:
        return "growth"
    if "Interest" in g or "Banking" in g:
        return "money"
    if "Government" in g or "Direct" in g:
        return "taxes"
    return "external"


# ------------------------------------------------------------------ trade

def trade_insights() -> list:
    out = []
    imp, exp = load(TRADE / "imports.json"), load(TRADE / "exports.json")
    P = imp["periods"]
    LI = P.index(imp["latest_full"])
    PI = next((i for i, p in enumerate(P) if p in imp.get("partial", [])), None)
    BI = P.index("2022") if "2022" in P else 0
    latest, base = P[LI], P[BI]
    part = P[PI] if PI is not None else None

    def bars(v):
        return [{"l": p, "v": r1(x), "part": p == part} for p, x in zip(P, v)]

    # Supplier switches: the main supplier of a large import changed.
    switches = []
    for f in sorted((TRADE / "imports" / "product").glob("*.json")):
        d = load(f)
        v = d["v"]
        if (v[LI] or 0) < 1000:
            continue
        # Start from the first year after any code change, but not before 2022.
        b = max([BI] + [P.index(x) for x in (d.get("breaks") or []) if x in P])
        if b >= LI or (v[b] or 0) < 500:
            continue
        cs = [c for c in d["countries"] if country_ok(c["name"])]

        def top(i):
            c = max(cs, key=lambda c: c["v"][i] or 0)
            return c, (c["v"][i] or 0) / v[i] * 100

        (old, s_old), (new, s_new) = top(b), top(LI)
        old_now = (old["v"][LI] or 0) / v[LI] * 100
        # A real replacement: the new supplier is clearly ahead, not neck and neck.
        if old["id"] == new["id"] or s_new < 25 or s_new - old_now < 5:
            continue
        idx = [i for i in range(b, len(P)) if v[i]]
        switches.append({"kind": "switch", "theme": "trade", "score": min(92, 52 + int(10 * math.log10(v[LI] / 1000 + 1) * 2)),
                    "href": f"#/imports/product/{d['hs8']}",
                    "series2": {"periods": [P[i] for i in idx],
                                "a": [r1(old["v"][i] / v[i] * 100) for i in idx],
                                "b": [r1(new["v"][i] / v[i] * 100) for i in idx]},
                    "p": {"hs8": d["hs8"], "desc": d["desc"], **names(d["hs8"], d["desc"]), "base": P[b], "latest": latest, "value": r1(v[LI]),
                          "old": old["name"], "old_then": r1(s_old), "old_now": r1((old["v"][LI] or 0) / v[LI] * 100),
                          "new": new["name"], "new_then": r1((new["v"][b] or 0) / v[b] * 100), "new_now": r1(s_new)}})
    out += sorted(switches, key=lambda x: -x["p"]["value"])[:MAX_SWITCHES]

    # Partner shifts and balances.
    ec = {c["name"]: c for c in exp["countries"] if country_ok(c["name"])}
    ic = {c["name"]: c for c in imp["countries"] if country_ok(c["name"])}
    gains = sorted(ic.values(), key=lambda c: -((c["v"][LI] or 0) - (c["v"][BI] or 0)))[:2]
    for c in gains:
        g = (c["v"][LI] or 0) - (c["v"][BI] or 0)
        if g >= 5000:
            out.append({"kind": "partner", "theme": "trade", "score": min(90, 60 + int(g / 2000)),
                        "href": f"#/imports/country/{c['id']}", "series": bars(c["v"]),
                        "p": {"flow": "imports", "name": c["name"], "base": base, "latest": latest, "part": part,
                              "then": r1(c["v"][BI]), "now": r1(c["v"][LI]), "ytd": r1(c["v"][PI]) if PI is not None else None,
                              "share_then": r1(c["v"][BI] / imp["total"][BI] * 100), "share_now": r1(c["v"][LI] / imp["total"][LI] * 100)}})
    lost = [c for c in ec.values() if (c["v"][BI] or 0) >= 3000 and (c["v"][LI] or 0) <= 0.6 * c["v"][BI]]
    for c in sorted(lost, key=lambda c: (c["v"][LI] or 0) / c["v"][BI])[:3]:
        if True:
            out.append({"kind": "market_loss", "theme": "trade", "score": 70, "href": f"#/exports/country/{c['id']}",
                        "series": bars(c["v"]),
                        "p": {"name": c["name"], "base": base, "latest": latest, "then": r1(c["v"][BI]), "now": r1(c["v"][LI]),
                              "fall": r1((1 - c["v"][LI] / c["v"][BI]) * 100)}})
    bal = []
    for n in set(ec) | set(ic):
        e = ec.get(n, {}).get("v", [0] * len(P))
        m = ic.get(n, {}).get("v", [0] * len(P))
        bal.append((n, [(a or 0) - (b or 0) for a, b in zip(e, m)], (ic.get(n) or ec.get(n))["id"]))
    for n, b, cid in sorted(bal, key=lambda r: r[1][LI] - r[1][BI])[:2]:
        if b[BI] < 0 and b[LI] <= 1.5 * b[BI] and b[LI] - b[BI] <= -10000:
            out.append({"kind": "deficit", "theme": "trade", "score": 84, "href": f"#/imports/country/{cid}",
                        "series": bars(b), "p": {"name": n, "base": base, "latest": latest, "then": r1(b[BI]), "now": r1(b[LI]),
                                                  "ratio": r2(b[LI] / b[BI])}})
    top_surplus = max(bal, key=lambda r: r[1][LI])
    if top_surplus[1][LI] > 0:
        n, b, cid = top_surplus
        out.append({"kind": "surplus", "theme": "trade", "score": 62, "href": f"#/exports/country/{cid}", "series": bars(b),
                    "p": {"name": n, "base": base, "latest": latest, "then": r1(b[BI]), "now": r1(b[LI]),
                          "second": max((r for r in bal if r[0] != n), key=lambda r: r[1][LI])[0]}})

    # Chapters that flipped between surplus and deficit.
    ich = {c["hs2"]: c for c in imp["chapters"]}
    for c in exp["chapters"]:
        m = ich.get(c["hs2"])
        if not m or c["hs2"] in ("98", "99"):
            continue
        b = [(x or 0) - (y or 0) for x, y in zip(c["v"], m["v"])]
        if (b[BI] > 0) != (b[LI] > 0) and min(abs(b[BI]), abs(b[LI])) >= 300:
            out.append({"kind": "flip", "theme": "trade", "score": 76, "href": f"#/exports/chapter/{c['hs2']}", "series": bars(b),
                        "p": {"chapter": c["name"], "hs2": c["hs2"], "from": base, "to": latest, "then": r1(b[BI]), "now": r1(b[LI]),
                              "ytd": r1(b[PI]) if PI is not None else None, "part": part}})
        elif PI is not None and (b[LI] > 0) != (b[PI] > 0) and min(abs(b[LI]), abs(b[PI])) >= 300:
            out.append({"kind": "flip", "theme": "trade", "score": 74, "href": f"#/exports/chapter/{c['hs2']}", "series": bars(b),
                        "p": {"chapter": c["name"], "hs2": c["hs2"], "from": latest, "to": part, "then": r1(b[LI]), "now": r1(b[PI]),
                              "ytd": None, "part": part}})

    # Part year already past the whole of last year; spikes; collapses.
    for flow, doc in (("imports", imp), ("exports", exp)):
        ytd, spikes, gone = [], [], []
        for p in doc["products"]:
            v = p["v"]
            if p["hs8"].startswith(("98", "99")):
                continue
            if PI is not None and clean(p.get("breaks"), P[LI - 1], P[PI]) and (v[LI] or 0) >= 300 and (v[PI] or 0) > v[LI]:
                ytd.append(p)
            if (clean(p.get("breaks"), base, P[PI if PI is not None else LI]) and (v[LI] or 0) >= 1000
                    and v[LI] >= 3 * (v[LI - 1] or 0) and v[LI] >= 10 * (v[BI] or 0)):
                spikes.append(p)
            if clean(p.get("breaks"), base, P[PI if PI is not None else LI]) and (v[BI] or 0) >= 1000 and (v[LI] or 0) < 0.05 * v[BI]:
                gone.append(p)
        for p in sorted(ytd, key=lambda p: -(p["v"][PI] - p["v"][LI]))[:3]:
            out.append({"kind": "ytd", "theme": "trade", "score": min(86, 60 + int(6 * math.log2(1 + (p["v"][PI] - p["v"][LI]) / 250))),
                        "href": f"#/{flow}/product/{p['hs8']}", "series": bars(p["v"]),
                        "p": {"flow": flow, "hs8": p["hs8"], "desc": p["desc"], **names(p["hs8"], p["desc"]), "latest": latest, "part": part,
                              "full": r1(p["v"][LI]), "ytd": r1(p["v"][PI]), "ratio": r2(p["v"][PI] / p["v"][LI])}})
        for p in spikes[:2]:
            v = p["v"]
            out.append({"kind": "spike", "theme": "trade", "score": 82, "href": f"#/{flow}/product/{p['hs8']}",
                        "series": bars(v),
                        "p": {"flow": flow, "hs8": p["hs8"], "desc": p["desc"], **names(p["hs8"], p["desc"]), "base": base, "latest": latest, "part": part,
                              "then": r1(v[BI]), "prev": r1(v[LI - 1]), "prev_year": P[LI - 1], "now": r1(v[LI]),
                              "ytd": r1(v[PI]) if PI is not None else None, "times": round(v[LI] / max(v[BI] or 0.1, 0.1)),
                              "bust": PI is not None and (v[PI] or 0) < 0.1 * v[LI]}})
        for p in gone[:2]:
            out.append({"kind": "gone", "theme": "trade", "score": 66, "href": f"#/{flow}/product/{p['hs8']}",
                        "series": bars(p["v"]),
                        "p": {"flow": flow, "hs8": p["hs8"], "desc": p["desc"], **names(p["hs8"], p["desc"]), "base": base, "latest": latest,
                              "then": r1(p["v"][BI]), "now": r1(p["v"][LI])}})

    # States: who gained and lost share of India's exports.
    rows = []
    for f in sorted((TRADE / "state").glob("*.json")):
        s = load(f)
        if s["name"].startswith("State not") or (s["v"][BI] or 0) < 500:
            continue
        sh = [(a or 0) / b * 100 if b else None for a, b in zip(s["v"], s["india"])]
        topp = max(s["products"], key=lambda p: p["v"][LI] or 0)
        rows.append((s, sh, topp))
    if rows:
        for s, sh, topp in (max(rows, key=lambda r: r[1][LI] - r[1][BI]), min(rows, key=lambda r: r[1][LI] - r[1][BI])):
            d = sh[LI] - sh[BI]
            if abs(d) >= 1:
                out.append({"kind": "state_share", "theme": "states", "score": min(85, 60 + int(abs(d) * 3)),
                            "href": f"#/states/{s['slug']}", "series": [{"l": p, "v": r1(x), "part": p == part} for p, x in zip(P, sh)],
                            "p": {"name": s["name"], "slug": s["slug"], "base": base, "latest": latest, "then": r1(sh[BI]),
                                  "now": r1(sh[LI]), "value": r1(s["v"][LI]), "growth": r1((s["v"][LI] / s["v"][BI] - 1) * 100),
                                  "top": topp["desc"], "top_share": r1((topp["v"][LI] or 0) / s["v"][LI] * 100)}})
    return out


# ------------------------------------------------------------------ states: prices and taxes

def state_insights() -> list:
    out = []
    m = load(DATA / "models.json")
    st = (m.get("cpi_contributions") or {}).get("states")
    if st:
        india = next((r for r in st["rows"] if r["state"] == "All India"), None)
        rows = [r for r in st["rows"] if r["state"] != "All India" and r.get("combined") is not None]
        if india and rows:
            hi_, lo_ = max(rows, key=lambda r: r["combined"]), min(rows, key=lambda r: r["combined"])
            jump = max(rows, key=lambda r: (r["combined"] - (r.get("prev_combined") or r["combined"])))
            out.append({"kind": "cpi_states", "theme": "states", "score": 68, "href": "#/states",
                        "series": [{"l": r["state"], "v": r["combined"]} for r in sorted(rows, key=lambda r: -r["combined"])],
                        "p": {"month": st["month"], "india": india["combined"], "high": hi_["state"], "high_v": hi_["combined"],
                              "low": lo_["state"], "low_v": lo_["combined"], "spread": r2(hi_["combined"] - lo_["combined"]),
                              "above": sum(r["combined"] > india["combined"] for r in rows), "n": len(rows),
                              "jump": jump["state"], "jump_by": r2(jump["combined"] - jump["prev_combined"]),
                              "jump_to": jump["combined"]}})
    t = load(DATA / "direct-taxes.json").get("by_state")
    if t:
        y = t["years"][-1]
        grand = t["totals"]["grand"][y]
        st_ = sorted(((n, v.get(y) or 0) for n, v in {**t["states"], **t.get("uts", {})}.items()), key=lambda r: -r[1])
        top3 = st_[:3]
        first = t["years"][0]
        share_then = (t["states"].get(top3[0][0], {}).get(first) or 0) / t["totals"]["grand"][first] * 100
        out.append({"kind": "tax_states", "theme": "taxes", "score": 58, "href": "#/direct-taxes",
                    "series": [{"l": n, "v": r1(v / grand * 100)} for n, v in st_[:8]],
                    "p": {"year": y, "first": first, "top": [n for n, _ in top3], "top_share": r1(top3[0][1] / grand * 100),
                          "top_share_then": r1(share_then), "top3_share": r1(sum(v for _, v in top3) / grand * 100),
                          "n": len(st_)}})
    return out


def main() -> None:
    ind = load(DATA / "indicators.json")
    found = indicator_insights(ind["indicators"]) + trade_insights() + state_insights()
    # One card per thing said: rural and urban CPI repeat the headline, and a
    # CPI record that starts where the tolerance-band card starts says nothing new.
    keys = {(x["kind"], x["p"].get("id")) for x in found}
    band = next((x for x in found if x["kind"] == "band"), None)
    found = [x for x in found
             if not (x["p"].get("id") in ECHO and (x["kind"], ECHO[x["p"]["id"]]) in keys)
             and not (band and x["kind"] == "record" and x["p"].get("id") == "cpi" and x["p"]["since"] == band["p"]["last_above"])]
    found.sort(key=lambda x: -x["score"])
    for n, x in enumerate(found):
        x["rank"] = n + 1
    doc = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "indicators_as_of": ind.get("generated_at"), "count": len(found), "insights": found}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
    kinds = {}
    for x in found:
        kinds[x["kind"]] = kinds.get(x["kind"], 0) + 1
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(found)} findings {kinds}")


if __name__ == "__main__":
    main()
