import { useEffect, useState } from 'react';
import Ledger from '../Ledger.jsx';
import MultiChart from '../dashboard/MultiChart.jsx';
import { formatValue, signed } from '../format.js';

// Direct taxes: everything in CBDT's annual Time Series Data on one page.
// Reads public/data/direct-taxes.json (copied from data/direct_taxes.json by
// scripts/build_indicators.py); the headline table uses the board's indicators.

const S1 = 'var(--eb-s1)';
const S2 = 'var(--eb-s2)';
const S3 = 'var(--eb-s3)';
const ALL = 0; // chart start: show every year
const LAKH = 1e5; // crore per lakh crore
const CRORE = 1e7; // persons per crore

const lakh = (v) => `₹${formatValue(v, 1)} lakh cr`;
const pct = (d) => (v) => `${signed(formatValue(v, d))}%`;
const crore = (v) => `${formatValue(v, 1)} cr`;
const growth = (a, b) => (a != null && b ? (a / b - 1) * 100 : null);
const g1 = (v) => (v == null ? 'n.a.' : `${signed(formatValue(v, 1))}%`);

function fyPoint(y, value) {
  return { date: `${Number(y.slice(0, 4)) + 1}-03-31`, label: y, short: y.slice(2), value };
}
function series(fy, fn) {
  return Object.keys(fy).sort().map((y) => fyPoint(y, fn(fy[y]))).filter((p) => p.value != null && Number.isFinite(p.value));
}
function tableSeries(tab, prefix = '') {
  return Object.keys(tab || {}).sort().map((y) => ({ ...fyPoint(y, tab[y] / CRORE), label: `${prefix}${y}` }));
}

const SECTIONS = [
  ['dt-collections', 'Collections'],
  ['dt-paid', 'How tax is paid'],
  ['dt-economy', 'Taxes and the economy'],
  ['dt-base', 'Taxpayers and returns'],
  ['dt-states', 'By state'],
  ['dt-about', 'About the data'],
];

function Jump() {
  const go = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav className="eb-dt-jump eb-noprint" aria-label="Sections on this page">
      {SECTIONS.map(([id, label]) => <a key={id} href={`#/direct-taxes`} onClick={(e) => go(e, id)}>{label}</a>)}
    </nav>
  );
}

function Summary({ fy, d }) {
  const ys = Object.keys(fy).sort();
  const y1 = ys.at(-1);
  const y0 = ys.at(-2);
  const a = fy[y1];
  const b = fy[y0];
  const peak = ys.every((y) => fy[y].dt_gdp == null || fy[y].dt_gdp <= a.dt_gdp);
  const refunds = a.gross && a.net ? a.gross - a.net : null;
  const tp = d.taxpayers_by_ay?.TOTAL || {};
  const fl = d.return_filers?.TOTAL || {};
  const tpY = Object.keys(tp).sort();
  const flY = Object.keys(fl).sort();
  return (
    <div className="eb-themebrief">
      <p className="eb-themebrief-kicker">What these figures say together</p>
      <p>
        The Centre collected <strong>₹{formatValue(a.net / LAKH, 2)} lakh crore</strong> in direct taxes in {y1}{a.provisional ? ' (provisional)' : ''},
        {' '}{formatValue(growth(a.net, b.net), 1)}% more than in {y0}. That is <strong>{formatValue(a.dt_gdp, 2)}% of GDP</strong>
        {peak ? ', the highest since the series began in 2000-01,' : ''} and {formatValue(a.direct_share, 1)}% of all central tax revenue.
        {a.buoyancy != null ? <> With a buoyancy of {formatValue(a.buoyancy, 2)}, direct taxes grew {a.buoyancy > 1 ? 'faster' : 'slower'} than the economy in nominal terms.</> : null}
      </p>
      <p>
        {a.non_corporate > a.corporate ? 'Personal and other non-corporate income tax' : 'Corporate tax'} is now the larger part
        (₹{formatValue(Math.max(a.non_corporate, a.corporate) / LAKH, 2)} against ₹{formatValue(Math.min(a.non_corporate, a.corporate) / LAKH, 2)} lakh crore).
        {refunds != null ? <> Gross collections before refunds were ₹{formatValue(a.gross / LAKH, 2)} lakh crore, so roughly ₹{formatValue(refunds / LAKH, 2)} lakh crore went back as refunds.</> : null}
        {tpY.length ? <> The tax base reached <strong>{formatValue(tp[tpY.at(-1)] / CRORE, 2)} crore taxpayers</strong> (AY {tpY.at(-1)}), and {formatValue(fl[flY.at(-1)] / CRORE, 2)} crore individuals and entities filed returns during {flY.at(-1)}.</> : null}
      </p>
    </div>
  );
}

