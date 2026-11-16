import { useState } from 'react';
import useWidth from '../useWidth.js';
import { formatValue, niceScale, signed } from '../format.js';
import { useLanguage } from '../../i18n.jsx';
import {
  MON, MON_HI, SHORT_HI, LABEL_HI, SERIES_HI, UNIT_HI, CHECK_HI, DIVISION_HI, STATES, INDIA_NAME, INDIA_HI, HEAT_HI, HEAT_UNIT_HI, CATEGORY_HI,
} from './analysisText.js';

// Charts for the Analysis page (#/analysis), drawn from public/data/models.json.
// Hand-drawn SVG like the rest of the board; every chart has a text summary and
// a CSV download. Text is written in English and Hindi here (the board's
// phrase translator cannot handle sentences built from live numbers).

export function useHi() {
  return useLanguage().language === 'hi';
}

export const monthLabel = (m, hi = false) => `${(hi ? MON_HI : MON)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mIndex = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const fx = (v, d = 1) => signed(formatValue(v, d));
const tickDec = (step) => (step >= 1 ? 0 : Math.abs(step * 10 - Math.round(step * 10)) > 1e-6 ? 2 : 1);
const dayLabel = (iso, hi, long = false) => {
  const d = new Date(`${iso}T00:00:00`);
  if (hi) return `${d.getDate()} ${MON_HI[d.getMonth()]}${long ? ` ${d.getFullYear()}` : ''}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}) });
};
export const seriesTitle = (f, hi) => (hi ? SERIES_HI[f.id || f.series] || f.title : f.title);
export const unitText = (u, hi) => (hi ? UNIT_HI[u] || u : u);

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

// ------------------------------------------------------------ CSV download

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// A small button that saves the chart's numbers as a CSV file (UTF-8 with a
// byte order mark, so Excel shows ₹ and Hindi correctly).
export function CsvButton({ name, head, rows }) {
  const hi = useHi();
  const save = () => {
    const text = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button type="button" className="eb-an-csv" onClick={save} title={hi ? 'इस चार्ट के आंकड़े CSV फ़ाइल में सहेजें' : "Save this chart's numbers as a CSV file"}>
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v9m0 0L4.5 6.5M8 10l3.5-3.5M2 12v2.5h12V12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      CSV
    </button>
  );
}

// ------------------------------------------------------------ headline strip

