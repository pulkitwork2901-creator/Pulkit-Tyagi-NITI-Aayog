import { useState } from 'react';
import Chip from '../Chip.jsx';
import Lead from '../Lead.jsx';
import Sparkline from '../Sparkline.jsx';
import MultiChart, { sinceRange } from '../dashboard/MultiChart.jsx';
import SignalTable from '../dashboard/SignalTable.jsx';
import Icon from '../dashboard/Icon.jsx';
import { useCountUp } from '../dashboard/motion.js';
import { money, useTradeFile } from '../trade/tradeKit.jsx';
import { formatDateTime, formatValue, signed, tipFor } from '../format.js';

// The one-screen dashboard: headline tiles, six themed panels on a shared time
// range, and every indicator in a signal table underneath. Theme and indicator
// pages remain for detail.

const RANGES = [['1Y', 1], ['3Y', 3], ['5Y', 5]];
const TILES = ['gdp', 'cpi', 'wpi', 'repo', 'unemployment', 'credit_nonfood'];
const SHORT = { dt_net: 'Net direct taxes', dt_gdp: 'Direct tax to GDP', itr_filers: 'Return filers', infl_exp_1y: 'Household expectations', capacity_util_sa: 'Capacity use', capacity_util: 'Capacity use', crude_basket: 'Indian basket', real_repo: 'Real repo rate', cpi_rural: 'Rural CPI', iip: 'IIP', credit_services: 'Credit to services', fiscal_deficit: 'Fiscal deficit', services_net: 'Services surplus', ca_usd: 'Current account', remittances: 'Remittances', gdp: 'GDP', cpi: 'CPI', gsec10: '10-yr G-sec', credit_nonfood: 'Credit', trade_balance: 'Trade balance', fdi_net: 'Net FDI', unemployment: 'Unemployment', fx_reserves: 'Reserves', inr_usd: '₹ per US$' };
const S1 = 'var(--eb-s1)';
const S2 = 'var(--eb-s2)';
const S3 = 'var(--eb-s3)';
const pct = (d) => (v) => `${signed(formatValue(v, d))}%`;
const bn = (v) => `${signed(formatValue(v, 1))} bn`;
const lakhCr = (v) => `₹${formatValue(v, 1)} lakh cr`;

const NEW_DAYS = 10;
const TILE_LABEL = { gdp: 'Real GDP growth', cpi: 'CPI inflation', wpi: 'WPI inflation', repo: 'Repo rate', unemployment: 'Unemployment', credit_nonfood: 'Bank credit growth' };
const TILE_ICON = { gdp: 'growth', cpi: 'prices', wpi: 'wholesale', repo: 'rates', unemployment: 'jobs', credit_nonfood: 'credit' };

function CountUp({ value, decimals }) {
  const v = useCountUp(value);
  return <>{signed(formatValue(v, decimals))}</>;
}

// Faint rising chart drawn behind the header text: decoration only.
function HeroArt() {
  const pts = [[0, 150], [60, 128], [120, 136], [180, 104], [240, 112], [300, 78], [360, 86], [420, 52], [472, 40]];
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('');
  return (
    <svg className="eb-hero-art" viewBox="0 0 480 180" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {[30, 70, 110, 150].map((y) => <line key={y} x1="0" x2="480" y1={y} y2={y} />)}
      <path d={`${d}L480,180L0,180Z`} className="eb-hero-area" />
      <path d={d} className="eb-hero-line" />
      {pts.slice(-1).map(([x, y]) => <circle key={x} cx={x - 8} cy={y + 2} r="5" />)}
    </svg>
  );
}

