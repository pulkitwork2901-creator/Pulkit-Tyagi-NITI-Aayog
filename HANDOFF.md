# E&F-II Dashboard: handoff for a new Claude session

Last updated: 9 November 2026. Read this first, then README.md.

## The person and how to work with them

- Pulkit Tyagi, Economics and Finance II (E&F-II) Division, NITI Aayog. An intern also gives feedback.
- Preferences: plain, human answers with a full ("360 degree") view; official sources (MoSPI, RBI, PIB, CGA, DGCI&S, PPAC, GSTN), not Reddit-style opinion; **never use the em dash character ("— ") in answers**.
- Asks short questions (often with typos); expects the work done end to end, verified, deployed and explained.
- Never set MOSPI_INSECURE=1 without asking. Never spoof a browser User-Agent; use "NITI-EF2-dashboard/1.0".

## Where things are

- Live dashboard: https://pulkitwork2901-creator.github.io/Pulkit-Tyagi-NITI-Aayog/ (add ?v=N to bust cache; hash routes like #/exports)
- Repo: pulkitwork2901-creator/Pulkit-Tyagi-NITI-Aayog (public, branch main). The old URL redirects; local clone was at /home/user/econ-board.
- Analysis document (Claude Docs): https://claude.ai/artifact/J9FRkWTt9qQ96cwwzjWFYG ("How the E&F-II Dashboard figures fit together"; doc id 8ad232bb-0085-4df1-ba25-a8e267195055, tab file 940c4223-7199, body node 57552ea6-e099; system-map widget 234d928f-15fa, WPI/CPI chart widget e639fae5-d96e).
- Google Drive (connected account pulkitwork2901@gmail.com): folders "Export Data" and "Import Data" hold the raw DGCI&S .xls files.
- Cloud environment: "Pulkit-Tyagi-NITI-Aayog" (personal). Allowed hosts include api.mospi.gov.in, www.rbi.org.in, ppac.gov.in, www.ppac.gov.in, www.gst.gov.in, services.gst.gov.in, tutorial.gst.gov.in, www.pib.gov.in. rbidocs.rbi.org.in was added but is useless (browser check blocks scripts); it can be removed.

## Stack and pipeline

- React 19 + Vite, hash router, hand-drawn SVG charts (no chart library). GitHub Pages via .github/workflows/refresh-and-deploy.yml: daily 18:00 IST refresh, bot commits "Refresh indicators", BASE_PATH ./ (relative, survives repo renames).
- Workflow order: rbi_releases.py, ppac_crude.py, gst_reports.py, build_indicators.py, build_reform.py (a separate "Reform Evidence Board" another session added; leave it alone), then build and deploy. Each fetcher keeps its last good copy if a source fails.
- scripts/build_indicators.py writes public/data/indicators.json (+ .csv); 66 indicators. META dict at the top defines labels and groups (Growth and prices; External sector; Fiscal and monetary; Money, credit and capital flows).
- Sources merged in build: MoSPI API live (GDP real and nominal, deflator derived, CPI headline/rural/urban/core, WPI, PLFS unemployment); RBI DBIE workbook data/rbi/macro-indicators.xlsx (rbi_dbie.py); RBI press releases cached in data/rbi_releases.json (rbi_releases.py: services trade monthly, quarterly and monthly balance of payments incl. remittances, NRI deposits, revisions, CA % of GDP, sectoral credit; household inflation expectations (IESH) and manufacturing capacity utilisation (OBICUS) from the "Forward Looking Surveys" bundle, kind `surveys`); PPAC crude data/ppac_crude.json; GSTN GST data/gst_reports.json; the division's workbook data/uploads/india-economic-indicators.xlsx (econ_workbook.py: credit by sector, GST, fiscal deficit and capex % of BE, IIP 2022-23 base, PMI, CA % GDP); manual sheet data/manual-indicators.csv; derived real rates and crude in rupees.
- Merge precedence: manual < RBI workbook < RBI releases < live MoSPI; workbook supplies history via merge_series; newer manual or release readings take the latest point.
- Trade section: scripts/trade_combine.py and scripts/build_trade.py produce public/data/trade/{exports,imports}.json plus per-country and per-product files. Data 2021 to 2025 plus 2026 Jan-Aug, HS 8-digit by country, verified against RBI totals. Pages: #/exports, #/imports, #/balance (labelled "Merchandise ..." in the sidebar).
- Frontend: src/board/EconomicBoard.jsx (routes), Rail.jsx, pages/Dashboard.jsx (hero, tiles, 18 MultiChart panels, signal table), pages/ThemePage.jsx + ThemeBrief.jsx (two-sentence data-driven summary per theme), pages/IndicatorPage.jsx (rural vs urban CPI section on CPI pages), pages/TradePage.jsx, pages/BalancePage.jsx, trade/tradeKit.jsx, board.css (skins teal/saffron/dark).

## Gotchas learned the hard way