function Collections({ fy }) {
  const last = Object.keys(fy).sort().at(-1);
  return (
    <section className="eb-section" id="dt-collections" aria-labelledby="dt-collections-h">
      <h2 id="dt-collections-h">Collections</h2>
      <div className="eb-panels eb-dt-panels">
        <MultiChart title="Corporate and non-corporate tax" icon="money" headline={{ value: lakh(fy[last].net / LAKH), sub: `Net direct taxes · ${last}` }}
          note="₹ lakh crore a year, net of refunds. Non-corporate: individuals, HUFs, firms, trusts and others, plus securities transaction tax. Bars at March, the end of each financial year."
          kind="bar" start={ALL} fmt={lakh}
          series={[
            { key: 'c', label: 'Corporate tax', color: S1, points: series(fy, (v) => v.corporate / LAKH) },
            { key: 'n', label: 'Non-corporate tax', color: S2, points: series(fy, (v) => v.non_corporate / LAKH) },
          ]} />
        <MultiChart title="Gross and net collections" icon="money" headline={{ value: lakh((fy[last].gross - fy[last].net) / LAKH), sub: `Gap, roughly refunds · ${last}` }}
          note="₹ lakh crore a year. Gross is before refunds (CBDT's payment records); net is after (Finance Accounts and CBDT). The gap is roughly the refunds paid."
          start={ALL} fmt={lakh}
          series={[
            { key: 'g', label: 'Gross', color: S1, points: series(fy, (v) => v.gross / LAKH) },
            { key: 'n', label: 'Net', color: S2, points: series(fy, (v) => v.net / LAKH) },
          ]} />
        <MultiChart title="Who pays: the corporate share" icon="growth" headline={{ value: pct(1)(fy[last].corporate / fy[last].net * 100), sub: `Corporate tax, share of net · ${last}` }}
          note="Corporate tax as % of net direct taxes. It fell after September 2019, when companies that give up exemptions could pay a 22% base rate (15% for new manufacturers) instead of up to 30%."
          start={ALL} fmt={pct(0)}
          series={[{ key: 's', label: 'Corporate share', color: S1, points: series(fy, (v) => v.corporate / v.net * 100) }]} />
      </div>
    </section>
  );
}

const MODES = [
  ['tds', 'Tax deducted at source (TDS)'],
  ['advance_tax', 'Advance tax'],
  ['self_assessment', 'Self-assessment tax'],
  ['regular_assessment', 'Regular assessment tax'],
  ['other_receipts', 'Other receipts (surcharge, cess, STT, and others)'],
];

