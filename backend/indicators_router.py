"""
FastAPI route for the Economic Situation Board.

Add to your existing app:

    from backend.indicators_router import router as indicators_router
    app.include_router(indicators_router)

The React board then reads from /api/indicators instead of the static file.
Results are cached for CACHE_HOURS so MoSPI is not called on every page load.
"""

import json
import sys
import threading
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from build_indicators import DEFAULT_MANUAL, build  # noqa: E402

CACHE_HOURS = 6
OUT_FILE = ROOT / "public" / "data" / "indicators.json"

router = APIRouter(prefix="/api", tags=["indicators"])
_lock = threading.Lock()
_cache = {"at": 0.0, "payload": None}


def _refresh(force: bool = False) -> dict:
    with _lock:
        fresh = time.time() - _cache["at"] < CACHE_HOURS * 3600
        if _cache["payload"] is not None and fresh and not force:
            return _cache["payload"]
        payload = build(DEFAULT_MANUAL, OUT_FILE)
        _cache.update(at=time.time(), payload=payload)
        return payload


@router.get("/indicators")
def get_indicators():
    try:
        return _refresh()
    except Exception as exc:
        if OUT_FILE.exists():
            return json.loads(OUT_FILE.read_text())
        raise HTTPException(status_code=503, detail=f"Indicators unavailable: {exc}") from exc


@router.post("/indicators/refresh")
def refresh_indicators():
    """Force a fresh pull, e.g. right after updating the manual sheet."""
    return _refresh(force=True)
