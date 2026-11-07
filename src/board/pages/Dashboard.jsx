import { useState } from 'react';
import Chip from '../Chip.jsx';
import Lead from '../Lead.jsx';
import Sparkline from '../Sparkline.jsx';
import MultiChart, { sinceRange } from '../dashboard/MultiChart.jsx';
import SignalTable from '../dashboard/SignalTable.jsx';
import { formatDateTime, formatValue, signed, tipFor } from '../format.js';

// The one-screen dashboard: headline tiles, six themed panels on a shared time
// range, and every indicator in a signal table underneath. Theme and indicator
// pages remain for detail.

const RANGES = [['1Y', 1], ['3Y', 3], ['5Y', 5]];
const TILES = ['gdp', 'cpi', 'repo', 'credit_nonfood', 'fx_reserves', 'inr_usd'];
const S1 = 'var(--eb-s1)';
const S2 = 'var(--eb-s2)';
const S3 = 'var(--eb-s3)';
const pct = (d) => (v) => `${signed(formatValue(v, d))}%`;
const bn = (v) => `${signed(formatValue(v, 1))} bn`;

function readRange() {
  try { return Number(localStorage.getItem('eb-range')) || 3; } catch { return 3; }
}

function Tile({ item, start }) {
  const pts = sinceRange(item.history, start);
  return (
    <li className="eb-tile">
      <a className="eb-tile-link" href={`#/indicator/${item.id}`}>
        <span className="eb-tile-label">{item.label}</span>
        <span className="eb-tile-value">{signed(formatValue(item.value, item.decimals))}<span className="eb-tile-unit">{item.unit}</span></span>
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

export default function Dashboard({ data, title, byId, groups }) {
  const [years, setYears] = useState(readRange);
  const choose = (n) => {
    setYears(n);
    try { localStorage.setItem('eb-range', String(n)); } catch { /* private window: keep in memory only */ }
  };
  const latest = Math.max(...(data.indicators || []).flatMap((i) => (i.history || []).map((p) => (p.date ? Date.parse(p.date) : 0))));
  const start = latest - years * 365.25 * 86400000;
  const h = (id) => byId[id]?.history || [];
  const has = (...ids) => ids.some((id) => byId[id]);

  return (
    <div className="eb-dash">
      <header className="eb-dashhead">
        <div>
          <h1>{title}</h1>
          <p className="eb-asof">Position as on {formatDateTime(data.generated_at)}</p>
        </div>
        <div className="eb-range" role="group" aria-label="Time range for all charts">
          {RANGES.map(([label, n]) => (
            <button key={label} type="button" aria-pressed={years === n} onClick={() => choose(n)}>{label}</button>
          ))}
        </div>
      </header>

      <Lead byId={byId} />

      <ul className="eb-tiles" aria-label="Headline indicators">
        {TILES.map((id) => byId[id] && <Tile key={id} item={byId[id]} start={start} />)}
      </ul>

      <section className="eb-panels" aria-label="Charts">
        {has('gdp') && (
          <MultiChart title="Growth" note="Real GDP, % year on year, by quarter. MoSPI." kind="bar" start={start} fmt={pct(1)}
            series={[{ key: 'gdp', label: 'Real GDP growth', color: S1, points: h('gdp') }]} />
        )}
        {has('cpi', 'repo') && (
          <MultiChart title="Inflation and policy rate" note="%. Shaded: RBI's 2 to 6% inflation tolerance band. MoSPI, RBI." start={start} fmt={pct(2)}
            band={{ lo: 2, hi: 6, label: '2–6% band' }}
            series={[
              { key: 'cpi', label: 'CPI inflation', color: S1, points: h('cpi') },
              { key: 'repo', label: 'Repo rate', color: S2, points: h('repo') },
            ]} />
        )}
        {has('tbill_91', 'gsec10') && (
          <MultiChart title="Interest rates" note="%, month end. RBI DBIE (G-sec: FBIL)." start={start} fmt={pct(2)}
            series={[
              { key: 'tbill_91', label: '91-day T-bill', color: S1, points: h('tbill_91') },
              { key: 'repo', label: 'Repo rate', color: S2, points: h('repo') },
              { key: 'gsec10', label: '10-year G-sec', color: S3, points: h('gsec10') },
            ]} />
        )}
        {has('credit_nonfood', 'deposit_growth', 'm3_growth') && (
          <MultiChart title="Money and credit" note="% year on year. RBI DBIE." start={start} fmt={pct(1)}
            series={[
              { key: 'credit_nonfood', label: 'Non-food credit', color: S1, points: h('credit_nonfood') },
              { key: 'deposit_growth', label: 'Deposits', color: S2, points: h('deposit_growth') },
              { key: 'm3_growth', label: 'M3', color: S3, points: h('m3_growth') },
            ]} />
        )}
        {has('exports', 'imports') && (
          <MultiChart title="Merchandise trade" note="US$ bn a month. RBI DBIE, latest month from Commerce." start={start} fmt={bn}
            series={[
              { key: 'exports', label: 'Exports', color: S1, points: h('exports') },
              { key: 'imports', label: 'Imports', color: S2, points: h('imports') },
              { key: 'trade_balance', label: 'Balance', color: S3, points: h('trade_balance') },
            ]} />
        )}
        {has('fdi_net', 'fpi_net') && (
          <MultiChart title="Capital flows" note="US$ bn a month, net. RBI DBIE." kind="bar" start={start} fmt={bn}
            series={[
              { key: 'fdi_net', label: 'Net FDI', color: S1, points: h('fdi_net') },
              { key: 'fpi_net', label: 'Net portfolio', color: S2, points: h('fpi_net') },
            ]} />
        )}
      </section>

      <section className="eb-section" aria-labelledby="eb-signal-h">
        <div className="eb-sectionbar">
          <h2 id="eb-signal-h">All indicators</h2>
          <a className="eb-more" href="#/sources">Sources and notes</a>
        </div>
        <SignalTable indicators={data.indicators || []} groups={groups} />
      </section>
    </div>
  );
}