function HowPaid({ fy }) {
  const ys = Object.keys(fy).sort().filter((y) => fy[y].gross);
  const y1 = ys.at(-1);
  const y0 = ys.at(-2);
  const a = fy[y1];
  const b = fy[y0];
  return (
    <section className="eb-section" id="dt-paid" aria-labelledby="dt-paid-h">
      <h2 id="dt-paid-h">How tax is paid</h2>
      <p className="eb-ru-lead">
        Most direct tax arrives before any assessment: deducted at source by employers, banks and other payers, or paid in advance instalments
        during the year. In {y1}, TDS and advance tax together were <strong>{formatValue((a.tds + a.advance_tax) / a.gross * 100, 0)}%</strong> of gross collections.
      </p>
      <div className="eb-dt-split">
        <MultiChart title="Collections by mode of payment" icon="money" headline={{ value: lakh(a.gross / LAKH), sub: `Gross collections · ${y1}` }}
          note="₹ lakh crore a year, before refunds. CBDT's table shows a sharp switch from TDS to advance tax in 2023-24, partly reversed in 2024-25, with no explanation; read the two together for those years."
          start={ALL} fmt={lakh}
          series={[
            { key: 't', label: 'TDS', color: S1, points: series(fy, (v) => v.tds / LAKH) },
            { key: 'a', label: 'Advance tax', color: S2, points: series(fy, (v) => v.advance_tax / LAKH) },
            { key: 'o', label: 'Assessment and other', color: S3, points: series(fy, (v) => (v.self_assessment + v.regular_assessment + v.other_receipts) / LAKH) },
          ]} />
        <div className="eb-tablewrap">
          <table className="eb-table">
            <caption className="eb-sr">Gross direct tax collections by mode, {y1}</caption>
            <thead><tr><th scope="col">Mode</th><th scope="col" className="eb-num">{y1} (₹ lakh crore)</th><th scope="col" className="eb-num">Share</th><th scope="col" className="eb-num">Change on {y0}</th></tr></thead>
            <tbody>
              {MODES.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  <td className="eb-num">{formatValue(a[k] / LAKH, 2)}</td>
                  <td className="eb-num">{formatValue(a[k] / a.gross * 100, 1)}%</td>
                  <td className="eb-num eb-muted">{g1(growth(a[k], b[k]))}</td>
                </tr>
              ))}
              <tr className="eb-dt-total"><th scope="row">Gross collections</th><td className="eb-num">{formatValue(a.gross / LAKH, 2)}</td><td className="eb-num">100%</td><td className="eb-num eb-muted">{g1(growth(a.gross, b.gross))}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Economy({ fy }) {
  const last = Object.keys(fy).sort().at(-1);
  const a = fy[last];
  return (
    <section className="eb-section" id="dt-economy" aria-labelledby="dt-economy-h">
      <h2 id="dt-economy-h">Direct taxes and the economy</h2>
      <div className="eb-panels eb-dt-panels">
        <MultiChart title="Direct tax to GDP" icon="growth" headline={{ value: pct(2)(a.dt_gdp), sub: `% of GDP · ${last}` }}
          note="Net direct taxes as % of GDP at current prices, using the GDP estimate CBDT cites from MoSPI for each year."
          start={ALL} fmt={pct(1)} series={[{ key: 'r', label: 'Direct tax to GDP', color: S1, points: series(fy, (v) => v.dt_gdp) }]} />
        <MultiChart title="Share of total tax revenue" icon="money" headline={{ value: pct(1)(a.direct_share), sub: `Direct taxes · ${last}` }}
          note="Direct taxes as % of the Centre's gross tax collections (direct plus indirect; indirect taxes from CBIC)."
          start={ALL} fmt={pct(0)} series={[{ key: 's', label: 'Direct share', color: S1, points: series(fy, (v) => v.direct_share) }]} />
        <MultiChart title="Tax buoyancy" icon="growth" headline={{ value: formatValue(a.buoyancy, 2), sub: `Times nominal GDP growth · ${last}` }}
          note="Growth in direct taxes divided by nominal GDP growth. Above 1: taxes grew faster than the economy. Not computed for 2020-21, when both fell."
          kind="bar" start={ALL} fmt={(v) => formatValue(v, 1)} series={[{ key: 'b', label: 'Buoyancy', color: S1, points: series(fy, (v) => v.buoyancy) }]} />
        <MultiChart title="Tax growth and GDP growth" icon="growth" headline={{ value: pct(1)(a.tax_growth), sub: `Direct tax growth · ${last}` }}
          note="% a year. Nominal GDP growth as CBDT reports it alongside the ratio."
          start={ALL} fmt={pct(0)}
          series={[
            { key: 't', label: 'Direct tax growth', color: S1, points: series(fy, (v) => v.tax_growth) },
            { key: 'g', label: 'Nominal GDP growth', color: S2, points: series(fy, (v) => v.gdp_growth) },
          ]} />
        <MultiChart title="Cost of collection" icon="money" headline={{ value: pct(2)(a.cost_pct), sub: `Of collections · ${last}` }}
          note="The Income Tax Department's expenditure as % of what it collects."
          start={ALL} fmt={pct(2)} series={[{ key: 'c', label: 'Cost of collection', color: S1, points: series(fy, (v) => v.cost_pct) }]} />
      </div>
    </section>
  );
}

