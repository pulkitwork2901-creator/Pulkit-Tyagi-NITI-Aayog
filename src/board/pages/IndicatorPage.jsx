import { useState } from 'react';
import Chip from '../Chip.jsx';
import { useLanguage } from '../../i18n.jsx';
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

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_HI = ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'];
const RANGES = [[12, '1Y', '1 वर्ष'], [36, '3Y', '3 वर्ष'], [60, '5Y', '5 वर्ष'], [0, 'All', 'सभी']];
// The RBI's inflation target is 4%, with a tolerance band of 2 to 6%.
const CPI_BAND = ['cpi', 'cpi_rural', 'cpi_urban', 'cpi_core'];
const monthsSpan = (a, b) => (Date.parse(b) - Date.parse(a)) / (30.44 * 86400000);
const isMonthly = (h) => h.length >= 24 && monthsSpan(h[0].date, h.at(-1).date) / (h.length - 1) < 1.6;

// Where today's reading sits against the whole series.
function Context({ item, hist, hi }) {
  if (hist.length < 6) return null;
  const v = hist.map((p) => p.value);
  const max = hist.reduce((a, p) => (p.value > a.value ? p : a));
  const min = hist.reduce((a, p) => (p.value < a.value ? p : a));
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  const last = hist.at(-1);
  const below = v.filter((x) => x < last.value).length;
  const pct = Math.round((below / (v.length - 1 || 1)) * 100);
  const yearAgo = [...hist].reverse().find((p) => monthsSpan(p.date, last.date) >= 11.5);
  const f = (x) => signed(formatValue(x, item.decimals));
  const cells = [
    [hi ? 'सबसे ऊँचा' : 'Highest', f(max.value), max.label],
    [hi ? 'सबसे नीचा' : 'Lowest', f(min.value), min.label],
    [hi ? 'औसत' : 'Average', f(avg), hi ? `${hist.length} आंकड़े` : `${hist.length} readings`],
    yearAgo && [hi ? 'एक वर्ष पहले' : 'A year ago', f(yearAgo.value), yearAgo.label],
  ].filter(Boolean);
  return (
    <div className="eb-ctx">
      <div className="eb-ctx-meter" role="img" aria-label={hi ? `आज का आंकड़ा ${hist[0].label} से अब तक के ${pct}% आंकड़ों से ऊपर है` : `Today's reading is above ${pct}% of readings since ${hist[0].label}`}>
        <p className="eb-ctx-h">{hi ? 'इतिहास में आज कहाँ' : 'Where today sits in its history'}</p>
        <div className="eb-ctx-track">
          <span className="eb-ctx-avg" style={{ left: `${((avg - min.value) / (max.value - min.value || 1)) * 100}%` }} title={hi ? 'औसत' : 'Average'} />
          <span className="eb-ctx-dot" style={{ left: `${((last.value - min.value) / (max.value - min.value || 1)) * 100}%` }} />
        </div>
        <div className="eb-ctx-ends"><span>{f(min.value)}</span><span>{f(max.value)}</span></div>
        <p className="eb-ctx-note">{hi
          ? `${f(last.value)} ${hist[0].label} से अब तक के ${pct}% आंकड़ों से ऊपर है।`
          : `${f(last.value)} is higher than ${pct}% of readings since ${hist[0].label}.`}</p>
      </div>
      <dl className="eb-ctx-cells">
        {cells.map(([k, val, sub]) => <div key={k}><dt>{k}</dt><dd>{val}<span className="eb-figure-unit">{item.unit}</span></dd><dd className="eb-ctx-sub">{sub}</dd></div>)}
      </dl>
    </div>
  );
}

