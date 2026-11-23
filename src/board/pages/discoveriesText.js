import { formatValue } from '../format.js';
import { hiLabel } from '../../i18n.jsx';
import { COUNTRY_HI, CHAPTER_HI } from './dependenceText.js';
import { STATES, MON, MON_HI } from './analysisText.js';
import { stateKey } from '../stateKey.js';

// Sentences for the Discoveries page, in English and Hindi, built from the
// structured facts in public/data/insights.json (scripts/build_insights.py).
// Every number in a sentence comes from the finding itself.

const STATE_HI = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [stateKey(k), v[3]]));

export const THEMES = [
  ['prices', 'Prices', 'कीमतें'],
  ['money', 'Money and credit', 'मुद्रा और ऋण'],
  ['growth', 'Growth', 'वृद्धि'],
  ['external', 'External sector', 'बाहरी क्षेत्र'],
  ['trade', 'Trade', 'व्यापार'],
  ['states', 'States', 'राज्य'],
  ['taxes', 'Taxes and finances', 'कर और वित्त'],
];
export const themeName = (t, hi) => { const r = THEMES.find((x) => x[0] === t); return r ? r[hi ? 2 : 1] : t; };

const KIND = {
  streak: ['Streak', 'लगातार रुझान'], record: ['Record', 'रिकॉर्ड'], band: ['Threshold crossed', 'सीमा पार'],
  gap: ['Widening gap', 'बढ़ता अंतर'], switch: ['Supplier switch', 'आपूर्तिकर्ता बदला'], partner: ['Partner shift', 'साझेदार में बदलाव'],
  market_loss: ['Lost market', 'घटता बाज़ार'], deficit: ['Deficit', 'घाटा'], surplus: ['Surplus', 'अधिशेष'],
  flip: ['Flip', 'पलटाव'], ytd: ['Already past last year', 'पिछले साल से आगे'], spike: ['Boom and bust', 'उछाल और गिरावट'],
  gone: ['Vanished', 'लगभग बंद'], state_share: ['State shift', 'राज्यों में बदलाव'], cpi_states: ['Spread', 'फैलाव'],
  tax_states: ['Concentration', 'केंद्रीकरण'],
};
export const kindName = (k, hi) => (KIND[k] ? KIND[k][hi ? 1 : 0] : k);

const TRADE_KINDS = ['switch', 'partner', 'market_loss', 'deficit', 'surplus', 'flip', 'ytd', 'spike', 'gone', 'state_share'];
export const isTrade = (k) => TRADE_KINDS.includes(k);

// ------------------------------------------------------------ formatting

