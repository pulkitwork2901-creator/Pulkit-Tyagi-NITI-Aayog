# E&F-II Economic Situation Board (React)

A React 19 dashboard of India's top economic indicators for the Economics and Finance II Division. GDP growth and CPI inflation are pulled from MoSPI's official API; the other indicators come from a sheet the team updates after each official release.

## What's inside

| Path | What it does |
|---|---|
| `src/board/` | The board as React components: `EconomicBoard`, `KpiStrip`, `MonitorTable`, `TrendChart`, `Sparkline`, plus `board.css` |
| `scripts/build_indicators.py` | Pulls GDP and CPI from MoSPI, merges the manual sheet, writes `public/data/indicators.json` |
| `data/manual-indicators.csv` | The team's sheet, one row per release |
| `backend/indicators_router.py` | Optional FastAPI route serving the same JSON at `/api/indicators` |
| `.github/workflows/refresh-and-deploy.yml` | Optional daily refresh and GitHub Pages deployment |
| `fixtures/` | MoSPI responses saved on 4 Nov 2026, for testing without network access |

No chart library is used; charts are plain SVG, so the only runtime dependencies are React and React DOM.

## Run it locally

```bash
npm install
pip install -r requirements.txt
python3 scripts/build_indicators.py      # pulls MoSPI and writes public/data/indicators.json
npm run dev                              # opens the board at http://localhost:5173
```

The repository ships with an `indicators.json` built from today's MoSPI figures, so `npm run dev` works even before the first live pull.

## Updating the manual figures

Add a new row to `data/manual-indicators.csv` for each new release. Keep the older rows: the board shows the latest row per indicator and uses the rest for trend lines.

| Column | Example | Notes |
|---|---|---|
| `id` | `gst_gross` | Must match an id in `META` inside `build_indicators.py` |
| `period` | `Nov 2026` | As shown on the board |
| `date` | `2026-11-30` | End of the period, used for ordering |
| `value` | `2.18` | Number only |
| `compare_value`, `compare_period` | `1.70`, `Nov 2025` | The comparison stated in the release (year ago, previous month, and so on) |
| `source`, `source_url`, `released` | | Shown in the monitor table |
| `entered_by` | `Priya` | Who added the row |

Then rerun `python3 scripts/build_indicators.py` (or push the change if you use the GitHub workflow, which rebuilds automatically).

## Option A: add it to your existing FastAPI and React app

1. Copy `src/board/` into your frontend and render `<EconomicBoard source="/api/indicators" />` on whichever route you want.
2. Copy `scripts/`, `data/` and `backend/indicators_router.py` into your backend, then add `app.include_router(indicators_router)`.
3. The route caches results for six hours. `POST /api/indicators/refresh` forces a fresh pull after someone edits the sheet.

The board reads the theme from `--eb-*` CSS variables, so you can match your app's colours by overriding them on `.eb`.

## Option B: host it free on GitHub Pages

Anyone can open the link in a browser with no login.

1. Push this folder to a GitHub repository.
2. In the repository settings, under Pages, set the source to GitHub Actions.
3. The workflow then runs daily at 18:00 IST and whenever the sheet changes: it pulls MoSPI, commits the refreshed JSON, builds the site and publishes it.

Note that a GitHub Pages site on a free account is public. Keep internal or pre-release figures out of the manual sheet if you use this option.

## Things to know

- The MoSPI fetch was written against MoSPI's published API specification and tested here against saved responses only, because this build environment cannot reach `api.mospi.gov.in`. Check the first live run's output.
- MoSPI's server needs an older TLS setting, which the script enables. Certificate checking stays on; set `MOSPI_INSECURE=1` only if your network breaks the certificate chain.
- If MoSPI is unreachable, the script keeps the last good GDP and CPI figures, marks them stale, and the board shows an amber status.
- IIP is manual because MoSPI's API still serves the old 2011-12 base while the official series moved to 2022-23 in June 2026.
- The rupee rate and 10-year G-sec yield in the sheet are market closes reported by Business Standard, not the FBIL reference rate.
