import { useId, useState } from 'react';
import useWidth from './useWidth.js';

const H = 44;
const PAD = 4;

export default function Sparkline({ points, kind = 'line', formatTip, label }) {
  const [ref, W] = useWidth(240);
  const [hover, setHover] = useState(null);
  const gradId = useId();
  const pts = (points || []).filter((p) => p.value != null);
  if (pts.length < 2) return <div ref={ref} className="eb-spark eb-spark-empty">Trend appears once two releases are entered</div>;

  const vals = pts.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (kind === 'bar') lo = Math.min(0, lo);
  const span = hi - lo || 1;
  const yMin = kind === 'bar' ? lo : lo - span * 0.15;
  const yMax = hi + span * 0.15;
  const y = (v) => PAD + (H - 2 * PAD) * (1 - (v - yMin) / (yMax - yMin));
  const band = W / pts.length;
  const x = (i) => (kind === 'bar' ? band * i + band / 2 : PAD + (i * (W - 2 * PAD)) / (pts.length - 1));
  const active = hover ?? pts.length - 1;

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((_, i) => { if (Math.abs(x(i) - mx) < Math.abs(x(best) - mx)) best = i; });
    setHover(best);
  };

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${H}L${x(0).toFixed(1)},${H}Z`;
  const tipLeft = Math.min(Math.max(x(active) - 70, 0), W - 140);

  return (
    <div ref={ref} className="eb-spark">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {kind === 'bar' ? (
          pts.map((p, i) => (
            <rect key={p.label} x={x(i) - band * 0.35} width={band * 0.7} rx="2"
              y={Math.min(y(p.value), y(0))} height={Math.abs(y(p.value) - y(0))}
              className={i === active ? 'eb-mark' : 'eb-mark eb-mark-quiet'} />
          ))
        ) : (
          <>
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" className="eb-grad" stopOpacity="0.22" />
                <stop offset="1" className="eb-grad" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradId})`} />
            <path d={line} className="eb-line" />
            <circle cx={x(active)} cy={y(pts[active].value)} r="3.5" className="eb-dot-mark" />
          </>
        )}
      </svg>
      {hover != null && (
        <div className="eb-tip" style={{ left: tipLeft, bottom: H + 6 }}>
          <span>{pts[hover].label}</span>
          {formatTip(pts[hover].value)}
        </div>
      )}
    </div>
  );
}