const CATS = [
  ['INDIVIDUAL', 'Individuals'],
  ['HUF', 'Hindu undivided families'],
  ['FIRM', 'Firms'],
  ['COMPANY', 'Companies'],
  ['AOP(TRUST)', 'Trusts (AOP)'],
  ['OTHER AOP/BOI', 'Other associations and bodies'],
  ['LOCAL AUTHORITY', 'Local authorities'],
  ['AJP', 'Artificial juridical persons'],
  ['OTHERS', 'Others (government)'],
];

function Base({ d }) {
  const tp = d.taxpayers_by_ay || {};
  const fl = d.return_filers || {};
  const rf = d.returns_filed || {};
  const fy = Object.keys(fl.TOTAL || {}).sort();
  const ay = Object.keys(tp.TOTAL || {}).sort();
  if (!fy.length) return null;
  const [f1, f0, fFirst] = [fy.at(-1), fy.at(-2), fy[0]];
  const [a1, a0] = [ay.at(-1), ay.at(-2)];
  const n = (t, c, y) => (t[c] || {})[y];
  return (
    <section className="eb-section" id="dt-base" aria-labelledby="dt-base-h">
      <h2 id="dt-base-h">Taxpayers and returns</h2>
      <p className="eb-ru-lead">
        A <em>return filer</em> filed at least one return during the financial year. A <em>taxpayer</em> either filed a return for the assessment year
        or had tax deducted at source without filing one, so the gap between the two ({formatValue((n(tp, 'TOTAL', a1) - n(fl, 'TOTAL', f1)) / CRORE, 2)} crore)
        is mostly people whose employer or bank deducted tax but who did not file. Return filers have grown {formatValue(n(fl, 'TOTAL', f1) / n(fl, 'TOTAL', fFirst), 1)} times since {fFirst}.
      </p>
      <div className="eb-dt-split">
        <MultiChart title="The income-tax base" icon="jobs" headline={{ value: crore(n(tp, 'TOTAL', a1) / CRORE), sub: `Taxpayers · AY ${a1}` }}
          note="Crore. Taxpayers by assessment year; return filers and returns filed by the financial year of filing. Until 2017-18 a belated return for an earlier year could also be filed, so returns dip in 2018-19."
          start={ALL} fmt={crore}
          series={[
            { key: 't', label: 'Taxpayers', color: S1, points: tableSeries(tp.TOTAL, 'AY ') },
            { key: 'r', label: 'Returns filed', color: S3, points: tableSeries(rf.TOTAL) },
            { key: 'f', label: 'Return filers', color: S2, points: tableSeries(fl.TOTAL) },
          ]} />
        <div className="eb-tablewrap">
          <table className="eb-table">
            <caption className="eb-sr">Return filers and taxpayers by category</caption>
            <thead>
              <tr><th scope="col">Category</th><th scope="col" className="eb-num">Return filers, {f1}</th><th scope="col" className="eb-num">Change on {f0}</th><th scope="col" className="eb-num">Taxpayers, AY {a1}</th><th scope="col" className="eb-num">Change on AY {a0}</th></tr>
            </thead>
            <tbody>
              {CATS.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  <td className="eb-num">{formatValue(n(fl, k, f1), 0)}</td>
                  <td className="eb-num eb-muted">{g1(growth(n(fl, k, f1), n(fl, k, f0)))}</td>
                  <td className="eb-num">{formatValue(n(tp, k, a1), 0)}</td>
                  <td className="eb-num eb-muted">{g1(growth(n(tp, k, a1), n(tp, k, a0)))}</td>
                </tr>
              ))}
              <tr className="eb-dt-total">
                <th scope="row">Total</th>
                <td className="eb-num">{formatValue(n(fl, 'TOTAL', f1), 0)}</td>
                <td className="eb-num eb-muted">{g1(growth(n(fl, 'TOTAL', f1), n(fl, 'TOTAL', f0)))}</td>
                <td className="eb-num">{formatValue(n(tp, 'TOTAL', a1), 0)}</td>
                <td className="eb-num eb-muted">{g1(growth(n(tp, 'TOTAL', a1), n(tp, 'TOTAL', a0)))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function StateTable({ st }) {
  const years = st?.years || [];
  const [pick, setPick] = useState(null);
  const [all, setAll] = useState(false);
  if (!years.length) return null;
  const y = pick || years.at(-1);
  const i = years.indexOf(y);
  const prev = i > 0 ? years[i - 1] : null;
  const rows = [];
  for (const [kind, set] of [['state', st.states], ['ut', st.uts]]) {
    for (const [name, v] of Object.entries(set || {})) {
      if (v[y] != null) rows.push({ name, kind, value: v[y], prev: prev ? v[prev] : null, first: v[years[0]] });
    }
  }
  rows.sort((a, b) => b.value - a.value);
  const total = st.totals?.grand?.[y] || rows.reduce((s, r) => s + r.value, 0);
  const top3 = rows.slice(0, 3);
  const shown = all ? rows : rows.slice(0, 12);
  const other = st.totals || {};
  const firstY = years[0];
  return (
    <section className="eb-section" id="dt-states" aria-labelledby="dt-states-h">
      <h2 id="dt-states-h">By state and union territory</h2>
      <p className="eb-ru-lead">
        In {y}, {top3.map((r) => r.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} together accounted for <strong>{formatValue(top3.reduce((s, r) => s + r.value, 0) / total * 100, 0)}%</strong> of
        collections. CBDT assigns tax to the state in the taxpayer's address on record, so collections lean towards the states where large companies have their
        head offices and where employers deduct TDS. Read this as where tax is paid from, not where the income is earned.
      </p>
      <div className="eb-range eb-dt-years" role="group" aria-label="Financial year">
        {years.map((yy) => <button key={yy} type="button" aria-pressed={yy === y} onClick={() => setPick(yy)}>{yy}</button>)}
      </div>
      <div className="eb-tablewrap">
        <table className="eb-table">
          <caption className="eb-sr">Net direct tax collections by state and UT, {y}</caption>
          <thead>
            <tr>
              <th scope="col">State or UT</th><th scope="col" className="eb-num">{y} (₹ crore)</th><th scope="col" className="eb-num">Share</th>
              <th scope="col" className="eb-num">{prev ? `Change on ${prev}` : 'Change'}</th>
              {y !== firstY && <th scope="col" className="eb-num">Change since {firstY}</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}{r.kind === 'ut' ? ' (UT)' : ''}</th>
                <td className="eb-num">{formatValue(r.value, 0)}</td>
                <td className="eb-num">{formatValue(r.value / total * 100, 1)}%</td>
                <td className="eb-num eb-muted">{r.prev > 0 ? g1(growth(r.value, r.prev)) : 'n.a.'}</td>
                {y !== firstY && <td className="eb-num eb-muted">{r.first > 0 ? g1(growth(r.value, r.first)) : 'n.a.'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && (
        <p><button type="button" className="eb-btn eb-noprint" onClick={() => setAll(!all)}>{all ? 'Show the top 12' : `Show all ${rows.length}`}</button></p>
      )}
      <p className="eb-muted">
        Not assigned to a state in {y}: central TDS ₹{formatValue(other['C.T.D.S']?.[y] || 0, 0)} crore
        {other.Foreign?.[y] != null ? <>, taxpayers with an address outside India ₹{formatValue(other.Foreign[y], 0)} crore</> : null}
        {other.Unapportioned?.[y] != null ? <>, address missing or invalid ₹{signed(formatValue(other.Unapportioned[y], 0))} crore</> : null}.
        {' '}Jammu and Kashmir is shown as one series (a state until October 2019); Dadra and Nagar Haveli and Daman and Diu are combined (merged in 2020).
        A large one-year swing for a single state can come from changes in recorded addresses rather than in the economy. CBDT, Time Series Data, table 1.2.
      </p>
    </section>
  );
}

function About({ d }) {
  const prov = Object.entries(d.fy || {}).filter(([, v]) => v.provisional).map(([y]) => y);
  return (
    <section className="eb-section" id="dt-about" aria-labelledby="dt-about-h">
      <h2 id="dt-about-h">About the data</h2>
      <dl className="eb-facts">
        <div><dt>Source</dt><dd><a href={d.source_url} target="_blank" rel="noreferrer">{d.source}</a>, financial years 2000-01 to {d.covers_to} (file {d.file}).</dd></div>
        <div><dt>Provisional</dt><dd>{prov.length ? `${prov.join(', ')}. CBDT revises the latest year in the next edition.` : 'None.'}</dd></div>
        <div><dt>Updated</dt><dd>Once a year, when CBDT publishes a new edition. The Income Tax Department's site does not allow automated downloads, so the PDF is downloaded in a browser and uploaded to data/uploads/direct-taxes/ on GitHub; the board reads it within minutes and checks its tables against each other first.</dd></div>
        <div><dt>Definitions</dt><dd>Net collections are after refunds. Non-corporate tax covers individuals, Hindu undivided families, firms, associations of persons, local authorities and artificial juridical persons, and includes securities transaction tax. Taxpayers are counted by assessment year (AY 2024-25 is income of 2023-24).</dd></div>
        {d.source_inconsistencies?.length > 0 && <div><dt>In CBDT's own tables</dt><dd>{d.source_inconsistencies.join(' ')}</dd></div>}
      </dl>
    </section>
  );
}

export default function DirectTaxPage({ base, items }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`${base}direct-taxes.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => live && setD(j))
      .catch((e) => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, [base]);

  return (
    <>
      <nav className="eb-crumbs" aria-label="Breadcrumb"><a href="#/">Dashboard</a><span aria-hidden="true">/</span><span>Direct taxes</span></nav>
      <header className="eb-pagehead">
        <h1>Direct taxes</h1>
        {d && <Summary fy={d.fy} d={d} />}
        <p className="eb-asof">Collections, how tax is paid, the tax base and the state picture, from CBDT's Time Series Data{d ? `, 2000-01 to ${d.covers_to}` : ''}. Annual figures.</p>
        <Jump />
      </header>

      <section className="eb-section" aria-labelledby="dt-latest-h">
        <h2 id="dt-latest-h">Latest figures</h2>
        <Ledger caption="Direct taxes" items={items} />
      </section>

      {err && <p className="eb-muted">The detailed direct tax tables could not be loaded ({err}). The figures above are unaffected.</p>}
      {!d && !err && <p className="eb-muted" role="status">Loading the detailed tables…</p>}
      {d && (
        <>
          <Collections fy={d.fy} />
          <HowPaid fy={d.fy} />
          <Economy fy={d.fy} />
          <Base d={d} />
          <StateTable st={d.by_state} />
          <About d={d} />
        </>
      )}
    </>
  );
}
