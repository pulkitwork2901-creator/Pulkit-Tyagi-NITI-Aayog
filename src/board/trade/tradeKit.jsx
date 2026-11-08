import { useEffect, useState } from 'react';
import { signed } from '../format.js';

// Shared pieces for the trade pages: loading, money formatting, ranked bars.

const cache = new Map();

// Fetches a trade JSON file once per visit; components share the result.
export function useTradeFile(url) {
  const [state, setState] = useState(() => (cache.has(url) ? { data: cache.get(url), error: null } : { data: null, error: null }));
  useEffect(() => {
    if (!url) return undefined;
    if (cache.has(url)) { setState({ data: cache.get(url), error: null }); return undefined; }
    let live = true;
    setState({ data: null, error: null });
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d) => { cache.set(url, d); if (live) setState({ data: d, error: null }); })
      .catch((e) => { if (live) setState({ data: null, error: e.message }); });
    return () => { live = false; };
  }, [url]);
  return state;
}

// US$ million in, readable money out: "US$ 92.3 bn", "US$ 415 mn", "US$ 0.8 mn".
export function money(mn, { short = false } = {}) {
  if (mn == null || Number.isNaN(mn)) return '–';
  const pre = short ? '$' : 'US$ ';
  const a = Math.abs(mn);
  if (a >= 1000) return `${pre}${signed((mn / 1000).toFixed(a >= 100000 ? 0 : 1))} bn`;
  if (a >= 10) return `${pre}${signed(mn.toFixed(0))} mn`;
  return `${pre}${signed(mn.toFixed(1))} mn`;
}

// Growth on the previous period, or null when it cannot be compared:
// partial periods (e.g. "2026 Jan-Aug") are never compared with full years.
// Returns NaN when the HS 8-digit code was revised that year (see build_trade.py).
export function growth(v, i, periods, breaks) {
  if (i < 1 || periods[i].length > 4 || periods[i - 1].length > 4) return null;
  if (breaks && breaks.includes(periods[i])) return NaN;
  const a = v[i - 1];
  const b = v[i];
  if (!a || a <= 0) return null;
  return ((b - a) / a) * 100;
}

// `neutral` drops the good/bad colouring (a rise in imports is neither).
export function GrowthPill({ value, neutral = false }) {
  if (value == null) return <span className="eb-muted eb-tr-na">n/a</span>;
  if (Number.isNaN(value)) {
    return <span className="eb-tr-code" title="India revised this 8-digit tariff code this year, so the change on the year before is not like for like.">code revised</span>;
  }
  const tone = neutral ? 'eb-neutral' : value > 0.05 ? 'eb-good' : value < -0.05 ? 'eb-bad' : 'eb-neutral';
  return (
    <span className={`eb-chip ${tone}`}>
      <span aria-hidden="true">{value > 0.05 ? '▲' : value < -0.05 ? '▼' : '▬'}</span> {signed(`${value > 0 ? '+' : ''}${value.toFixed(1)}%`)}
    </span>
  );
}

