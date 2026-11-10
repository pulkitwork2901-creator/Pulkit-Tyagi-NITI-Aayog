# DGCI&S raw releases

Keep every source snapshot in its own dated or uniquely named directory:

```text
data/trade/raw/2026-11-10/
  metadata.json
  exports/*.xls
  imports/*.xls
```

`metadata.json` must include the exact period label and official totals in US
dollars. Do not overwrite an older release when DGCI&S revises a figure; add a
new directory instead.

Example:

```json
{
  "period": "2026 Jan-Aug",
  "official_totals": {
    "exports": {"2026 Jan-Aug": 278000000000},
    "imports": {"2026 Jan-Aug": 470000000000}
  }
}
```

The workflow runs `scripts/trade_pipeline.py` and publishes nothing unless both
flows reconcile to these official totals.
