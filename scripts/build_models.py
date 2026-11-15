"""
Forecasts and relationships for the E&F-II Economic Monitor.

Writes public/data/models.json with three parts:

1. Short-term outlook. For a few monthly series with enough history (eight
   years or more), a small ARIMA or seasonal ARIMA model forecasts the next
   six months with an 80% range. Every model is tested first: it is re-fitted
   at each of the last 24 months as if standing there, and its errors are
   compared with a simple rule (no change for rates; same month last year,
   scaled by the latest annual growth, for seasonal values). A forecast is
   published only if the model beats the simple rule one and three months
   ahead; the others are listed with their test results so readers can see
   what was tried.

2. Relationships. For pairs with an economic reason to be linked (oil and
   inflation, the rupee and inflation, the repo rate and credit, and so on),
   the correlation at each lead or lag up to 12 months, on series made
   comparable (annual growth or annual change). Plus a correlation table for
   the main monthly series.

3. Tax elasticity. How much net direct taxes rise for a 1% rise in nominal
   GDP, from 25 years of CBDT data (log-log regression with a 95% interval),
   and a check of this year's CBDT in-year collections against what the
   elasticity and the latest nominal GDP growth would imply.

4. What drives CPI inflation: headline inflation split into the contributions
   of food and beverages, household fuel and everything else (core), from
   MoSPI's indices and basket weights (data/cpi_components.json, written by
   build_indicators.py), plus the latest inflation in each spending division.

These are statistical summaries, not official forecasts: they assume the
future behaves like the past few years, and correlation does not show cause.

Usage: python3 scripts/build_models.py
"""

from __future__ import annotations

import json
import math
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

warnings.simplefilter("ignore")  # statsmodels prints convergence chatter for every small model

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
INDICATORS = ROOT / "public" / "data" / "indicators.json"
RBI = ROOT / "data" / "rbi" / "macro-indicators.xlsx"
DIRECT = ROOT / "data" / "direct_taxes.json"
CPI_COMPONENTS = ROOT / "data" / "cpi_components.json"
OUT = ROOT / "public" / "data" / "models.json"

BACKTEST_ORIGINS = 24
FILLED: dict[str, list[str]] = {}  # months filled by interpolation, per series
HORIZON = 6


# ---------------------------------------------------------------- data

def load_monthly() -> dict[str, pd.Series]:
    """Monthly series by indicator id, the longest available: RBI's full
    history (the board keeps five years for charts) with the board's own
    newer readings on top; CPI joined across its 2012 and 2024 bases."""
    import rbi_dbie
    board = {i["id"]: i for i in json.loads(INDICATORS.read_text())["indicators"]}
    saved = rbi_dbie.HISTORY_MONTHS
    rbi_dbie.HISTORY_MONTHS = 100000
    try:
        full, _ = rbi_dbie.load(RBI, {})
    finally:
        rbi_dbie.HISTORY_MONTHS = saved

    def series(points):
        s = pd.Series({pd.Period(p["date"][:7], "M"): float(p["value"]) for p in points if p.get("value") is not None})
        return s.sort_index()

    out = {}
    for k, it in board.items():
        s = series(it.get("history", []))
        if k in full:  # the board's readings win; RBI's longer history fills earlier months
            s = s.combine_first(series(full[k]["history"]))
        out[k] = s.sort_index()
    # CPI: published 2012-base inflation before the 2024-base series starts.
    back = series(rbi_dbie.cpi_back_history(RBI))
    out["cpi"] = out["cpi"].combine_first(back).sort_index()
    # RBI's file of 2012-base CPI lacks single months (June 2019, June 2020); for
    # model fitting only, a gap of one month is filled half way between its neighbours.
    for k in ("cpi",):
        s = out[k]
        full_idx = pd.period_range(s.index[0], s.index[-1], freq="M")
        filled = s.reindex(full_idx)
        gaps = [str(p) for p in full_idx if p not in s.index]
        out[k] = filled.interpolate(limit=1)
        FILLED[k] = gaps
    return out


