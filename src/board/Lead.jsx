import { formatValue, signed } from './format.js';

const mv = (from, to) => (to > from ? 'up from' : to < from ? 'down from' : 'unchanged from');

// The position in brief: a short note written from the latest figures, the way a briefing opens.
export default function Lead({ byId }) {
  const { gdp, cpi, repo, fx_reserves: fx, inr_usd: inr, trade_balance: tb, wpi, unemployment: ur, services_net: sv } = byId;
  const parts = [];

  if (gdp) {
    parts.push(
      <span key="gdp">
        Real GDP grew <strong>{formatValue(gdp.value, 1)}%</strong> in {gdp.period}
        {gdp.compare_period ? `, ${mv(gdp.compare_value, gdp.value)} ${formatValue(gdp.compare_value, 1)}% in ${gdp.compare_period}` : ''}.
      </span>,
    );
  }
  if (cpi) {
    parts.push(
      <span key="cpi">
        CPI inflation was <strong>{formatValue(cpi.value, 2)}%</strong> in {cpi.period}
        {cpi.compare_period ? `, ${mv(cpi.compare_value, cpi.value)} ${formatValue(cpi.compare_value, 2)}% in ${cpi.compare_period}` : ''}
        {repo ? <>, against a policy repo rate of <strong>{formatValue(repo.value, 2)}%</strong></> : null}.
      </span>,
    );
  }
  if (wpi || ur) {
    parts.push(
      <span key="wpi">
        {wpi ? <>Wholesale (WPI) inflation was <strong>{formatValue(wpi.value, 2)}%</strong> in {wpi.period}</> : null}
        {wpi && ur ? ' and ' : null}
        {ur ? <>{wpi ? 'the' : 'The'} unemployment rate was <strong>{formatValue(ur.value, 1)}%</strong> in {ur.period}</> : null}.
      </span>,
    );
  }
  if (tb) {
    parts.push(
      <span key="tb">
        The merchandise trade balance was <strong>US$ {signed(formatValue(tb.value, 2))} bn</strong> in {tb.period}
        {sv && sv.period === tb.period ? <>, partly offset by a services surplus of <strong>US$ {formatValue(sv.value, 1)} bn</strong></> : null}.
      </span>,
    );
  }
  if (fx || inr) {
    parts.push(
      <span key="ext">
        {fx ? <>Forex reserves stand at <strong>US$ {formatValue(fx.value, 1)} bn</strong> ({fx.period})</> : null}
        {fx && inr ? ' and ' : null}
        {inr ? <>{fx ? 'the' : 'The'} rupee closed at <strong>{'₹'}{formatValue(inr.value, 2)}</strong> per US$ ({inr.period})</> : null}.
      </span>,
    );
  }
  if (!parts.length) return null;
  return <p className="eb-lead">{parts.map((p, i) => <span key={i}>{p}{' '}</span>)}</p>;
}
