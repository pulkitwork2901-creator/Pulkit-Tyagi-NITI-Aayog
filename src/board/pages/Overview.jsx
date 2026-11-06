import { useState } from 'react';
import Chip from '../Chip.jsx';
import Ledger from '../Ledger.jsx';
import Sparkline from '../Sparkline.jsx';
import TrendChart from '../TrendChart.jsx';
import { formatDateTime, formatValue, signed, slug, tipFor } from '../format.js';

const HEADLINE = ['gdp', 'cpi', 'fx_reserves', 'inr_usd'];

function Figure({ item }) {
  return (
    <li className="eb-figure">
      <a className="eb-figure-link" href={`#/indicator/${item.id}`}>
        <span className="eb-figure-label">{item.label}</span>
        <span className="eb-figure-value">{signed(formatValue(item.value, item.decimals))}<span className="eb-figure-unit">{item.unit}</span></span>
      </a>
      <span className="eb-figure-change"><Chip item={item} /> <span className="eb-muted">against {item.compare_period}</span></span>
      <Sparkline points={item.history.slice(-12)} kind={item.id === 'gdp' ? 'bar' : 'line'} height={40}
        formatTip={tipFor(item)} label={`${item.label} trend`} />
      <span className="eb-figure-period">{item.period}</span>
    </li>
  );
}

export default function Overview({ data, title, byId, groups }) {
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const indicators = data.indicators || [];
  const headline = HEADLINE.map((id) => byId[id]).filter(Boolean);
  const visibleItems = (group) => indicators.filter((item) => {
    if (item.group !== group) return false;
    const searchText = `${item.label} ${item.source} ${item.period} ${item.group}`.toLocaleLowerCase();
    return searchText.includes(query.trim().toLocaleLowerCase());
  });
  const visibleGroups = groups.filter((group) => (selectedGroup === 'all' || selectedGroup === group) && visibleItems(group).length > 0);
  const visibleCount = visibleGroups.reduce((count, group) => count + visibleItems(group).length, 0);
  return (
    <>
      <header className="eb-pagehead">
        <p className="eb-kicker">INDIA · ECONOMICS &amp; FINANCE II</p>
        <h1>{title}</h1>
        <p className="eb-asof">Latest data · {formatDateTime(data.generated_at)}</p>
      </header>

      {headline.length > 0 && (
        <section className="eb-section" aria-labelledby="eb-headline">
          <h2 id="eb-headline">Headline indicators</h2>
          <ul className="eb-figures">{headline.map((item) => <Figure key={item.id} item={item} />)}</ul>
        </section>
      )}

      <section className="eb-section eb-themes" aria-labelledby="eb-themes-title">
        <div className="eb-sectionbar">
          <h2 id="eb-themes-title">Browse by theme</h2>
          <span className="eb-section-meta">{groups.length} themes · {indicators.length} indicators</span>
        </div>
        <nav aria-label="Economic themes">
          <ul className="eb-theme-grid">
            {groups.map((group, index) => {
              const count = indicators.filter((item) => item.group === group).length;
              return (
                <li key={group}>
                  <a className="eb-theme-card" href={`#/theme/${slug(group)}`}>
                    <span className="eb-theme-index">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{group}</strong>
                    <span className="eb-theme-count">{count} indicators</span>
                    <span className="eb-theme-arrow" aria-hidden="true">↗</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </section>

      <section className="eb-section" aria-labelledby="eb-trends">
        <h2 id="eb-trends">Key trends</h2>
        <div className="eb-charts">
          {byId.gdp && (
            <TrendChart title="Real GDP growth" note="YoY · constant prices, 2022-23 base · MoSPI"
              points={byId.gdp.history} kind="bar" formatAxis={(v) => `${v}%`}
              formatTip={(v) => `${v.toFixed(1)}% real growth`} formatEnd={(v) => `${v.toFixed(1)}%`} />
          )}
          {byId.cpi && (
            <TrendChart title="CPI inflation" note="YoY · All India combined, 2024 base · MoSPI"
              points={byId.cpi.history} kind="line" formatAxis={(v) => `${v}%`}
              formatTip={(v) => `${v.toFixed(2)}% inflation`} formatEnd={(v) => `${v.toFixed(2)}%`} />
          )}
        </div>
      </section>

      <section className="eb-section eb-monitor" aria-labelledby="eb-monitor-title">
        <div className="eb-monitor-head">
          <div><p className="eb-kicker">LATEST RELEASES</p><h2 id="eb-monitor-title">Indicator monitor</h2></div>
          <p className="eb-monitor-count" aria-live="polite">{visibleCount} of {indicators.length} indicators</p>
        </div>
        <div className="eb-monitor-tools">
          <label className="eb-search">
            <span className="eb-sr">Search indicators, periods, or sources</span>
            <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.8" cy="8.8" r="5.6"/><path d="m13 13 4 4"/></svg>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search indicators, periods, or sources" />
          </label>
          <label className="eb-monitor-filter"><span>Theme</span>
            <select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} aria-label="Filter indicators by theme">
              <option value="all">All themes</option>
              {groups.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
        </div>
        {visibleCount === 0 && <p className="eb-filter-empty" role="status">No indicators match these filters. Try another search or theme.</p>}
      </section>

      {visibleGroups.map((g) => (
        <section key={g} className="eb-section" aria-labelledby={`eb-g-${slug(g)}`}>
          <div className="eb-sectionbar">
            <h2 id={`eb-g-${slug(g)}`}>{g}</h2>
            <a className="eb-more" href={`#/theme/${slug(g)}`}>Open theme page</a>
          </div>
          {visibleItems(g).length ? <Ledger caption={g} items={visibleItems(g)} /> : <p className="eb-filter-empty">No indicators in this theme match your search.</p>}
        </section>
      ))}
    </>
  );
}
