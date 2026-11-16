import { useState } from 'react';
import useWidth from '../useWidth.js';
import { formatValue, niceScale, signed } from '../format.js';
import { useTradeFile } from '../trade/tradeKit.jsx';
import {
  HeadlineStrip, PairLines, TrackRecord, TaxScatter, TaxCheck, CpiContrib, CpiDivisions, EconomyHeat, StateMap, ForecastRecord,
  CsvButton, useHi, monthLabel, seriesTitle, unitText, stateEn, 
} from './analysisCharts.jsx';
import { SHORT, SHORT_HI, LABEL_HI, PAIR_HI, TAX_HI, STATES, HEAT_HI } from './analysisText.js';

// Forecasts, relationships and tax elasticity, from public/data/models.json
// (written by scripts/build_models.py). Every number here is a statistical
// summary of past data, tested where it can be, never an official forecast.
// Text is written in English and Hindi (the board's language switch).

const CATEGORIES = ['Growth and jobs', 'Prices and inflation', 'Interest rates and monetary policy', 'Banking and credit',
  'Government finances', 'Direct taxes', 'Trade and current account', 'Capital flows, reserves and the rupee'];

const fx1 = (v) => (v == null ? 'n.a.' : `${v > 0 ? '+' : ''}${signed(formatValue(v, 1))}`);
const pctSigned = (v) => (v == null ? 'n.a.' : `${v > 0 ? '+' : ''}${signed(formatValue(v, 0))}%`);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function strength(r, band, hi) {
  const a = Math.abs(r);
  if (a < band) return hi ? 'कोई भरोसेमंद संबंध नहीं' : 'no reliable link';
  if (a < 0.3) return hi ? 'कमज़ोर संबंध' : 'a weak link';
  if (a < 0.6) return hi ? 'मध्यम संबंध' : 'a moderate link';
  return hi ? 'मज़बूत संबंध' : 'a strong link';
}

