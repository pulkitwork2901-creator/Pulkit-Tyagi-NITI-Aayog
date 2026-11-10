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
DEFAULT_RBI = ROOT / "data" / "rbi" / "macro-indicators.xlsx"
MOSPI_BASE = "https://api.mospi.gov.in"

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]

# Display settings per indicator. Order inside each group is the display order.
ROOT_DIR = Path(__file__).resolve().parent.parent

META = {
    # Growth and prices
    "gdp":            {"label": "Real GDP growth", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "cpi":            {"label": "CPI inflation", "group": "Growth and prices", "decimals": 2, "up_is_good": False, "change_unit": "pts"},
    "cpi_core":       {"label": "Core CPI inflation (excluding food and fuel)", "group": "Growth and prices", "decimals": 2, "up_is_good": False, "change_unit": "pts"},
    "gdp_nominal":    {"label": "Nominal GDP growth", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "gdp_deflator":   {"label": "GDP deflator inflation", "group": "Growth and prices", "decimals": 1, "up_is_good": None,  "change_unit": "pts"},
    "cpi_rural":      {"label": "CPI inflation, rural", "group": "Growth and prices", "decimals": 2, "up_is_good": False, "change_unit": "pts"},
    "cpi_urban":      {"label": "CPI inflation, urban", "group": "Growth and prices", "decimals": 2, "up_is_good": False, "change_unit": "pts"},
    "infl_exp_1y":    {"label": "Households' inflation expectations, one year ahead", "group": "Growth and prices", "decimals": 1, "up_is_good": False, "change_unit": "pts"},
    "infl_exp_3m":    {"label": "Households' inflation expectations, three months ahead", "group": "Growth and prices", "decimals": 1, "up_is_good": False, "change_unit": "pts"},
    "infl_perception": {"label": "Households' perception of current inflation", "group": "Growth and prices", "decimals": 1, "up_is_good": False, "change_unit": "pts"},
    "iip":            {"label": "IIP growth", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "wpi":            {"label": "WPI inflation", "group": "Growth and prices", "decimals": 2, "up_is_good": False, "change_unit": "pts"},
    "wpi_food":       {"label": "WPI food inflation", "group": "Growth and prices", "decimals": 2, "up_is_good": False, "change_unit": "pts"},
    "capacity_util":  {"label": "Capacity utilisation in manufacturing", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "capacity_util_sa": {"label": "Capacity utilisation in manufacturing, seasonally adjusted", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "pmi_mfg":        {"label": "Manufacturing PMI (HSBC)", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "pmi_services":   {"label": "Services PMI (HSBC)", "group": "Growth and prices", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "crude_basket":   {"label": "Crude oil price (Indian basket)", "group": "Growth and prices", "decimals": 1, "up_is_good": False, "change_unit": "$"},
    "crude_basket_inr": {"label": "Crude oil price in rupees", "group": "Growth and prices", "decimals": 0, "up_is_good": False, "change_unit": "₹"},
    "unemployment":   {"label": "Unemployment rate", "group": "Growth and prices", "decimals": 1, "up_is_good": False, "change_unit": "pts"},
    # External sector
    "exports":        {"label": "Merchandise exports", "group": "External sector", "decimals": 2, "up_is_good": True,  "change_unit": "bn"},
    "imports":        {"label": "Merchandise imports", "group": "External sector", "decimals": 2, "up_is_good": None,  "change_unit": "bn"},
    "trade_balance":  {"label": "Merchandise trade balance", "group": "External sector", "decimals": 2, "up_is_good": True,  "change_unit": "bn"},
    "cad":            {"label": "Current account balance", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "services_exports": {"label": "Services exports", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "services_imports": {"label": "Services imports", "group": "External sector", "decimals": 1, "up_is_good": None,  "change_unit": "bn"},
    "services_net":   {"label": "Services trade surplus", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "remittances":    {"label": "Remittances (personal transfer receipts)", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "ca_usd":         {"label": "Current account balance, US$", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "ca_goods":       {"label": "Current account: goods balance", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "ca_services":    {"label": "Current account: services balance", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "ca_primary":     {"label": "Current account: primary income (net)", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "ca_secondary":   {"label": "Current account: transfers (net)", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "fx_reserves":    {"label": "Forex reserves", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    "inr_usd":        {"label": "Rupee per US dollar", "group": "External sector", "decimals": 2, "up_is_good": False, "change_unit": ""},
    "fwd_premia_3m":  {"label": "3-month forward premium on US$", "group": "External sector", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    "ext_debt":       {"label": "External debt, gross", "group": "External sector", "decimals": 1, "up_is_good": None,  "change_unit": "bn"},
    "niip":           {"label": "Net international investment position", "group": "External sector", "decimals": 1, "up_is_good": True,  "change_unit": "bn"},
    # Fiscal and monetary
    "fiscal_deficit": {"label": "Centre's fiscal deficit", "group": "Fiscal and monetary", "decimals": 1, "up_is_good": False, "change_unit": "pts"},
    "capex_centre":   {"label": "Centre's capital expenditure", "group": "Fiscal and monetary", "decimals": 1, "up_is_good": True,  "change_unit": "pts"},
    "gst_domestic":   {"label": "GST on domestic transactions (gross)", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": True,  "change_unit": "lakh cr"},
    "gst_imports":    {"label": "GST on imports (gross)", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "lakh cr"},
    "gst_gross":      {"label": "Gross GST collections", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": True,  "change_unit": "lakh cr"},
    "dt_ytd_net":     {"label": "Net direct tax collections, this year so far", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "lakh cr"},
    "dt_net":         {"label": "Net direct tax collections", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "lakh cr"},
    "dt_corporate":   {"label": "Corporate tax collections", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "lakh cr"},
    "dt_noncorporate": {"label": "Non-corporate tax collections (mainly personal income tax)", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "lakh cr"},
    "dt_gross":       {"label": "Gross direct tax collections (before refunds)", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "lakh cr"},
    "dt_gdp":         {"label": "Direct tax to GDP ratio", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "pts"},
    "dt_share":       {"label": "Direct taxes' share of total tax revenue", "group": "Direct taxes", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    "dt_buoyancy":    {"label": "Direct tax buoyancy", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": ""},
    "dt_cost":        {"label": "Cost of collecting direct taxes", "group": "Direct taxes", "decimals": 2, "up_is_good": False, "change_unit": "pts"},
    "itr_filers":     {"label": "Persons filing income-tax returns", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "crore"},
    "itr_filed":      {"label": "Income-tax returns filed", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "crore"},
    "taxpayers":      {"label": "Taxpayers (return filers plus those with tax deducted at source)", "group": "Direct taxes", "decimals": 2, "up_is_good": True,  "change_unit": "crore"},
    "sdl_borrowing":  {"label": "State government market borrowing", "group": "Fiscal and monetary", "decimals": 1, "up_is_good": None,  "change_unit": "'000 cr"},
    "repo":           {"label": "Policy repo rate", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    "sdf_rate":       {"label": "Standing deposit facility rate", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    "msf_rate":       {"label": "Marginal standing facility rate", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    "crr":            {"label": "Cash reserve ratio", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    "real_repo":      {"label": "Real policy rate (repo minus CPI inflation)", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None, "change_unit": "pts"},
    "real_gsec10":    {"label": "Real 10-year yield (G-sec minus CPI inflation)", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None, "change_unit": "pts"},
    "tbill_91":       {"label": "91-day T-bill yield", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    "gsec10":         {"label": "10-year G-sec yield", "group": "Fiscal and monetary", "decimals": 2, "up_is_good": None,  "change_unit": "pts"},
    # Money, credit and capital flows
    "credit_nonfood": {"label": "Non-food bank credit growth", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": None, "change_unit": "pts"},
    "credit_agri":    {"label": "Credit to agriculture and allied activities", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": None, "change_unit": "pts"},
    "credit_industry": {"label": "Credit to industry", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": None, "change_unit": "pts"},
    "credit_services": {"label": "Credit to services", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": None, "change_unit": "pts"},
    "credit_personal": {"label": "Personal loans", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": None, "change_unit": "pts"},
    "deposit_growth": {"label": "Bank deposit growth", "group": "Money, credit and capital flows", "decimals": 1, "up_is_good": None, "change_unit": "pts"},
    "cd_ratio":       {"label": "Credit-deposit ratio", "group": "Money, credit and capital flows", "decimals": 1, "up_is_good": None, "change_unit": "pts"},
    "m3_growth":      {"label": "Broad money (M3) growth", "group": "Money, credit and capital flows", "decimals": 1, "up_is_good": None, "change_unit": "pts"},
    "fdi_net":        {"label": "Net FDI", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": True,  "change_unit": "bn"},
    "fdi_gross":      {"label": "Gross FDI into India", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": True,  "change_unit": "bn"},
    "fpi_net":        {"label": "Net portfolio investment", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": None,  "change_unit": "bn"},
    "nri_deposits":   {"label": "Net NRI deposit inflows", "group": "Money, credit and capital flows", "decimals": 1, "up_is_good": None,  "change_unit": "bn"},
    "ecb_reg":        {"label": "External commercial borrowing registrations", "group": "Money, credit and capital flows", "decimals": 2, "up_is_good": None,  "change_unit": "bn"},
    "digital_payments": {"label": "Digital payments, value", "group": "Money, credit and capital flows", "decimals": 1, "up_is_good": True,  "change_unit": "lakh cr"},
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


def fetch_wpi(session) -> list[dict]:
    """WPI 2022-23 base: headline and food index, from the start of the series."""
    this_year = date.today().year
    return _get_all(session, "/api/wpi/getWpiRecords", {
        "base_year": "2022-23", "year": ",".join(str(y) for y in range(2023, this_year + 1)),
        "major_group_code": "1000000000,1400000000", "limit": "200", "Format": "JSON",
    })


def fetch_unemployment(session) -> list[dict]:
    """PLFS monthly unemployment rate, All India, age 15+, rural + urban, CWS."""
    return _get_all(session, "/api/plfs/getData", {
        # the raw API does not accept year=all; monthly estimates begin in 2025
        "frequency_code": "3", "indicator_code": "3",
        "year": ",".join(str(y) for y in range(2025, date.today().year + 1)), "state_code": "99",
        "gender_code": "3", "age_code": "1", "sector_code": "3", "limit": "100", "Format": "JSON",
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


def _month_end(year: int, month: int) -> str:
    nxt = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1).isoformat()


def _fy_quarter_end(fy: str, quarter: str) -> str:
    """'2026-27', 'Q1' -> '2026-06-30' (Indian fiscal year starts in April)."""
    start, q = int(str(fy)[:4]), int(str(quarter).lstrip("Q"))
    month = {1: 6, 2: 9, 3: 12, 4: 3}[q]
    return _month_end(start + (q == 4), month)


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
        "history": [{"date": _fy_quarter_end(r["year"], r["quarter"]),
                     "label": f'{r["quarter"]} {r["year"]}', "short": f'{r["quarter"]} {str(r["year"])[2:]}',
                     "value": _num(r["constant_price"])} for r in pts],
    }


def fetch_cpi_sectors(session) -> list[dict]:
    """Rural and urban CPI inflation: 2024 base from January 2026, linked to the
    2012 base (MoSPI getCPIIndex, All India, General) for earlier months."""
    this_year = date.today().year
    out = []
    for code, ind_id, name in (("1", "cpi_rural", "rural"), ("2", "cpi_urban", "urban")):
        new = _get_all(session, "/api/cpi/getCPIData", {
            "base_year": "2024", "series": "Current", "state_code": "1", "sector_code": code,
            "division_code": "0", "year": f"{this_year - 1},{this_year}", "limit": "100", "Format": "JSON"})
        old = _get_all(session, "/api/cpi/getCPIIndex", {
            "base_year": "2012", "series": "Current", "state_code": "99", "sector_code": code, "group_code": "0",
            "year": ",".join(str(y) for y in range(2019, 2026)), "limit": "200", "Format": "JSON"})
        old = [r for r in old if r.get("subgroup") == "General-Overall"]
        pts = {}
        for r in old + new:  # the 2024 base overrides where both exist
            v = _num(r.get("inflation"))
            if v is None or r.get("month") not in MONTHS:
                continue
            pts[(int(r["year"]), MONTHS.index(r["month"]) + 1)] = v
        points = [(y, m, v) for (y, m), v in sorted(pts.items())]
        item = _monthly_item(ind_id, points, "% YoY", f"MoSPI CPI, {name}, base 2024 (2012 base before 2026)",
                             f"All India {name} CPI inflation. From January 2026 MoSPI's 2024-base series; earlier months as published on the 2012 base.")
        if item:  # compared with the previous month, like headline CPI
            out.append(item)
    return out



# Official CPI basket weights (MoSPI), All India combined.
CORE_WEIGHTS_2024 = {"food": 0.3675, "fuel": 0.05489}   # food and beverages; electricity, gas and other fuels
CORE_WEIGHTS_2012 = {"food": 0.45863, "fuel": 0.06843}  # food and beverages; fuel and light


def fetch_core_cpi(session) -> list[dict]:
    """Core CPI inflation, excluding food and fuel, from MoSPI component indices and
    official weights: core index = (general - w_food x food - w_fuel x fuel) / (1 - w_food - w_fuel).
    2024 base from January 2026, 2012 base for earlier months."""
    this_year = date.today().year

    def idx(rows, pick):
        out = {}
        for r in rows:
            v = _num(r.get("index"))
            if v is not None and pick(r) and r.get("month") in MONTHS:
                out[(int(r["year"]), MONTHS.index(r["month"]) + 1)] = v
        return out

    def core(g, f, u, w):
        return {k: (g[k] - w["food"] * f[k] - w["fuel"] * u[k]) / (1 - w["food"] - w["fuel"]) for k in g if k in f and k in u}

    p24 = {"base_year": "2024", "series": "Current", "state_code": "1", "sector_code": "3",
           "year": ",".join(str(y) for y in range(2025, this_year + 1)), "limit": "100", "Format": "JSON"}
    g = idx(_get_all(session, "/api/cpi/getCPIData", {**p24, "division_code": "0"}), lambda r: True)
    f = idx(_get_all(session, "/api/cpi/getCPIData", {**p24, "division_code": "1"}), lambda r: not r.get("group"))
    u = idx(_get_all(session, "/api/cpi/getCPIData", {**p24, "division_code": "4", "group_code": "11"}), lambda r: not r.get("class"))
    c24 = core(g, f, u, CORE_WEIGHTS_2024)
    rows = []
    # One year per request: MoSPI's paging is not stable across pages, so a
    # multi-page reply can drop rows. A single year fits on one page.
    for gc in ("0", "1", "5"):
        for yr in range(2018, 2026):
            rows += _get_all(session, "/api/cpi/getCPIIndex", {"base_year": "2012", "series": "Current", "state_code": "99", "sector_code": "3",
                             "group_code": gc, "year": str(yr), "limit": "200", "Format": "JSON"})
    sub = lambda name: idx(rows, lambda r: r.get("subgroup") == name)
    c12 = core(sub("General-Overall"), sub("Food and Beverages-Overall"), sub("Fuel and Light-Overall"), CORE_WEIGHTS_2012)
    yoy = {}
    for c in (c12, c24):  # the 2024 base overrides from January 2026
        for (y, m), v in c.items():
            if (y - 1, m) in c:
                yoy[(y, m)] = (v / c[(y - 1, m)] - 1) * 100
    pts = [(y, m, round(v, 2)) for (y, m), v in sorted(yoy.items())]
    item = _monthly_item("cpi_core", pts, "% YoY", "Computed from MoSPI CPI component indices and official weights",
                         "CPI excluding food and beverages and household fuel (electricity, gas and other fuels), All India combined. "
                         "Computed from MoSPI's published indices with MoSPI's basket weights (2024 base: food 36.75%, fuel 5.49%; "
                         "2012 base: food 45.86%, fuel and light 6.84%). Petrol and diesel for vehicles stay in, as in the usual Indian measure. "
                         "Not an official MoSPI series.")
    return [item] if item else []


def shape_gdp_extra(rows: list[dict]) -> list[dict]:
    """Nominal GDP growth (MoSPI current prices) and the implied GDP deflator."""
    key = lambda r: (int(str(r["year"])[:4]), int(str(r["quarter"]).lstrip("Q")))
    pts = sorted((r for r in rows if _num(r.get("current_price")) is not None and _num(r.get("constant_price")) is not None), key=key)
    out = []
    for ind_id, fn, src, note in (
        ("gdp_nominal", lambda r: _num(r["current_price"]), "MoSPI National Accounts, base 2022-23 (current prices)",
         "GDP growth at current prices, before adjusting for inflation."),
        ("gdp_deflator", lambda r: round(((1 + _num(r["current_price"]) / 100) / (1 + _num(r["constant_price"]) / 100) - 1) * 100, 1),
         "Derived from MoSPI National Accounts (current and constant prices)",
         "Implied GDP deflator inflation: (1 + nominal growth) / (1 + real growth) - 1. The broadest measure of inflation across everything the economy produces."),
    ):
        hist = [{"date": _fy_quarter_end(r["year"], r["quarter"]), "label": f'{r["quarter"]} {r["year"]}',
                 "short": f'{r["quarter"]} {str(r["year"])[2:]}', "value": fn(r)} for r in pts]
        if not hist:
            continue
        last, prev = hist[-1], (hist[-2] if len(hist) > 1 else None)
        out.append({"id": ind_id, "mode": "live", "value": last["value"], "unit": "% YoY", "period": last["label"],
                    "compare_value": prev["value"] if prev else None, "compare_period": prev["label"] if prev else None,
                    "change": _change(last["value"], prev["value"] if prev else None),
                    "source": src, "source_url": "https://esankhyiki.mospi.gov.in", "released": None, "history": hist, "note": note})
    return out



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
        "history": [{"date": _month_end(int(r["year"]), MONTHS.index(r["month"]) + 1),
                     "label": f'{r["month"][:3]} {r["year"]}', "short": f'{r["month"][:3]} {str(r["year"])[2:]}',
                     "value": _num(r["inflation"])} for r in pts],
    }


def _short_label(iso: str) -> str:
    """Axis label: 'Sep 26' for month-end and quarter-end figures, '23 Oct' otherwise."""
    d = datetime.strptime(iso, "%Y-%m-%d")
    nxt = d.replace(day=28) + __import__("datetime").timedelta(days=4)
    is_month_end = (nxt - __import__("datetime").timedelta(days=nxt.day)).day == d.day
    return d.strftime("%b %y") if is_month_end else d.strftime("%-d %b")


def manual_rows_by_id(path: Path) -> dict[str, list[dict]]:
    """Sheet rows as typed values, for merging into RBI series."""
    with open(path, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r.get("id")]
    out: dict[str, list[dict]] = {}
    for r in rows:
        v, c = _num(r["value"]), _num(r.get("compare_value"))
        if v is None:
            continue
        out.setdefault(r["id"], []).append({
            "date": r["date"], "period": r["period"], "value": v, "unit": r["unit"],
            "compare_value": c, "compare_period": r.get("compare_period") or None, "change": _change(v, c),
            "source": r["source"], "source_url": r.get("source_url") or None,
            "released": r.get("released") or None, "entered_by": r.get("entered_by") or None})
    return out


def _monthly_item(ind_id, points, unit, source, note=None):
    """points: sorted [(year, month, value)] -> board indicator, compare = previous month."""
    if not points:
        return None
    hist = [{"date": _month_end(y, m), "label": f"{MONTHS[m - 1][:3]} {y}", "short": f"{MONTHS[m - 1][:3]} {str(y)[2:]}",
             "value": round(v, 2)} for y, m, v in points]
    last, prev = hist[-1], (hist[-2] if len(hist) > 1 else None)
    item = {
        "id": ind_id, "mode": "live", "value": last["value"], "unit": unit, "period": last["label"],
        "compare_value": prev["value"] if prev else None, "compare_period": prev["label"] if prev else None,
        "change": _change(last["value"], prev["value"] if prev else None),
        "source": source, "source_url": "https://esankhyiki.mospi.gov.in", "released": None, "history": hist,
    }
    if note:
        item["note"] = note
    return item


def shape_wpi(rows: list[dict]) -> list[dict]:
    """Year-on-year inflation from WPI index levels (headline and food)."""
    out = []
    for group, ind_id, label in (("Wholesale Price Index", "wpi", "headline"), ("Food Index", "wpi_food", "food")):
        idx = {}
        for r in rows:
            if r.get("major_group") == group and r.get("month") in MONTHS and _num(r.get("index_value")) is not None:
                idx[(int(r["year"]), MONTHS.index(r["month"]) + 1)] = _num(r["index_value"])
        pts = [(y, m, (v / idx[(y - 1, m)] - 1) * 100) for (y, m), v in sorted(idx.items()) if idx.get((y - 1, m))]
        item = _monthly_item(ind_id, pts, "% YoY", "MoSPI (Office of the Economic Adviser data), WPI base 2022-23",
                             f"Year-on-year change in the WPI {label} index, 2022-23 base; the series starts in 2023, so inflation is available from 2024.")
        if item:
            out.append(item)
    return out


def shape_unemployment(rows: list[dict]) -> dict | None:
    pts = sorted((int(r["year"]), MONTHS.index(r["month"]) + 1, _num(r["value"])) for r in rows
                 if r.get("month") in MONTHS and _num(r.get("value")) is not None)
    return _monthly_item("unemployment", pts, "%", "MoSPI Periodic Labour Force Survey, monthly",
                         "Current weekly status, persons aged 15 and above, rural and urban combined. Monthly estimates start in April 2025; March 2026 was not published.")


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
            "history": [{"date": r["date"], "label": r["period"],
                         "short": _short_label(r["date"]),
                         "value": _num(r["value"])} for r in series],
        })
    return out


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# RBI press releases: services trade, remittances, balance of payments
# --------------------------------------------------------------------------

RBI_SERVICES_URL = "https://www.rbi.org.in/Scripts/Pr_DataRelease.aspx?SectionID=352"
RBI_PR_URL = "https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid={}"
RBI_PUB_URL = "https://www.rbi.org.in/Scripts/PublicationsView.aspx?id={}"


def _prev_item(ind_id, hist, unit, source, url, compare_label, note=None):
    """Indicator compared with the previous reading (previous survey round or quarter)."""
    hist = [h for h in hist if h["value"] is not None]
    if not hist:
        return None
    last, prev = hist[-1], (hist[-2] if len(hist) > 1 else None)
    item = {
        "id": ind_id, "mode": "rbi", "value": last["value"], "unit": unit, "period": last["label"],
        "compare_value": prev["value"] if prev else None,
        "compare_period": f'{compare_label} ({prev["label"]})' if prev else None,
        "change": _change(last["value"], prev["value"] if prev else None),
        "source": source, "source_url": url, "released": None, "history": hist,
    }
    if note:
        item["note"] = note
    return item


def _year_ago_item(ind_id, hist, unit, source, url, note=None):
    """hist: sorted [{date,label,short,value}] -> indicator compared with the same period a year earlier."""
    hist = [h for h in hist if h["value"] is not None]
    if not hist:
        return None
    last = hist[-1]
    y, rest = last["date"][:4], last["date"][4:7]
    prev = next((h for h in hist if h["date"][:7] == f"{int(y) - 1}{rest}"), None)
    item = {
        "id": ind_id, "mode": "rbi", "value": last["value"], "unit": unit, "period": last["label"],
        "compare_value": prev["value"] if prev else None, "compare_period": prev["label"] if prev else None,
        "change": _change(last["value"], prev["value"] if prev else None),
        "source": source, "source_url": url, "released": None, "history": hist,
    }
    if note:
        item["note"] = note
    return item


def rbi_release_items() -> dict[str, dict]:
    import rbi_releases
    cache_path = rbi_releases.CACHE
    if not cache_path.exists():
        return {}
    cache = json.loads(cache_path.read_text())
    m = rbi_releases.merged(cache)
    latest = {}
    for p, r in cache["releases"].items():
        if int(p) > int(latest.get(r["kind"], "0")):
            latest[r["kind"]] = p
    out = {}

    def month_pt(k, v):
        y, mo = int(k[:4]), int(k[5:7])
        return {"date": _month_end(y, mo), "label": f"{MONTHS[mo - 1][:3]} {y}", "short": f"{MONTHS[mo - 1][:3]} {str(y)[2:]}", "value": v}

    def quarter_pt(k, v):
        y, mo = int(k[:4]), int(k[5:7])
        fy0 = y if mo > 3 else y - 1
        q = {6: 1, 9: 2, 12: 3, 3: 4}[mo]
        return {"date": _month_end(y, mo), "label": f"Q{q} {fy0}-{str(fy0 + 1)[2:]}", "short": f"Q{q} {str(fy0)[2:]}", "value": v}

    sv = m["services"]
    src_s = "RBI, Monthly data on India's international trade in services"
    url_s = RBI_PR_URL.format(latest["services"]) if "services" in latest else RBI_SERVICES_URL
    note_s = "Latest two months provisional; earlier months revised with the quarterly balance of payments."
    for key, fn in (("services_exports", lambda v: v["exports"]), ("services_imports", lambda v: v["imports"]),
                    ("services_net", lambda v: v["exports"] - v["imports"])):
        hist = [month_pt(k, round(fn(v) / 1000, 2)) for k, v in sorted(sv.items())]
        item = _year_ago_item(key, hist, "US$ bn", src_s, url_s, note_s)
        if item:
            out[key] = item

    bq = m["bop_quarter"]
    src_q = "RBI, Developments in India's balance of payments (quarterly)"
    url_q = RBI_PR_URL.format(latest["bop_quarter"]) if "bop_quarter" in latest else None
    rem = [quarter_pt(k, v["remittances"]) for k, v in sorted(bq.items()) if v.get("remittances") is not None]
    item = _year_ago_item("remittances", rem, "US$ bn a quarter", src_q, url_q,
                          "Personal transfer receipts, mainly money sent home by Indians working abroad, as stated in RBI's quarterly release.")
    if item:
        out["remittances"] = item
    hist = [quarter_pt(k, v.get("ca_revised", v["current_account"]["net"])) for k, v in sorted(bq.items()) if isinstance(v.get("current_account"), dict)]
    item = _year_ago_item("ca_usd", hist, "US$ bn a quarter", src_q, url_q,
                          "Revisions RBI states in later releases are applied, so components may not add up exactly for revised quarters.")
    if item:
        out["ca_usd"] = item
    hist = [quarter_pt(k, v["ca_pct_gdp"]) for k, v in sorted(bq.items()) if v.get("ca_pct_gdp") is not None]
    item = _year_ago_item("cad", hist, "% of GDP", src_q, url_q)
    if item:
        out["cad"] = item
    for key, field in (("ca_goods", "goods"), ("ca_services", "services"),
                       ("ca_primary", "primary_income"), ("ca_secondary", "secondary_income")):
        hist = [quarter_pt(k, v[field]["net"]) for k, v in sorted(bq.items()) if isinstance(v.get(field), dict)]
        item = _year_ago_item(key, hist, "US$ bn a quarter", src_q, url_q)
        if item:
            out[key] = item

    sec = m.get("sectoral") or {}
    url_c = RBI_PR_URL.format(latest["sectoral"]) if "sectoral" in latest else "https://www.rbi.org.in/Scripts/Pr_DataRelease.aspx?SectionID=348"
    for key in ("credit_agri", "credit_industry", "credit_services", "credit_personal"):
        hist = [month_pt(k, v[key]) for k, v in sorted(sec.items()) if v.get(key) is not None]
        if not hist:
            continue
        last_k = max(k for k, v in sec.items() if v.get(key) is not None)
        ya = sec[last_k].get(key + "_year_ago")
        last = hist[-1]
        y, mo = int(last_k[:4]), int(last_k[5:7])
        out[key] = {"id": key, "mode": "rbi", "value": last["value"], "unit": "% YoY", "period": last["label"],
                    "compare_value": ya, "compare_period": f"Growth a year earlier ({MONTHS[mo - 1][:3]} {y - 1}), as restated by RBI" if ya is not None else None,
                    "change": _change(last["value"], ya), "source": "RBI, Sectoral Deployment of Bank Credit (monthly release)",
                    "source_url": url_c, "released": None, "history": hist}

    # RBI's forward-looking surveys, released with each monetary policy statement.
    surveys = [r for p, r in sorted(cache["releases"].items(), key=lambda x: int(x[0])) if r["kind"] == "surveys"]
    def pub_url(key):
        pid = next((r["pubs"][key] for r in reversed(surveys) if key in r.get("pubs", {})), None)
        return RBI_PUB_URL.format(pid) if pid else None

    ie = m.get("iesh") or {}
    src_i = "RBI, Inflation Expectations Survey of Households (bi-monthly)"
    note_i = ("Median of what urban households in 19 cities say inflation is now and expect it to be, in the survey round "
              "named (about 6,000 responses a round). Households' figures run well above measured CPI inflation; "
              "RBI reads them for direction rather than level.")
    for key, field in (("infl_exp_1y", "exp_1y"), ("infl_exp_3m", "exp_3m"), ("infl_perception", "perception")):
        hist = [month_pt(k, v[field]) for k, v in sorted(ie.items()) if v.get(field) is not None]
        item = _prev_item(key, hist, "% (median)", src_i, pub_url("iesh"), "the previous round", note_i)
        if item:
            out[key] = item

    ob = m.get("obicus") or {}
    src_o = "RBI, Order Books, Inventories and Capacity Utilisation Survey (OBICUS, quarterly)"
    hist = [quarter_pt(k, v["cu"]) for k, v in sorted(ob.items()) if v.get("cu") is not None]
    item = _year_ago_item("capacity_util", hist, "%", src_o, pub_url("obicus"),
                          "Share of installed capacity in use, from about 1,000 manufacturing companies. It peaks every January to March, "
                          "so it is compared with the same quarter a year earlier. Results come out about three months after the quarter ends.")
    if item:
        out["capacity_util"] = item
    hist = [quarter_pt(k, v["cu_sa"]) for k, v in sorted(ob.items()) if v.get("cu_sa") is not None]
    item = _prev_item("capacity_util_sa", hist, "%", src_o, pub_url("obicus"), "the previous quarter",
                      "Seasonally adjusted by RBI (X-13 ARIMA-SEATS), so one quarter can be compared with the next. RBI publishes it from Q4 2022-23.")
    if item:
        out["capacity_util_sa"] = item

    bm = m["bop_month"]
    nri = [month_pt(k, v["nri_deposits"]) for k, v in sorted(bm.items()) if v.get("nri_deposits") is not None]
    item = _year_ago_item("nri_deposits", nri, "US$ bn", "RBI, Developments in India's balance of payments (monthly, from April 2026)",
                          RBI_PR_URL.format(latest["bop_month"]) if "bop_month" in latest else None,
                          "Net inflow into NRI deposit accounts. RBI's 5 June 2026 measures on NRI deposits drew US$ 119 bn in April to August 2026, against US$ 6 bn a year earlier. Monthly figures exist only for April to August of 2025 and 2026.")
    if item:
        out["nri_deposits"] = item
    return out



def ppac_items(by_id: dict) -> dict[str, dict]:
    """Indian basket crude from data/ppac_crude.json (written by scripts/ppac_crude.py),
    in US$ and, using the rupee's month-end reference rate, in rupees."""
    path = ROOT_DIR / "data" / "ppac_crude.json"
    if not path.exists():
        return {}
    d = json.loads(path.read_text())
    months = d.get("months") or {}
    if not months:
        return {}
    fetched = d.get("fetched_at", "")
    pts = []
    for k in sorted(months):
        y, m = int(k[:4]), int(k[5:7])
        pts.append((y, m, months[k]))
    note = ("Monthly average FOB price of the crude basket Indian refineries import (Brent Dated as the sweet grade, "
            "Oman and Dubai as the sour grade). PPAC does not publish monthly figures for 2022-23 on its site, so that year is a gap.")
    item = _monthly_item("crude_basket", pts, "US$ per barrel", d.get("source", "PPAC"), note)
    out = {}
    if item:
        item["source_url"] = d.get("source_url")
        item["mode"] = "ppac"
        last = sorted(months)[-1]
        if fetched[:7] == last:  # the current month is an average to date
            item["period"] += " (to date)"
            item["history"][-1]["label"] += " (to date)"
        out["crude_basket"] = item
    inr = {h["date"][:7]: h["value"] for h in (by_id.get("inr_usd") or {}).get("history", []) if h.get("value")}
    rpts = [(y, m, round(v * inr[f"{y}-{m:02d}"])) for y, m, v in pts if f"{y}-{m:02d}" in inr]
    ritem = _monthly_item("crude_basket_inr", rpts, "₹ per barrel", "PPAC Indian basket (US$) x RBI reference rate (month end)",
                          "Indian basket price in US$ multiplied by the rupee's month-end reference rate: what a barrel costs in rupees. "
                          "A weaker rupee raises it even when dollar prices are flat.")
    if ritem:
        ritem["mode"] = "ppac"
        out["crude_basket_inr"] = ritem
    return out



def real_rate_items(by_id: dict) -> dict[str, dict]:
    """Repo rate and 10-year G-sec yield minus CPI inflation, month by month.
    The rate is taken as it stood at each month's end."""
    cpi = [h for h in (by_id.get("cpi") or {}).get("history", []) if h.get("value") is not None]
    out = {}
    for ind_id, rate_id, name in (("real_repo", "repo", "policy repo rate"), ("real_gsec10", "gsec10", "10-year G-sec yield")):
        rates = sorted((h["date"], h["value"]) for h in (by_id.get(rate_id) or {}).get("history", []) if h.get("value") is not None)
        if not rates or not cpi:
            continue
        pts = []
        for h in cpi:
            prior = [v for d, v in rates if d <= h["date"]]
            if prior and h["date"] >= rates[0][0]:
                y, m = int(h["date"][:4]), int(h["date"][5:7])
                pts.append((y, m, round(prior[-1] - h["value"], 2)))
        item = _monthly_item(ind_id, pts, "%", f"Derived: RBI {name} minus MoSPI CPI inflation",
                             f"The {name} at each month's end minus CPI inflation for that month. Near zero or below means "
                             "borrowing is cheap once inflation is allowed for, so policy is not restraining demand.")
        if item:
            item["mode"] = "derived"
            out[ind_id] = item
    return out



def gst_items() -> dict[str, dict]:
    """Gross GST, and its domestic and import parts, from GSTN's monthly reports
    (data/gst_reports.json, written by scripts/gst_reports.py)."""
    path = ROOT_DIR / "data" / "gst_reports.json"
    if not path.exists():
        return {}
    months = json.loads(path.read_text()).get("months") or {}
    out = {}
    for key, field, label in (("gst_gross", "gross", "Gross GST"), ("gst_domestic", "domestic", "GST on domestic transactions"),
                              ("gst_imports", "imports", "GST on imports")):
        rows = sorted((k, v) for k, v in months.items() if v.get(field) is not None)
        if not rows:
            continue
        hist = []
        for k, v in rows:
            y, m = int(k[:4]), int(k[5:7])
            hist.append({"date": _month_end(y, m), "label": f"{MONTHS[m - 1][:3]} {y}", "short": f"{MONTHS[m - 1][:3]} {str(y)[2:]}",
                         "value": round(v[field] / 1e5, 4)})
        k, v = rows[-1]
        y, m = int(k[:4]), int(k[5:7])
        ya = round(v[field + "_year_ago"] / 1e5, 4) if v.get(field + "_year_ago") else None
        out[key] = {"id": key, "mode": "gstn", "value": hist[-1]["value"], "unit": "₹ lakh crore", "period": hist[-1]["label"],
                    "compare_value": ya, "compare_period": f"{MONTHS[m - 1][:3]} {y - 1}" if ya is not None else None,
                    "change": _change(hist[-1]["value"], ya), "source": "GSTN, monthly GST revenue report (provisional)",
                    "source_url": v.get("source_url"), "released": None, "history": hist,
                    "note": f"{label}, as reported by GSTN for the month (provisional). Compared with the same month a year earlier, "
                            "as stated in the same report, so both exclude compensation cess."}
    return out



def direct_tax_items() -> dict[str, dict]:
    """Annual direct tax series from data/direct_taxes.json (written by
    scripts/direct_taxes.py from CBDT's Time Series Data PDF)."""
    path = ROOT_DIR / "data" / "direct_taxes.json"
    if not path.exists():
        return {}
    d = json.loads(path.read_text())
    fy = d.get("fy") or {}
    src = f"CBDT, Income Tax Department Time Series Data (annual, to {d.get('covers_to')})"
    url = d.get("source_url")
    prov = [y for y, v in fy.items() if v.get("provisional")]
    prov_note = f" {', '.join(prov)} provisional." if prov else ""

    def fy_pt(y, v, prefix=""):
        y0 = int(y[:4])
        return {"date": f"{y0 + 1}-03-31", "label": f"{prefix}{y}", "short": f"{prefix}{y[2:]}", "value": v}

    def series(field, scale=1.0, nd=2):
        return [fy_pt(y, round(v[field] / scale, nd)) for y, v in sorted(fy.items()) if v.get(field) is not None]

    out = {}
    specs = [
        ("dt_net", series("net", 1e5), "₹ lakh crore",
         "Collections net of refunds: corporate tax, non-corporate tax and other direct taxes. CBDT publishes this series once a year." + prov_note),
        ("dt_corporate", series("corporate", 1e5), "₹ lakh crore",
         "Tax on company profits, net of refunds. Fell in 2019-20 after the September 2019 cut in the corporate tax rate." + prov_note),
        ("dt_noncorporate", series("non_corporate", 1e5), "₹ lakh crore",
         "Income tax paid by individuals, Hindu undivided families, firms, associations of persons and other non-company taxpayers, plus securities transaction tax." + prov_note),
        ("dt_gross", series("gross", 1e5), "₹ lakh crore",
         "Before refunds, by mode of payment (TDS, advance tax, self-assessment, regular assessment, other receipts). The gap to net collections roughly equals refunds paid, though the two come from different CBDT systems."),
        ("dt_gdp", series("dt_gdp", 1, 2), "% of GDP",
         "Net direct taxes as a share of GDP at current prices, using the GDP estimate CBDT cites from MoSPI for each year."),
        ("dt_share", series("direct_share", 1, 2), "% of total tax revenue",
         "Direct taxes as a share of the Centre's gross direct plus indirect tax collections (indirect taxes from CBIC)."),
        ("dt_buoyancy", series("buoyancy", 1, 2), "times nominal GDP growth",
         "Growth in direct tax collections divided by growth in nominal GDP. Above 1 means taxes grew faster than the economy. CBDT does not compute it for 2020-21, when both fell."),
        ("dt_cost", series("cost_pct", 1, 2), "% of collections",
         "The Income Tax Department's spending as a share of what it collects."),
    ]
    for key, hist, unit, note in specs:
        item = _year_ago_item(key, hist, unit, src, url, note)
        if item:
            item["mode"] = "cbdt"
            out[key] = item

    for key, table, prefix, note in (
        ("itr_filers", "return_filers", "",
         "Persons (by PAN) who filed at least one income-tax return during the financial year."),
        ("itr_filed", "returns_filed", "",
         "Returns filed during the financial year, including revised returns. Until 2017-18 a belated return for the previous year could also be filed, so 2018-19 dips."),
        ("taxpayers", "taxpayers_by_ay", "AY ",
         "By assessment year: persons who filed a return for the year, or had tax deducted at source in the relevant financial year without filing a return."),
    ):
        tot = (d.get(table) or {}).get("TOTAL") or {}
        hist = [fy_pt(y, round(v / 1e7, 2), prefix) for y, v in sorted(tot.items())]
        item = _year_ago_item(key, hist, "crore", src, url, note)
        if item:
            item["mode"] = "cbdt"
            out[key] = item

    # In-year releases: net collections from 1 April to the 'as on' date, against
    # the same date a year earlier (CBDT compares like with like).
    snaps = d.get("in_year") or []
    if snaps:
        def lab(iso):
            y, m, dd = iso.split("-")
            return f"{int(dd)} {MONTHS[int(m) - 1][:3]} {y}"
        sn = snaps[-1]
        cur, prev = sn["cur"]["net"]["total"] / 1e5, sn["prev"]["net"]["total"] / 1e5
        hist = [{"date": s["as_on"], "label": f"{s['fy']} to {lab(s['as_on'])}", "short": lab(s["as_on"]),
                 "value": round(s["cur"]["net"]["total"] / 1e5, 2)} for s in snaps]
        out["dt_ytd_net"] = {
            "id": "dt_ytd_net", "mode": "cbdt", "value": round(cur, 2), "unit": "₹ lakh crore",
            "period": f"{sn['fy']}, 1 April to {lab(sn['as_on'])}",
            "compare_value": round(prev, 2), "compare_period": f"{sn['prev']['fy']} to {lab(sn['prev']['as_on'])}",
            "change": round(cur - prev, 2),
            "source": "CBDT, Direct Tax Collections (provisional, from TINMIS)", "source_url": url, "released": None,
            "history": hist,
            "note": ("Collections from 1 April to the date shown, after refunds, as CBDT releases them during the year. Provisional. "
                     "Here securities transaction tax is shown on its own; in the annual series it is part of non-corporate tax. "
                     "Values are cumulative within each financial year, so compare only with the same date a year earlier."),
        }

    # The Direct taxes page reads the full tables (modes of payment, categories, states).
    (ROOT_DIR / "public" / "data" / "direct-taxes.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    return out


def merge_series(base: dict, other: dict, other_wins_ties: bool) -> dict:
    """Join two versions of one indicator: history by date, the newest reading on top.

    base is the long series (workbook); other is a newer or more precise source
    (manual sheet, RBI release). On the same date, other_wins_ties decides.
    """
    hist = {h["date"]: h for h in base.get("history", [])}
    for h in other.get("history", []):
        if h.get("value") is None:
            continue
        if h["date"] not in hist or other_wins_ties:
            hist[h["date"]] = {**h, "short": h.get("short") or _short_label(h["date"])}
    merged = [hist[d] for d in sorted(hist)]
    lb = base["history"][-1]["date"] if base.get("history") else ""
    lo = other["history"][-1]["date"] if other.get("history") else ""
    head = other if (lo > lb or (lo == lb and other_wins_ties)) else base
    item = {**base, "history": merged}
    for k in ("value", "unit", "period", "compare_value", "compare_period", "change", "released", "source", "source_url", "mode", "entered_by"):
        if k in head:
            item[k] = head[k]
    return item



def build(manual_path: Path, out_path: Path, offline_dir: Path | None = None, rbi_path: Path = DEFAULT_RBI) -> dict:
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
        for item in shape_gdp_extra(gdp_rows):
            live[item["id"]] = item
        if len(live) < 2:
            raise RuntimeError("MoSPI returned no usable rows for GDP or CPI")
    except Exception as exc:  # keep the board up with last good values
        status = {"status": "stale", "fetched_at": now, "message": f"MoSPI fetch failed: {exc}"}
        for k in ("gdp", "cpi"):
            if k not in live and k in previous:
                live[k] = {**previous[k], "stale": True}

    # Further MoSPI series. Each one falls back to its own last good copy, so a
    # failure in one never blanks the others or GDP and CPI.
    extra_failed = []
    if not offline_dir:
        try:
            s = _session()
        except Exception as exc:
            s, extra_failed = None, [f"session: {exc}"]
        for name, fetch, shape in (("WPI", fetch_wpi, shape_wpi), ("PLFS", fetch_unemployment, lambda r: [shape_unemployment(r)]),
                                   ("CPI rural/urban", fetch_cpi_sectors, lambda items: items),
                                   ("Core CPI", fetch_core_cpi, lambda items: items)):
            try:
                if s is None:
                    raise RuntimeError("no connection")
                items = [i for i in shape(fetch(s)) if i]
                if not items:
                    raise RuntimeError("no usable rows")
                for i in items:
                    live[i["id"]] = i
            except Exception as exc:
                extra_failed.append(f"{name}: {exc}")
    for k in ("wpi", "wpi_food", "unemployment", "cpi_rural", "cpi_urban", "cpi_core", "gdp_nominal", "gdp_deflator"):
        if k not in live and k in previous:
            live[k] = {**previous[k], "stale": bool(extra_failed)}
    if extra_failed:
        status["message"] = "; ".join(filter(None, [status.get("message"), "Some MoSPI series kept their last good copy: " + "; ".join(extra_failed)]))

    manual = shape_manual(manual_path)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import rbi_dbie
    rbi, rbi_status = rbi_dbie.load(rbi_path, manual_rows_by_id(manual_path))
    # Precedence: MoSPI live > RBI workbook (already merged with the sheet where
    # the sheet carries newer figures from the same release) > sheet alone.
    try:
        releases = rbi_release_items()
    except Exception as exc:  # a parse problem must not stop the board
        print(f"RBI releases skipped: {exc}")
        releases = {}
    try:
        releases.update(gst_items())
    except Exception as exc:
        print(f"GST reports skipped: {exc}")
    try:
        releases.update(direct_tax_items())
    except Exception as exc:
        print(f"Direct taxes skipped: {exc}")
    by_id = {**{i["id"]: i for i in manual}, **rbi, **releases, **live}
    # The division's workbook gives history for series otherwise typed in one
    # reading at a time. A newer (or same-date, more precise) manual reading
    # takes over the top; for the current account the workbook's latest-vintage
    # values win over the first estimates parsed from RBI releases.
    import econ_workbook
    try:
        workbook = econ_workbook.load()
    except Exception as exc:
        print(f"Workbook skipped: {exc}")
        workbook = {}
    for wid, witem in workbook.items():
        current = by_id.get(wid)
        if current is None:
            by_id[wid] = witem
        elif current.get("mode") == "manual" or wid.startswith("credit_") or wid == "gst_gross":
            # Newer readings (manual sheet, RBI's monthly sectoral release) take the top.
            by_id[wid] = merge_series(witem, current, other_wins_ties=True)
        else:
            by_id[wid] = merge_series(current, witem, other_wins_ties=True)
    # CPI before the 2024 base: published 2012-base inflation from the RBI file,
    # only for months before MoSPI's 2024-base series starts.
    if "cpi" in by_id and by_id["cpi"].get("history"):
        first = by_id["cpi"]["history"][0]["date"]
        back = [h for h in rbi_dbie.cpi_back_history(rbi_path) if h["date"] < first][-(rbi_dbie.HISTORY_MONTHS - len(by_id["cpi"]["history"])):]
        if back:
            by_id["cpi"] = {**by_id["cpi"], "history": back + by_id["cpi"]["history"],
                            "note": "From January 2026: MoSPI's CPI on the 2024 base. Earlier months: CPI inflation as published on the 2012 base (RBI DBIE). The two series agree within about 0.1 point where they overlap."}
    by_id.update(real_rate_items(by_id))
    try:
        by_id.update(ppac_items(by_id))
    except Exception as exc:
        print(f"PPAC crude skipped: {exc}")
    indicators = []
    for ind_id, meta in META.items():
        if ind_id in by_id:
            indicators.append({**meta, **by_id[ind_id]})

    # When did each indicator's latest reading first appear on the board? Kept
    # across builds, so the dashboard can list what is new. A reading that was
    # already there before this feature existed gets no date (not "new").
    for item in indicators:
        prev = previous.get(item["id"])
        if prev is None:
            item["updated_at"] = now
        elif prev.get("period") != item.get("period") or prev.get("value") != item.get("value"):
            item["updated_at"] = now
        else:
            item["updated_at"] = prev.get("updated_at")

    # How old is the RBI workbook's newest reading? The board warns when the
    # file has not been replaced with a fresh download for two weeks.
    rbi_latest = max((h["date"] for i in rbi.values() for h in i.get("history", [])
                      if i.get("mode") == "rbi" or i["id"] in ("fx_reserves", "repo")), default=None)
    if rbi_latest:
        rbi_status["latest_reading"] = rbi_latest
        rbi_status["age_days"] = (datetime.now(timezone.utc).date() - date.fromisoformat(rbi_latest)).days

    payload = {"generated_at": now, "sources": {"mospi": status, "rbi": rbi_status}, "indicators": indicators}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    write_csv(payload, out_path.with_suffix(".csv"))
    return payload


def write_csv(payload: dict, path: Path) -> None:
    """Every reading behind the board, one row per indicator and period."""
    with open(path, "w", newline="", encoding="utf-8-sig") as f:  # BOM so Excel shows ₹ correctly
        w = csv.writer(f)
        w.writerow(["indicator_id", "indicator", "theme", "period", "date", "value", "unit", "source"])
        for i in payload["indicators"]:
            for h in i.get("history", []):
                w.writerow([i["id"], i["label"], i["group"], h.get("label"), h.get("date"), h.get("value"), i["unit"], i["source"]])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manual", type=Path, default=DEFAULT_MANUAL)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--offline", type=Path, default=None, help="folder with mospi_gdp.json and mospi_cpi.json")
    a = ap.parse_args(argv)
    p = build(a.manual, a.out, a.offline)
    r = p["sources"]["rbi"]
    print(f'Wrote {len(p["indicators"])} indicators to {a.out} (MoSPI: {p["sources"]["mospi"]["status"]}, RBI workbook: {r["status"]})')
    for msg in r.get("skipped", []):
        print(f"  RBI series skipped: {msg}")
    return 0 if p["sources"]["mospi"]["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
