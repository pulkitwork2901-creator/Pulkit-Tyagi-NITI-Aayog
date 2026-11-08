import { useState } from 'react';
import useWidth from '../board/useWidth.js';
import { niceScale } from '../board/format.js';
import { smoothPath } from '../board/dashboard/motion.js';

// Charts for the Reform Evidence Board. Plain SVG drawn at real pixel width,
// colours from the board's --eb-* tokens so every colour scheme works.

const f1 = (v) => (v == null ? 'n/a' : v.toFixed(1));

// India's score over time with its 90% confidence interval as a band.
export function ScoreChart({ series, label, height = 210 }) {
  const [ref, W] = useWidth(520, 240);
  const [hover, setHover] = useState(null);
  const M = { top: 12, right: 46, bottom: 24, left: 34 };
  const pts = series.filter((p) => p.value != null);
  if (pts.length < 2) return <div ref={ref}><p className="eb-empty">Not enough years to draw a trend.</p></div>;
  const plotW = W - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const y0 = pts[0].year;
  const y1 = pts[pts.length - 1].year;
  const lows = pts.map((p) => p.lo ?? p.value);
  const highs = pts.map((p) => p.hi ?? p.value);
  const [vMin, vMax, step] = niceScale(Math.min(...lows) - 2, Math.max(...highs) + 2, 4);
  const x = (yr) => M.left + ((yr - y0) / (y1 - y0)) * plotW;
  const y = (v) => M.top + plotH * (1 - (v - vMin) / (vMax - vMin));
  const ticks = [];
  for (let v = vMin; v <= vMax + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  const yearTicks = [];
  for (let yr = Math.ceil(y0 / 5) * 5; yr <= y1; yr += 5) yearTicks.push(yr);
  const withCi = pts.filter((p) => p.lo != null && p.hi != null);
  const band = withCi.length > 1
    ? `${withCi.map((p, i) => `${i ? 'L' : 'M'}${x(p.year).toFixed(1)},${y(p.hi).toFixed(1)}`).join('')}${withCi.slice().reverse().map((p) => `L${x(p.year).toFixed(1)},${y(p.lo).toFixed(1)}`).join('')}Z`
    : null;
  const line = smoothPath(pts.map((p) => [x(p.year), y(p.value)]));
  const last = pts[pts.length - 1];
  const hp = hover != null ? pts[hover] : null;

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(x(p.year) - mx) < Math.abs(x(pts[best].year) - mx)) best = i; });
    setHover(best);
  };

  return (
    <div ref={ref} className="eb-mc-plot">
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img"
        aria-label={`${label}: India's score from ${y0} to ${y1}, latest ${f1(last.value)} out of 100, 90% interval ${f1(last.lo)} to ${f1(last.hi)}.`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} className="eb-grid" />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="eb-tick">{v}</text>
          </g>
        ))}
        {yearTicks.map((yr) => <text key={yr} x={x(yr)} y={height - 6} textAnchor="middle" className="eb-tick">{yr}</text>)}
        {band && <path d={band} className="rb-ci" />}
        <path d={line} fill="none" stroke="var(--eb-s1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="eb-draw" pathLength="1" />
        <circle cx={x(last.year)} cy={y(last.value)} r="4.5" fill="var(--eb-s1)" className="eb-mc-ring" />
        {hover == null && <text x={x(last.year) + 8} y={y(last.value)} dy="0.32em" className="eb-mc-endlabel">{f1(last.value)}</text>}
        {hp && (
          <g>
            <line x1={x(hp.year)} x2={x(hp.year)} y1={M.top} y2={M.top + plotH} className="eb-mc-cross" />
            {hp.lo != null && <line x1={x(hp.year)} x2={x(hp.year)} y1={y(hp.hi)} y2={y(hp.lo)} stroke="var(--eb-s1)" strokeWidth="3" strokeLinecap="round" opacity="0.5" />}
            <circle cx={x(hp.year)} cy={y(hp.value)} r="4.5" fill="var(--eb-s1)" className="eb-mc-ring" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="eb-tip eb-mc-tip" style={{ left: Math.min(Math.max(x(hp.year) - 80, 0), Math.max(0, W - 180)), top: 0 }}>
          <span>{hp.year}</span>
          Score <b>{f1(hp.value)}</b> of 100
          {hp.lo != null && <div className="eb-mc-tiprow">90% interval {f1(hp.lo)} to {f1(hp.hi)}</div>}
        </div>
      )}
    </div>
  );
}

