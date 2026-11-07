import { useState } from 'react';
import useWidth from '../useWidth.js';
import { niceScale, signed } from '../format.js';

// One chart panel on the dashboard: up to three series on one shared time axis
// and one y scale (never two), lines or grouped bars, an optional shaded
// reference band, a legend for two or more series, direct end labels, and a
// crosshair tooltip that reads every series at the hovered date.

const M = { top: 10, right: 64, bottom: 24, left: 40 };
const DAY = 86400000;
const t = (iso) => new Date(`${iso}T00:00:00Z`).getTime();
const monthKey = (iso) => iso.slice(0, 7);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function sinceRange(points, start) {
  return (points || []).filter((p) => p.value != null && p.date && t(p.date) >= start);
}

export default function MultiChart({ title, note, series, kind = 'line', band, start, fmt, headline, height = 156 }) {
  const [ref, W] = useWidth(360, 220);
  const [hover, setHover] = useState(null);
  const live = series.map((s) => ({ ...s, pts: sinceRange(s.points, start) })).filter((s) => s.pts.length);

  const body = () => {
    if (!live.length || live.every((s) => s.pts.length < 2)) {
      return <p className="eb-empty">Not enough data in this period. Choose a longer range above.</p>;
    }
    const H = height;
    const right = kind === 'line' ? M.right : 12;
    const plotW = W - M.left - right;
    const plotH = H - M.top - M.bottom;
    const all = live.flatMap((s) => s.pts);
    const dates = [...new Set(all.map((p) => monthKey(p.date)))].sort();
    const t0 = Math.min(...all.map((p) => t(p.date)));
    const t1 = Math.max(...all.map((p) => t(p.date)));
    const vals = all.map((p) => p.value);
    let lo = Math.min(...vals, ...(band ? [band.lo] : []));
    let hi = Math.max(...vals, ...(band ? [band.hi] : []));
    if (kind === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); } else { const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad; }
    const [yMin, yMax, step] = niceScale(lo, hi, 4);
    const ticks = [];
    for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
    const y = (v) => M.top + plotH * (1 - (v - yMin) / (yMax - yMin));

    // x: continuous time for lines; one slot per month for bars
    const slot = plotW / dates.length;
    const xBar = (key) => M.left + slot * (dates.indexOf(key) + 0.5);
    const xLine = (iso) => M.left + (t1 === t0 ? plotW / 2 : ((t(iso) - t0) / (t1 - t0)) * plotW);
    const xOf = (p) => (kind === 'bar' ? xBar(monthKey(p.date)) : xLine(p.date));

    // x ticks: years for long spans, quarters for a year or less
    const spanDays = (t1 - t0) / DAY;
    const xTicks = [];
    const first = new Date(t0);
    for (let yr = first.getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr += 1) {
      for (const m of spanDays > 400 ? [0] : [0, 3, 6, 9]) {
        const iso = `${yr}-${String(m + 1).padStart(2, '0')}-01`;
        if (t(iso) >= t0 - 15 * DAY && t(iso) <= t1) {
          xTicks.push({ iso, text: spanDays > 400 ? String(yr) : `${MON[m]} ${String(yr).slice(2)}` });
        }
      }
    }

    const onMove = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * W;
      let best = dates[0];
      let bestD = Infinity;
      for (const key of dates) {
        const px = kind === 'bar' ? xBar(key) : xLine(`${key}-15`);
        if (Math.abs(px - mx) < bestD) { bestD = Math.abs(px - mx); best = key; }
      }
      setHover(best);
    };
    const at = (s, key) => s.pts.find((p) => monthKey(p.date) === key);

    // end labels for lines, nudged apart so they never overlap
    const ends = kind === 'line' ? live.map((s) => {
      const p = s.pts[s.pts.length - 1];
      return { s, p, x: xLine(p.date), y: y(p.value) };
    }).sort((a, b) => a.y - b.y) : [];
    // one label column right of the latest point of any series, so a label
    // never sits on another series' end dot
    const labelX = Math.max(...ends.map((e) => e.x), 0) + 9;
    for (let i = 1; i < ends.length; i += 1) {
      if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    }

    const nBars = live.length;
    const barW = Math.max(2, Math.min(12, (slot * 0.78 - (nBars - 1) * 2) / nBars));
    const hx = hover && (kind === 'bar' ? xBar(hover) : xLine(`${hover}-15`));

    return (
      <div className="eb-mc-plot">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${note || ''}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {band && (
            <g>
              <rect x={M.left} width={plotW} y={y(band.hi)} height={y(band.lo) - y(band.hi)} className="eb-mc-band" />
            </g>
          )}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} className={v === 0 ? 'eb-axis' : 'eb-grid'} />
              <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="eb-tick">{signed(String(v))}</text>
            </g>
          ))}
          {xTicks.map((k) => {
            // bars sit in monthly slots: label the first slot in that year (or quarter)
            const window = spanDays > 400 ? k.iso.slice(0, 4) : null;
            const key = kind === 'bar' ? dates.find((d) => (window ? d.slice(0, 4) === window : d >= monthKey(k.iso))) : null;
            if (kind === 'bar' && !key) return null;
            const px = kind === 'bar' ? xBar(key) : xLine(k.iso);
            return <text key={k.iso} x={px} y={H - 6} textAnchor="middle" className="eb-tick">{k.text}</text>;
          })}
          {kind === 'bar' ? live.map((s, si) => s.pts.map((p) => {
            const cx = xBar(monthKey(p.date)) - ((nBars - 1) * (barW + 2)) / 2 + si * (barW + 2);
            const top = Math.min(y(p.value), y(0));
            return (
              <rect key={`${s.key}-${p.date}`} x={cx - barW / 2} width={barW} y={top}
                height={Math.max(1, Math.abs(y(p.value) - y(0)))} rx={Math.min(2, barW / 3)}
                fill={s.color} opacity={hover && hover !== monthKey(p.date) ? 0.45 : 1} />
            );
          })) : live.map((s) => (
            <path key={s.key} d={s.pts.map((p, i) => `${i ? 'L' : 'M'}${xLine(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('')}
              fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {kind === 'line' && live.length === 1 && (
            <path d={`${live[0].pts.map((p, i) => `${i ? 'L' : 'M'}${xLine(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('')}L${xLine(live[0].pts[live[0].pts.length - 1].date)},${y(yMin)}L${xLine(live[0].pts[0].date)},${y(yMin)}Z`}
              fill={live[0].color} opacity="0.08" />
          )}
          {ends.map(({ s, p, x, y: ly }) => (
            <g key={`end-${s.key}`}>
              <circle cx={x} cy={y(p.value)} r="4" fill={s.color} className="eb-mc-ring" />
              <text x={labelX} y={ly} dy="0.32em" className="eb-mc-endlabel">{fmt(p.value)}</text>
            </g>
          ))}
          {hover && (
            <g>
              <line x1={hx} x2={hx} y1={M.top} y2={M.top + plotH} className="eb-mc-cross" />
              {kind === 'line' && live.map((s) => {
                const p = at(s, hover);
                return p ? <circle key={`h-${s.key}`} cx={xLine(p.date)} cy={y(p.value)} r="4" fill={s.color} className="eb-mc-ring" /> : null;
              })}
            </g>
          )}
        </svg>
        {hover && (
          <div className="eb-tip eb-mc-tip" style={{ left: Math.min(Math.max(hx - 80, 0), Math.max(0, W - 170)), top: 4 }}>
            <span>{MON[Number(hover.slice(5)) - 1]} {hover.slice(0, 4)}</span>
            {live.map((s) => {
              const p = at(s, hover);
              return (
                <div key={s.key} className="eb-mc-tiprow">
                  <i style={{ background: s.color }} aria-hidden="true" />{s.label}: <b>{p ? fmt(p.value) : 'no reading'}</b>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <figure className="eb-mc">
      <figcaption>
        <h3 className="eb-mc-title">{title}</h3>
        {headline && (
          <p className="eb-mc-head"><b>{headline.value}</b><span>{headline.sub}</span></p>
        )}
        {note && <p className="eb-mc-note">{note}</p>}
        {live.length > 1 && (
          <ul className="eb-mc-legend">
            {live.map((s) => <li key={s.key}><i style={{ background: s.color }} aria-hidden="true" />{s.label}</li>)}
          </ul>
        )}
      </figcaption>
      <div ref={ref}>{body()}</div>
    </figure>
  );
}
