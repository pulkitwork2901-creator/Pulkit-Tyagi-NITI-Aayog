import { useEffect, useState } from 'react';
import '../board/board.css';
import './reform.css';
import useIndicators from '../board/useIndicators.js';
import { formatDate, formatDateTime } from '../board/format.js';
import { AgeBar, PairBars, PeerDots, ScoreChart } from './charts.jsx';
import { LanguageToggle } from '../i18n.jsx';

// Reform Evidence Board: outcome evidence for regulatory and governance reform.
// Reads public/data/reform/evidence.json, built by scripts/build_reform.py.

const SKINS = [
  { id: 'teal', label: 'Teal' },
  { id: 'saffron', label: 'Saffron' },
  { id: 'dark', label: 'Dark' },
];
function readSkin() {
  try {
    const s = localStorage.getItem('rb-skin');
    if (SKINS.some((k) => k.id === s)) return s;
  } catch { /* storage blocked: fall through to the system setting */ }
  try {
    const host = document.documentElement.dataset.theme; // set by some embedding pages
    if (host === 'dark' || host === 'light') return host === 'dark' ? 'dark' : 'teal';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'teal';
  } catch { return 'teal'; }
}

const nf = (d = 0) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const inr = (n) => nf(0).format(n);
// 5,21,74,892 -> "5.22 crore"; 46,82,088 -> "46.8 lakh"
function indian(n) {
  if (n >= 1e7) return { v: nf(2).format(n / 1e7), u: 'crore' };
  if (n >= 1e5) return { v: nf(1).format(n / 1e5), u: 'lakh' };
  return { v: inr(n), u: '' };
}
const pct = (a, b) => (100 * a) / b;
const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const lakhCr = (cr) => `₹${nf(2).format(cr / 1e5)} lakh crore`;
const LEVEL = { district: 'District and subordinate courts', high_courts: 'High Courts' };

function Pill({ tone = 'neutral', children }) {
  return <span className={`eb-chip eb-${tone}`}>{children}</span>;
}

function Tile({ label, value, unit, pill, foot, href }) {
  const body = (
    <>
      <span className="eb-tile-label">{label}</span>
      <span className="eb-tile-value">{value}<span className="eb-tile-unit">{unit}</span></span>
    </>
  );
  return (
    <li className="eb-tile">
      {href ? <a className="eb-tile-link" href={href}>{body}</a> : <span className="eb-tile-link">{body}</span>}
      {pill && <span className="eb-tile-change">{pill}</span>}
      <span className="eb-tile-period">{foot}</span>
    </li>
  );
}

function changePill(d) {
  if (!d.base_year) return null;
  const diff = d.value - d.base_value;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const txt = `${sign}${Math.abs(diff).toFixed(1)} since ${d.base_year}`; // compared with the World Bank's 90% intervals
  if (d.ten_year_change === 'up') return <Pill tone="good"><span aria-hidden="true">▲</span> {txt}, significant</Pill>;
  if (d.ten_year_change === 'down') return <Pill tone="bad"><span aria-hidden="true">▼</span> {txt}, significant</Pill>;
  return <Pill>{txt}, within margin</Pill>;
}

function StatusLine({ status, label, when }) {
  const s = status || { state: 'missing' };
  return (
    <li>
      <span className={`rb-dot rb-dot-${s.state}`} aria-hidden="true" />
      <b>{label}</b>{' '}
      {s.state === 'ok' && <>refreshed {formatDateTime(s.checked_at)}{when ? `; data ${when}` : ''}</>}
      {s.state === 'stale' && <>could not refresh on {formatDateTime(s.checked_at)}; showing the last good copy{s.last_ok ? ` from ${formatDateTime(s.last_ok)}` : ''}</>}
      {s.state === 'missing' && <>not available yet</>}
    </li>
  );
}

// ---------------------------------------------------------------- sections

