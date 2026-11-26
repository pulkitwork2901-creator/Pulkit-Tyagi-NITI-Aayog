import { useState } from 'react';
import useWidth from '../useWidth.js';
import { money, growth } from './tradeKit.jsx';

// Two pictures for the trade overview: a treemap of product groups (area is
// value, colour is change on the year before) and a rank chart of the largest
// partners over the full years.

// Squarified treemap (Bruls, Huizing and van Wijk): lay out values in rows
// whose rectangles stay as close to square as possible.
function squarify(items, x, y, w, h) {
  const out = [];
  const total = items.reduce((s, d) => s + d.value, 0);
  if (!total) return out;
  const scale = (w * h) / total;
  let rest = items.map((d) => ({ ...d, area: d.value * scale }));
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;
  const worst = (row, side) => {
    const s = row.reduce((a, d) => a + d.area, 0);
    const mx = Math.max(...row.map((d) => d.area));
    const mn = Math.min(...row.map((d) => d.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(rw, rh);
    const row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) row.push(rest[i++]);
    rest = rest.slice(i);
    const s = row.reduce((a, d) => a + d.area, 0);
    if (rw >= rh) {
      const cw = s / rh;
      let cy = ry;
      row.forEach((d) => { const ch = d.area / cw; out.push({ ...d, x: rx, y: cy, w: cw, h: ch }); cy += ch; });
      rx += cw; rw -= cw;
    } else {
      const ch = s / rw;
      let cx = rx;
      row.forEach((d) => { const cw = d.area / ch; out.push({ ...d, x: cx, y: ry, w: cw, h: ch }); cx += cw; });
      ry += ch; rh -= ch;
    }
  }
  return out;
}

const tone = (g, neutral) => {
  if (g == null || Number.isNaN(g)) return 'eb-tm-flat';
  const k = Math.min(3, Math.floor(Math.abs(g) / 7.5));
  return `${g >= 0 ? (neutral ? 'eb-tm-n' : 'eb-tm-up') : (neutral ? 'eb-tm-m' : 'eb-tm-down')}${k}`;
};

export function Treemap({ d, i, flow, neutral, max = 40 }) {
  const [ref, W] = useWidth(720, 300);
  const [hover, setHover] = useState(null);
  const H = W < 560 ? 420 : 380;
  const sorted = [...d.chapters].filter((c) => (c.v[i] || 0) > 0).sort((a, b) => b.v[i] - a.v[i]);
  const head = sorted.slice(0, max).map((c) => ({ key: c.hs2, name: c.name, value: c.v[i], g: growth(c.v, i, d.periods), href: `#/${flow}/chapter/${c.hs2}` }));
  const tail = sorted.slice(max);
  if (tail.length) head.push({ key: 'rest', name: `${tail.length} other groups`, value: tail.reduce((s, c) => s + c.v[i], 0), g: null, href: `#/${flow}/chapter` });
  head.sort((a, b) => b.value - a.value);
  const cells = squarify(head, 0, 0, W, H);
  const total = d.total[i];
  const h = hover && cells.find((c) => c.key === hover);
  return (
    <div ref={ref} className="eb-tm">
      <svg width={W} height={H} role="img" aria-label={`${flow === 'exports' ? 'Exports' : 'Imports'} by product group, area by value`}>
        {cells.map((c) => {
          const share = (c.value / total) * 100;
          const big = c.w > 90 && c.h > 46;
          const mid = !big && c.w > 54 && c.h > 26;
          const label = c.name.length * 6.6 > c.w - 12 ? `${c.name.slice(0, Math.max(3, Math.floor((c.w - 16) / 6.6)))}…` : c.name;
          const t = tone(c.g, neutral);
          const ink = /[23]$/.test(t) ? ' eb-tm-light' : '';
          return (
            <a key={c.key} href={c.href} className={ink} onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(c.key)} onBlur={() => setHover(null)}>
              <rect x={c.x + 1} y={c.y + 1} width={Math.max(0, c.w - 2)} height={Math.max(0, c.h - 2)} rx="3" className={`eb-tm-cell ${t}${hover === c.key ? ' eb-tm-hot' : ''}`} />
              {big ? (
                <>
                  <text x={c.x + 8} y={c.y + 19} className="eb-tm-name">{label}</text>
                  <text x={c.x + 8} y={c.y + 37} className="eb-tm-val">{money(c.value)} · {share.toFixed(1)}%</text>
                  {c.g != null && !Number.isNaN(c.g) && c.h > 62 ? <text x={c.x + 8} y={c.y + 54} className="eb-tm-g">{c.g >= 0 ? '▲' : '▼'} {Math.abs(c.g).toFixed(1)}%</text> : null}
                </>
              ) : mid ? (
                <text x={c.x + 6} y={c.y + 17} className="eb-tm-small">{c.name.slice(0, Math.max(2, Math.floor((c.w - 10) / 6)))}{c.name.length * 6 > c.w - 10 ? '…' : ''}</text>
              ) : null}
              <title>{`${c.name}: ${money(c.value)} (${share.toFixed(1)}% of all ${flow})${c.g != null && !Number.isNaN(c.g) ? `, ${c.g >= 0 ? 'up' : 'down'} ${Math.abs(c.g).toFixed(1)}% on the year before` : ''}. Click to open.`}</title>
            </a>
          );
        })}
      </svg>
      <p className="eb-tm-read" aria-live="polite">
        {h ? <><strong>{h.name}</strong>: {money(h.value)}, {((h.value / total) * 100).toFixed(1)}% of all {flow}{h.g != null && !Number.isNaN(h.g) ? `, ${h.g >= 0 ? 'up' : 'down'} ${Math.abs(h.g).toFixed(1)}% on the year before` : ''}.</> : 'Point at a box for its figures; click to open the group.'}
      </p>
      <p className="eb-tm-key">
        <span><i className={neutral ? 'eb-tm-n2' : 'eb-tm-up2'} />{neutral ? 'Rising' : 'Growing'}</span>
        <span><i className={neutral ? 'eb-tm-m2' : 'eb-tm-down2'} />{neutral ? 'Falling' : 'Shrinking'}</span>
        <span><i className="eb-tm-flat" />No comparison (part year or first year)</span>
        <span className="eb-muted">Darker: larger change. Area: value.</span>
      </p>
    </div>
  );
}

