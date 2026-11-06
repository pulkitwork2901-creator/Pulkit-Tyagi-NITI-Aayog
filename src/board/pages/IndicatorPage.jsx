import Chip from '../Chip.jsx';
import TrendChart from '../TrendChart.jsx';
import { formatChange, formatDate, formatValue, reading, signed, slug, tipFor } from '../format.js';

export default function IndicatorPage({ item }) {
  if (!item) {
    return (
      <div className="eb-notfound">
        <h1>Indicator not found</h1>
        <p>This indicator is not in the current data. <a href="#/">Return to the overview</a> to pick one.</p>
      </div>
    );
  }
  const hist = (item.history || []).filter((p) => p.value != null);
  const rows = hist.map((p, i) => ({ ...p, delta: i ? p.value - hist[i - 1].value : null })).reverse();
  const fmt = (v) => signed(formatValue(v, item.decimals));

  return (
    <>
      <nav className="eb-crumbs" aria-label="Breadcrumb">
        <a href="#/">Overview</a><span aria-hidden="true">/</span>
        <a href={`#/theme/${slug(item.group)}`}>{item.group}</a><span aria-hidden="true">/</span>
        <span>{item.label}</span>
      </nav>

      <header className="eb-pagehead eb-detailhead">
        <div>
          <h1>{item.label}</h1>
          <p className="eb-asof">{item.period}</p>
        </div>
        <button type="button" className="eb-btn eb-noprint" onClick={() => window.print()}>Print or save as PDF</button>
      </header>

      <section className="eb-section eb-bignumber" aria-label="Latest figure">
        <p className="eb-big">{fmt(item.value)}<span className="eb-figure-unit">{item.unit}</span></p>
        <p className="eb-bigchange"><Chip item={item} /> <span className="eb-muted">{item.compare_period ? `against ${fmt(item.compare_value)} in ${item.compare_period}` : ''}</span></p>
        <p className="eb-reading">{reading(item.up_is_good)}</p>
      </section>

      <section className="eb-section" aria-labelledby="eb-in-trend">
        <h2 id="eb-in-trend">Trend</h2>
        <TrendChart title={`${item.label}, ${item.unit}`} note={item.source} headingLevel={3}
          points={hist} kind={item.id === 'gdp' || item.id === 'iip' ? 'bar' : 'line'}
          formatAxis={(v) => signed(formatValue(v, v % 1 === 0 ? 0 : 1))} formatTip={tipFor(item)} formatEnd={tipFor(item)} />
      </section>

      <section className="eb-section" aria-labelledby="eb-in-hist">
        <h2 id="eb-in-hist">Release history</h2>
        <div className="eb-tablewrap">
          <table className="eb-table">
            <caption className="eb-sr">{item.label} by period, newest first</caption>
            <thead>
              <tr><th scope="col">Period</th><th scope="col" className="eb-num">Value ({item.unit})</th><th scope="col" className="eb-num">Change on previous</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td className="eb-num"><span className="eb-cell-value">{fmt(r.value)}</span></td>
                  <td className="eb-num eb-muted">{r.delta == null ? 'First entry' : signed(formatChange(r.delta, ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="eb-section" aria-labelledby="eb-in-about">
        <h2 id="eb-in-about">About this figure</h2>
        <dl className="eb-facts">
          <div><dt>Source</dt><dd>{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">{item.source}</a> : item.source}</dd></div>
          <div><dt>Released</dt><dd>{item.released ? formatDate(item.released) : 'Updated whenever the data is rebuilt'}</dd></div>
          <div><dt>How it gets here</dt><dd>{item.mode === 'live' ? (item.stale ? 'Pulled from MoSPI. The last attempt failed, so this is the last good copy.' : 'Pulled live from MoSPI each time the data is rebuilt.') : 'Entered by the team from the official release, in data/manual-indicators.csv.'}</dd></div>
          <div><dt>Unit</dt><dd>{item.unit}</dd></div>
        </dl>
      </section>
    </>
  );
}
