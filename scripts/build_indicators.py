"""
Build indicators.json for the E&F-II Economic Situation Board.

Live series come from MoSPI's official API (api.mospi.gov.in):
  - Real GDP growth, quarterly, National Accounts base 2022-23
  - CPI headline inflation, monthly, All India combined, base 2024
Everything else comes from data/manual-indicators.csv, which the team
updates by adding one row per official release.

If MoSPI is unreachable, the last good live values are kept from the
existing output file and marked "stale" instead of being dropped.

Usage:
  python scripts/build_indicators.py                       # live fetch
  python scripts/build_indicators.py --offline fixtures    # use saved responses
  python scripts/build_indicators.py --out public/data/indicators.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import ssl
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "public" / "data" / "indicators.json"
DEFAULT_MANUAL = ROOT / "data" / "manual-indicators.csv"
MOSPI_BASE = "https://api.mospi.gov.in"

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]

# Display settings per indicator. Order inside each group is the display order.
META = {
    "gdp":            {"label": "Real GDP growth", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "cpi":            {"label": "CPI inflation", "group": "Growth and prices", "decimals": 2, "up_is_good": False, "change_unit": "pts"},
    "iip":            {"label": "IIP growth", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "exports":        {"label": "Merchandise exports", "group": "External sector", "decimals": 2, "up_is_good": True,  "change_unit": "bn"},
    "imports":        {"label": "Merchandise imports", "group": "External sector", "decimals": 2, "up_is_good": None,  "change_unit": "bn"},
    "trade_balance":  {"label": "Merchandise trade balance", "group": "External sector", "decimals": 2, "up_is_good": True,  "change_unit": "bn"},
    "cad":            {"label": "Current account balance", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "fx_reserves":    {"label": "Forex reserves", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "inr_usd":        {"label": "Rupee per US dollar", "group": "External sector", "decimals": 2, "up_is_good": False, "change_unit": ""},
    "fiscal_deficit": {"label": "Centre's fiscal deficit", "group": "Fiscal and monetary", "decimals": 1, "up_is_good": False, "change_unit": "pts"},
    "gst_gross":      {"label": "Gross GST collections", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": True,  "change_unit": "lakh cr"},
    "repo":           {"label": "Policy repo rate", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    "gsec10":         {"label": "10-year G-sec yield", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
}


# --------------------------------------------------------------------------
# MoSPI access
# --------------------------------------------------------------------------

def _session():
    """requests session that can talk to MoSPI's server.

    MoSPI's server needs OpenSSL's legacy renegotiation option. Certificate
    checking stays ON by default; set MOSPI_INSECURE=1 only if your network
    breaks the certificate chain (MoSPI's own open-source client turns it off).
    """
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3 import PoolManager
    from urllib3.util.retry import Retry

    insecure = os.environ.get("MOSPI_INSECURE") == "1"
    ctx = ssl.create_default_context()
    # MoSPI's certificate chains to eMudhra's "emSign Root CA - G1", which is
    # in Mozilla's root store (and so in certifi >= 2026.10.19) but missing
    # from many system bundles. Load certifi explicitly, because a custom
    # REQUESTS_CA_BUNDLE (common behind corporate proxies) otherwise replaces
    # it. If Mozilla ever distrusts the root, certifi drops it and the board
    # falls back to the last good figures instead of trusting it blindly.
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except (ImportError, OSError):
        pass
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
    if insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    class LegacyAdapter(HTTPAdapter):
        # The context must be applied on both paths: direct connections go
        # through init_poolmanager, but when HTTPS_PROXY is set requests builds
        # a separate ProxyManager in proxy_manager_for, which would otherwise
        # use a default context without the legacy renegotiation option.
        def init_poolmanager(self, connections, maxsize, block=False, **kw):
            kw["ssl_context"] = ctx
            self.poolmanager = PoolManager(num_pools=connections, maxsize=maxsize, block=block, **kw)

        def proxy_manager_for(self, proxy, **proxy_kwargs):
            proxy_kwargs["ssl_context"] = ctx
            return super().proxy_manager_for(proxy, **proxy_kwargs)

    s = requests.Session()
    s.headers["User-Agent"] = "EF2-Economic-Board/1.0"
    retry = Retry(total=3, backoff_factor=0.8, status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=frozenset({"GET"}))
    s.mount("https://", LegacyAdapter(max_retries=retry))
    s.verify = not insecure
    return s


def _get_all(session, path: str, params: dict) -> list[dict]:
    """GET every page of a MoSPI endpoint (default page size is only 10)."""
    rows, page = [], 1
    while True:
        r = session.get(MOSPI_BASE + path, params={**params, "page": str(page)}, timeout=40)
        r.raise_for_status()
        body = r.json()
        rows.extend(body.get("data") or [])
        total_pages = int((body.get("meta_data") or {}).get("totalPages") or 1)
        if page >= total_pages:
            return rows
        page += 1


def fetch_gdp(session) -> list[dict]:
    return _get_all(session, "/api/nas/getNASData", {
        "base_year": "2022-23", "series": "Current", "frequency_code": "Quarterly",
        "indicator_code": "22", "limit": "100", "Format": "JSON",
    })


def fetch_cpi(session) -> list[dict]:
    this_year = date.today().year
    return _get_all(session, "/api/cpi/getCPIData", {
        "base_year": "2024", "series": "Current", "state_code": "1", "sector_code": "3",
        "division_code": "0", "year": f"{this_year - 1},{this_year}", "limit": "100", "Format": "JSON",
    })


# --------------------------------------------------------------------------
# Shaping
# --------------------------------------------------------------------------

def _num(x):
    try:
        return None if x in (None, "") else float(x)
    except (TypeError, ValueError):
        return None


def _change(v, p):
    return None if v is None or p is None else round(v - p, 2)


def shape_gdp(rows: list[dict]) -> dict | None:
    key = lambda r: (int(str(r["year"])[:4]), int(str(r["quarter"]).lstrip("Q")))
    pts = sorted((r for r in rows if _num(r.get("constant_price")) is not None), key=key)
    if not pts:
        return None
    last, prev = pts[-1], (pts[-2] if len(pts) > 1 else None)
    v, p = _num(last["constant_price"]), _num(prev["constant_price"]) if prev else None
    return {
        "id": "gdp", "mode": "live", "value": v, "unit": "% YoY",
        "period": f'{last["quarter"]} {last["year"]}',
        "compare_value": p, "compare_period": f'{prev["quarter"]} {prev["year"]}' if prev else None,
        "change": _change(v, p),
        "source": "MoSPI National Accounts, base 2022-23 (constant prices)",
        "source_url": "https://esankhyiki.mospi.gov.in", "released": None,
        "history": [{"label": f'{r["quarter"]} {r["year"]}', "short": f'{r["quarter"]} {str(r["year"])[2:]}',
                     "value": _num(r["constant_price"])} for r in pts],
    }


def shape_cpi(rows: list[dict]) -> dict | None:
    key = lambda r: (int(r["year"]), MONTHS.index(r["month"]))
    pts = sorted((r for r in rows if _num(r.get("inflation")) is not None and r.get("month") in MONTHS), key=key)
    if not pts:
        return None
    last, prev = pts[-1], (pts[-2] if len(pts) > 1 else None)
    v, p = _num(last["inflation"]), _num(prev["inflation"]) if prev else None
    m = lambda r: f'{r["month"][:3]} {r["year"]}'
    return {
        "id": "cpi", "mode": "live", "value": v, "unit": "% YoY",
        "period": m(last), "compare_value": p, "compare_period": m(prev) if prev else None,
        "change": _change(v, p),
        "source": "MoSPI CPI, base 2024, All India combined",
        "source_url": "https://esankhyiki.mospi.gov.in", "released": None,
        "history": [{"label": f'{r["month"]} {r["year"]}', "short": f'{r["month"][:3]} {str(r["year"])[2:]}',
                     "value": _num(r["inflation"])} for r in pts],
    }


def shape_manual(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r.get("id")]
    out = []
    for ind_id in dict.fromkeys(r["id"] for r in rows):
        series = sorted((r for r in rows if r["id"] == ind_id), key=lambda r: r["date"])
        last = series[-1]
        v, c = _num(last["value"]), _num(last.get("compare_value"))
        out.append({
            "id": ind_id, "mode": "manual", "value": v, "unit": last["unit"],
            "period": last["period"], "compare_value": c,
            "compare_period": last.get("compare_period") or None, "change": _change(v, c),
            "source": last["source"], "source_url": last.get("source_url") or None,
            "released": last.get("released") or None, "entered_by": last.get("entered_by") or None,
            "history": [{"label": r["period"],
                         "short": datetime.strptime(r["date"], "%Y-%m-%d").strftime("%-d %b"),
                         "value": _num(r["value"])} for r in series],
        })
    return out


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def build(manual_path: Path, out_path: Path, offline_dir: Path | None = None) -> dict:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    previous = {}
    if out_path.exists():
        try:
            previous = {i["id"]: i for i in json.loads(out_path.read_text()).get("indicators", [])}
        except (ValueError, KeyError):
            previous = {}

    live, status = {}, {"status": "ok", "fetched_at": now, "message": None}
    try:
        if offline_dir:
            gdp_rows = json.loads((offline_dir / "mospi_gdp.json").read_text())["data"]
            cpi_rows = json.loads((offline_dir / "mospi_cpi.json").read_text())["data"]
            status["message"] = f"Loaded from saved responses in {offline_dir.name}/"
        else:
            s = _session()
            gdp_rows, cpi_rows = fetch_gdp(s), fetch_cpi(s)
        for item in (shape_gdp(gdp_rows), shape_cpi(cpi_rows)):
            if item:
                live[item["id"]] = item
        if len(live) < 2:
            raise RuntimeError("MoSPI returned no usable rows for GDP or CPI")
    except Exception as exc:  # keep the board up with last good values
        status = {"status": "stale", "fetched_at": now, "message": f"MoSPI fetch failed: {exc}"}
        for k in ("gdp", "cpi"):
            if k not in live and k in previous:
                live[k] = {**previous[k], "stale": True}

    manual = shape_manual(manual_path)
    by_id = {**{i["id"]: i for i in manual}, **live}
    indicators = []
    for ind_id, meta in META.items():
        if ind_id in by_id:
            indicators.append({**meta, **by_id[ind_id]})

    payload = {"generated_at": now, "sources": {"mospi": status}, "indicators": indicators}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return payload


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manual", type=Path, default=DEFAULT_MANUAL)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--offline", type=Path, default=None, help="folder with mospi_gdp.json and mospi_cpi.json")
    a = ap.parse_args(argv)
    p = build(a.manual, a.out, a.offline)
    print(f'Wrote {len(p["indicators"])} indicators to {a.out} (MoSPI: {p["sources"]["mospi"]["status"]})')
    return 0 if p["sources"]["mospi"]["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
