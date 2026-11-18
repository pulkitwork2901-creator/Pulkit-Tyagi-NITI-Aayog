import { useLanguage } from '../i18n.jsx';

// "Related pages" at the foot of each page, so readers move between topics
// without going back to the sidebar.

const P = {
  overview: ['#/', 'Dashboard', 'डैशबोर्ड'],
  glance: ['#/glance', 'The economy at a glance', 'एक नज़र में अर्थव्यवस्था'],
  prices: ['#/theme/prices-and-inflation', 'Prices and inflation', 'कीमतें और मुद्रास्फीति'],
  govt: ['#/theme/government-finances', 'Government finances', 'सरकारी वित्त'],
  tradeTheme: ['#/theme/trade-and-current-account', 'Trade and current account', 'व्यापार और चालू खाता'],
  dtax: ['#/direct-taxes', 'Direct taxes', 'प्रत्यक्ष कर'],
  exports: ['#/exports', 'Exports', 'निर्यात'],
  imports: ['#/imports', 'Imports', 'आयात'],
  balance: ['#/balance', 'Trade balance', 'व्यापार संतुलन'],
  dependence: ['#/dependence', 'Import dependence', 'आयात निर्भरता'],
  states: ['#/states', 'State profiles', 'राज्य प्रोफ़ाइल'],
  stateExports: ['#/states/exports', 'Exports by state', 'राज्यवार निर्यात'],
  forecasts: ['#/forecasts', 'Forecasts and track record', 'पूर्वानुमान और उनका रिकॉर्ड'],
  relationships: ['#/relationships', 'How indicators move together', 'संकेतक साथ कैसे चलते हैं'],
  taxGrowth: ['#/tax-growth', 'Taxes and growth', 'कर और वृद्धि'],
  sources: ['#/sources', 'Sources and notes', 'स्रोत और टिप्पणियाँ'],
};

function linksFor(route) {
  const { name, arg } = route;
  if (name === 'glance') return ['forecasts', 'prices', 'states'];
  if (name === 'forecasts' || name === 'analysis') return ['relationships', 'taxGrowth', 'glance'];
  if (name === 'relationships') return ['forecasts', 'prices', 'glance'];
  if (name === 'tax-growth') return ['dtax', 'govt', 'forecasts'];
  if (name === 'dependence') return ['imports', 'balance', 'tradeTheme'];
  if (name === 'exports' || name === 'imports' || name === 'balance') return ['dependence', 'states', 'tradeTheme'];
  if (name === 'states') return arg ? ['states', 'stateExports', 'dtax'] : ['stateExports', 'dtax', 'prices'];
  if (name === 'direct-taxes') return ['taxGrowth', 'govt', 'states'];
  if (name === 'theme' && arg === 'prices-and-inflation') return ['states', 'relationships', 'glance'];
  if (name === 'theme' && arg === 'government-finances') return ['dtax', 'taxGrowth', 'glance'];
  if (name === 'theme' && arg === 'trade-and-current-account') return ['exports', 'dependence', 'balance'];
  if (name === 'theme' || name === 'indicator') return ['glance', 'overview', 'sources'];
  return null;
}

export default function Related({ route }) {
  const hi = useLanguage().language === 'hi';
  const keys = linksFor(route);
  if (!keys) return null;
  return (
    <nav className="eb-related" aria-label={hi ? 'संबंधित पृष्ठ' : 'Related pages'}>
      <p className="eb-related-h">{hi ? 'संबंधित पृष्ठ' : 'Related pages'}</p>
      <ul>
        {keys.map((k) => <li key={k}><a href={P[k][0]}>{hi ? P[k][2] : P[k][1]}<span aria-hidden="true"> →</span></a></li>)}
      </ul>
    </nav>
  );
}
