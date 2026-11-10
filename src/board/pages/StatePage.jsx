import { useState } from 'react';
import Icon from '../dashboard/Icon.jsx';
import { BarList, GrowthPill, PeriodSwitch, YearColumns, growth, money, useTradeFile } from '../trade/tradeKit.jsx';

// Merchandise exports by state of origin (DGCI&S), built by
// scripts/build_state_trade.py into public/data/trade/states.json and
// public/data/trade/state/<slug>.json. Same look as the trade pages.

const nice = (p) => p.replace(' Jan-', ' Jan–');
const pct = (a, b) => (b ? (a / b) * 100 : null);

function usePeriod(d) {
  const [p, setP] = useState(() => {
    try { const s = sessionStorage.getItem('eb-state-period'); if (d?.periods.includes(s)) return s; } catch { /* storage blocked */ }
    return null;
  });
  const value = p && d?.periods.includes(p) ? p : d?.latest_full;
  const choose = (x) => { setP(x); try { sessionStorage.setItem('eb-state-period', x); } catch { /* keep in memory */ } };
  return [value, choose];
}

function Waiting({ error }) {
  if (error) return <div className="eb-dash"><p className="eb-empty">Could not load the state-wise export data ({error}). See the README for how it is built.</p></div>;
  return <div className="eb-dash" aria-busy="true"><div className="eb-skel-hero" /><div className="eb-skel-panel" /></div>;
}

function Hero({ kicker, title, sub, periods, period, onPeriod, children }) {
  return (
    <header className="eb-hero eb-tr-hero">
      <div className="eb-hero-top">
        <div>
          <p className="eb-hero-kicker eb-tr-crumbs">{kicker}</p>
          <h1>{title}</h1>
          <p className="eb-hero-asof">{sub}</p>
        </div>
        <PeriodSwitch periods={periods} value={period} onChange={onPeriod} label="Year shown" />
      </div>
      {children && <p className="eb-lead">{children}</p>}
    </header>
  );
}

function Stat({ icon, label, value, sub, extra }) {
  return (
    <li className="eb-tile">
      <span className="eb-tile-label">{icon && <span className="eb-tile-icon"><Icon name={icon} size={15} /></span>}{label}</span>
      <span className="eb-tile-value eb-tr-value">{value}</span>
      {extra && <span className="eb-tile-change">{extra}</span>}
      {sub && <span className="eb-tile-period">{sub}</span>}
    </li>
  );
}

function Card({ title, icon, note, children, wide }) {
  return (
    <section className={`eb-mc eb-tr-card${wide ? ' eb-tr-wide' : ''}`}>
      <div className="eb-tr-cardhead"><h3 className="eb-mc-title">{icon && <span className="eb-badge"><Icon name={icon} size={16} /></span>}{title}</h3></div>
      {note && <p className="eb-mc-note eb-tr-note">{note}</p>}
      {children}
    </section>
  );
}

// "2022: Electrical machinery and electronics, Aircraft" for each year a state is likely understated.
function understatedText(u) {
  const ys = Object.keys(u || {});
  if (!ys.length) return null;
  return ys.map((y) => `${y} (${u[y].join(', ').toLowerCase()})`).join('; ');
}

const bn = (mn) => `US$ ${(mn / 1000).toFixed(1)} bn`;
const listAnd = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// Group names contain commas ('Gems, jewellery, precious metals'), so groups are separated by semicolons.
const groupList = (gs) => (gs || []).map((g) => g.toLowerCase()).join('; ');

