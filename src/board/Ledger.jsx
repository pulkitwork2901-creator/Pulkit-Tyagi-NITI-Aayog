import Chip from './Chip.jsx';
import Sparkline from './Sparkline.jsx';
import { formatValue, signed, tipFor } from './format.js';

// Statistical table for a group of indicators. Each row opens that indicator's page.
export default function Ledger({ items, caption }) {
  return (
    <div className="eb-tablewrap">
      <table className="eb-table">
        <caption className="eb-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Indicator</th>
            <th scope="col" className="eb-num">Latest</th>
            <th scope="col">Change</th>
            <th scope="col" className="eb-hide-sm">Compared with</th>
            <th scope="col" className="eb-hide-sm">Trend</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                <a href={`#/indicator/${r.id}`}>{r.label}</a>
                <span className="eb-rowmeta">
                  {r.period}
                  {r.mode === 'live' && <span className={r.stale ? 'eb-tag eb-tag-stale' : 'eb-tag eb-tag-live'}>{r.stale ? 'MoSPI, last good copy' : 'Live from MoSPI'}</span>}
                  {r.mode === 'rbi' && <span className="eb-tag eb-tag-rbi">RBI DBIE</span>}
                </span>
              </th>
              <td className="eb-num">
                <span className="eb-cell-value">{signed(formatValue(r.value, r.decimals))}</span>
                <span className="eb-cell-unit">{r.unit}</span>
              </td>
              <td><Chip item={r} /></td>
              <td className="eb-hide-sm eb-muted">
                {r.compare_period ? `${signed(formatValue(r.compare_value, r.decimals))}, ${r.compare_period}` : 'Not available'}
              </td>
              <td className="eb-hide-sm eb-trendcell">
                <Sparkline points={r.history} kind="line" height={30} interactive={false}
                  formatTip={tipFor(r)} label={`${r.label} trend`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