def is_monthly_regular(s: pd.Series) -> bool:
    return len(s) > 0 and (s.index[-1] - s.index[0]).n + 1 == len(s)


def last_regular(s: pd.Series) -> pd.Series:
    """The longest run of consecutive months ending at the latest reading."""
    s = s.dropna().sort_index()
    idx = list(s.index)
    start = len(idx) - 1
    while start > 0 and (idx[start] - idx[start - 1]).n == 1:
        start -= 1
    return s.iloc[start:]


# ---------------------------------------------------------------- forecasts

FORECASTS = [
    # id, title, unit, kind ("rate" = already a growth rate or level that is
    # not seasonal; "seasonal" = a monthly value with a calendar pattern)
    ("cpi", "CPI inflation", "% year on year", "rate"),
    ("cpi_core", "Core CPI inflation", "% year on year", "rate"),
    ("credit_nonfood", "Non-food bank credit growth", "% year on year", "rate"),
    ("deposit_growth", "Bank deposit growth", "% year on year", "rate"),
    ("m3_growth", "Broad money (M3) growth", "% year on year", "rate"),
    ("exports", "Merchandise exports", "US$ bn a month", "seasonal"),
    ("imports", "Merchandise imports", "US$ bn a month", "seasonal"),
    ("gst_gross", "Gross GST collections", "₹ lakh crore a month", "seasonal"),
    # Market prices and policy rates: tested and reported, not expected to beat no change.
    ("inr_usd", "Rupee per US dollar", "₹ per US$", "rate"),
    ("gsec10", "10-year G-sec yield", "%", "rate"),
]


def fit_rate(y: pd.Series, order):
    from statsmodels.tsa.arima.model import ARIMA
    trend = "c" if order[1] == 0 else "n"
    return ARIMA(y.values, order=order, trend=trend).fit()


def fit_seasonal(y: pd.Series, order):
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    return SARIMAX(np.log(y.values), order=order, seasonal_order=(0, 1, 1, 12)).fit(disp=False)


def choose_order(y: pd.Series, kind: str):
    """Smallest AIC over a deliberately small set of models."""
    best = None
    grid = [(p, d, q) for p in (0, 1, 2) for d in (0, 1) for q in (0, 1)] if kind == "rate" else \
           [(p, 1, q) for p in (0, 1) for q in (0, 1)]
    for order in grid:
        try:
            res = fit_rate(y, order) if kind == "rate" else fit_seasonal(y, order)
        except Exception:
            continue
        if not np.isfinite(res.aic):
            continue
        if best is None or res.aic < best[0]:
            best = (res.aic, order)
    return best[1] if best else ((1, 0, 0) if kind == "rate" else (0, 1, 1))


def forecast(y: pd.Series, kind: str, order, h: int):
    """Point forecast and 80% range, in the series' own units."""
    if kind == "rate":
        res = fit_rate(y, order)
        f = res.get_forecast(h)
        mean, ci = f.predicted_mean, f.conf_int(alpha=0.2)
        return np.asarray(mean), np.asarray(ci)[:, 0], np.asarray(ci)[:, 1]
    res = fit_seasonal(y, order)
    f = res.get_forecast(h)
    mean, ci = np.exp(f.predicted_mean), np.exp(f.conf_int(alpha=0.2))
    return np.asarray(mean), np.asarray(ci)[:, 0], np.asarray(ci)[:, 1]


def naive(y: pd.Series, kind: str, h: int) -> np.ndarray:
    """The simple rule a model must beat."""
    if kind == "rate":
        return np.repeat(y.iloc[-1], h)
    # Same month last year, scaled by growth over the latest 12 months.
    last12, prev12 = y.iloc[-12:].sum(), y.iloc[-24:-12].sum()
    g = last12 / prev12 if prev12 else 1.0
    return np.array([y.iloc[-12 + (i % 12)] * g for i in range(h)])


