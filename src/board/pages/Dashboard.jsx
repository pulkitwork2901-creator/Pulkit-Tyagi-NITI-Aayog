import { useState } from 'react';
import Chip from '../Chip.jsx';
import Lead from '../Lead.jsx';
import Sparkline from '../Sparkline.jsx';
import MultiChart, { sinceRange } from '../dashboard/MultiChart.jsx';
import SignalTable from '../dashboard/SignalTable.jsx';
import Icon from '../dashboard/Icon.jsx';
import { useCountUp } from '../dashboard/motion.js';
import { formatDateTime, formatValue, signed, tipFor } from '../format.js';

// The one-screen dashboard: headline tiles, six themed panels on a shared time
// range, and every indicator in a signal table underneath. Theme and indicator
// pages remain for detail.

const RANGES = [['1Y', 1], ['3Y', 3], ['5Y', 5]];
const TILES = ['gdp', 'cpi', 'wpi', 'repo', 'unemployment', 'credit_nonfood'];
const SHORT = { gdp: 'GDP', cpi: 'CPI', gsec10: '10-yr G-sec', credit_nonfood: 'Credit', trade_balance: 'Trade balance', fdi_net: 'Net FDI', unemployment: 'Unemployment', fx_reserves: 'Reserves', inr_usd: '₹ per US$' };
const S1 = 'var(--eb-s1)';
const S2 = 'var(--eb-s2)';
const S3 = 'var(--eb-s3)';
const pct = (d) => (v) => `${signed(formatValue(v, d))}%`;
const bn = (v) => `${signed(formatValue(v, 1))} bn`;

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

// Indicators whose latest reading reached the board in the last NEW_DAYS days.
function WhatsNew({ indicators, now }) {
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
          {fresh.slice(0, 8).map((i) => (
            <li key={i.id}>
              <a href={`#/indicator/${i.id}`}>{i.label}</a>
              <b>{signed(formatValue(i.value, i.decimals))}{i.unit.startsWith('%') ? '%' : ` ${i.unit}`}</b>
              <span className="eb-new-period">{i.period}</span>
              <Chip item={i} />
            </li>
          ))}
          {fresh.length > 8 && <li className="eb-new-more">and {fresh.length - 8} more in the table below</li>}
        </ul>
      )}
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

