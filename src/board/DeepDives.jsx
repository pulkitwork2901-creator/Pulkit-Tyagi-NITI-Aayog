import { formatValue } from './format.js';
import { useTradeFile } from './trade/tradeKit.jsx';
import { useLanguage } from '../i18n.jsx';

// Cards that lead from the dashboard to the in-depth pages, each with one
// current figure from that page's own data (models.json, dependence.json).

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const month = (m, hi) => `${(hi ? MON_HI : MON)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function Card({ href, kicker, title, figure, note }) {
  return (
    <li className="eb-dd-card">
      <a href={href}>
        <span className="eb-dd-kicker">{kicker}</span>
        <span className="eb-dd-title">{title}</span>
        {figure ? <span className="eb-dd-figure">{figure}</span> : <span className="eb-dd-figure eb-dd-wait" aria-hidden="true" />}
        {note ? <span className="eb-dd-note">{note}</span> : null}
        <span className="eb-dd-go" aria-hidden="true">→</span>
      </a>
    </li>
  );
}

export default function DeepDives({ base, tradeBase, only }) {
  const hi = useLanguage().language === 'hi';
  const { data: m } = useTradeFile(`${base}models.json`);
  const { data: dep } = useTradeFile(`${tradeBase}dependence.json`);
  const { data: ins } = useTradeFile(`${base}insights.json`);
  const L = (en, h) => (hi ? h : en);

  const heat = m?.heat || [];
  const extremes = heat.filter((r) => r.pct <= 10 || r.pct >= 90).length;
  const cpi = m?.cpi_contributions?.rows?.at(-1);
  const st = m?.cpi_contributions?.states;
  const india = st?.rows.find((r) => r.state === 'All India');
  const stRows = (st?.rows || []).filter((r) => r.state !== 'All India' && r.combined != null);
  const above = india ? stRows.filter((r) => r.combined > india.combined).length : null;
  const f = m?.forecasts?.[0];
  const oil = m?.relationships?.find((p) => p.x === 'crude_yoy' && p.y === 'cpi');
  const tc = m?.tax_check;
  const net = tc?.rows?.find((r) => r.series === 'net');
  const dl = dep && dep.summary[dep.periods.indexOf(dep.latest_full)];
  const china = dep?.suppliers?.find((s) => s.name === 'China');

  const cards = [
    { id: 'discoveries', href: '#/discoveries', kicker: L('Analysis and outlook', 'विश्लेषण और परिदृश्य'), title: L('Discoveries', 'खोजें'),
      figure: ins ? L(`${ins.count} findings`, `${ins.count} खोजें`) : null,
      note: L('records, streaks, switches and surprises found in the data today', 'आज आंकड़ों में मिले रिकॉर्ड, रुझान, बदलाव और चौंकाने वाली बातें') },
    { id: 'glance', href: '#/glance', kicker: L('Overview', 'अवलोकन'), title: L('The economy at a glance', 'एक नज़र में अर्थव्यवस्था'),
      figure: heat.length ? L(`${extremes} of ${heat.length}`, `${heat.length} में से ${extremes}`) : null,
      note: L('indicators at an extreme of their recent range', 'संकेतक अपने हाल के दायरे के चरम पर') },
    { id: 'inflation', href: '#/theme/prices-and-inflation', kicker: L('Prices and inflation', 'कीमतें और मुद्रास्फीति'), title: L('What is driving inflation', 'मुद्रास्फीति को क्या चला रहा है'),
      figure: cpi ? L(`${formatValue(cpi.food, 1)} of ${formatValue(cpi.headline, 1)} pts`, `${formatValue(cpi.headline, 1)} में से ${formatValue(cpi.food, 1)} अंक`) : null,
      note: cpi ? L(`from food in ${month(cpi.month)}`, `${month(cpi.month, true)} में खाद्य से`) : null },
    { id: 'dependence', href: '#/dependence', kicker: L('Trade', 'व्यापार'), title: L('Import dependence', 'आयात निर्भरता'),
      figure: dl ? `US$ ${formatValue(dl.dependent_value / 1000, 0)} ${L('bn', 'अरब')}` : null,
      note: dl ? L(`of imports from one dominant supplier; China for ${china?.count ?? '–'} products`, `आयात एक प्रमुख आपूर्तिकर्ता से; ${china?.count ?? '–'} उत्पादों में चीन`) : null },
    { id: 'states', href: '#/states', kicker: L('States', 'राज्य'), title: L('State profiles', 'राज्य प्रोफ़ाइल'),
      figure: above != null ? L(`${above} of ${stRows.length}`, `${stRows.length} में से ${above}`) : null,
      note: st ? L(`states and UTs above national inflation, ${month(st.month)}`, `राज्य और केंद्र शासित प्रदेश राष्ट्रीय मुद्रास्फीति से ऊपर, ${month(st.month, true)}`) : null },
    { id: 'forecasts', href: '#/forecasts', kicker: L('Analysis and outlook', 'विश्लेषण और परिदृश्य'), title: L('Forecasts and track record', 'पूर्वानुमान और उनका रिकॉर्ड'),
      figure: f ? `₹${formatValue(f.forecast[0].value, 2)} ${L('lakh cr', 'लाख करोड़')}` : null,
      note: f ? L(`GST forecast for ${month(f.forecast[0].month)}`, `${month(f.forecast[0].month, true)} के लिए GST पूर्वानुमान`) : null },
    { id: 'relationships', href: '#/relationships', kicker: L('Analysis and outlook', 'विश्लेषण और परिदृश्य'), title: L('How indicators move together', 'संकेतक साथ कैसे चलते हैं'),
      figure: oil ? L(`${oil.best_lead.lag} months`, `${oil.best_lead.lag} महीने`) : null,
      note: L('how far oil prices run ahead of CPI inflation', 'तेल की कीमतें CPI मुद्रास्फीति से कितना आगे चलती हैं') },
    { id: 'tax-growth', href: '#/tax-growth', kicker: L('Analysis and outlook', 'विश्लेषण और परिदृश्य'), title: L('Taxes and growth', 'कर और वृद्धि'),
      figure: net ? `${net.actual_growth > 0 ? '+' : ''}${formatValue(net.actual_growth, 1)}%` : null,
      note: tc ? L(`net direct taxes so far in ${tc.fy}, against the growth the economy implies`, `${tc.fy} में अब तक शुद्ध प्रत्यक्ष कर, अर्थव्यवस्था से अपेक्षित वृद्धि की तुलना में`) : null },
  ].filter((c) => !only || only.includes(c.id));

  return (
    <ul className="eb-dd" aria-label={L('In-depth pages', 'विस्तृत पृष्ठ')}>
      {cards.map((c) => <Card key={c.id} {...c} />)}
    </ul>
  );
}