def backtest(y: pd.Series, kind: str, order, h: int = HORIZON):
    """Re-fit at each of the last BACKTEST_ORIGINS months and forecast ahead."""
    err_m = {k: [] for k in range(1, h + 1)}
    err_n = {k: [] for k in range(1, h + 1)}
    track = []  # what the model and the rule said, against what happened (1 and 3 months ahead)
    n = len(y)
    for cut in range(n - BACKTEST_ORIGINS - h, n - 1):
        train = y.iloc[:cut + 1]
        if len(train) < 36:
            continue
        try:
            m, _, _ = forecast(train, kind, order, h)
        except Exception:
            continue
        b = naive(train, kind, h)
        for k in range(1, h + 1):
            if cut + k < n:
                actual = y.iloc[cut + k]
                err_m[k].append(abs(m[k - 1] - actual))
                err_n[k].append(abs(b[k - 1] - actual))
                if k in (1, 3):
                    track.append({"h": k, "made": str(y.index[cut]), "month": str(y.index[cut + k]),
                                  "model": round(float(m[k - 1]), 3), "simple": round(float(b[k - 1]), 3),
                                  "actual": round(float(actual), 3)})
    out = {}
    for k in (1, 3, 6):
        if err_m[k]:
            mm, nn = float(np.mean(err_m[k])), float(np.mean(err_n[k]))
            out[str(k)] = {"model_mae": round(mm, 3), "simple_mae": round(nn, 3),
                           "skill_pct": round((1 - mm / nn) * 100, 1) if nn else None, "tests": len(err_m[k])}
    return out, track


def run_forecasts(monthly: dict[str, pd.Series]) -> tuple[list, list]:
    published, tested = [], []
    for sid, title, unit, kind in FORECASTS:
        y = last_regular(monthly.get(sid, pd.Series(dtype=float)))
        if len(y) < 60:
            tested.append({"id": sid, "title": title, "reason": f"only {len(y)} consecutive months; at least 60 needed"})
            continue
        order = choose_order(y, kind)
        bt, track = backtest(y, kind, order)
        mean, lo, hi = forecast(y, kind, order, HORIZON)
        months = [str(y.index[-1] + k) for k in range(1, HORIZON + 1)]
        beats = all((bt.get(k, {}).get("skill_pct") or -1) > 0 for k in ("1", "3"))
        entry = {
            "id": sid, "title": title, "unit": unit, "kind": kind,
            "model": (f"ARIMA{order}" if kind == "rate" else f"Seasonal ARIMA{order}(0,1,1)[12] on logs"),
            "fit_from": str(y.index[0]), "fit_to": str(y.index[-1]), "n": len(y),
            "history": [{"month": str(p), "value": round(float(v), 3)} for p, v in y.iloc[-36:].items()],
            "forecast": [{"month": mo, "value": round(float(a), 3), "low": round(float(b), 3), "high": round(float(c), 3)}
                         for mo, a, b, c in zip(months, mean, lo, hi)],
            "backtest": bt, "track": track, "beats_simple_rule": beats, "filled_months": FILLED.get(sid, []),
        }
        (published if beats else tested).append(entry)
        print(f"  {sid}: {entry['model']}, n={len(y)}, skill h1/h3/h6 = "
              f"{[bt.get(k, {}).get('skill_pct') for k in ('1', '3', '6')]} -> {'published' if beats else 'not published'}")
    return published, tested


# ---------------------------------------------------------------- relationships