function Governance({ wgi }) {
  const dims = wgi.dimensions;
  const [code, setCode] = useState('RQ');
  const d = dims.find((x) => x.code === code) || dims[0];
  return (
    <section aria-labelledby="rb-gov-h" className="rb-section">
      <div className="eb-eyebar">
        <h2 className="eb-eyebrow" id="rb-gov-h">Governance scores · World Bank</h2>
      </div>
      <div className="rb-tabs" role="group" aria-label="Governance dimension">
        {dims.map((x) => (
          <button key={x.code} type="button" aria-pressed={x.code === d.code} onClick={() => setCode(x.code)}>{x.label}</button>
        ))}
      </div>
      <div className="rb-grid-2">
        <figure className="eb-mc">
          <figcaption>
            <h3 className="eb-mc-title">{d.label}: India, {d.series[0].year} to {d.latest_year}</h3>
            <p className="eb-mc-head"><b>{d.value.toFixed(1)}</b><span>out of 100 · rank {d.rank} of {d.of}</span></p>
            <p className="eb-mc-note">{d.definition} Shaded: 90% confidence interval. World median in {d.latest_year}: {d.world_median.toFixed(1)}.</p>
          </figcaption>
          <ScoreChart series={d.series} label={d.label} />
        </figure>
        <figure className="eb-mc">
          <figcaption>
            <h3 className="eb-mc-title">India and peers, {d.latest_year}</h3>
            <p className="eb-mc-note">Dot: score out of 100. Line: 90% interval. Shaded column: India's interval; peers whose dot falls inside it are not measurably different from India.</p>
          </figcaption>
          <PeerDots peers={d.peers} />
        </figure>
      </div>
      <p className="rb-caveat">
        These are perception-based composites drawn from surveys and expert assessments, on the 0 to 100 scale the World Bank introduced
        in its 2025 methodology revision. Read a change as real only when the confidence intervals do not overlap. The World Bank itself
        says purpose-built, country-level diagnostics are generally more effective for assessing specific institutional reforms, so treat
        these as context for a note, not proof that a reform worked.
      </p>
    </section>
  );
}

function CourtCard({ level, d }) {
  const over10 = d.ages[d.ages.length - 1].total;
  const ageTotal = d.ages.reduce((a, b) => a + b.total, 0);
  const t = indian(d.total);
  const clearance = d.instituted_last_month && d.disposed_last_month ? pct(d.disposed_last_month, d.instituted_last_month) : null;
  return (
    <article className="eb-mc rb-court">
      <header className="rb-court-head">
        <h3 className="eb-mc-title">{LEVEL[level]}</h3>
        <a className="eb-more" href={d.source_url} target="_blank" rel="noreferrer">NJDG ↗</a>
      </header>
      <p className="rb-big"><b>{t.v}</b> {t.u} cases pending</p>
      <dl className="rb-facts">
        <div><dt>Civil</dt><dd>{indian(d.civil).v} {indian(d.civil).u} <small>({pct(d.civil, d.total).toFixed(0)}%)</small></dd></div>
        <div><dt>Criminal</dt><dd>{indian(d.criminal).v} {indian(d.criminal).u} <small>({pct(d.criminal, d.total).toFixed(0)}%)</small></dd></div>
        <div><dt>Over 10 years old</dt><dd>{indian(over10).v} {indian(over10).u} <small>({pct(over10, ageTotal).toFixed(1)}%)</small></dd></div>
      </dl>
      <h4 className="rb-sub">Age of pending cases</h4>
      <AgeBar ages={d.ages} label={`${LEVEL[level]}, age of pending cases`} />
      {clearance != null && (
        <div className="rb-flow">
          <span>Last month: <b>{inr(d.instituted_last_month)}</b> filed, <b>{inr(d.disposed_last_month)}</b> disposed</span>
          <Pill tone={clearance >= 100 ? 'good' : 'bad'}>
            <span aria-hidden="true">{clearance >= 100 ? '▼' : '▲'}</span> clearance {clearance.toFixed(0)}%, backlog {clearance >= 100 ? 'falling' : 'growing'}
          </Pill>
        </div>
      )}
    </article>
  );
}

