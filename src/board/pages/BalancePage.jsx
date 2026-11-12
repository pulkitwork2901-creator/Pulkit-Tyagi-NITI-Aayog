import { useMemo, useState } from 'react';
import Icon from '../dashboard/Icon.jsx';
import { FyTotals, PairColumns, PeriodSwitch, money, useTradeFile } from '../trade/tradeKit.jsx';

// Merchandise trade balance by partner: DGCI&S exports minus imports, joined
// on the board's country ids. Only periods present in both flows are shown;
// a year missing from either flow is a gap, never zero.

const TOP = 15;
const nice = (p) => p.replace(' Jan-', ' Jan–');

function Card({ title, icon, note, children, aside }) {
  return (
    <section className="eb-mc eb-tr-card">
      <div className="eb-tr-cardhead">
        <h3 className="eb-mc-title">{icon && <span className="eb-badge"><Icon name={icon} size={16} /></span>}{title}</h3>
        {aside}
      </div>
      {note && <p className="eb-mc-note eb-tr-note">{note}</p>}
      {children}
    </section>
  );
}

function Stat({ icon, label, value, sub, tone }) {
  return (
    <li className="eb-tile">
      <span className="eb-tile-label"><span className="eb-tile-icon"><Icon name={icon} size={15} /></span>{label}</span>
      <span className={`eb-tile-value eb-tr-value${tone ? ` ${tone}` : ''}`}>{value}</span>
      {sub && <span className="eb-tile-period">{sub}</span>}
    </li>
  );
}

