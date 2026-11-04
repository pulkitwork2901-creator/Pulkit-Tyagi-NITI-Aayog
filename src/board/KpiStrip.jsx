import Sparkline from './Sparkline.jsx';
import { formatChange, formatValue, tone } from './format.js';

const TIP = {
  gdp: (v) => `${v.toFixed(1)}% real growth`,
  cpi: (v) => `${v.toFixed(2)}% inflation`,
  fx_reserves: (v) => `US$ ${v.toFixed(1)} bn`,
  inr_usd: (v) => `\u20B9${v.toFixed(2)} per US$`,
};

const UNIT = { gdp: '%', cpi: '%', fx_reserves: 'US$ bn', inr_usd: '\u20B9 per US$' };

function SourceTag({ item }) {
  if (item.mode === 'live') {
    return <span className={`eb-tag ${item.stale ? 'eb-tag-stale' : 'eb-tag-live'}`}>{item.stale ? 'MoSPI, last good copy' : 'Live, MoSPI'}</span>;
  }
  return <span className="eb-tag">From release</span>;
}

function Kpi({ item, note }) {
  const change = formatChange(item.change, item.change_unit);
  const t = tone(item.change, item.up_is_good);
  return (
    <article className="eb-kpi" aria-label={item.label}>
      <div className="eb-kpi-head">
        <h3>{item.label}</h3>
        <SourceTag item={item} />
      </div>
      <p className="eb-kpi-value">
        {formatValue(item.value, item.decimals)}
        <span className="eb-kpi-unit">{UNIT[item.id] ?? item.unit}</span>
      </p>
      <p className="eb-kpi-change">
        {change && <span className={`eb-chip eb-${t}`}>{change}</span>}
        {item.compare_period && <span>vs {item.compare_period}</span>}
      </p>
      <Sparkline points={item.history.slice(-12)} kind={item.id === 'gdp' ? 'bar' : 'line'} formatTip={TIP[item.id] ?? ((v) => String(v))} label={`${item.label} trend`} />
      <p className="eb-kpi-foot">
        <span>{item.period}</span>
        <span>{note}</span>
      </p>
    </article>
  );
}

const NOTES = {
  gdp: 'Year on year, constant prices',
  cpi: 'Headline, All India',
  fx_reserves: 'Weekly, RBI',
  inr_usd: 'Lower means a stronger rupee',
};

export default function KpiStrip({ indicators, ids }) {
  const items = ids.map((id) => indicators.find((i) => i.id === id)).filter(Boolean);
  return (
    <section className="eb-kpis" aria-label="Headline indicators">
      {items.map((item) => <Kpi key={item.id} item={item} note={NOTES[item.id]} />)}
    </section>
  );
}