function Courts({ njdg }) {
  const hist = njdg.history || {};
  const days = Object.values(hist)[0]?.length || 0;
  return (
    <section aria-labelledby="rb-court-h" className="rb-section">
      <div className="eb-eyebar">
        <h2 className="eb-eyebrow" id="rb-court-h">Courts · National Judicial Data Grid</h2>
        <span className="rb-when">Read {formatDateTime(njdg.read_at)}</span>
      </div>
      <div className="rb-grid-2">
        {['district', 'high_courts'].map((k) => njdg.levels?.[k] && <CourtCard key={k} level={k} d={njdg.levels[k]} />)}
      </div>
      <p className="rb-caveat">
        Clearance rate is cases disposed as a share of cases filed in the same month; below 100% the backlog grows. NJDG figures are live
        and depend on courts uploading their data. The board saves one reading a day, so a pendency trend builds up from
        {' '}{days ? formatDate(Object.values(hist)[0][0].date) : 'the first run'} ({days} reading{days === 1 ? '' : 's'} so far).
        Supreme Court figures are not included yet.
      </p>
    </section>
  );
}

function Insolvency({ ibbi }) {
  const s = ibbi.status;
  const r = ibbi.realisation;
  const full = ibbi.flow.filter((f) => /^\d{4}-\d{2}$/.test(f.period));
  const part = ibbi.flow.find((f) => !/^\d{4}-\d{2}$/.test(f.period));
  const outcomes = [
    ['Resolution plan approved', s.resolved],
    ['Liquidation ordered', s.liquidated],
    ['Closed on appeal, review or settlement', s.appeal],
    ['Withdrawn under Section 12A', s.withdrawn],
    ['Still ongoing', s.ongoing],
  ];
  const max = Math.max(...outcomes.map((o) => o[1]));
  const days = ibbi.days_to_resolution;
  const lastFull = days.filter((d) => d.period.startsWith('To end')).pop();
  const qtr = days.find((d) => !d.period.startsWith('To end'));
  return (
    <section aria-labelledby="rb-ibc-h" className="rb-section">
      <div className="eb-eyebar">
        <h2 className="eb-eyebrow" id="rb-ibc-h">Insolvency and Bankruptcy Code · IBBI</h2>
        <span className="rb-when">Data as on {formatDate(ibbi.as_on)}</span>
      </div>
      <div className="rb-grid-3">
        <article className="eb-mc">
          <h3 className="eb-mc-title">Where the {inr(s.admitted)} admitted cases stand</h3>
          <p className="eb-mc-note">Corporate insolvency resolution processes since the Code came into force in 2016.</p>
          <ul className="eb-bars rb-bars">
            {outcomes.map(([label, n]) => (
              <li key={label} className="eb-bar-row rb-bar-row">
                <span className="eb-bar-text">
                  <span className="eb-bar-label">{label}</span>
                  <span className="eb-bar-track"><i style={{ width: `${(100 * n) / max}%` }} /></span>
                </span>
                <span className="eb-bar-val">{inr(n)}<small>{pct(n, s.admitted).toFixed(1)}%</small></span>
              </li>
            ))}
          </ul>
        </article>
        <figure className="eb-mc">
          <figcaption>
            <h3 className="eb-mc-title">Resolutions and liquidations each year</h3>
            <p className="eb-mc-note">
              Number of cases closed, by financial year.
              {part && ` ${part.period.replace(',', '')} (part year, not drawn): ${part.resolved} resolved, ${part.liquidated} liquidated.`}
            </p>
            <ul className="eb-mc-legend">
              <li><i style={{ background: 'var(--eb-s1)' }} aria-hidden="true" />Resolution plan approved</li>
              <li><i style={{ background: 'var(--eb-s2)' }} aria-hidden="true" />Liquidation ordered</li>
            </ul>
          </figcaption>
          <PairBars rows={full.map((f) => ({ ...f, short: `FY${f.period.slice(-2)}` }))}
            series={[{ key: 'resolved', label: 'Resolution plan approved', color: 'var(--eb-s1)' }, { key: 'liquidated', label: 'Liquidation ordered', color: 'var(--eb-s2)' }]} />
        </figure>
        <article className="eb-mc rb-ibc-out">
          <h3 className="eb-mc-title">What creditors recover, and how long it takes</h3>
          <p className="rb-big"><b>{r.pct_of_claims.toFixed(1)}%</b> of admitted claims realised</p>
          <p className="eb-mc-note">
            {lakhCr(r.realised_cr)} realised against {lakhCr(r.claims_cr)} of claims, in cases closed with a resolution plan.
            That is {r.pct_of_liquidation_value.toFixed(0)}% of liquidation value and {r.pct_of_fair_value.toFixed(0)}% of fair value
            {r.fair_value_cases ? ` (fair value over the ${inr(r.fair_value_cases)} cases where it was estimated)` : ''}.
          </p>
          {lastFull && (
            <>
              <p className="rb-big rb-big-2"><b>{inr(lastFull.days)}</b> days on average to a resolution plan</p>
              <p className="eb-mc-note">
                From commencement to approval, {inr(lastFull.processes)} processes {lastFull.period.replace('To end-', 'to end-')} ({inr(lastFull.days_excl)} days
                excluding time the tribunal excluded). Section 12 of the Code sets 330 days, litigation included.
                {qtr && ` Plans approved in ${qtr.period.replace(',', '')} took ${inr(qtr.days)} days on average (${qtr.processes} cases).`}
              </p>
            </>
          )}
        </article>
      </div>
      <p className="rb-caveat">
        From IBBI's <a href={ibbi.file_url}>{ibbi.newsletter.replace('Quarterly newsletter', 'quarterly newsletter')} data file</a>. Recovery figures cover only cases that ended in a
        resolution plan; liquidations usually recover far less.
      </p>
    </section>
  );
}