// Entry card to the trade section, with the latest full-year headline.
function TradeCard({ base }) {
  const { data: x } = useTradeFile(`${base}exports.json`);
  const { data: m } = useTradeFile(`${base}imports.json`);
  const yr = x && m ? [...x.periods].reverse().find((p) => p.length === 4 && !(x.missing || []).includes(p) && !(m.missing || []).includes(p)) : null;
  const X = yr ? x.total[x.periods.indexOf(yr)] : null;
  const M = yr ? m.total[m.periods.indexOf(yr)] : null;
  return (
    <section className="eb-xcard" aria-labelledby="eb-xcard-t">
      <span className="eb-xcard-icon" aria-hidden="true"><Icon name="trade" size={24} /></span>
      <span>
        <span className="eb-xcard-kicker">Merchandise trade · DGCI&amp;S, HS 8-digit by country</span>
        <span className="eb-xcard-title" id="eb-xcard-t">Merchandise exports, imports and balance by partner</span>
        <span className="eb-xcard-text">
          {yr ? `${yr}: exports ${money(X)}, imports ${money(M)}, deficit ${money(M - X)}. Every partner country and the top 300 products each way.`
            : 'Every partner country and the top 300 products each way, 2021 to 2026.'}
        </span>
      </span>
      <span className="eb-xcard-links">
        <a className="eb-xcard-go" href="#/exports">Exports →</a>
        <a className="eb-xcard-go" href="#/imports">Imports →</a>
        <a className="eb-xcard-go" href="#/balance">Balance →</a>
      </span>
    </section>
  );
}

