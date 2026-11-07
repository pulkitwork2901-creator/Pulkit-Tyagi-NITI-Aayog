import { useEffect, useRef, useState } from 'react';

// Smooth line through points without overshoot (monotone cubic, Fritsch-Carlson):
// curves never invent a peak or dip that is not in the data.
export function smoothPath(xy) {
  const n = xy.length;
  if (n === 0) return '';
  if (n < 3) return xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(xy[i + 1][0] - xy[i][0]);
    m.push(dx[i] === 0 ? 0 : (xy[i + 1][1] - xy[i][1]) / dx[i]);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i += 1) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += `C${(xy[i][0] + h).toFixed(1)},${(xy[i][1] + t[i] * h).toFixed(1)} ${(xy[i + 1][0] - h).toFixed(1)},${(xy[i + 1][1] - t[i + 1] * h).toFixed(1)} ${xy[i + 1][0].toFixed(1)},${xy[i + 1][1].toFixed(1)}`;
  }
  return d;
}

export function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// Counts a figure up from zero when it first appears (about 0.7 s, easing out).
// Viewers who ask for reduced motion see the final figure straight away.
export function useCountUp(target, ms = 700) {
  const [val, setVal] = useState(() => (prefersReducedMotion() ? target : 0));
  const raf = useRef(0);
  useEffect(() => {
    if (target == null || !Number.isFinite(target) || prefersReducedMotion()) { setVal(target); return undefined; }
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      setVal(target * (1 - (1 - p) ** 3));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return val;
}