def transforms(monthly: dict[str, pd.Series]) -> dict[str, tuple[pd.Series, str]]:
    """Series made comparable over time: growth or change on a year earlier."""
    m = monthly
    def yoy(s):
        s = last_regular(s)
        return (s / s.shift(12) - 1) * 100
    def yoy3(s):  # three-month sums, to smooth monthly noise
        s = last_regular(s).rolling(3).sum()
        return (s / s.shift(12) - 1) * 100
    def chg12(s):
        s = last_regular(s)
        return s - s.shift(12)
    t = {
        "cpi": (m["cpi"], "CPI inflation (% a year)"),
        "cpi_core": (m["cpi_core"], "Core CPI inflation (% a year)"),
        "infl_exp_1y": (m["infl_exp_1y"], "Households' expected inflation, a year ahead (%)"),
        "crude_yoy": (yoy(m["crude_basket"]), "Crude oil price, US$ (% change on a year)"),
        "inr_yoy": (yoy(m["inr_usd"]), "Rupee depreciation against the US$ (% on a year)"),
        "repo_chg": (chg12(m["repo"]), "Repo rate (change on a year, points)"),
        "gsec10": (m["gsec10"], "10-year G-sec yield (%)"),
        "credit": (m["credit_nonfood"], "Non-food bank credit growth (% a year)"),
        "deposit": (m["deposit_growth"], "Bank deposit growth (% a year)"),
        "m3": (m["m3_growth"], "Broad money growth (% a year)"),
        "exports_yoy": (yoy3(m["exports"]), "Merchandise exports, 3 months (% on a year)"),
        "imports_yoy": (yoy3(m["imports"]), "Merchandise imports, 3 months (% on a year)"),
        "gst_yoy": (yoy3(m["gst_gross"]), "Gross GST, 3 months (% on a year)"),
        "fpi": (last_regular(m["fpi_net"]).rolling(3).sum(), "Net portfolio inflows, 3 months (US$ bn)"),
        "inr_3m": ((last_regular(m["inr_usd"]) / last_regular(m["inr_usd"]).shift(3) - 1) * 100, "Rupee depreciation over 3 months (%)"),
    }
    return {k: (v.dropna(), label) for k, (v, label) in t.items()}


PAIRS = [
    # x, y, expected direction (+1 together, -1 opposite), why they might be linked, caution.
    # Positive lag = x moves first.
    ("crude_yoy", "cpi", 1, "Oil feeds into fuel, transport and input costs.",
     "PPAC publishes no monthly crude prices for 2022-23, so this rests on the months since then only."),
    ("inr_yoy", "cpi", 1, "A weaker rupee makes imports, including oil, dearer in rupees.", ""),
    ("repo_chg", "credit", -1, "Higher policy rates should, with a delay, slow bank lending.",
     "The link here is positive: RBI raised rates in 2022-24 just as lending recovered strongly after COVID. "
     "Both followed the same cycle; this does not mean that rate rises increase lending."),
    ("repo_chg", "cpi", -1, "Monetary policy is meant to act on inflation with a delay.",
     "RBI also sets the repo rate in response to inflation, so the two move in both directions at once; a simple correlation cannot separate them."),
    ("cpi", "infl_exp_1y", 1, "Do households' expectations follow the inflation they have seen?",
     "Expectations are surveyed every two months, so this uses those months only."),
    ("cpi", "gsec10", 1, "Bond investors ask for higher yields when inflation rises.", ""),
    ("imports_yoy", "exports_yoy", 1, "Much of what India exports uses imported inputs.",
     "Both also rise and fall with world prices, especially of oil, which India imports, refines and re-exports."),
    ("fpi", "inr_3m", -1, "Portfolio outflows tend to weaken the rupee.", ""),
    ("credit", "gst_yoy", 1, "Faster lending and faster spending tend to go together.", ""),
]


def xcorr(x: pd.Series, y: pd.Series, max_lag: int = 12):
    """Correlation of x at time t-lag with y at time t, for lags -max_lag..max_lag."""
    out = []
    for lag in range(-max_lag, max_lag + 1):
        a = pd.concat([x.shift(lag), y], axis=1).dropna()
        if len(a) >= 24:
            r = float(np.corrcoef(a.iloc[:, 0], a.iloc[:, 1])[0, 1])
            out.append({"lag": lag, "r": round(r, 3), "n": len(a)})
    return out