// Latest score for India and peers: a dot with its interval whisker, best first.
export function PeerDots({ peers, highlight = 'IND' }) {
  const [ref, W] = useWidth(360, 240);
  const [hover, setHover] = useState(null);
  const rowH = 24;
  const labelW = Math.min(110, W * 0.32);
  const M = { top: 6, right: 40, bottom: 22, left: labelW };
  const H = M.top + peers.length * rowH + M.bottom;
  const lo = Math.min(...peers.map((p) => p.lo ?? p.value));
  const hi = Math.max(...peers.map((p) => p.hi ?? p.value));
  const [vMin, vMax, step] = niceScale(lo - 2, hi + 2, 4);
  const plotW = W - M.left - M.right;
  const x = (v) => M.left + ((v - vMin) / (vMax - vMin)) * plotW;
  const ticks = [];
  for (let v = vMin; v <= vMax + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  const ind = peers.find((p) => p.iso === highlight);

  return (
    <div ref={ref} className="eb-mc-plot">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Scores for India and ${peers.length - 1} peer economies with 90% intervals. ${peers.map((p) => `${p.name} ${f1(p.value)}`).join(', ')}.`}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={M.top} y2={H - M.bottom} className="eb-grid" />
            <text x={x(v)} y={H - 6} textAnchor="middle" className="eb-tick">{v}</text>
          </g>
        ))}
        {ind?.lo != null && (
          <rect x={x(ind.lo)} width={Math.max(1, x(ind.hi) - x(ind.lo))} y={M.top} height={H - M.top - M.bottom} className="rb-ci" />
        )}
        {peers.map((p, i) => {
          const cy = M.top + i * rowH + rowH / 2;
          const me = p.iso === highlight;
          const col = me ? 'var(--eb-s1)' : 'var(--eb-muted)';
          return (
            <g key={p.iso} onPointerEnter={() => setHover(i)} className={me ? 'rb-peer-me' : undefined}>
              <rect x={0} y={cy - rowH / 2} width={W} height={rowH} fill="transparent" />
              <text x={M.left - 10} y={cy} dy="0.32em" textAnchor="end" className={me ? 'rb-peer-label rb-peer-label-me' : 'rb-peer-label'}>{p.name}</text>
              {p.lo != null && <line x1={x(p.lo)} x2={x(p.hi)} y1={cy} y2={cy} stroke={col} strokeWidth="2" strokeLinecap="round" opacity={me ? 1 : 0.55} />}
              <circle cx={x(p.value)} cy={cy} r={me ? 5.5 : 4} fill={col} className="eb-mc-ring" />
              {(me || hover === i) && <text x={Math.max(x(p.hi ?? p.value), x(p.value)) + 7} y={cy} dy="0.32em" className="eb-mc-endlabel">{f1(p.value)}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="eb-tip eb-mc-tip" style={{ left: Math.min(Math.max(x(peers[hover].value) - 80, 0), Math.max(0, W - 180)), top: M.top + hover * rowH + rowH + 2 }}>
          <span>{peers[hover].name}</span>
          Score <b>{f1(peers[hover].value)}</b>
          {peers[hover].lo != null && <div className="eb-mc-tiprow">90% interval {f1(peers[hover].lo)} to {f1(peers[hover].hi)}</div>}
        </div>
      )}
    </div>
  );
}

// Two series of yearly counts side by side (one shared y scale).
export function PairBars({ rows, series, height = 200, fmt = (v) => v.toLocaleString('en-IN') }) {
  const [ref, W] = useWidth(520, 240);
  const [hover, setHover] = useState(null);
  const M = { top: 14, right: 8, bottom: 24, left: 38 };
  const plotW = W - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const max = Math.max(...rows.flatMap((r) => series.map((s) => r[s.key] || 0)));
  const [, vMax, step] = niceScale(0, max, 4);
  const y = (v) => M.top + plotH * (1 - v / vMax);
  const slot = plotW / rows.length;
  const barW = Math.max(3, Math.min(14, (slot * 0.72 - (series.length - 1) * 2) / series.length));
  const ticks = [];
  for (let v = 0; v <= vMax + step / 2; v += step) ticks.push(v);
  const every = Math.max(1, Math.ceil((rows.length * 44) / plotW));

  return (
    <div ref={ref} className="eb-mc-plot">
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img"
        aria-label={rows.map((r) => `${r.period}: ${series.map((s) => `${s.label} ${r[s.key]}`).join(', ')}`).join('; ')}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} className={v === 0 ? 'eb-axis' : 'eb-grid'} />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="eb-tick">{v.toLocaleString('en-IN')}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = M.left + slot * (i + 0.5);
          return (
            <g key={r.period} onPointerEnter={() => setHover(i)}>
              <rect x={cx - slot / 2} y={M.top} width={slot} height={plotH} fill="transparent" />
              {series.map((s, si) => {
                const bx = cx - (series.length * barW + (series.length - 1) * 2) / 2 + si * (barW + 2);
                const v = r[s.key] || 0;
                return (
                  <rect key={s.key} x={bx} width={barW} y={y(v)} height={Math.max(1, y(0) - y(v))} rx={Math.min(3, barW / 3)}
                    fill={s.color} opacity={hover != null && hover !== i ? 0.45 : 1} className="eb-grow"
                    style={{ transformOrigin: `0 ${y(0)}px`, animationDelay: `${i * 25}ms` }} />
                );
              })}
              {(rows.length - 1 - i) % every === 0 && (
                <text x={cx} y={height - 6} textAnchor="middle" className="eb-tick">{r.short || r.period}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="eb-tip eb-mc-tip" style={{ left: Math.min(Math.max(M.left + slot * (hover + 0.5) - 80, 0), Math.max(0, W - 180)), top: 0 }}>
          <span>{rows[hover].period}</span>
          {series.map((s) => (
            <div key={s.key} className="eb-mc-tiprow"><i style={{ background: s.color }} aria-hidden="true" />{s.label}: <b>{fmt(rows[hover][s.key] || 0)}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

// One horizontal bar split by age of pending cases, lightest = newest.
export function AgeBar({ ages, label }) {
  const total = ages.reduce((a, b) => a + b.total, 0);
  return (
    <div className="rb-age">
      <div className="rb-age-bar" role="img" aria-label={`${label}: ${ages.map((a) => `${a.band} ${Math.round((100 * a.total) / total)}%`).join(', ')}`}>
        {ages.map((a, i) => (
          <i key={a.band} className={`eb-seq-${i}`} style={{ flexGrow: a.total }} title={`${a.band}: ${a.total.toLocaleString('en-IN')} (${((100 * a.total) / total).toFixed(1)}%)`} />
        ))}
      </div>
      <ul className="rb-age-key">
        {ages.map((a, i) => (
          <li key={a.band}><i className={`eb-seq-${i}`} aria-hidden="true" />{a.band} <b>{Math.round((100 * a.total) / total)}%</b></li>
        ))}
      </ul>
    </div>
  );
}