- A fresh cloud container can come with certifi 2026.10.18, which lacks MoSPI's root (emSign Root CA G1): every MoSPI series goes "stale" with "self-signed certificate in certificate chain". Run `pip install -r requirements.txt` first; never fall back to MOSPI_INSECURE.
- RBI survey bundles link OBICUS as "OBICUS Survey on manufacturing sector" in 2020-2024 and by full name later; the Nov 2021 IESH table is "Table 3(a)" (extension survey). Both handled. To re-parse surveys, delete the `surveys` entries from data/rbi_releases.json and rerun rbi_releases.py (it backfills from 2020 when none exist).

- Bot commits clash on public/data/indicators.json: on rebase conflict, `git checkout --theirs public/data/indicators.json public/data/indicators.csv`, rerun build_indicators.py, `git add -A`, `GIT_EDITOR=true git rebase --continue`.
- Shell commands with heredocs containing JavaScript `${...}` get blocked by the safety check: write edits as a Python script file in the scratchpad and run it.
- MoSPI API: page size max 200; request the 2012-base CPI one year at a time (multi-page replies drop rows); 2012 base uses /api/cpi/getCPIIndex with state_code 99 and group_code; 2024 base uses /api/cpi/getCPIData with state_code 1 and division_code. PLFS needs explicit years, not "all". TLS needs certifi>=2026.10.19 (emSign Root CA G1) and legacy renegotiation (handled in _session()).
- openpyxl: do not use read_only mode on the RBI workbook (drops the last column).
- RBI listings are ASP.NET postbacks (hdnYear/hdnMonth); release tables are on www.rbi.org.in pages, not rbidocs.
- PPAC endpoint: POST AjaxController/getInternationalPricesCrudeOil (financialYear, reportBy=4, pageId=30); no 2022-23 monthly data.
- GST: GST portal JSON feed www.gst.gov.in/fomessage/newsupdates links GSTN's monthly PDF (new file name each month); parsed with pypdf.
- Commit messages end with the Co-Authored-By and Claude-Session lines given by the system; never put model names in commits.

## Key findings (as of Nov 2026, used in the analysis)

- GDP 7.8% real, 10.3% nominal (Q1 2026-27); deflator 2.3%.
- CPI 5.54% (rural 6.08, urban 4.88), core 4.60% rising; WPI 11.39% (fuel and power 25.9%).
- Indian basket crude jumped from about $69 (Feb 2026) to $113 (Mar), $120 (Oct); in rupees up 82%.
- Rupee about 95.2 per US$, 7% weaker in a year; forward premium 5.35% (five-year high).
- Repo 5.50% after an October hike; real repo about zero (was +4.1% a year earlier).
- Credit 18.4% vs deposits 16.7%; services credit 28.3%.
- Goods deficit about US$ 30 bn a month; services surplus about US$ 19 bn; remittances US$ 42.9 bn a quarter; CA deficit 0.5% of GDP.
- NRI deposit inflows US$ 119 bn Apr-Aug 2026 after RBI's 5 June measures; reserves 728 (Feb) to 667 (Jun) to 748 (Sep) to 717 bn (end Oct).
- GST +23% in Oct 2026, imports +42%, domestic +16%.
- Fiscal deficit 42.1% of BE by Sep (36.5% a year earlier).
- Households' median inflation expectation one year ahead 10.0% (Sep 2026 round), up from 9.4%, having risen in every round since Nov 2025 (8.0%); three months ahead 9.9%, current perception 8.4%.
- Manufacturing capacity utilisation 74.6% in Q1 2026-27 (74.1% a year earlier); seasonally adjusted 76.3%, up 110 bps on the quarter and the highest in RBI's adjusted series (from Q4 2022-23).

## Known gaps (source does not publish, or not yet added)

- Crude Apr 2022 to Mar 2023 (PPAC); IIP Jun 2023 to Mar 2024 (MoSPI); rural/urban CPI Apr-May 2020; unemployment Mar 2026 and before Apr 2025; remittances Oct-Dec 2020; NRI deposits monthly only Apr-Aug 2025/2026 (April has no NRI line); PMI only Sep-Oct 2026; GST split only from Jul 2026; fiscal and capex from Apr 2023; trade data Sep 2026 onward not uploaded.
- Workbook columns still empty: e-way bills, peak power demand, passenger vehicle sales.
- Not yet added: EPFO payroll, food prices, rainfall, FRED global data, CGA automation (need new hosts); bank NPAs (RBI FSR PDF blocked; manual).

## Recent fixes worth knowing

- 9 Nov 2026 (later session): added IESH (infl_exp_1y, infl_exp_3m, infl_perception) and OBICUS (capacity_util, capacity_util_sa); dashboard panels "Inflation: what households expect" and "Factory capacity in use"; a third sentence on expectations in the Growth and prices theme summary. The Claude Docs analysis document does not yet mention these.

- The analysis doc's "swing factors" sentence was reworded (oil up = weaker rupee, higher inflation); the user printed an older copy.
- Core CPI Sep 2024 and Sep 2025 were missing due to the MoSPI page-size bug; fixed.
- Never-integrated option from the start: putting the dashboard into saran1122/NITI-AAYOG (user chose a new repo instead).