def run_relationships(monthly):
    t = transforms(monthly)
    pairs = []
    for xk, yk, expected, why, caution in PAIRS:
        x, y = t[xk][0].copy(), t[yk][0].copy()
        x.index, y.index = x.index.to_timestamp(), y.index.to_timestamp()
        cc = xcorr(x, y)
        if not cc:
            continue
        lead = [c for c in cc if c["lag"] >= 0]
        best = max(lead, key=lambda c: abs(c["r"]))
        same = next(c for c in cc if c["lag"] == 0)
        band = round(1.96 / math.sqrt(same["n"]), 3)
        # A clear link running the opposite way to economic expectation, in the
        # direction the pair is about (x first or same month), is flagged: it most
        # likely reflects a shared cycle, not the mechanism.
        unexpected = abs(best["r"]) >= band and (best["r"] > 0) != (expected > 0)
        both = pd.concat([x.rename("x"), y.rename("y")], axis=1)
        both = both[(both.index >= max(x.index[0], y.index[0]) - pd.DateOffset(months=12)) & (both.index <= max(x.index[-1], y.index[-1]))]
        series = [{"m": f"{i:%Y-%m}", "x": None if pd.isna(r.x) else round(float(r.x), 2), "y": None if pd.isna(r.y) else round(float(r.y), 2)}
                  for i, r in both.iterrows()]
        pairs.append({"x": xk, "y": yk, "x_label": t[xk][1], "y_label": t[yk][1], "why": why, "caution": caution, "expected": expected, "unexpected": unexpected, "series": series,
                      "same_month": same, "best_lead": best, "band95": band, "lags": cc,
                      "window": f"{max(x.index[0], y.index[0]):%b %Y} to {min(x.index[-1], y.index[-1]):%b %Y}"})
    # Correlation table on a common window.
    # Oil is left out: PPAC's missing 2022-23 months would shorten the common window
    # for every pair; it has its own card above.
    keys = ["cpi", "cpi_core", "inr_yoy", "repo_chg", "gsec10", "credit", "deposit", "m3", "exports_yoy", "imports_yoy", "gst_yoy"]
    frame = pd.concat({k: t[k][0] for k in keys}, axis=1).dropna()
    corr = frame.corr().round(2)
    table = {"keys": keys, "labels": [t[k][1] for k in keys], "r": corr.values.tolist(), "n": len(frame),
             "window": f"{frame.index[0]} to {frame.index[-1]}", "band95": round(1.96 / math.sqrt(len(frame)), 2)}
    return pairs, table


# ---------------------------------------------------------------- tax elasticity

def run_elasticity():
    import statsmodels.api as sm
    d = json.loads(DIRECT.read_text())
    fy = d["fy"]
    rows = [(y, v) for y, v in sorted(fy.items()) if v.get("gdp_current") and v.get("net")]
    out = []
    for key, label in (("net", "Net direct taxes"), ("corporate", "Corporate tax"), ("non_corporate", "Non-corporate tax (mainly personal income tax)")):
        for span, sel in (("2000-01 to " + rows[-1][0], rows), ("2014-15 to " + rows[-1][0], [r for r in rows if r[0] >= "2014-15"])):
            yv = np.log([r[1][key] for r in sel])
            xv = sm.add_constant(np.log([r[1]["gdp_current"] for r in sel]))
            res = sm.OLS(yv, xv).fit()
            b, (lo, hi) = res.params[1], res.conf_int(0.05)[1]
            out.append({"series": key, "label": label, "period": span, "elasticity": round(float(b), 2), "intercept": round(float(res.params[0]), 4),
                        "low": round(float(lo), 2), "high": round(float(hi), 2), "n": len(sel), "r2": round(float(res.rsquared), 3)})
    return out


