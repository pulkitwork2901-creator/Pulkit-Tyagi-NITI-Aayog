import { useId, useState } from 'react';
import useWidth from './useWidth.js';
import { niceScale } from './format.js';

const H = 260;
const M = { top: 26, right: 28, bottom: 32, left: 48 };
const INSET = 14; // keeps line end points and labels inside the frame

export default function TrendChart({ title, note, points, kind = 'line', formatAxis, formatTip, formatEnd, headingLevel = 3 }) {
  const [ref, W] = useWidth(480);
  const [hover, setHover] = useState(null);
  const gradId = useId();
  const pts = (points || []).filter((p) => p.value != null);
  const Heading = `h${headingLevel}`;

  const body = () => {
    if (pts.length < 2) return <p className="eb-empty">A trend line appears once two releases are entered.</p>;
    const vals = pts.map((p) => p.value);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (kind === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); } else { const pad = (hi - lo) * 0.2 || 1; lo -= pad; hi += pad; }
    const [yMin, yMax, step] = niceScale(lo, hi, 4);
    const ticks = [];
    for (let t = yMin; t <= yMax + step / 2; t += step) ticks.push(Number(t.toFixed(6)));
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const y = (v) => M.top + plotH * (1 - (v - yMin) / (yMax - yMin));
    const band = plotW / pts.length;
    const x = (i) => (kind === 'bar' ? M.left + band * i + band / 2 : M.left + INSET + (pts.length === 1 ? (plotW - 2 * INSET) / 2 : (i * (plotW - 2 * INSET)) / (pts.length - 1)));
    const anchor = (xi) => (kind === 'bar' ? 'middle' : xi > W - M.right - 24 ? 'end' : xi < M.left + 24 ? 'start' : 'middle');
    const labelEvery = Math.max(1, Math.ceil((pts.length * 84) / plotW));
    const last = pts.length - 1;
    const active = hover;

    const onMove = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * W;
      let best = 0;
      pts.forEach((_, i) => { if (Math.abs(x(i) - mx) < Math.abs(x(best) - mx)) best = i; });
      setHover(best);
    };

    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    const area = `${line}L${x(last).toFixed(1)},${y(yMin)}L${x(0).toFixed(1)},${y(yMin)}Z`;
    const barW = Math.min(30, band * 0.62);

    return (
      <>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'eb-axis' : 'eb-grid'} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="eb-tick">{formatAxis(t)}</text>
            </g>
          ))}
          {pts.map((p, i) => ((last - i) % labelEvery === 0 ? (
            <text key={`x-${p.label}`} x={Math.min(x(i), W - 2)} y={H - 9} textAnchor={anchor(x(i))} className="eb-tick">{p.short ?? p.label}</text>
          ) : null))}
          {kind === 'bar' ? (
            pts.map((p, i) => (
              <rect key={p.label} x={x(i) - barW / 2} width={barW}
                y={Math.min(y(p.value), y(0))} height={Math.max(1, Math.abs(y(p.value) - y(0)))}
                className={i === last || i === active ? 'eb-mark' : 'eb-mark eb-mark-quiet'} />
            ))
          ) : (
            <>
              <defs>
                <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" className="eb-grad" stopOpacity="0.14" />
                  <stop offset="1" className="eb-grad" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gradId})`} />
              <path d={line} className="eb-line" />
              {pts.map((p, i) => (
                <circle key={p.label} cx={x(i)} cy={y(p.value)} r={i === active || i === last ? 5 : 2.5}
                  className={i === last ? 'eb-dot-mark eb-dot-latest' : 'eb-dot-mark'} />
              ))}
            </>
          )}
          {active == null && (
            <text x={x(last)} y={y(pts[last].value) + (kind === 'line' && pts[last].value < pts[last - 1].value ? 22 : -11)}
              textAnchor={anchor(x(last))} className="eb-endlabel">{formatEnd(pts[last].value)}</text>
          )}
        </svg>
        {active != null && (
          <div className="eb-tip" style={{ left: Math.min(Math.max(x(active) - 75, 0), Math.max(0, W - 150)), top: Math.max(0, y(pts[active].value) - 58) }}>
            <span>{pts[active].label}</span>
            {formatTip(pts[active].value)}
          </div>
        )}
      </>
    );
  };

  return (
    <figure className="eb-chartcard">
      <figcaption>
        <Heading className="eb-chart-title">{title}</Heading>
        {note && <p className="eb-chartnote">{note}</p>}
      </figcaption>
      <div ref={ref} className="eb-chart">{body()}</div>
    </figure>
  );
}
