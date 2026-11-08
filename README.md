# E&F-II Dashboard (React)

A React 19 dashboard of India's top economic indicators for the Economics and Finance II Division. GDP growth and CPI inflation are pulled from MoSPI's official API; the other indicators come from a sheet the team updates after each official release.

## What's inside

| Path | What it does |
|---|---|
| `src/board/` | The board as React components: `EconomicBoard` (page shell and routes), `Rail`, `Ledger`, `Lead`, `Chip`, `TrendChart`, `Sparkline`, the pages in `pages/` (overview, theme, indicator, sources), plus `board.css` |
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

## Live MoSPI series

Pulled on every build from MoSPI's API (api.mospi.gov.in): real GDP growth (National Accounts, 2022-23 base), CPI inflation (2024 base; months before January 2026 use the published 2012-base figures from the RBI file), WPI inflation and WPI food inflation (2022-23 base, computed year on year from the index), and the PLFS monthly unemployment rate (age 15+, rural and urban, current weekly status). Each series falls back to its last good copy on its own if MoSPI fails.

## Downloading the data

Every build also writes `public/data/indicators.csv`: every reading behind the board, one row per indicator and period. The dashboard links to it as "Download all data (CSV)".

## Updating the RBI figures (one file)

Most money, rates and external-sector indicators come from RBI's Database on Indian Economy (DBIE), "Macro-economic Indicators" download, saved as `data/rbi/macro-indicators.xlsx`. To update them, download a fresh copy from https://data.rbi.org.in, replace that file on GitHub (Add file, Upload files, same name), and commit. The site rebuilds in about two minutes.

`scripts/rbi_dbie.py` finds each column by its header text, never by position. If RBI renames a column, that series is skipped and listed in the build log rather than filled with the wrong numbers.

Deliberately not used from that file: the IIP column (it splices the 2011-12 and 2022-23 bases without a marker), "Gross External Debt Position" (no unit, and it halves between Sep and Dec 2025), WPI and CPI on old bases, and the ready-made deposit ratios that stop in 2025.