// Indicators whose latest reading reached the board in the last NEW_DAYS days.
function WhatsNew({ indicators, now }) {
  const [all, setAll] = useState(false);
  const fresh = indicators
    .filter((i) => i.updated_at && now - Date.parse(i.updated_at) < NEW_DAYS * 86400000)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return (
    <section className="eb-new" aria-labelledby="eb-new-h">
      <h2 className="eb-new-h" id="eb-new-h">New on the board <span>last {NEW_DAYS} days</span></h2>
      {fresh.length === 0 ? (
        <p className="eb-new-none">No new releases in the last {NEW_DAYS} days. Figures refresh daily at 6 pm IST.</p>
      ) : (
        <ul>
          {fresh.slice(0, all ? fresh.length : 4).map((i) => (
            <li key={i.id}>
              <a href={`#/indicator/${i.id}`}>{i.label}</a>
              {' '}
              <b>{signed(formatValue(i.value, i.decimals))}{i.unit.startsWith('%') ? '%' : ` ${i.unit}`}</b>
              {' '}
              <span className="eb-new-period">{i.period}</span>
              <Chip item={i} />
            </li>
          ))}
          {fresh.length > 4 && (
            <li className="eb-new-more"><button type="button" className="eb-linkbtn" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${fresh.length} new releases`}</button></li>
          )}
        </ul>
      )}
    </section>
  );
}

// Dashboard categories: same names and order as the sidebar themes.
const CATEGORY_NAV = [
  ['cat-growth', 'Growth and jobs'], ['cat-prices', 'Prices and inflation'], ['cat-rates', 'Interest rates and monetary policy'],
  ['cat-banking', 'Banking and credit'], ['cat-fiscal', 'Government finances'], ['cat-trade', 'Trade and current account'],
  ['cat-flows', 'Capital flows, reserves and the rupee'],
];

function CategoryNav() {
  const go = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav className="eb-cat-nav eb-noprint" aria-label="Jump to a category">
      {CATEGORY_NAV.map(([id, label]) => <a key={id} href="#/" onClick={(e) => go(e, id)}>{label}</a>)}
    </nav>
  );
}

function Category({ id, title, icon, blurb, count, links, children }) {
  return (
    <section className="eb-cat" id={id} aria-labelledby={`${id}-h`}>
      <div className="eb-cat-head">
        <span className="eb-cat-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
        <div className="eb-cat-text">
          <h3 className="eb-cat-title" id={`${id}-h`}>{title}</h3>
          <p className="eb-cat-blurb">{blurb}{count ? ` ${count} indicators.` : ''}</p>
        </div>
        {links}
      </div>
      {children}
    </section>
  );
}

function readRange() {
  try { return Number(localStorage.getItem('eb-range')) || 3; } catch { return 3; }
}

function Tile({ item, start }) {
  const pts = sinceRange(item.history, start);
  return (
    <li className="eb-tile">
      <a className="eb-tile-link" href={`#/indicator/${item.id}`}>
        <span className="eb-tile-label">{TILE_ICON[item.id] && <span className="eb-tile-icon"><Icon name={TILE_ICON[item.id]} size={15} /></span>}{TILE_LABEL[item.id] || item.label}</span>
        <span className="eb-tile-value"><CountUp value={item.value} decimals={item.decimals} /><span className="eb-tile-unit">{item.unit}</span></span>
      </a>
      <span className="eb-tile-change"><Chip item={item} /></span>
      {pts.length > 1 && (
        <Sparkline points={pts} kind={item.id === 'gdp' ? 'bar' : 'line'} height={34}
          formatTip={tipFor(item)} label={`${item.label} trend`} />
      )}
      <span className="eb-tile-period">{item.period}{item.compare_period ? ` · vs ${item.compare_period}` : ''}</span>
    </li>
  );
}

export default function Dashboard({ data, title, byId, groups, csvUrl, tradeBase }) {
  const [years, setYears] = useState(readRange);
  const choose = (n) => {
    setYears(n);
    try { localStorage.setItem('eb-range', String(n)); } catch { /* private window: keep in memory only */ }
  };
  const latest = Math.max(...(data.indicators || []).flatMap((i) => (i.history || []).map((p) => (p.date ? Date.parse(p.date) : 0))));
  const start = latest - years * 365.25 * 86400000;
  // Annual series (direct taxes) always show about ten financial years, whatever the range.
  const annualStart = Math.min(start, latest - 12 * 365.25 * 86400000);
  const h = (id) => byId[id]?.history || [];
  const has = (...ids) => ids.some((id) => byId[id]);
  const countOf = (g) => (data.indicators || []).filter((i) => i.group === g).length;
  const head = (id) => byId[id] && { value: (byId[id].unit.startsWith('%') ? `${signed(formatValue(byId[id].value, byId[id].decimals))}%` : byId[id].unit.startsWith('US$ bn') ? `US$ ${signed(formatValue(byId[id].value, 1))} bn` : byId[id].unit === 'US$ per barrel' ? `$${formatValue(byId[id].value, 1)}` : byId[id].unit.startsWith('₹ per US$') ? `₹${formatValue(byId[id].value, 2)}` : byId[id].unit === '₹ lakh crore' ? `₹${formatValue(byId[id].value, 2)} lakh cr` : `${signed(formatValue(byId[id].value, byId[id].decimals))} ${byId[id].unit}`), sub: `${SHORT[id] || byId[id].label} · ${byId[id].period.replace(/^(Week|Fortnight) to /, '')}` };

  return (
    <div className="eb-dash">
      <header className="eb-hero">
        <HeroArt />
        <div className="eb-hero-top">
          <div>
            <p className="eb-hero-kicker">NITI Aayog · Economics and Finance II Division</p>
            <h1>{title}</h1>
            <p className="eb-hero-asof">Position as on {formatDateTime(data.generated_at)}</p>
          </div>
          <div className="eb-range" role="group" aria-label="Time range for all charts">
            {RANGES.map(([label, n]) => (
              <button key={label} type="button" aria-pressed={years === n} onClick={() => choose(n)}>{label}</button>
            ))}
          </div>
        </div>
        <Lead byId={byId} />
      </header>

      <h2 className="eb-eyebrow" id="eb-tiles-h">Headline indicators</h2>
      <ul className="eb-tiles" aria-labelledby="eb-tiles-h">
        {TILES.map((id) => byId[id] && <Tile key={id} item={byId[id]} start={start} />)}
      </ul>

      <WhatsNew indicators={data.indicators || []} now={Date.parse(data.generated_at)} />

      <h2 className="eb-eyebrow" id="eb-panels-h">By category</h2>
      <CategoryNav />
      <Category id="cat-growth" title="Growth and jobs" icon="growth" blurb="How fast the economy and industry are growing, how busy factories are, and how many people are out of work." count={countOf('Growth and jobs')}
        links={<span className="eb-cat-links"><a className="eb-more" href="#/theme/growth-and-jobs">All indicators</a></span>}>
        <div className="eb-panels eb-panels-2">
        {has('gdp') && (
          <MultiChart title="Growth, real and nominal" icon="growth" headline={head('gdp')} note="% year on year, by quarter. Deflator: the inflation that turns real into nominal growth. MoSPI." kind="bar" start={start} fmt={pct(1)}
            series={[
              { key: 'gdp', label: 'Real GDP', color: S1, points: h('gdp') },
              { key: 'gdp_nominal', label: 'Nominal GDP', color: S2, points: h('gdp_nominal') },
              { key: 'gdp_deflator', label: 'Deflator', color: S3, points: h('gdp_deflator') },
            ]} />
        )}
        {has('iip') && (
          <MultiChart title="Industrial output" icon="wholesale" headline={head('iip')} note="IIP, % year on year, base 2022-23. MoSPI has not published June 2023 to March 2024 on this base. MoSPI." kind="bar" start={start} fmt={pct(1)}
            series={[{ key: 'iip', label: 'IIP growth', color: S1, points: h('iip') }]} />
        )}
        {has('capacity_util') && (
          <MultiChart title="Factory capacity in use" icon="wholesale" headline={head('capacity_util_sa') || head('capacity_util')} note="Capacity utilisation in manufacturing, %, by quarter, about 1,000 companies. The unadjusted figure peaks every January to March. RBI OBICUS." start={start} fmt={pct(1)}
            series={[
              { key: 'capacity_util', label: 'As reported', color: S1, points: h('capacity_util') },
              { key: 'capacity_util_sa', label: 'Seasonally adjusted', color: S2, points: h('capacity_util_sa') },
            ]} />
        )}
        {has('unemployment') && (
          <MultiChart title="Jobs" icon="jobs" headline={head('unemployment')} note="Unemployment rate, % of labour force, age 15+, monthly. MoSPI PLFS." start={start} fmt={pct(1)}
            series={[{ key: 'unemployment', label: 'Unemployment rate', color: S1, points: h('unemployment') }]} />
        )}
        </div>
      </Category>
      <Category id="cat-prices" title="Prices and inflation" icon="prices" blurb="Retail and wholesale inflation, what households expect, and the oil price behind much of it." count={countOf('Prices and inflation')}
        links={<span className="eb-cat-links"><a className="eb-more" href="#/theme/prices-and-inflation">All indicators</a></span>}>
        <div className="eb-panels eb-panels-2">
        {has('cpi') && (
          <MultiChart title="Inflation" icon="prices" headline={head('cpi')} note="% year on year. Core excludes food and household fuel (computed from MoSPI indices and weights). Shaded: RBI's 2 to 6% band. MoSPI." start={start} fmt={pct(2)}
            band={{ lo: 2, hi: 6, label: '2–6% band' }}
            series={[
              { key: 'cpi', label: 'CPI', color: S1, points: h('cpi') },
              { key: 'cpi_core', label: 'Core CPI', color: S2, points: h('cpi_core') },
              { key: 'wpi', label: 'WPI', color: S3, points: h('wpi') },
            ]} />
        )}
        {has('infl_exp_1y', 'cpi') && (
          <MultiChart title="Inflation: what households expect" icon="prices" headline={head('infl_exp_1y')} note="Median % from RBI's bi-monthly survey of urban households in 19 cities, against measured CPI inflation. Households' numbers run above CPI; their direction is the signal. RBI, MoSPI." start={start} fmt={pct(1)}
            series={[
              { key: 'infl_exp_1y', label: 'Expected, a year ahead', color: S1, points: h('infl_exp_1y') },
              { key: 'infl_perception', label: 'Perceived now', color: S2, points: h('infl_perception') },
              { key: 'cpi', label: 'CPI inflation', color: S3, points: h('cpi') },
            ]} />
        )}
        {has('cpi_rural', 'cpi_urban') && (
          <MultiChart title="Rural and urban inflation" icon="prices" headline={head('cpi_rural')} note="CPI, % year on year, All India. 2024 base from January 2026, 2012 base before. MoSPI." start={start} fmt={pct(2)}
            series={[
              { key: 'cpi_rural', label: 'Rural', color: S1, points: h('cpi_rural') },
              { key: 'cpi_urban', label: 'Urban', color: S2, points: h('cpi_urban') },
            ]} />
        )}
        {has('crude_basket') && (
          <MultiChart title="Oil price" icon="wholesale" headline={head('crude_basket')} note="Indian basket crude, US$ a barrel, monthly average (latest month to date). PPAC publishes no monthly figures for 2022-23. PPAC." start={start} fmt={(v) => '$' + formatValue(v, 0)}
            series={[{ key: 'crude_basket', label: 'Indian basket crude', color: S1, points: h('crude_basket') }]} />
        )}
        </div>
      </Category>
      <Category id="cat-rates" title="Interest rates and monetary policy" icon="rates" blurb="RBI's policy rate, market interest rates, and what they are worth after inflation." count={countOf('Interest rates and monetary policy')}
        links={<span className="eb-cat-links"><a className="eb-more" href="#/theme/interest-rates-and-monetary-policy">All indicators</a></span>}>
        <div className="eb-panels eb-panels-2">
        {has('tbill_91', 'gsec10') && (
          <MultiChart title="Interest rates" icon="rates" headline={head('gsec10')} note="%, month end. RBI DBIE (G-sec: FBIL)." start={start} fmt={pct(2)}
            series={[
              { key: 'tbill_91', label: '91-day T-bill', color: S1, points: h('tbill_91') },
              { key: 'repo', label: 'Repo rate', color: S2, points: h('repo') },
              { key: 'gsec10', label: '10-year G-sec', color: S3, points: h('gsec10') },
            ]} />
        )}
        {has('real_repo', 'real_gsec10') && (
          <MultiChart title="Real interest rates" icon="rates" headline={head('real_repo')} note="Policy repo rate and 10-year G-sec yield minus CPI inflation, month end. Below zero means borrowing is cheap after inflation. RBI, MoSPI." start={start} fmt={pct(1)}
            series={[
              { key: 'real_repo', label: 'Real repo rate', color: S1, points: h('real_repo') },
              { key: 'real_gsec10', label: 'Real 10-year yield', color: S2, points: h('real_gsec10') },
            ]} />
        )}
        </div>
      </Category>
      <Category id="cat-banking" title="Banking and credit" icon="credit" blurb="How fast bank lending, deposits and money are growing, and which sectors are borrowing." count={countOf('Banking and credit')}
        links={<span className="eb-cat-links"><a className="eb-more" href="#/theme/banking-and-credit">All indicators</a></span>}>
        <div className="eb-panels eb-panels-2">
        {has('credit_nonfood', 'deposit_growth', 'm3_growth') && (
          <MultiChart title="Money and credit" icon="money" headline={head('credit_nonfood')} note="% year on year. RBI DBIE." start={start} fmt={pct(1)}
            series={[
              { key: 'credit_nonfood', label: 'Non-food credit', color: S1, points: h('credit_nonfood') },
              { key: 'deposit_growth', label: 'Deposits', color: S2, points: h('deposit_growth') },
              { key: 'm3_growth', label: 'M3', color: S3, points: h('m3_growth') },
            ]} />
        )}
        {has('credit_industry', 'credit_services') && (
          <MultiChart title="Credit by sector" icon="credit" headline={head('credit_services')} note="% year on year, as first published each month. RBI sectoral deployment of bank credit." start={start} fmt={pct(1)}
            series={[
              { key: 'credit_industry', label: 'Industry', color: S1, points: h('credit_industry') },
              { key: 'credit_services', label: 'Services', color: S2, points: h('credit_services') },
              { key: 'credit_personal', label: 'Personal loans', color: S3, points: h('credit_personal') },
            ]} />
        )}
        </div>
      </Category>
      <Category id="cat-fiscal" title="Government finances" icon="money" blurb="The Centre's deficit and capital spending, GST collections and direct taxes." count={countOf('Government finances')}
        links={<span className="eb-cat-links"><a className="eb-more" href="#/theme/government-finances">All indicators</a><a className="eb-more" href="#/direct-taxes">Direct taxes</a></span>}>
        <div className="eb-panels eb-panels-2">
        {has('fiscal_deficit', 'capex_centre') && (
          <MultiChart title="Government finances" icon="money" headline={head('fiscal_deficit')} note="Centre, cumulative from April as % of the full-year budget estimate; resets each April. CGA." start={start} fmt={pct(0)}
            series={[
              { key: 'fiscal_deficit', label: 'Fiscal deficit', color: S2, points: h('fiscal_deficit') },
              { key: 'capex_centre', label: 'Capital spending', color: S1, points: h('capex_centre') },
            ]} />
        )}
        {has('gst_gross') && (
          <MultiChart title="GST collections" icon="money" headline={head('gst_gross')} note="Gross GST collected each month, ₹ lakh crore, as reported by GSTN; the latest month is provisional. GSTN." start={start} fmt={lakhCr}
            series={[{ key: 'gst_gross', label: 'Gross GST', color: S1, points: h('gst_gross') }]} />
        )}
        {has('dt_corporate', 'dt_noncorporate') && (
          <MultiChart title="Direct tax collections" icon="money" headline={head('dt_net')} note="Net of refunds, ₹ lakh crore, by financial year (bars at March, year end). Non-corporate is mainly personal income tax. Latest year provisional. Always about ten years. CBDT." kind="bar" start={annualStart} fmt={lakhCr}
            series={[
              { key: 'dt_corporate', label: 'Corporate tax', color: S1, points: h('dt_corporate') },
              { key: 'dt_noncorporate', label: 'Non-corporate tax', color: S2, points: h('dt_noncorporate') },
            ]} />
        )}
        {has('dt_gdp') && (
          <MultiChart title="Direct taxes as a share of GDP" icon="growth" headline={head('dt_gdp')} note="Net direct tax collections, % of GDP at current prices, by financial year. Always about ten years. CBDT, MoSPI." start={annualStart} fmt={pct(2)}
            series={[{ key: 'dt_gdp', label: 'Direct tax to GDP', color: S1, points: h('dt_gdp') }]} />
        )}
        </div>
      </Category>
      <Category id="cat-trade" title="Trade and current account" icon="trade" blurb="Goods and services trade, money sent home by Indians abroad, and the current account." count={countOf('Trade and current account')}
        links={<span className="eb-cat-links"><a className="eb-more" href="#/theme/trade-and-current-account">All indicators</a><a className="eb-more" href="#/exports">Exports by partner and product</a></span>}>
        <TradeCard base={tradeBase} />
        <div className="eb-panels eb-panels-2">
        {has('exports', 'imports') && (
          <MultiChart title="Merchandise trade" icon="trade" headline={head('trade_balance')} note="US$ bn a month. RBI DBIE, latest month from Commerce." start={start} fmt={bn}
            series={[
              { key: 'exports', label: 'Exports', color: S1, points: h('exports') },
              { key: 'imports', label: 'Imports', color: S2, points: h('imports') },
              { key: 'trade_balance', label: 'Balance', color: S3, points: h('trade_balance') },
            ]} />
        )}
        {has('services_exports', 'services_imports') && (
          <MultiChart title="Services trade" icon="trade" headline={head('services_net')} note="US$ bn a month. The surplus offsets part of the goods deficit. RBI." start={start} fmt={bn}
            series={[
              { key: 'services_exports', label: 'Services exports', color: S1, points: h('services_exports') },
              { key: 'services_imports', label: 'Services imports', color: S2, points: h('services_imports') },
              { key: 'services_net', label: 'Surplus', color: S3, points: h('services_net') },
            ]} />
        )}
        {has('ca_goods', 'ca_services') && (
          <MultiChart title="Current account" icon="flows" headline={head('ca_usd')} note="US$ bn a quarter, net. Services and transfers (mostly remittances) cover most of the goods deficit. RBI balance of payments." kind="bar" start={start} fmt={bn}
            series={[
              { key: 'ca_goods', label: 'Goods', color: S2, points: h('ca_goods') },
              { key: 'ca_services', label: 'Services', color: S1, points: h('ca_services') },
              { key: 'ca_secondary', label: 'Transfers', color: S3, points: h('ca_secondary') },
            ]} />
        )}
        {has('remittances') && (
          <MultiChart title="Remittances" icon="money" headline={head('remittances')} note="US$ bn a quarter. Personal transfer receipts, mainly money sent home by Indians working abroad. RBI." kind="bar" start={start} fmt={bn}
            series={[{ key: 'remittances', label: 'Remittances', color: S1, points: h('remittances') }]} />
        )}
        </div>
      </Category>
      <Category id="cat-flows" title="Capital flows, reserves and the rupee" icon="flows" blurb="Foreign investment, forex reserves and the exchange rate." count={countOf('Capital flows, reserves and the rupee')}
        links={<span className="eb-cat-links"><a className="eb-more" href="#/theme/capital-flows-reserves-and-the-rupee">All indicators</a></span>}>
        <div className="eb-panels">
        {has('fdi_net', 'fpi_net') && (
          <MultiChart title="Capital flows" icon="flows" headline={head('fdi_net')} note="US$ bn a month, net. RBI DBIE." kind="bar" start={start} fmt={bn}
            series={[
              { key: 'fdi_net', label: 'Net FDI', color: S1, points: h('fdi_net') },
              { key: 'fpi_net', label: 'Net portfolio', color: S2, points: h('fpi_net') },
            ]} />
        )}
        {has('fx_reserves') && (
          <MultiChart title="Forex reserves" icon="reserves" headline={head('fx_reserves')} note="US$ bn, last week of each month; latest week shown. RBI DBIE." start={start} fmt={bn}
            series={[{ key: 'fx_reserves', label: 'Forex reserves', color: S1, points: h('fx_reserves') }]} />
        )}
        {has('inr_usd') && (
          <MultiChart title="Rupee per US dollar" icon="rupee" headline={head('inr_usd')} note="RBI reference rate, month end. A higher number means a weaker rupee. RBI DBIE." start={start} fmt={(v) => `₹${formatValue(v, 2)}`}
            series={[{ key: 'inr_usd', label: 'Rupee per US$', color: S1, points: h('inr_usd') }]} />
        )}
        </div>
      </Category>

      <section aria-labelledby="eb-signal-h">
        <div className="eb-eyebar">
          <h2 className="eb-eyebrow" id="eb-signal-h">All indicators</h2>
          <span className="eb-eyelinks">
            <a className="eb-more" href={csvUrl} download="ef2-dashboard-data.csv">Download all data (CSV)</a>
            <a className="eb-more" href="#/sources">Sources and notes</a>
          </span>
        </div>
        <details className="eb-all">
          <summary>Show all {(data.indicators || []).length} indicators in one table</summary>
          <SignalTable indicators={data.indicators || []} groups={groups} />
        </details>
      </section>
    </div>
  );
}
