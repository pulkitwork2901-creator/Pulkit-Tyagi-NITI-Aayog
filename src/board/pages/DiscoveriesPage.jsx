import { useMemo, useState } from 'react';
import { formatValue, formatDateTime } from '../format.js';
import { useTradeFile } from '../trade/tradeKit.jsx';
import { useHi, scrollToId } from './analysisCharts.jsx';
import { THEMES, themeName, kindName, describe, sourceOf, per, isTrade, cn } from './discoveriesText.js';

// Discoveries (#/discoveries): findings mined every day from the board's own
// data by scripts/build_insights.py (records, streaks, gaps, supplier switches,
// trade flips, surges, state shifts), each with a small chart and a link to the
// page that holds the full data.

const W = 300;
const H = 86;

function lineScale(vals, extra = []) {
  const all = [...vals, ...extra].filter((v) => v != null);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

function Line({ s, band, unit, lang }) {
  const M = { l: 4, r: 46, t: 10, b: 16 };
  const vals = s.map((d) => d.v);
  const [lo, hi] = lineScale(vals, band != null ? [band] : []);
  const X = (i) => M.l + (i / Math.max(1, s.length - 1)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const pts = s.map((d, i) => `${X(i).toFixed(1)},${Y(d.v).toFixed(1)}`).join(' ');
  const last = s.at(-1);
  const pct = unit && unit.startsWith('%');
  const fmt = (v) => `${formatValue(v, Math.abs(v) >= 100 ? 0 : 1)}${pct ? '%' : ''}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eb-ds-svg" aria-hidden="true">
      {lo < 0 && hi > 0 ? <line x1={M.l} x2={W - M.r} y1={Y(0)} y2={Y(0)} className="eb-ds-zero" /> : null}
      {band != null ? <><line x1={M.l} x2={W - M.r} y1={Y(band)} y2={Y(band)} className="eb-ds-band" /><text x={M.l + 2} y={Y(band) - 4} className="eb-ds-t eb-ds-tq">{band}%</text></> : null}
      <polyline points={pts} className="eb-ds-line" />
      <circle cx={X(s.length - 1)} cy={Y(last.v)} r="3.2" className="eb-ds-dot" />
      <text x={X(s.length - 1) + 6} y={Y(last.v) + 4} className="eb-ds-t eb-ds-tv">{fmt(last.v)}</text>
      <text x={M.l} y={H - 3} className="eb-ds-t">{per(s[0].l, lang)}</text>
      <text x={W - M.r} y={H - 3} className="eb-ds-t" textAnchor="end">{per(last.l, lang)}</text>
    </svg>
  );
}

function Bars({ s, hi, pct }) {
  const M = { l: 2, r: 2, t: 14, b: 16 };
  const vals = s.map((d) => d.v ?? 0);
  const lo = Math.min(0, ...vals);
  const top = Math.max(0, ...vals);
  const span = top - lo || 1;
  const bw = (W - M.l - M.r) / s.length;
  const Y = (v) => M.t + (1 - (v - lo) / span) * (H - M.t - M.b);
  const lab = (v) => (pct ? `${formatValue(v, 1)}%` : formatValue(v / 1000, Math.abs(v) >= 10000 ? 0 : 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eb-ds-svg" aria-hidden="true">
      <defs>
        <pattern id="eb-ds-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" className="eb-ds-hatchbg" /><line x1="0" y1="0" x2="0" y2="5" className="eb-ds-hatchln" />
        </pattern>
      </defs>
      <line x1={M.l} x2={W - M.r} y1={Y(0)} y2={Y(0)} className="eb-ds-zero" />
      {s.map((d, i) => {
        const v = d.v ?? 0;
        const x = M.l + i * bw + bw * 0.16;
        const w = bw * 0.68;
        const y = Math.min(Y(v), Y(0));
        const h = Math.max(1, Math.abs(Y(v) - Y(0)));
        const lbl = d.part ? per(d.l, hi).replace(/(\w+)-(\w+) (\d{4})/, (m, a, b, y4) => `${a.slice(0, 3)}-${b.slice(0, 3)} ${y4.slice(2)}`) : d.l;
        return (
          <g key={d.l}>
            <rect x={x} y={y} width={w} height={h} rx="1.5" className={`${v < 0 ? 'eb-ds-neg' : 'eb-ds-pos'}${d.part ? ' eb-ds-part' : ''}`} />
            {(i === s.length - 1 || i === s.length - 2) && d.v != null ? (
              <text x={x + w / 2} y={v < 0 ? Math.min(Y(v) + 10, H - 19) : Y(v) - 3} textAnchor="middle" className="eb-ds-t eb-ds-tv">{lab(v)}</text>
            ) : null}
            <text x={x + w / 2} y={H - 3} textAnchor="middle" className="eb-ds-t">{lbl}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TwoLines({ s2, oldName, newName }) {
  const M = { l: 4, r: 92, t: 10, b: 16 };
  const n = s2.periods.length;
  const X = (i) => M.l + (i / Math.max(1, n - 1)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - v / 100) * (H - M.t - M.b);
  const path = (a) => a.map((v, i) => `${X(i).toFixed(1)},${Y(v ?? 0).toFixed(1)}`).join(' ');
  const ABBR = { 'United Arab Emirates': 'UAE', 'United States': 'USA', 'United Kingdom': 'UK', 'संयुक्त अरब अमीरात': 'UAE' };
  const short = (t) => { const a = ABBR[t] || t; return a.length > 13 ? `${a.slice(0, 12)}…` : a; };
  const la = s2.a.at(-1) ?? 0;
  const lb = s2.b.at(-1) ?? 0;
  const close = Math.abs(Y(la) - Y(lb)) < 11;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eb-ds-svg" aria-hidden="true">
      <polyline points={path(s2.a)} className="eb-ds-line eb-ds-old" />
      <polyline points={path(s2.b)} className="eb-ds-line" />
      <text x={X(n - 1) + 6} y={Y(lb) + (close && lb < la ? 9 : close ? -2 : 4)} className="eb-ds-t eb-ds-tv">{short(newName)} {formatValue(lb, 0)}%</text>
      <text x={X(n - 1) + 6} y={Y(la) + (close && la <= lb ? 9 : close ? -2 : 4)} className="eb-ds-t eb-ds-tq">{short(oldName)} {formatValue(la, 0)}%</text>
      <text x={M.l} y={H - 3} className="eb-ds-t">{s2.periods[0]}</text>
      <text x={X(n - 1)} y={H - 3} className="eb-ds-t" textAnchor="end">{s2.periods.at(-1).replace(/^(\d{4}) .*/, '$1*')}</text>
    </svg>
  );
}

// Every state as one bar, highest first, with the national figure as a line.
function Skyline({ s, mark }) {
  const M = { l: 2, r: 2, t: 8, b: 6 };
  const max = Math.max(...s.map((d) => d.v), mark ?? 0);
  const bw = (W - M.l - M.r) / s.length;
  const Y = (v) => M.t + (1 - v / max) * (H - M.t - M.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eb-ds-svg" aria-hidden="true">
      {s.map((d, i) => (
        <rect key={d.l} x={M.l + i * bw + bw * 0.12} y={Y(d.v)} width={bw * 0.76} height={Y(0) - Y(d.v)} rx="1"
          className={mark != null && d.v > mark ? 'eb-ds-pos' : 'eb-ds-pos eb-ds-quiet'} />
      ))}
      {mark != null ? <line x1={M.l} x2={W - M.r} y1={Y(mark)} y2={Y(mark)} className="eb-ds-band" /> : null}
    </svg>
  );
}

function Chart({ x, hi }) {
  if (x.kind === 'switch' && x.series2) return <TwoLines s2={x.series2} oldName={cn(x.p.old, hi)} newName={cn(x.p.new, hi)} />;
  if (x.kind === 'cpi_states') return <Skyline s={x.series} mark={x.p.india} />;
  if (x.kind === 'tax_states') return <Skyline s={x.series} />;
  if (!x.series?.length) return null;
  if (isTrade(x.kind)) return <Bars s={x.series} hi={hi} pct={x.kind === 'state_share'} />;
  return <Line s={x.series} band={x.kind === 'band' ? 6 : null} unit={x.kind === 'gap' ? 'pts' : x.kind === 'band' ? '%' : x.p.unit} lang={hi} />;
}

function chartNote(x, hi) {
  if (x.kind === 'switch') return hi ? `मुख्य आपूर्तिकर्ता का हिस्सा, %। * ${per(x.series2.periods.at(-1), true)}` : `Share of imports, %. * ${per(x.series2.periods.at(-1))}`;
  if (x.kind === 'cpi_states') return hi ? 'हर राज्य एक स्तंभ; रेखा राष्ट्रीय दर' : 'Each bar a state or UT; the line is the national rate';
  if (x.kind === 'tax_states') return hi ? 'प्रत्यक्ष कर में हिस्सा, % (शीर्ष 8 राज्य)' : 'Share of direct taxes, % (top 8 states)';
  if (x.kind === 'state_share') return hi ? 'भारत के निर्यात में हिस्सा, %' : "Share of India's exports, %";
  if (isTrade(x.kind)) return hi ? 'US$ अरब, कैलेंडर वर्ष; धारीदार: आंशिक वर्ष' : 'US$ bn, calendar years; hatched: part year';
  if (x.kind === 'gap') return hi ? 'अंतर, प्रतिशत अंक' : 'Gap, percentage points';
  return null;
}

function Card({ x, hi, big }) {
  const { title, body } = describe(x, hi);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}${x.href}`;
    const text = `${title}. ${body} (${hi ? 'स्रोत' : 'Source'}: ${sourceOf(x, hi)}; E&F-II Economic Monitor, ${url})`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked: nothing to do */ }
  };
  const note = chartNote(x, hi);
  return (
    <li className={`eb-ds-card${big ? ' eb-ds-big' : ''}`} data-theme={x.theme}>
      <p className="eb-ds-kicker"><span className="eb-ds-tag">{kindName(x.kind, hi)}</span>{themeName(x.theme, hi)}</p>
      <h3 className="eb-ds-title">{title}</h3>
      <div className="eb-ds-chart"><Chart x={x} hi={hi} />{note ? <p className="eb-ds-cnote">{note}</p> : null}</div>
      <p className="eb-ds-body">{body}</p>
      <div className="eb-ds-foot">
        <span className="eb-ds-src">{hi ? 'स्रोत' : 'Source'}: {sourceOf(x, hi)}</span>
        <span className="eb-ds-acts">
          <button type="button" className="eb-ds-copy" onClick={copy} aria-live="polite">{copied ? (hi ? 'कॉपी हुआ' : 'Copied') : (hi ? 'कॉपी करें' : 'Copy')}</button>
          <a href={x.href} className="eb-ds-go">{hi ? 'आंकड़े देखें' : 'See the data'}<span aria-hidden="true"> →</span></a>
        </span>
      </div>
    </li>
  );
}

