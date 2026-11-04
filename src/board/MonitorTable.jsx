import { formatChange, formatDate, formatValue, tone } from './format.js';

export default function MonitorTable({ indicators, exclude = [] }) {
  const rows = indicators.filter((i) => !exclude.includes(i.id));
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="eb-tablewrap">
      <table className="eb-table">
        <thead>
          <tr>
            <th scope="col">Indicator</th>
            <th scope="col" className="eb-num">Latest</th>
            <th scope="col">Change</th>
            <th scope="col" className="eb-hide-sm">Compared with</th>
            <th scope="col" className="eb-hide-sm">Period</th>
            <th scope="col" className="eb-hide-md">Released</th>
            <th scope="col" className="eb-hide-md">Source</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g}>
            <tr className="eb-group"><th colSpan={7} scope="rowgroup">{g}</th></tr>
            {rows.filter((r) => r.group === g).map((r) => {
              const change = formatChange(r.change, r.change_unit);
              return (
                <tr key={r.id}>
                  <th scope="row">
                    {r.label}
                    {r.mode === 'live' && <span className="eb-live-dot" title="Live from MoSPI" />}
                  </th>
                  <td className="eb-num">
                    <span className="eb-cell-value">{formatValue(r.value, r.decimals)}</span>
                    <span className="eb-cell-unit">{r.unit}</span>
                  </td>
                  <td>{change ? <span className={`eb-chip eb-${tone(r.change, r.up_is_good)}`}>{change}</span> : <span className="eb-muted">n/a</span>}</td>
                  <td className="eb-hide-sm eb-muted">{r.compare_period ?? 'n/a'}</td>
                  <td className="eb-hide-sm eb-nowrap">{r.period}</td>
                  <td className="eb-hide-md eb-muted eb-nowrap">{r.released ? formatDate(r.released) : 'On refresh'}</td>
                  <td className="eb-hide-md eb-muted eb-source">
                    {r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer">{r.source}</a> : r.source}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