// History, forecast and 80% range for one series.
function ForecastChart({ f }) {
  const hi = useHi();
  const [ref, W] = useWidth(520, 260);
  const H = 220;
  const M = { l: 44, r: 16, t: 12, b: 28 };
  const hist = f.history;
  const fc = f.forecast;
  const all = [...hist.map((p) => p.value), ...fc.map((p) => p.low), ...fc.map((p) => p.high)];
  const [lo, top, step] = niceScale(Math.min(...all), Math.max(...all), 4);
  const n = hist.length + fc.length;
  const x = (i) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const y = (v) => M.t + (1 - (v - lo) / (top - lo)) * (H - M.t - M.b);
  const ticks = [];
  for (let v = lo; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  const months = [...hist.map((p) => p.month), ...fc.map((p) => p.month)];
  const last = hist.length - 1;
  // Label every 6 months, or every 12 or 24 when the chart is too narrow for
  // "Jul 2024"-width labels to sit apart (about 60px each; Hindi month names are longer).
  const perMonth = (W - M.l - M.r) / (n - 1);
  let every = 6;
  while (every * perMonth < (hi ? 76 : 60) && every < 24) every *= 2;
  const showMonth = (m) => (Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1) % every === 0;
  const histPath = hist.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const fcPath = [`M${x(last).toFixed(1)},${y(hist[last].value).toFixed(1)}`, ...fc.map((p, i) => `L${x(last + 1 + i).toFixed(1)},${y(p.value).toFixed(1)}`)].join('');
  const band = [
    `M${x(last).toFixed(1)},${y(hist[last].value).toFixed(1)}`,
    ...fc.map((p, i) => `L${x(last + 1 + i).toFixed(1)},${y(p.high).toFixed(1)}`),
    ...fc.slice().reverse().map((p, i) => `L${x(n - 1 - i).toFixed(1)},${y(p.low).toFixed(1)}`),
    'Z',
  ].join('');
  const fmt = (v) => formatValue(v, f.kind === 'seasonal' ? 2 : 1);
  const csv = [...hist.map((p) => [p.month, 'actual', p.value, '', '']), ...fc.map((p) => [p.month, 'forecast', p.value, p.low, p.high])];
  return (
    <div ref={ref} className="eb-an-chart">
      <CsvButton name={`${f.id}-forecast`} head={['month', 'type', `value (${f.unit})`, 'low (80%)', 'high (80%)']} rows={csv} />
      <svg width={W} height={H} role="img" aria-label={hi ? `${seriesTitle(f, hi)}: पिछले 36 महीने और अगले ${fc.length} महीनों का पूर्वानुमान` : `${f.title}: last 36 months and forecast for the next ${fc.length} months`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="eb-an-grid" />
            <text x={M.l - 6} y={y(t) + 4} className="eb-an-axis" textAnchor="end">{formatValue(t, step < 1 ? 1 : 0)}</text>
          </g>
        ))}
        {months.map((m, i) => (showMonth(m) ? (
          <text key={m} x={x(i)} y={H - 8} className="eb-an-axis" textAnchor="middle">{monthLabel(m, hi)}</text>
        ) : null))}
        <line x1={x(last)} x2={x(last)} y1={M.t} y2={H - M.b} className="eb-an-now" />
        <path d={band} className="eb-an-band" />
        <path d={histPath} className="eb-an-hist" />
        <path d={fcPath} className="eb-an-fc" />
        <circle cx={x(last)} cy={y(hist[last].value)} r="3.5" className="eb-an-dot" />
      </svg>
      <div className="eb-tablewrap">
        <table className="eb-table eb-an-fctable">
          <caption className="eb-sr">{hi ? `${seriesTitle(f, hi)}: 80% दायरे के साथ पूर्वानुमान` : `${f.title}: forecast with 80% range`}</caption>
          <thead><tr><th scope="col">{hi ? 'महीना' : 'Month'}</th>{fc.map((p) => <th key={p.month} scope="col" className="eb-num">{monthLabel(p.month, hi)}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">{hi ? 'पूर्वानुमान' : 'Forecast'}</th>{fc.map((p) => <td key={p.month} className="eb-num"><b>{fmt(p.value)}</b></td>)}</tr>
            <tr><th scope="row">{hi ? '80% दायरा' : '80% range'}</th>{fc.map((p) => <td key={p.month} className="eb-num eb-muted">{fmt(p.low)}{hi ? ' से ' : ' to '}{fmt(p.high)}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkillCell({ b, hi }) {
  if (!b || b.skill_pct == null) return <td className="eb-num eb-muted">n.a.</td>;
  const cls = b.skill_pct > 0 ? 'eb-good' : b.skill_pct < 0 ? 'eb-bad' : 'eb-muted';
  const tip = hi ? `औसत चूक: मॉडल ${b.model_mae}, सरल नियम ${b.simple_mae} (${b.tests} परीक्षण)` : `Average error: model ${b.model_mae}, simple rule ${b.simple_mae} (${b.tests} tests)`;
  return <td className={`eb-num ${cls}`} title={tip}>{pctSigned(b.skill_pct)}</td>;
}

function SkillTable({ rows }) {
  const hi = useHi();
  const csv = rows.map((r) => [r.title, r.model, r.backtest?.['1']?.skill_pct, r.backtest?.['3']?.skill_pct, r.backtest?.['6']?.skill_pct, r.beats_simple_rule ? 'yes' : 'no']);
  return (
    <div className="eb-an-skill">
      <CsvButton name="forecast-tests" head={['series', 'model', 'skill 1 month (%)', 'skill 3 months (%)', 'skill 6 months (%)', 'published']} rows={csv} />
      <div className="eb-tablewrap">
        <table className="eb-table">
          <caption className="eb-sr">{hi ? 'हर मॉडल का सरल नियम के मुकाबले प्रदर्शन' : 'How each model did against a simple rule'}</caption>
          <thead>
            <tr>
              <th scope="col">{hi ? 'शृंखला' : 'Series'}</th><th scope="col" className="eb-an-modelcol">{hi ? 'मॉडल' : 'Model'}</th>
              <th scope="col" className="eb-num">{hi ? '1 महीना आगे' : '1 month ahead'}</th><th scope="col" className="eb-num">{hi ? '3 महीने' : '3 months'}</th><th scope="col" className="eb-num">{hi ? '6 महीने' : '6 months'}</th>
              <th scope="col">{hi ? 'प्रकाशित?' : 'Shown?'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{seriesTitle(r, hi)}</th>
                <td className="eb-muted eb-an-modelcol">{r.model || '–'}</td>
                {r.backtest ? <><SkillCell b={r.backtest['1']} hi={hi} /><SkillCell b={r.backtest['3']} hi={hi} /><SkillCell b={r.backtest['6']} hi={hi} /></> : <td colSpan={3} className="eb-muted">{r.reason}</td>}
                <td>{r.beats_simple_rule ? <b>{hi ? 'हाँ' : 'Yes'}</b> : <span className="eb-muted">{hi ? 'नहीं' : 'No'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Correlation at each lead or lag: bars above or below zero, with the 95% line.
function LagChart({ p }) {
  const hi = useHi();
  const [ref, W] = useWidth(420, 240);
  const H = 150;
  const M = { l: 30, r: 8, t: 10, b: 30 };
  const lags = p.lags;
  const bw = (W - M.l - M.r) / lags.length;
  const y = (r) => M.t + (1 - (r + 1) / 2) * (H - M.t - M.b);
  const xs = hi ? SHORT_HI[p.x] : SHORT[p.x];
  const ys = hi ? SHORT_HI[p.y] : SHORT[p.y];
  return (
    <div ref={ref} className="eb-an-lag">
      <svg width={W} height={H} role="img" aria-label={hi ? `${xs} और ${ys} का 12 महीने तक की अग्रता और पश्चता पर सहसंबंध` : `Correlation of ${xs} with ${ys} at leads and lags of up to 12 months`}>
        {[-1, -0.5, 0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'eb-an-zero' : 'eb-an-grid'} />
            <text x={M.l - 4} y={y(t) + 4} className="eb-an-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={y(p.band95)} y2={y(p.band95)} className="eb-an-sig" />
        <line x1={M.l} x2={W - M.r} y1={y(-p.band95)} y2={y(-p.band95)} className="eb-an-sig" />
        {lags.map((c, i) => (
          <rect key={c.lag} x={M.l + i * bw + 1} width={Math.max(1, bw - 2)}
            y={Math.min(y(c.r), y(0))} height={Math.abs(y(c.r) - y(0))}
            className={`${Math.abs(c.r) >= p.band95 ? 'eb-an-bar' : 'eb-an-bar-weak'}${c.lag === p.best_lead.lag ? ' eb-an-bar-best' : ''}`}>
            <title>{c.lag > 0 ? (hi ? `${xs} ${c.lag} महीने पहले` : `${xs} ${c.lag} months earlier`) : c.lag < 0 ? (hi ? `${ys} ${-c.lag} महीने पहले` : `${ys} ${-c.lag} months earlier`) : (hi ? 'उसी महीने' : 'same month')}: r = {c.r}</title>
          </rect>
        ))}
        <text x={M.l} y={H - 8} className="eb-an-axis">{hi ? `पहले ${ys}` : `${ys} first`}</text>
        <text x={M.l + (W - M.l - M.r) / 2} y={H - 8} className="eb-an-axis" textAnchor="middle">{hi ? 'उसी महीने' : 'same month'}</text>
        <text x={W - M.r} y={H - 8} className="eb-an-axis" textAnchor="end">{hi ? `पहले ${xs}` : `${xs} first`}</text>
      </svg>
    </div>
  );
}

function PairCard({ p }) {
  const hi = useHi();
  const s = p.same_month;
  const b = p.best_lead;
  const xs = hi ? SHORT_HI[p.x] : SHORT[p.x] || p.x;
  const ys = hi ? SHORT_HI[p.y] : SHORT[p.y] || p.y;
  const better = b.lag > 0 && Math.abs(b.r) > Math.abs(s.r) + 0.05 && Math.abs(b.r) >= p.band95;
  const [shift, setShift] = useState(better);
  const [whyHi, cautionHi] = PAIR_HI[`${p.x}|${p.y}`] || [p.why, p.caution];
  const why = hi ? whyHi : p.why;
  const caution = hi ? cautionHi : p.caution;
  const xl = hi ? LABEL_HI[p.x] || p.x_label : p.x_label;
  const yl = hi ? LABEL_HI[p.y] || p.y_label : p.y_label;
  const months = b.lag > 1 ? 'months' : 'month';
  return (
    <section className="eb-mc eb-an-card">
      <h3 className="eb-mc-title">{hi ? `${xs} और ${ys}` : `${cap(xs)} and ${ys}`}</h3>
      {p.series?.length ? <CsvButton name={`${p.x}-and-${p.y}`} head={['month', p.x_label, p.y_label]} rows={p.series.map((r) => [r.m, r.x, r.y])} /> : null}
      <p className="eb-an-verdict">
        {hi
          ? <>उसी महीने में <strong>{strength(s.r, p.band95, hi)}</strong> है (r = {s.r}){Math.abs(s.r) >= p.band95 ? `: दोनों ${s.r > 0 ? 'साथ-साथ चलते हैं' : 'विपरीत दिशाओं में चलते हैं'}` : ''}।
            {better ? <> संबंध सबसे मज़बूत तब है जब <strong>{xs} लगभग {b.lag} महीने पहले चलती हैं</strong> (r = {b.r})।</> : null}</>
          : <>In the same month there is <strong>{strength(s.r, p.band95)}</strong> (r = {s.r}){Math.abs(s.r) >= p.band95 ? `: they ${s.r > 0 ? 'move together' : 'move in opposite directions'}` : ''}.
            {better ? <> The link is strongest when <strong>{xs} move{xs.endsWith('s') ? '' : 's'} first, by about {b.lag} {months}</strong> (r = {b.r}).</> : null}</>}
      </p>
      {p.unexpected && (
        <p className="eb-an-warn">
          {hi
            ? <><b>अर्थशास्त्र की अपेक्षा के विपरीत।</b> सिद्धांत के अनुसार {xs} और {ys} को {p.expected > 0 ? 'साथ-साथ' : 'विपरीत दिशाओं में'} चलना चाहिए; यहाँ सबसे स्पष्ट संबंध उल्टी दिशा में है, इसलिए इसे कारण और प्रभाव नहीं, बल्कि साझा चक्र के रूप में पढ़ें।</>
            : <><b>Opposite to what economics expects.</b> Theory says {xs} and {ys} should {p.expected > 0 ? 'move together' : 'move in opposite directions'}; here the clearest link runs the other way, so read it as a shared cycle, not cause and effect.</>}
        </p>
      )}
      {p.series?.length ? (
        <>
          {better && (
            <div className="eb-range eb-an-shift" role="group" aria-label={hi ? 'दोनों शृंखलाओं को मिलाएँ' : 'Line up the two series'}>
              <button type="button" aria-pressed={!shift} onClick={() => setShift(false)}>{hi ? 'उसी महीने' : 'Same month'}</button>
              <button type="button" aria-pressed={shift} onClick={() => setShift(true)}>{hi ? `${xs}, ${b.lag} महीने पहले की` : `${cap(xs)} ${b.lag} ${months} earlier`}</button>
            </div>
          )}
          <PairLines p={p} lag={shift ? b.lag : 0} short={SHORT} />
        </>
      ) : null}
      <details className="eb-an-more">
        <summary>{hi ? 'हर अग्रता और पश्चता पर सहसंबंध' : 'Correlation at each lead and lag'}</summary>
        <LagChart p={p} />
      </details>
      <p className="eb-mc-note"><b>{hi ? 'क्यों देखें:' : 'Why look:'}</b> {why} {caution ? <><b>{hi ? 'सावधानी:' : 'Caution:'}</b> {caution}</> : null}</p>
      <p className="eb-mc-note eb-muted">
        {hi
          ? `${xl} बनाम ${yl}। ${p.window}, ${s.n} महीने। अग्रता-पश्चता चार्ट में बिंदीदार रेखाओं से बाहर के स्तंभों का संयोग होना असंभाव्य है (95%)।`
          : `${xl} against ${yl}. ${p.window}, ${s.n} months. In the lead and lag chart, bars beyond the dotted lines are unlikely to be chance (95%).`}
      </p>
    </section>
  );
}

function CorrTable({ t }) {
  const hi = useHi();
  const short = (k) => (hi ? SHORT_HI[k] : SHORT[k]) || k;
  return (
    <div className="eb-an-corr">
      <CsvButton name="correlation-table" head={['', ...t.labels]} rows={t.labels.map((l, i) => [l, ...t.r[i]])} />
      <div className="eb-tablewrap">
        <table className="eb-table eb-an-heat">
          <caption className="eb-sr">{hi ? `मुख्य मासिक शृंखलाओं के बीच सहसंबंध, ${t.window}` : `Correlations between the main monthly series, ${t.window}`}</caption>
          <thead><tr><th scope="col" />{t.keys.map((k) => <th key={k} scope="col" className="eb-an-heat-h"><span>{short(k)}</span></th>)}</tr></thead>
          <tbody>
            {t.keys.map((k, i) => (
              <tr key={k}>
                <th scope="row">{short(k)}</th>
                {t.r[i].map((r, j) => {
                  const weak = Math.abs(r) < t.band95 || i === j;
                  const c = r >= 0 ? 'var(--eb-s1)' : 'var(--eb-s2)';
                  return (
                    <td key={j} className={`eb-num${weak ? ' eb-muted' : ''}`} title={`${short(t.keys[i])} / ${short(t.keys[j])}: r = ${r}`}
                      style={i === j ? undefined : { background: `color-mix(in srgb, ${c} ${Math.round(Math.abs(r) * 55)}%, transparent)` }}>
                      {i === j ? '–' : r.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Elasticity({ rows }) {
  const hi = useHi();
  return (
    <details className="eb-an-more">
      <summary>{hi ? 'लोच के सभी अनुमान' : 'All elasticity estimates'}</summary>
      <CsvButton name="direct-tax-elasticities" head={['tax', 'period', 'elasticity', 'low (95%)', 'high (95%)', 'years', 'R squared']} rows={rows.map((r) => [r.label, r.period, r.elasticity, r.low, r.high, r.n, r.r2])} />
      <div className="eb-tablewrap">
        <table className="eb-table">
          <caption className="eb-sr">{hi ? 'सांकेतिक GDP के प्रति प्रत्यक्ष करों की लोच' : 'Elasticity of direct taxes to nominal GDP'}</caption>
          <thead><tr>
            <th scope="col">{hi ? 'कर' : 'Tax'}</th><th scope="col">{hi ? 'अवधि' : 'Period'}</th><th scope="col" className="eb-num">{hi ? 'लोच' : 'Elasticity'}</th>
            <th scope="col" className="eb-num">{hi ? '95% दायरा' : '95% range'}</th><th scope="col" className="eb-num">{hi ? 'वर्ष' : 'Years'}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.series + r.period}>
                <th scope="row">{hi ? TAX_HI[r.series] || r.label : r.label}</th><td>{r.period}</td>
                <td className="eb-num"><b>{r.elasticity}</b></td><td className="eb-num eb-muted">{r.low}{hi ? ' से ' : ' to '}{r.high}</td><td className="eb-num">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eb-mc-note">
        {hi
          ? 'संग्रह के लघुगणक का सांकेतिक GDP के लघुगणक पर समाश्रयण (CBDT समय शृंखला आंकड़े)। 1 से अधिक: कर अर्थव्यवस्था से तेज़ बढ़ते हैं। इन मानों में कर दरों और प्रशासन में पिछले बदलावों (जैसे सितंबर 2019 की कॉर्पोरेट कर कटौती) का असर शामिल है, इसलिए ये अतीत का वर्णन करते हैं, किसी नई दर बदलाव के असर का पूर्वानुमान नहीं।'
          : 'Log of collections regressed on log of nominal GDP (CBDT Time Series Data). Above 1: taxes grow faster than the economy. The values include the effect of past changes in tax rates and administration (for example the September 2019 corporate tax cut), so they describe the past rather than predict the effect of a new rate change.'}
      </p>
    </details>
  );
}

export default function AnalysisPage({ base }) {
  const hi = useHi();
  const { data: d, error } = useTradeFile(`${base}models.json`);
  if (error) return <div className="eb-dash"><p className="eb-empty">{hi ? `विश्लेषण लोड नहीं हो सका (${error})।` : `The analysis could not be loaded (${error}).`}</p></div>;
  if (!d) return <div className="eb-dash" aria-busy="true"><div className="eb-skel-hero" /><div className="eb-skel-panel" /></div>;
  const tested = [...d.forecasts, ...d.tested_not_published];
  const strong = d.relationships.filter((p) => !p.unexpected && Math.abs(p.best_lead.r) >= 0.5 && Math.abs(p.best_lead.r) >= p.band95);
  const odd = d.relationships.filter((p) => p.unexpected);
  const pairNames = (list) => list.map((p) => (hi ? `${SHORT_HI[p.x]} और ${SHORT_HI[p.y]}` : `${SHORT[p.x]} and ${SHORT[p.y]}`)).join('; ');
  const cpi = d.cpi_contributions?.rows?.at(-1);
  const cpiYearAgo = cpi && d.cpi_contributions.rows.find((r) => r.month === `${Number(cpi.month.slice(0, 4)) - 1}${cpi.month.slice(4)}`);
  const net = d.tax_elasticity.find((r) => r.series === 'net' && r.period.startsWith('2000'));
  const heat = d.heat || [];
  const score = (r) => (r.up_is_good == null ? null : r.up_is_good ? r.pct : 100 - r.pct);
  const badX = heat.filter((r) => score(r) != null && score(r) <= 10);
  const goodX = heat.filter((r) => score(r) != null && score(r) >= 90);
  const states = d.cpi_contributions?.states;
  const stRows = states?.rows.filter((r) => r.state !== 'All India' && r.combined != null) || [];
  const stHigh = [...stRows].sort((a, b) => b.combined - a.combined);
  const above = stRows.filter((r) => r.combined > (states?.rows.find((x) => x.state === 'All India')?.combined ?? 0)).length;
  const rec = d.forecast_record;
  const recFirst = rec?.entries.find((e) => e.published);
  const nextRelease = recFirst && recFirst.forecast.find((p) => p.actual == null);
  const nextText = nextRelease ? nextRelease.month : null;
  const dateLong = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <>
      <nav className="eb-crumbs" aria-label={hi ? 'मार्ग' : 'Breadcrumb'}><a href="#/">{hi ? 'डैशबोर्ड' : 'Dashboard'}</a><span aria-hidden="true">/</span><span>{hi ? 'पूर्वानुमान और संबंध' : 'Forecasts and relationships'}</span></nav>
      <header className="eb-pagehead">
        <h1>{hi ? 'पूर्वानुमान और संबंध' : 'Forecasts and relationships'}</h1>
        <HeadlineStrip d={d} />
        <div className="eb-themebrief">
          <p className="eb-themebrief-kicker">{hi ? 'मॉडल क्या कहते हैं' : 'What the models say'}</p>
          {hi ? (
            <p>
              जाँची गई {tested.length} शृंखलाओं में से <strong>{d.forecasts.length}</strong> का पूर्वानुमान एक सरल नियम से बेहतर किया जा सकता है
              ({d.forecasts.map((f) => seriesTitle(f, hi)).join(', ') || 'कोई नहीं'}); बाकी, जिनमें मुद्रास्फीति और बाज़ार कीमतें शामिल हैं, के लिए ईमानदार पूर्वानुमान लगभग "अभी जैसा ही" है।
              {strong.length ? <> आंकड़ों में सबसे स्पष्ट संबंध: {pairNames(strong)}।</> : null}
              {odd.length ? <> कुछ संबंध अर्थशास्त्र की अपेक्षा के विपरीत दिशा में चलते हैं ({pairNames(odd)}); ये कारण और प्रभाव नहीं, साझा चक्र दिखाते हैं, और इनके कार्ड पर इसका उल्लेख है।</> : null}
            </p>
          ) : (
            <p>
              Of {tested.length} series tested, <strong>{d.forecasts.length}</strong> can be forecast better than a simple rule of thumb
              ({d.forecasts.map((f) => f.title).join(', ') || 'none'}); for the rest, including inflation and market prices, the honest forecast is close to "much like now".
              {strong.length ? <> The clearest links in the data: {pairNames(strong)}.</> : null}
              {odd.length ? <> Some links run the opposite way to what economics would expect ({pairNames(odd)}); they reflect shared cycles, not cause and effect, and are marked on their cards.</> : null}
            </p>
          )}
          <p>{hi
            ? 'ये पिछले कुछ वर्षों के आंकड़ों के सांख्यिकीय सारांश हैं, जो आंकड़ों के साथ रोज़ अपडेट होते हैं। ये आधिकारिक अनुमान नहीं हैं, और सहसंबंध यह नहीं दिखाता कि एक चीज़ दूसरी का कारण है।'
            : 'These are statistical summaries of the last few years, refreshed daily with the data. They are not official projections, and a correlation does not show that one thing causes another.'}</p>
        </div>
      </header>

      {heat.length ? (
        <section className="eb-section" aria-labelledby="an-heat-h">
          <h2 id="an-heat-h">{hi ? 'एक नज़र में अर्थव्यवस्था' : 'The economy at a glance'}</h2>
          <p className="eb-ru-lead">
            {hi
              ? <>हर खाना एक संकेतक है, जिसका रंग बताता है कि उसकी नवीनतम रीडिंग उसके अपने हाल के इतिहास में कहाँ है। {heat.length} में से <strong>{badX.length}</strong> अपने सबसे बुरे 10% स्तर पर हैं{badX.length ? ` (${badX.slice(0, 6).map((r) => HEAT_HI[r.id] || r.label).join(', ')}${badX.length > 6 ? ' और अन्य' : ''})` : ''}, और <strong>{goodX.length}</strong> सबसे अच्छे 10% पर। जो शृंखलाएँ अर्थव्यवस्था के साथ बढ़ती हैं (रुपये या डॉलर में मूल्य, संख्याएँ, कीमतें), उनकी तुलना एक वर्ष पहले की तुलना में वृद्धि से की गई है।</>
              : <>Each tile is one indicator, coloured by where its latest reading sits in its own recent history. Of {heat.length}, <strong>{badX.length}</strong> are in the worst 10% of their own readings{badX.length ? ` (${badX.slice(0, 6).map((r) => r.label).join(', ')}${badX.length > 6 ? ' and others' : ''})` : ''}, and <strong>{goodX.length}</strong> in the best 10%. Series that grow with the economy (rupee or dollar values, counts, prices) are compared as growth on a year earlier.</>}
          </p>
          <section className="eb-mc eb-an-card">
            <h3 className="eb-mc-title">{hi ? 'हर संकेतक, उसके अपने अतीत की तुलना में' : 'Every indicator against its own past'}</h3>
            <EconomyHeat rows={heat} groups={CATEGORIES} />
          </section>
        </section>
      ) : null}

      <section className="eb-section" aria-labelledby="an-fc-h">
        <h2 id="an-fc-h">{hi ? 'अल्पकालिक परिदृश्य' : 'Short-term outlook'}</h2>
        <p className="eb-ru-lead">
          {hi
            ? `दिखाने से पहले हर मॉडल का परीक्षण किया गया: पिछले ${d.settings.backtest_origins} महीनों में से हर महीने पर उसे ऐसे दोबारा चलाया गया मानो हम उसी समय खड़े हों, और उसकी चूक की तुलना एक सरल नियम से की गई (दरों के लिए "कोई बदलाव नहीं"; मासिक मूल्यों के लिए पिछले वर्ष का वही महीना, हाल की वृद्धि से समायोजित)। पूर्वानुमान तभी दिखाया जाता है जब मॉडल एक और तीन महीने आगे, दोनों पर, सरल नियम से बेहतर रहा हो। छायांकित भाग ${d.settings.interval} दायरा है।`
            : `Each model was tested before being shown: re-run at each of the last ${d.settings.backtest_origins} months as if standing there, and its errors compared with a simple rule (no change for rates; the same month last year, scaled by recent growth, for monthly values). A forecast appears only if the model beat the rule one and three months ahead. The shaded area is the ${d.settings.interval} range.`}
        </p>
        <div className="eb-an-grid1">
          {d.forecasts.map((f) => (
            <section key={f.id} className="eb-mc eb-an-card">
              <h3 className="eb-mc-title">{seriesTitle(f, hi)}</h3>
              <p className="eb-mc-note">
                {hi
                  ? `${unitText(f.unit, hi)}। ${f.model}, ${monthLabel(f.fit_from, hi)} से ${monthLabel(f.fit_to, hi)} के आंकड़ों पर। परीक्षण में इसकी चूक सरल नियम की तुलना में एक महीने आगे ${formatValue(f.backtest['1'].skill_pct, 0)}% और तीन महीने आगे ${formatValue(f.backtest['3'].skill_pct, 0)}% कम रही।`
                  : `${f.unit}. ${f.model}, fitted on ${monthLabel(f.fit_from)} to ${monthLabel(f.fit_to)}. In testing, its errors were ${formatValue(f.backtest['1'].skill_pct, 0)}% smaller than the simple rule's one month ahead and ${formatValue(f.backtest['3'].skill_pct, 0)}% smaller three months ahead.`}
              </p>
              <ForecastChart f={f} />
              <h4 className="eb-an-sub4">{hi ? 'परीक्षण में इसका प्रदर्शन' : 'How it did in testing'}</h4>
              <TrackRecord f={f} />
            </section>
          ))}
        </div>
        {rec && (
          <section className="eb-mc eb-an-card eb-an-gap">
            <h3 className="eb-mc-title">{hi ? 'इस पृष्ठ पर दिए गए पूर्वानुमान, और उनका नतीजा' : 'Forecasts made on this page, and how they turned out'}</h3>
            <p className="eb-mc-note">{hi
              ? 'ऊपर का परीक्षण अतीत पर है। यह असली परीक्षा है: हर पूर्वानुमान बनते ही सहेज लिया जाता है, और आधिकारिक आंकड़ा आने पर उसका मिलान अपने-आप होता है।'
              : 'The test above is on the past. This is the real test: every forecast is saved when it is made and checked automatically when the official figure comes out.'}</p>
            <ForecastRecord rec={rec} nextRelease={nextText} />
          </section>
        )}
        <h3 className="eb-an-sub">{hi ? 'जाँचे गए सभी मॉडल' : 'Every model tested'}</h3>
        <p className="eb-mc-note">{hi
          ? 'सरल नियम की तुलना में मॉडल की औसत चूक कितनी कम रही (धनात्मक बेहतर है; शून्य का अर्थ है कोई सुधार नहीं)। औसत चूक देखने के लिए किसी आंकड़े पर कर्सर रखें।'
          : "How much smaller the model's average error was than the simple rule's (positive is better; zero means it did no better). Hover a figure for the average errors."}</p>
        <SkillTable rows={tested} />
      </section>

      {cpi && (
        <section className="eb-section" aria-labelledby="an-cpi-h">
          <h2 id="an-cpi-h">{hi ? 'मुद्रास्फीति को क्या चला रहा है' : 'What is driving inflation'}</h2>
          <p className="eb-ru-lead">
            {hi
              ? <>{monthLabel(cpi.month, hi)} में CPI मुद्रास्फीति <strong>{formatValue(cpi.headline, 2)}%</strong> रही। खाद्य और पेय पदार्थों ने <strong>{formatValue(cpi.food, 1)} अंक</strong> जोड़े
                {cpi.headline > 0 ? ` (कुल का ${formatValue((cpi.food / cpi.headline) * 100, 0)}%)` : ''}, घरेलू ईंधन ने {formatValue(cpi.fuel, 1)} और बाकी सब ने {formatValue(cpi.core, 1)}।
                {cpiYearAgo ? <> एक वर्ष पहले, {monthLabel(cpiYearAgo.month, hi)} में, खाद्य {cpiYearAgo.food < 0 ? <>मुद्रास्फीति को {formatValue(-cpiYearAgo.food, 1)} अंक <strong>नीचे</strong> खींच रहा था</> : <>ने {formatValue(cpiYearAgo.food, 1)} अंक जोड़े थे</>} और बाकी सब ने {formatValue(cpiYearAgo.core, 1)} अंक जोड़े थे।</> : null}
                {' '}खाद्य कीमतें स्वयं एक वर्ष पहले से {formatValue(cpi.food_infl, 1)}% अधिक थीं।</>
              : <>In {monthLabel(cpi.month)}, CPI inflation was <strong>{formatValue(cpi.headline, 2)}%</strong>. Food and beverages added <strong>{formatValue(cpi.food, 1)} points</strong>
                {cpi.headline > 0 ? ` (${formatValue((cpi.food / cpi.headline) * 100, 0)}% of the total)` : ''}, household fuel {formatValue(cpi.fuel, 1)} and everything else {formatValue(cpi.core, 1)}.
                {cpiYearAgo ? <> A year earlier, in {monthLabel(cpiYearAgo.month)}, food {cpiYearAgo.food < 0 ? <>was pulling inflation <strong>down</strong> by {formatValue(-cpiYearAgo.food, 1)} points</> : <>added {formatValue(cpiYearAgo.food, 1)} points</>} and everything else added {formatValue(cpiYearAgo.core, 1)}.</> : null}
                {' '}Food prices themselves were {formatValue(cpi.food_infl, 1)}% higher than a year earlier.</>}
          </p>
          <section className="eb-mc eb-an-card">
            <h3 className="eb-mc-title">{hi ? 'CPI मुद्रास्फीति में योगदान' : 'Contributions to CPI inflation'}</h3>
            <p className="eb-mc-note">{hi
              ? 'मुख्य मुद्रास्फीति के प्रतिशत अंक, अखिल भारत संयुक्त। हर स्तंभ उस महीने की मुद्रास्फीति के बराबर है; शून्य से नीचे का अर्थ है कि वह हिस्सा मुद्रास्फीति को नीचे खींच रहा था।'
              : "Percentage points of headline inflation, All India combined. Each bar adds up to the month's inflation; below zero means that part was pulling inflation down."}</p>
            <CpiContrib c={d.cpi_contributions} />
          </section>
          {d.cpi_contributions.divisions && (
            <section className="eb-mc eb-an-card eb-an-gap">
              <h3 className="eb-mc-title">{hi ? `कीमतें सबसे तेज़ कहाँ बढ़ रही हैं, ${monthLabel(d.cpi_contributions.divisions.month, hi)}` : `Where prices are rising fastest, ${monthLabel(d.cpi_contributions.divisions.month)}`}</h3>
              <p className="eb-mc-note">{hi
                ? `2024-आधार CPI के ${d.cpi_contributions.divisions.rows.length} व्यय प्रभागों में से हर एक में वार्षिक मुद्रास्फीति। यह दिखाता है कि टोकरी के हर हिस्से में कीमतें कितनी तेज़ी से बढ़ रही हैं, यह नहीं कि कुल में उसका भार कितना है।`
                : `Annual inflation in each of the ${d.cpi_contributions.divisions.rows.length} spending divisions of the 2024-base CPI. This shows how fast prices are rising in each part of the basket, not how much each part weighs in the total.`}</p>
              <CpiDivisions c={d.cpi_contributions} headline={cpi.headline} />
            </section>
          )}
          {states && stRows.length ? (
            <section className="eb-mc eb-an-card eb-an-gap">
              <h3 className="eb-mc-title">{hi ? `राज्यवार मुद्रास्फीति, ${monthLabel(states.month, hi)}` : `Inflation by state, ${monthLabel(states.month)}`}</h3>
              <p className="eb-mc-note">{hi
                ? `CPI (2024 आधार, सभी वस्तुएँ), MoSPI। ${stRows.length} में से ${above} राज्य और केंद्र शासित प्रदेश राष्ट्रीय दर से ऊपर हैं; सबसे ऊँची दर ${STATE_NAME(stHigh[0]?.state, hi)} (${formatValue(stHigh[0]?.combined, 2)}%) और सबसे कम ${STATE_NAME(stHigh.at(-1)?.state, hi)} (${formatValue(stHigh.at(-1)?.combined, 2)}%) में है। हर खाना एक राज्य है, जो मोटे तौर पर नक्शे पर अपनी जगह रखा गया है; छोटे राज्यों और केंद्र शासित प्रदेशों के आंकड़े छोटे नमूनों पर आधारित होते हैं और अधिक उतार-चढ़ाव दिखाते हैं।`
                : `CPI (2024 base, all items), MoSPI. ${above} of ${stRows.length} states and union territories are above the national rate; the highest is ${stateEn(stHigh[0]?.state)} (${formatValue(stHigh[0]?.combined, 2)}%) and the lowest ${stateEn(stHigh.at(-1)?.state)} (${formatValue(stHigh.at(-1)?.combined, 2)}%). Each tile is a state, placed roughly where it sits on the map; figures for small states and union territories rest on small samples and move around more.`}</p>
              <StateMap st={states} />
            </section>
          ) : null}
        </section>
      )}

      <section className="eb-section" aria-labelledby="an-rel-h">
        <h2 id="an-rel-h">{hi ? 'संकेतक एक साथ कैसे बदलते हैं' : 'How the indicators move together'}</h2>
        <p className="eb-ru-lead">
          {hi
            ? 'जिन जोड़ियों के जुड़े होने का कोई आर्थिक कारण है, उनके लिए: समय के साथ दोनों शृंखलाएँ, और उसी महीने में तथा 12 महीने तक एक के दूसरे से आगे रहने पर सहसंबंध (r, −1 से +1)। शृंखलाओं की तुलना वार्षिक वृद्धि या परिवर्तन के रूप में की गई है, ताकि रुझान और मौसमी पैटर्न झूठे संबंध न बनाएँ। जहाँ एक शृंखला आमतौर पर पहले चलती है, वहाँ कार्ड पर दिया बटन उसे आगे खिसकाता है, ताकि आप रेखाओं को मिलते हुए देख सकें।'
            : 'For pairs with an economic reason to be linked: the two series over time, and the correlation (r, from −1 to +1) in the same month and when one leads the other by up to 12 months. Series are compared as annual growth or change, so trends and seasons do not create false links. Where one series tends to move first, the switch on the card slides it forward so you can see the lines line up.'}
        </p>
        <div className="eb-an-grid2">{d.relationships.map((p) => <PairCard key={p.x + p.y} p={p} />)}</div>
        <h3 className="eb-an-sub">{hi ? 'सहसंबंध तालिका' : 'Correlation table'}</h3>
        <p className="eb-mc-note">{hi
          ? `उसी महीने के सहसंबंध, ${d.correlation_table.window} (${d.correlation_table.n} महीने)। हरा: साथ चलते हैं; नारंगी: विपरीत। धूसर आंकड़े ±${d.correlation_table.band95} के भीतर हैं, जो केवल संयोग से भी आ सकते हैं।`
          : `Same-month correlations, ${d.correlation_table.window} (${d.correlation_table.n} months). Green: move together; orange: opposite. Grey figures are within ±${d.correlation_table.band95}, which chance alone could produce.`}</p>
        <CorrTable t={d.correlation_table} />
      </section>

      <section className="eb-section" aria-labelledby="an-el-h">
        <h2 id="an-el-h">{hi ? 'प्रत्यक्ष कर वृद्धि पर कैसे प्रतिक्रिया देते हैं' : 'How direct taxes respond to growth'}</h2>
        {net && (
          <p className="eb-ru-lead">
            {hi
              ? <>{net.period} के दौरान सांकेतिक GDP में हर 1% वृद्धि पर शुद्ध प्रत्यक्ष कर लगभग <strong>{net.elasticity}%</strong> बढ़े (95% दायरा {net.low} से {net.high})। व्यवहार में: यदि किसी वर्ष सांकेतिक GDP 10% बढ़े, तो कर दरों में किसी बदलाव से पहले, प्रत्यक्ष करों के लगभग <strong>{formatValue(net.elasticity * 10, 0)}%</strong> बढ़ने की अपेक्षा होगी।</>
              : <>Over {net.period}, net direct taxes rose about <strong>{net.elasticity}%</strong> for every 1% rise in nominal GDP (95% range {net.low} to {net.high}). In practice: if nominal GDP grows 10% in a year, direct taxes would be expected to grow about <strong>{formatValue(net.elasticity * 10, 0)}%</strong>, before any change in tax rates.</>}
          </p>
        )}
        {d.tax_history?.length ? (
          <section className="eb-mc eb-an-card">
            <h3 className="eb-mc-title">{hi ? `प्रत्यक्ष कर और अर्थव्यवस्था का आकार, ${d.tax_history[0].fy} से ${d.tax_history.at(-1).fy}` : `Direct taxes and the size of the economy, ${d.tax_history[0].fy} to ${d.tax_history.at(-1).fy}`}</h3>
            <TaxScatter hist={d.tax_history} el={d.tax_elasticity} />
          </section>
        ) : null}
        {d.tax_check && (
          <section className="eb-mc eb-an-card eb-an-gap">
            <h3 className="eb-mc-title">{hi ? `क्या ${d.tax_check.fy} सही राह पर है?` : `Is ${d.tax_check.fy} on track?`}</h3>
            <p className="eb-mc-note">{hi
              ? `${d.tax_check.as_on.slice(8, 10).replace(/^0/, '')} ${monthLabel(d.tax_check.as_on.slice(0, 7), hi)} तक का संग्रह, एक वर्ष पहले की उसी तारीख की तुलना में (CBDT), उस वृद्धि के मुकाबले जो आपके चुने गए सांकेतिक GDP वृद्धि पर लोच से अपेक्षित है। शुरुआती मान ${d.tax_check.gdp_quarters.join(', ')} का औसत है (MoSPI)।`
              : `Collections up to ${dateLong(d.tax_check.as_on)} against the same date a year earlier (CBDT), compared with the growth the elasticities would imply for the nominal GDP growth you choose. It starts at the average for ${d.tax_check.gdp_quarters.join(', ')} (MoSPI).`}</p>
            <TaxCheck check={d.tax_check} />
            <p className="eb-mc-note">
              {hi
                ? <><b>कैसे पढ़ें:</b> वर्ष के बीच के आंकड़े अग्रिम कर (दिसंबर और मार्च की किस्तें अभी बाकी हैं) और रिफंड के समय के साथ बदलते हैं, इसलिए अभी का अंतर मार्च तक कम हो सकता है। गैर-कॉर्पोरेट रिफंड ₹{formatValue(d.tax_check.refunds.nct_prev / 1e5, 2)} से बढ़कर ₹{formatValue(d.tax_check.refunds.nct_cur / 1e5, 2)} लाख करोड़ हो गए; रिफंड से पहले, STT सहित गैर-कॉर्पोरेट कर {fx1(d.tax_check.gross_non_corporate_growth)}% बढ़ा। CBDT के वार्षिक गैर-कॉर्पोरेट आंकड़े में प्रतिभूति लेनदेन कर (STT) शामिल है, इसलिए मिलान के लिए वर्ष के बीच के आंकड़े में STT जोड़ा गया है।</>
                : <><b>How to read it:</b> part-year figures move with the timing of advance tax (the December and March instalments are still to come) and of refunds, so a gap now can narrow by March. Non-corporate refunds rose from ₹{formatValue(d.tax_check.refunds.nct_prev / 1e5, 2)} to ₹{formatValue(d.tax_check.refunds.nct_cur / 1e5, 2)} lakh crore; before refunds, non-corporate tax including STT was up {fx1(d.tax_check.gross_non_corporate_growth)}%. CBDT's annual non-corporate figure includes Securities Transaction Tax, so STT is added to the in-year figure to match.</>}
            </p>
          </section>
        )}
        <Elasticity rows={d.tax_elasticity} />
      </section>

      <section className="eb-section" aria-labelledby="an-m-h">
        <h2 id="an-m-h">{hi ? 'पद्धति और सीमाएँ' : 'Method and limits'}</h2>
        <dl className="eb-facts">
          <div><dt>{hi ? 'आंकड़े' : 'Data'}</dt><dd>{hi
            ? `बोर्ड की अपनी शृंखलाएँ, और जहाँ बोर्ड केवल पाँच वर्ष दिखाता है वहाँ 2017-18 से RBI DBIE का पूरा मासिक इतिहास। CPI में 2012-आधार और 2024-आधार शृंखलाएँ जोड़ी गई हैं${tested.some((f) => f.filled_months?.length) ? '; RBI की 2012-आधार CPI फ़ाइल में दो छूटे महीने (जून 2019, जून 2020) मॉडल के लिए पड़ोसी महीनों के बीच के मान से भरे गए हैं' : ''}।`
            : `The board's own series, with RBI DBIE's full monthly history from 2017-18 where the board shows only five years. CPI joins the 2012-base and 2024-base series${tested.some((f) => f.filled_months?.length) ? "; two missing months in RBI's file of 2012-base CPI (June 2019, June 2020) are filled half way between their neighbours for fitting" : ''}.`}</dd></div>
          <div><dt>{hi ? 'पूर्वानुमान' : 'Forecasts'}</dt><dd>{hi
            ? 'छोटे समूह में से AIC के आधार पर चुने गए ARIMA मॉडल; मौसमी शृंखलाएँ लघुगणक पर, वार्षिक मौसमी पद के साथ। एक-चर मॉडल: हर शृंखला का पूर्वानुमान केवल उसके अपने अतीत से होता है, इसलिए तेल की कीमतों में उछाल या नीतिगत बदलाव जैसे झटके पहले से नहीं दिखते।'
            : 'ARIMA models chosen by the AIC from a small set; seasonal series modelled on logs with a yearly seasonal term. Univariate: each series is forecast from its own past only, so a shock such as an oil price jump or a policy change is not foreseen.'}</dd></div>
          {rec && <div><dt>{hi ? 'पूर्वानुमान रिकॉर्ड' : 'Forecast record'}</dt><dd>{hi
            ? 'हर शृंखला का पूर्वानुमान, उसी समय के सरल नियम के पूर्वानुमान के साथ, पहली बार बनने पर data/forecast_log.json में सहेजा जाता है (शृंखला और उपयोग किए गए अंतिम महीने के अनुसार एक बार)। आधिकारिक आंकड़ा आने पर उसका मिलान होता है; यदि आंकड़ा बाद में संशोधित होता है तो नवीनतम संशोधित आंकड़ा उपयोग होता है।'
            : "Each series' forecast is saved in data/forecast_log.json when first made (once per series and last month of data used), together with the simple rule's forecast made at the same time. It is scored when the official figure comes out; if a figure is later revised, the latest revision is used."}</dd></div>}
          {heat.length ? <div><dt>{hi ? 'एक नज़र में' : 'At a glance'}</dt><dd>{hi
            ? `हर संकेतक की नवीनतम रीडिंग का शतमक (percentile), बोर्ड पर दिखाई गई उसकी अपनी पिछली रीडिंग के मुकाबले (मासिक शृंखलाओं में लगभग पाँच वर्ष; वार्षिक कर आंकड़ों में 2000-01 से)। जिन संकेतकों की कोई अच्छी या बुरी दिशा नहीं है (जैसे नीतिगत दरें, ऋण वृद्धि), उन्हें केवल इस आधार पर रंगा गया है कि स्तर कितना असामान्य है। कम से कम ${12} रीडिंग वाले संकेतक ही शामिल हैं।`
            : `The percentile of each indicator's latest reading among its own earlier readings on the board (about five years for monthly series; since 2000-01 for annual tax figures). Indicators with no good or bad direction (policy rates, credit growth and the like) are shaded only by how unusual the level is. Only indicators with at least 12 readings are included.`}</dd></div> : null}
          {d.cpi_contributions && <div><dt>{hi ? 'मुद्रास्फीति का विभाजन' : 'Inflation split'}</dt><dd>{hi
            ? `टोकरी के किसी हिस्से का योगदान = उसका भार × (उसका सूचकांक अभी − एक वर्ष पहले) ÷ एक वर्ष पहले का सर्व-वस्तु सूचकांक। MoSPI के भार: 2024 आधार में खाद्य और पेय पदार्थ 36.75%, बिजली, गैस और अन्य ईंधन 5.49%; 2012 आधार में खाद्य और पेय पदार्थ 45.86%, ईंधन और प्रकाश 6.84%। दिसंबर 2025 तक 2012 आधार, जनवरी 2026 से 2024 आधार। MoSPI सूचकांक एक या दो दशमलव तक प्रकाशित करता है, इसलिए तीनों हिस्सों का जोड़ प्रकाशित मुद्रास्फीति से ${d.cpi_contributions.max_gap_vs_published} अंक के भीतर रहता है (पिछले पाँच वर्षों में 0.1 अंक के भीतर)। वाहनों के लिए पेट्रोल और डीज़ल "बाकी सब" में हैं, जैसे बोर्ड की कोर CPI में। राज्यवार आंकड़े MoSPI के 2024-आधार राज्य सूचकांक हैं; राज्यवार खाद्य मुद्रास्फीति नहीं दिखाई गई, क्योंकि MoSPI का API उसके साथ हर खाद्य वस्तु लौटाता है और रोज़ लगभग एक घंटा लगेगा।`
            : `Contribution of a part of the basket = its weight × (its index now − a year ago) ÷ the all-items index a year ago. MoSPI basket weights: 2024 base food and beverages 36.75%, electricity, gas and other fuels 5.49%; 2012 base food and beverages 45.86%, fuel and light 6.84%. 2012 base to December 2025, 2024 base from January 2026. Because MoSPI publishes indices to one or two decimals, the three parts add up to within ${d.cpi_contributions.max_gap_vs_published} point of published inflation (within 0.1 point in the last five years). Petrol and diesel for vehicles sit in "everything else", as in the board's core CPI. State figures are MoSPI's 2024-base state indices; food inflation by state is not shown because MoSPI's API returns every food item with it, which would take about an hour a day.`}</dd></div>}
          {d.tax_check && <div><dt>{hi ? 'कर जाँच' : 'Tax check'}</dt><dd>{hi
            ? 'अपेक्षित वृद्धि = लोच × सांकेतिक GDP वृद्धि, लोच के 95% दायरे के साथ। लोच दीर्घकालिक औसत हैं जिनमें पिछले दर बदलाव शामिल हैं; किसी एक अधूरे वर्ष का आंकड़ा केवल समय के कारण भी दायरे से बाहर हो सकता है।'
            : 'Expected growth = elasticity × nominal GDP growth, with the 95% range of the elasticity. Elasticities are long-run averages that include past rate changes; a single part year can sit outside the range for reasons of timing alone.'}</dd></div>}
          <div><dt>{hi ? 'संबंध' : 'Relationships'}</dt><dd>{hi
            ? 'वार्षिक वृद्धि या परिवर्तन के पियर्सन सहसंबंध। छोटे नमूने और साझा चक्र बिना किसी कारण के भी मज़बूत सहसंबंध दिखा सकते हैं; हर कार्ड पर दी गई सावधानियाँ देखें।'
            : 'Pearson correlations of annual growth or change. Short samples and shared cycles can produce strong correlations without any cause; see the cautions on each card.'}</dd></div>
          <div><dt>{hi ? 'अपडेट' : 'Updated'}</dt><dd>{hi
            ? `रोज़, आंकड़ों के साथ (${d.generated_at.slice(0, 10)})। स्क्रिप्ट: scripts/build_models.py; पूरे परिणाम data/models.json में। हर चार्ट के आंकड़े उसके CSV बटन से डाउनलोड किए जा सकते हैं।`
            : `Daily, with the data (${d.generated_at.slice(0, 10)}). Script: scripts/build_models.py; full results in data/models.json. Every chart's numbers can be downloaded with its CSV button.`}</dd></div>
        </dl>
      </section>
    </>
  );
}

function STATE_NAME(s, hi) {
  if (!s) return '';
  return hi ? STATES[s]?.[3] || s : stateEn(s);
}
