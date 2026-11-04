const nf = (d) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

export function formatValue(value, decimals = 1) {
  if (value == null || Number.isNaN(Number(value))) return 'n/a';
  return nf(decimals).format(Number(value));
}

// Signed change with only the decimals it needs: +0.71, -1.22, +0.25
export function formatChange(change, unit = '') {
  if (change == null || Number.isNaN(Number(change))) return null;
  const c = Number(change);
  const body = Math.abs(Number(c.toFixed(2))).toString();
  const sign = c > 0 ? '+' : c < 0 ? '\u2212' : '';
  return `${sign}${body}${unit ? ` ${unit}` : ''}`;
}

// 'good' | 'bad' | 'neutral' depending on direction and whether up is good.
export function tone(change, upIsGood) {
  if (change == null || Number(change) === 0 || upIsGood == null) return 'neutral';
  return (Number(change) > 0) === upIsGood ? 'good' : 'bad';
}

export function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Round axis ticks: returns [min, max, step] covering the data.
export function niceScale(lo, hi, count = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step, step];
}
