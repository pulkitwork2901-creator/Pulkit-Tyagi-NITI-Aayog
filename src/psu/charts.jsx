import { useState } from 'react';
import useWidth from '../board/useWidth.js';
import { niceScale } from '../board/format.js';

// Charts for the PSU Performance Board. Plain SVG drawn at real pixel width,
// colours from the board's --eb-* tokens so every colour scheme works.

// Yearly bars. Each row's parts stack: positive values upward from zero,
// negative values downward. A row with no parts is drawn as a labelled gap
// ("not published"), so a missing year is never mistaken for a zero.
// `dot` marks one more value per row (for example net profit) as a point.
export function YearBars({ rows, series, dot, fmt, height = 220, label }) {
  const [ref, W] = useWidth(520, 240);
  const [hover, setHover] = useState(null);
  const M = { top: 14, right: 8, bottom: 26, left: 46 };
  const plotW = W - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const has = (r) => series.some((s) => r[s.key] != null);
  const ups = rows.map((r) => series.reduce((a, s) => a + Math.max(0, r[s.key] || 0), 0));
  const downs = rows.map((r) => series.reduce((a, s) => a + Math.min(0, r[s.key] || 0), 0));
  const dots = dot ? rows.map((r) => r[dot.key]).filter((v) => v != null) : [];
  const [vMin, vMax, step] = niceScale(Math.min(0, ...downs, ...dots), Math.max(0, ...ups, ...dots), 4);
  const y = (v) => M.top + plotH * (1 - (v - vMin) / (vMax - vMin));
  const slot = plotW / rows.length;
  const barW = Math.max(6, Math.min(34, slot * 0.62));
  const ticks = [];
  for (let v = vMin; v <= vMax + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  const every = Math.max(1, Math.ceil((rows.length * 50) / plotW));
  const hr = hover != null ? rows[hover] : null;

  return (
    <div ref={ref} className="eb-mc-plot">
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" onPointerLeave={() => setHover(null)}
        aria-label={`${label}. ${rows.map((r) => `${r.period}: ${has(r) ? series.map((s) => `${s.label} ${fmt(r[s.key])}`).join(', ') : 'not published'}`).join('; ')}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} className={v === 0 ? 'eb-axis' : 'eb-grid'} />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="eb-tick">{fmt(v, true)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = M.left + slot * (i + 0.5);
          let up = 0;
          let down = 0;
          return (
            <g key={r.period} onPointerEnter={() => setHover(i)}>
              <rect x={cx - slot / 2} y={M.top} width={slot} height={plotH} fill="transparent" />
              {!has(r) && (
                <text x={cx} y={y(0) - 8} textAnchor="middle" className="ps-gap">n/a</text>
              )}
              {series.map((s) => {
                const v = r[s.key];
                if (!v) return null;
                const from = v > 0 ? up : down;
                const to = from + v;
                if (v > 0) up = to; else down = to;
                const top = y(Math.max(from, to));
                return (
                  <rect key={s.key} x={cx - barW / 2} width={barW} y={top} height={Math.max(1, Math.abs(y(from) - y(to)))}
                    fill={s.color} opacity={(hover != null && hover !== i) || r.part ? 0.55 : 1} className="eb-grow"
                    style={{ transformOrigin: `0 ${y(0)}px`, animationDelay: `${i * 25}ms` }} />
                );
              })}
              {dot && r[dot.key] != null && (
                <g>
                  <line x1={cx - barW / 2 - 3} x2={cx + barW / 2 + 3} y1={y(r[dot.key])} y2={y(r[dot.key])} stroke="var(--eb-navy)" strokeWidth="2.5" />
                </g>
              )}
              {(rows.length - 1 - i) % every === 0 && (
                <text x={cx} y={height - 7} textAnchor="middle" className="eb-tick">{r.short || r.period}{r.part ? '*' : ''}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hr && (
        <div className="eb-tip eb-mc-tip" style={{ left: Math.min(Math.max(M.left + slot * (hover + 0.5) - 90, 0), Math.max(0, W - 200)), top: 0 }}>
          <span>{hr.period}{hr.part ? ` (${hr.part})` : ''}</span>
          {!has(hr) && <div className="eb-mc-tiprow">Not published in a readable source</div>}
          {has(hr) && series.map((s) => (
            <div key={s.key} className="eb-mc-tiprow"><i style={{ background: s.color }} aria-hidden="true" />{s.label}: <b>{fmt(hr[s.key])}</b></div>
          ))}
          {has(hr) && dot && hr[dot.key] != null && <div className="eb-mc-tiprow"><i style={{ background: 'var(--eb-navy)' }} aria-hidden="true" />{dot.label}: <b>{fmt(hr[dot.key])}</b></div>}
        </div>
      )}
    </div>
  );
}

// Horizontal bars for a ranked list. Negative values extend left of a zero line.
export function RankBars({ items, fmt, sub }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  // Split around a centre line only when the list mixes gains and losses.
  const anyNeg = items.some((i) => i.value < 0) && items.some((i) => i.value > 0);
  return (
    <ul className="eb-bars ps-bars">
      {items.map((it) => (
        <li key={it.key || it.label} className="eb-bar-row ps-bar-row">
          <span className="eb-bar-text">
            <span className="eb-bar-label" title={it.label}>{it.label}</span>
            <span className={`eb-bar-track ${anyNeg ? 'ps-track-split' : ''}`}>
              <i className={it.value < 0 ? 'ps-neg' : undefined}
                style={anyNeg
                  ? { width: `${(50 * Math.abs(it.value)) / max}%`, marginLeft: it.value < 0 ? `${50 - (50 * Math.abs(it.value)) / max}%` : '50%' }
                  : { width: `${(100 * Math.abs(it.value)) / max}%` }} />
            </span>
          </span>
          <span className="eb-bar-val">{fmt(it.value)}{sub && <small>{sub(it)}</small>}</span>
        </li>
      ))}
    </ul>
  );
}

// One bar split into shares, with a key underneath.
export function ShareBar({ parts, label, fmt }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  return (
    <div className="ps-share">
      <div className="rb-age-bar" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${Math.round((100 * p.value) / total)}%`).join(', ')}`}>
        {parts.map((p) => (
          <i key={p.label} style={{ flexGrow: Math.max(0, p.value), background: p.color }} title={`${p.label}: ${fmt(p.value)} (${((100 * p.value) / total).toFixed(1)}%)`} />
        ))}
      </div>
      <ul className="rb-age-key">
        {parts.map((p) => (
          <li key={p.label}><i style={{ background: p.color }} aria-hidden="true" />{p.label} <b>{Math.round((100 * p.value) / total)}%</b></li>
        ))}
      </ul>
    </div>
  );
}