// Ranked horizontal bars. Each row: label, optional sub-label, value bar,
// value, growth pill and a small full-years trend line.
export function BarList({ rows, periods, index, caption, fullYears, neutral = false }) {
  const max = Math.max(...rows.map((r) => r.v[index] || 0), 1);
  return (
    <ol className="eb-bars" aria-label={caption}>
      {rows.map((r, n) => {
        const val = r.v[index] || 0;
        const spark = fullYears.map((p) => r.v[periods.indexOf(p)] ?? null);
        const Tag = r.href ? 'a' : 'div';
        return (
          <li key={r.key}>
            <Tag className="eb-bar-row" {...(r.href ? { href: r.href } : {})}>
              <span className="eb-bar-rank" aria-hidden="true">{n + 1}</span>
              <span className="eb-bar-text">
                <span className="eb-bar-label">{r.label}</span>
                {r.sub && <span className="eb-bar-sub">{r.sub}</span>}
                <span className="eb-bar-track" aria-hidden="true"><i style={{ width: `${Math.max(0.5, (val / max) * 100)}%` }} /></span>
              </span>
              <span className="eb-bar-val">{money(val)}{r.share != null && <small>{r.share.toFixed(1)}%</small>}</span>
              <span className="eb-bar-g"><GrowthPill value={growth(r.v, index, periods, r.breaks)} neutral={neutral} /></span>
              <span className="eb-bar-spark" aria-hidden="true">
                <MiniTrend values={spark} />
              </span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}

// Fixed-size trend line for ranked rows (full years only). A missing year
// (null) leaves a gap rather than dropping to zero.
export function MiniTrend({ values, w = 64, h = 24 }) {
  const known = values.filter((v) => v != null);
  if (known.length < 2) return <svg className="eb-mini" width={w} height={h} aria-hidden="true" focusable="false" />;
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const span = hi - lo || 1;
  const x = (i) => 2 + (i * (w - 4)) / Math.max(1, values.length - 1);
  const y = (v) => h - 3 - ((v - lo) / span) * (h - 6);
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const li = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
  return (
    <svg className="eb-mini" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="var(--eb-s1)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(li)} cy={y(values[li])} r="2.5" fill="var(--eb-s1)" />
    </svg>
  );
}

// Annual totals as columns; a partial year is hatched, a missing year is an
// empty outline marked "awaiting".
export function YearColumns({ periods, v, partial = [], missing = [], height = 120 }) {
  const max = Math.max(...v.filter((x) => x != null), 1);
  return (
    <div className="eb-cols" style={{ height }} role="img"
      aria-label={periods.map((p, i) => `${p}: ${missing.includes(p) ? 'data awaited' : money(v[i])}`).join('; ')}>
      {periods.map((p, i) => (missing.includes(p) ? (
        <div key={p} className="eb-col eb-col-missing">
          <span className="eb-col-val">awaiting</span>
          <i style={{ height: '40%' }} />
          <span className="eb-col-lab">{p}</span>
        </div>
      ) : (
        <div key={p} className={`eb-col${partial.includes(p) ? ' eb-col-partial' : ''}`}>
          <span className="eb-col-val">{money(v[i], { short: true })}</span>
          <i style={{ height: `${((v[i] || 0) / max) * 100}%` }} />
          <span className="eb-col-lab">{p.replace(' Jan-', '\nJan–')}</span>
        </div>
      )))}
    </div>
  );
}

// Paired columns: exports and imports per year, with the balance under each pair.
export function PairColumns({ periods, x, m, partial = [], missing = [], height = 190 }) {
  const max = Math.max(...x.filter((v) => v != null), ...m.filter((v) => v != null), 1);
  return (
    <div className="eb-cols eb-pairs" style={{ height }} role="img"
      aria-label={periods.map((p, i) => (missing.includes(p) ? `${p}: data awaited` : `${p}: exports ${money(x[i])}, imports ${money(m[i])}, balance ${money(x[i] - m[i])}`)).join('; ')}>
      {periods.map((p, i) => {
        const gap = missing.includes(p) || x[i] == null || m[i] == null;
        return (
          <div key={p} className={`eb-col eb-pair${partial.includes(p) ? ' eb-col-partial' : ''}${gap ? ' eb-col-missing' : ''}`}>
            <span className={`eb-col-val ${gap ? '' : x[i] - m[i] >= 0 ? 'eb-good' : 'eb-bad'}`}>{gap ? 'awaiting' : `${x[i] - m[i] < 0 ? '−' : '+'}${money(Math.abs(x[i] - m[i]), { short: true })}`}</span>
            <span className="eb-pair-bars">
              <i className="eb-pair-x" style={{ height: `${gap ? 0 : (x[i] / max) * 100}%` }} />
              <i className="eb-pair-m" style={{ height: `${gap ? 40 : (m[i] / max) * 100}%` }} />
            </span>
            <span className="eb-col-lab">{p.replace(' Jan-', '\nJan–')}</span>
          </div>
        );
      })}
    </div>
  );
}

export function PeriodSwitch({ periods, value, onChange, label = 'Period', missing = [] }) {
  return (
    <div className="eb-range eb-range-wide" role="group" aria-label={label}>
      {periods.map((p) => (
        <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)}
          disabled={missing.includes(p)} title={missing.includes(p) ? `${p} data not uploaded yet` : undefined}>
          {p.replace(' Jan-', ' Jan–')}
        </button>
      ))}
    </div>
  );
}
