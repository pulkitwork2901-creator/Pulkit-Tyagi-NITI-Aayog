import { useEffect, useState } from 'react';
import { signed } from '../format.js';

// Shared pieces for the export pages: loading, money formatting, ranked bars.

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

export function GrowthPill({ value }) {
  if (value == null) return <span className="eb-muted eb-tr-na">n/a</span>;
  if (Number.isNaN(value)) {
    return <span className="eb-tr-code" title="India revised this 8-digit tariff code this year, so the change on the year before is not like for like.">code revised</span>;
  }
  const tone = value > 0.05 ? 'eb-good' : value < -0.05 ? 'eb-bad' : 'eb-neutral';
  return (
    <span className={`eb-chip ${tone}`}>
      <span aria-hidden="true">{value > 0.05 ? '▲' : value < -0.05 ? '▼' : '▬'}</span> {signed(`${value > 0 ? '+' : ''}${value.toFixed(1)}%`)}
    </span>
  );
}

// Ranked horizontal bars. Each row: label, optional sub-label, value bar,
// value, growth pill and a small full-years trend line.
export function BarList({ rows, periods, index, caption, fullYears }) {
  const max = Math.max(...rows.map((r) => r.v[index] || 0), 1);
  return (
    <ol className="eb-bars" aria-label={caption}>
      {rows.map((r, n) => {
        const val = r.v[index] || 0;
        const spark = fullYears.map((p) => r.v[periods.indexOf(p)] ?? 0);
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
              <span className="eb-bar-g"><GrowthPill value={growth(r.v, index, periods, r.breaks)} /></span>
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

// Fixed-size trend line for ranked rows (full years only).
export function MiniTrend({ values, w = 64, h = 24 }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [2 + (i * (w - 4)) / Math.max(1, values.length - 1), h - 3 - ((v - lo) / span) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="eb-mini" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="var(--eb-s1)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="var(--eb-s1)" />
    </svg>
  );
}

// Annual totals as columns; a partial year is drawn hatched and labelled.
export function YearColumns({ periods, v, partial = [], height = 120 }) {
  const max = Math.max(...v, 1);
  return (
    <div className="eb-cols" style={{ height }} role="img"
      aria-label={periods.map((p, i) => `${p}: ${money(v[i])}`).join('; ')}>
      {periods.map((p, i) => (
        <div key={p} className={`eb-col${partial.includes(p) ? ' eb-col-partial' : ''}`}>
          <span className="eb-col-val">{money(v[i], { short: true })}</span>
          <i style={{ height: `${(v[i] / max) * 100}%` }} />
          <span className="eb-col-lab">{p.replace(' Jan-', '\nJan–')}</span>
        </div>
      ))}
    </div>
  );
}

export function PeriodSwitch({ periods, value, onChange, label = 'Period' }) {
  return (
    <div className="eb-range eb-range-wide" role="group" aria-label={label}>
      {periods.map((p) => (
        <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)}>{p.replace(' Jan-', ' Jan–')}</button>
      ))}
    </div>
  );
}
