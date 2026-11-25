"""Product-group (HS 2-digit chapter) files for the trade pages.

For each flow (exports, imports) and each basis (calendar years in
public/data/trade/, financial years in public/data/trade/fy/), writes
<flow>/chapter/<hs2>.json with:
  - the chapter's value by year, India's total, and the other flow's value for
    the same chapter (so the page can show the trade balance);
  - every partner country's trade in the chapter (from the per-country files,
    which carry each country's chapter totals over all products);
  - the HS 4-digit headings and HS 8-digit lines inside the chapter that are
    among the largest products the board publishes, with how much of the
    chapter they cover;
  - for calendar-year exports, each state's exports in the chapter.

Chapter totals and the country split cover every product. Headings and lines
cover only the published products (the top 300 by value), so the page states
the coverage. Run after build_trade.py: python3 scripts/build_chapters.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hs4_names import HS4  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TRADE = ROOT / "public" / "data" / "trade"
TOP_PARTNERS = 40
NOT_COUNTRY = ("All other", "Unspecified")


def load(p: Path):
    return json.loads(p.read_text())


def r(x):
    return None if x is None else round(x, 3)


def add(a, b):
    return [(x or 0) + (y or 0) for x, y in zip(a, b)]


def build(base: Path, flow: str, other: str, states: bool) -> int:
    src = base / f"{flow}.json"
    if not src.exists():
        return 0
    d = load(src)
    o = load(base / f"{other}.json") if (base / f"{other}.json").exists() else None
    P = d["periods"]
    n = len(P)
    LI = P.index(d["latest_full"]) if d.get("latest_full") in P else n - 1
    other_ch = {c["hs2"]: c["v"] for c in (o or {}).get("chapters", [])} if o and o["periods"] == P else {}

    # Partner split per chapter from the per-country files.
    by_ch: dict[str, list] = {}
    cdir = base / flow / "country"
    for f in sorted(cdir.glob("*.json")) if cdir.exists() else []:
        c = load(f)
        for ch in c.get("chapters", []):
            if any(ch["v"]):
                by_ch.setdefault(ch["hs2"], []).append({"id": c["id"], "name": c["name"], "v": [r(x) for x in ch["v"]]})

    # State split (calendar-year exports only).
    by_state: dict[str, list] = {}
    if states:
        for f in sorted((TRADE / "state").glob("*.json")):
            s = load(f)
            if s["periods"] != P:
                continue
            for ch in s.get("chapters", []):
                if any(ch["v"]):
                    by_state.setdefault(ch["hs2"], []).append({"slug": s["slug"], "name": s["name"], "v": [r(x) for x in ch["v"]]})

    out_dir = base / flow / "chapter"
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for ch in d["chapters"]:
        hs2 = ch["hs2"]
        prods = [p for p in d["products"] if p.get("hs2", p["hs8"][:2]) == hs2]
        heads: dict[str, dict] = {}
        for p in prods:
            h = heads.setdefault(p["hs8"][:4], {"hs4": p["hs8"][:4], "v": [0] * n, "lines": 0, "breaks": set()})
            h["v"] = add(h["v"], p["v"])
            h["lines"] += 1
            h["breaks"].update(p.get("breaks") or [])
        for h in heads.values():
            top = max((p for p in prods if p["hs8"].startswith(h["hs4"])), key=lambda p: p["v"][LI] or 0)
            h["example"] = top["desc"]
            h["name"] = HS4.get(h["hs4"])
            h["v"] = [r(x) for x in h["v"]]
            h["breaks"] = sorted(h["breaks"])
        covered = [0.0] * n
        for p in prods:
            covered = add(covered, p["v"])
        partners = sorted(by_ch.get(hs2, []), key=lambda c: -(c["v"][LI] or 0))
        rest = partners[TOP_PARTNERS:]
        partners = [c for c in partners[:TOP_PARTNERS]]
        if rest:
            agg = [0.0] * n
            for c in rest:
                agg = add(agg, c["v"])
            partners.append({"id": None, "name": f"All other ({len(rest)})", "v": [r(x) for x in agg]})
        doc = {
            "hs2": hs2, "name": ch["name"], "flow": flow, "basis": d.get("basis", "calendar"),
            "periods": P, "partial": d.get("partial", []), "missing": d.get("missing", []), "latest_full": d.get("latest_full"),
            "v": [r(x) for x in ch["v"]], "total": [r(x) for x in d["total"]],
            "other": [r(x) for x in other_ch[hs2]] if hs2 in other_ch else None,
            "partners": partners, "partner_count": [sum(1 for c in by_ch.get(hs2, []) if (c["v"][i] or 0) > 0 and not c["name"].startswith(NOT_COUNTRY)) for i in range(n)],
            "headings": sorted(heads.values(), key=lambda h: -(h["v"][LI] or 0)),
            "products": [{"hs8": p["hs8"], "desc": p["desc"], "v": [r(x) for x in p["v"]], "breaks": p.get("breaks") or []}
                         for p in sorted(prods, key=lambda p: -(p["v"][LI] or 0))],
            "covered": [r(x) for x in covered],
            "states": sorted(by_state.get(hs2, []), key=lambda s: -(s["v"][LI] or 0)) if states else None,
            "source": d.get("source"),
        }
        (out_dir / f"{hs2}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
        written += 1
    return written


def main() -> None:
    for base, label in ((TRADE, "calendar"), (TRADE / "fy", "financial")):
        for flow, other in (("exports", "imports"), ("imports", "exports")):
            k = build(base, flow, other, states=(label == "calendar" and flow == "exports"))
            if k:
                print(f"{label} {flow}: {k} chapter files")


if __name__ == "__main__":
    main()
