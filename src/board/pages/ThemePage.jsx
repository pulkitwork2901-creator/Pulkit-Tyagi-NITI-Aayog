import Ledger from '../Ledger.jsx';
import ThemeBrief from '../ThemeBrief.jsx';
import TrendChart from '../TrendChart.jsx';
import { formatValue, signed, tipFor } from '../format.js';

export default function ThemePage({ group, items, byId }) {
  if (!group) {
    return (
      <div className="eb-notfound">
        <h1>Theme not found</h1>
        <p>This theme is not in the current data. Choose one from the list on the left, or <a href="#/">return to the dashboard</a>.</p>
      </div>
    );
  }
  const charted = items.filter((i) => (i.history || []).filter((p) => p.value != null).length >= 2);
  return (
    <>
      <nav className="eb-crumbs" aria-label="Breadcrumb"><a href="#/">Dashboard</a><span aria-hidden="true">/</span><span>{group}</span></nav>
      <header className="eb-pagehead">
        <h1>{group}</h1>
        <ThemeBrief group={group} byId={byId} />
        <p className="eb-asof">{items.length} indicators. Select an indicator to see its full history and source.</p>
      </header>

      <section className="eb-section" aria-labelledby="eb-th-table">
        <h2 id="eb-th-table">Latest releases</h2>
        <Ledger caption={group} items={items} />
      </section>

      {charted.length > 0 && (
        <section className="eb-section" aria-labelledby="eb-th-trends">
          <h2 id="eb-th-trends">Trends</h2>
          <div className="eb-charts">
            {charted.map((i) => (
              <TrendChart key={i.id} headingLevel={3} title={i.label} note={`${i.unit}. ${i.source}.`}
                points={i.history} kind={i.id === 'gdp' || i.id === 'iip' ? 'bar' : 'line'}
                formatAxis={(v) => signed(formatValue(v, v % 1 === 0 ? 0 : 1))}
                formatTip={tipFor(i)} formatEnd={tipFor(i)} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