// One partner per row: balance bar (surplus or deficit) with exports and imports beneath.
function BalanceList({ rows, max, caption }) {
  return (
    <ol className="eb-bars" aria-label={caption}>
      {rows.map((r, n) => (
        <li key={r.id}>
          <a className="eb-bar-row eb-bal-row" href={`#/exports/country/${r.id}`}>
            <span className="eb-bar-rank" aria-hidden="true">{n + 1}</span>
            <span className="eb-bar-text">
              <span className="eb-bar-label">{r.name}</span>
              <span className="eb-bar-sub">Exports {money(r.x)} · Imports {money(r.m)}</span>
              <span className="eb-bar-track" aria-hidden="true"><i className={r.b >= 0 ? 'eb-bal-plus' : 'eb-bal-minus'} style={{ width: `${Math.max(0.5, (Math.abs(r.b) / max) * 100)}%` }} /></span>
            </span>
            <span className={`eb-bar-val ${r.b >= 0 ? 'eb-good' : 'eb-bad'}`}>{r.b >= 0 ? '+' : '−'}{money(Math.abs(r.b))}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

function readPeriod(periods, fallback) {
  try {
    const p = sessionStorage.getItem('eb-trade-period');
    if (periods.includes(p)) return p;
  } catch { /* storage blocked */ }
  return fallback;
}

export default function BalancePage({ base }) {
  const { data: ex, error: e1 } = useTradeFile(`${base}exports.json`);
  const { data: im, error: e2 } = useTradeFile(`${base}imports.json`);
  const ready = ex && im;
  const periods = ready ? ex.periods.filter((p) => im.periods.includes(p)) : [];
  const missing = ready ? periods.filter((p) => (ex.missing || []).includes(p) || (im.missing || []).includes(p)) : [];
  const usable = periods.filter((p) => !missing.includes(p));
  const latestFull = [...usable].reverse().find((p) => p.length === 4);
  const [chosen, setChosen] = useState(null);
  const period = chosen && usable.includes(chosen) ? chosen : (ready ? readPeriod(usable, latestFull) : null);
  const choose = (p) => {
    setChosen(p);
    try { sessionStorage.setItem('eb-trade-period', p); } catch { /* keep in memory */ }
  };

  const rows = useMemo(() => {
    if (!ready || !period) return [];
    const xi = ex.periods.indexOf(period);
    const mi = im.periods.indexOf(period);
    const ids = new Map();
    ex.countries.forEach((c) => ids.set(c.id, { id: c.id, name: c.name, x: c.v[xi] || 0, m: 0 }));
    im.countries.forEach((c) => {
      const r = ids.get(c.id) || { id: c.id, name: c.name, x: 0, m: 0 };
      r.m = c.v[mi] || 0;
      ids.set(c.id, r);
    });
    return [...ids.values()].map((r) => ({ ...r, b: r.x - r.m }));
  }, [ready, ex, im, period]);

  if (e1 || e2) return <div className="eb-dash"><p className="eb-empty">Could not load trade data ({e1 || e2}).</p></div>;
  if (!ready) {
    return (
      <div className="eb-dash" aria-busy="true">
        <div className="eb-skel-hero" />
        <div className="eb-skel-row">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="eb-skel-tile" />)}</div>
      </div>
    );
  }

  const xi = ex.periods.indexOf(period);
  const mi = im.periods.indexOf(period);
  const X = ex.total[xi];
  const M = im.total[mi];
  const B = X - M;
  const surplus = rows.filter((r) => r.b > 0).sort((a, b) => b.b - a.b);
  const deficit = rows.filter((r) => r.b < 0).sort((a, b) => a.b - b.b);
  const max = Math.max(...rows.map((r) => Math.abs(r.b)), 1);
  const partial = period.length > 4;
  const top3def = deficit.slice(0, 3).reduce((s, r) => s + r.b, 0);
  const xs = periods.map((p) => (missing.includes(p) ? null : ex.total[ex.periods.indexOf(p)]));
  const ms = periods.map((p) => (missing.includes(p) ? null : im.total[im.periods.indexOf(p)]));

  return (
    <div className="eb-dash">
      <header className="eb-hero eb-tr-hero">
        <div className="eb-hero-top">
          <div>
            <p className="eb-hero-kicker">Trade · DGCI&amp;S export and import data banks</p>
            <h1>Merchandise trade balance by partner</h1>
            <p className="eb-hero-asof">Merchandise exports minus imports, US$, by country.{missing.length ? ` ${missing.join(', ')}: import or export files not yet uploaded.` : ''}</p>
          </div>
          <PeriodSwitch periods={periods} value={period} onChange={choose} label="Year shown" missing={missing} />
        </div>
        <p className="eb-lead">
          In <strong>{nice(period)}</strong> India ran a merchandise trade {B >= 0 ? 'surplus' : 'deficit'} of <strong>{money(Math.abs(B))}</strong>: exports of {money(X)} against imports of {money(M)}.{' '}
          {deficit[0] && <>The largest deficit was with <strong>{deficit[0].name}</strong> ({money(Math.abs(deficit[0].b))}), and the three largest deficits together came to {money(Math.abs(top3def))}. </>}
          {surplus[0] && <>The largest surplus was with <strong>{surplus[0].name}</strong> ({money(surplus[0].b)}).</>}
          {partial && <span className="eb-tr-flag"> Eight months only.</span>}
        </p>
      </header>

      <ul className="eb-tiles">
        <Stat icon="trade" label="Exports" value={money(X)} sub={nice(period)} />
        <Stat icon="wholesale" label="Imports" value={money(M)} sub={nice(period)} />
        <Stat icon="money" label="Trade balance" value={`${B >= 0 ? '+' : '−'}${money(Math.abs(B))}`} tone={B >= 0 ? 'eb-good' : 'eb-bad'} sub={`exports cover ${(X / M * 100).toFixed(0)}% of imports`} />
        <Stat icon="flows" label="In surplus with" value={`${surplus.length} of ${rows.filter((r) => r.x || r.m).length}`} sub="India exports more than it buys" />
        <Stat icon="growth" label="Largest surplus" value={surplus[0]?.name} sub={surplus[0] && `+${money(surplus[0].b)}`} />
        <Stat icon="reserves" label="Largest deficit" value={deficit[0]?.name} sub={deficit[0] && `−${money(Math.abs(deficit[0].b))}`} />
      </ul>

      <Card title="Exports and imports by calendar year" icon="trade"
        note={`US$. Left bar exports, right bar imports; the figure above each pair is the balance. Hatched: part year.${missing.length ? ` Outline: ${missing.join(', ')}, not yet uploaded.` : ''}`}>
        <div className="eb-pair-legend" aria-hidden="true"><span><i className="eb-pair-x" />Exports</span><span><i className="eb-pair-m" />Imports</span></div>
        <PairColumns periods={periods} x={xs} m={ms} partial={periods.filter((p) => p.length > 4)} missing={missing} height={200} />
      </Card>

      <FyTotals base={base} />

      <div className="eb-tr-grid">
        <Card title="Largest deficits" icon="wholesale" note={`${nice(period)}. Partners India buys more from than it sells to.`}>
          <BalanceList rows={deficit.slice(0, TOP)} max={max} caption="Largest deficits" />
        </Card>
        <Card title="Largest surpluses" icon="growth" note={`${nice(period)}. Partners India sells more to than it buys from.`}>
          <BalanceList rows={surplus.slice(0, TOP)} max={max} caption="Largest surpluses" />
        </Card>
      </div>

      <p className="eb-tr-source">Sources: {ex.source}; {im.source}. Imports are by country of consignment, which can differ from country of origin (goods shipped through a trading hub such as the UAE, Singapore or Hong Kong are credited to the hub). Balances are on merchandise only and leave out services.</p>
    </div>
  );
}