export default function DiscoveriesPage({ base }) {
  const hi = useHi();
  const { data: d, error } = useTradeFile(`${base}insights.json`);
  const [theme, setTheme] = useState('all');
  const counts = useMemo(() => {
    const c = {};
    (d?.insights || []).forEach((x) => { c[x.theme] = (c[x.theme] || 0) + 1; });
    return c;
  }, [d]);
  if (error) return <div className="eb-dash"><p className="eb-empty">{hi ? `आंकड़े लोड नहीं हो सके (${error})।` : `The data could not be loaded (${error}).`}</p></div>;
  if (!d) return <div className="eb-dash" aria-busy="true"><div className="eb-skel-hero" /><div className="eb-skel-panel" /></div>;
  const all = d.insights;
  const top = all.slice(0, 6);
  const shown = theme === 'all' ? all.slice(6) : all.filter((x) => x.theme === theme);
  const themes = THEMES.filter(([t]) => counts[t]);
  const nTrade = all.filter((x) => isTrade(x.kind)).length;
  return (
    <>
      <nav className="eb-crumbs" aria-label={hi ? 'मार्ग' : 'Breadcrumb'}><a href="#/">{hi ? 'डैशबोर्ड' : 'Dashboard'}</a><span aria-hidden="true">/</span><span>{hi ? 'खोजें' : 'Discoveries'}</span></nav>
      <header className="eb-pagehead">
        <h1>{hi ? 'खोजें: आंकड़े क्या बता रहे हैं' : 'Discoveries: what the data is telling us'}</h1>
        <ul className="eb-an-strip" aria-label={hi ? 'सार' : 'Summary'}>
          <li className="eb-an-kpi"><a href="#eb-ds-top" onClick={(e) => scrollToId(e, 'eb-ds-top')}>
            <span className="eb-an-kpi-label">{hi ? 'आज की खोजें' : "Today's findings"}</span>
            <span className="eb-an-kpi-value">{all.length}</span>
            <span className="eb-an-kpi-sub">{hi ? `${themes.length} विषयों में` : `across ${themes.length} themes`}</span></a></li>
          <li className="eb-an-kpi"><a href="#eb-ds-all" onClick={(e) => { setTheme('trade'); scrollToId(e, 'eb-ds-all'); }}>
            <span className="eb-an-kpi-label">{hi ? 'व्यापार आंकड़ों से' : 'From the trade data'}</span>
            <span className="eb-an-kpi-value">{nTrade}</span>
            <span className="eb-an-kpi-sub">{hi ? 'HS 8-अंकीय उत्पाद, देश और राज्य' : 'HS 8-digit products, countries, states'}</span></a></li>
          <li className="eb-an-kpi"><a href="#eb-ds-method" onClick={(e) => scrollToId(e, 'eb-ds-method')}>
            <span className="eb-an-kpi-label">{hi ? 'अद्यतन' : 'Refreshed'}</span>
            <span className="eb-an-kpi-value eb-ds-kpi-sm">{formatDateTime(d.generated_at)}</span>
            <span className="eb-an-kpi-sub">{hi ? 'हर दिन, नए आंकड़ों के साथ' : 'every day, with the new data'}</span></a></li>
        </ul>
        <div className="eb-themebrief">
          <p className="eb-themebrief-kicker">{hi ? 'यह क्या है' : 'What this is'}</p>
          <p>{hi
            ? 'हर दिन एक प्रोग्राम डैशबोर्ड के सभी आंकड़ों को खंगालता है: मुद्रास्फीति, ऋण, दरें, कर, और हर देश, हर राज्य व 300 सबसे बड़े उत्पादों का व्यापार। वह लंबे रुझान, रिकॉर्ड, बढ़ते अंतर, आपूर्तिकर्ताओं के बदलाव, उछाल और गिरावट खोजता है, और उन्हें इस आधार पर क्रम देता है कि वे कितने असामान्य और कितने बड़े हैं।'
            : 'Every day a program combs through all the data on this dashboard: inflation, credit, rates, taxes, and trade with every country, from every state, in the 300 largest products. It looks for long streaks, records, widening gaps, supplier switches, booms and busts, and ranks them by how unusual and how large they are.'}</p>
          <p>{hi
            ? 'हर वाक्य सीधे आंकड़ों से बनता है। ये खोजें शुरुआत हैं, निष्कर्ष नहीं: किसी बदलाव का कारण जानने के लिए उसके पीछे की नीति या बाज़ार की घटना देखनी होगी।'
            : 'Every sentence is built straight from the numbers. Treat each finding as a lead, not a conclusion: why something changed still needs the policy or market event behind it.'}</p>
        </div>
      </header>

      <section className="eb-section" aria-labelledby="eb-ds-top">
        <h2 id="eb-ds-top">{hi ? 'आज की छह सबसे बड़ी खोजें' : "Today's six biggest findings"}</h2>
        <ul className="eb-ds-grid eb-ds-grid-big">{top.map((x) => <Card key={`${x.kind}-${x.rank}`} x={x} hi={hi} big />)}</ul>
      </section>

      <section className="eb-section" aria-labelledby="eb-ds-all">
        <h2 id="eb-ds-all">{theme === 'all' ? (hi ? 'और खोजें' : 'More findings') : (hi ? `खोजें: ${themeName(theme, true)}` : `Findings: ${themeName(theme, false)}`)}</h2>
        <div className="eb-ds-filter" role="group" aria-label={hi ? 'विषय चुनें' : 'Choose a theme'}>
          <button type="button" aria-pressed={theme === 'all'} onClick={() => setTheme('all')}>{hi ? 'सभी' : 'All'} <span>{all.length}</span></button>
          {themes.map(([t]) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{themeName(t, hi)} <span>{counts[t]}</span></button>
          ))}
        </div>
        <ul className="eb-ds-grid">{shown.map((x) => <Card key={`${x.kind}-${x.rank}`} x={x} hi={hi} />)}</ul>
      </section>

      <section className="eb-section eb-ds-method" aria-labelledby="eb-ds-method">
        <h2 id="eb-ds-method">{hi ? 'खोजें कैसे बनती हैं' : 'How the findings are made'}</h2>
        <ul className="eb-ds-rules">
          {(hi ? [
            'लगातार रुझान: मासिक शृंखला जो कम से कम 6 महीने लगातार एक दिशा में चली। नीतिगत दरें और वर्ष के भीतर संचयी आंकड़े शामिल नहीं।',
            'रिकॉर्ड: कम से कम दो वर्षों के इतिहास के मुकाबले; दावे में वह तारीख बताई जाती है जिससे तुलना है। केवल दरें, वृद्धि और अनुपात, क्योंकि रुपये में स्तर हर साल अपने आप बढ़ते हैं।',
            'व्यापार: DGCI&S के HS 8-अंकीय आंकड़े। जिन उत्पादों का कोड तुलना की अवधि में बदला, वे छोड़ दिए जाते हैं, क्योंकि नया कोड पुराने में गिरावट जैसा दिखता है। "अन्य सभी" और "अनिर्दिष्ट" को देश नहीं माना जाता। देश का अर्थ माल भेजने वाला देश है, जो हमेशा बनाने वाला देश नहीं होता।',
            'आंशिक वर्ष (जनवरी-अगस्त 2026) की पूरे वर्षों से तुलना केवल यह कहने के लिए होती है कि वह पहले ही पूरे पिछले वर्ष से आगे निकल गया।',
            'हर खोज को इस आधार पर अंक मिलते हैं कि वह कितनी असामान्य और कितनी बड़ी है; सबसे ऊँचे अंक वाली छह ऊपर दिखती हैं।',
          ] : [
            'Streaks: a monthly series that has moved the same way for at least 6 months running. Policy rates and figures that add up within the year are left out.',
            'Records: measured against at least two years of history, and the claim names the date it runs from. Only rates, growth and ratios, because rupee levels rise every year on their own.',
            'Trade: DGCI&S HS 8-digit data. Products whose code changed inside the compared period are skipped, because a new code looks like a collapse in the old one. "All other" and "Unspecified" are never treated as countries. Country means the country goods were shipped from, which is not always where they were made.',
            'Part years (January to August 2026) are compared with full years only to say a part year has already passed the whole of the year before.',
            'Each finding is scored on how unusual and how large it is; the six with the highest scores are shown at the top.',
          ]).map((t) => <li key={t}>{t}</li>)}
        </ul>
      </section>
    </>
  );
}
