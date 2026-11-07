import { useMemo, useState } from 'react';
import Icon from '../dashboard/Icon.jsx';
import { BarList, GrowthPill, PeriodSwitch, YearColumns, growth, money, useTradeFile } from '../trade/tradeKit.jsx';

// Exports by partner and product from DGCI&S HS 8-digit country data.
// Three views share one period switch: overview, one country, one product.
// A partial year ("2026 Jan-Aug") is shown but never compared with a full year.

const TOP = 15;
const fullOf = (d) => d.periods.filter((p) => !d.partial.includes(p));
const nice = (p) => p.replace(' Jan-', ' Jan–');

function readPeriod(periods, fallback) {
  try {
    const p = sessionStorage.getItem('eb-trade-period');
    if (periods.includes(p)) return p;
  } catch { /* storage blocked: use the default */ }
  return fallback;
}

function usePeriod(d) {
  const [p, setP] = useState(() => (d ? readPeriod(d.periods, d.latest_full) : null));
  const value = p && d?.periods.includes(p) ? p : d?.latest_full;
  const choose = (x) => {
    setP(x);
    try { sessionStorage.setItem('eb-trade-period', x); } catch { /* keep in memory */ }
  };
  return [value, choose];
}

function Waiting({ error, what }) {
  if (error) return <div className="eb-dash"><p className="eb-empty">Could not load {what} ({error}). The trade files may not be built yet; see the README.</p></div>;
  return (
    <div className="eb-dash" aria-busy="true">
      <div className="eb-skel-hero" />
      <div className="eb-skel-row">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="eb-skel-tile" />)}</div>
      <div className="eb-skel-panel" />
    </div>
  );
}

