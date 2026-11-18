import { useMemo, useState } from 'react';
import useWidth from '../useWidth.js';
import { formatValue, niceScale } from '../format.js';
import { useTradeFile } from '../trade/tradeKit.jsx';
import { CsvButton, useHi, scrollToId } from './analysisCharts.jsx';
import { COUNTRY_HI, CHAPTER_HI } from './dependenceText.js';

// Import dependence (#/dependence): where India relies on one supplier country,
// from public/data/trade/dependence.json (scripts/build_dependence.py, built on
// DGCI&S HS 8-digit imports by country of consignment). English and Hindi.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const perLabel = (p, hi) => (hi ? MON.reduce((s, m, i) => s.replace(m, MON_HI[i]), p) : p);
const bn = (mn, d) => (mn == null ? '–' : formatValue(mn / 1000, d ?? (Math.abs(mn) >= 10000 ? 1 : 2)));
const cn = (n, hi) => (n == null ? (hi ? 'अन्य सभी' : 'All others') : hi ? COUNTRY_HI[n] || n : n);
const chn = (c, hi) => (hi ? CHAPTER_HI[c] || c : c);
const pts = (v) => { if (v == null) return '–'; const n = Math.round(v); return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatValue(Math.abs(n), 0)}`; };
const MIXCLS = ['dp-c0', 'dp-c1', 'dp-c2', 'dp-c3', 'dp-c4', 'dp-cx'];

// Change in how concentrated supply is: the main supplier's share now against
// the main supplier's share in the base year (which may be another country).
// Left out when the code changed in between or the base year was too small
// (under US$ 100 million) for shares to mean much.
function shareChange(p, iB, iL, base, latest) {
  if (p.share[iL] == null || p.share[iB] == null || (p.v[iB] || 0) < 100) return null;
  if ((p.breaks || []).some((b) => b > base && b <= latest)) return null;
  return p.share[iL] - p.share[iB];
}

// ------------------------------------------------------------ dependent imports by year

function TrendChart({ d }) {
  const hi = useHi();
  const [ref, W] = useWidth(560, 260);
  const H = 240;
  const M = { l: 40, r: 10, t: 22, b: 30 };
  const rows = d.summary.map((s, i) => (s ? { ...s, partial: d.partial.includes(d.periods[i]) } : null)).filter(Boolean);
  const [, top, step] = niceScale(0, Math.max(...rows.map((r) => r.dependent_value / 1000)), 4);
  const bw = (W - M.l - M.r) / rows.length;
  const Y = (v) => M.t + (1 - v / top) * (H - M.t - M.b);
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return (
    <div ref={ref} className="dp-trend">
      <CsvButton name="import-dependence-by-year" head={['period', 'products over 50% from one country', 'their imports (US$ mn)', 'share of all imports (%)', 'of which China is main supplier: products', 'of which China: imports (US$ mn)', 'products covered (US$ mn)', 'all imports (US$ mn)']}
        rows={rows.map((r) => [r.period, r.dependent_count, r.dependent_value, r.dependent_share_of_imports, r.china_count, r.china_value, r.covered, r.total])} />
      <p className="eb-an-legend">
        <span><i className="eb-an-sw-box dp-china" />{hi ? 'मुख्य आपूर्तिकर्ता चीन' : 'Main supplier China'}</span>
        <span><i className="eb-an-sw-box dp-other" />{hi ? 'मुख्य आपूर्तिकर्ता कोई अन्य देश' : 'Main supplier another country'}</span>
      </p>
      <svg width={W} height={H} role="img" aria-label={hi ? 'हर वर्ष उन उत्पादों का आयात जिनमें एक देश आधे से अधिक आपूर्ति करता है' : 'Imports of products where one country supplies more than half, each year'}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} className={t === 0 ? 'eb-an-zero' : 'eb-an-grid'} />
            <text x={M.l - 5} y={Y(t) + 4} className="eb-an-axis" textAnchor="end">{formatValue(t, 0)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = M.l + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const tot = r.dependent_value / 1000;
          const ch = r.china_value / 1000;
          return (
            <g key={r.period} className={r.partial ? 'dp-partial' : undefined}>
              <rect x={x} y={Y(tot)} width={w} height={Y(ch) - Y(tot)} className="dp-other" />
              <rect x={x} y={Y(ch)} width={w} height={Y(0) - Y(ch)} className="dp-china" />
              <text x={x + w / 2} y={Y(tot) - 6} textAnchor="middle" className="eb-an-axis eb-an-val">{formatValue(tot, 0)}</text>
              <text x={x + w / 2} y={H - 14} textAnchor="middle" className="eb-an-axis">{perLabel(r.period, hi)}</text>
              <text x={x + w / 2} y={H - 2} textAnchor="middle" className="eb-an-axis">{hi ? `${r.dependent_count} उत्पाद` : `${r.dependent_count} products`}</text>
              <title>{hi
                ? `${perLabel(r.period, hi)}: ${r.dependent_count} उत्पाद, US$ ${bn(r.dependent_value)} अरब (कुल आयात का ${r.dependent_share_of_imports}%); इनमें ${r.china_count} उत्पादों का मुख्य आपूर्तिकर्ता चीन, US$ ${bn(r.china_value)} अरब`
                : `${r.period}: ${r.dependent_count} products, US$ ${bn(r.dependent_value)} bn (${r.dependent_share_of_imports}% of all imports); China main supplier for ${r.china_count}, US$ ${bn(r.china_value)} bn`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ main suppliers

function SupplierChart({ d, onPick }) {
  const hi = useHi();
  const [ref, W] = useWidth(520, 260);
  const rows = d.suppliers.slice(0, 10);
  const narrow = W < 520;
  const labelW = narrow ? 0 : 170;
  const rowH = narrow ? 46 : 28;
  const M = { l: labelW + 6, r: 110, t: 4, b: 6 };
  const H = M.t + rows.length * rowH + M.b;
  const max = Math.max(...rows.map((r) => r.value));
  const X = (v) => M.l + (v / max) * (W - M.l - M.r);
  return (
    <div ref={ref} className="dp-suppliers">
      <CsvButton name={`main-suppliers-${d.latest_full}`} head={['main supplier', 'products over 50%', `imports ${d.latest_full} (US$ mn)`, 'HS 8-digit codes']}
        rows={d.suppliers.map((s) => [s.name, s.count, s.value, s.products.join(' ')])} />
      <svg width={W} height={H} role="img" aria-label={hi ? 'मुख्य आपूर्तिकर्ता देश' : 'Main supplier countries'}>
        {rows.map((r, i) => {
          const y0 = M.t + i * rowH + (narrow ? 30 : rowH / 2);
          return (
            <g key={r.name} className="dp-sup" onClick={() => onPick(r.name)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r.name); } }}>
              <text x={narrow ? M.l : 4} y={narrow ? y0 - 14 : y0 + 4} className="eb-an-rowlabel">{cn(r.name, hi)}</text>
              <rect x={M.l} y={y0 - 7} width={Math.max(2, X(r.value) - M.l)} height="14" rx="2" className={r.name === 'China' ? 'dp-china' : 'dp-other'} />
              <text x={X(r.value) + 6} y={y0 + 4} className="eb-an-axis eb-an-val">US$ {bn(r.value)} {hi ? 'अरब' : 'bn'} · {r.count}</text>
              <title>{hi ? `${cn(r.name, hi)}: ${r.count} उत्पाद, US$ ${bn(r.value)} अरब। सूची में देखने के लिए क्लिक करें।` : `${r.name}: ${r.count} products, US$ ${bn(r.value)} bn. Click to list them below.`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ value chains

function ChainCard({ c, d }) {
  const hi = useHi();
  const [ref, W] = useWidth(300, 220);
  const H = 170;
  const M = { l: 30, r: 6, t: 14, b: 22 };
  const idx = d.periods.map((p, i) => i).filter((i) => d.periods[i] >= d.first_full && !d.missing.includes(d.periods[i]));
  const max = Math.max(...idx.flatMap((i) => [c.imports[i], c.exports[i]])) / 1000;
  const [, top, step] = niceScale(0, max, 3);
  const bw = (W - M.l - M.r) / idx.length;
  const Y = (v) => M.t + (1 - v / top) * (H - M.t - M.b);
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  const li = d.periods.indexOf(d.latest_full);
  const ratio = c.imports[li] ? c.exports[li] / c.imports[li] : null;
  return (
    <section className="eb-mc eb-an-card dp-chain">
      <h3 className="eb-mc-title">{hi ? c.name_hi : c.name}</h3>
      <CsvButton name={`value-chain-${c.id}`} head={['period', `imports: ${c.imports_label} (US$ mn)`, `exports: ${c.exports_label} (US$ mn)`, 'China share of these imports (%)']}
        rows={d.periods.map((p, i) => [p, c.imports[i], c.exports[i], c.china_share_of_imports[i]])} />
      <p className="eb-an-legend">
        <span><i className="eb-an-sw-box dp-imp" />{hi ? `आयात: ${c.imports_label_hi}` : `Imports: ${c.imports_label}`}</span>
        <span><i className="eb-an-sw-box dp-exp" />{hi ? `निर्यात: ${c.exports_label_hi}` : `Exports: ${c.exports_label}`}</span>
      </p>
      <div ref={ref}>
        <svg width={W} height={H} role="img" aria-label={hi ? `${c.name_hi}: आयात और निर्यात` : `${c.name}: imports and exports`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} className={t === 0 ? 'eb-an-zero' : 'eb-an-grid'} />
              <text x={M.l - 4} y={Y(t) + 4} className="eb-an-axis" textAnchor="end">{formatValue(t, step < 1 ? 1 : 0)}</text>
            </g>
          ))}
          {idx.map((i, k) => {
            const x = M.l + k * bw + bw * 0.14;
            const w = bw * 0.34;
            const part = d.partial.includes(d.periods[i]);
            return (
              <g key={i} className={part ? 'dp-partial' : undefined}>
                <rect x={x} y={Y(c.imports[i] / 1000)} width={w} height={Y(0) - Y(c.imports[i] / 1000)} className="dp-imp" />
                <rect x={x + w + 2} y={Y(c.exports[i] / 1000)} width={w} height={Y(0) - Y(c.exports[i] / 1000)} className="dp-exp" />
                <text x={x + w} y={H - 6} textAnchor="middle" className="eb-an-axis">{part ? `${d.periods[i].slice(0, 4)}*` : d.periods[i]}</text>
                <title>{`${perLabel(d.periods[i], hi)}: ${hi ? 'आयात' : 'imports'} US$ ${bn(c.imports[i])} ${hi ? 'अरब' : 'bn'}, ${hi ? 'निर्यात' : 'exports'} US$ ${bn(c.exports[i])} ${hi ? 'अरब' : 'bn'}; ${hi ? 'चीन का हिस्सा' : 'China share'} ${c.china_share_of_imports[i] ?? '–'}%`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="eb-mc-note">
        {hi
          ? <>{d.latest_full} में आयात US$ {bn(c.imports[li])} अरब, निर्यात US$ {bn(c.exports[li])} अरब{ratio != null ? ` (आयात के हर डॉलर पर ${formatValue(ratio, 1)} डॉलर निर्यात)` : ''}। इन आयातों में चीन का हिस्सा: <b>{c.china_share_of_imports[li] ?? '–'}%</b>। * {perLabel(d.partial[0] || '', hi)}, अधूरा वर्ष।</>
          : <>In {d.latest_full}, imports US$ {bn(c.imports[li])} bn, exports US$ {bn(c.exports[li])} bn{ratio != null ? ` (US$ ${formatValue(ratio, 1)} of exports for every dollar imported)` : ''}. China's share of these imports: <b>{c.china_share_of_imports[li] ?? '–'}%</b>. * {d.partial[0]}, part year.</>}
      </p>
    </section>
  );
}

// ------------------------------------------------------------ supplier mix of one product

function MixChart({ p, d }) {
  const hi = useHi();
  const idx = d.periods.map((x, i) => i).filter((i) => p.v[i]);
  return (
    <div className="dp-mix">
      <p className="eb-an-legend">
        {p.mix.map((m, k) => <span key={m.name ?? 'other'}><i className={`eb-an-sw-box ${MIXCLS[m.name == null ? 5 : k]}`} />{cn(m.name, hi)}</span>)}
      </p>
      {idx.map((i) => (
        <div key={i} className="dp-mixrow">
          <span className="dp-mixlab">{perLabel(d.periods[i], hi)}</span>
          <span className="dp-mixbar" role="img" aria-label={`${perLabel(d.periods[i], hi)}: ${p.mix.map((m) => `${cn(m.name, hi)} ${formatValue(((m.v[i] || 0) / p.v[i]) * 100, 0)}%`).join(', ')}`}>
            {p.mix.map((m, k) => {
              const s = ((m.v[i] || 0) / p.v[i]) * 100;
              return s > 0 ? <i key={m.name ?? 'other'} className={MIXCLS[m.name == null ? 5 : k]} style={{ width: `${s}%` }} title={`${cn(m.name, hi)}: ${formatValue(s, 1)}% (US$ ${bn(m.v[i])} ${hi ? 'अरब' : 'bn'})`} /> : null;
            })}
          </span>
          <span className="dp-mixval">US$ {bn(p.v[i])}</span>
        </div>
      ))}
      {p.breaks?.length ? <p className="eb-mc-note">{hi ? `इस उत्पाद का कोड ${p.breaks.join(', ')} में बदला, इसलिए उस वर्ष की तुलना पूरी तरह समान नहीं है।` : `This product's tariff code changed in ${p.breaks.join(', ')}, so comparisons across that year are not exactly like for like.`}</p> : null}
      {p.exports ? <p className="eb-mc-note">{hi ? `भारत इसी कोड का निर्यात भी करता है: ${d.latest_full} में US$ ${bn(p.exports[d.periods.indexOf(d.latest_full)])} अरब।` : `India also exports this code: US$ ${bn(p.exports[d.periods.indexOf(d.latest_full)])} bn in ${d.latest_full}.`}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------ product explorer

function Explorer({ d, supplier, setSupplier }) {
  const hi = useHi();
  const [chapter, setChapter] = useState('');
  const [min, setMin] = useState(50);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('value');
  const [open, setOpen] = useState(null);
  const [limit, setLimit] = useState(25);
  const iL = d.periods.indexOf(d.latest_full);
  const base = d.periods.includes('2022') ? '2022' : d.first_full;
  const iB = d.periods.indexOf(base);
  const rows = useMemo(() => d.products
    .filter((p) => p.v[iL])
    .map((p) => ({ ...p, change: shareChange(p, iB, iL, base, d.latest_full) }))
    .filter((p) => (p.share[iL] ?? 0) > min || (min === 0))
    .filter((p) => !supplier || p.top[iL] === supplier)
    .filter((p) => !chapter || p.chapter === chapter)
    .filter((p) => !q || `${p.desc} ${p.hs8}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'share' ? (b.share[iL] ?? 0) - (a.share[iL] ?? 0)
      : sort === 'change' ? (b.change ?? -999) - (a.change ?? -999) : (b.v[iL] ?? 0) - (a.v[iL] ?? 0))), [d, iL, iB, base, min, supplier, chapter, q, sort]);
  const chapters = [...new Set(d.products.map((p) => p.chapter))].sort();
  const suppliers = d.suppliers.map((s) => s.name);
  const total = rows.reduce((s, p) => s + (p.v[iL] || 0), 0);
  const csv = rows.map((p) => [p.hs8, p.desc, p.chapter, p.v[iL], p.top[iL], p.share[iL], p.hhi[iL], p.n[iL], p.change == null ? '' : p.change.toFixed(1), p.exports ? p.exports[iL] : '']);
  return (
    <div className="dp-explorer">
      <CsvButton name="import-dependence-products" head={['HS 8-digit', 'product', 'sector', `imports ${d.latest_full} (US$ mn)`, 'main supplier', 'main supplier share (%)', 'concentration (HHI, 0-10000)', 'supplier countries', `change in main supplier share since ${base} (points; main supplier may differ)`, `India's exports of the same code ${d.latest_full} (US$ mn)`]} rows={csv} />
      <div className="dp-filters">
        <div className="eb-range" role="group" aria-label={hi ? 'एक देश का न्यूनतम हिस्सा' : 'Minimum share from one country'}>
          {[[0, hi ? 'सभी' : 'All'], [50, '> 50%'], [75, '> 75%'], [90, '> 90%']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={min === v} onClick={() => { setMin(v); setLimit(25); }}>{l}</button>
          ))}
        </div>
        <label>
          <span>{hi ? 'मुख्य आपूर्तिकर्ता' : 'Main supplier'}</span>
          <select value={supplier} onChange={(e) => { setSupplier(e.target.value); setLimit(25); }}>
            <option value="">{hi ? 'कोई भी' : 'Any'}</option>
            {suppliers.map((s) => <option key={s} value={s}>{cn(s, hi)}</option>)}
          </select>
        </label>
        <label>
          <span>{hi ? 'क्षेत्र' : 'Sector'}</span>
          <select value={chapter} onChange={(e) => { setChapter(e.target.value); setLimit(25); }}>
            <option value="">{hi ? 'सभी' : 'All'}</option>
            {chapters.map((c) => <option key={c} value={c}>{chn(c, hi)}</option>)}
          </select>
        </label>
        <label>
          <span>{hi ? 'क्रम' : 'Sort by'}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="value">{hi ? 'आयात मूल्य' : 'Import value'}</option>
            <option value="share">{hi ? 'मुख्य आपूर्तिकर्ता का हिस्सा' : 'Main supplier share'}</option>
            <option value="change">{hi ? `${base} से मुख्य हिस्से में वृद्धि` : `Rise in main share since ${base}`}</option>
          </select>
        </label>
        <label className="dp-search">
          <span>{hi ? 'खोजें (अंग्रेज़ी नाम या HS कोड)' : 'Search (name or HS code)'}</span>
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(25); }} placeholder={hi ? 'जैसे lithium, 8541' : 'e.g. lithium, 8541'} />
        </label>
      </div>
      <p className="eb-mc-note">
        {hi
          ? `${rows.length} उत्पाद, ${d.latest_full} में कुल आयात US$ ${bn(total)} अरब। किसी पंक्ति पर क्लिक करें और वर्षवार आपूर्तिकर्ता देखें।`
          : `${rows.length} products, US$ ${bn(total)} bn of imports in ${d.latest_full}. Click a row to see its suppliers year by year.`}
      </p>
      <div className="eb-tablewrap">
        <table className="eb-table dp-table">
          <caption className="eb-sr">{hi ? 'आयातित उत्पाद और उनके मुख्य आपूर्तिकर्ता' : 'Imported products and their main suppliers'}</caption>
          <thead><tr>
            <th scope="col">{hi ? 'उत्पाद' : 'Product'}</th>
            <th scope="col" className="eb-num">{hi ? `आयात ${d.latest_full}, US$ अरब` : `Imports ${d.latest_full}, US$ bn`}</th>
            <th scope="col">{hi ? 'मुख्य आपूर्तिकर्ता' : 'Main supplier'}</th>
            <th scope="col" className="eb-num">{hi ? 'हिस्सा' : 'Share'}</th>
            <th scope="col" className="eb-num eb-an-modelcol" title={hi ? 'मुख्य आपूर्तिकर्ता के हिस्से में बदलाव; मुख्य आपूर्तिकर्ता कोई दूसरा देश भी हो सकता है' : "Change in the main supplier's share; the main supplier may have changed"}>{hi ? `${base} से बदलाव, अंक` : `Change since ${base}, points`}</th>
            <th scope="col" className="eb-num eb-an-modelcol">{hi ? 'आपूर्तिकर्ता देश' : 'Supplier countries'}</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, limit).map((p) => (
              <FragmentRow key={p.hs8} p={p} d={d} iL={iL} open={open === p.hs8} onToggle={() => setOpen(open === p.hs8 ? null : p.hs8)} hi={hi} />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="eb-an-reset dp-more" onClick={() => setLimit(limit + 50)}>
          {hi ? `और दिखाएँ (${rows.length - limit} बाकी)` : `Show more (${rows.length - limit} more)`}
        </button>
      )}
    </div>
  );
}

