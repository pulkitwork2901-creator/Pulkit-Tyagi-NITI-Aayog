"""Validate, combine and build one dated DGCI&S release.

Release layout:
    data/trade/raw/YYYY-MM-DD-or-release-name/
        metadata.json
        exports/*.xls
        imports/*.xls

metadata.json must contain a non-guessed period label and official totals:
{
  "period": "2026 Jan-Aug",
  "official_totals": {
    "exports": {"2026": 123456789000},
    "imports": {"2026": 234567890000}
  }
}

The official totals are in US dollars and may contain full-year or partial-year
periods. The current published JSON is replaced only after both flows reconcile.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "trade" / "raw"
PUBLIC = ROOT / "public" / "data" / "trade"
FLOWS = ("exports", "imports")


def fail(message: str) -> None:
    raise SystemExit(f"trade validation failed: {message}")


def choose_release(name: str | None) -> Path | None:
    if name:
        release = (RAW / name).resolve()
        if RAW.resolve() not in release.parents:
            fail("release must be inside data/trade/raw")
        return release
    releases = sorted(p for p in RAW.iterdir() if p.is_dir() and p.name != ".gitkeep")
    if not releases:
        return None
    return releases[-1]


def read_metadata(release: Path, period_override: str | None) -> tuple[str, dict]:
    path = release / "metadata.json"
    if not path.is_file():
        fail(f"{path} is missing")
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"{path} is not valid JSON: {exc}")
    period = period_override or metadata.get("period")
    if not isinstance(period, str) or not period.strip():
        fail("metadata.json must provide a non-empty period, or --period must be supplied")
    totals = metadata.get("official_totals")
    if not isinstance(totals, dict):
        fail("metadata.json must provide official_totals for exports and imports")
    return period.strip(), totals


def total_rows(path: Path) -> dict[str, float]:
    totals: dict[str, float] = {}
    with gzip.open(path, "rt", encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            period = row["period"]
            totals[period] = totals.get(period, 0.0) + float(row["value_usd"] or 0)
    if not totals:
        fail(f"{path.name} contains no data rows")
    return totals


def check_totals(flow: str, actual_path: Path, expected: object) -> None:
    if not isinstance(expected, dict) or not expected:
        fail(f"official_totals.{flow} must contain at least one period")
    actual = total_rows(actual_path)
    for period, value in expected.items():
        try:
            expected_value = float(value)
        except (TypeError, ValueError):
            fail(f"official_totals.{flow}.{period} is not numeric")
        if expected_value <= 0:
            fail(f"official_totals.{flow}.{period} must be positive")
        if period not in actual:
            fail(f"{flow} has no combined rows for official period {period}")
        difference = abs(actual[period] - expected_value)
        tolerance = max(1.0, expected_value * 0.0005)
        if difference > tolerance:
            fail(
                f"{flow} {period} total {actual[period]:.2f} differs from official "
                f"{expected_value:.2f} by {difference:.2f}"
            )
    print(f"{flow}: reconciled {len(expected)} official period total(s)")


def run() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--release-dir", help="directory name under data/trade/raw")
    parser.add_argument("--period", help="explicit period label; otherwise metadata.json is required")
    args = parser.parse_args()

    release = choose_release(args.release_dir)
    if release is None:
        print("No DGCI&S release found; keeping existing trade JSON")
        return 0
    period, official_totals = read_metadata(release, args.period)
    with tempfile.TemporaryDirectory(prefix="trade-build-", dir=ROOT) as temp:
        work = Path(temp)
        outputs = work / "public" / "data" / "trade"
        outputs.mkdir(parents=True)
        combined = {}
        for flow in FLOWS:
            raw_dir = release / flow
            if not raw_dir.is_dir():
                fail(f"missing {raw_dir}")
            combined_path = work / f"{flow}.csv.gz"
            subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "trade_combine.py"),
                 str(raw_dir), str(combined_path), period],
                check=True,
            )
            combined[flow] = combined_path
            check_totals(flow, combined_path, official_totals.get(flow))
            subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "build_trade.py"),
                 str(combined_path), flow, str(outputs)],
                check=True,
            )
        if PUBLIC.exists():
            shutil.copytree(PUBLIC, work / "old-trade")
        staged = PUBLIC.with_name("trade.staged")
        if staged.exists():
            shutil.rmtree(staged)
        shutil.copytree(outputs, staged)
        if PUBLIC.exists():
            shutil.rmtree(PUBLIC)
        staged.rename(PUBLIC)
    print(f"published validated DGCI&S release {release.name} ({period})")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
