import { arrow, formatChange, signed, tone } from './format.js';

// Change against the comparison period: arrow + signed number, coloured by whether the move is favourable.
export default function Chip({ item }) {
  const text = formatChange(item.change, item.change_unit);
  if (!text) return <span className="eb-muted">Not available</span>;
  const t = tone(item.change, item.up_is_good);
  return (
    <span className={`eb-chip eb-${t}`}>
      <span aria-hidden="true">{arrow(item.change)}</span> {signed(text)}
    </span>
  );
}
