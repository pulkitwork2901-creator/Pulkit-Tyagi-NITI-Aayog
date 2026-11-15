import { useState } from 'react';
import useWidth from '../useWidth.js';
import { formatValue, niceScale, signed } from '../format.js';
import { useTradeFile } from '../trade/tradeKit.jsx';
import { HeadlineStrip, PairLines, TrackRecord, TaxScatter, TaxCheck, CpiContrib, CpiDivisions } from './analysisCharts.jsx';

// Forecasts, relationships and tax elasticity, from public/data/models.json
// (written by scripts/build_models.py). Every number here is a statistical
// summary of past data, tested where it can be, never an official forecast.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const fx1 = (v) => (v == null ? 'n.a.' : `${v > 0 ? '+' : ''}${signed(formatValue(v, 1))}`);
const pctSigned = (v) => (v == null ? 'n.a.' : `${v > 0 ? '+' : ''}${signed(formatValue(v, 0))}%`);

const SHORT = {
  crude_yoy: 'oil prices', cpi: 'CPI inflation', cpi_core: 'core inflation', inr_yoy: 'rupee depreciation', inr_3m: 'rupee depreciation',
  repo_chg: 'the repo rate', credit: 'bank credit growth', deposit: 'deposit growth', m3: 'money growth', infl_exp_1y: "households' expected inflation",
  gsec10: 'the 10-year G-sec yield', imports_yoy: 'imports', exports_yoy: 'exports', fpi: 'portfolio inflows', gst_yoy: 'GST collections',
};

function strength(r, band) {
  const a = Math.abs(r);
  if (a < band) return 'no reliable link';
  if (a < 0.3) return 'a weak link';
  if (a < 0.6) return 'a moderate link';
  return 'a strong link';
}