def tax_history():
    """Collections and nominal GDP by financial year (₹ crore), for the chart."""
    fy = json.loads(DIRECT.read_text())["fy"]
    return [{"fy": y, "gdp": v["gdp_current"], "net": v["net"], "corporate": v["corporate"], "non_corporate": v["non_corporate"],
             "provisional": bool(v.get("provisional"))}
            for y, v in sorted(fy.items()) if v.get("gdp_current") and v.get("net")]


def run_tax_check(elasticity, monthly_board):
    """This year's CBDT in-year collections against what growth would imply.

    CBDT's annual 'non-corporate tax' includes Securities Transaction Tax, so
    the in-year non-corporate figure is taken with STT to match."""
    d = json.loads(DIRECT.read_text())
    snaps = d.get("in_year") or []
    if not snaps:
        return None
    sn = snaps[-1]
    cur, prev = sn["cur"], sn["prev"]
    def g(a, b):
        return round((a / b - 1) * 100, 1) if b else None
    parts = {
        "net": ("Net direct taxes", cur["net"]["total"], prev["net"]["total"]),
        "corporate": ("Corporate tax (net)", cur["net"]["ct"], prev["net"]["ct"]),
        "non_corporate": ("Non-corporate tax incl. STT (net)", cur["net"]["nct"] + cur["net"]["stt"], prev["net"]["nct"] + prev["net"]["stt"]),
    }
    gross_nc = g(cur["gross"]["nct"] + cur["gross"]["stt"], prev["gross"]["nct"] + prev["gross"]["stt"])
    # Nominal GDP growth so far in the same financial year (average of its quarters).
    gdp = monthly_board.get("gdp_nominal") or {}
    fy = sn["fy"]
    qs = [p for p in gdp.get("history", []) if p.get("label", "").endswith(fy)]
    if not qs:
        qs = gdp.get("history", [])[-1:]
    g_gdp = round(sum(p["value"] for p in qs) / len(qs), 1) if qs else None
    el = {(e["series"], e["period"][:7]): e for e in elasticity}
    rows = []
    for key, (label, a, b) in parts.items():
        e_long, e_recent = el.get((key, "2000-01")), el.get((key, "2014-15"))
        rows.append({"series": key, "label": label, "actual_growth": g(a, b), "cur": round(a), "prev": round(b),
                     "elasticity_long": e_long and {k: e_long[k] for k in ("elasticity", "low", "high", "period")},
                     "elasticity_recent": e_recent and {k: e_recent[k] for k in ("elasticity", "low", "high", "period")}})
    refunds = {"nct_cur": round(cur["refunds"]["nct"]), "nct_prev": round(prev["refunds"]["nct"]),
               "total_growth": g(cur["refunds"]["total"], prev["refunds"]["total"])}
    return {"as_on": sn["as_on"], "fy": fy, "prev_as_on": prev["as_on"], "source": sn.get("source"),
            "gdp_growth": g_gdp, "gdp_quarters": [p["label"] for p in qs], "rows": rows,
            "gross_non_corporate_growth": gross_nc, "refunds": refunds}