Where the team sheet has a newer figure from the same release (for example Commerce's trade data a month ahead of RBI's table, or RBI's published credit growth), the sheet's figure is used for that month and the RBI file supplies the history.

## Updating the trade data (DGCI&S, HS 8-digit by country)

Three pages are built from DGCI&S data bank downloads (commodity at HS 8-digit by country, US$): Exports (`#/exports`), Imports (`#/imports`) and Trade balance by partner (`#/balance`). The raw .xls files are large and stay in Google Drive ("Export Data" and "Import Data"); only the summarised JSON in `public/data/trade/` is committed.

1. Download the slices from DGCI&S (each query is capped at 10,000 rows, so a year comes in many files) into one folder per flow.
2. Combine each flow into one long file. The last argument names the part year, so it is never mistaken for a full year:

   ```bash
   pip install xlrd
   python3 scripts/trade_combine.py path/to/export_xls exports.csv.gz "2026 Jan-Aug"
   python3 scripts/trade_combine.py path/to/import_xls imports.csv.gz "2026 Jan-Aug"
   ```
3. Build the page data (summary, one file per country, the top 300 products), once per flow:

   ```bash
   python3 scripts/build_trade.py exports.csv.gz exports
   python3 scripts/build_trade.py imports.csv.gz imports
   ```
4. Commit `public/data/trade/` and push. The site redeploys on its own.

Check the printed totals against RBI's monthly exports and imports before committing: they match RBI to the decimal for every full year.

Things to know when reading the pages:

- Part years are shown but never compared with full years.
- A calendar year with no files (currently 2024 imports) is shown as "awaiting", never as zero, and the year after it shows no change on the year before. Upload the year's files and rerun steps 2 to 4 to fill it.
- India revises 8-digit tariff lines from time to time (smartphones got their own code in 2022, gold jewellery was recoded in 2023, rice in 2025). The build flags those lines and the page shows "code revised" instead of a growth rate that would not be like for like.
- Imports are by country of consignment, so goods shipped through hubs such as the UAE, Singapore or Hong Kong are credited to the hub.

## Option A: add it to your existing FastAPI and React app

1. Copy `src/board/` into your frontend and render `<EconomicBoard source="/api/indicators" />` on whichever route you want.
2. The board uses address fragments (`#/indicator/gdp`) for its pages, so it will not clash with your app's router unless that router also uses `#` addresses.
3. Copy `scripts/`, `data/` and `backend/indicators_router.py` into your backend, then add `app.include_router(indicators_router)`.
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

## Reform Evidence Board (`reform.html`)

A second, separate board for the Governance and Reforms Division: outcome evidence for regulatory and governance reform. Once deployed it is at `<site>/reform.html`. It covers rule-making (regulator consultations), ease of living (public grievances), doing business (MSME registrations), governance scores, and justice and dispute resolution (courts, insolvency); the E&F-II Dashboard is unchanged. It complements the Samiksha portal (which tracks reform implementation) and does not duplicate it.

| Section | Source | How it updates |
|---|---|---|
| Governance scores | World Bank Worldwide Governance Indicators, API source 3 (`GOV_WGI_*.SC`, 0 to 100 scale from the 2025 methodology revision, with 90% intervals) | Automatic, daily check; the World Bank updates once a year |
| Courts | National Judicial Data Grid: district courts (`njdg_v3`) and High Courts (`hcnjdg_v2`) | Automatic, daily; each run adds a dated row to `data/reform/njdg-snapshots.csv`, so a pendency trend builds up |
| Insolvency | IBBI quarterly newsletter data annex (the `.xlsx` on ibbi.gov.in/publication), Tables 1, 2, 6 and 8 | Automatic; picks up each new quarter's file on its own |
| Jan Vishwas milestones | `data/reform/milestones.csv`, hand-kept, one official link per row (PRS, Gazette) | Add a row and push |
| Regulator consultations | The consultation and draft listing pages of SEBI, RBI, TRAI and IRDAI (latest 12 from each) | Automatic, daily; one regulator failing keeps its previous items |
| Public grievances | DARPG's CPGRAMS dashboard (`pgportal.gov.in/darpgdashboard`): received, disposed and pending by age, per ministry and per State/UT, year to date | Automatic, daily |
| MSME registrations | Ministry of MSME dashboard, state-wise Udyam registrations and Udyam Assist Platform enterprises | Automatic, daily; each run adds a row to `data/reform/msme-snapshots.csv` |

```bash
python3 scripts/build_reform.py              # all sources
python3 scripts/build_reform.py --only ibbi  # one source
npm run dev                                  # then open http://localhost:5173/reform.html
```

Things to know:

- **Text matching, not positions.** IBBI tables and NJDG figures are found by their labels. If a publisher changes a label, that source is marked stale on the page (with the last good figures kept) and the build log says what it could not find.
- **Checks built in.** NJDG civil plus criminal must equal the total; IBBI's printed recovery percentage must agree with its own amounts. A mismatch fails that source rather than showing a wrong figure.
- **IBBI percentages are IBBI's.** Recovery as a share of fair value is computed by IBBI over the cases where fair value was estimated (1,359 of them as on 30 June 2026), so the board shows IBBI's printed figures rather than dividing totals.
- **World Bank scores are perception-based.** The page says so, and marks a change as significant only when the 90% intervals do not overlap, as the World Bank recommends.
- **MSME dashboard certificate.** That server leaves out its intermediate certificate. The script fetches it from the issuer (GlobalSign) and verifies the full chain; certificate checking is never switched off.
- **Consultation status.** Only TRAI's list says whether a consultation is open, so only TRAI items carry an "Open for comments" tag. For SEBI, RBI and IRDAI the last date for comments is inside each paper.
- **Company incorporations (MCA)** are not included: MCA's website refuses automated reading, and the board respects that.
- **Not yet included:** Supreme Court pendency (its data grid is on a different host), the WJP Rule of Law Index (its site blocks automated reading; would need manual entry), and the Jan Vishwas decriminalisation register.
- **Network.** If you run the build in a restricted environment, it needs `api.worldbank.org`, `ibbi.gov.in`, `njdg.ecourts.gov.in`, `pgportal.gov.in`, `dashboard.msme.gov.in`, `secure.globalsign.com`, `www.sebi.gov.in`, `www.rbi.org.in`, `www.trai.gov.in` and `irdai.gov.in`. GitHub's runners are outside India; if NJDG ever refuses them, the board keeps the last good reading and shows it as stale.
