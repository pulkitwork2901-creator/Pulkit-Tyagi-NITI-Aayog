import { useEffect, useMemo, useState } from 'react';
import '../board/board.css';
import '../reform/reform.css';
import './psu.css';
import useIndicators from '../board/useIndicators.js';
import { formatDate, formatDateTime } from '../board/format.js';
import { PairBars } from '../reform/charts.jsx';
import { RankBars, ShareBar, YearBars } from './charts.jsx';
import { LanguageToggle } from '../i18n.jsx';

// PSU Performance Board: how central public sector enterprises perform and
// what the Government earns from them. Reads public/data/psu/psu.json, built
// by scripts/build_psu.py from DPE (Public Enterprises Survey), PIB and DIPAM.

const SKINS = [
  { id: 'teal', label: 'Teal' },
  { id: 'saffron', label: 'Saffron' },
  { id: 'dark', label: 'Dark' },
];
function readSkin() {
  try {
    const s = localStorage.getItem('ps-skin');
    if (SKINS.some((k) => k.id === s)) return s;
  } catch { /* storage blocked: fall through to the system setting */ }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'teal';
  } catch { return 'teal'; }
}

const nf = (d = 0) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const minus = (s) => String(s).replace(/^-/, '−');
// All amounts are Rs crore.
const cr = (v) => (v == null ? 'n/a' : minus(`₹${nf(0).format(v)} crore`).replace('₹−', '−₹'));
const crShort = (v) => (v == null ? 'n/a' : minus(nf(0).format(v)));
const lakhCr = (v, d = 2) => (v == null ? 'n/a' : Math.abs(v) < 1e5 ? cr(v) : minus(`₹${nf(d).format(v / 1e5)} lakh crore`).replace('₹−', '−₹'));
const lakhNum = (v, d = 2) => (v == null ? 'n/a' : minus(nf(d).format(v / 1e5)));
const pct = (a, b) => (b ? (100 * (a - b)) / Math.abs(b) : null);
const signedPct = (p, d = 1) => (p == null ? 'n/a' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${nf(d).format(Math.abs(p))}%`);
// 'up 5.8%' / 'down 9.9%' for running text, where a bare sign reads badly.
const moved = (p, d = 1) => (p == null ? 'unchanged' : p > 0 ? `up ${nf(d).format(p)}%` : p < 0 ? `down ${nf(d).format(-p)}%` : 'unchanged');

function Pill({ tone = 'neutral', children }) {
  return <span className={`eb-chip eb-${tone}`}>{children}</span>;
}
function ChangePill({ now, before, upIsGood = true, suffix = '' }) {
  const p = pct(now, before);
  if (p == null) return null;
  const tone = p === 0 ? 'neutral' : (p > 0) === upIsGood ? 'good' : 'bad';
  return <Pill tone={tone}><span aria-hidden="true">{p > 0 ? '▲' : p < 0 ? '▼' : '▬'}</span> {signedPct(p)}{suffix}</Pill>;
}

function Tile({ label, value, unit, pill, foot, href }) {
  return (
    <li className="eb-tile">
      <a className="eb-tile-link" href={href}>
        <span className="eb-tile-label">{label}</span>
        <span className="eb-tile-value">{value}<span className="eb-tile-unit">{unit}</span></span>
      </a>
      {pill && <span className="eb-tile-change">{pill}</span>}
      <span className="eb-tile-period">{foot}</span>
    </li>
  );
}

function StatusLine({ status, label, when }) {
  const s = status || { state: 'missing' };
  return (
    <li>
      <span className={`rb-dot rb-dot-${s.state}`} aria-hidden="true" />
      <b>{label}</b>{' '}
      {s.state === 'ok' && <>read {formatDateTime(s.checked_at)}{when ? `; ${when}` : ''}</>}
      {s.state === 'stale' && <>could not refresh on {formatDateTime(s.checked_at)}; showing the last good copy{s.last_ok ? ` from ${formatDateTime(s.last_ok)}` : ''}</>}
      {s.state === 'missing' && <>not available yet</>}
    </li>
  );
}

function Section({ id, title, children, more }) {
  return (
    <section aria-labelledby={id} className="rb-section">
      <div className="eb-eyebar">
        <h2 className="eb-eyebrow" id={id}>{title}</h2>
        {more}
      </div>
      {children}
    </section>
  );
}

const shortFy = (fy) => fy.replace(/^20(\d\d)-(\d\d)$/, '$1-$2');

// ---------------------------------------------------------------- performance (DPE)

function ProfitHistory({ history }) {
  const order = ['2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25'];
  const byYear = Object.fromEntries(history.years.map((y) => [y.year, y]));
  const rows = order.map((yr) => {
    const y = byYear[yr] || {};
    return { period: yr, short: shortFy(yr), profit: y.profit_of_profit_makers ?? null, loss: y.loss_of_loss_makers != null ? -y.loss_of_loss_makers : null, net: y.overall_net_profit ?? null };
  });
  const money = (v, axis) => (v == null ? 'n/a' : axis ? lakhNum(v, v % 1e5 ? 1 : 0) : lakhCr(v));
  const revRows = order.map((yr) => ({ period: yr, short: shortFy(yr), revenue: byYear[yr]?.gross_revenue ?? null }));
  const cceRows = order.map((yr) => ({ period: yr, short: shortFy(yr), cce: byYear[yr]?.contribution_to_exchequer ?? null, div: byYear[yr]?.dividend_declared ?? null }));
  return (
    <div className="rb-grid-3 ps-grid-3">
      <figure className="eb-mc">
        <figcaption>
          <h3 className="eb-mc-title">Profit and loss of operating CPSEs</h3>
          <ul className="eb-mc-legend">
            <li><i style={{ background: 'var(--eb-s1)' }} />Profit of profit-makers</li>
            <li><i style={{ background: 'var(--eb-s2)' }} />Loss of loss-makers</li>
            <li><i style={{ background: 'var(--eb-navy)', height: 3 }} />Overall net profit</li>
          </ul>
          <p className="eb-mc-note">₹ lakh crore. 2020-21 is not shown: that year's survey is only on DPE's report portal, which this board cannot read.</p>
        </figcaption>
        <YearBars rows={rows} series={[{ key: 'profit', label: 'Profit of profit-makers', color: 'var(--eb-s1)' }, { key: 'loss', label: 'Loss of loss-makers', color: 'var(--eb-s2)' }]}
          dot={{ key: 'net', label: 'Overall net profit' }} fmt={money} label="Profit and loss of operating CPSEs by year" />
      </figure>
      <figure className="eb-mc">
        <figcaption>
          <h3 className="eb-mc-title">Gross revenue from operations</h3>
          <p className="eb-mc-note">₹ lakh crore, operating CPSEs. Moves with oil prices: refining and marketing is over half of it.</p>
        </figcaption>
        <YearBars rows={revRows} series={[{ key: 'revenue', label: 'Gross revenue', color: 'var(--eb-s1)' }]} fmt={money} label="Gross revenue of operating CPSEs by year" />
      </figure>
      <figure className="eb-mc">
        <figcaption>
          <h3 className="eb-mc-title">Paid to the Central Exchequer</h3>
          <ul className="eb-mc-legend"><li><i style={{ background: 'var(--eb-s3)' }} />Taxes, duties, interest and dividend</li></ul>
          <p className="eb-mc-note">₹ lakh crore, all CPSEs: excise, customs, GST, corporation tax, interest on Central loans, dividend and other levies.</p>
        </figcaption>
        <YearBars rows={cceRows} series={[{ key: 'cce', label: 'Contribution to exchequer', color: 'var(--eb-s3)' }]} fmt={money} label="Contribution of CPSEs to the Central Exchequer by year" />
      </figure>
    </div>
  );
}

function GroupTable({ pe }) {
  const [y0, y1, y2] = pe.years;
  const groups = pe.groups;
  const total = pe.totals;
  return (
    <div className="eb-tablewrap eb-card ps-tablecard">
      <table className="eb-table ps-table">
        <caption className="ps-caption">Net profit by cognate group, ₹ crore. A group's figure is the sum of its operating CPSEs, profit-makers and loss-makers together.</caption>
        <thead>
          <tr>
            <th scope="col">Cognate group</th>
            <th scope="col" className="ps-num ps-hide-sm">{y0}</th>
            <th scope="col" className="ps-num">{y1}</th>
            <th scope="col" className="ps-num">{y2}</th>
            <th scope="col" className="ps-num">Change<span className="ps-hide-sm"> on {y1}</span></th>
            <th scope="col" className="ps-num ps-hide-sm">CPSEs</th>
            <th scope="col" className="ps-num ps-hide-sm">Loss-making in {y2}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const d = g.np[y2] - g.np[y1];
            return (
              <tr key={g.group}>
                <th scope="row">{g.group}<small className="ps-sector">{g.sector}</small></th>
                <td className="ps-num ps-hide-sm">{crShort(g.np[y0])}</td>
                <td className="ps-num">{crShort(g.np[y1])}</td>
                <td className="ps-num"><b>{crShort(g.np[y2])}</b></td>
                <td className={`ps-num ${d > 0 ? 'eb-good' : d < 0 ? 'eb-bad' : ''}`}>{d > 0 ? '+' : ''}{crShort(d)}</td>
                <td className="ps-num ps-hide-sm">{g.firms}</td>
                <td className="ps-num ps-hide-sm">{g.loss_makers || '·'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All operating CPSEs</th>
            <td className="ps-num ps-hide-sm">{crShort(total[y0].net)}</td>
            <td className="ps-num">{crShort(total[y1].net)}</td>
            <td className="ps-num"><b>{crShort(total[y2].net)}</b></td>
            <td className={`ps-num ${total[y2].net >= total[y1].net ? 'eb-good' : 'eb-bad'}`}>{total[y2].net > total[y1].net ? '+' : ''}{crShort(total[y2].net - total[y1].net)}</td>
            <td className="ps-num ps-hide-sm">{pe.firms.length}</td>
            <td className="ps-num ps-hide-sm">{total[y2].loss_makers}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'loss', label: 'Loss in latest year' },
  { id: 'chronic', label: 'Loss in all three years' },
  { id: 'back', label: 'Back to profit' },
  { id: 'slipped', label: 'Slipped into loss' },
];

function Explorer({ pe }) {
  const [y0, y1, y2] = pe.years;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState({ key: y2, dir: -1 });
  const [all, setAll] = useState(false);
  const test = {
    all: () => true,
    loss: (f) => f.np[y2] < 0,
    chronic: (f) => f.np[y0] < 0 && f.np[y1] < 0 && f.np[y2] < 0,
    back: (f) => f.np[y1] < 0 && f.np[y2] > 0,
    slipped: (f) => f.np[y1] > 0 && f.np[y2] < 0,
  };
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, pe.firms.filter(test[f.id]).length]));
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const val = (f) => (sort.key === 'change' ? f.np[y2] - f.np[y1] : sort.key === 'name' ? f.name : f.np[sort.key]);
    return pe.firms
      .filter(test[filter])
      .filter((f) => !group || f.group === group)
      .filter((f) => !needle || f.name.toLowerCase().includes(needle) || f.group.toLowerCase().includes(needle))
      .sort((a, b) => (sort.key === 'name' ? sort.dir * a.name.localeCompare(b.name) : sort.dir * (val(a) - val(b))));
  }, [pe, q, filter, group, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all ? rows : rows.slice(0, 25);
  const head = (key, label, cls = 'ps-num') => {
    const on = sort.key === key;
    return (
      <th scope="col" className={cls} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="ps-sort" onClick={() => setSort({ key, dir: on ? -sort.dir : key === 'name' ? 1 : -1 })}>
          {label}<span aria-hidden="true">{on ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</span>
        </button>
      </th>
    );
  };
  return (
    <div className="eb-card ps-explorer">
      <div className="ps-controls">
        <label className="ps-search">
          <span className="eb-sr">Search CPSEs</span>
          <input type="search" placeholder="Search a CPSE or group" value={q} onChange={(e) => { setQ(e.target.value); setAll(false); }} />
        </label>
        <label className="ps-select">
          <span className="eb-sr">Cognate group</span>
          <select value={group} onChange={(e) => { setGroup(e.target.value); setAll(false); }}>
            <option value="">All cognate groups</option>
            {[...pe.groups].sort((a, b) => a.group.localeCompare(b.group)).map((g) => <option key={g.group} value={g.group}>{g.group}</option>)}
          </select>
        </label>
      </div>
      <div className="rb-tabs ps-filters" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); setAll(false); }}>{f.label} <span className="ps-count">{counts[f.id]}</span></button>
        ))}
      </div>
      <p className="ps-result" role="status">{rows.length} {rows.length === 1 ? 'CPSE' : 'CPSEs'}{rows.length > shown.length ? `, showing the first ${shown.length}` : ''}. Net profit, ₹ crore.</p>
      <div className="eb-tablewrap">
        <table className="eb-table ps-table ps-firms">
          <thead>
            <tr>
              {head('name', 'CPSE', '')}
              {head(y0, y0, 'ps-num ps-hide-sm')}
              {head(y1, y1)}
              {head(y2, y2)}
              {head('change', <>Change<span className="ps-hide-sm"> on {y1}</span></>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const d = f.np[y2] - f.np[y1];
              return (
                <tr key={f.name + f.group}>
                  <th scope="row">{f.name}<small className="ps-sector">{f.group}</small></th>
                  <td className={`ps-num ps-hide-sm ${f.np[y0] < 0 ? 'eb-bad' : ''}`}>{crShort(f.np[y0])}</td>
                  <td className={`ps-num ${f.np[y1] < 0 ? 'eb-bad' : ''}`}>{crShort(f.np[y1])}</td>
                  <td className={`ps-num ${f.np[y2] < 0 ? 'eb-bad' : ''}`}><b>{crShort(f.np[y2])}</b></td>
                  <td className={`ps-num ${d > 0 ? 'eb-good' : d < 0 ? 'eb-bad' : ''}`}>{d > 0 ? '+' : ''}{crShort(d)}</td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={5} className="eb-empty">No CPSE matches.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > 25 && (
        <button type="button" className="eb-btn rb-more" onClick={() => setAll(!all)}>{all ? 'Show the first 25' : `Show all ${rows.length}`}</button>
      )}
    </div>
  );
}

function Performance({ pe, history }) {
  const [y0, y1, y2] = pe.years;
  const t = pe.totals;
  const pet = pe.groups.find((g) => g.group.startsWith('Petroleum'));
  const exPet = (y) => t[y].net - (pet ? pet.np[y] : 0);
  const top = [...pe.firms].sort((a, b) => b.np[y2] - a.np[y2]);
  const top10 = top.slice(0, 10);
  const top10Share = (100 * top10.reduce((a, f) => a + f.np[y2], 0)) / t[y2].profit;
  const worst = [...pe.firms].sort((a, b) => a.np[y2] - b.np[y2]).slice(0, 10);
  const chronic = pe.firms.filter((f) => f.np[y0] < 0 && f.np[y1] < 0 && f.np[y2] < 0);
  const chronicLoss = -chronic.reduce((a, f) => a + f.np[y2], 0);
  return (
    <Section id="ps-perf-h" title="How CPSEs performed · DPE, Public Enterprises Survey">
      <p className="ps-say">
        Operating CPSEs made an overall net profit of <b>{lakhCr(t[y2].net)}</b> in {y2}, {moved(pct(t[y2].net, t[y1].net))} on {y1}.
        {pet && <> The six petroleum refining and marketing companies, whose margins swing with crude and retail fuel prices, went from a combined profit of {cr(pet.np[y1])} to {cr(pet.np[y2])}.
        Leaving them out, CPSE profit was {moved(pct(exPet(y2), exPet(y1)))}, from {lakhCr(exPet(y1))} to {lakhCr(exPet(y2))}.</>}
        {' '}Profit is concentrated: the ten largest earners made {nf(0).format(top10Share)}% of all the profit of profit-making CPSEs.
        {' '}{t[y2].loss_makers} of {pe.firms.length} operating CPSEs lost money in {y2}; {chronic.length} of them lost money in each of the three years, {lakhCr(chronicLoss)} between them in {y2}.
      </p>
      <ProfitHistory history={history} />
      <div className="rb-grid-2">
        <article className="eb-mc">
          <h3 className="eb-mc-title">Largest profits, {y2}</h3>
          <p className="eb-mc-note">Net profit, ₹ crore; change on {y1} beneath.</p>
          <RankBars items={top10.map((f) => ({ label: f.name, value: f.np[y2], prev: f.np[y1] }))} fmt={crShort}
            sub={(it) => `${it.value - it.prev >= 0 ? '+' : '−'}${nf(0).format(Math.abs(it.value - it.prev))} on ${y1}`} />
        </article>
        <article className="eb-mc">
          <h3 className="eb-mc-title">Largest losses, {y2}</h3>
          <p className="eb-mc-note">Net loss, ₹ crore; {y1} beneath.</p>
          <RankBars items={worst.map((f) => ({ label: f.name, value: f.np[y2], prev: f.np[y1] }))} fmt={crShort}
            sub={(it) => (it.prev === 0 ? `n/a in ${y1}` : `${crShort(it.prev)} in ${y1}`)} />
        </article>
      </div>
      <GroupTable pe={pe} />
      <h3 className="rb-sub" id="ps-firms-h">Every operating CPSE</h3>
      <Explorer pe={pe} />
      <p className="rb-caveat">
        Company figures are DPE's Public Enterprises Survey 2024-25 as laid before Parliament in the reply to Lok Sabha Unstarred Question 2941 (10 March 2026):
        226 profit-making and 63 loss-making operating CPSEs, standalone accounts, years ending 31 March. Earlier years in the chart come from each year's own survey,
        which later surveys revise a little (2022-23 overall net profit was ₹2.12 lakh crore in its own survey and ₹2.18 lakh crore a year later). The survey covers
        Government companies and statutory corporations more than half owned by the Centre, with their subsidiaries; it does not cover public sector banks, insurers or
        departmental undertakings such as the Railways.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------- what the Centre earns (DIPAM)

function Receipts({ receipts, dividends, disinvestment }) {
  const ys = receipts.years;
  const cur = ys[ys.length - 1];
  const asOf = receipts.site_updated ? `DIPAM site updated ${formatDate(receipts.site_updated)}` : 'year to date';
  const rows = ys.map((y, i) => ({ period: y.fy, short: shortFy(y.fy), dividend: y.dividend, disinvestment: y.disinvestment, monetisation: y.monetisation || null, part: i === ys.length - 1 ? `so far, ${asOf}` : '' }));
  const full = ys.slice(0, -1);
  const lastFull = full[full.length - 1];
  const prevFull = full[full.length - 2];
  const bestDiv = Math.max(...full.map((y) => y.dividend));
  // Highest stake-sale receipts since which year?
  const higherBefore = [...full].reverse().find((y) => y.disinvestment > cur.disinvestment);
  const latestDivYear = dividends.years[dividends.years.length - 2] || dividends.years[0];
  const payers = dividends.entities.filter((e) => (e.by_year[latestDivYear] || 0) > 0).sort((a, b) => b.by_year[latestDivYear] - a.by_year[latestDivYear]);
  const divTotal = dividends.totals[latestDivYear];
  const byMinistry = {};
  for (const e of payers) byMinistry[e.ministry || 'Other'] = (byMinistry[e.ministry || 'Other'] || 0) + e.by_year[latestDivYear];
  const ministries = Object.entries(byMinistry).sort((a, b) => b[1] - a[1]);
  const deals = disinvestment?.by_year?.[disinvestment.current_fy] || [];
  const money = (v, axis) => (v == null ? 'n/a' : axis ? nf(0).format(v / 1000) : cr(v));
  return (
    <Section id="ps-rec-h" title="What the Centre receives · DIPAM">
      <p className="ps-say">
        The Centre received <b>{cr(lastFull.dividend)}</b> in dividends from CPSEs and other holdings in {lastFull.fy}
        {lastFull.dividend >= bestDiv ? ', the most in any year on DIPAM\'s record' : ''} ({moved(pct(lastFull.dividend, prevFull.dividend))} on {prevFull.fy}).
        {' '}In {cur.fy} so far it has received {cr(cur.dividend)} in dividends and <b>{cr(cur.disinvestment)}</b> from selling shares
        {higherBefore ? `, more than in any full year since ${higherBefore.fy}` : ', more than in any full year on record'}
        {deals.length ? `, through ${deals.length} transactions led by ${deals.slice().sort((a, b) => b.receipts_cr - a.receipts_cr)[0].company}` : ''}.
        {cur.monetisation ? ` Asset monetisation has added ${cr(cur.monetisation)}.` : ''}
      </p>
      <div className="rb-grid-2">
        <figure className="eb-mc">
          <figcaption>
            <h3 className="eb-mc-title">Receipts of the Centre by financial year</h3>
            <ul className="eb-mc-legend">
              <li><i style={{ background: 'var(--eb-s1)' }} />Dividend</li>
              <li><i style={{ background: 'var(--eb-s2)' }} />Disinvestment</li>
              <li><i style={{ background: 'var(--eb-s3)' }} />Asset monetisation</li>
            </ul>
            <p className="eb-mc-note">₹ thousand crore. * {cur.fy} so far ({asOf}).</p>
          </figcaption>
          <YearBars rows={rows} series={[{ key: 'dividend', label: 'Dividend', color: 'var(--eb-s1)' }, { key: 'disinvestment', label: 'Disinvestment', color: 'var(--eb-s2)' }, { key: 'monetisation', label: 'Asset monetisation', color: 'var(--eb-s3)' }]}
            fmt={money} label="Dividend, disinvestment and asset monetisation receipts of the Centre" height={240} />
        </figure>
        <article className="eb-mc">
          <h3 className="eb-mc-title">Largest dividend payers to the Centre, {latestDivYear}</h3>
          <p className="eb-mc-note">₹ crore received by the Centre (its share only), with share of the year's {cr(divTotal)}. Marked † where the Centre is a minority holder and the company is not a CPSE.</p>
          <RankBars items={payers.slice(0, 12).map((e) => ({ label: `${e.name}${e.other_agency ? ' †' : ''}`, value: e.by_year[latestDivYear] }))} fmt={crShort}
            sub={(it) => `${nf(1).format((100 * it.value) / divTotal)}%`} />
        </article>
      </div>
      <div className="rb-grid-2">
        <article className="eb-mc">
          <h3 className="eb-mc-title">Dividend by administrative ministry, {latestDivYear}</h3>
          <RankBars items={ministries.slice(0, 10).map(([m, v]) => ({ label: m, value: v }))} fmt={crShort} sub={(it) => `${nf(1).format((100 * it.value) / divTotal)}%`} />
        </article>
        <article className="eb-mc ps-deals">
          <h3 className="eb-mc-title">Stake sales in {disinvestment?.current_fy}</h3>
          <p className="eb-mc-note">Each transaction DIPAM lists for the year, largest first. OFS: offer for sale through the stock exchange; SD: strategic sale, where control passes to the buyer. The board keeps every year's list as it reads it.</p>
          <div className="eb-tablewrap">
            <table className="eb-table ps-table ps-dealtable">
              <thead><tr><th scope="col">Company</th><th scope="col" className="ps-hide-sm">Method</th><th scope="col" className="ps-num">Stake sold</th><th scope="col" className="ps-num">₹ crore</th><th scope="col" className="ps-num ps-hide-sm">Centre holds after</th></tr></thead>
              <tbody>
                {[...deals].sort((a, b) => b.receipts_cr - a.receipts_cr).map((d) => (
                  <tr key={d.company + d.receipts_cr}>
                    <th scope="row">{d.company}</th>
                    <td className="ps-hide-sm"><abbr title={d.method_label}>{d.method === 'OTHER' ? 'Other' : d.method}</abbr></td>
                    <td className="ps-num">{d.pct_sold ? `${nf(2).format(d.pct_sold)}%` : '·'}</td>
                    <td className="ps-num"><b>{crShort(d.receipts_cr)}</b></td>
                    <td className="ps-num ps-hide-sm">{d.method === 'OTHER' ? '·' : `${nf(2).format(d.goi_after_pct)}%`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">Total</th><td className="ps-hide-sm" /><td /><td className="ps-num"><b>{crShort(disinvestment?.current_total)}</b></td><td className="ps-hide-sm" /></tr></tfoot>
            </table>
          </div>
        </article>
      </div>
      <p className="rb-caveat">
        DIPAM's figures are what reaches the Consolidated Fund: the Centre's own share of dividends, including from public sector banks, insurers, financial
        institutions and minority holdings such as Hindustan Zinc, so they differ from the dividend CPSEs declare in the Public Enterprises Survey (₹1.23 lakh crore
        in 2023-24, of which minority shareholders receive part). DIPAM lists company-wise dividends only from 2019-20; for 2019-20 to 2022-23 its company list adds
        up to within 4% of its yearly totals, and exactly from 2023-24.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------- market value (DIPAM)

function MarketValue({ mcap, history }) {
  const c = mcap.cpse;
  const p = mcap.pfi;
  const byYear = Object.fromEntries(history.years.map((y) => [y.year, y]));
  const m23 = byYear['2022-23']?.market_cap_listed;
  const m24 = byYear['2023-24']?.market_cap_listed;
  const topC = [...c.rows].sort((a, b) => b.goi_value - a.goi_value).slice(0, 12);
  const topP = [...p.rows].sort((a, b) => b.goi_value - a.goi_value).slice(0, 8);
  const snaps = mcap.history || [];
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  return (
    <Section id="ps-mcap-h" title="Market value of the Government's shares · DIPAM">
      <p className="ps-say">
        At the prices DIPAM shows, the Government's shares in <b>{c.rows.length} listed CPSEs</b> are worth <b>{lakhCr(c.total.goi_value)}</b>,
        {' '}{nf(0).format((100 * c.total.goi_value) / c.total.mcap)}% of their combined market value of {lakhCr(c.total.mcap)}.
        {' '}Its shares in {p.rows.length} listed public sector banks and insurers are worth a further {lakhCr(p.total.goi_value)}.
        {m23 && m24 && <> For scale, the Public Enterprises Survey put the market value of all listed CPSEs at {lakhCr(m23)} on 31 March 2023 and {lakhCr(m24)} a year later.</>}
        {snaps.length > 1 && <> Since the board began reading the page on {formatDate(first.date)}, the value of the Government's CPSE holding is {moved(pct(last.cpse_goi_value, first.cpse_goi_value))}.</>}
      </p>
      <div className="rb-grid-2">
        <article className="eb-mc">
          <h3 className="eb-mc-title">Largest Government holdings in listed CPSEs</h3>
          <p className="eb-mc-note">Value of the Government's shares, ₹ crore; its percentage holding beneath.</p>
          <RankBars items={topC.map((r) => ({ label: r.name, value: r.goi_value, pctHeld: r.goi_pct }))} fmt={crShort} sub={(it) => `${nf(1).format(it.pctHeld)}% held`} />
        </article>
        <article className="eb-mc">
          <h3 className="eb-mc-title">Banks and insurers</h3>
          <p className="eb-mc-note">Value of the Government's shares, ₹ crore; its percentage holding beneath. Listed companies must in time have at least 25% public shareholding (Securities Contracts (Regulation) Rules, rule 19A); the Government holds more than 75% in {p.rows.filter((r) => r.goi_pct > 75).length} of these {p.rows.length}.</p>
          <RankBars items={topP.map((r) => ({ label: r.name, value: r.goi_value, pctHeld: r.goi_pct }))} fmt={crShort} sub={(it) => `${nf(1).format(it.pctHeld)}% held`} />
        </article>
      </div>
      <p className="rb-caveat">
        DIPAM's page gives closing prices but no date, so the board records the day it read the page ({formatDate(mcap.read_on)}) and keeps one row a day in
        data/psu/mcap-snapshots.csv; a trend line appears once enough days have been read. Listed subsidiaries the Government holds only through a parent CPSE
        (for example Hindustan Petroleum through ONGC) count in total market value but not in the Government's direct holding.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------- investment and accountability (survey tables)

function Accountability({ tables }) {
  const cap = tables.capex;
  const capRows = cap.years.map((y, i) => ({ period: y, short: shortFy(y), target: cap.target[i], achieved: cap.achieved[i] }));
  const mou = tables.mou_ratings;
  const grades = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
  const gradeColor = { Excellent: 'var(--eb-seq-4)', 'Very Good': 'var(--eb-seq-3)', Good: 'var(--eb-seq-2)', Fair: 'var(--eb-seq-1)', Poor: 'var(--eb-s2)' };
  const mouRows = mou.years.map((y, i) => Object.fromEntries([['period', y], ['short', shortFy(y)], ...grades.map((g) => [g, mou[g][i]])]));
  const cnt = tables.cpse_counts;
  const cntRows = cnt.years.map((y, i) => ({ period: y, short: shortFy(y), operating: cnt.operating[i], construction: cnt.under_construction[i] + cnt.tbcb_spvs[i], closure: cnt.closure_or_non_operating[i] }));
  const emp = tables.employment;
  const va = tables.value_added;
  const vaLast = va.years.length - 1;
  const vaParts = ['Profit before tax', 'Salaries and wages', 'Interest', 'Depreciation and amortisation', 'Rent, royalty and cess'];
  const vaColors = ['var(--eb-s1)', 'var(--eb-s3)', 'var(--eb-s2)', 'var(--eb-seq-2)', 'var(--eb-muted)'];
  const lastCap = capRows[capRows.length - 1];
  const fmtCr = (v, axis) => (axis ? nf(0).format(v / 1000) : cr(v));
  const ei = emp.years.length - 1;
  const contractShare = (i) => (100 * emp.casual_contract[i]) / (emp.regular[i] + emp.casual_contract[i]);
  return (
    <Section id="ps-acc-h" title="Investment, ratings and people · Public Enterprises Survey 2023-24">
      <p className="ps-say">
        CPSEs with large capital budgets spent <b>{cr(lastCap.achieved)}</b> on capital projects in {lastCap.period}, {nf(1).format((100 * lastCap.achieved) / lastCap.target)}% of their target,
        the second year running above target after three years at about 93%. The number of CPSEs signing performance agreements (MoUs) with their ministries has
        fallen from {tables.mou_signed.signed[0]} in {tables.mou_signed.years[0]} to {tables.mou_signed.signed[tables.mou_signed.signed.length - 1]} in {tables.mou_signed.years[tables.mou_signed.years.length - 1]},
        partly because subsidiaries now sign through their holding company. Contract and casual workers were {nf(0).format(contractShare(ei))}% of the CPSE workforce in {emp.years[ei]}, up from {nf(0).format(contractShare(0))}% a year earlier, as regular employment fell by {nf(0).format(emp.regular[0] - emp.regular[ei])}.
      </p>
      <div className="rb-grid-2">
        <figure className="eb-mc">
          <figcaption>
            <h3 className="eb-mc-title">Capital expenditure: target and achieved</h3>
            <ul className="eb-mc-legend"><li><i style={{ background: 'var(--eb-data-quiet)' }} />Target</li><li><i style={{ background: 'var(--eb-s1)' }} />Achieved</li></ul>
            <p className="eb-mc-note">₹ crore, CPSEs with annual capex targets above ₹100 crore (₹500 crore up to 2021-22). Table 6.5.</p>
          </figcaption>
          <PairBars rows={capRows} series={[{ key: 'target', label: 'Target', color: 'var(--eb-data-quiet)' }, { key: 'achieved', label: 'Achieved', color: 'var(--eb-s1)' }]} fmt={(v) => cr(v)} />
        </figure>
        <figure className="eb-mc">
          <figcaption>
            <h3 className="eb-mc-title">MoU ratings of CPSEs</h3>
            <ul className="eb-mc-legend">{grades.map((g) => <li key={g}><i style={{ background: gradeColor[g] }} />{g}</li>)}</ul>
            <p className="eb-mc-note">Number of CPSEs by rating on their annual MoU with the administrative ministry. {mou.note}</p>
          </figcaption>
          <YearBars rows={mouRows} series={grades.map((g) => ({ key: g, label: g, color: gradeColor[g] }))} fmt={(v) => (v == null ? 'n/a' : nf(0).format(v))} label="MoU ratings of CPSEs by year" />
        </figure>
      </div>
      <div className="rb-grid-3 ps-grid-3">
        <figure className="eb-mc">
          <figcaption>
            <h3 className="eb-mc-title">Number of CPSEs</h3>
            <ul className="eb-mc-legend">
              <li><i style={{ background: 'var(--eb-s1)' }} />Operating</li>
              <li><i style={{ background: 'var(--eb-seq-2)' }} />Under construction</li>
              <li><i style={{ background: 'var(--eb-s2)' }} />Closing or not operating</li>
            </ul>
            <p className="eb-mc-note">31 March each year. Under construction includes transmission project companies held for bidding. Table 1.1.</p>
          </figcaption>
          <YearBars rows={cntRows} series={[{ key: 'operating', label: 'Operating', color: 'var(--eb-s1)' }, { key: 'construction', label: 'Under construction', color: 'var(--eb-seq-2)' }, { key: 'closure', label: 'Closing or not operating', color: 'var(--eb-s2)' }]}
            fmt={(v) => (v == null ? 'n/a' : nf(0).format(v))} label="Number of CPSEs by status" height={200} />
        </figure>
        <article className="eb-mc">
          <h3 className="eb-mc-title">Who works in CPSEs</h3>
          <p className="eb-mc-note">Table 5.1.</p>
          {emp.years.map((y, i) => (
            <div key={y} className="ps-emp">
              <p className="ps-emp-head"><b>{y}</b> {nf(0).format(emp.regular[i] + emp.casual_contract[i])} people</p>
              <ShareBar label={`Workforce ${y}`} fmt={(v) => nf(0).format(v)}
                parts={[{ label: 'Regular', value: emp.regular[i], color: 'var(--eb-s1)' }, { label: 'Casual and contract', value: emp.casual_contract[i], color: 'var(--eb-s2)' }]} />
            </div>
          ))}
        </article>
        <article className="eb-mc">
          <h3 className="eb-mc-title">Where value added goes, {va.years[vaLast]}</h3>
          <p className="eb-mc-note">Total {cr(va.total[vaLast])} ({moved(pct(va.total[vaLast], va.total[vaLast - 1]))} on {va.years[vaLast - 1]}). Table 2.5.</p>
          <ShareBar label={`Value added ${va.years[vaLast]}`} fmt={(v) => cr(v)}
            parts={vaParts.map((k, i) => ({ label: k, value: va[k][vaLast], color: vaColors[i] }))} />
        </article>
      </div>
      <p className="rb-caveat">
        These tables are from the 2023-24 survey, the latest full volume this board can read; the 2024-25 volume's chapters sit on DPE's report portal, whose
        security certificate chain is incomplete for automated readers. MoU ratings are DPE's assessment of each CPSE against targets agreed with its ministry; a
        falling count of signed MoUs reflects mergers, closures and subsidiaries signing through their parents as well as exemptions.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------- headline table

const METRICS = [
  ['operating_cpses', 'Operating CPSEs', 'count'],
  ['overall_net_profit', 'Overall net profit', 'money'],
  ['profit_of_profit_makers', 'Profit of profit-makers', 'money'],
  ['loss_of_loss_makers', 'Loss of loss-makers', 'money'],
  ['gross_revenue', 'Gross revenue', 'money'],
  ['contribution_to_exchequer', 'Contribution to exchequer', 'money'],
  ['dividend_declared', 'Dividend declared', 'money'],
  ['financial_investment', 'Financial investment', 'money'],
  ['capital_employed', 'Capital employed', 'money'],
  ['net_worth', 'Net worth', 'money'],
];

function HeadlineTable({ history }) {
  const ys = history.years;
  const sources = [];
  const mark = (src) => {
    if (!src) return '';
    let i = sources.findIndex((s) => s.label === src.label);
    if (i < 0) { sources.push(src); i = sources.length - 1; }
    return i + 1;
  };
  const cells = METRICS.map(([key, label, kind]) => ({
    key, label,
    vals: ys.map((y) => ({ v: y[key], n: y[key] != null ? mark(y.sources[key]) : '' , kind })),
  }));
  return (
    <details className="eb-card ps-details">
      <summary>All survey headline figures, {ys[0].year} to {ys[ys.length - 1].year}, with sources</summary>
      <div className="eb-tablewrap">
        <table className="eb-table ps-table ps-headlines">
          <caption className="ps-caption">₹ lakh crore unless a count. Superscript numbers point to the source of each figure.</caption>
          <thead><tr><th scope="col">Measure</th>{ys.map((y) => <th key={y.year} scope="col" className="ps-num">{y.year}</th>)}</tr></thead>
          <tbody>
            {cells.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                {r.vals.map((c, i) => (
                  <td key={ys[i].year} className="ps-num">{c.v == null ? '·' : c.kind === 'count' ? nf(0).format(c.v) : lakhNum(c.v)}{c.n ? <sup>{c.n}</sup> : null}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="ps-sources">
        {sources.map((s) => <li key={s.label}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}
      </ol>
      <p className="rb-caveat">2020-21 is missing because that year's survey is only on DPE's report portal. 2019-20 overall net profit is profit less loss from the survey release.</p>
    </details>
  );
}

// ---------------------------------------------------------------- page

export default function PsuBoard({ source }) {
  const { status, data, error, reload } = useIndicators(source);
  const [skin, setSkin] = useState(readSkin);
  const choose = (s) => {
    setSkin(s);
    try { localStorage.setItem('ps-skin', s); } catch { /* keep for this visit only */ }
  };
  useEffect(() => { document.title = 'PSU Performance Board | NITI Aayog'; }, []);

  if (status === 'loading') {
    return (
      <div className="eb rb ps" data-skin={skin}>
        <main className="rb-main eb-dash"><p className="eb-sr" role="status">Loading the latest figures…</p><div className="eb-skel-hero" /><div className="eb-skel-row">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="eb-skel-tile" />)}</div></main>
      </div>
    );
  }
  if (status === 'error' || !data) {
    return (
      <div className="eb rb ps" data-skin={skin}>
        <main className="rb-main"><div className="eb-error"><h1>The board could not load its data</h1><p>{error}. Check that {source} exists and was built by scripts/build_psu.py.</p><button type="button" className="eb-btn" onClick={reload}>Try again</button></div></main>
      </div>
    );
  }

  const pe = data.pe_survey;
  const rec = data.receipts;
  const div = data.dividends;
  const dis = data.disinvestment;
  const mc = data.mcap;
  const hist = data.history;
  const [, y1, y2] = pe?.years || [];
  const t = pe?.totals;
  const cce = pe?.cce;
  const ys = rec?.years || [];
  const cur = ys[ys.length - 1];
  const lastFull = ys[ys.length - 2];
  const prevFull = ys[ys.length - 3];
  const jump = [['ps-perf-h', 'Performance', pe], ['ps-firms-h', 'Every CPSE', pe], ['ps-rec-h', 'Dividends and stake sales', rec], ['ps-mcap-h', 'Market value', mc], ['ps-acc-h', 'Capex, ratings, people', hist], ['ps-src-h', 'Sources', true]].filter((j) => j[2]);

  return (
    <div className="eb rb ps" data-skin={skin}>
      <main className="rb-main eb-dash" id="ps-main">
        <header className="eb-hero">
          <div className="eb-hero-top">
            <div>
              <p className="eb-hero-kicker">NITI Aayog · Economics and Finance II Division</p>
              <h1>PSU Performance Board</h1>
              <p className="eb-hero-asof">Central public sector enterprises · data as on {formatDateTime(data.generated_at)} · DPE, DIPAM and PIB</p>
            </div>
            <div className="eb-range" role="group" aria-label="Colour scheme">
              <LanguageToggle />
              {SKINS.map((s) => <button key={s.id} type="button" aria-pressed={skin === s.id} onClick={() => choose(s.id)}>{s.label}</button>)}
            </div>
          </div>
          <p className="eb-lead">
            {t && <>Operating CPSEs made a net profit of <strong>{lakhCr(t[y2].net)}</strong> in {y2}, {moved(pct(t[y2].net, t[y1].net))} on {y1}, and{' '}
              <strong>{t[y2].loss_makers} of {pe.firms.length}</strong> made a loss. </>}
            {cce && <>They paid <strong>{lakhCr(cce[y2])}</strong> to the Central Exchequer in taxes, duties, interest and dividend. </>}
            {lastFull && <>The Centre received <strong>{cr(lastFull.dividend)}</strong> in dividends in {lastFull.fy}, and has raised <strong>{cr(cur.disinvestment)}</strong> from stake sales so far in {cur.fy}. </>}
            {mc && <>Its shares in listed CPSEs are worth <strong>{lakhCr(mc.cpse.total.goi_value)}</strong> at the prices DIPAM shows.</>}
          </p>
        </header>

        <h2 className="eb-eyebrow" id="ps-tiles-h">Headline figures</h2>
        <ul className="eb-tiles" aria-labelledby="ps-tiles-h">
          {t && <Tile label={`Overall net profit, ${y2}`} value={lakhNum(t[y2].net)} unit="lakh crore" pill={<ChangePill now={t[y2].net} before={t[y1].net} suffix={` on ${y1}`} />} foot="Operating CPSEs · DPE survey" href="#ps-perf-h" />}
          {t && <Tile label={`Loss-making CPSEs, ${y2}`} value={t[y2].loss_makers} unit={`of ${pe.firms.length}`} pill={<Pill tone={t[y2].loss < t[y1].loss ? 'good' : 'bad'}>losses {lakhCr(t[y2].loss)}</Pill>} foot={`${t[y1].loss_makers} in ${y1} · DPE survey`} href="#ps-firms-h" />}
          {cce && <Tile label={`Paid to exchequer, ${y2}`} value={lakhNum(cce[y2])} unit="lakh crore" pill={<ChangePill now={cce[y2]} before={cce[y1]} suffix={` on ${y1}`} />} foot="All CPSEs · Statement J" href="#ps-perf-h" />}
          {lastFull && <Tile label={`Dividend to the Centre, ${lastFull.fy}`} value={nf(0).format(lastFull.dividend)} unit="₹ crore" pill={<ChangePill now={lastFull.dividend} before={prevFull.dividend} suffix={` on ${prevFull.fy}`} />} foot={`${cr(cur.dividend)} so far in ${cur.fy} · DIPAM`} href="#ps-rec-h" />}
          {cur && <Tile label={`Stake sales, ${cur.fy} so far`} value={nf(0).format(cur.disinvestment)} unit="₹ crore" pill={<Pill>{dis?.by_year?.[dis.current_fy]?.length || 0} transactions</Pill>} foot={`${cr(lastFull.disinvestment)} in ${lastFull.fy} · DIPAM`} href="#ps-rec-h" />}
          {mc && <Tile label="Government's listed CPSE shares" value={lakhNum(mc.cpse.total.goi_value)} unit="lakh crore" pill={<Pill>{mc.cpse.rows.length} companies</Pill>} foot={`Read ${formatDate(mc.read_on)} · DIPAM`} href="#ps-mcap-h" />}
        </ul>

        <nav className="rb-jump" aria-label="Sections">
          {jump.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        {pe && hist && <Performance pe={pe} history={hist} />}
        {rec && div && <Receipts receipts={rec} dividends={div} disinvestment={dis} />}
        {mc && hist && <MarketValue mcap={mc} history={hist} />}
        {hist?.tables && <Accountability tables={hist.tables} />}
        {hist && <HeadlineTable history={hist} />}

        <section aria-labelledby="ps-read-h" className="rb-section">
          <div className="eb-eyebar"><h2 className="eb-eyebrow" id="ps-read-h">Reading these figures</h2></div>
          <div className="eb-card rb-sources ps-read">
            <ul>
              <li><b>Profit is a few sectors.</b> Oil, coal, power and Government finance companies (PFC, REC, IRFC) earn most of it. Refiners' profits swing with crude prices and retail fuel pricing: Hindustan Petroleum lost ₹8,974 crore in 2022-23, the year crude spiked, and the refining group then earned ₹89,453 crore in 2023-24.</li>
              <li><b>Profit is not the only test.</b> Many CPSEs carry public duties (food stocks, fertiliser, telecom in remote areas, defence production) or are being revived; MoU ratings and capex delivery are DPE's measures of how well they run against agreed targets.</li>
              <li><b>Two dividend figures.</b> DPE counts all dividend CPSEs declare, to every shareholder. DIPAM counts what the Centre receives, from CPSEs and from banks, insurers and minority holdings. Use DIPAM for the Budget, DPE for company performance.</li>
              <li><b>Survey years and revisions.</b> The Public Enterprises Survey appears some nine to twelve months after the year ends and later editions revise earlier years. Coverage changes as CPSEs are created, merged, sold or closed, so totals are not a fixed set of companies.</li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="ps-src-h" className="rb-section">
          <div className="eb-eyebar"><h2 className="eb-eyebrow" id="ps-src-h">Sources and freshness</h2></div>
          <div className="eb-card rb-sources">
            <ul className="rb-status">
              <StatusLine label="DPE survey, company profits (PIB)" status={data.status?.pe_survey} when={pe ? `Public Enterprises Survey ${y2}` : ''} />
              <StatusLine label="DIPAM total receipts" status={data.status?.receipts} when={rec?.site_updated ? `DIPAM site updated ${formatDate(rec.site_updated)}` : ''} />
              <StatusLine label="DIPAM dividends by company" status={data.status?.dividends} when={div ? `${div.years[0]} to ${div.years[div.years.length - 1]}` : ''} />
              <StatusLine label="DIPAM stake sales" status={data.status?.disinvestment} when={dis ? `${dis.current_fy}` : ''} />
              <StatusLine label="DIPAM market value of Government shares" status={data.status?.mcap} when={mc ? `${mc.history?.length || 1} daily ${(mc.history?.length || 1) === 1 ? 'reading' : 'readings'} kept` : ''} />
            </ul>
            <p>
              Company profits: <a href={pe?.source_url} target="_blank" rel="noreferrer">{pe?.source_label}</a>. Contribution to exchequer:{' '}
              <a href={cce?.source_url} target="_blank" rel="noreferrer">Public Enterprises Survey 2024-25, Statement J</a> (DPE). Earlier years and tables:{' '}
              <a href={hist?.tables?.source?.url} target="_blank" rel="noreferrer">Public Enterprises Survey 2023-24</a> and each year's survey release on PIB.
              Receipts, dividends, stake sales and market value: <a href="https://dipam.gov.in/totalReceiptsDtls" target="_blank" rel="noreferrer">DIPAM, Ministry of Finance</a>.
              The board refreshes daily; if a source cannot be reached it keeps its last good figures and marks them here.
            </p>
            {error && <p>Latest reload failed: {error}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