export default function Dashboard({ data, title, byId, groups, csvUrl }) {
  const [years, setYears] = useState(readRange);
  const choose = (n) => {
    setYears(n);
    try { localStorage.setItem('eb-range', String(n)); } catch { /* private window: keep in memory only */ }
  };
  const latest = Math.max(...(data.indicators || []).flatMap((i) => (i.history || []).map((p) => (p.date ? Date.parse(p.date) : 0))));
  const start = latest - years * 365.25 * 86400000;
  const h = (id) => byId[id]?.history || [];
  const has = (...ids) => ids.some((id) => byId[id]);
  const head = (id) => byId[id] && { value: (byId[id].unit.startsWith('%') ? `${signed(formatValue(byId[id].value, byId[id].decimals))}%` : byId[id].unit === 'US$ bn' ? `US$ ${signed(formatValue(byId[id].value, 1))} bn` : byId[id].unit.startsWith('₹ per US$') ? `₹${formatValue(byId[id].value, 2)}` : `${signed(formatValue(byId[id].value, byId[id].decimals))} ${byId[id].unit}`), sub: `${SHORT[id] || byId[id].label} · ${byId[id].period.replace(/^(Week|Fortnight) to /, '')}` };

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

      <h2 className="eb-eyebrow" id="eb-panels-h">Trends</h2>
      <section className="eb-panels" aria-labelledby="eb-panels-h">
        {has('gdp') && (
          <MultiChart title="Growth" icon="growth" headline={head('gdp')} note="Real GDP, % year on year, by quarter. MoSPI." kind="bar" start={start} fmt={pct(1)}
            series={[{ key: 'gdp', label: 'Real GDP growth', color: S1, points: h('gdp') }]} />
        )}
        {has('cpi', 'repo') && (
          <MultiChart title="Inflation and policy rate" icon="prices" headline={head('cpi')} note="% year on year. Shaded: RBI's 2 to 6% CPI tolerance band. CPI before 2026 on the 2012 base. MoSPI, RBI." start={start} fmt={pct(2)}
            band={{ lo: 2, hi: 6, label: '2–6% band' }}
            series={[
              { key: 'cpi', label: 'CPI inflation', color: S1, points: h('cpi') },
              { key: 'repo', label: 'Repo rate', color: S2, points: h('repo') },
              { key: 'wpi', label: 'WPI inflation', color: S3, points: h('wpi') },
            ]} />
        )}
        {has('tbill_91', 'gsec10') && (
          <MultiChart title="Interest rates" icon="rates" headline={head('gsec10')} note="%, month end. RBI DBIE (G-sec: FBIL)." start={start} fmt={pct(2)}
            series={[
              { key: 'tbill_91', label: '91-day T-bill', color: S1, points: h('tbill_91') },
              { key: 'repo', label: 'Repo rate', color: S2, points: h('repo') },
              { key: 'gsec10', label: '10-year G-sec', color: S3, points: h('gsec10') },
            ]} />
        )}
        {has('credit_nonfood', 'deposit_growth', 'm3_growth') && (
          <MultiChart title="Money and credit" icon="money" headline={head('credit_nonfood')} note="% year on year. RBI DBIE." start={start} fmt={pct(1)}
            series={[
              { key: 'credit_nonfood', label: 'Non-food credit', color: S1, points: h('credit_nonfood') },
              { key: 'deposit_growth', label: 'Deposits', color: S2, points: h('deposit_growth') },
              { key: 'm3_growth', label: 'M3', color: S3, points: h('m3_growth') },
            ]} />
        )}
        {has('exports', 'imports') && (
          <MultiChart title="Merchandise trade" icon="trade" headline={head('trade_balance')} note="US$ bn a month. RBI DBIE, latest month from Commerce." start={start} fmt={bn}
            series={[
              { key: 'exports', label: 'Exports', color: S1, points: h('exports') },
              { key: 'imports', label: 'Imports', color: S2, points: h('imports') },
              { key: 'trade_balance', label: 'Balance', color: S3, points: h('trade_balance') },
            ]} />
        )}
        {has('fdi_net', 'fpi_net') && (
          <MultiChart title="Capital flows" icon="flows" headline={head('fdi_net')} note="US$ bn a month, net. RBI DBIE." kind="bar" start={start} fmt={bn}
            series={[
              { key: 'fdi_net', label: 'Net FDI', color: S1, points: h('fdi_net') },
              { key: 'fpi_net', label: 'Net portfolio', color: S2, points: h('fpi_net') },
            ]} />
        )}
        {has('unemployment') && (
          <MultiChart title="Jobs" icon="jobs" headline={head('unemployment')} note="Unemployment rate, % of labour force, age 15+, monthly. MoSPI PLFS." start={start} fmt={pct(1)}
            series={[{ key: 'unemployment', label: 'Unemployment rate', color: S1, points: h('unemployment') }]} />
        )}
        {has('fx_reserves') && (
          <MultiChart title="Forex reserves" icon="reserves" headline={head('fx_reserves')} note="US$ bn, last week of each month; latest week shown. RBI DBIE." start={start} fmt={bn}
            series={[{ key: 'fx_reserves', label: 'Forex reserves', color: S1, points: h('fx_reserves') }]} />
        )}
        {has('inr_usd') && (
          <MultiChart title="Rupee per US dollar" icon="rupee" headline={head('inr_usd')} note="RBI reference rate, month end. A higher number means a weaker rupee. RBI DBIE." start={start} fmt={(v) => `₹${formatValue(v, 2)}`}
            series={[{ key: 'inr_usd', label: 'Rupee per US$', color: S1, points: h('inr_usd') }]} />
        )}
      </section>

      <section aria-labelledby="eb-signal-h">
        <div className="eb-eyebar">
          <h2 className="eb-eyebrow" id="eb-signal-h">All indicators</h2>
          <span className="eb-eyelinks">
            <a className="eb-more" href={csvUrl} download="ef2-dashboard-data.csv">Download all data (CSV)</a>
            <a className="eb-more" href="#/sources">Sources and notes</a>
          </span>
        </div>
        <SignalTable indicators={data.indicators || []} groups={groups} />
      </section>
    </div>
  );
}
