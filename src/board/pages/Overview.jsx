import Chip from '../Chip.jsx';
import Lead from '../Lead.jsx';
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
  const indicators = data.indicators || [];
  const headline = HEADLINE.map((id) => byId[id]).filter(Boolean);
  return (
    <>
      <header className="eb-pagehead">
        <h1>{title}</h1>
        <p className="eb-asof">Position as on {formatDateTime(data.generated_at)}</p>
      </header>

      <section className="eb-section" aria-labelledby="eb-brief">
        <h2 id="eb-brief">Position in brief</h2>
        <Lead byId={byId} />
      </section>

      {headline.length > 0 && (
        <section className="eb-section" aria-labelledby="eb-headline">
          <h2 id="eb-headline">Headline indicators</h2>
          <ul className="eb-figures">{headline.map((item) => <Figure key={item.id} item={item} />)}</ul>
        </section>
      )}

      <section className="eb-section" aria-labelledby="eb-trends">
        <h2 id="eb-trends">Growth and inflation</h2>
        <div className="eb-charts">
          {byId.gdp && (
            <TrendChart title="Real GDP growth by quarter" note="Per cent, year on year, constant prices, 2022-23 base. Source: MoSPI."
              points={byId.gdp.history} kind="bar" formatAxis={(v) => `${v}%`}
              formatTip={(v) => `${v.toFixed(1)}% real growth`} formatEnd={(v) => `${v.toFixed(1)}%`} />
          )}
          {byId.cpi && (
            <TrendChart title="CPI inflation by month" note="Per cent, year on year, All India combined, 2024 base. Source: MoSPI."
              points={byId.cpi.history} kind="line" formatAxis={(v) => `${v}%`}
              formatTip={(v) => `${v.toFixed(2)}% inflation`} formatEnd={(v) => `${v.toFixed(2)}%`} />
          )}
        </div>
      </section>

      {groups.map((g) => (
        <section key={g} className="eb-section" aria-labelledby={`eb-g-${slug(g)}`}>
          <div className="eb-sectionbar">
            <h2 id={`eb-g-${slug(g)}`}>{g}</h2>
            <a className="eb-more" href={`#/theme/${slug(g)}`}>Open theme page</a>
          </div>
          <Ledger caption={g} items={indicators.filter((i) => i.group === g)} />
        </section>
      ))}
    </>
  );
}