function Hero({ kicker, title, sub, periods, period, onPeriod, crumbs, children }) {
  return (
    <header className="eb-hero eb-tr-hero">
      <div className="eb-hero-top">
        <div>
          {crumbs ? <p className="eb-hero-kicker eb-tr-crumbs">{crumbs}</p> : <p className="eb-hero-kicker">{kicker}</p>}
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

function Card({ title, icon, note, children, wide, aside }) {
  return (
    <section className={`eb-mc eb-tr-card${wide ? ' eb-tr-wide' : ''}`}>
      <div className="eb-tr-cardhead">
        <h3 className="eb-mc-title">{icon && <span className="eb-badge"><Icon name={icon} size={16} /></span>}{title}</h3>
        {aside}
      </div>
      {note && <p className="eb-mc-note eb-tr-note">{note}</p>}
      {children}
    </section>
  );
}

const partialNote = (d, period) => (d.partial.includes(period)
  ? `${nice(period)} covers part of the year, so it is not compared with full years.`
  : null);

// Biggest absolute movers between the chosen full year and the one before.
function Movers({ rows, d, idx, kind }) {
  if (idx < 1 || d.partial.includes(d.periods[idx]) || d.partial.includes(d.periods[idx - 1])) {
    return <p className="eb-empty">Choose a full calendar year to see who gained and lost.</p>;
  }
  const yr = d.periods[idx];
  const skipped = rows.filter((r) => r.breaks?.includes(yr)).length;
  const withDelta = rows.filter((r) => !r.breaks?.includes(yr)).map((r) => ({ ...r, d: (r.v[idx] || 0) - (r.v[idx - 1] || 0) }));
  const up = [...withDelta].sort((a, b) => b.d - a.d).slice(0, 5);
  const down = [...withDelta].sort((a, b) => a.d - b.d).slice(0, 5).filter((r) => r.d < 0);
  const max = Math.max(...up.map((r) => Math.abs(r.d)), ...down.map((r) => Math.abs(r.d)), 1);
  const Row = ({ r }) => (
    <li>
      {r.href ? <a href={r.href}>{r.label}</a> : <span>{r.label}</span>}
      <span className="eb-mv-bar" aria-hidden="true"><i className={r.d >= 0 ? 'eb-mv-up' : 'eb-mv-down'} style={{ width: `${(Math.abs(r.d) / max) * 100}%` }} /></span>
      <b className={r.d >= 0 ? 'eb-good' : 'eb-bad'}>{r.d >= 0 ? '+' : ''}{money(r.d)}</b>
      <GrowthPill value={growth(r.v, idx, d.periods, r.breaks)} />
    </li>
  );
  return (
    <div className="eb-mv">
      <div><h4>Largest gains, {kind}</h4><ol>{up.map((r) => <Row key={r.key} r={r} />)}</ol></div>
      <div><h4>Largest falls, {kind}</h4><ol>{down.map((r) => <Row key={r.key} r={r} />)}</ol></div>
      {skipped > 0 && <p className="eb-tr-note eb-muted">Leaves out {skipped} of the top {rows.length} lines whose 8-digit code India revised in {yr}; their change is not like for like.</p>}
    </div>
  );
}

function Finder({ d }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const countries = s ? d.countries.filter((c) => c.name.toLowerCase().includes(s)).slice(0, 10) : [];
  const products = s ? d.products.filter((p) => p.hs8.startsWith(s) || p.desc.toLowerCase().includes(s) || p.chapter.toLowerCase().includes(s)).slice(0, 10) : [];
  return (
    <div className="eb-find">
      <label htmlFor="eb-find-q">Find a country or product</label>
      <input id="eb-find-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Germany, smartphones, 3004, rice" autoComplete="off" />
      {s && (
        <div className="eb-find-res" aria-live="polite">
          <div>
            <h4>Countries ({countries.length})</h4>
            {countries.length ? <ul>{countries.map((c) => <li key={c.id}><a href={`#/exports/country/${c.id}`}>{c.name}</a></li>)}</ul> : <p className="eb-muted">No match.</p>}
          </div>
          <div>
            <h4>Products ({products.length})</h4>
            {products.length ? <ul>{products.map((p) => <li key={p.hs8}><a href={`#/exports/product/${p.hs8}`}><code>{p.hs8}</code> {p.desc}</a></li>)}</ul> : <p className="eb-muted">No match among the top {d.products.length} products.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Overview({ d, base }) {
  const [period, setPeriod] = usePeriod(d);
  const i = d.periods.indexOf(period);
  const full = fullOf(d);
  const total = d.total[i];
  const g = growth(d.total, i, d.periods);
  const partial = d.partial.includes(period);

  const byP = (list) => [...list].sort((a, b) => (b.v[i] || 0) - (a.v[i] || 0));
  const countries = useMemo(() => byP(d.countries), [d, i]); // eslint-disable-line react-hooks/exhaustive-deps
  const products = useMemo(() => byP(d.products), [d, i]); // eslint-disable-line react-hooks/exhaustive-deps
  const chapters = useMemo(() => byP(d.chapters), [d, i]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = countries[0];
  const topProd = products[0];

  const cRows = countries.map((c) => ({ key: c.id, label: c.name, v: c.v, href: `#/exports/country/${c.id}`, share: ((c.v[i] || 0) / total) * 100 }));
  const pRows = products.map((p) => ({ key: p.hs8, breaks: p.breaks, label: p.desc, sub: `HS ${p.hs8} · ${p.chapter}`, v: p.v, href: `#/exports/product/${p.hs8}`, share: ((p.v[i] || 0) / total) * 100 }));
  const hRows = chapters.map((c) => ({ key: c.hs2, label: c.name, sub: `HS chapter ${c.hs2}`, v: c.v, share: ((c.v[i] || 0) / total) * 100 }));
  const first = full[0];
  const fi = d.periods.indexOf(first);

  return (
    <div className="eb-dash">
      <Hero kicker="Trade · DGCI&S export data bank" title="Exports: partners and products"
        sub={`Merchandise exports, US$, HS 8-digit by country. Calendar years ${full[0]} to ${full[full.length - 1]}${d.partial.length ? ` and ${d.partial.map(nice).join(', ')}` : ''}.`}
        periods={d.periods} period={period} onPeriod={setPeriod}>
        {partial ? (
          <>In <strong>{nice(period)}</strong> India exported <strong>{money(total)}</strong> of goods to {d.partners[i]} destinations. </>
        ) : (
          <>In <strong>{period}</strong> India exported <strong>{money(total)}</strong> of goods to {d.partners[i]} destinations{g != null && <>, {g >= 0 ? 'up' : 'down'} {Math.abs(g).toFixed(1)}% on {d.periods[i - 1]}</>}. </>
        )}
        {top && <><strong>{top.name}</strong> took {(((top.v[i] || 0) / total) * 100).toFixed(1)}%, and the ten largest markets {d.top10_partner_share[i].toFixed(1)}% between them. </>}
        {topProd && <>The largest single product line was <strong>{topProd.desc.toLowerCase()}</strong> at {money(topProd.v[i])}. </>}
        {!partial && fi >= 0 && i > fi && <>Since {first}, exports have grown {(((total / d.total[fi]) ** (1 / (i - fi)) - 1) * 100).toFixed(1)}% a year on average.</>}
        {partial && <span className="eb-tr-flag"> Eight months only: not comparable with full years.</span>}
      </Hero>

      <h2 className="eb-eyebrow" id="eb-tr-kpi">At a glance, {nice(period)}</h2>
      <ul className="eb-tiles" aria-labelledby="eb-tr-kpi">
        <Stat icon="trade" label="Total exports" value={money(total)} extra={<GrowthPill value={g} />} sub={partial ? 'Part year' : `vs ${d.periods[i - 1] || 'n/a'}`} />
        <Stat icon="flows" label="Destinations" value={d.partners[i]} sub="countries and territories" />
        <Stat icon="growth" label="Largest market" value={top?.name} sub={top && `${money(top.v[i])} · ${(((top.v[i] || 0) / total) * 100).toFixed(1)}%`} />
        <Stat icon="reserves" label="Top 10 markets" value={`${d.top10_partner_share[i].toFixed(1)}%`} sub="share of all exports" />
        <Stat icon="wholesale" label="Largest product" value={topProd?.desc.split(',')[0]} sub={topProd && `HS ${topProd.hs8} · ${money(topProd.v[i])}`} />
        <Stat icon="money" label="Top 10 products" value={`${d.top10_product_share[i].toFixed(1)}%`} sub="share, HS 8-digit lines" />
      </ul>

      <div className="eb-tr-grid">
        <Card title="Exports by year" icon="trade" note={`US$. Hatched: ${d.partial.map(nice).join(', ') || 'none'}, part year.`}>
          <YearColumns periods={d.periods} v={d.total} partial={d.partial} height={190} />
        </Card>
        <Card title="By product group" icon="wholesale" note={`HS 2-digit chapters, ${nice(period)}. Top 10 of ${d.chapters.length}.`}>
          <BarList rows={hRows.slice(0, 10)} periods={d.periods} index={i} fullYears={full} caption="Exports by HS chapter" />
        </Card>
      </div>

      <div className="eb-tr-grid">
        <Card title="Top destinations" icon="flows" note={`${nice(period)}. Share of India's exports; change on the previous year; trend ${full[0]}–${full[full.length - 1]}.`}>
          <BarList rows={cRows.slice(0, TOP)} periods={d.periods} index={i} fullYears={full} caption="Top destinations" />
        </Card>
        <Card title="Top products (HS 8-digit)" icon="wholesale" note={`${nice(period)}. Each line is one 8-digit tariff code.`}>
          <BarList rows={pRows.slice(0, TOP)} periods={d.periods} index={i} fullYears={full} caption="Top products" />
        </Card>
      </div>

      <Card title={`Who gained and lost${partial ? '' : `, ${period} vs ${d.periods[i - 1]}`}`} icon="growth" wide>
        <div className="eb-tr-grid eb-tr-grid-flat">
          <Movers rows={cRows} d={d} idx={i} kind="markets" />
          <Movers rows={pRows} d={d} idx={i} kind="products" />
        </div>
      </Card>

      <Card title="Explore" icon="money" wide note={`All ${d.countries.length} destinations and the top ${d.products.length} products by value have their own page.`}
        aside={<a className="eb-more" href={`${base}exports_summary.csv`} download="ef2-exports-summary.csv">Download summary (CSV)</a>}>
        <Finder d={d} />
      </Card>

      <p className="eb-tr-source">Source: {d.source}. Values in US$ at current prices; DGCI&S data are provisional for the latest months and may be revised. Totals match RBI's monthly series to within 0.1%.</p>
    </div>
  );
}

function CountryView({ d, base, id }) {
  const { data: c, error } = useTradeFile(`${base}country/${id}.json`);
  const [period, setPeriod] = usePeriod(d);
  if (!c) return <Waiting error={error} what="this country" />;
  const i = c.periods.indexOf(period);
  const full = fullOf(d);
  const v = c.v[i] || 0;
  const share = (v / d.total[i]) * 100;
  const rank = [...d.countries].sort((a, b) => (b.v[i] || 0) - (a.v[i] || 0)).findIndex((x) => x.id === c.id) + 1;
  const g = growth(c.v, i, c.periods);
  const top = [...c.products].sort((a, b) => (b.v[i] || 0) - (a.v[i] || 0));
  const chapters = [...c.chapters].sort((a, b) => (b.v[i] || 0) - (a.v[i] || 0));
  const pRows = top.map((p) => ({ key: p.hs8, breaks: p.breaks, label: p.desc, sub: `HS ${p.hs8} · ${p.chapter}`, v: p.v, href: p.linked ? `#/exports/product/${p.hs8}` : null, share: v ? ((p.v[i] || 0) / v) * 100 : null }));
  const hRows = chapters.map((x) => ({ key: x.hs2, label: x.name, sub: `HS chapter ${x.hs2}`, v: x.v, share: v ? ((x.v[i] || 0) / v) * 100 : null }));
  const lead = top[0];

  return (
    <div className="eb-dash">
      <Hero title={c.name} periods={c.periods} period={period} onPeriod={setPeriod}
        crumbs={<><a href="#/exports">Exports</a> <span aria-hidden="true">›</span> Destination</>}
        sub={`India's merchandise exports to ${c.name}. DGCI&S name: ${c.dgcis_name}.`}>
        In <strong>{nice(period)}</strong> India exported <strong>{money(v)}</strong> to {c.name}, {share.toFixed(2)}% of all exports{rank ? <>, making it the <strong>no. {rank}</strong> destination</> : null}
        {g != null && <>; that is {g >= 0 ? 'up' : 'down'} {Math.abs(g).toFixed(1)}% on {c.periods[i - 1]}</>}.
        {lead && v > 0 && <> The largest line was {lead.desc.toLowerCase()} ({money(lead.v[i])}, {(((lead.v[i] || 0) / v) * 100).toFixed(1)}% of the total).</>}
        {d.partial.includes(period) && <span className="eb-tr-flag"> Part year only.</span>}
      </Hero>

      <ul className="eb-tiles eb-tiles-4">
        <Stat icon="trade" label="Exports" value={money(v)} extra={<GrowthPill value={g} />} sub={nice(period)} />
        <Stat icon="growth" label="Rank among destinations" value={rank ? `${rank} of ${d.partners[i]}` : '–'} sub={nice(period)} />
        <Stat icon="reserves" label="Share of India's exports" value={`${share.toFixed(2)}%`} sub={nice(period)} />
        <Stat icon="wholesale" label="Top 5 products" value={v ? `${((top.slice(0, 5).reduce((s, p) => s + (p.v[i] || 0), 0) / v) * 100).toFixed(1)}%` : '–'} sub="of exports to this market" />
      </ul>

      <div className="eb-tr-grid">
        <Card title="Exports by year" icon="trade" note="US$. Hatched: part year.">
          <YearColumns periods={c.periods} v={c.v} partial={d.partial} height={190} />
        </Card>
        <Card title="By product group" icon="wholesale" note={`HS chapters, ${nice(period)}. Share of exports to ${c.name}.`}>
          <BarList rows={hRows.slice(0, 10)} periods={c.periods} index={i} fullYears={full} caption="Product groups" />
        </Card>
      </div>

      <Card title={`Top ${Math.min(pRows.length, 40)} products to ${c.name}`} icon="wholesale" wide note={`HS 8-digit lines ranked for ${nice(period)}. Linked lines have a product page.`}>
        <BarList rows={pRows.slice(0, 40)} periods={c.periods} index={i} fullYears={full} caption="Top products" />
      </Card>
      <p className="eb-tr-source">Source: {d.source}.</p>
    </div>
  );
}

function ProductView({ d, base, hs8 }) {
  const { data: p, error } = useTradeFile(`${base}product/${hs8}.json`);
  const [period, setPeriod] = usePeriod(d);
  if (!p) return <Waiting error={error} what="this product" />;
  const i = p.periods.indexOf(period);
  const full = fullOf(d);
  const v = p.v[i] || 0;
  const g = growth(p.v, i, p.periods, p.breaks);
  const dest = [...p.countries].sort((a, b) => (a.id === null) - (b.id === null) || (b.v[i] || 0) - (a.v[i] || 0));
  const rows = dest.map((c) => ({ key: c.id || c.name, label: c.name, v: c.v, href: c.id ? `#/exports/country/${c.id}` : null, share: v ? ((c.v[i] || 0) / v) * 100 : null }));
  const lead = dest[0];

  return (
    <div className="eb-dash">
      <Hero title={p.desc} periods={p.periods} period={period} onPeriod={setPeriod}
        crumbs={<><a href="#/exports">Exports</a> <span aria-hidden="true">›</span> Product</>}
        sub={`HS ${p.hs8} · ${p.chapter}`}>
        In <strong>{nice(period)}</strong> India exported <strong>{money(v)}</strong> of this product, {((v / d.total[i]) * 100).toFixed(2)}% of all exports
        {g != null && !Number.isNaN(g) && <>, {g >= 0 ? 'up' : 'down'} {Math.abs(g).toFixed(1)}% on {p.periods[i - 1]}</>}.
        {lead && v > 0 && <> The largest buyer was <strong>{lead.name}</strong> with {(((lead.v[i] || 0) / v) * 100).toFixed(1)}%.</>}
        {d.partial.includes(period) && <span className="eb-tr-flag"> Part year only.</span>}
      </Hero>

      <ul className="eb-tiles eb-tiles-4">
        <Stat icon="trade" label="Exports" value={money(v)} extra={<GrowthPill value={g} />} sub={nice(period)} />
        <Stat icon="reserves" label="Share of India's exports" value={`${((v / d.total[i]) * 100).toFixed(2)}%`} sub={nice(period)} />
        <Stat icon="flows" label="Largest buyer" value={lead?.name} sub={lead && money(lead.v[i])} />
        <Stat icon="growth" label="Top 3 buyers" value={v ? `${((dest.slice(0, 3).reduce((s, c) => s + (c.v[i] || 0), 0) / v) * 100).toFixed(1)}%` : '–'} sub="concentration of demand" />
      </ul>

      <div className="eb-tr-grid">
        <Card title="Exports by year" icon="trade" note="US$. Hatched: part year.">
          <YearColumns periods={p.periods} v={p.v} partial={d.partial} height={190} />
        </Card>
        <Card title="Where it goes" icon="flows" note={`Destinations, ${nice(period)}. Share of this product's exports.`}>
          <BarList rows={rows} periods={p.periods} index={i} fullYears={full} caption="Destinations" />
        </Card>
      </div>
      {p.breaks?.length > 0 && (
        <p className="eb-tr-warn">India revised 8-digit codes under this heading in {p.breaks.join(' and ')}. Values before and after are not fully comparable: part of the trade may have moved to or from another code. Compare at the 4-digit heading for a like-for-like view.</p>
      )}
      <p className="eb-tr-source">Source: {d.source}. {partialNote(d, period) || ''}</p>
    </div>
  );
}

export default function ExportsPage({ base, view, arg }) {
  const { data: d, error } = useTradeFile(`${base}exports.json`);
  if (!d) return <Waiting error={error} what="export data" />;
  if (view === 'country' && arg) return <CountryView key={arg} d={d} base={base} id={arg} />;
  if (view === 'product' && arg) return <ProductView key={arg} d={d} base={base} hs8={arg} />;
  return <Overview d={d} base={base} />;
}