// History, forecast and 80% range for one series.
function ForecastChart({ f }) {
  const [ref, W] = useWidth(520, 260);
  const H = 220;
  const M = { l: 44, r: 16, t: 12, b: 28 };
  const hist = f.history;
  const fc = f.forecast;
  const all = [...hist.map((p) => p.value), ...fc.map((p) => p.low), ...fc.map((p) => p.high)];
  const [lo, hi, step] = niceScale(Math.min(...all), Math.max(...all), 4);
  const n = hist.length + fc.length;
  const x = (i) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  const months = [...hist.map((p) => p.month), ...fc.map((p) => p.month)];
  const last = hist.length - 1;
  // Label every 6 months, or every 12 or 24 when the chart is too narrow for
  // "Jul 2024"-width labels to sit apart (about 60px each).
  const perMonth = (W - M.l - M.r) / (n - 1);
  let every = 6;
  while (every * perMonth < 60 && every < 24) every *= 2;
  const showMonth = (m) => {
    const mi = (Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1);
    return mi % every === 0;
  };
  const histPath = hist.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const fcPath = [`M${x(last).toFixed(1)},${y(hist[last].value).toFixed(1)}`, ...fc.map((p, i) => `L${x(last + 1 + i).toFixed(1)},${y(p.value).toFixed(1)}`)].join('');
  const band = [
    `M${x(last).toFixed(1)},${y(hist[last].value).toFixed(1)}`,
    ...fc.map((p, i) => `L${x(last + 1 + i).toFixed(1)},${y(p.high).toFixed(1)}`),
    ...fc.slice().reverse().map((p, i) => `L${x(n - 1 - i).toFixed(1)},${y(p.low).toFixed(1)}`),
    'Z',
  ].join('');
  const fmt = (v) => formatValue(v, f.kind === 'seasonal' ? 2 : 1);
  return (
    <div ref={ref} className="eb-an-chart">
      <svg width={W} height={H} role="img" aria-label={`${f.title}: last 36 months and forecast for the next ${fc.length} months`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="eb-an-grid" />
            <text x={M.l - 6} y={y(t) + 4} className="eb-an-axis" textAnchor="end">{formatValue(t, step < 1 ? 1 : 0)}</text>
          </g>
        ))}
        {months.map((m, i) => (showMonth(m) ? (
          <text key={m} x={x(i)} y={H - 8} className="eb-an-axis" textAnchor="middle">{monthLabel(m)}</text>
        ) : null))}
        <line x1={x(last)} x2={x(last)} y1={M.t} y2={H - M.b} className="eb-an-now" />
        <path d={band} className="eb-an-band" />
        <path d={histPath} className="eb-an-hist" />
        <path d={fcPath} className="eb-an-fc" />
        <circle cx={x(last)} cy={y(hist[last].value)} r="3.5" className="eb-an-dot" />
      </svg>
      <div className="eb-tablewrap">
        <table className="eb-table eb-an-fctable">
          <caption className="eb-sr">{f.title}: forecast with 80% range</caption>
          <thead><tr><th scope="col">Month</th>{fc.map((p) => <th key={p.month} scope="col" className="eb-num">{monthLabel(p.month)}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">Forecast</th>{fc.map((p) => <td key={p.month} className="eb-num"><b>{fmt(p.value)}</b></td>)}</tr>
            <tr><th scope="row">80% range</th>{fc.map((p) => <td key={p.month} className="eb-num eb-muted">{fmt(p.low)} to {fmt(p.high)}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkillCell({ b }) {
  if (!b || b.skill_pct == null) return <td className="eb-num eb-muted">n.a.</td>;
  const cls = b.skill_pct > 0 ? 'eb-good' : b.skill_pct < 0 ? 'eb-bad' : 'eb-muted';
  return <td className={`eb-num ${cls}`} title={`Average error: model ${b.model_mae}, simple rule ${b.simple_mae} (${b.tests} tests)`}>{pctSigned(b.skill_pct)}</td>;
}

function SkillTable({ rows }) {
  return (
    <div className="eb-tablewrap">
      <table className="eb-table">
        <caption className="eb-sr">How each model did against a simple rule</caption>
        <thead>
          <tr>
            <th scope="col">Series</th><th scope="col" className="eb-an-modelcol">Model</th>
            <th scope="col" className="eb-num">1 month ahead</th><th scope="col" className="eb-num">3 months</th><th scope="col" className="eb-num">6 months</th>
            <th scope="col">Shown?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.title}</th>
              <td className="eb-muted eb-an-modelcol">{r.model || '–'}</td>
              {r.backtest ? <><SkillCell b={r.backtest['1']} /><SkillCell b={r.backtest['3']} /><SkillCell b={r.backtest['6']} /></> : <td colSpan={3} className="eb-muted">{r.reason}</td>}
              <td>{r.beats_simple_rule ? <b>Yes</b> : <span className="eb-muted">No</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Correlation at each lead or lag: bars above or below zero, with the 95% line.
function LagChart({ p }) {
  const [ref, W] = useWidth(420, 240);
  const H = 150;
  const M = { l: 30, r: 8, t: 10, b: 30 };
  const lags = p.lags;
  const bw = (W - M.l - M.r) / lags.length;
  const y = (r) => M.t + (1 - (r + 1) / 2) * (H - M.t - M.b);
  return (
    <div ref={ref} className="eb-an-lag">
      <svg width={W} height={H} role="img" aria-label={`Correlation of ${SHORT[p.x] || p.x} with ${SHORT[p.y] || p.y} at leads and lags of up to 12 months`}>
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
            <title>{c.lag > 0 ? `${SHORT[p.x]} ${c.lag} months earlier` : c.lag < 0 ? `${SHORT[p.y]} ${-c.lag} months earlier` : 'same month'}: r = {c.r}</title>
          </rect>
        ))}
        <text x={M.l} y={H - 8} className="eb-an-axis">{SHORT[p.y]} first</text>
        <text x={M.l + (W - M.l - M.r) / 2} y={H - 8} className="eb-an-axis" textAnchor="middle">same month</text>
        <text x={W - M.r} y={H - 8} className="eb-an-axis" textAnchor="end">{SHORT[p.x]} first</text>
      </svg>
    </div>
  );
}

function PairCard({ p }) {
  const s = p.same_month;
  const b = p.best_lead;
  const xs = SHORT[p.x] || p.x;
  const ys = SHORT[p.y] || p.y;
  const dir = (r) => (r > 0 ? 'move together' : 'move in opposite directions');
  const better = b.lag > 0 && Math.abs(b.r) > Math.abs(s.r) + 0.05 && Math.abs(b.r) >= p.band95;
  const [shift, setShift] = useState(better);
  return (
    <section className="eb-mc eb-an-card">
      <h3 className="eb-mc-title">{xs[0].toUpperCase() + xs.slice(1)} and {ys}</h3>
      <p className="eb-an-verdict">
        In the same month there is <strong>{strength(s.r, p.band95)}</strong> (r = {s.r}){Math.abs(s.r) >= p.band95 ? `: they ${dir(s.r)}` : ''}.
        {better ? <> The link is strongest when <strong>{xs} move{xs.endsWith('s') ? '' : 's'} first, by about {b.lag} month{b.lag > 1 ? 's' : ''}</strong> (r = {b.r}).</> : null}
      </p>
      {p.unexpected && (
        <p className="eb-an-warn"><b>Opposite to what economics expects.</b> Theory says {xs} and {ys} should {p.expected > 0 ? 'move together' : 'move in opposite directions'}; here the clearest link runs the other way, so read it as a shared cycle, not cause and effect.</p>
      )}
      {p.series?.length ? (
        <>
          {better && (
            <div className="eb-range eb-an-shift" role="group" aria-label="Line up the two series">
              <button type="button" aria-pressed={!shift} onClick={() => setShift(false)}>Same month</button>
              <button type="button" aria-pressed={shift} onClick={() => setShift(true)}>{xs[0].toUpperCase() + xs.slice(1)} {b.lag} month{b.lag > 1 ? 's' : ''} earlier</button>
            </div>
          )}
          <PairLines p={p} lag={shift ? b.lag : 0} short={SHORT} />
        </>
      ) : null}
      <details className="eb-an-more">
        <summary>Correlation at each lead and lag</summary>
        <LagChart p={p} />
      </details>
      <p className="eb-mc-note"><b>Why look:</b> {p.why} {p.caution ? <><b>Caution:</b> {p.caution}</> : null}</p>
      <p className="eb-mc-note eb-muted">{p.x_label} against {p.y_label}. {p.window}, {s.n} months. In the lead and lag chart, bars beyond the dotted lines are unlikely to be chance (95%).</p>
    </section>
  );
}

function Heatmap({ t }) {
  const short = (k) => SHORT[k] || k;
  return (
    <div className="eb-tablewrap">
      <table className="eb-table eb-an-heat">
        <caption className="eb-sr">Correlations between the main monthly series, {t.window}</caption>
        <thead><tr><th scope="col" />{t.keys.map((k) => <th key={k} scope="col" className="eb-an-heat-h"><span>{short(k)}</span></th>)}</tr></thead>
        <tbody>
          {t.keys.map((k, i) => (
            <tr key={k}>
              <th scope="row">{short(k)}</th>
              {t.r[i].map((r, j) => {
                const weak = Math.abs(r) < t.band95 || i === j;
                const c = r >= 0 ? 'var(--eb-s1)' : 'var(--eb-s2)';
                return (
                  <td key={j} className={`eb-num${weak ? ' eb-muted' : ''}`} title={`${t.labels[i]} and ${t.labels[j]}: r = ${r}`}
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
  );
}

function Elasticity({ rows }) {
  return (
    <details className="eb-an-more">
      <summary>All elasticity estimates</summary>
      <div className="eb-tablewrap">
        <table className="eb-table">
          <caption className="eb-sr">Elasticity of direct taxes to nominal GDP</caption>
          <thead><tr><th scope="col">Tax</th><th scope="col">Period</th><th scope="col" className="eb-num">Elasticity</th><th scope="col" className="eb-num">95% range</th><th scope="col" className="eb-num">Years</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.series + r.period}>
                <th scope="row">{r.label}</th><td>{r.period}</td>
                <td className="eb-num"><b>{r.elasticity}</b></td><td className="eb-num eb-muted">{r.low} to {r.high}</td><td className="eb-num">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eb-mc-note">Log of collections regressed on log of nominal GDP (CBDT Time Series Data). Above 1: taxes grow faster than the economy. The values include the effect of past changes in tax rates and administration (for example the September 2019 corporate tax cut), so they describe the past rather than predict the effect of a new rate change.</p>
    </details>
  );
}

export default function AnalysisPage({ base }) {
  const { data: d, error } = useTradeFile(`${base}models.json`);
  if (error) return <div className="eb-dash"><p className="eb-empty">The analysis could not be loaded ({error}).</p></div>;
  if (!d) return <div className="eb-dash" aria-busy="true"><div className="eb-skel-hero" /><div className="eb-skel-panel" /></div>;
  const tested = [...d.forecasts, ...d.tested_not_published];
  const strong = d.relationships.filter((p) => !p.unexpected && Math.abs(p.best_lead.r) >= 0.5 && Math.abs(p.best_lead.r) >= p.band95);
  const odd = d.relationships.filter((p) => p.unexpected);
  const cpi = d.cpi_contributions?.rows?.at(-1);
  const cpiYearAgo = cpi && d.cpi_contributions.rows.find((r) => r.month === `${Number(cpi.month.slice(0, 4)) - 1}${cpi.month.slice(4)}`);
  const net = d.tax_elasticity.find((r) => r.series === 'net' && r.period.startsWith('2000'));
  return (
    <>
      <nav className="eb-crumbs" aria-label="Breadcrumb"><a href="#/">Dashboard</a><span aria-hidden="true">/</span><span>Forecasts and relationships</span></nav>
      <header className="eb-pagehead">
        <h1>Forecasts and relationships</h1>
        <HeadlineStrip d={d} short={SHORT} />
        <div className="eb-themebrief">
          <p className="eb-themebrief-kicker">What the models say</p>
          <p>
            Of {tested.length} series tested, <strong>{d.forecasts.length}</strong> can be forecast better than a simple rule of thumb
            ({d.forecasts.map((f) => f.title).join(', ') || 'none'}); for the rest, including inflation and market prices, the honest forecast is close to "much like now".
            {strong.length ? <> The clearest links in the data: {strong.map((p) => `${SHORT[p.x]} and ${SHORT[p.y]}`).join('; ')}.</> : null}
            {odd.length ? <> Some links run the opposite way to what economics would expect ({odd.map((p) => `${SHORT[p.x]} and ${SHORT[p.y]}`).join('; ')}); they reflect shared cycles, not cause and effect, and are marked on their cards.</> : null}
          </p>
          <p>These are statistical summaries of the last few years, refreshed daily with the data. They are not official projections, and a correlation does not show that one thing causes another.</p>
        </div>
      </header>

      <section className="eb-section" aria-labelledby="an-fc-h">
        <h2 id="an-fc-h">Short-term outlook</h2>
        <p className="eb-ru-lead">
          Each model was tested before being shown: re-run at each of the last {d.settings.backtest_origins} months as if standing there, and its errors compared with a simple rule
          (no change for rates; the same month last year, scaled by recent growth, for monthly values). A forecast appears only if the model beat the rule one and three months ahead.
          The shaded area is the {d.settings.interval} range.
        </p>
        <div className="eb-an-grid1">
          {d.forecasts.map((f) => (
            <section key={f.id} className="eb-mc eb-an-card">
              <h3 className="eb-mc-title">{f.title}</h3>
              <p className="eb-mc-note">{f.unit}. {f.model}, fitted on {monthLabel(f.fit_from)} to {monthLabel(f.fit_to)}. In testing, its errors were {formatValue(f.backtest['1'].skill_pct, 0)}% smaller than the simple rule's one month ahead and {formatValue(f.backtest['3'].skill_pct, 0)}% smaller three months ahead.</p>
              <ForecastChart f={f} />
              <h4 className="eb-an-sub4">How it did in testing</h4>
              <TrackRecord f={f} />
            </section>
          ))}
        </div>
        <h3 className="eb-an-sub">Every model tested</h3>
        <p className="eb-mc-note">How much smaller the model's average error was than the simple rule's (positive is better; zero means it did no better). Hover a figure for the average errors.</p>
        <SkillTable rows={tested} />
      </section>

      {cpi && (
        <section className="eb-section" aria-labelledby="an-cpi-h">
          <h2 id="an-cpi-h">What is driving inflation</h2>
          <p className="eb-ru-lead">
            In {monthLabel(cpi.month)}, CPI inflation was <strong>{formatValue(cpi.headline, 2)}%</strong>. Food and beverages added <strong>{formatValue(cpi.food, 1)} points</strong>
            {cpi.headline > 0 ? ` (${formatValue((cpi.food / cpi.headline) * 100, 0)}% of the total)` : ''}, household fuel {formatValue(cpi.fuel, 1)} and everything else {formatValue(cpi.core, 1)}.
            {cpiYearAgo ? <> A year earlier, in {monthLabel(cpiYearAgo.month)}, food {cpiYearAgo.food < 0 ? <>was pulling inflation <strong>down</strong> by {formatValue(-cpiYearAgo.food, 1)} points</> : <>added {formatValue(cpiYearAgo.food, 1)} points</>} and everything else added {formatValue(cpiYearAgo.core, 1)}.</> : null}
            {' '}Food prices themselves were {formatValue(cpi.food_infl, 1)}% higher than a year earlier.
          </p>
          <section className="eb-mc eb-an-card">
            <h3 className="eb-mc-title">Contributions to CPI inflation</h3>
            <p className="eb-mc-note">Percentage points of headline inflation, All India combined. Each bar adds up to the month's inflation; below zero means that part was pulling inflation down.</p>
            <CpiContrib c={d.cpi_contributions} />
          </section>
          {d.cpi_contributions.divisions && (
            <section className="eb-mc eb-an-card eb-an-gap">
              <h3 className="eb-mc-title">Where prices are rising fastest, {monthLabel(d.cpi_contributions.divisions.month)}</h3>
              <p className="eb-mc-note">Annual inflation in each of the 12 spending divisions of the 2024-base CPI. This shows how fast prices are rising in each part of the basket, not how much each part weighs in the total.</p>
              <CpiDivisions c={d.cpi_contributions} headline={cpi.headline} />
            </section>
          )}
        </section>
      )}

      <section className="eb-section" aria-labelledby="an-rel-h">
        <h2 id="an-rel-h">How the indicators move together</h2>
        <p className="eb-ru-lead">
          For pairs with an economic reason to be linked: the two series over time, and the correlation (r, from −1 to +1) in the same month and when one leads the other by up to 12 months.
          Series are compared as annual growth or change, so trends and seasons do not create false links. Where one series tends to move first, the switch on the card slides it forward so you can see the lines line up.
        </p>
        <div className="eb-an-grid2">{d.relationships.map((p) => <PairCard key={p.x + p.y} p={p} />)}</div>
        <h3 className="eb-an-sub">Correlation table</h3>
        <p className="eb-mc-note">Same-month correlations, {d.correlation_table.window} ({d.correlation_table.n} months). Green: move together; orange: opposite. Grey figures are within ±{d.correlation_table.band95}, which chance alone could produce.</p>
        <Heatmap t={d.correlation_table} />
      </section>

      <section className="eb-section" aria-labelledby="an-el-h">
        <h2 id="an-el-h">How direct taxes respond to growth</h2>
        {net && (
          <p className="eb-ru-lead">
            Over {net.period}, net direct taxes rose about <strong>{net.elasticity}%</strong> for every 1% rise in nominal GDP (95% range {net.low} to {net.high}).
            In practice: if nominal GDP grows 10% in a year, direct taxes would be expected to grow about <strong>{formatValue(net.elasticity * 10, 0)}%</strong>, before any change in tax rates.
          </p>
        )}
        {d.tax_history?.length ? (
          <section className="eb-mc eb-an-card">
            <h3 className="eb-mc-title">Direct taxes and the size of the economy, {d.tax_history[0].fy} to {d.tax_history.at(-1).fy}</h3>
            <TaxScatter hist={d.tax_history} el={d.tax_elasticity} />
          </section>
        ) : null}
        {d.tax_check && (
          <section className="eb-mc eb-an-card eb-an-gap">
            <h3 className="eb-mc-title">Is {d.tax_check.fy} on track?</h3>
            <p className="eb-mc-note">
              Collections up to {new Date(`${d.tax_check.as_on}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} against the same date a year earlier (CBDT),
              compared with the growth the elasticities would imply for the nominal GDP growth you choose. It starts at the average for {d.tax_check.gdp_quarters.join(', ')} (MoSPI).
            </p>
            <TaxCheck check={d.tax_check} el={d.tax_elasticity} />
            <p className="eb-mc-note">
              <b>How to read it:</b> part-year figures move with the timing of advance tax (the December and March instalments are still to come) and of refunds, so a gap now can narrow by March.
              Non-corporate refunds rose from ₹{formatValue(d.tax_check.refunds.nct_prev / 1e5, 2)} to ₹{formatValue(d.tax_check.refunds.nct_cur / 1e5, 2)} lakh crore;
              before refunds, non-corporate tax including STT was up {fx1(d.tax_check.gross_non_corporate_growth)}%.
              CBDT's annual non-corporate figure includes Securities Transaction Tax, so STT is added to the in-year figure to match.
            </p>
          </section>
        )}
        <Elasticity rows={d.tax_elasticity} />
      </section>

      <section className="eb-section" aria-labelledby="an-m-h">
        <h2 id="an-m-h">Method and limits</h2>
        <dl className="eb-facts">
          <div><dt>Data</dt><dd>The board's own series, with RBI DBIE's full monthly history from 2017-18 where the board shows only five years. CPI joins the 2012-base and 2024-base series{d.forecasts.concat(d.tested_not_published).some((f) => f.filled_months?.length) ? '; two missing months in RBI\'s file of 2012-base CPI (June 2019, June 2020) are filled half way between their neighbours for fitting' : ''}.</dd></div>
          <div><dt>Forecasts</dt><dd>ARIMA models chosen by the AIC from a small set; seasonal series modelled on logs with a yearly seasonal term. Univariate: each series is forecast from its own past only, so a shock such as an oil price jump or a policy change is not foreseen.</dd></div>
          {d.cpi_contributions && <div><dt>Inflation split</dt><dd>Contribution of a part of the basket = its weight × (its index now − a year ago) ÷ the all-items index a year ago. MoSPI basket weights: 2024 base food and beverages 36.75%, electricity, gas and other fuels 5.49%; 2012 base food and beverages 45.86%, fuel and light 6.84%. 2012 base to December 2025, 2024 base from January 2026. Because MoSPI publishes indices to one or two decimals, the three parts add up to within {d.cpi_contributions.max_gap_vs_published} point of published inflation (within 0.1 point in the last five years). Petrol and diesel for vehicles sit in "everything else", as in the board's core CPI.</dd></div>}
          {d.tax_check && <div><dt>Tax check</dt><dd>Expected growth = elasticity × nominal GDP growth, with the 95% range of the elasticity. Elasticities are long-run averages that include past rate changes; a single part year can sit outside the range for reasons of timing alone.</dd></div>}
          <div><dt>Relationships</dt><dd>Pearson correlations of annual growth or change. Short samples and shared cycles can produce strong correlations without any cause; see the cautions on each card.</dd></div>
          <div><dt>Updated</dt><dd>Daily, with the data ({d.generated_at.slice(0, 10)}). Script: scripts/build_models.py; full results in data/models.json.</dd></div>
        </dl>
      </section>
    </>
  );
}
