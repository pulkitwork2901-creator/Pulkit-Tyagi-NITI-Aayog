import { useState } from 'react';
import Chip from '../Chip.jsx';
import TrendChart from '../TrendChart.jsx';
import MultiChart from '../dashboard/MultiChart.jsx';
import { formatChange, formatDate, formatValue, reading, signed, slug, tipFor } from '../format.js';

// Rural against urban inflation, shown on the CPI pages: where are prices rising faster?
function RuralUrban({ byId }) {
  const r = byId?.cpi_rural;
  const u = byId?.cpi_urban;
  if (!r || !u) return null;
  const rh = (r.history || []).filter((p) => p.value != null);
  const uh = new Map((u.history || []).filter((p) => p.value != null).map((p) => [p.date, p.value]));
  const last12 = rh.slice(-12).filter((p) => uh.has(p.date));
  const higher = last12.filter((p) => p.value > uh.get(p.date)).length;
  const gap = r.value - u.value;
  const latest = Math.max(...rh.map((p) => Date.parse(p.date)));
  const start = latest - 5 * 365.25 * 86400000;
  const pct = (v) => `${signed(formatValue(v, 2))}%`;
  return (
    <section className="eb-section" aria-labelledby="eb-in-ru">
      <h2 id="eb-in-ru">Rural and urban inflation</h2>
      <p className="eb-ru-lead">
        In {r.period} prices rose <strong>{pct(r.value)}</strong> in rural India and <strong>{pct(u.value)}</strong> in urban India,
        so inflation was <strong>{formatValue(Math.abs(gap), 2)} points {gap >= 0 ? 'higher in villages' : 'higher in towns'}</strong>.
        {' '}Rural inflation has been above urban in {higher} of the last {last12.length} months.
      </p>
      <MultiChart title="Rural and urban CPI inflation" icon="prices" headline={{ value: `${gap >= 0 ? '+' : '−'}${formatValue(Math.abs(gap), 2)} pts`, sub: `Rural minus urban · ${r.period}` }}
        note="% year on year, All India. 2024 base from January 2026; 2012 base before. Shaded: RBI's 2 to 6% tolerance band. MoSPI."
        start={start} fmt={pct} band={{ lo: 2, hi: 6, label: '2–6% band' }}
        series={[
          { key: 'cpi_rural', label: 'Rural', color: 'var(--eb-s1)', points: r.history },
          { key: 'cpi_urban', label: 'Urban', color: 'var(--eb-s2)', points: u.history },
        ]} />
    </section>
  );
}

// Direct tax collections by state and UT (CBDT Time Series, table 1.2), on the net collections page.
function StateBreakup({ data }) {
  const [all, setAll] = useState(false);
  if (!data?.rows?.length) return null;
  const total = data.grand_total || data.rows.reduce((s, r) => s + r.value, 0);
  const lakh = (v) => formatValue(v / 1e5, 2);
  const top3 = data.rows.slice(0, 3);
  const top3share = top3.reduce((s, r) => s + r.value, 0) / total * 100;
  const shown = all ? data.rows : data.rows.slice(0, 12);
  const o = data.other || {};
  return (
    <section className="eb-section" aria-labelledby="eb-in-states">
      <h2 id="eb-in-states">By state and union territory, {data.year}</h2>
      <p className="eb-ru-lead">
        {top3.map((r) => r.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} together account for <strong>{formatValue(top3share, 0)}%</strong> of collections.
        {' '}CBDT assigns tax to the state in the taxpayer's address on record, so collections lean towards the states where large companies have their head offices and where
        employers deduct TDS. Read this as where tax is paid from, not where the income is earned.
      </p>
      <div className="eb-tablewrap">
        <table className="eb-table">
          <caption className="eb-sr">Net direct tax collections by state and UT, {data.year}</caption>
          <thead>
            <tr><th scope="col">State or UT</th><th scope="col" className="eb-num">{data.year} (₹ lakh crore)</th><th scope="col" className="eb-num">Share</th><th scope="col" className="eb-num">Change on {data.prev_year}</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}{r.kind === 'ut' ? ' (UT)' : ''}</th>
                <td className="eb-num">{lakh(r.value)}</td>
                <td className="eb-num">{formatValue(r.value / total * 100, 1)}%</td>
                <td className="eb-num eb-muted">{r.prev > 0 ? `${signed(formatValue((r.value / r.prev - 1) * 100, 1))}%` : 'n.a.'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.rows.length > 12 && (
        <p><button type="button" className="eb-btn eb-noprint" onClick={() => setAll(!all)}>{all ? 'Show the top 12' : `Show all ${data.rows.length}`}</button></p>
      )}
      <p className="eb-muted">
        Not assigned to a state: central TDS ₹{lakh(o['C.T.D.S'] || 0)} lakh crore{o.Foreign ? <>, taxpayers with an address outside India ₹{lakh(o.Foreign)} lakh crore</> : null}.
        {' '}A large one-year swing for a single state can come from changes in recorded addresses rather than in the economy. CBDT, Time Series Data, table 1.2.
      </p>
    </section>
  );
}