function FragmentRow({ p, d, iL, open, onToggle, hi }) {
  const s = p.share[iL];
  return (
    <>
      <tr className={`dp-row${open ? ' dp-open' : ''}`} onClick={onToggle} tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}>
        <th scope="row"><span className="dp-desc">{p.desc}</span><span className="dp-code">HS {p.hs8} · {chn(p.chapter, hi)}</span></th>
        <td className="eb-num">{bn(p.v[iL])}</td>
        <td className={p.top[iL] === 'China' ? 'dp-tchina' : undefined}>{cn(p.top[iL], hi)}</td>
        <td className="eb-num"><span className="dp-sharebar"><i style={{ width: `${s}%` }} /></span>{formatValue(s, 0)}%</td>
        <td className={`eb-num eb-an-modelcol${p.change > 0.5 ? ' eb-bad' : p.change < -0.5 ? ' eb-good' : ''}`}>{pts(p.change)}</td>
        <td className="eb-num eb-an-modelcol">{p.n[iL] ?? '–'}</td>
      </tr>
      {open && (
        <tr className="dp-detail"><td colSpan={6}><MixChart p={p} d={d} /></td></tr>
      )}
    </>
  );
}

// ------------------------------------------------------------ page

export default function DependencePage({ base }) {
  const hi = useHi();
  const { data: d, error } = useTradeFile(`${base}dependence.json`);
  const [supplier, setSupplier] = useState('');
  if (error) return <div className="eb-dash"><p className="eb-empty">{hi ? `आंकड़े लोड नहीं हो सके (${error})।` : `The data could not be loaded (${error}).`}</p></div>;
  if (!d) return <div className="eb-dash" aria-busy="true"><div className="eb-skel-hero" /><div className="eb-skel-panel" /></div>;
  const iL = d.periods.indexOf(d.latest_full);
  const baseY = d.periods.includes('2022') ? '2022' : d.first_full;
  const iB = d.periods.indexOf(baseY);
  const S = d.summary[iL];
  const B = d.summary[iB];
  const china = d.suppliers.find((s) => s.name === 'China');
  const rising = d.products
    .map((p) => ({ ...p, change: shareChange(p, iB, iL, baseY, d.latest_full) }))
    // Chapter 98 (whole-project imports) is a customs category, not a product.
    .filter((p) => p.change != null && p.change >= 10 && (p.v[iL] || 0) >= 500 && (p.share[iL] || 0) > d.threshold && !p.hs8.startsWith('98'))
    .sort((a, b) => b.change - a.change).slice(0, 10);
  const pick = (name) => { setSupplier(name); setTimeout(() => document.getElementById('dp-explorer-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); };
  const tiles = [
    { id: 'dp-trend-h', label: hi ? `एक देश पर आधे से अधिक निर्भर उत्पाद, ${d.latest_full}` : `Products where one country supplies over half, ${d.latest_full}`,
      value: hi ? `${d.coverage.products} में से ${S.dependent_count}` : `${S.dependent_count} of ${d.coverage.products}`,
      sub: hi ? `${baseY} में ${B.dependent_count}` : `${B.dependent_count} in ${baseY}` },
    { id: 'dp-trend-h', label: hi ? 'इन उत्पादों का आयात' : 'Imports of these products', value: `US$ ${bn(S.dependent_value, 0)}`, unit: hi ? 'अरब' : 'bn',
      sub: hi ? `भारत के कुल आयात का ${S.dependent_share_of_imports}%` : `${S.dependent_share_of_imports}% of all India's imports` },
    china && { id: 'dp-sup-h', label: hi ? 'जिनका मुख्य आपूर्तिकर्ता चीन है' : 'Of which China is the main supplier', value: hi ? `${china.count} उत्पाद` : `${china.count} products`,
      sub: hi ? `US$ ${bn(china.value)} अरब; ${baseY} में ${B.china_count} उत्पाद, US$ ${bn(B.china_value)} अरब` : `US$ ${bn(china.value)} bn; ${B.china_count} products, US$ ${bn(B.china_value)} bn in ${baseY}` },
    rising.length && { id: 'dp-rise-h', label: hi ? 'जहाँ निर्भरता तेज़ी से बढ़ी' : 'Where dependence rose fastest', value: rising[0].desc.length > 26 ? `${rising[0].desc.slice(0, 24)}…` : rising[0].desc,
      sub: hi ? `मुख्य आपूर्तिकर्ता (${cn(rising[0].top[iL], hi)}) का हिस्सा ${baseY} के ${formatValue(rising[0].share[iB], 0)}% से अब ${formatValue(rising[0].share[iL], 0)}%` : `Main supplier (${rising[0].top[iL]}) share ${formatValue(rising[0].share[iB], 0)}% in ${baseY}, now ${formatValue(rising[0].share[iL], 0)}%` },
  ].filter(Boolean);
  const topCh = d.chapters.slice(0, 3);
  return (
    <>
      <nav className="eb-crumbs" aria-label={hi ? 'मार्ग' : 'Breadcrumb'}><a href="#/">{hi ? 'डैशबोर्ड' : 'Dashboard'}</a><span aria-hidden="true">/</span><span>{hi ? 'आयात निर्भरता' : 'Import dependence'}</span></nav>
      <header className="eb-pagehead">
        <h1>{hi ? 'आयात निर्भरता: भारत कहाँ एक देश पर निर्भर है' : 'Import dependence: where India relies on one country'}</h1>
        <ul className="eb-an-strip" aria-label={hi ? 'मुख्य निष्कर्ष' : 'Main findings'}>
          {tiles.map((t) => (
            <li key={t.label} className="eb-an-kpi">
              <a href={`#${t.id}`} onClick={(e) => scrollToId(e, t.id)}>
                <span className="eb-an-kpi-label">{t.label}</span>
                <span className="eb-an-kpi-value">{t.value}{t.unit ? <span className="eb-an-kpi-unit">{t.unit}</span> : null}</span>
                <span className="eb-an-kpi-sub">{t.sub}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="eb-themebrief">
          <p className="eb-themebrief-kicker">{hi ? 'सार' : 'In short'}</p>
          <p>{hi
            ? `${d.latest_full} में भारत ने US$ ${bn(S.total, 0)} अरब का सामान आयात किया। इसमें से US$ ${bn(S.dependent_value, 0)} अरब (${S.dependent_share_of_imports}%) ऐसे ${S.dependent_count} उत्पादों का था जिनकी आधे से अधिक आपूर्ति एक ही देश से हुई। ${china ? `इनमें से ${china.count} का मुख्य आपूर्तिकर्ता चीन है (US$ ${bn(china.value)} अरब), जो ${baseY} के ${B.china_count} उत्पादों से अधिक है।` : ''} सबसे अधिक निर्भरता ${topCh.map((c) => chn(c.chapter, hi)).join(', ')} में है।`
            : `In ${d.latest_full} India imported US$ ${bn(S.total, 0)} bn of goods. Of that, US$ ${bn(S.dependent_value, 0)} bn (${S.dependent_share_of_imports}%) was in ${S.dependent_count} products where a single country supplied more than half. ${china ? `China is the main supplier of ${china.count} of them (US$ ${bn(china.value)} bn), up from ${B.china_count} products in ${baseY}.` : ''} The largest concentrations are in ${topCh.map((c) => c.chapter.toLowerCase()).join(', ')}.`}</p>
          <p>{hi
            ? 'एक मुख्य आपूर्तिकर्ता होना अपने आप में जोखिम नहीं है: कच्चा तेल कई देशों से खरीदा जा सकता है, जबकि कुछ रसायन या इलेक्ट्रॉनिक पुर्ज़े बहुत कम देश बनाते हैं। यह पृष्ठ दिखाता है कि आपूर्ति कहाँ केंद्रित है; विकल्प कितने हैं, यह हर उत्पाद के लिए अलग से देखना होगा।'
            : 'One main supplier is not by itself a risk: crude oil can be bought from many countries, while some chemicals and electronic parts are made in very few. This page shows where supply is concentrated; how easily it could be replaced has to be judged product by product.'}</p>
        </div>
      </header>

      <section className="eb-section" aria-labelledby="dp-trend-h">
        <h2 id="dp-trend-h">{hi ? 'वर्षवार निर्भरता' : 'Dependence year by year'}</h2>
        <section className="eb-mc eb-an-card">
          <h3 className="eb-mc-title">{hi ? 'जिन उत्पादों में एक देश आधे से अधिक आपूर्ति करता है, उनका आयात (US$ अरब)' : 'Imports of products where one country supplies more than half (US$ bn)'}</h3>
          <p className="eb-mc-note">{hi
            ? `बार के ऊपर की संख्या: आयात US$ अरब में; नीचे: उत्पादों की संख्या। ${d.partial.map((p) => perLabel(p, hi)).join(', ')} अधूरा वर्ष है। भारत के 8-अंकीय कोड 2022 में बदले, इसलिए 2021 की तुलना उत्पाद दर उत्पाद पूरी तरह समान नहीं है।`
            : `Figure above each bar: imports in US$ bn; below: number of products. ${d.partial.join(', ')} is a part year. India's 8-digit codes changed in 2022, so 2021 is not exactly comparable product by product.`}</p>
          <TrendChart d={d} />
        </section>
      </section>

      <section className="eb-section" aria-labelledby="dp-sup-h">
        <h2 id="dp-sup-h">{hi ? `मुख्य आपूर्तिकर्ता, ${d.latest_full}` : `Main suppliers, ${d.latest_full}`}</h2>
        <section className="eb-mc eb-an-card">
          <h3 className="eb-mc-title">{hi ? 'जिन उत्पादों में ये देश आधे से अधिक आपूर्ति करते हैं' : 'Products where each country supplies more than half'}</h3>
          <p className="eb-mc-note">{hi ? 'बार: उन उत्पादों का आयात मूल्य; संख्या: उत्पादों की गिनती। किसी देश पर क्लिक करें, नीचे की सूची उसी के उत्पाद दिखाएगी।' : 'Bar: imports of those products; number: how many products. Click a country to list its products below.'}</p>
          <SupplierChart d={d} onPick={pick} />
        </section>
      </section>

      <section className="eb-section" aria-labelledby="dp-chain-h">
        <h2 id="dp-chain-h">{hi ? 'आयातित पुर्ज़े, निर्यातित उत्पाद' : 'Imported inputs, exported products'}</h2>
        <p className="eb-ru-lead">{hi
          ? 'तीन क्षेत्र जहाँ भारत कच्चा माल या पुर्ज़े आयात करता है और तैयार उत्पाद निर्यात करता है। आयात और निर्यात की तुलना दिखाती है कि मूल्य कितना भारत में जुड़ रहा है, और चीन का हिस्सा दिखाता है कि आपूर्ति कितनी केंद्रित है।'
          : 'Three industries where India imports inputs and exports the finished product. Imports against exports show how much value is being added in India, and China\'s share shows how concentrated the supply of inputs is.'}</p>
        <div className="dp-chains">{d.chains.map((c) => <ChainCard key={c.id} c={c} d={d} />)}</div>
      </section>

      {rising.length ? (
        <section className="eb-section" aria-labelledby="dp-rise-h">
          <h2 id="dp-rise-h">{hi ? `जहाँ ${baseY} से निर्भरता सबसे तेज़ बढ़ी` : `Where dependence has risen most since ${baseY}`}</h2>
          <p className="eb-ru-lead">{hi
            ? `${d.latest_full} में US$ 0.5 अरब से अधिक आयात वाले उत्पाद, जहाँ मुख्य आपूर्तिकर्ता का हिस्सा ${baseY} से कम से कम 10 अंक बढ़ा (मुख्य आपूर्तिकर्ता कोई दूसरा देश भी हो सकता है)। जिन उत्पादों का कोड इस बीच बदला या ${baseY} में आयात US$ 10 करोड़ से कम था, वे शामिल नहीं हैं।`
            : `Products with more than US$ 0.5 bn of imports in ${d.latest_full} where the main supplier's share has risen by at least 10 points since ${baseY} (the main supplier may have changed). Products whose code changed in between, or with under US$ 100 million of imports in ${baseY}, are left out.`}</p>
          <div className="eb-tablewrap">
            <table className="eb-table dp-table">
              <caption className="eb-sr">{hi ? 'बढ़ती निर्भरता' : 'Rising dependence'}</caption>
              <thead><tr>
                <th scope="col">{hi ? 'उत्पाद' : 'Product'}</th>
                <th scope="col">{hi ? `मुख्य आपूर्तिकर्ता, ${baseY}` : `Main supplier, ${baseY}`}</th>
                <th scope="col">{hi ? `मुख्य आपूर्तिकर्ता, ${d.latest_full}` : `Main supplier, ${d.latest_full}`}</th>
                <th scope="col" className="eb-num">{hi ? 'आयात, US$ अरब' : 'Imports, US$ bn'}</th>
              </tr></thead>
              <tbody>
                {rising.map((p) => (
                  <tr key={p.hs8}>
                    <th scope="row"><span className="dp-desc">{p.desc}</span><span className="dp-code">HS {p.hs8}</span></th>
                    <td className="eb-muted">{cn(p.top[iB], hi)} {formatValue(p.share[iB], 0)}%</td>
                    <td className={p.top[iL] === 'China' ? 'dp-tchina' : undefined}>{cn(p.top[iL], hi)} <b>{formatValue(p.share[iL], 0)}%</b></td>
                    <td className="eb-num">{bn(p.v[iL])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="eb-section" aria-labelledby="dp-explorer-h">
        <h2 id="dp-explorer-h">{hi ? 'हर उत्पाद देखें' : 'Explore every product'}</h2>
        <section className="eb-mc eb-an-card">
          <Explorer d={d} supplier={supplier} setSupplier={setSupplier} />
        </section>
      </section>

      <section className="eb-section" aria-labelledby="dp-m-h">
        <h2 id="dp-m-h">{hi ? 'पद्धति और सीमाएँ' : 'Method and limits'}</h2>
        <dl className="eb-facts">
          <div><dt>{hi ? 'स्रोत' : 'Source'}</dt><dd>{hi
            ? 'DGCI&S, वाणिज्य और उद्योग मंत्रालय: आयात डेटा बैंक, 8-अंकीय HS कोड और प्रेषक देश के अनुसार, कैलेंडर वर्ष, US$। उत्पादों के नाम DGCI&S के अंग्रेज़ी विवरण में हैं।'
            : 'DGCI&S, Ministry of Commerce and Industry: import data bank, HS 8-digit by country of consignment, calendar years, US$.'}</dd></div>
          <div><dt>{hi ? 'कवरेज' : 'Coverage'}</dt><dd>{hi
            ? (d.coverage.mode === 'all' ? 'हर आयातित उत्पाद।' : `भारत के ${d.coverage.products} सबसे बड़े आयातित उत्पाद, ${d.latest_full} में कुल आयात का ${formatValue((S.covered / S.total) * 100, 0)}%। छोटे उत्पाद (कुछ विशेष रसायन और खनिज भी) अभी शामिल नहीं हैं; DGCI&S की पूरी फ़ाइलें संसाधित होने पर यह पृष्ठ अपने-आप हर उत्पाद को शामिल कर लेगा।`)
            : (d.coverage.mode === 'all' ? 'Every imported product.' : `India's ${d.coverage.products} largest imported products, ${formatValue((S.covered / S.total) * 100, 0)}% of all imports in ${d.latest_full}. Smaller products (including some speciality chemicals and minerals) are not yet included; when the full DGCI&S files are processed, the page covers every product automatically.`)}</dd></div>
          <div><dt>{hi ? 'प्रेषक देश' : 'Country of consignment'}</dt><dd>{hi
            ? 'DGCI&S उस देश को दर्ज करता है जहाँ से माल भेजा गया, जो हमेशा वह देश नहीं होता जहाँ वह बना। सिंगापुर, हांगकांग या संयुक्त अरब अमीरात के रास्ते आए माल उन्हीं के नाम दर्ज होते हैं, इसलिए किसी उत्पादक देश का असली हिस्सा कभी-कभी दिखाए गए से अधिक होता है।'
            : 'DGCI&S records the country the goods were shipped from, which is not always where they were made. Goods routed through Singapore, Hong Kong or the UAE count against those places, so a producing country\'s true share is sometimes higher than shown.'}</dd></div>
          <div><dt>{hi ? 'माप' : 'Measures'}</dt><dd>{hi
            ? 'निर्भरता: मुख्य आपूर्तिकर्ता देश का आयात मूल्य में 50% से अधिक हिस्सा। HHI (हर्फ़िंडाल सूचकांक, 0 से 10,000) हर उत्पाद के CSV में है: 2,500 से ऊपर का अर्थ है अत्यधिक केंद्रित आपूर्ति। हिस्से मूल्य पर आधारित हैं, मात्रा पर नहीं, इसलिए कीमतों के उतार-चढ़ाव से भी बदल सकते हैं।'
            : 'Dependence: the main supplier country has more than 50% of the import value. The Herfindahl index (HHI, 0 to 10,000) is in each product\'s CSV: above 2,500 means highly concentrated supply. Shares are by value, not quantity, so they also move with prices.'}</dd></div>
          <div><dt>{hi ? 'कोड में बदलाव' : 'Code changes'}</dt><dd>{hi
            ? 'भारत 8-अंकीय कोड समय-समय पर बदलता है (2022 में बड़ा बदलाव, फिर 2023 और 2025 में कुछ)। जहाँ किसी उत्पाद का कोड बदला, वहाँ उसके विवरण में यह लिखा है, और "बढ़ती निर्भरता" सूची से ऐसे उत्पाद हटाए गए हैं।'
            : "India revises its 8-digit codes from time to time (a large change in 2022, smaller ones in 2023 and 2025). Where a product's code changed, its detail says so, and such products are left out of the rising-dependence list."}</dd></div>
          <div><dt>{hi ? 'अपडेट' : 'Updated'}</dt><dd>{hi
            ? 'हर बार जब DGCI&S के नए व्यापार आंकड़े बोर्ड पर अपलोड होते हैं। स्क्रिप्ट: scripts/build_dependence.py।'
            : 'Each time new DGCI&S trade data is uploaded to the board. Script: scripts/build_dependence.py.'}</dd></div>
        </dl>
      </section>
    </>
  );
}