function Milestones({ items }) {
  if (!items?.length) return null;
  return (
    <section aria-labelledby="rb-ms-h" className="rb-section">
      <div className="eb-eyebar"><h2 className="eb-eyebrow" id="rb-ms-h">Decriminalisation milestones · Jan Vishwas</h2></div>
      <ol className="rb-timeline eb-card">
        {items.map((m) => (
          <li key={`${m.date}-${m.title}`}>
            <time dateTime={m.date}>{formatDate(m.date)}</time>
            <div>
              <h3>{m.title}</h3>
              <p>{m.detail}</p>
              <a href={m.url} target="_blank" rel="noreferrer">{m.source} ↗</a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- rule-making

const REGS = ['SEBI', 'RBI', 'TRAI', 'IRDAI'];
const REG_FULL = {
  SEBI: 'Securities and Exchange Board of India',
  RBI: 'Reserve Bank of India',
  TRAI: 'Telecom Regulatory Authority of India',
  IRDAI: 'Insurance Regulatory and Development Authority of India',
};
const DAY = 86400000;

function Consultations({ c, now }) {
  const [reg, setReg] = useState('All');
  const [more, setMore] = useState(false);
  const pool = c.items.filter((i) => reg === 'All' || i.regulator === reg);
  const shown = more ? pool : pool.slice(0, 10);
  const last90 = (r) => c.items.filter((i) => i.regulator === r && now - Date.parse(i.date) <= 90 * DAY).length;
  return (
    <section aria-labelledby="rb-cons-h" className="rb-section">
      <div className="eb-eyebar">
        <h2 className="eb-eyebrow" id="rb-cons-h">Rule-making · regulator consultations and drafts</h2>
        <span className="rb-when">Read {formatDateTime(c.read_at)}</span>
      </div>
      <ul className="rb-regs">
        {REGS.map((r) => (
          <li key={r} className="eb-card">
            <a href={c.regulators?.[r]?.page} target="_blank" rel="noreferrer" title={REG_FULL[r]}>{r} ↗</a>
            <b>{last90(r)}</b>
            <span>in the last 90 days{c.regulators?.[r]?.state !== 'ok' ? ' (not refreshed today)' : ''}</span>
          </li>
        ))}
      </ul>
      <div className="eb-card rb-cons">
        <div className="rb-tabs" role="group" aria-label="Regulator">
          {['All', ...REGS].map((r) => (
            <button key={r} type="button" aria-pressed={reg === r} onClick={() => { setReg(r); setMore(false); }}>{r}</button>
          ))}
        </div>
        <ol>
          {shown.map((i) => (
            <li key={`${i.regulator}-${i.date}-${i.title}`}>
              <span className="rb-cons-meta">
                <time dateTime={i.date}>{formatDate(i.date)}</time>
                <span className="rb-reg">{i.regulator}</span>
              </span>
              <span className="rb-cons-body">
                <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a>
                <span className="rb-cons-tags">
                  <Pill>{i.kind}</Pill>
                  {i.status === 'Open' && <Pill tone="good">Open for comments</Pill>}
                  {i.division && <span className="rb-muted">{i.division}</span>}
                </span>
              </span>
            </li>
          ))}
        </ol>
        {pool.length > 10 && (
          <button type="button" className="eb-btn rb-more" onClick={() => setMore(!more)}>{more ? 'Show fewer' : `Show all ${pool.length}`}</button>
        )}
      </div>
      <p className="rb-caveat">
        The twelve most recent items from each regulator's own listing page. Only TRAI states on its list whether a consultation is still
        open; for the others, the last date for comments is given inside the paper. IRDAI's "response to comments" items show where the
        regulator has published its reply to public feedback.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- ease of living

const shortOrg = (n) => n.replace(/^Union Territory of /, '').replace(/^NCT of /, '').replace(/ - PG Division$/, '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

function GrievanceCard({ title, block, list, listTitle, listNote, metric }) {
  const t = block.total;
  const pendTotal = t.pending.reduce((a, b) => a + b, 0);
  return (
    <article className="eb-mc rb-court">
      <h3 className="eb-mc-title">{title}</h3>
      <p className="rb-big"><b>{t.pct_disposed.toFixed(1)}%</b> of grievances disposed</p>
      <p className="eb-mc-note">{indian(t.received).v} {indian(t.received).u} received, {indian(t.disposed).v} {indian(t.disposed).u} disposed; {inr(pendTotal)} pending.</p>
      <h4 className="rb-sub">Age of pending grievances</h4>
      <AgeBar ages={['Under 60 days', '60 to 180 days', '180 days to 1 year', 'Over 1 year'].map((band, i) => ({ band, total: t.pending[i] }))} label={`${title}, age of pending grievances`} />
      <h4 className="rb-sub">{listTitle}</h4>
      <ul className="eb-bars rb-bars">
        {list.map((o) => (
          <li key={o.name} className="eb-bar-row rb-bar-row">
            <span className="eb-bar-text">
              <span className="eb-bar-label">{shortOrg(o.name)}</span>
              <span className="eb-bar-track"><i style={{ width: `${metric === 'pct' ? o.pct_disposed : (100 * o.received) / list[0].received}%` }} /></span>
            </span>
            <span className="eb-bar-val">
              {metric === 'pct' ? `${o.pct_disposed.toFixed(1)}%` : inr(o.received)}
              <small>{metric === 'pct' ? `of ${inr(o.received)}` : `${o.pct_disposed.toFixed(1)}% disposed`}</small>
            </span>
          </li>
        ))}
      </ul>
      {listNote && <p className="eb-mc-note">{listNote}</p>}
    </article>
  );
}

function Grievances({ g }) {
  const topCentral = [...g.central.orgs].sort((a, b) => b.received - a.received).slice(0, 8);
  const lowStates = g.states.orgs.filter((o) => o.received >= 1000).sort((a, b) => a.pct_disposed - b.pct_disposed).slice(0, 8);
  return (
    <section aria-labelledby="rb-grv-h" className="rb-section">
      <div className="eb-eyebar">
        <h2 className="eb-eyebrow" id="rb-grv-h">Ease of living · public grievances (CPGRAMS)</h2>
        <span className="rb-when">{formatDate(g.from)} to {formatDate(g.to)}</span>
      </div>
      <div className="rb-grid-2">
        <GrievanceCard title="Central ministries and departments" block={g.central} list={topCentral} metric="received"
          listTitle="Most grievances received" />
        <GrievanceCard title="States and Union Territories" block={g.states} list={lowStates} metric="pct"
          listTitle="Lowest disposal rates" listNote="States and UTs with at least 1,000 grievances this year." />
      </div>
      <p className="rb-caveat">
        From DARPG's public CPGRAMS dashboard, for grievances lodged on the portal this calendar year. Disposed counts can include
        grievances carried over from earlier periods. Disposal is not the same as resolution to the citizen's satisfaction; DARPG's
        monthly reports cover feedback and appeals.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- doing business

function Msme({ m }) {
  const t = m.total;
  const top = m.states.slice(0, 10);
  const u = indian(t.udyam);
  const x = indian(t.uap);
  const days = m.history?.length || 0;
  return (
    <section aria-labelledby="rb-msme-h" className="rb-section">
      <div className="eb-eyebar">
        <h2 className="eb-eyebrow" id="rb-msme-h">Doing business · MSME registration (Udyam)</h2>
        <span className="rb-when">Read {formatDateTime(m.read_at)}</span>
      </div>
      <div className="rb-grid-2">
        <article className="eb-mc rb-court">
          <h3 className="eb-mc-title">Enterprises registered</h3>
          <p className="rb-big"><b>{u.v}</b> {u.u} on Udyam</p>
          <p className="eb-mc-note">Plus {x.v} {x.u} informal micro enterprises on the Udyam Assist Platform: {indian(t.total).v} {indian(t.total).u} in all.</p>
          <dl className="rb-facts">
            <div><dt>Micro</dt><dd>{indian(t.micro).v} {indian(t.micro).u} <small>({pct(t.micro, t.udyam).toFixed(1)}%)</small></dd></div>
            <div><dt>Small</dt><dd>{indian(t.small).v} {indian(t.small).u} <small>({pct(t.small, t.udyam).toFixed(2)}%)</small></dd></div>
            <div><dt>Medium</dt><dd>{inr(t.medium)} <small>({pct(t.medium, t.udyam).toFixed(2)}%)</small></dd></div>
          </dl>
          <p className="eb-mc-note rb-gap">
            Almost every registered enterprise is micro: small and medium firms together are about{' '}
            {pct(t.small + t.medium, t.udyam).toFixed(1)}% of registrations. Counts are cumulative registrations, not active firms.
          </p>
        </article>
        <article className="eb-mc">
          <h3 className="eb-mc-title">Largest states by Udyam registrations</h3>
          <ul className="eb-bars rb-bars">
            {top.map((s) => (
              <li key={s.name} className="eb-bar-row rb-bar-row">
                <span className="eb-bar-text">
                  <span className="eb-bar-label">{s.name}</span>
                  <span className="eb-bar-track"><i style={{ width: `${(100 * s.udyam) / top[0].udyam}%` }} /></span>
                </span>
                <span className="eb-bar-val">{indian(s.udyam).v} {indian(s.udyam).u}<small>{pct(s.udyam, t.udyam).toFixed(1)}% of India</small></span>
              </li>
            ))}
          </ul>
        </article>
      </div>
      <p className="rb-caveat">
        From the Ministry of MSME's public dashboard. It shows no "as on" date, so the board records the date it read the page and keeps
        one reading a day ({days} so far) to build a registration trend. Company incorporations (MCA) are not included because MCA's
        website does not allow automated reading.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- page

export default function ReformBoard({ source }) {
  const { status, data, error, reload } = useIndicators(source);
  const [skin, setSkin] = useState(readSkin);
  const choose = (s) => {
    setSkin(s);
    try { localStorage.setItem('rb-skin', s); } catch { /* keep for this visit only */ }
  };
  useEffect(() => { document.title = 'Reform Evidence Board | NITI Aayog'; }, []);

  if (status === 'loading') {
    return (
      <div className="eb rb" data-skin={skin}>
        <main className="rb-main eb-dash"><p className="eb-sr" role="status">Loading the latest figures…</p><div className="eb-skel-hero" /><div className="eb-skel-row">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="eb-skel-tile" />)}</div></main>
      </div>
    );
  }
  if (status === 'error' || !data) {
    return (
      <div className="eb rb" data-skin={skin}>
        <main className="rb-main"><div className="eb-error"><h1>The board could not load its data</h1><p>{error}. Check that {source} exists and was built by scripts/build_reform.py.</p><button type="button" className="eb-btn" onClick={reload}>Try again</button></div></main>
      </div>
    );
  }

  const byCode = Object.fromEntries((data.wgi?.dimensions || []).map((d) => [d.code, d]));
  const rq = byCode.RQ;
  const dc = data.njdg?.levels?.district;
  const ib = data.ibbi;
  const gc = data.grievances?.central?.total;
  const gs = data.grievances?.states?.total;
  const ms = data.msme?.total;
  const now = Date.parse(data.generated_at);
  const cons90 = (data.consultations?.items || []).filter((i) => now - Date.parse(i.date) <= 90 * DAY);
  const openNow = (data.consultations?.items || []).filter((i) => i.status === 'Open').length;
  const jump = [
    ['rb-cons-h', 'Consultations', data.consultations], ['rb-grv-h', 'Grievances', data.grievances], ['rb-msme-h', 'MSMEs', data.msme],
    ['rb-gov-h', 'Governance scores', data.wgi], ['rb-court-h', 'Courts', data.njdg], ['rb-ibc-h', 'Insolvency', ib], ['rb-ms-h', 'Jan Vishwas', data.milestones?.length],
  ].filter((j) => j[2]);

  return (
    <div className="eb rb" data-skin={skin}>
      <main className="rb-main eb-dash" id="rb-main">
        <header className="eb-hero">
          <div className="eb-hero-top">
            <div>
              <p className="eb-hero-kicker">NITI Aayog · Governance and Reforms Division</p>
              <h1>Reform Evidence Board</h1>
              <p className="eb-hero-asof">Position as on {formatDateTime(data.generated_at)} · refreshed daily from official sources</p>
            </div>
            <div className="eb-range" role="group" aria-label="Colour scheme">
              <LanguageToggle />
              {SKINS.map((s) => <button key={s.id} type="button" aria-pressed={skin === s.id} onClick={() => choose(s.id)}>{s.label}</button>)}
            </div>
          </div>
          <p className="eb-lead">
            {data.consultations && <>SEBI, RBI, TRAI and IRDAI issued <strong>{cons90.length} consultation papers, drafts and responses</strong> in the last 90 days. </>}
            {gc && <>Central ministries have disposed of <strong>{gc.pct_disposed.toFixed(1)}% of {indian(gc.received).v} {indian(gc.received).u} public grievances</strong> this year{gs ? `, States and UTs ${gs.pct_disposed.toFixed(1)}%` : ''}. </>}
            {ms && <><strong>{indian(ms.udyam).v} {indian(ms.udyam).u} enterprises</strong> hold Udyam registration. </>}
            {rq && <>India scores <strong>{rq.value.toFixed(1)} out of 100</strong> on the World Bank's regulatory quality measure ({rq.latest_year}), {ordinal(rq.rank)} of {rq.of} economies. </>}
            {dc && <>District courts hold <strong>{indian(dc.total).v} {indian(dc.total).u} pending cases</strong>.</>}
          </p>
        </header>

        <h2 className="eb-eyebrow" id="rb-tiles-h">Headline evidence</h2>
        <ul className="eb-tiles" aria-labelledby="rb-tiles-h">
          {data.consultations && <Tile label="Consultations, last 90 days" value={inr(cons90.length)} unit="papers" pill={<Pill tone={openNow ? 'good' : 'neutral'}>{openNow} marked open</Pill>} foot="SEBI · RBI · TRAI · IRDAI" href="#rb-cons-h" />}
          {gc && <Tile label="Grievances disposed, Centre" value={gc.pct_disposed.toFixed(1)} unit="%" pill={<Pill>{inr(gc.pending.slice(1).reduce((a, b) => a + b, 0))} pending over 60 days</Pill>} foot={`CPGRAMS · ${formatDate(data.grievances.from)} to ${formatDate(data.grievances.to)}`} href="#rb-grv-h" />}
          {ms && <Tile label="MSMEs on Udyam" value={indian(ms.udyam).v} unit={indian(ms.udyam).u} pill={<Pill>+{indian(ms.uap).v} {indian(ms.uap).u} informal</Pill>} foot={`MSME dashboard · ${formatDate(data.msme.read_at)}`} href="#rb-msme-h" />}
          {rq && <Tile label="Regulatory quality" value={rq.value.toFixed(1)} unit="/ 100" pill={changePill(rq)} foot={`World Bank ${rq.latest_year} · rank ${rq.rank} of ${rq.of}`} href="#rb-gov-h" />}
          {dc && <Tile label="Pending, district courts" value={indian(dc.total).v} unit={indian(dc.total).u} pill={<Pill tone={dc.disposed_last_month >= dc.instituted_last_month ? 'good' : 'bad'}>{pct(dc.disposed_last_month, dc.instituted_last_month).toFixed(0)}% clearance</Pill>} foot={`NJDG · ${formatDate(data.njdg.read_at)}`} href="#rb-court-h" />}
          {ib && <Tile label="IBC recovery" value={ib.realisation.pct_of_claims.toFixed(1)} unit="% of claims" pill={<Pill>{inr(ib.status.resolved)} plans approved</Pill>} foot={`IBBI · to ${formatDate(ib.as_on)}`} href="#rb-ibc-h" />}
        </ul>

        <nav className="rb-jump" aria-label="Sections">
          {jump.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        {data.consultations && <Consultations c={data.consultations} now={now} />}
        {data.grievances && <Grievances g={data.grievances} />}
        {data.msme && <Msme m={data.msme} />}
        {data.wgi && <Governance wgi={data.wgi} />}
        <h2 className="rb-group">Justice and dispute resolution</h2>
        {data.njdg && <Courts njdg={data.njdg} />}
        {ib && <Insolvency ibbi={ib} />}
        <Milestones items={data.milestones} />

        <section aria-labelledby="rb-src-h" className="rb-section">
          <div className="eb-eyebar"><h2 className="eb-eyebrow" id="rb-src-h">Sources and freshness</h2></div>
          <div className="eb-card rb-sources">
            <ul className="rb-status">
              <StatusLine label="World Bank WGI" status={data.status?.wgi} when={data.wgi?.updated ? `updated by the World Bank ${formatDate(data.wgi.updated)}` : ''} />
              <StatusLine label="National Judicial Data Grid" status={data.status?.njdg} when="live" />
              <StatusLine label="IBBI quarterly data" status={data.status?.ibbi} when={ib ? `to ${formatDate(ib.as_on)}` : ''} />
              <StatusLine label="CPGRAMS grievances" status={data.status?.grievances} when={data.grievances ? `${formatDate(data.grievances.from)} to ${formatDate(data.grievances.to)}` : ''} />
              <StatusLine label="Udyam registrations" status={data.status?.msme} when="live" />
              <StatusLine label="Regulator consultations" status={data.status?.consultations}
                when={data.consultations ? REGS.filter((r) => data.consultations.regulators?.[r]?.state !== 'ok').map((r) => `${r} not refreshed`).join(', ') : ''} />
            </ul>
            <p>
              Every figure is read directly from the publisher:{' '}
              <a href="https://pgportal.gov.in/darpgdashboard" target="_blank" rel="noreferrer">CPGRAMS dashboard</a> (DARPG),{' '}
              <a href="https://dashboard.msme.gov.in/Udyam_Statewise.aspx" target="_blank" rel="noreferrer">MSME dashboard</a> (Ministry of MSME),
              the consultation pages of SEBI, RBI, TRAI and IRDAI,{' '}
              <a href="https://www.worldbank.org/en/publication/worldwide-governance-indicators" target="_blank" rel="noreferrer">Worldwide Governance Indicators</a> (World Bank API, source 3),{' '}
              <a href="https://njdg.ecourts.gov.in/njdg_v3/" target="_blank" rel="noreferrer">National Judicial Data Grid</a> (eCommittee, Supreme Court of India),{' '}
              <a href="https://ibbi.gov.in/publication" target="_blank" rel="noreferrer">IBBI quarterly newsletters</a>, and milestones from{' '}
              <a href="https://prsindia.org/billtrack" target="_blank" rel="noreferrer">PRS Legislative Research</a> and the Gazette of India.
              If a source cannot be reached, the board keeps its last good figures and marks them here.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