export function HeadlineStrip({ d }) {
  const hi = useHi();
  const tested = d.forecasts.length + d.tested_not_published.length;
  const f = d.forecasts[0];
  const oil = d.relationships.find((p) => p.x === 'crude_yoy' && p.y === 'cpi');
  const net = d.tax_elasticity.find((r) => r.series === 'net' && r.period.startsWith('2000'));
  const cpi = d.cpi_contributions?.rows?.at(-1);
  const names = d.forecasts.map((x) => seriesTitle(x, hi)).join(', ');
  const tiles = [
    {
      id: 'an-fc-h', label: hi ? 'सरल अनुमान से बेहतर रहीं शृंखलाएँ' : 'Series that beat a simple guess',
      value: hi ? `${tested} में से ${d.forecasts.length}` : `${d.forecasts.length} of ${tested}`,
      sub: d.forecasts.length ? (hi ? `केवल ${names} परीक्षण में सफल रहा` : `Only ${names} passed the test`) : (hi ? 'इस बार कोई सफल नहीं रहा' : 'None passed the test this time'),
    },
    f && {
      id: 'an-fc-h', label: hi ? `GST पूर्वानुमान, ${monthLabel(f.forecast[0].month, hi)}` : `GST forecast, ${monthLabel(f.forecast[0].month)}`,
      value: formatValue(f.forecast[0].value, 2), unit: hi ? '₹ लाख करोड़' : '₹ lakh cr',
      sub: hi
        ? `80% दायरा ${formatValue(f.forecast[0].low, 2)} से ${formatValue(f.forecast[0].high, 2)}; ${monthLabel(f.fit_to, hi)} में ${formatValue(f.history.at(-1).value, 2)}`
        : `80% range ${formatValue(f.forecast[0].low, 2)} to ${formatValue(f.forecast[0].high, 2)}; ${monthLabel(f.fit_to)} was ${formatValue(f.history.at(-1).value, 2)}`,
    },
    cpi && {
      id: 'an-cpi-h', label: hi ? `CPI मुद्रास्फीति में खाद्य का हिस्सा, ${monthLabel(cpi.month, hi)}` : `Food's share of CPI inflation, ${monthLabel(cpi.month)}`,
      value: hi ? `${formatValue(cpi.headline, 1)} में से ${formatValue(cpi.food, 1)}` : `${formatValue(cpi.food, 1)} of ${formatValue(cpi.headline, 1)}`,
      unit: hi ? 'अंक' : 'points',
      sub: hi ? `खाद्य और घरेलू ईंधन के अलावा बाकी सब ने ${formatValue(cpi.core, 1)} अंक जोड़े` : `Everything except food and household fuel added ${formatValue(cpi.core, 1)} points`,
    },
    oil && oil.best_lead.lag > 0 && Math.abs(oil.best_lead.r) >= oil.band95 && {
      id: 'an-rel-h', label: hi ? 'तेल की कीमतें CPI मुद्रास्फीति से कितना पहले चलती हैं' : 'How far oil prices lead CPI inflation',
      value: hi ? `${oil.best_lead.lag} महीने` : `${oil.best_lead.lag} months`,
      sub: hi ? `उस अग्रता पर सहसंबंध ${oil.best_lead.r}, उसी महीने में ${oil.same_month.r}` : `Correlation ${oil.best_lead.r} at that lead, ${oil.same_month.r} in the same month`,
    },
    net && {
      id: 'an-el-h', label: hi ? 'सांकेतिक GDP में हर 1% वृद्धि पर प्रत्यक्ष कर में वृद्धि' : 'Direct tax growth for each 1% of nominal GDP growth',
      value: `${formatValue(net.elasticity, 2)}%`,
      sub: hi ? `${net.period}, 95% दायरा ${net.low} से ${net.high}` : `${net.period}, 95% range ${net.low} to ${net.high}`,
    },
  ].filter(Boolean);
  return (
    <ul className="eb-an-strip" aria-label={hi ? 'मुख्य निष्कर्ष' : 'Main findings'}>
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

// ------------------------------------------------------------ economy heat map

// Score from 0 (unusually bad) to 100 (unusually good); null when the
// indicator has no good or bad direction.
const heatScore = (r) => (r.up_is_good == null ? null : r.up_is_good ? r.pct : 100 - r.pct);

function heatStyle(r) {
  const s = heatScore(r);
  if (s == null) return { background: `color-mix(in srgb, var(--eb-s3) ${Math.round((Math.abs(r.pct - 50) / 50) * 32)}%, var(--eb-paper))` };
  const a = Math.round((Math.abs(s - 50) / 50) * 42);
  return { background: `color-mix(in srgb, ${s >= 50 ? 'var(--eb-good)' : 'var(--eb-bad)'} ${a}%, var(--eb-paper))` };
}

function Spark({ v }) {
  if (!v || v.length < 2) return null;
  const W = 100;
  const H = 22;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const X = (i) => (i / (v.length - 1)) * (W - 4) + 2;
  const Y = (x) => H - 3 - ((x - lo) / (hi - lo || 1)) * (H - 6);
  return (
    <svg className="eb-an-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={linePath(v.map((x, i) => [X(i), Y(x)]))} />
      <circle cx={X(v.length - 1)} cy={Y(v.at(-1))} r="2.4" />
    </svg>
  );
}

export const isExtreme = (r) => r.pct <= 10 || r.pct >= 90;

export function EconomyHeat({ rows, groups }) {
  const hi = useHi();
  const [only, setOnly] = useState(() => {
    try { return window.matchMedia('(max-width: 640px)').matches; } catch { return false; }
  });
  const shown = only ? rows.filter(isExtreme) : rows;
  const order = groups.filter((g) => shown.some((r) => r.group === g));
  const csv = rows.map((r) => [r.group, r.label, r.measure, r.value, r.unit, r.period, r.pct, r.n, r.since, r.up_is_good == null ? '' : r.up_is_good ? 'higher is better' : 'lower is better']);
  return (
    <div className="eb-an-heatmap">
      <CsvButton name="economy-heat-map" head={['category', 'indicator', 'measure', 'latest', 'unit', 'period', 'percentile', 'past readings', 'since', 'direction']} rows={csv} />
      <div className="eb-an-cardhead">
        <div className="eb-an-heatkey" aria-hidden="true">
          <span>{hi ? 'सामान्य से बुरा' : 'Worse than usual'}</span>
          <i className="eb-an-heatbar" />
          <span>{hi ? 'सामान्य से बेहतर' : 'Better than usual'}</span>
          <span className="eb-an-heatneutral"><i />{hi ? 'कोई अच्छी या बुरी दिशा नहीं: रंग केवल बताता है कि स्तर कितना असामान्य है' : 'No good or bad direction: shade shows only how unusual'}</span>
        </div>
        <div className="eb-range" role="group" aria-label={hi ? 'कौन से संकेतक दिखाएँ' : 'Which indicators to show'}>
          <button type="button" aria-pressed={!only} onClick={() => setOnly(false)}>{hi ? `सभी ${rows.length}` : `All ${rows.length}`}</button>
          <button type="button" aria-pressed={only} onClick={() => setOnly(true)}>{hi ? `केवल चरम (${rows.filter(isExtreme).length})` : `At an extreme (${rows.filter(isExtreme).length})`}</button>
        </div>
      </div>
      {order.map((g) => (
        <div key={g} className="eb-an-heatgroup">
          <h4>{hi ? CATEGORY_HI[g] || g : g}</h4>
          <ul>
            {shown.filter((r) => r.group === g).map((r) => {
              const above = Math.round(r.pct);
              const cap = hi
                ? `${r.since} से अब तक की ${r.n} रीडिंग में से ${above}% से अधिक`
                : `Higher than ${above}% of ${r.n} readings since ${r.since}`;
              const label = hi ? HEAT_HI[r.id] || r.label : r.label;
              const unit = hi ? HEAT_UNIT_HI[r.unit] || r.unit : r.unit;
              return (
                <li key={r.id} style={heatStyle(r)} className={isExtreme(r) ? 'eb-an-heat-x' : undefined}>
                  <a href={`#/indicator/${r.id}`} title={`${label}: ${formatValue(r.value, r.decimals)} ${unit} (${r.period}). ${cap}.`}>
                    <span className="eb-an-heat-label">{label}</span>
                    <span className="eb-an-heat-value">
                      {r.measure === 'growth' && r.value > 0 ? '+' : ''}{fx(r.value, Math.min(2, r.decimals ?? 1))}
                      <small>{r.measure === 'growth' ? (hi ? '% वार्षिक' : '% on a year') : unit}</small>
                    </span>
                    <Spark v={r.spark} />
                    <span className="eb-an-heat-cap">{cap}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ state inflation tile map

export const stateEn = (s) => (s || '').replace(/ And /g, ' and ').replace(/^The /, '');

export function StateMap({ st }) {
  const hi = useHi();
  const [sector, setSector] = useState('combined');
  const [ref, W] = useWidth(640, 280);
  const rows = st.rows.filter((r) => r.state !== INDIA_NAME && r[sector] != null);
  const india = st.rows.find((r) => r.state === INDIA_NAME);
  const ref0 = india?.[sector];
  const cell = Math.min(64, Math.floor((W - 8) / 8));
  const gap = Math.max(2, Math.round(cell * 0.06));
  const H = cell * 7 + 4;
  const maxDev = Math.max(0.5, ...rows.map((r) => Math.abs(r[sector] - ref0)));
  const fill = (v) => {
    const a = Math.round((Math.abs(v - ref0) / maxDev) * 70) + 8;
    return `color-mix(in srgb, ${v >= ref0 ? 'var(--eb-s2)' : 'var(--eb-s1)'} ${a}%, var(--eb-paper))`;
  };
  const name = (s) => (hi ? STATES[s]?.[3] || s : stateEn(s));
  const sorted = [...rows].sort((a, b) => b[sector] - a[sector]);
  const unmapped = rows.filter((r) => !STATES[r.state]);
  const SECTORS = [['combined', hi ? 'संयुक्त' : 'Combined'], ['rural', hi ? 'ग्रामीण' : 'Rural'], ['urban', hi ? 'शहरी' : 'Urban']];
  const csv = st.rows.map((r) => [r.state, r.combined, r.rural, r.urban, r.prev_combined, r.prev_rural, r.prev_urban]);
  const prevLabel = st.previous ? monthLabel(st.previous, hi) : '';
  return (
    <div ref={ref} className="eb-an-states">
      <CsvButton name={`cpi-inflation-by-state-${st.month}`} head={['state', `combined ${st.month}`, `rural ${st.month}`, `urban ${st.month}`, `combined ${st.previous}`, `rural ${st.previous}`, `urban ${st.previous}`]} rows={csv} />
      <div className="eb-an-cardhead">
        <p className="eb-an-legend">
          <span><i className="eb-an-sw-box eb-an-c-food" />{hi ? `${INDIA_HI} (${formatValue(ref0, 2)}%) से अधिक` : `Above All India (${formatValue(ref0, 2)}%)`}</span>
          <span><i className="eb-an-sw-box eb-an-c-core" />{hi ? 'उससे कम' : 'Below it'}</span>
          <span className="eb-muted">{hi ? 'गहरा रंग = बड़ा अंतर' : 'Darker = further from All India'}</span>
        </p>
        <div className="eb-range" role="group" aria-label={hi ? 'क्षेत्र' : 'Sector'}>
          {SECTORS.map(([k, l]) => <button key={k} type="button" aria-pressed={sector === k} onClick={() => setSector(k)}>{l}</button>)}
        </div>
      </div>
      <svg width={W} height={H} role="img" aria-label={hi ? `राज्यवार CPI मुद्रास्फीति, ${monthLabel(st.month, hi)}` : `CPI inflation by state, ${monthLabel(st.month)}`}>
        {rows.filter((r) => STATES[r.state]).map((r) => {
          const [code, c, row] = STATES[r.state];
          const x = (c - 1) * cell + 4;
          const y = row * cell + 2;
          const v = r[sector];
          const pv = r[`prev_${sector}`];
          const dark = Math.abs(v - ref0) / maxDev > 0.55;
          return (
            <g key={r.state} className="eb-an-tile">
              <rect x={x} y={y} width={cell - gap} height={cell - gap} rx="5" style={{ fill: fill(v) }} />
              <text x={x + (cell - gap) / 2} y={y + (cell - gap) * 0.42} textAnchor="middle" className={`eb-an-tile-code${dark ? ' eb-an-tile-dark' : ''}`}>{code}</text>
              <text x={x + (cell - gap) / 2} y={y + (cell - gap) * 0.78} textAnchor="middle" className={`eb-an-tile-val${dark ? ' eb-an-tile-dark' : ''}`}>{formatValue(v, 1)}</text>
              <title>{name(r.state)}: {formatValue(v, 2)}%{pv != null ? (hi ? ` (${prevLabel} में ${formatValue(pv, 2)}%)` : ` (${prevLabel}: ${formatValue(pv, 2)}%)`) : ''}</title>
            </g>
          );
        })}
      </svg>
      <div className="eb-an-statelists">
        <div>
          <h4>{hi ? 'सबसे ऊँची मुद्रास्फीति' : 'Highest inflation'}</h4>
          <ol>{sorted.slice(0, 5).map((r) => <li key={r.state}><span className="eb-an-sl"><span>{name(r.state)}</span><b>{formatValue(r[sector], 2)}%</b></span></li>)}</ol>
        </div>
        <div>
          <h4>{hi ? 'सबसे कम मुद्रास्फीति' : 'Lowest inflation'}</h4>
          <ol>{sorted.slice(-5).reverse().map((r) => <li key={r.state}><span className="eb-an-sl"><span>{name(r.state)}</span><b>{formatValue(r[sector], 2)}%</b></span></li>)}</ol>
        </div>
      </div>
      {unmapped.length ? <p className="eb-mc-note">{hi ? 'नक्शे में नहीं: ' : 'Not on the map: '}{unmapped.map((r) => `${name(r.state)} ${formatValue(r[sector], 2)}%`).join(', ')}</p> : null}
      <details className="eb-an-more">
        <summary>{hi ? 'सभी राज्य और केंद्र शासित प्रदेश' : 'Every state and union territory'}</summary>
        <div className="eb-tablewrap">
          <table className="eb-table eb-an-statetable">
            <caption className="eb-sr">{hi ? 'राज्यवार CPI मुद्रास्फीति' : 'CPI inflation by state'}</caption>
            <thead><tr>
              <th scope="col">{hi ? 'राज्य' : 'State'}</th>
              {SECTORS.map(([k, l]) => <th key={k} scope="col" className="eb-num">{l}</th>)}
              <th scope="col" className="eb-num">{hi ? `संयुक्त, ${prevLabel}` : `Combined, ${prevLabel}`}</th>
            </tr></thead>
            <tbody>
              {[...(india ? [india] : []), ...[...rows].sort((a, b) => name(a.state).localeCompare(name(b.state)))].map((r) => (
                <tr key={r.state} className={r.state === INDIA_NAME ? 'eb-an-rowstrong' : undefined}>
                  <th scope="row">{r.state === INDIA_NAME ? (hi ? INDIA_HI : INDIA_NAME) : name(r.state)}</th>
                  {SECTORS.map(([k]) => <td key={k} className="eb-num">{r[k] == null ? '–' : formatValue(r[k], 2)}</td>)}
                  <td className="eb-num eb-muted">{r.prev_combined == null ? '–' : formatValue(r.prev_combined, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------ live forecast record

export function ForecastRecord({ rec, nextRelease }) {
  const hi = useHi();
  const pub = rec.entries.filter((e) => e.published);
  const csv = rec.entries.flatMap((e) => e.forecast.map((p) => [e.series, e.published ? 'yes' : 'no', e.made_on, e.data_to, p.month, p.value, p.low, p.high, p.simple, p.actual,
    p.inside == null ? '' : p.inside ? 'inside' : 'outside', p.model_closer == null ? '' : p.model_closer ? 'model' : 'simple rule']));
  return (
    <div className="eb-an-record">
      <CsvButton name="forecast-record" head={['series', 'published', 'made on', 'data to', 'month', 'forecast', 'low (80%)', 'high (80%)', 'simple rule', 'actual', 'actual vs range', 'closer']} rows={csv} />
      <p className="eb-an-verdict">
        {rec.scored
          ? (hi
            ? <>अब तक <b>{rec.scored}</b> प्रकाशित पूर्वानुमानों का मिलान वास्तविक आंकड़ों से हुआ है: <b>{rec.inside}</b> 80% दायरे के भीतर रहे, और <b>{rec.model_closer}</b> में मॉडल सरल नियम से अधिक सटीक रहा।</>
            : <>So far <b>{rec.scored}</b> published forecasts have been checked against the actual figures: <b>{rec.inside}</b> fell inside the 80% range, and the model was closer than the simple rule in <b>{rec.model_closer}</b>.</>)
          : (hi
            ? <>पहला पूर्वानुमान {rec.first_made ? dayLabel(rec.first_made, hi, true) : ''} को सहेजा गया। {nextRelease ? `इसका मिलान तब होगा जब ${monthLabel(nextRelease, hi)} का आधिकारिक आंकड़ा जारी होगा।` : 'इसका मिलान आधिकारिक आंकड़ा जारी होने पर होगा।'}</>
            : <>The first forecast was saved on {rec.first_made ? dayLabel(rec.first_made, false, true) : ''}. {nextRelease ? `It will be scored when the official figure for ${monthLabel(nextRelease)} is published.` : 'It will be scored when the official figure is published.'}</>)}
      </p>
      {pub.map((e) => (
        <div key={e.series + e.data_to} className="eb-tablewrap">
          <table className="eb-table eb-an-rectable">
            <caption>
              {hi
                ? <>{seriesTitle(e, hi)}: {monthLabel(e.data_to, hi)} तक के आंकड़ों से {dayLabel(e.made_on, hi, true)} को बनाया गया पूर्वानुमान</>
                : <>{e.title}: made on {dayLabel(e.made_on, false, true)} from data to {monthLabel(e.data_to)}</>}
            </caption>
            <thead><tr>
              <th scope="col">{hi ? 'महीना' : 'Month'}</th>
              <th scope="col" className="eb-num">{hi ? 'पूर्वानुमान' : 'Forecast'}</th>
              <th scope="col" className="eb-num eb-an-modelcol">{hi ? '80% दायरा' : '80% range'}</th>
              <th scope="col" className="eb-num eb-an-modelcol">{hi ? 'सरल नियम' : 'Simple rule'}</th>
              <th scope="col" className="eb-num">{hi ? 'वास्तविक' : 'Actual'}</th>
              <th scope="col">{hi ? 'परिणाम' : 'Result'}</th>
            </tr></thead>
            <tbody>
              {e.forecast.map((p) => {
                const dec = e.kind === 'seasonal' ? 2 : 1;
                return (
                  <tr key={p.month}>
                    <th scope="row">{monthLabel(p.month, hi)}</th>
                    <td className="eb-num"><b>{formatValue(p.value, dec)}</b></td>
                    <td className="eb-num eb-muted eb-an-modelcol">{formatValue(p.low, dec)}{hi ? ' से ' : ' to '}{formatValue(p.high, dec)}</td>
                    <td className="eb-num eb-muted eb-an-modelcol">{formatValue(p.simple, dec)}</td>
                    <td className="eb-num">{p.actual == null ? <span className="eb-muted">{hi ? 'प्रतीक्षा' : 'Awaited'}</span> : formatValue(p.actual, dec)}</td>
                    <td>
                      {p.actual == null ? <span className="eb-muted">–</span> : (
                        <>
                          <span className={p.inside ? 'eb-good' : 'eb-bad'}>{p.inside ? (hi ? 'दायरे में' : 'Inside range') : (hi ? 'दायरे से बाहर' : 'Outside range')}</span>
                          <span className="eb-muted">{' · '}{p.model_closer ? (hi ? 'मॉडल अधिक सटीक' : 'model closer') : (hi ? 'सरल नियम अधिक सटीक' : 'rule closer')}</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <p className="eb-mc-note">
        {hi
          ? `जाँची गई सभी ${new Set(rec.entries.map((e) => e.series)).size} शृंखलाओं के पूर्वानुमान, जिनमें अप्रकाशित भी शामिल हैं, इसी तरह सहेजे जाते हैं (data/forecast_log.json), ताकि बाद में उनका रिकॉर्ड भी देखा जा सके। हर पूर्वानुमान एक बार सहेजा जाता है और फिर कभी बदला नहीं जाता।`
          : `Forecasts for all ${new Set(rec.entries.map((e) => e.series)).size} series tested, including those not published, are saved the same way (data/forecast_log.json), so their record can be checked too. Each forecast is saved once and never changed afterwards.`}
      </p>
    </div>
  );
}

// ------------------------------------------------------------ two series over time

// Both series of a pair, each on its own scale; with `lag`, the first series is
// drawn `lag` months later, so a lead shows up as the two lines lining up.
export function PairLines({ p, lag, short }) {
  const hi = useHi();
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
  const xName = hi ? SHORT_HI[p.x] : short[p.x] || p.x;
  const yName = hi ? SHORT_HI[p.y] : short[p.y] || p.y;
  const xLabel = hi ? LABEL_HI[p.x] || p.x_label : p.x_label;
  const yLabel = hi ? LABEL_HI[p.y] || p.y_label : p.y_label;
  return (
    <div ref={ref} className="eb-an-pair">
      <p className="eb-an-legend">
        <span><i className="eb-an-sw eb-an-sw2" />{xLabel}{lag ? (hi ? `, ${lag} महीने आगे खिसकाया गया` : `, moved ${lag} month${lag > 1 ? 's' : ''} later`) : ''} <em>{hi ? '(बायाँ पैमाना)' : '(left scale)'}</em></span>
        <span><i className="eb-an-sw eb-an-sw1" />{yLabel} <em>{hi ? '(दायाँ पैमाना)' : '(right scale)'}</em></span>
      </p>
      <svg width={W} height={H} role="img" aria-label={hi ? `समय के साथ ${xName} और ${yName}` : `${xName} and ${yName} over time${lag ? `, with ${xName} moved ${lag} months later` : ''}`}>
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
            <text x={X(lastData) + 4} y={M.t + 11} className="eb-an-axis">{hi ? 'आगे' : 'ahead'}</text>
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
  const hi = useHi();
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
  const [lo, hiV, step] = niceScale(Math.min(...vals), Math.max(...vals), 4);
  const X = (i) => M.l + ((i - i0) / Math.max(1, i1 - i0)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - (v - lo) / (hiV - lo)) * (H - M.t - M.b);
  const closer = rows.filter((r) => Math.abs(r.model - r.actual) < Math.abs(r.simple - r.actual)).length;
  const bt = f.backtest[String(h)];
  const dec = f.kind === 'seasonal' ? 2 : 1;
  const r = Math.max(2.5, Math.min(4, (W - M.l - M.r) / rows.length / 3));
  const csv = (f.track || []).map((t) => [t.h, t.made, t.month, t.actual, t.model, t.simple]);
  return (
    <div ref={ref} className="eb-an-track">
      <CsvButton name={`${f.id}-forecast-tests`} head={['months ahead', 'forecast made in', 'month', 'actual', 'model', 'simple rule']} rows={csv} />
      <div className="eb-an-cardhead">
        <p className="eb-an-legend">
          <span><i className="eb-an-sw eb-an-swnavy" />{hi ? 'वास्तव में क्या हुआ' : 'What happened'}</span>
          <span><i className="eb-an-dotkey eb-an-dotkey-m" />{hi ? 'मॉडल का पूर्वानुमान' : "Model's forecast"}</span>
          <span><i className="eb-an-dotkey eb-an-dotkey-s" />{hi ? 'सरल नियम' : 'Simple rule'}</span>
        </p>
        <div className="eb-range" role="group" aria-label={hi ? 'कितना आगे' : 'How far ahead'}>
          {[1, 3].map((k) => <button key={k} type="button" aria-pressed={h === k} onClick={() => setH(k)}>{hi ? `${k} महीना आगे` : `${k} month${k > 1 ? 's' : ''} ahead`}</button>)}
        </div>
      </div>
      <svg width={W} height={H} role="img" aria-label={hi ? `${seriesTitle(f, hi)}: परीक्षण के दौरान ${h} महीने आगे के पूर्वानुमान बनाम वास्तविक` : `${f.title}: forecasts made ${h} month${h > 1 ? 's' : ''} ahead during testing, against what happened`}>
        {ticksFor(lo, hiV, step).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} className="eb-an-grid" />
            <text x={M.l - 5} y={Y(t) + 4} className="eb-an-axis" textAnchor="end">{formatValue(t, tickDec(step))}</text>
          </g>
        ))}
        {yearTicks(i0, i1, X, W - M.l - M.r).map((t) => <text key={t.i} x={t.x} y={H - 6} className="eb-an-axis" textAnchor="middle">{hi ? `जनवरी ${t.label}` : `Jan ${t.label}`}</text>)}
        {rows.map((q) => <line key={`e${q.month}`} x1={X(mIndex(q.month))} x2={X(mIndex(q.month))} y1={Y(q.actual)} y2={Y(q.model)} className="eb-an-miss" />)}
        <path d={linePath(rows.map((q) => [X(mIndex(q.month)), Y(q.actual)]))} className="eb-an-lnavy" />
        {rows.map((q) => (
          <g key={q.month}>
            <circle cx={X(mIndex(q.month))} cy={Y(q.simple)} r={r} className="eb-an-pt-s" />
            <circle cx={X(mIndex(q.month))} cy={Y(q.model)} r={r} className="eb-an-pt-m">
              <title>{hi
                ? `${monthLabel(q.month, hi)} (पूर्वानुमान ${monthLabel(q.made, hi)} में बना): वास्तविक ${formatValue(q.actual, dec)}, मॉडल ${formatValue(q.model, dec)}, सरल नियम ${formatValue(q.simple, dec)}`
                : `${monthLabel(q.month)} (forecast made in ${monthLabel(q.made)}): actual ${formatValue(q.actual, dec)}, model ${formatValue(q.model, dec)}, simple rule ${formatValue(q.simple, dec)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <p className="eb-mc-note">
        {hi
          ? <>हर बिंदु वह पूर्वानुमान है जो मॉडल {h} महीने पहले, उस समय उपलब्ध आंकड़ों से ही, बनाता। <b>{rows.length} में से {closer}</b> महीनों में मॉडल सरल नियम से अधिक सटीक रहा; उसकी औसत चूक {formatValue(bt.model_mae, dec)} रही, जबकि सरल नियम की {formatValue(bt.simple_mae, dec)} ({unitText(f.unit, hi)})।</>
          : <>Each dot is a forecast the model would have made {h} month{h > 1 ? 's' : ''} earlier, using only the data available then. The model was closer than the simple rule in <b>{closer} of {rows.length}</b> months; its average miss was {formatValue(bt.model_mae, dec)} against the rule's {formatValue(bt.simple_mae, dec)} ({f.unit}).</>}
      </p>
    </div>
  );
}

// ------------------------------------------------------------ direct taxes and GDP

const TAX_SERIES = [
  ['net', 'Net', 'शुद्ध'],
  ['corporate', 'Corporate', 'कॉर्पोरेट'],
  ['non_corporate', 'Non-corporate', 'गैर-कॉर्पोरेट'],
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
  const hi = useHi();
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
  const csv = hist.map((h) => [h.fy, h.gdp, h.net, h.corporate, h.non_corporate, h.provisional ? 'provisional' : '']);
  return (
    <div ref={ref} className="eb-an-tax">
      <CsvButton name="direct-taxes-and-nominal-gdp" head={['financial year', 'nominal GDP (Rs crore)', 'net direct taxes (Rs crore)', 'corporate tax (Rs crore)', 'non-corporate tax incl. STT (Rs crore)', 'note']} rows={csv} />
      <div className="eb-an-cardhead">
        <p className="eb-an-legend">
          <span><i className="eb-an-sw eb-an-sw1" />{hi ? 'अनुमानित रेखा' : 'Fitted'}, {eLong?.period}: <b>{eLong?.elasticity}</b></span>
          <span><i className="eb-an-sw eb-an-sw2 eb-an-sw-dash" />{hi ? 'अनुमानित रेखा' : 'Fitted'}, {eRecent?.period}: <b>{eRecent?.elasticity}</b></span>
          <span><i className="eb-an-sw eb-an-swref" />{hi ? 'ठीक GDP के बराबर वृद्धि (1.0)' : 'Growing exactly with GDP (1.0)'}</span>
        </p>
        <div className="eb-range" role="group" aria-label={hi ? 'कौन सा कर' : 'Which tax'}>
          {TAX_SERIES.map(([k, l, lh]) => <button key={k} type="button" aria-pressed={key === k} onClick={() => setKey(k)}>{hi ? lh : l}</button>)}
        </div>
      </div>
      <svg width={W} height={H} role="img" aria-label={hi ? `${p0.fy} से ${pN.fy} तक हर वित्त वर्ष में कर बनाम सांकेतिक GDP, दोनों लघुगणकीय पैमाने पर` : `Tax against nominal GDP, each financial year from ${p0.fy} to ${pN.fy}, both on log scales`}>
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
        <text x={W - M.r} y={H - 4} className="eb-an-axis" textAnchor="end">{hi ? 'सांकेतिक GDP, ₹ लाख करोड़ (लघुगणकीय पैमाना)' : 'Nominal GDP, ₹ lakh crore (log scale)'}</text>
        <text x={M.l} y={M.t + 2} className="eb-an-axis" dx="4" dy="8">{hi ? 'कर, ₹ लाख करोड़' : 'Tax, ₹ lakh crore'}</text>
        <path d={`M${X(p0.g)},${Y(p0.t)}L${X(pN.g)},${Y(refEnd)}`} className="eb-an-ref" />
        <path d={fit(eLong, '2000-01')} className="eb-an-fit1" />
        <path d={fit(eRecent, '2014-15')} className="eb-an-fit2" />
        {pts.map((p) => (
          <g key={p.fy}>
            <circle cx={X(p.g)} cy={Y(p.t)} r="4" className={p.fy >= '2014-15' ? 'eb-an-pt-recent' : 'eb-an-pt-old'}>
              <title>{hi
                ? `${p.fy}${p.prov ? ' (अनंतिम)' : ''}: कर ₹${formatValue(p.t, 2)} लाख करोड़, सांकेतिक GDP ₹${formatValue(p.g, 1)} लाख करोड़`
                : `${p.fy}${p.prov ? ' (provisional)' : ''}: tax ₹${formatValue(p.t, 2)} lakh crore, nominal GDP ₹${formatValue(p.g, 1)} lakh crore`}</title>
            </circle>
            {label.has(p.fy) && <text x={X(p.g) - 6} y={Y(p.t) - 8} className="eb-an-axis eb-an-ptlabel" textAnchor="end">{p.fy}</text>}
          </g>
        ))}
      </svg>
      <p className="eb-mc-note">
        {hi
          ? <>हर बिंदु एक वित्त वर्ष है। लघुगणकीय पैमाने पर रेखा का ढलान ही लोच है: धूसर रेखा से अधिक ढलान का अर्थ है कि कर अर्थव्यवस्था से तेज़ बढ़ा।
            {key === 'corporate' ? ' 2014-15 के बाद कॉर्पोरेट कर की रेखा अपेक्षाकृत सपाट रही है, आंशिक रूप से सितंबर 2019 की दर कटौती के कारण।' : ''}
            {key === 'non_corporate' ? ' 2014-15 के बाद गैर-कॉर्पोरेट कर (मुख्यतः व्यक्तिगत आयकर, STT सहित) GDP से कहीं तेज़ बढ़ा है।' : ''}</>
          : <>One dot per financial year. On log scales a line's steepness is the elasticity: steeper than the grey line means the tax grew faster than the economy.
            {key === 'corporate' ? ' Corporate tax has been flatter since 2014-15, partly because of the September 2019 rate cut.' : ''}
            {key === 'non_corporate' ? ' Non-corporate tax (mainly personal income tax, including STT) has grown much faster than GDP since 2014-15.' : ''}</>}
      </p>
    </div>
  );
}

// This year's collections against what growth and the elasticities imply.
export function TaxCheck({ check }) {
  const hi = useHi();
  const [g, setG] = useState(check.gdp_growth ?? 10);
  const [period, setPeriod] = useState('recent');
  const [ref, W] = useWidth(560, 260);
  const rows = check.rows.map((r) => {
    const e = period === 'recent' ? r.elasticity_recent : r.elasticity_long;
    return { ...r, e, mid: e.elasticity * g, lo: e.low * g, hi: e.high * g, name: hi ? CHECK_HI[r.series] || r.label : r.label };
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
  const word = { within: hi ? 'वृद्धि के अनुरूप' : 'In line with growth', above: hi ? 'आगे चल रहा है' : 'Running ahead', below: hi ? 'पीछे चल रहा है' : 'Running behind' };
  const csv = rows.map((r) => [r.label, r.e.period, r.e.elasticity, g, r.mid.toFixed(2), r.lo.toFixed(2), r.hi.toFixed(2), r.actual_growth, verdict(r)]);
  return (
    <div ref={ref} className="eb-an-check">
      <CsvButton name={`direct-tax-check-${check.fy}`} head={['tax', 'elasticity period', 'elasticity', 'nominal GDP growth assumed (%)', 'expected growth (%)', 'low (%)', 'high (%)', `actual growth to ${check.as_on} (%)`, 'reading']} rows={csv} />
      <div className="eb-an-calc">
        <label htmlFor="an-gdp">{hi ? 'इस वर्ष सांकेतिक GDP वृद्धि' : 'Nominal GDP growth this year'}</label>
        <input id="an-gdp" type="range" min="0" max="20" step="0.1" value={g} onChange={(e) => setG(Number(e.target.value))} />
        <output htmlFor="an-gdp"><b>{formatValue(g, 1)}%</b></output>
        <button type="button" className="eb-an-reset" onClick={() => setG(check.gdp_growth)} disabled={g === check.gdp_growth}>
          {hi ? `${formatValue(check.gdp_growth, 1)}% पर लौटें (${check.gdp_quarters.join(', ')})` : `Reset to ${formatValue(check.gdp_growth, 1)}% (${check.gdp_quarters.join(', ')})`}
        </button>
        <div className="eb-range" role="group" aria-label={hi ? 'लोच किस अवधि से' : 'Elasticities from'}>
          <button type="button" aria-pressed={period === 'recent'} onClick={() => setPeriod('recent')}>{hi ? '2014-15 से' : 'Since 2014-15'}</button>
          <button type="button" aria-pressed={period === 'long'} onClick={() => setPeriod('long')}>{hi ? '2000-01 से' : 'Since 2000-01'}</button>
        </div>
      </div>
      <p className="eb-an-legend">
        <span><i className="eb-an-band-key" />{hi ? 'लोच के आधार पर अपेक्षित दायरा' : 'Expected range from the elasticity'}</span>
        <span><i className="eb-an-dotkey eb-an-dotkey-a" />{hi ? `वास्तविक वृद्धि, ${check.fy}, ${dayLabel(check.as_on, hi)} तक` : `Actual growth, ${check.fy} to ${dayLabel(check.as_on, false)}`}</span>
      </p>
      <svg width={W} height={H} role="img" aria-label={hi ? `${check.fy} में अब तक प्रत्यक्ष करों की वृद्धि बनाम ${formatValue(g, 1)}% सांकेतिक GDP वृद्धि से अपेक्षित वृद्धि` : `Growth in direct taxes so far in ${check.fy} against the growth implied by nominal GDP growth of ${formatValue(g, 1)}%`}>
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
              <text x={narrow ? M.l : 8} y={narrow ? y0 - 13 : y0 + 4} className="eb-an-rowlabel">{r.name}</text>
              <rect x={X(r.lo)} y={y0 - 7} width={Math.max(2, X(r.hi) - X(r.lo))} height="14" rx="3" className="eb-an-band2" />
              <line x1={X(r.mid)} x2={X(r.mid)} y1={y0 - 9} y2={y0 + 9} className="eb-an-mid" />
              <path d={`M${X(r.actual_growth)},${y0 - 7}l7,7l-7,7l-7,-7z`} className={`eb-an-act eb-an-act-${v}`}>
                <title>{hi
                  ? `${r.name}: वास्तविक ${fx(r.actual_growth)}%, अपेक्षित लगभग ${formatValue(r.mid, 1)}% (${formatValue(r.lo, 1)} से ${formatValue(r.hi, 1)})`
                  : `${r.name}: actual ${fx(r.actual_growth)}%, expected about ${formatValue(r.mid, 1)}% (${formatValue(r.lo, 1)} to ${formatValue(r.hi, 1)})`}</title>
              </path>
            </g>
          );
        })}
      </svg>
      <div className="eb-tablewrap">
        <table className="eb-table eb-an-checktable">
          <caption className="eb-sr">{hi ? 'इस वर्ष अब तक प्रत्यक्ष कर बनाम वृद्धि से अपेक्षित' : 'Direct taxes so far this year against what growth implies'}</caption>
          <thead><tr>
            <th scope="col">{hi ? 'कर' : 'Tax'}</th>
            <th scope="col" className="eb-num eb-an-modelcol">{hi ? 'लोच' : 'Elasticity'}</th>
            <th scope="col" className="eb-num">{hi ? 'अपेक्षित वृद्धि' : 'Expected growth'}</th>
            <th scope="col" className="eb-num">{hi ? 'अब तक वास्तविक' : 'Actual so far'}</th>
            <th scope="col" className="eb-an-modelcol">{hi ? 'आकलन' : 'Reading'}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const v = verdict(r);
              const cls = v === 'within' ? '' : v === 'above' ? 'eb-good' : 'eb-bad';
              return (
                <tr key={r.series}>
                  <th scope="row">{r.name}</th>
                  <td className="eb-num eb-an-modelcol">{r.e.elasticity}</td>
                  <td className="eb-num">{formatValue(r.mid, 1)}% <span className="eb-muted">({formatValue(r.lo, 1)}{hi ? ' से ' : ' to '}{formatValue(r.hi, 1)})</span></td>
                  <td className={`eb-num ${cls}`}><b>{fx(r.actual_growth)}%</b></td>
                  <td className={`eb-an-modelcol ${cls}`}>{word[v]}</td>
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
  ['food', 'Food and beverages', 'खाद्य और पेय पदार्थ', 'eb-an-c-food'],
  ['fuel', 'Household fuel', 'घरेलू ईंधन', 'eb-an-c-fuel'],
  ['core', 'Everything else (core)', 'बाकी सब (कोर)', 'eb-an-c-core'],
];

export function CpiContrib({ c }) {
  const hi = useHi();
  const [span, setSpan] = useState(36);
  const [ref, W] = useWidth(620, 260);
  const H = 260;
  const M = { l: 34, r: 10, t: 12, b: 24 };
  const rows = span ? c.rows.slice(-span) : c.rows;
  const pos = rows.map((r) => PARTS.reduce((s, [k]) => s + Math.max(0, r[k]), 0));
  const neg = rows.map((r) => PARTS.reduce((s, [k]) => s + Math.min(0, r[k]), 0));
  const [lo, hiV, step] = niceScale(Math.min(0, ...neg, ...rows.map((r) => r.headline)), Math.max(...pos, ...rows.map((r) => r.headline)), 5);
  const bw = (W - M.l - M.r) / rows.length;
  const X = (i) => M.l + i * bw;
  const Y = (v) => M.t + (1 - (v - lo) / (hiV - lo)) * (H - M.t - M.b);
  const i0 = mIndex(rows[0].month);
  const baseBreak = rows.findIndex((r) => r.base === '2024');
  const csv = c.rows.map((r) => [r.month, r.base, r.headline, r.food, r.fuel, r.core, r.food_infl, r.fuel_infl]);
  return (
    <div ref={ref} className="eb-an-cpi">
      <CsvButton name="cpi-inflation-contributions" head={['month', 'CPI base', 'headline inflation (%)', 'food and beverages (points)', 'household fuel (points)', 'everything else (points)', 'food inflation (%)', 'household fuel inflation (%)']} rows={csv} />
      <div className="eb-an-cardhead">
        <p className="eb-an-legend">
          {PARTS.map(([k, l, lh, cls]) => <span key={k}><i className={`eb-an-sw-box ${cls}`} />{hi ? lh : l}</span>)}
          <span><i className="eb-an-sw eb-an-swnavy" />{hi ? 'मुख्य CPI मुद्रास्फीति' : 'Headline CPI inflation'}</span>
        </p>
        <div className="eb-range" role="group" aria-label={hi ? 'समय अवधि' : 'Time span'}>
          {[[36, '3 years', '3 वर्ष'], [0, 'Since 2019', '2019 से']].map(([n, l, lh]) => <button key={l} type="button" aria-pressed={span === n} onClick={() => setSpan(n)}>{hi ? lh : l}</button>)}
        </div>
      </div>
      <svg width={W} height={H} role="img" aria-label={hi ? `CPI मुद्रास्फीति में खाद्य, घरेलू ईंधन और बाकी सब का योगदान, ${monthLabel(rows[0].month, hi)} से ${monthLabel(rows.at(-1).month, hi)}` : `Contributions of food, household fuel and everything else to CPI inflation, ${monthLabel(rows[0].month)} to ${monthLabel(rows.at(-1).month)}`}>
        {ticksFor(lo, hiV, step).map((t) => (
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
              {PARTS.map(([k, l, lh, cls]) => {
                const v = r[k];
                const y1 = v >= 0 ? up + v : down;
                const y2 = v >= 0 ? up : down + v;
                if (v >= 0) up += v; else down += v;
                return (
                  <rect key={k} x={X(i) + bw * 0.12} width={Math.max(1, bw * 0.76)} y={Y(y1)} height={Math.max(0, Y(y2) - Y(y1))} className={cls}>
                    <title>{hi
                      ? `${monthLabel(r.month, hi)}: ${lh} ${fx(v, 2)} अंक, कुल ${formatValue(r.headline, 2)}% में से`
                      : `${monthLabel(r.month)}: ${l} ${fx(v, 2)} points of ${formatValue(r.headline, 2)}%`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        {baseBreak > 0 && (
          <>
            <line x1={X(baseBreak)} x2={X(baseBreak)} y1={M.t} y2={H - M.b} className="eb-an-now" />
            <text x={X(baseBreak) + 4} y={M.t + 10} className="eb-an-axis">{hi ? '2024 आधार' : '2024 base'}</text>
          </>
        )}
        <path d={linePath(rows.map((r, i) => [X(i) + bw / 2, Y(r.headline)]))} className="eb-an-lnavy" />
      </svg>
    </div>
  );
}

export function CpiDivisions({ c, headline }) {
  const hi = useHi();
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
  const top = Math.ceil(Math.max(...vals) / 2) * 2;
  const X = (v) => M.l + ((v - lo) / (top - lo)) * (W - M.l - M.r);
  const ticks = [];
  for (let v = Math.ceil(lo / 2) * 2; v <= top; v += 2) ticks.push(v);
  const csv = dv.rows.map((r) => [r.code, r.name, r.index, r.inflation, r.prev]);
  return (
    <div ref={ref} className="eb-an-divs">
      <CsvButton name={`cpi-divisions-${dv.month}`} head={['code', 'division', `index ${dv.month}`, `inflation ${dv.month} (%)`, `inflation ${dv.previous} (%)`]} rows={csv} />
      <p className="eb-an-legend">
        <span><i className="eb-an-sw-box eb-an-c-food" />{hi ? `मुख्य मुद्रास्फीति (${formatValue(headline, 2)}%) से ऊपर` : `Above headline inflation (${formatValue(headline, 2)}%)`}</span>
        <span><i className="eb-an-sw-box eb-an-c-core" />{hi ? 'उससे नीचे' : 'Below it'}</span>
        <span><i className="eb-an-prevkey" />{dv.previous ? monthLabel(dv.previous, hi) : (hi ? 'पिछला महीना' : 'Previous month')}</span>
      </p>
      <svg width={W} height={H} role="img" aria-label={hi ? `CPI के हर व्यय प्रभाग में वार्षिक मुद्रास्फीति, ${monthLabel(dv.month, hi)}` : `Annual inflation in each CPI spending division, ${monthLabel(dv.month)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={M.t} y2={H - M.b} className={t === 0 ? 'eb-an-zero' : 'eb-an-grid'} />
            <text x={X(t)} y={H - 5} className="eb-an-axis" textAnchor="middle">{t}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y0 = M.t + i * rowH + (narrow ? 26 : rowH / 2);
          const cut = narrow ? 40 : 44;
          const full = hi ? DIVISION_HI[r.code] || r.name : r.name;
          const name = full.length > cut ? `${full.slice(0, cut - 2)}…` : full;
          return (
            <g key={r.code}>
              <text x={narrow ? M.l : 4} y={narrow ? y0 - 11 : y0 + 4} className="eb-an-rowlabel eb-an-rowlabel-sm">{name}<title>{full}</title></text>
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