def run_cpi_contrib(monthly):
    """Headline CPI inflation split into the contributions (percentage points)
    of food and beverages, household fuel and everything else.

    For a fixed-weight index, general = sum of weight x component index, so
    contribution of a component = weight x (its index now - a year ago) /
    general index a year ago x 100, and the three contributions add up to
    headline inflation. Within one base only: the 2012 base to December 2025,
    the 2024 base from January 2026 (its 2025 indices give the year-ago values)."""
    if not CPI_COMPONENTS.exists():
        return None
    d = json.loads(CPI_COMPONENTS.read_text())
    out = {}
    for base in ("2012", "2024"):
        b = d.get("bases", {}).get(base)
        if not b:
            continue
        w = b["weights"]
        G, F, U = b["general"], b["food"], b["fuel"]
        for m in sorted(G):
            y0 = f"{int(m[:4]) - 1}{m[4:]}"
            if base == "2012" and m >= "2026-01":
                continue
            if not all(k in X for X in (G, F, U) for k in (m, y0)):
                continue
            head = (G[m] / G[y0] - 1) * 100
            food = w["food"] * (F[m] - F[y0]) / G[y0] * 100
            fuel = w["fuel"] * (U[m] - U[y0]) / G[y0] * 100
            out[m] = {"month": m, "base": base, "headline": round(head, 2), "food": round(food, 2), "fuel": round(fuel, 2),
                      "core": round(head - food - fuel, 2),
                      "food_infl": round((F[m] / F[y0] - 1) * 100, 2), "fuel_infl": round((U[m] / U[y0] - 1) * 100, 2)}
    rows = [out[k] for k in sorted(out)]
    if not rows:
        return None
    # Check against the published headline inflation (rounded indices make small gaps).
    pub = monthly.get("cpi", pd.Series(dtype=float))
    gaps = [abs(r["headline"] - float(pub[pd.Period(r["month"], "M")])) for r in rows if pd.Period(r["month"], "M") in pub.index]
    weights = {b: d["bases"][b]["weights"] for b in d.get("bases", {})}
    divs = d.get("divisions") or {}
    months = sorted(divs)
    divisions = None
    if months:
        latest = divs[months[-1]]
        before = {x["code"]: x["inflation"] for x in divs[months[-2]]} if len(months) > 1 else {}
        divisions = {"month": months[-1], "previous": months[-2] if len(months) > 1 else None,
                     "rows": [{**x, "prev": before.get(x["code"])} for x in latest]}
    return {"rows": rows, "weights": weights, "max_gap_vs_published": round(max(gaps), 2) if gaps else None,
            "divisions": divisions, "source": d.get("source"), "fetched_at": d.get("fetched_at")}


def main() -> int:
    monthly = load_monthly()
    print("Forecasts:")
    published, tested = run_forecasts(monthly)
    print("Relationships:")
    pairs, table = run_relationships(monthly)
    for p in pairs:
        print(f"  {p['x']} -> {p['y']}: same month r={p['same_month']['r']}, strongest when x leads by {p['best_lead']['lag']} months (r={p['best_lead']['r']}), n={p['same_month']['n']}")
    elasticity = run_elasticity()
    for e in elasticity:
        print(f"  elasticity {e['series']} {e['period']}: {e['elasticity']} ({e['low']} to {e['high']})")
    board = {i["id"]: i for i in json.loads(INDICATORS.read_text())["indicators"]}
    tax_check = run_tax_check(elasticity, board)
    if tax_check:
        print(f"  in-year taxes to {tax_check['as_on']}: GDP growth {tax_check['gdp_growth']}%, "
              + ", ".join(f"{r['series']} {r['actual_growth']}%" for r in tax_check["rows"]))
    cpi_contrib = run_cpi_contrib(monthly)
    if cpi_contrib:
        last = cpi_contrib["rows"][-1]
        print(f"  CPI {last['month']}: headline {last['headline']} = food {last['food']} + fuel {last['fuel']} + core {last['core']}; "
              f"largest gap vs published {cpi_contrib['max_gap_vs_published']}")
    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "forecasts": published, "tested_not_published": tested,
        "relationships": pairs, "correlation_table": table, "tax_elasticity": elasticity,
        "tax_history": tax_history(), "tax_check": tax_check, "cpi_contributions": cpi_contrib,
        "settings": {"backtest_origins": BACKTEST_ORIGINS, "horizon": HORIZON, "interval": "80%"},
    }, ensure_ascii=False, indent=1))
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(published)} forecasts published, {len(tested)} tested only")
    return 0


if __name__ == "__main__":
    sys.exit(main())
