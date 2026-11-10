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

        <Card title="State figures against India's total" icon="reserves" wide
          note="DGCI&S's state-wise database adds newly created 8-digit tariff codes a year late, so the years India revised codes fall short of the national total. Other years agree within about half a per cent.">
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
                    <td className="eb-muted">{r.missing_value > 500 ? `${money(r.missing_value)}: ${(r.missing_groups || []).join(', ').toLowerCase()}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

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
        {u && <span className="eb-tr-flag"> Likely understated in {u}: codes India introduced that year are missing from the state data, so growth around those years is not like for like.</span>}
      </Hero>

      <h2 className="eb-eyebrow" id="eb-sv-kpi">At a glance, {nice(period)}</h2>
      <ul className="eb-tiles" aria-labelledby="eb-sv-kpi">
        <Stat icon="trade" label="Exports" value={money(total)} extra={<GrowthPill value={g} />} sub={partial ? 'Part year' : `vs ${s.periods[i - 1] || 'n/a'}`} />
        <Stat icon="growth" label="Rank among states" value={rank || '–'} sub={`${pct(total, all).toFixed(1)}% of exports by state`} />
        {countries[0] && <Stat icon="flows" label="Largest market" value={countries[0].name} sub={`${money(countries[0].v[i])} · ${pct(countries[0].v[i], total).toFixed(1)}%`} />}
        {chapters[0] && <Stat icon="wholesale" label="Largest product group" value={chapters[0].name} sub={`${money(chapters[0].v[i])} · ${pct(chapters[0].v[i], total).toFixed(1)}%`} />}
        <Stat icon="reserves" label="Top 10 products" value={`${pct(top10, total).toFixed(1)}%`} sub="share, HS 8-digit lines" />
      </ul>

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