// Monthly series as a year-by-month grid: seasonality and turning points at a glance.
function MonthGrid({ item, hist, hi }) {
  if (!isMonthly(hist)) return null;
  const v = hist.map((p) => p.value);
  const lo = Math.min(...v);
  const top = Math.max(...v);
  const by = new Map(hist.map((p) => [p.date.slice(0, 7), p]));
  const years = [...new Set(hist.map((p) => p.date.slice(0, 4)))].reverse();
  const share = (x) => Math.round(12 + ((x - lo) / (top - lo || 1)) * 78);
  return (
    <section className="eb-section" aria-labelledby="eb-in-grid">
      <h2 id="eb-in-grid">{hi ? 'महीने दर महीने' : 'Month by month'}</h2>
      <p className="eb-chartnote">{hi ? 'हर खाना एक महीना; रंग जितना गहरा, आंकड़ा उतना ऊँचा।' : 'Each cell is one month; the darker the cell, the higher the reading.'} {item.unit}.</p>
      <div className="eb-tablewrap">
        <table className="eb-mgrid">
          <caption className="eb-sr">{item.label}, {hi ? 'वर्ष और महीने के अनुसार' : 'by year and month'}</caption>
          <thead><tr><th scope="col" />{(hi ? MON_HI : MON).map((m) => <th key={m} scope="col">{m}</th>)}</tr></thead>
          <tbody>
            {years.map((y) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {MON.map((m, i) => {
                  const p = by.get(`${y}-${String(i + 1).padStart(2, '0')}`);
                  return p ? (
                    <td key={m} style={{ '--mg': `${share(p.value)}%` }} className={share(p.value) > 55 ? 'eb-mg-dark' : undefined} title={`${p.label}: ${formatValue(p.value, item.decimals)}`}>
                      {formatValue(p.value, Math.abs(p.value) >= 100 ? 0 : 1)}
                    </td>
                  ) : <td key={m} className="eb-mg-empty" />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function IndicatorPage({ item, byId }) {
  const hi = useLanguage().language === 'hi';
  const [range, setRange] = useState(36);
  const [allRows, setAllRows] = useState(false);
  if (!item) {
    return (
      <div className="eb-notfound">
        <h1>Indicator not found</h1>
        <p>This indicator is not in the current data. <a href="#/">Return to the overview</a> to pick one.</p>
      </div>
    );
  }
  const hist = (item.history || []).filter((p) => p.value != null);
  const rowsAll = hist.map((p, i) => ({ ...p, delta: i ? p.value - hist[i - 1].value : null })).reverse();
  const rows = allRows ? rowsAll : rowsAll.slice(0, 12);
  const span = hist.length > 1 ? monthsSpan(hist[0].date, hist.at(-1).date) : 0;
  const ranges = RANGES.filter(([m]) => m === 0 || m < span);
  const shown = range && range < span ? hist.filter((p) => monthsSpan(p.date, hist.at(-1).date) <= range) : hist;
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
          band={CPI_BAND.includes(item.id) ? { lo: 2, hi: 6, label: hi ? 'RBI का 2–6% दायरा' : "RBI's 2–6% band" } : null}
          controls={ranges.length > 1 ? (
            <div className="eb-range eb-range-sm" role="group" aria-label={hi ? 'अवधि' : 'Time range'}>
              {ranges.map(([m, en, h]) => <button key={en} type="button" aria-pressed={(range >= span ? 0 : range) === m} onClick={() => setRange(m)}>{hi ? h : en}</button>)}
            </div>
          ) : null}
          points={shown} kind={item.id === 'gdp' || item.id === 'iip' ? 'bar' : 'line'}
          formatAxis={(v) => signed(formatValue(v, v % 1 === 0 ? 0 : 1))} formatTip={tipFor(item)} formatEnd={tipFor(item)} />
      </section>

      <Context item={item} hist={hist} hi={hi} />

      {['cpi', 'cpi_rural', 'cpi_urban'].includes(item.id) && <RuralUrban byId={byId} />}

      <MonthGrid item={item} hist={hist} hi={hi} />
      {item.mode === 'cbdt' && (
        <p className="eb-ru-lead">Part of the <a href="#/direct-taxes">Direct taxes</a> section, with collections by mode of payment, taxpayers by category and the state-wise table.</p>
      )}

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
        {rowsAll.length > 12 && (
          <button type="button" className="eb-btn eb-showall eb-noprint" onClick={() => setAllRows((x) => !x)} aria-expanded={allRows}>
            {allRows ? (hi ? 'केवल हाल के 12 दिखाएँ' : 'Show only the latest 12') : (hi ? `सभी ${rowsAll.length} आंकड़े दिखाएँ` : `Show all ${rowsAll.length} releases`)}
          </button>
        )}
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
