import Chip from '../Chip.jsx';
import { formatValue, signed, slug } from '../format.js';

// Every indicator in one table: the latest reading, its change, and a strip of
// the last 12 readings shaded on one blue ramp (darker = higher within those
// 12), so a reader sees at a glance whether a series is near its recent top
// or bottom. Values are in each cell's tooltip and on the indicator page.

const STEPS = 5;

function Strip({ item }) {
  const pts = (item.history || []).filter((p) => p.value != null).slice(-12);
  if (pts.length < 3) return <span className="eb-muted eb-strip-none">Too few readings</span>;
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const fmt = (v) => `${signed(formatValue(v, item.decimals))} ${item.unit}`;
  return (
    <span className="eb-strip" role="img"
      aria-label={`Last ${pts.length} readings, from ${fmt(vals[0])} to ${fmt(vals[vals.length - 1])}, range ${fmt(lo)} to ${fmt(hi)}`}>
      {pts.map((p, i) => {
        const level = hi === lo ? 2 : Math.round(((p.value - lo) / (hi - lo)) * (STEPS - 1));
        return <i key={p.date || i} className={`eb-seq-${level}${i === pts.length - 1 ? ' eb-strip-last' : ''}`} title={`${p.label}: ${fmt(p.value)}`} />;
      })}
    </span>
  );
}

export default function SignalTable({ indicators, groups }) {
  return (
    <div className="eb-tablewrap">
      <table className="eb-signal">
        <caption className="eb-sr">All indicators: latest reading, change and the last 12 readings</caption>
        <thead>
          <tr>
            <th scope="col">Indicator</th>
            <th scope="col" className="eb-num">Latest</th>
            <th scope="col">Change</th>
            <th scope="col" className="eb-hide-sm">Period</th>
            <th scope="col" className="eb-hide-sm">Last 12 readings <span className="eb-seq-key" aria-hidden="true"><i className="eb-seq-0" />low<i className="eb-seq-4" />high</span></th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g}>
            <tr className="eb-signal-group">
              <th scope="colgroup" colSpan={5}><a href={`#/theme/${slug(g)}`}>{g}</a></th>
            </tr>
            {indicators.filter((i) => i.group === g).map((i) => (
              <tr key={i.id}>
                <th scope="row"><a href={`#/indicator/${i.id}`}>{i.label}</a></th>
                <td className="eb-num"><b>{signed(formatValue(i.value, i.decimals))}</b> <span className="eb-muted eb-unit">{i.unit}</span></td>
                <td><Chip item={i} /></td>
                <td className="eb-hide-sm eb-muted">{i.period}</td>
                <td className="eb-hide-sm"><Strip item={i} /></td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