// Rank of the largest partners in each full year: who climbed, who slipped.
export function RankChart({ d, flow, top = 10 }) {
  const [ref, W] = useWidth(720, 300);
  const [hover, setHover] = useState(null);
  const years = d.periods.filter((p) => !d.partial.includes(p) && !(d.missing || []).includes(p));
  if (years.length < 2) return null;
  const idx = years.map((y) => d.periods.indexOf(y));
  const real = d.countries.filter((c) => !/^(All other|Unspecified)/.test(c.name));
  const rankOf = idx.map((i) => {
    const order = [...real].sort((a, b) => (b.v[i] || 0) - (a.v[i] || 0));
    return new Map(order.map((c, k) => [c.id, k + 1]));
  });
  const last = rankOf.length - 1;
  const chosen = real.filter((c) => rankOf[last].get(c.id) <= top).sort((a, b) => rankOf[last].get(a.id) - rankOf[last].get(b.id));
  const CAP = top + 5;
  const narrow = W < 560;
  const M = { l: narrow ? 28 : 40, r: narrow ? 118 : 200, t: 18, b: 26 };
  const H = M.t + M.b + CAP * (narrow ? 22 : 26);
  const X = (k) => M.l + (k / (years.length - 1)) * (W - M.l - M.r);
  const Y = (r) => M.t + ((Math.min(r, CAP) - 1) / (CAP - 1)) * (H - M.t - M.b);
  return (
    <div ref={ref} className="eb-rank">
      <svg width={W} height={H} role="img" aria-label={`Rank of India's ${top} largest ${flow === 'exports' ? 'markets' : 'suppliers'} in each year`}>
        {years.map((y, k) => (
          <g key={y}>
            <line x1={X(k)} x2={X(k)} y1={M.t - 6} y2={H - M.b + 4} className="eb-grid" />
            <text x={X(k)} y={H - 6} textAnchor="middle" className="eb-tick">{y}</text>
          </g>
        ))}
        <text x={M.l - 8} y={Y(1) + 4} textAnchor="end" className="eb-tick">1</text>
        <text x={M.l - 8} y={Y(top) + 4} textAnchor="end" className="eb-tick">{top}</text>
        <text x={M.l - 8} y={Y(CAP) + 4} textAnchor="end" className="eb-tick">{CAP}+</text>
        {chosen.map((c, n) => {
          const pts = rankOf.map((m, k) => [X(k), Y(m.get(c.id) || CAP)]);
          const first = rankOf[0].get(c.id) || real.length;
          const now = rankOf[last].get(c.id);
          const moved = first - now;
          const on = hover == null || hover === c.id;
          return (
            <g key={c.id} className={`eb-rank-line eb-rank-c${n % 10}${on ? '' : ' eb-rank-dim'}`}
              onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
              <polyline points={pts.map((p) => p.join(',')).join(' ')} />
              {pts.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={k === last ? 4.5 : 3} />)}
              <a href={`#/${flow}/country/${c.id}`}>
                <text x={X(last) + 10} y={Y(now) + 4} className="eb-rank-name">
                  {c.name.length > (narrow ? 12 : 24) ? `${c.name.slice(0, narrow ? 11 : 23)}…` : c.name}
                  <tspan className={moved > 0 ? 'eb-rank-up' : moved < 0 ? 'eb-rank-down' : 'eb-rank-same'}>{moved > 0 ? ` ▲${moved}` : moved < 0 ? ` ▼${-moved}` : ' ='}</tspan>
                </text>
              </a>
              <title>{`${c.name}: rank ${first} in ${years[0]}, ${now} in ${years[last]}; ${money(c.v[idx[last]])} in ${years[last]}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