export default function IndicatorPage({ item, byId }) {
  if (!item) {
    return (
      <div className="eb-notfound">
        <h1>Indicator not found</h1>
        <p>This indicator is not in the current data. <a href="#/">Return to the overview</a> to pick one.</p>
      </div>
    );
  }
  const hist = (item.history || []).filter((p) => p.value != null);
  const rows = hist.map((p, i) => ({ ...p, delta: i ? p.value - hist[i - 1].value : null })).reverse();
  const fmt = (v) => signed(formatValue(v, item.decimals));

  return (
    <>
      <nav className="eb-crumbs" aria-label="Breadcrumb">
        <a href="#/">Dashboard</a><span aria-hidden="true">/</span>
        <a href={`#/theme/${slug(item.group)}`}>{item.group}</a><span aria-hidden="true">/</span>
        <span>{item.label}</span>
      </nav>

      <header className="eb-pagehead eb-detailhead">
        <div>
          <h1>{item.label}</h1>
          <p className="eb-asof">{item.period}</p>
        </div>
        <button type="button" className="eb-btn eb-noprint" onClick={() => window.print()}>Print or save as PDF</button>
      </header>

      <section className="eb-section eb-bignumber" aria-label="Latest figure">
        <p className="eb-big">{fmt(item.value)}<span className="eb-figure-unit">{item.unit}</span></p>
        <p className="eb-bigchange"><Chip item={item} /> <span className="eb-muted">{item.compare_period ? `against ${fmt(item.compare_value)} in ${item.compare_period}` : ''}</span></p>
        <p className="eb-reading">{reading(item.up_is_good)}</p>
      </section>

      <section className="eb-section" aria-labelledby="eb-in-trend">
        <h2 id="eb-in-trend">Trend</h2>
        <TrendChart title={`${item.label}, ${item.unit}`} note={item.source} headingLevel={3}
          points={hist} kind={item.id === 'gdp' || item.id === 'iip' ? 'bar' : 'line'}
          formatAxis={(v) => signed(formatValue(v, v % 1 === 0 ? 0 : 1))} formatTip={tipFor(item)} formatEnd={tipFor(item)} />
      </section>

      {['cpi', 'cpi_rural', 'cpi_urban'].includes(item.id) && <RuralUrban byId={byId} />}
      {item.by_state && <StateBreakup data={item.by_state} />}

      <section className="eb-section" aria-labelledby="eb-in-hist">
        <h2 id="eb-in-hist">Release history</h2>
        <div className="eb-tablewrap">
          <table className="eb-table">
            <caption className="eb-sr">{item.label} by period, newest first</caption>
            <thead>
              <tr><th scope="col">Period</th><th scope="col" className="eb-num">Value ({item.unit})</th><th scope="col" className="eb-num">Change on previous</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td className="eb-num"><span className="eb-cell-value">{fmt(r.value)}</span></td>
                  <td className="eb-num eb-muted">{r.delta == null ? 'First entry' : signed(formatChange(r.delta, ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="eb-section" aria-labelledby="eb-in-about">
        <h2 id="eb-in-about">About this figure</h2>
        <dl className="eb-facts">
          <div><dt>Source</dt><dd>{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">{item.source}</a> : item.source}</dd></div>
          <div><dt>Released</dt><dd>{item.released ? formatDate(item.released) : 'Updated whenever the data is rebuilt'}</dd></div>
          <div><dt>How it gets here</dt><dd>{item.mode === 'live'
            ? (item.stale ? 'Pulled from MoSPI. The last attempt failed, so this is the last good copy.' : 'Pulled live from MoSPI each time the data is rebuilt.')
            : item.mode === 'rbi'
              ? "Read from RBI's DBIE Macro-economic Indicators download (data/rbi/macro-indicators.xlsx) or RBI's press releases, refreshed daily."
              : item.mode === 'ppac'
              ? "Read daily from PPAC's crude oil price page (scripts/ppac_crude.py)."
              : item.mode === 'gstn'
              ? "Read from GSTN's monthly GST revenue report, found through the GST portal's news feed (scripts/gst_reports.py)."
              : item.mode === 'cbdt'
              ? "From CBDT's annual Time Series Data PDF, saved in data/uploads/direct-taxes/ and read by scripts/direct_taxes.py. The Income Tax Department's site does not allow automated downloads, so each new edition is added by hand."
              : item.mode === 'derived'
              ? 'Calculated on the board from other series shown here; see the note.'
              : item.mode === 'workbook'
              ? "From the division's indicators workbook (data/uploads/india-economic-indicators.xlsx), compiled from official releases with each value cited."
              : 'Entered by the team from the official release, in data/manual-indicators.csv. Earlier points may come from the RBI DBIE download.'}</dd></div>
          {item.note && <div><dt>Note</dt><dd>{item.note}</dd></div>}
          <div><dt>Unit</dt><dd>{item.unit}</dd></div>
        </dl>
      </section>
    </>
  );
}
