import { useState } from 'react';
import useWidth from '../useWidth.js';
import { formatValue, niceScale, signed } from '../format.js';

// Charts for the Analysis page (#/analysis), drawn from public/data/models.json.
// Hand-drawn SVG like the rest of the board; every chart has a text summary.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mIndex = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const fx = (v, d = 1) => signed(formatValue(v, d));
const tickDec = (step) => (step >= 1 ? 0 : Math.abs(step * 10 - Math.round(step * 10)) > 1e-6 ? 2 : 1);

function ticksFor(lo, hi, step) {
  const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(Number(v.toFixed(6)));
  return t;
}

// A path through points, broken where a value is missing.
function linePath(pts) {
  let d = '';
  let pen = false;
  for (const [x, y] of pts) {
    if (y == null || Number.isNaN(y)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

// Year labels on a monthly axis, thinned to fit.
function yearTicks(i0, i1, xOf, width) {
  const years = [];
  for (let i = i0; i <= i1; i += 1) if (i % 12 === 0) years.push(i);
  const room = width / Math.max(1, years.length);
  const every = room < 34 ? 3 : room < 44 ? 2 : 1;
  return years.filter((i) => (i / 12) % every === 0).map((i) => ({ i, x: xOf(i), label: String(i / 12) }));
}

export function scrollToId(e, id) {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ------------------------------------------------------------ headline strip

export function HeadlineStrip({ d, short }) {
  const tested = d.forecasts.length + d.tested_not_published.length;
  const f = d.forecasts[0];
  const oil = d.relationships.find((p) => p.x === 'crude_yoy' && p.y === 'cpi');
  const net = d.tax_elasticity.find((r) => r.series === 'net' && r.period.startsWith('2000'));
  const cpi = d.cpi_contributions?.rows?.at(-1);
  const tiles = [
    {
      id: 'an-fc-h', label: 'Series that beat a simple guess', value: `${d.forecasts.length} of ${tested}`,
      sub: d.forecasts.length ? `Only ${d.forecasts.map((x) => x.title).join(', ')} passed the test` : 'None passed the test this time',
    },
    f && {
      id: 'an-fc-h', label: `GST forecast, ${monthLabel(f.forecast[0].month)}`, value: formatValue(f.forecast[0].value, 2), unit: '₹ lakh cr',
      sub: `80% range ${formatValue(f.forecast[0].low, 2)} to ${formatValue(f.forecast[0].high, 2)}; ${monthLabel(f.fit_to)} was ${formatValue(f.history.at(-1).value, 2)}`,
    },
    cpi && {
      id: 'an-cpi-h', label: `Food's share of CPI inflation, ${monthLabel(cpi.month)}`, value: `${formatValue(cpi.food, 1)} of ${formatValue(cpi.headline, 1)}`, unit: 'points',
      sub: `Everything except food and household fuel added ${formatValue(cpi.core, 1)} points`,
    },
    oil && oil.best_lead.lag > 0 && Math.abs(oil.best_lead.r) >= oil.band95 && {
      id: 'an-rel-h', label: `How far ${short.crude_yoy} lead CPI inflation`, value: `${oil.best_lead.lag} months`,
      sub: `Correlation ${oil.best_lead.r} at that lead, ${oil.same_month.r} in the same month`,
    },
    net && {
      id: 'an-el-h', label: 'Direct tax growth for each 1% of nominal GDP growth', value: `${formatValue(net.elasticity, 2)}%`,
      sub: `${net.period}, 95% range ${net.low} to ${net.high}`,
    },
  ].filter(Boolean);
  return (
    <ul className="eb-an-strip" aria-label="Main findings">
      {tiles.map((t) => (
        <li key={t.label} className="eb-an-kpi">
          <a href={`#${t.id}`} onClick={(e) => scrollToId(e, t.id)}>
            <span className="eb-an-kpi-label">{t.label}</span>
            <span className="eb-an-kpi-value">{t.value}{t.unit ? <span className="eb-an-kpi-unit">{t.unit}</span> : null}</span>
            <span className="eb-an-kpi-sub">{t.sub}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ two series over time

// Both series of a pair, each on its own scale; with `lag`, the first series is
// drawn `lag` months later, so a lead shows up as the two lines lining up.
export function PairLines({ p, lag, short }) {
  const [ref, W] = useWidth(420, 240);
  const H = 190;
  const M = { l: 38, r: 38, t: 10, b: 24 };
  const pts = p.series.map((s) => ({ i: mIndex(s.m), x: s.x, y: s.y }));
  const withX = pts.filter((s) => s.x != null);
  const withY = pts.filter((s) => s.y != null);
  const i0 = Math.min(withX[0].i + lag, withY[0].i);
  const i1 = Math.max(withX.at(-1).i + lag, withY.at(-1).i);
  const X = (i) => M.l + ((i - i0) / Math.max(1, i1 - i0)) * (W - M.l - M.r);
  const xs = pts.filter((s) => s.x != null && s.i + lag >= i0).map((s) => s.x);
  const ys = pts.filter((s) => s.y != null && s.i >= i0).map((s) => s.y);
  const [xlo, xhi, xst] = niceScale(Math.min(...xs), Math.max(...xs), 4);
  const [ylo, yhi, yst] = niceScale(Math.min(...ys), Math.max(...ys), 4);
  const YL = (v) => M.t + (1 - (v - xlo) / (xhi - xlo)) * (H - M.t - M.b);
  const YR = (v) => M.t + (1 - (v - ylo) / (yhi - ylo)) * (H - M.t - M.b);
  const xPath = linePath(pts.filter((s) => s.i + lag >= i0).map((s) => [X(s.i + lag), s.x == null ? null : YL(s.x)]));
  const yPath = linePath(pts.filter((s) => s.i >= i0).map((s) => [X(s.i), s.y == null ? null : YR(s.y)]));
  const lastData = withY.at(-1).i;
  const xName = short[p.x] || p.x;
  const yName = short[p.y] || p.y;
  return (
    <div ref={ref} className="eb-an-pair">
      <p className="eb-an-legend">
        <span><i className="eb-an-sw eb-an-sw2" />{p.x_label}{lag ? `, moved ${lag} month${lag > 1 ? 's' : ''} later` : ''} <em>(left scale)</em></span>
        <span><i className="eb-an-sw eb-an-sw1" />{p.y_label} <em>(right scale)</em></span>
      </p>
      <svg width={W} height={H} role="img" aria-label={`${xName} and ${yName} over time${lag ? `, with ${xName} moved ${lag} months later` : ''}`}>
        {ticksFor(xlo, xhi, xst).map((t) => (
          <g key={`l${t}`}>
            <line x1={M.l} x2={W - M.r} y1={YL(t)} y2={YL(t)} className="eb-an-grid" />
            <text x={M.l - 5} y={YL(t) + 4} className="eb-an-axis eb-an-axis2" textAnchor="end">{formatValue(t, tickDec(xst))}</text>
          </g>
        ))}
        {ticksFor(ylo, yhi, yst).map((t) => (
          <text key={`r${t}`} x={W - M.r + 5} y={YR(t) + 4} className="eb-an-axis eb-an-axis1">{formatValue(t, tickDec(yst))}</text>
        ))}
        {yearTicks(i0, i1, X, W - M.l - M.r).map((t) => (
          <text key={t.i} x={t.x} y={H - 6} className="eb-an-axis" textAnchor="middle">{t.label}</text>
        ))}
        {lag > 0 && lastData < i1 && (
          <>
            <rect x={X(lastData)} y={M.t} width={X(i1) - X(lastData)} height={H - M.t - M.b} className="eb-an-ahead" />
            <text x={X(lastData) + 4} y={M.t + 11} className="eb-an-axis">ahead</text>
          </>
        )}
        <path d={xPath} className="eb-an-l2" />
        <path d={yPath} className="eb-an-l1" />
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ forecast track record

export function TrackRecord({ f }) {
  const [h, setH] = useState(1);
  const [ref, W] = useWidth(520, 260);
  const H = 210;
  const M = { l: 40, r: 12, t: 10, b: 24 };
  const rows = (f.track || []).filter((t) => t.h === h);
  if (!rows.length) return null;
  const idx = rows.map((r) => mIndex(r.month));
  const i0 = Math.min(...idx);
  const i1 = Math.max(...idx);
  const vals = rows.flatMap((r) => [r.actual, r.model, r.simple]);
  const [lo, hi, step] = niceScale(Math.min(...vals), Math.max(...vals), 4);
  const X = (i) => M.l + ((i - i0) / Math.max(1, i1 - i0)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const closer = rows.filter((r) => Math.abs(r.model - r.actual) < Math.abs(r.simple - r.actual)).length;
  const bt = f.backtest[String(h)];
  const dec = f.kind === 'seasonal' ? 2 : 1;
  const r = Math.max(2.5, Math.min(4, (W - M.l - M.r) / rows.length / 3));
  return (
    <div ref={ref} className="eb-an-track">
      <div className="eb-an-cardhead">
        <p className="eb-an-legend">
          <span><i className="eb-an-sw eb-an-swnavy" />What happened</span>
          <span><i className="eb-an-dotkey eb-an-dotkey-m" />Model's forecast</span>
          <span><i className="eb-an-dotkey eb-an-dotkey-s" />Simple rule</span>
        </p>
        <div className="eb-range" role="group" aria-label="How far ahead">
          {[1, 3].map((k) => <button key={k} type="button" aria-pressed={h === k} onClick={() => setH(k)}>{k} month{k > 1 ? 's' : ''} ahead</button>)}
        </div>
      </div>
      <svg width={W} height={H} role="img" aria-label={`${f.title}: forecasts made ${h} month${h > 1 ? 's' : ''} ahead during testing, against what happened`}>
        {ticksFor(lo, hi, step).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} className="eb-an-grid" />
            <text x={M.l - 5} y={Y(t) + 4} className="eb-an-axis" textAnchor="end">{formatValue(t, tickDec(step))}</text>
          </g>
        ))}
        {yearTicks(i0, i1, X, W - M.l - M.r).map((t) => <text key={t.i} x={t.x} y={H - 6} className="eb-an-axis" textAnchor="middle">Jan {t.label}</text>)}
        {rows.map((q) => <line key={`e${q.month}`} x1={X(mIndex(q.month))} x2={X(mIndex(q.month))} y1={Y(q.actual)} y2={Y(q.model)} className="eb-an-miss" />)}
        <path d={linePath(rows.map((q) => [X(mIndex(q.month)), Y(q.actual)]))} className="eb-an-lnavy" />
        {rows.map((q) => (
          <g key={q.month}>
            <circle cx={X(mIndex(q.month))} cy={Y(q.simple)} r={r} className="eb-an-pt-s" />
            <circle cx={X(mIndex(q.month))} cy={Y(q.model)} r={r} className="eb-an-pt-m">
              <title>{monthLabel(q.month)} (forecast made in {monthLabel(q.made)}): actual {formatValue(q.actual, dec)}, model {formatValue(q.model, dec)}, simple rule {formatValue(q.simple, dec)}</title>
            </circle>
          </g>
        ))}
      </svg>
      <p className="eb-mc-note">
        Each dot is a forecast the model would have made {h} month{h > 1 ? 's' : ''} earlier, using only the data available then.
        The model was closer than the simple rule in <b>{closer} of {rows.length}</b> months; its average miss was {formatValue(bt.model_mae, dec)} against the rule's {formatValue(bt.simple_mae, dec)} ({f.unit}).
      </p>
    </div>
  );
}

// ------------------------------------------------------------ direct taxes and GDP

const TAX_SERIES = [
  ['net', 'Net direct taxes'],
  ['corporate', 'Corporate tax'],
  ['non_corporate', 'Non-corporate tax'],
];

function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e += 1) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}

export function TaxScatter({ hist, el }) {
  const [key, setKey] = useState('net');
  const [ref, W] = useWidth(560, 260);
  const H = 300;
  const M = { l: 46, r: 14, t: 12, b: 34 };
  const pts = hist.map((h) => ({ fy: h.fy, g: h.gdp / 1e5, t: h[key] / 1e5, prov: h.provisional }));
  const allT = hist.flatMap((h) => TAX_SERIES.map(([k]) => h[k] / 1e5));
  const gLo = Math.min(...pts.map((p) => p.g)) * 0.9;
  const gHi = Math.max(...pts.map((p) => p.g)) * 1.1;
  const tLo = Math.min(...allT) * 0.85;
  const tHi = Math.max(...allT) * 1.15;
  const X = (v) => M.l + ((Math.log(v) - Math.log(gLo)) / (Math.log(gHi) - Math.log(gLo))) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - (Math.log(v) - Math.log(tLo)) / (Math.log(tHi) - Math.log(tLo))) * (H - M.t - M.b);
  const fit = (e, from) => {
    if (!e) return null;
    const sel = pts.filter((p) => p.fy >= from);
    const a = sel[0].g;
    const b = sel.at(-1).g;
    const at = (gl) => Math.exp(e.intercept + e.elasticity * Math.log(gl * 1e5)) / 1e5;
    return `M${X(a).toFixed(1)},${Y(at(a)).toFixed(1)}L${X(b).toFixed(1)},${Y(at(b)).toFixed(1)}`;
  };
  const eLong = el.find((r) => r.series === key && r.period.startsWith('2000'));
  const eRecent = el.find((r) => r.series === key && r.period.startsWith('2014'));
  // Reference: taxes growing exactly in step with GDP from the first year.
  const p0 = pts[0];
  const pN = pts.at(-1);
  const refEnd = p0.t * (pN.g / p0.g);
  const label = new Set([pts[0].fy, '2014-15', pN.fy]);
  return (
    <div ref={ref} className="eb-an-tax">
      <div className="eb-an-cardhead">
        <p className="eb-an-legend">
          <span><i className="eb-an-sw eb-an-sw1" />Fitted, {eLong?.period}: <b>{eLong?.elasticity}</b></span>
          <span><i className="eb-an-sw eb-an-sw2 eb-an-sw-dash" />Fitted, {eRecent?.period}: <b>{eRecent?.elasticity}</b></span>
          <span><i className="eb-an-sw eb-an-swref" />Growing exactly with GDP (1.0)</span>
        </p>
        <div className="eb-range" role="group" aria-label="Which tax">
          {TAX_SERIES.map(([k, l]) => <button key={k} type="button" aria-pressed={key === k} onClick={() => setKey(k)}>{l.replace(' direct taxes', '').replace(' tax', '')}</button>)}
        </div>
      </div>
      <svg width={W} height={H} role="img" aria-label={`${TAX_SERIES.find(([k]) => k === key)[1]} against nominal GDP, each financial year from ${p0.fy} to ${pN.fy}, both on log scales`}>
        {logTicks(tLo, tHi).map((t) => (
          <g key={`t${t}`}>
            <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} className="eb-an-grid" />
            <text x={M.l - 5} y={Y(t) + 4} className="eb-an-axis" textAnchor="end">{formatValue(t, t < 1 ? 1 : 0)}</text>
          </g>
        ))}
        {logTicks(gLo, gHi).map((t) => (
          <g key={`g${t}`}>
            <line x1={X(t)} x2={X(t)} y1={M.t} y2={H - M.b} className="eb-an-grid" />
            <text x={X(t)} y={H - M.b + 14} className="eb-an-axis" textAnchor="middle">{formatValue(t, 0)}</text>
          </g>
        ))}
        <text x={W - M.r} y={H - 4} className="eb-an-axis" textAnchor="end">Nominal GDP, ₹ lakh crore (log scale)</text>
        <text x={M.l} y={M.t + 2} className="eb-an-axis" dx="4" dy="8">Tax, ₹ lakh crore</text>
        <path d={`M${X(p0.g)},${Y(p0.t)}L${X(pN.g)},${Y(refEnd)}`} className="eb-an-ref" />
        <path d={fit(eLong, '2000-01')} className="eb-an-fit1" />
        <path d={fit(eRecent, '2014-15')} className="eb-an-fit2" />
        {pts.map((p) => (
          <g key={p.fy}>
            <circle cx={X(p.g)} cy={Y(p.t)} r="4" className={p.fy >= '2014-15' ? 'eb-an-pt-recent' : 'eb-an-pt-old'}>
              <title>{p.fy}{p.prov ? ' (provisional)' : ''}: tax ₹{formatValue(p.t, 2)} lakh crore, nominal GDP ₹{formatValue(p.g, 1)} lakh crore</title>
            </circle>
            {label.has(p.fy) && <text x={X(p.g) - 6} y={Y(p.t) - 8} className="eb-an-axis eb-an-ptlabel" textAnchor="end">{p.fy}</text>}
          </g>
        ))}
      </svg>
      <p className="eb-mc-note">
        One dot per financial year. On log scales a line's steepness is the elasticity: steeper than the grey line means the tax grew faster than the economy.
        {key === 'corporate' ? ' Corporate tax has been flatter since 2014-15, partly because of the September 2019 rate cut.' : ''}
        {key === 'non_corporate' ? ' Non-corporate tax (mainly personal income tax, including STT) has grown much faster than GDP since 2014-15.' : ''}
      </p>
    </div>
  );
}

// This year's collections against what growth and the elasticities imply.
export function TaxCheck({ check, el }) {
  const [g, setG] = useState(check.gdp_growth ?? 10);
  const [period, setPeriod] = useState('recent');
  const [ref, W] = useWidth(560, 260);
  const rows = check.rows.map((r) => {
    const e = period === 'recent' ? r.elasticity_recent : r.elasticity_long;
    return { ...r, e, mid: e.elasticity * g, lo: e.low * g, hi: e.high * g };
  });
  const xmax = Math.ceil(Math.max(...rows.flatMap((r) => [r.hi, r.actual_growth])) / 5) * 5 + 2;
  const narrow = W < 560;
  const labelW = narrow ? 0 : 210;
  const rowH = narrow ? 52 : 40;
  const M = { l: 8 + labelW, r: 16, t: 18, b: 22 };
  const H = M.t + rows.length * rowH + M.b;
  const X = (v) => M.l + (Math.max(0, v) / xmax) * (W - M.l - M.r);
  const verdict = (r) => (r.actual_growth > r.hi ? 'above' : r.actual_growth < r.lo ? 'below' : 'within');
  const ticks = [];
  for (let v = 0; v <= xmax; v += 5) ticks.push(v);
  return (
    <div ref={ref} className="eb-an-check">
      <div className="eb-an-calc">
        <label htmlFor="an-gdp">Nominal GDP growth this year</label>
        <input id="an-gdp" type="range" min="0" max="20" step="0.1" value={g} onChange={(e) => setG(Number(e.target.value))} />
        <output htmlFor="an-gdp"><b>{formatValue(g, 1)}%</b></output>
        <button type="button" className="eb-an-reset" onClick={() => setG(check.gdp_growth)} disabled={g === check.gdp_growth}>
          Reset to {formatValue(check.gdp_growth, 1)}% ({check.gdp_quarters.join(', ')})
        </button>
        <div className="eb-range" role="group" aria-label="Elasticities from">
          <button type="button" aria-pressed={period === 'recent'} onClick={() => setPeriod('recent')}>Since 2014-15</button>
          <button type="button" aria-pressed={period === 'long'} onClick={() => setPeriod('long')}>Since 2000-01</button>
        </div>
      </div>
      <p className="eb-an-legend">
        <span><i className="eb-an-band-key" />Expected range from the elasticity</span>
        <span><i className="eb-an-dotkey eb-an-dotkey-a" />Actual growth, {check.fy} to {new Date(`${check.as_on}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
      </p>
      <svg width={W} height={H} role="img" aria-label={`Growth in direct taxes so far in ${check.fy} against the growth implied by nominal GDP growth of ${formatValue(g, 1)}%`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={M.t - 6} y2={H - M.b} className="eb-an-grid" />
            <text x={X(t)} y={H - 6} className="eb-an-axis" textAnchor="middle">{t}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y0 = M.t + i * rowH + (narrow ? 28 : rowH / 2);
          const v = verdict(r);
          return (
            <g key={r.series}>
              <text x={narrow ? M.l : 8} y={narrow ? y0 - 13 : y0 + 4} className="eb-an-rowlabel">{r.label}</text>
              <rect x={X(r.lo)} y={y0 - 7} width={Math.max(2, X(r.hi) - X(r.lo))} height="14" rx="3" className="eb-an-band2" />
              <line x1={X(r.mid)} x2={X(r.mid)} y1={y0 - 9} y2={y0 + 9} className="eb-an-mid" />
              <path d={`M${X(r.actual_growth)},${y0 - 7}l7,7l-7,7l-7,-7z`} className={`eb-an-act eb-an-act-${v}`}>
                <title>{r.label}: actual {fx(r.actual_growth)}%, expected about {formatValue(r.mid, 1)}% ({formatValue(r.lo, 1)} to {formatValue(r.hi, 1)})</title>
              </path>
            </g>
          );
        })}
      </svg>
      <div className="eb-tablewrap">
        <table className="eb-table eb-an-checktable">
          <caption className="eb-sr">Direct taxes so far this year against what growth implies</caption>
          <thead><tr><th scope="col">Tax</th><th scope="col" className="eb-num eb-an-modelcol">Elasticity</th><th scope="col" className="eb-num">Expected growth</th><th scope="col" className="eb-num">Actual so far</th><th scope="col" className="eb-an-modelcol">Reading</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const v = verdict(r);
              return (
                <tr key={r.series}>
                  <th scope="row">{r.label}</th>
                  <td className="eb-num eb-an-modelcol">{r.e.elasticity}</td>
                  <td className="eb-num">{formatValue(r.mid, 1)}% <span className="eb-muted">({formatValue(r.lo, 1)} to {formatValue(r.hi, 1)})</span></td>
                  <td className={`eb-num ${v === 'within' ? '' : v === 'above' ? 'eb-good' : 'eb-bad'}`}><b>{fx(r.actual_growth)}%</b></td>
                  <td className={`eb-an-modelcol ${v === 'within' ? '' : v === 'above' ? 'eb-good' : 'eb-bad'}`}>{v === 'within' ? 'In line with growth' : v === 'above' ? 'Running ahead' : 'Running behind'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ CPI contributions

const PARTS = [
  ['food', 'Food and beverages', 'eb-an-c-food'],
  ['fuel', 'Household fuel', 'eb-an-c-fuel'],
  ['core', 'Everything else (core)', 'eb-an-c-core'],
];

export function CpiContrib({ c }) {
  const [span, setSpan] = useState(36);
  const [ref, W] = useWidth(620, 260);
  const H = 260;
  const M = { l: 34, r: 10, t: 12, b: 24 };
  const rows = span ? c.rows.slice(-span) : c.rows;
  const pos = rows.map((r) => PARTS.reduce((s, [k]) => s + Math.max(0, r[k]), 0));
  const neg = rows.map((r) => PARTS.reduce((s, [k]) => s + Math.min(0, r[k]), 0));
  const [lo, hi, step] = niceScale(Math.min(0, ...neg, ...rows.map((r) => r.headline)), Math.max(...pos, ...rows.map((r) => r.headline)), 5);
  const bw = (W - M.l - M.r) / rows.length;
  const X = (i) => M.l + i * bw;
  const Y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const i0 = mIndex(rows[0].month);
  const baseBreak = rows.findIndex((r) => r.base === '2024');
  return (
    <div ref={ref} className="eb-an-cpi">
      <div className="eb-an-cardhead">
        <p className="eb-an-legend">
          {PARTS.map(([k, l, cls]) => <span key={k}><i className={`eb-an-sw-box ${cls}`} />{l}</span>)}
          <span><i className="eb-an-sw eb-an-swnavy" />Headline CPI inflation</span>
        </p>
        <div className="eb-range" role="group" aria-label="Time span">
          {[[36, '3 years'], [0, 'Since 2019']].map(([n, l]) => <button key={l} type="button" aria-pressed={span === n} onClick={() => setSpan(n)}>{l}</button>)}
        </div>
      </div>
      <svg width={W} height={H} role="img" aria-label={`Contributions of food, household fuel and everything else to CPI inflation, ${monthLabel(rows[0].month)} to ${monthLabel(rows.at(-1).month)}`}>
        {ticksFor(lo, hi, step).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} className={t === 0 ? 'eb-an-zero' : 'eb-an-grid'} />
            <text x={M.l - 5} y={Y(t) + 4} className="eb-an-axis" textAnchor="end">{formatValue(t, tickDec(step))}</text>
          </g>
        ))}
        {yearTicks(i0, i0 + rows.length - 1, (i) => X(i - i0) + bw / 2, W - M.l - M.r).map((t) => (
          <text key={t.i} x={t.x} y={H - 6} className="eb-an-axis" textAnchor="middle">{t.label}</text>
        ))}
        {rows.map((r, i) => {
          let up = 0;
          let down = 0;
          return (
            <g key={r.month}>
              {PARTS.map(([k, l, cls]) => {
                const v = r[k];
                const y1 = v >= 0 ? up + v : down;
                const y2 = v >= 0 ? up : down + v;
                if (v >= 0) up += v; else down += v;
                return (
                  <rect key={k} x={X(i) + bw * 0.12} width={Math.max(1, bw * 0.76)} y={Y(y1)} height={Math.max(0, Y(y2) - Y(y1))} className={cls}>
                    <title>{monthLabel(r.month)}: {l} {fx(v, 2)} points of {formatValue(r.headline, 2)}%</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        {baseBreak > 0 && (
          <>
            <line x1={X(baseBreak)} x2={X(baseBreak)} y1={M.t} y2={H - M.b} className="eb-an-now" />
            <text x={X(baseBreak) + 4} y={M.t + 10} className="eb-an-axis">2024 base</text>
          </>
        )}
        <path d={linePath(rows.map((r, i) => [X(i) + bw / 2, Y(r.headline)]))} className="eb-an-lnavy" />
      </svg>
    </div>
  );
}

export function CpiDivisions({ c, headline }) {
  const [ref, W] = useWidth(560, 260);
  const dv = c.divisions;
  if (!dv) return null;
  const rows = [...dv.rows].sort((a, b) => b.inflation - a.inflation);
  const narrow = W < 560;
  const labelW = narrow ? 0 : 250;
  const rowH = narrow ? 42 : 26;
  const M = { l: labelW + 6, r: 48, t: 6, b: 20 };
  const H = M.t + rows.length * rowH + M.b;
  const vals = rows.flatMap((r) => [r.inflation, r.prev ?? 0]);
  const lo = Math.min(0, ...vals);
  const hi = Math.ceil(Math.max(...vals) / 2) * 2;
  const X = (v) => M.l + ((v - lo) / (hi - lo)) * (W - M.l - M.r);
  const ticks = [];
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) ticks.push(v);
  return (
    <div ref={ref} className="eb-an-divs">
      <p className="eb-an-legend">
        <span><i className="eb-an-sw-box eb-an-c-food" />Above headline inflation ({formatValue(headline, 2)}%)</span>
        <span><i className="eb-an-sw-box eb-an-c-core" />Below it</span>
        <span><i className="eb-an-prevkey" />{dv.previous ? monthLabel(dv.previous) : 'Previous month'}</span>
      </p>
      <svg width={W} height={H} role="img" aria-label={`Annual inflation in each CPI spending division, ${monthLabel(dv.month)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={M.t} y2={H - M.b} className={t === 0 ? 'eb-an-zero' : 'eb-an-grid'} />
            <text x={X(t)} y={H - 5} className="eb-an-axis" textAnchor="middle">{t}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y0 = M.t + i * rowH + (narrow ? 26 : rowH / 2);
          const cut = narrow ? 40 : 44;
          const name = r.name.length > cut ? `${r.name.slice(0, cut - 2)}…` : r.name;
          return (
            <g key={r.code}>
              <text x={narrow ? M.l : 4} y={narrow ? y0 - 11 : y0 + 4} className="eb-an-rowlabel eb-an-rowlabel-sm">{name}<title>{r.name}</title></text>
              <rect x={X(Math.min(0, r.inflation))} y={y0 - 6} width={Math.abs(X(r.inflation) - X(0))} height="12" rx="2"
                className={r.inflation > headline ? 'eb-an-c-food' : 'eb-an-c-core'} />
              {r.prev != null && <line x1={X(r.prev)} x2={X(r.prev)} y1={y0 - 8} y2={y0 + 8} className="eb-an-prev" />}
              <text x={X(Math.max(0, r.inflation)) + (r.prev != null && Math.abs(X(r.prev) - X(r.inflation)) < 4 ? 8 : 5)} y={y0 + 4} className="eb-an-axis eb-an-val">{formatValue(r.inflation, 1)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