// Why exports by state do not add up to India's total in some years: the
// findings of scripts/build_state_trade.py, written out for readers.
function MismatchNote({ d }) {
  const affected = d.reconciliation.filter((r) => r.missing_value > 500 && r.evidence);
  const latest = affected[affected.length - 1]?.period;
  const short = d.reconciliation.filter((r) => r.gap_pct != null && r.gap_pct <= -1);
  const gaps = short.map((r) => (r.india_total - r.states_sum) / 1000);
  const range = gaps.length ? `US$ ${Math.floor(Math.min(...gaps))} to ${Math.ceil(Math.max(...gaps))} bn` : '';
  return (
    <Card title="Why the state figures do not match India's total" icon="reserves" wide>
      <div className="eb-st-note">
        <p>
          <strong>They should match.</strong> Both come from the same shipping bills filed at customs. Each bill records the product, the destination
          and the state where the goods were produced. DGCI&S adds the bills up by country for India's total and by state for these figures; bills with
          no state declared appear as "State not specified". So all states together should equal India's total.
        </p>
        <p>
          <strong>In most years they do</strong> (within about half a per cent).{short.length ? <> In {listAnd(short.map((r) => r.period))} they fall short by {range}.</> : null}{' '}
          The shortfall is not spread across the data: it sits in <strong>8-digit tariff codes India created that year</strong>. The state-wise data has
          nothing under those codes in their first year, in any state, while India's total carries their full value. From the next year the same codes
          match India's figures almost exactly. Every downloaded file is present, with none missing or repeated; whether the codes were left out by DGCI&S's
          database or by the download query is discussed at the end of this note.
        </p>
      </div>
      <div className="eb-tablewrap">
        <table className="eb-table">
          <caption className="eb-sr">Exports by state against India's total</caption>
          <thead><tr><th scope="col">Year</th><th scope="col" className="eb-num">All states</th><th scope="col" className="eb-num">India</th><th scope="col" className="eb-num">Gap</th><th scope="col">New codes missing from the state data</th></tr></thead>
          <tbody>
            {d.reconciliation.map((r) => (
              <tr key={r.period}>
                <th scope="row">{nice(r.period)}</th>
                <td className="eb-num">{money(r.states_sum)}</td>
                <td className="eb-num">{money(r.india_total)}</td>
                <td className="eb-num">{r.gap_pct == null ? '–' : Math.abs(r.gap_pct) < 0.05 ? '0.0%' : `${r.gap_pct < 0 ? '−' : '+'}${Math.abs(r.gap_pct).toFixed(1)}%`}</td>
                <td className="eb-muted">{r.missing_value > 500 ? `${money(r.missing_value)}: ${groupList(r.missing_groups)}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {affected.map((r) => {
        const e = r.evidence;
        const home = r.likely_home?.states || [];
        return (
          <details key={r.period} className="eb-st-year" open={r.period === latest}>
            <summary><strong>{r.period}:</strong> {money(r.missing_value)} under {e.new_codes} new codes ({groupList(r.missing_groups)})</summary>
            <ul>
              <li><strong>Missing everywhere, not moved.</strong> The new codes show {e.in_any_state < 0.05 ? 'nothing' : money(e.in_any_state)} in any state in the state data, against {money(r.missing_value)} in India's total.</li>
              {e.groups.map((g) => (
                <li key={g.chapter}><strong>{g.name}:</strong> {bn(g.new_codes_india)} under the new codes is missing; the rest of the group is close to India's figures ({bn(g.rest_state_data)} in the state data against {bn(g.rest_india)}).</li>
              ))}
              {e.not_specified_prev != null && (
                <li><strong>Not filed as "State not specified" either:</strong> that category {e.not_specified < e.not_specified_prev ? 'fell' : 'moved'} from {bn(e.not_specified_prev)} to {bn(e.not_specified)}.</li>
              )}
              {home.length > 0 && (
                <li>
                  <strong>Where it most likely belongs</strong> (an estimate, using each state's share of the same codes in {nice(r.likely_home.basis)}):{' '}
                  {listAnd(home.slice(0, 7).map((h) => `${h.name} about ${bn(h.value)}`))}. These states' {r.period} figures, and their growth around {r.period}, are understated.
                </li>
              )}
            </ul>
          </details>
        );
      })}
      <p className="eb-mc-note eb-tr-note">
        <strong>What is not yet known</strong> is whether DGCI&S's state-wise database adds new codes a year late, or whether the "all commodities" list used for
        the download did not yet include them. A test: download one missing code for its first year from the DGCI&S State of Origin query (for example rice,
        HS 10063019, for 2025). If figures come back, the gap can be filled exactly; if not, it is in DGCI&S's data. The board does not fill the gap with estimates:
        the figures shown are DGCI&S's, and affected growth rates are marked "code revised".
      </p>
    </Card>
  );
}

// On a state's page: how much of its exports the state-wise data likely misses, by year.
function StateNote({ s }) {
  const est = s.missing_estimate || {};
  const ys = Object.keys(est);
  if (!ys.length) return null;
  return (
    <Card title={`Note: ${s.name}'s figures for ${listAnd(ys)} are understated`} icon="reserves" wide>
      <ul className="eb-st-list">
        {ys.map((y) => (
          <li key={y}>
            <strong>{y}:</strong> about <strong>{bn(est[y].value)}</strong>
            {est[y].pct_of_reported != null ? ` (${est[y].pct_of_reported.toFixed(1)}% of the reported figure)` : ''} is missing, mainly in {groupList(est[y].groups)}.
            {' '}These are exports under tariff codes India created in {y}, which the state-wise data leaves out in their first year. Estimated from {s.name}'s share of the same codes in {nice(est[y].basis)}.
          </li>
        ))}
      </ul>
      <p className="eb-mc-note eb-tr-note">
        The figures above are DGCI&S's as published, not adjusted. Growth in {ys.length > 1 ? 'these years and the year after each' : `${ys[0]} and the year after`} is marked "code revised" because it is not like for like.
        {' '}<a href="#/states">Why the state figures do not match India's total</a>.
      </p>
    </Card>
  );
}

function Overview({ d }) {
  const [period, setPeriod] = usePeriod(d);
  const i = d.periods.indexOf(period);
  const full = d.periods.filter((p) => !d.partial.includes(p));
  const partial = d.partial.includes(period);
  const total = d.total[i];
  const india = d.india[i];
  const rec = d.reconciliation[i];
  const ranked = [...d.states].filter((s) => !s.unspecified).sort((a, b) => (b.v[i] || 0) - (a.v[i] || 0));
  const unspec = d.states.find((s) => s.unspecified);
  const top = ranked[0];
  const top5 = ranked.slice(0, 5).reduce((s, r) => s + (r.v[i] || 0), 0);
  const over10 = ranked.filter((r) => (r.v[i] || 0) >= 10000).length;
  const flagged = ranked.filter((r) => r.understated?.[period]);
  // Fastest growth among states exporting at least US$ 5 bn, like for like only.
  const movers = ranked.filter((r) => (r.v[i] || 0) >= 5000).map((r) => ({ r, g: growth(r.v, i, d.periods, r.breaks) })).filter((x) => x.g != null && !Number.isNaN(x.g)).sort((a, b) => b.g - a.g);
  const fast = movers[0];
  const g = growth(d.total, i, d.periods, rec.missing_value > 1000 || d.reconciliation[i - 1]?.missing_value > 1000 ? [period] : []);
  const rows = ranked.map((s) => ({
    key: s.slug, label: s.name, sub: [s.ut ? 'Union territory' : null, s.understated?.[period] ? 'understated, see note' : null].filter(Boolean).join(' · ') || undefined,
    v: s.v, breaks: s.breaks, href: `#/states/${s.slug}`, share: pct(s.v[i] || 0, total),
  }));
  const leaders = d.leading_products[period] || d.leading_products[d.latest_full];
  const leaderPeriod = d.leading_products[period] ? period : d.latest_full;

  return (
    <div className="eb-dash">
      <Hero kicker="Trade · DGCI&S state of origin" title="Merchandise exports by state"
        sub={`Exports by the state where goods were produced, US$, HS 8-digit by country. Calendar years ${full[0]} to ${full[full.length - 1]}${d.partial.length ? ` and ${d.partial.map(nice).join(', ')}` : ''}.`}
        periods={d.periods} period={period} onPeriod={setPeriod}>
        In <strong>{nice(period)}</strong>, <strong>{top.name}</strong> was the largest exporting state with <strong>{money(top.v[i])}</strong>,
        {' '}{pct(top.v[i], total).toFixed(1)}% of exports by state. The five largest states together accounted for <strong>{pct(top5, total).toFixed(0)}%</strong>,
        {' '}and {over10} states exported more than US$ 10 bn each.
        {fast && <> Among states exporting over US$ 5 bn, <strong>{fast.r.name}</strong> grew fastest ({fast.g >= 0 ? '+' : ''}{fast.g.toFixed(1)}% on {d.periods[i - 1]}).</>}
        {partial && <span className="eb-tr-flag"> Part year only: not compared with full years.</span>}
      </Hero>

      <h2 className="eb-eyebrow" id="eb-st-kpi">At a glance, {nice(period)}</h2>
      <ul className="eb-tiles" aria-labelledby="eb-st-kpi">
        <Stat icon="trade" label="Exports, all states" value={money(total)} extra={<GrowthPill value={g} />} sub={india ? `${pct(total, india).toFixed(1)}% of India's total (${money(india)})` : undefined} />
        <Stat icon="growth" label="Largest state" value={top.name} sub={`${money(top.v[i])} · ${pct(top.v[i], total).toFixed(1)}%`} />
        <Stat icon="reserves" label="Top 5 states" value={`${pct(top5, total).toFixed(1)}%`} sub="share of exports by state" />
        <Stat icon="flows" label="States above US$ 10 bn" value={over10} sub={`of ${ranked.length} states and UTs`} />
        {unspec && <Stat icon="money" label="State not specified" value={money(unspec.v[i])} sub={`${pct(unspec.v[i], total).toFixed(1)}% of the total`} />}
      </ul>

      <div className="eb-tr-grid">
        <Card title="States and union territories" icon="flows"
          note={`${nice(period)}. Share of exports by state; change on the previous year; trend ${full[0]}–${full[full.length - 1]}. "Code revised": not like for like (see the note below).`}>
          <BarList rows={rows} periods={d.periods} index={i} fullYears={full} caption="Exports by state" />
        </Card>
        <div>
          <Card title="Exports by year, all states" icon="trade" note={`US$. Hatched: ${d.partial.map(nice).join(', ') || 'none'}, part year.`}>
            <YearColumns periods={d.periods} v={d.total} partial={d.partial} height={190} />
          </Card>
        </div>
      </div>

        <MismatchNote d={d} />

      <Card title={`Where India's leading products come from, ${nice(leaderPeriod)}`} icon="wholesale" wide
        note="The 20 largest export lines (HS 8-digit) in the state data, with the states that produce most of each.">
        <div className="eb-tablewrap">
          <table className="eb-table">
            <caption className="eb-sr">Leading export products and their main states</caption>
            <thead><tr><th scope="col">Product</th><th scope="col" className="eb-num">Exports</th><th scope="col">Main states (share of the product)</th></tr></thead>
            <tbody>
              {leaders.slice(0, 20).map((p) => (
                <tr key={p.hs8}>
                  <th scope="row">{p.desc}<span className="eb-rowmeta">HS {p.hs8} · {p.chapter}</span></th>
                  <td className="eb-num">{money(p.value)}</td>
                  <td>{p.states.filter((s) => pct(s.value, p.value) >= 1).slice(0, 3).map((s, n) => (
                    <span key={s.slug}>{n ? ', ' : ''}<a href={`#/states/${s.slug}`}>{s.name}</a> {pct(s.value, p.value).toFixed(0)}%</span>
                  ))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="eb-tr-source">
        Source: {d.source}. Values in US$ at current prices; DGCI&S data are provisional for the latest months and may be revised.
        {' '}The state is the one exporters declare as the state of origin of the goods; where none is declared, DGCI&S records "state not specified".
        {flagged.length ? <> In {period}, figures for {flagged.map((f) => f.name).join(', ')} are likely understated because codes introduced that year are missing from the state data.</> : null}
      </p>
    </div>
  );
}

function StateView({ d, base, id }) {
  const { data: s, error } = useTradeFile(`${base}state/${id}.json`);
  const [period, setPeriod] = usePeriod(d);
  if (!s) return <Waiting error={error} />;
  const i = s.periods.indexOf(period);
  const full = s.periods.filter((p) => !s.partial.includes(p));
  const partial = s.partial.includes(period);
  const total = s.v[i];
  const all = d.total[i];
  const ranked = [...d.states].filter((x) => !x.unspecified).sort((a, b) => (b.v[i] || 0) - (a.v[i] || 0));
  const rank = ranked.findIndex((x) => x.slug === s.slug) + 1;
  const g = growth(s.v, i, s.periods, s.breaks);
  const byI = (list) => [...list].sort((a, b) => (b.v[i] || 0) - (a.v[i] || 0)).filter((r) => (r.v[i] || 0) > 0);
  const products = byI(s.products);
  const countries = byI(s.countries);
  const chapters = byI(s.chapters);
  const fi = s.periods.indexOf(full[0]);
  const lastFull = s.periods.indexOf(s.latest_full);
  const cagr = fi >= 0 && lastFull > fi && s.v[fi] > 0 && !s.breaks.length ? ((s.v[lastFull] / s.v[fi]) ** (1 / (lastFull - fi)) - 1) * 100 : null;
  const u = understatedText(s.understated);
  const top10 = products.slice(0, 10).reduce((a, r) => a + (r.v[i] || 0), 0);

  return (
    <div className="eb-dash">
      <Hero kicker={<><a href="#/states">Merchandise exports by state</a> / {s.name}</>} title={`${s.name}: exports`}
        sub={`${s.ut ? 'Union territory. ' : ''}Exports with ${s.name} as the state of origin, US$, by product and destination.`}
        periods={s.periods} period={period} onPeriod={setPeriod}>
        In <strong>{nice(period)}</strong>, {s.name} exported <strong>{money(total)}</strong> of goods, {pct(total, all).toFixed(1)}% of exports by state
        {rank ? <> (rank {rank} of {ranked.length})</> : null}
        {g != null && !Number.isNaN(g) ? <>, {g >= 0 ? 'up' : 'down'} {Math.abs(g).toFixed(1)}% on {s.periods[i - 1]}</> : null}.
        {countries[0] && <> The largest market was <strong>{countries[0].name}</strong> ({pct(countries[0].v[i], total).toFixed(1)}%)</>}
        {products[0] && !s.understated?.[period] ? <> and the largest product line <strong>{products[0].desc.split(',')[0].toLowerCase()}</strong> ({money(products[0].v[i])}).</> : '.'}
        {!partial && cagr != null && <> Since {full[0]}, exports have {cagr >= 0 ? 'grown' : 'fallen'} {Math.abs(cagr).toFixed(1)}% a year on average.</>}
        {partial && <span className="eb-tr-flag"> Part year only: not compared with full years.</span>}
        {u && <span className="eb-tr-flag"> Understated in {listAnd(Object.keys(s.understated))}: see the note below.</span>}
      </Hero>

      <h2 className="eb-eyebrow" id="eb-sv-kpi">At a glance, {nice(period)}</h2>
      <ul className="eb-tiles" aria-labelledby="eb-sv-kpi">
        <Stat icon="trade" label="Exports" value={money(total)} extra={<GrowthPill value={g} />} sub={partial ? 'Part year' : `vs ${s.periods[i - 1] || 'n/a'}`} />
        <Stat icon="growth" label="Rank among states" value={rank || '–'} sub={`${pct(total, all).toFixed(1)}% of exports by state`} />
        {countries[0] && <Stat icon="flows" label="Largest market" value={countries[0].name} sub={`${money(countries[0].v[i])} · ${pct(countries[0].v[i], total).toFixed(1)}%`} />}
        {chapters[0] && <Stat icon="wholesale" label="Largest product group" value={chapters[0].name} sub={`${money(chapters[0].v[i])} · ${pct(chapters[0].v[i], total).toFixed(1)}%`} />}
        <Stat icon="reserves" label="Top 10 products" value={`${pct(top10, total).toFixed(1)}%`} sub="share, HS 8-digit lines" />
      </ul>

      <StateNote s={s} />

      <div className="eb-tr-grid">
        <Card title="Exports by year" icon="trade" note={`US$. Hatched: part year.${s.breaks.length ? ` ${s.breaks.join(' and ')}: not like for like with the year before.` : ''}`}>
          <YearColumns periods={s.periods} v={s.v} partial={s.partial} height={190} />
        </Card>
        <Card title="By product group" icon="wholesale" note={`HS 2-digit chapters, ${nice(period)}.`}>
          <BarList rows={chapters.slice(0, 10).map((c) => ({ key: c.hs2, label: c.name, sub: `HS chapter ${c.hs2}`, v: c.v, share: pct(c.v[i] || 0, total) }))}
            periods={s.periods} index={i} fullYears={full} caption="Exports by product group" />
        </Card>
      </div>

      <div className="eb-tr-grid">
        <Card title="Top destinations" icon="flows" note={`${nice(period)}. Share of ${s.name}'s exports.`}>
          <BarList rows={countries.slice(0, 15).map((c) => ({ key: c.name, label: c.name, v: c.v, share: pct(c.v[i] || 0, total) }))}
            periods={s.periods} index={i} fullYears={full} caption="Top destinations" />
        </Card>
        <Card title="Top products (HS 8-digit)" icon="wholesale" note={`${nice(period)}. Each line is one 8-digit tariff code; "code revised" means the change on the year before is not like for like.`}>
          <BarList rows={products.slice(0, 20).map((p) => ({ key: p.hs8, label: p.desc, sub: `HS ${p.hs8} · ${p.chapter}`, v: p.v, breaks: p.breaks, share: pct(p.v[i] || 0, total) }))}
            periods={s.periods} index={i} fullYears={full} caption="Top products" />
        </Card>
      </div>

      <p className="eb-tr-source">Source: DGCI&S, export data by state of origin. Values in US$ at current prices; provisional for the latest months. <a href="#/states">All states</a>.</p>
    </div>
  );
}

export default function StatePage({ base, id }) {
  const { data: d, error } = useTradeFile(`${base}states.json`);
  if (!d) return <Waiting error={error} />;
  return id ? <StateView d={d} base={base} id={id} /> : <Overview d={d} />;
}