const f = (v, d = 1) => formatValue(v, d);
const abs = Math.abs;
export function per(p, hi) {
  if (!p) return '';
  const m = /^(\d{4}) ([A-Z][a-z]{2})-([A-Z][a-z]{2})$/.exec(p); // "2026 Jan-Aug"
  let s = m ? `${m[2]}-${m[3]} ${m[1]}` : p;
  if (hi) MON.forEach((x, i) => { s = s.replace(new RegExp(`\\b${x}\\b`, 'g'), MON_HI[i]); });
  return s;
}
const monthIso = (m, hi) => `${(hi ? MON_HI : MON)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export function usd(mn, hi) {
  if (mn == null) return '–';
  const a = abs(mn);
  if (a >= 1000) return `US$ ${f(a / 1000, a >= 10000 ? 1 : 2)} ${hi ? 'अरब' : 'bn'}`;
  return `US$ ${f(a, 0)} ${hi ? 'मिलियन' : 'mn'}`;
}
const pc = (v, d = 1) => `${f(v, d)}%`;
const dec = (p) => Math.min(2, p.decimals ?? 1);
function uv(p, v, hi) {
  const u = p.unit || '';
  if (u.startsWith('%')) return u.includes('GDP') ? (hi ? `GDP का ${pc(v, dec(p))}` : `${pc(v, dec(p))} of GDP`) : pc(v, dec(p));
  if (u.startsWith('₹ per barrel')) return hi ? `₹${f(v, 0)} प्रति बैरल` : `₹${f(v, 0)} a barrel`;
  if (u.startsWith('US$ bn')) return `US$ ${f(v, 1)} ${hi ? 'अरब' : 'bn'}`;
  if (u.startsWith('₹ per US$')) return `₹${f(v, 2)}`;
  return `${f(v, dec(p))} ${u}`;
}
// Indicator names the board's translator does not carry as whole labels.
const LBL_HI = {
  "Direct taxes' share of total tax revenue": 'कुल कर राजस्व में प्रत्यक्ष करों का हिस्सा',
  '3-month forward premium on US$': 'US$ पर 3 महीने का फ़ॉरवर्ड प्रीमियम',
  "Centre's capital expenditure": 'केंद्र का पूंजीगत व्यय',
  "Centre's fiscal deficit": 'केंद्र का राजकोषीय घाटा',
  'Current account: goods balance': 'चालू खाता: वस्तु संतुलन',
  'Current account: primary income (net)': 'चालू खाता: प्राथमिक आय (शुद्ध)',
  'Current account: services balance': 'चालू खाता: सेवा संतुलन',
  'Current account: transfers (net)': 'चालू खाता: अंतरण (शुद्ध)',
  'External debt, gross': 'सकल बाहरी ऋण',
  'GST on domestic transactions (gross)': 'घरेलू लेन-देन पर GST (सकल)',
  'GST on imports (gross)': 'आयात पर GST (सकल)',
  'Gross GST collections': 'सकल GST संग्रह',
  'Net international investment position': 'शुद्ध अंतरराष्ट्रीय निवेश स्थिति',
  'Remittances (personal transfer receipts)': 'प्रेषण (व्यक्तिगत अंतरण प्राप्तियाँ)',
  'WPI food inflation': 'WPI खाद्य मुद्रास्फीति',
};
const lab = (s, hi) => (hi ? LBL_HI[s] || hiLabel(s) || s : s);
export const cn = (n, hi) => (hi ? COUNTRY_HI[n] || n : n);
const sn = (n, hi) => (hi ? STATE_HI[stateKey(n)] || n : n);
const ch = (c, hi) => (hi ? CHAPTER_HI[c] || c : c.toLowerCase());
const pn = (p, hi) => (hi ? p.name_hi || p.name : p.name);
const years = (m) => (m >= 24 ? Math.round(m / 12) : null);

// ------------------------------------------------------------ sentences

const T = {
  streak: (p, hi) => (hi
    ? { title: `${lab(p.label, true)} लगातार ${p.n} महीनों से ${p.dir === 'up' ? 'बढ़ रही है' : 'घट रही है'}`,
        body: `${per(p.from_period, true)} में ${uv(p, p.from_value, true)} से ${per(p.period, true)} में ${uv(p, p.value, true)}। हर महीने पिछले महीने से ${p.dir === 'up' ? 'ऊँचा' : 'नीचा'}।` }
    : { title: `${p.label} has ${p.dir === 'up' ? 'risen' : 'fallen'} for ${p.n} months in a row`,
        body: `From ${uv(p, p.from_value)} in ${p.from_period} to ${uv(p, p.value)} in ${p.period}, ${p.dir === 'up' ? 'higher' : 'lower'} every month than the one before.` }),

  record: (p, hi) => {
    const high = p.side === 'high';
    const y = years(p.months);
    if (hi) {
      return {
        title: p.alltime
          ? `${lab(p.label, true)}: ${p.start} से उपलब्ध आंकड़ों में सबसे ${high ? 'ऊँचा' : 'नीचा'} स्तर`
          : `${lab(p.label, true)}: ${per(p.since, true)} के बाद सबसे ${high ? 'ऊँचा' : 'नीचा'} स्तर`,
        body: `${per(p.period, true)} में ${uv(p, p.value, true)}।${y && !p.alltime ? ` लगभग ${y} वर्षों में ऐसा स्तर नहीं देखा गया।` : ''}`,
      };
    }
    return {
      title: p.alltime
        ? `${p.label} is at its ${high ? 'highest' : 'lowest'} in the data, which goes back to ${p.start}`
        : `${p.label} is at its ${high ? 'highest' : 'lowest'} since ${p.since}`,
      body: `${uv(p, p.value)} in ${p.period}.${y && !p.alltime ? ` Not seen in about ${y} years.` : ''}`,
    };
  },

  band: (p, hi) => (hi
    ? { title: 'CPI मुद्रास्फीति RBI की 6% की ऊपरी सहनशीलता सीमा से ऊपर',
        body: `${per(p.period, true)} में ${pc(p.value, 2)}, पिछले महीने ${pc(p.prev, 2)} थी। ${p.last_above ? `पिछली बार यह ${per(p.last_above, true)} में 6% से ऊपर थी।` : `${per(p.start, true)} से उपलब्ध आंकड़ों में यह पहली बार है।`} लक्ष्य 4% है, 2 प्रतिशत अंक ऊपर-नीचे की छूट के साथ।` }
    : { title: "CPI inflation has crossed the RBI's 6% upper tolerance limit",
        body: `${pc(p.value, 2)} in ${p.period}, up from ${pc(p.prev, 2)} the month before. ${p.last_above ? `The last time it was above 6% was ${p.last_above}.` : `It is the first time in the data, which starts in ${p.start}.`} The target is 4%, with a band of 2 points either side.` }),

  gap: (p, hi) => {
    if (p.key === 'rural_urban') {
      return hi
        ? { title: `ग्रामीण मुद्रास्फीति शहरी से ${f(p.gap, 1)} अंक ऊपर${p.since ? `, ${per(p.since, true)} के बाद सबसे बड़ा अंतर` : ''}`,
            body: `${per(p.period, true)} में ग्रामीण ${pc(p.a_value, 2)} और शहरी ${pc(p.b_value, 2)}। गाँवों में कीमतें शहरों से तेज़ी से बढ़ रही हैं।` }
        : { title: `Rural inflation is ${f(p.gap, 1)} points above urban${p.since ? `, the widest gap since ${p.since}` : ''}`,
            body: `Rural ${pc(p.a_value, 2)} against urban ${pc(p.b_value, 2)} in ${p.period}. Prices are rising faster in villages than in towns.` };
    }
    return hi
      ? { title: `बैंक ऋण जमा से ${f(p.gap, 1)} अंक तेज़ी से बढ़ रहा है${p.since ? `, ${per(p.since, true)} के बाद सबसे अधिक` : ''}`,
          body: `${per(p.period, true)} में ऋण वृद्धि ${pc(p.a_value)} और जमा वृद्धि ${pc(p.b_value)}।` }
      : { title: `Bank credit is growing ${f(p.gap, 1)} points faster than deposits${p.since ? `, the most since ${p.since}` : ''}`,
          body: `Credit growth ${pc(p.a_value)} against deposit growth ${pc(p.b_value)} in ${p.period}.` };
  },

  switch: (p, hi) => (hi
    ? { title: `${pn(p, true)} का मुख्य आपूर्तिकर्ता अब ${cn(p.new, true)} है, ${cn(p.old, true)} नहीं`,
        body: `${cn(p.new, true)} का हिस्सा ${p.base} के ${pc(p.new_then, 0)} से बढ़कर ${p.latest} में ${pc(p.new_now, 0)} हुआ; ${cn(p.old, true)} का ${pc(p.old_then, 0)} से घटकर ${pc(p.old_now, 0)}। ${p.latest} में आयात ${usd(p.value, true)}।` }
    : { title: `${cn(p.new)} has replaced ${cn(p.old)} as India's main supplier of ${pn(p)}`,
        body: `${p.new}'s share rose from ${pc(p.new_then, 0)} in ${p.base} to ${pc(p.new_now, 0)} in ${p.latest}; ${p.old}'s fell from ${pc(p.old_then, 0)} to ${pc(p.old_now, 0)}. Imports were ${usd(p.value)} in ${p.latest}.` }),

  partner: (p, hi) => (hi
    ? { title: `${cn(p.name, true)} से आयात ${p.base} से ${p.latest} के बीच ${usd(p.now - p.then, true)} बढ़ा`,
        body: `${usd(p.then, true)} से ${usd(p.now, true)}, यानी कुल आयात में हिस्सा ${pc(p.share_then)} से ${pc(p.share_now)}।${p.ytd != null ? ` ${per(p.part, true)} में ही ${usd(p.ytd, true)}।` : ''}` }
    : { title: `Imports from ${p.name} rose by ${usd(p.now - p.then)} between ${p.base} and ${p.latest}`,
        body: `From ${usd(p.then)} to ${usd(p.now)}, taking its share of India's imports from ${pc(p.share_then)} to ${pc(p.share_now)}.${p.ytd != null ? ` ${usd(p.ytd)} already in ${per(p.part)}.` : ''}` }),

  market_loss: (p, hi) => (hi
    ? { title: `${cn(p.name, true)} को भारत का निर्यात ${p.base} से ${p.latest} के बीच ${pc(p.fall, 0)} घटा`,
        body: `${usd(p.then, true)} से घटकर ${usd(p.now, true)}।` }
    : { title: `India's exports to ${p.name} fell ${pc(p.fall, 0)} between ${p.base} and ${p.latest}`,
        body: `From ${usd(p.then)} to ${usd(p.now)}.` }),

  deficit: (p, hi) => {
    const r = p.ratio;
    const en = r >= 1.9 ? 'has doubled' : r >= 1.6 ? 'has nearly doubled' : `has grown ${pc((r - 1) * 100, 0)}`;
    const h = r >= 1.9 ? 'दोगुना हो गया' : r >= 1.6 ? 'लगभग दोगुना हो गया' : `${pc((r - 1) * 100, 0)} बढ़ा`;
    return hi
      ? { title: `${cn(p.name, true)} के साथ भारत का व्यापार घाटा ${p.base} से ${h}`, body: `${p.base} में ${usd(p.then, true)} का घाटा ${p.latest} में ${usd(p.now, true)} हो गया।` }
      : { title: `India's trade deficit with ${p.name} ${en} since ${p.base}`, body: `A deficit of ${usd(p.then)} in ${p.base} became ${usd(p.now)} in ${p.latest}.` };
  },

  surplus: (p, hi) => (hi
    ? { title: `सबसे बड़ा व्यापार अधिशेष ${cn(p.name, true)} के साथ: ${usd(p.now, true)}`, body: `${p.base} में ${usd(p.then, true)} था। दूसरे स्थान पर ${cn(p.second, true)}।` }
    : { title: `India's biggest trade surplus is with ${p.name}: ${usd(p.now)}`, body: `Up from ${usd(p.then)} in ${p.base}. The next largest is with ${p.second}.` }),

  flip: (p, hi) => {
    const toDeficit = p.then > 0 && p.now < 0;
    return hi
      ? { title: toDeficit ? `${ch(p.chapter, true)} में भारत शुद्ध निर्यातक से शुद्ध आयातक बन गया` : `${ch(p.chapter, true)} में भारत शुद्ध निर्यातक बन गया`,
          body: `व्यापार संतुलन ${per(p.from, true)} में ${p.then < 0 ? '−' : '+'}${usd(p.then, true)}, ${per(p.to, true)} में ${p.now < 0 ? '−' : '+'}${usd(p.now, true)}।${p.ytd != null && p.part ? ` ${per(p.part, true)}: ${p.ytd < 0 ? '−' : '+'}${usd(p.ytd, true)}।` : ''}` }
      : { title: toDeficit ? `India has turned from a net exporter to a net importer of ${ch(p.chapter)}` : `India has become a net exporter of ${ch(p.chapter)}`,
          body: `Trade balance ${p.then < 0 ? '−' : '+'}${usd(p.then)} in ${per(p.from)}, ${p.now < 0 ? '−' : '+'}${usd(p.now)} in ${per(p.to)}.${p.ytd != null && p.part ? ` ${per(p.part)}: ${p.ytd < 0 ? '−' : '+'}${usd(p.ytd)}.` : ''}` };
  },

  ytd: (p, hi) => (hi
    ? { title: `${pn(p, true)} का ${p.flow === 'imports' ? 'आयात' : 'निर्यात'} ${per(p.part, true)} में ही पूरे ${p.latest} से अधिक`,
        body: `इन महीनों में ${usd(p.ytd, true)}, जबकि पूरे ${p.latest} में ${usd(p.full, true)}, यानी ${f(p.ratio, 1)} गुना।` }
    : { title: `India's ${p.flow} of ${pn(p)} in ${per(p.part)} have already passed the whole of ${p.latest}`,
        body: `${usd(p.ytd)} so far, against ${usd(p.full)} in all of ${p.latest}: ${f(p.ratio, 1)} times as much in fewer months.` }),

  spike: (p, hi) => (hi
    ? { title: `${pn(p, true)} का ${p.flow === 'imports' ? 'आयात' : 'निर्यात'} ${p.latest} में ${p.times} गुना होकर ${usd(p.now, true)}`,
        body: `${p.base} में ${usd(p.then, true)} और ${p.prev_year} में ${usd(p.prev, true)} था।${p.bust ? ` ${per(p.part, true)} में यह लगभग बंद हो गया: केवल ${usd(p.ytd, true)}। इतने बड़े उछाल और गिरावट के पीछे अक्सर शुल्क या वर्गीकरण में बदलाव जैसा कोई विशेष कारण होता है; जाँचने योग्य।` : ` ${per(p.part, true)}: ${usd(p.ytd, true)}।`}` }
    : { title: `${p.flow === 'imports' ? 'Imports' : 'Exports'} of ${pn(p)} jumped ${p.times}-fold to ${usd(p.now)} in ${p.latest}`,
        body: `From ${usd(p.then)} in ${p.base} and ${usd(p.prev)} in ${p.prev_year}.${p.bust ? ` In ${per(p.part)} they almost stopped: ${usd(p.ytd)}. A rise and fall this sharp usually has a specific cause, such as a change in duty or in how goods are classified; worth checking.` : ` ${per(p.part)}: ${usd(p.ytd)}.`}` }),

  gone: (p, hi) => (hi
    ? { title: `${pn(p, true)} का ${p.flow === 'imports' ? 'आयात' : 'निर्यात'} लगभग बंद`, body: `${p.base} में ${usd(p.then, true)}, ${p.latest} में केवल ${usd(p.now, true)}।` }
    : { title: `${p.flow === 'imports' ? 'Imports' : 'Exports'} of ${pn(p)} have all but stopped`, body: `${usd(p.then)} in ${p.base}, just ${usd(p.now)} in ${p.latest}.` }),

  state_share: (p, hi) => {
    const up = p.now > p.then;
    return hi
      ? { title: `भारत के निर्यात में ${sn(p.name, true)} का हिस्सा ${pc(p.then)} से ${up ? 'बढ़कर' : 'घटकर'} ${pc(p.now)}`,
          body: `${p.base} से ${p.latest} के बीच निर्यात ${pc(abs(p.growth), 0)} ${p.growth >= 0 ? 'बढ़कर' : 'घटकर'} ${usd(p.value, true)}। सबसे बड़ा निर्यात: ${p.top} (${pc(p.top_share, 0)})।` }
      : { title: `${p.name}'s share of India's exports ${up ? 'jumped' : 'fell'} from ${pc(p.then)} to ${pc(p.now)}`,
          body: `Its exports ${p.growth >= 0 ? 'grew' : 'fell'} ${pc(abs(p.growth), 0)} between ${p.base} and ${p.latest}, to ${usd(p.value)}. Largest export: ${p.top.toLowerCase()} (${pc(p.top_share, 0)}).` };
  },

  cpi_states: (p, hi) => (hi
    ? { title: `मुद्रास्फीति ${sn(p.low, true)} में ${pc(p.low_v, 2)} से ${sn(p.high, true)} में ${pc(p.high_v, 2)} तक`,
        body: `${monthIso(p.month, true)} में ${p.n} में से ${p.above} राज्य और केंद्र शासित प्रदेश राष्ट्रीय ${pc(p.india, 2)} से ऊपर। महीने भर में सबसे तेज़ बढ़त ${sn(p.jump, true)} में, ${f(p.jump_by, 2)} अंक बढ़कर ${pc(p.jump_to, 2)}।` }
    : { title: `Inflation runs from ${pc(p.low_v, 2)} in ${sn(p.low)} to ${pc(p.high_v, 2)} in ${sn(p.high)}`,
        body: `${p.above} of ${p.n} states and UTs are above the national ${pc(p.india, 2)} (${monthIso(p.month)}). The sharpest rise on the month was in ${sn(p.jump)}, up ${f(p.jump_by, 2)} points to ${pc(p.jump_to, 2)}.` }),

  tax_states: (p, hi) => (hi
    ? { title: `अकेला ${sn(p.top[0], true)} भारत के प्रत्यक्ष कर का ${pc(p.top_share)} देता है`,
        body: `${sn(p.top[1], true)} और ${sn(p.top[2], true)} के साथ तीन राज्यों का हिस्सा ${pc(p.top3_share)} (${p.year})। ${p.first} में ${sn(p.top[0], true)} का हिस्सा ${pc(p.top_share_then)} था। राज्यवार संग्रह यह दिखाता है कि कर कहाँ जमा हुआ (अक्सर कंपनियों के मुख्यालय), न कि आय कहाँ हुई।` }
    : { title: `${p.top[0]} alone pays ${pc(p.top_share)} of India's direct taxes`,
        body: `With ${p.top[1]} and ${p.top[2]}, three states account for ${pc(p.top3_share)} (${p.year}). ${p.top[0]}'s share was ${pc(p.top_share_then)} in ${p.first}. State figures show where tax is paid, often at a company's head office, not where the income was earned.` }),
};

export function describe(x, hi) {
  const t = T[x.kind];
  return t ? t(x.p, hi) : { title: x.kind, body: '' };
}

export function sourceOf(x, hi) {
  if (isTrade(x.kind)) return hi ? 'DGCI&S, वाणिज्य मंत्रालय' : 'DGCI&S, Ministry of Commerce and Industry';
  if (x.kind === 'cpi_states' || x.kind === 'band' || (x.kind === 'gap' && x.p.key === 'rural_urban')) return 'MoSPI';
  if (x.kind === 'tax_states') return 'CBDT';
  if (x.kind === 'gap') return 'RBI';
  const s = x.p.source || '';
  return s.split(/[,(]/)[0].trim() || s;
}
