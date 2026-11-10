import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const LanguageContext = createContext(null);

const EXACT = {
  Dashboard: 'डैशबोर्ड',
  Themes: 'विषय',
  'Direct taxes': 'प्रत्यक्ष कर',
  'Collections, taxpayers and states': 'संग्रह, करदाता और राज्य',
  'Merchandise trade': 'वस्तु व्यापार',
  'Merchandise exports: partners and products': 'वस्तु निर्यात: साझेदार और उत्पाद',
  'Merchandise imports: partners and products': 'वस्तु आयात: साझेदार और उत्पाद',
  'Merchandise trade balance by partner': 'साझेदार के अनुसार वस्तु व्यापार संतुलन',
  'Sources and notes': 'स्रोत और टिप्पणियाँ',
  'Reload data': 'डेटा फिर लोड करें',
  Colours: 'रंग',
  'Colour scheme': 'रंग योजना',
  'Time range for all charts': 'सभी चार्ट की समय सीमा',
  'Headline indicators': 'मुख्य संकेतक',
  Trends: 'रुझान',
  'All indicators': 'सभी संकेतक',
  'Download all data (CSV)': 'सभी डेटा डाउनलोड करें (CSV)',
  'New on the board': 'बोर्ड पर नया',
  'Sources and freshness': 'स्रोत और ताज़गी',
  'Headline evidence': 'मुख्य प्रमाण',
  Consultations: 'परामर्श',
  Grievances: 'शिकायतें',
  MSMEs: 'एमएसएमई',
  'Governance scores': 'शासन स्कोर',
  Courts: 'न्यायालय',
  Insolvency: 'दिवालियापन',
  'Jan Vishwas': 'जन विश्वास',
  'NITI Aayog · Economics and Finance II Division': 'नीति आयोग · आर्थिक एवं वित्तीय कार्य प्रभाग II',
  'NITI Aayog · Governance and Reforms Division': 'नीति आयोग · शासन एवं सुधार प्रभाग',
  'Position as on': 'स्थिति',
  'refreshed daily from official sources': 'आधिकारिक स्रोतों से प्रतिदिन अपडेट',
  'Growth and prices': 'वृद्धि और कीमतें',
  'External sector': 'बाहरी क्षेत्र',
  'Fiscal and monetary': 'राजकोषीय और मौद्रिक',
  'Money, credit and capital flows': 'मुद्रा, ऋण और पूंजी प्रवाह',
  'Indicator not found': 'संकेतक नहीं मिला',
  'Theme not found': 'विषय नहीं मिला',
  'Print or save as PDF': 'प्रिंट करें या PDF के रूप में सहेजें',
  Latest: 'नवीनतम',
  Change: 'परिवर्तन',
  'Compared with': 'की तुलना में',
  Trend: 'रुझान',
  Source: 'स्रोत',
  Released: 'जारी',
  Unit: 'इकाई',
  Note: 'टिप्पणी',
  'Release history': 'जारी होने का इतिहास',
  'About this figure': 'इस आंकड़े के बारे में',
  'Latest releases': 'नवीनतम प्रकाशन',
  'Source of each indicator': 'प्रत्येक संकेतक का स्रोत',
  'Notes on the data': 'डेटा पर टिप्पणियाँ',
  'This year so far': 'इस वर्ष अब तक',
  Collections: 'संग्रह',
  'How tax is paid': 'कर कैसे चुकाया जाता है',
  'Taxes and the economy': 'कर और अर्थव्यवस्था',
  'Taxpayers and returns': 'करदाता और रिटर्न',
  'By state': 'राज्य के अनुसार',
  'About the data': 'डेटा के बारे में',
  Exports: 'निर्यात',
  Imports: 'आयात',
  Balance: 'संतुलन',
  'Year shown': 'दिखाया गया वर्ष',
  'Not available': 'उपलब्ध नहीं',
  'Could not load trade data': 'व्यापार डेटा लोड नहीं हो सका',
  awaiting: 'प्रतीक्षारत',
  'code revised': 'कोड संशोधित',
  'Part year only.': 'केवल आंशिक वर्ष।',
  'Eight months only.': 'केवल आठ महीने।',
  'All partners': 'सभी साझेदार',
  Surplus: 'अधिशेष',
  Deficit: 'घाटा',
  'Open for comments': 'टिप्पणियों के लिए खुला',
  'Show fewer': 'कम दिखाएँ',
  'Show all': 'सभी दिखाएँ',
  All: 'सभी',
  'Rule-making · regulator consultations and drafts': 'नियम निर्माण · नियामक परामर्श और मसौदे',
  'Ease of living · public grievances (CPGRAMS)': 'जीवन सुगमता · सार्वजनिक शिकायतें (CPGRAMS)',
  'Doing business · MSME registration (Udyam)': 'व्यवसाय सुगमता · एमएसएमई पंजीकरण (उद्यम)',
  'Governance scores · World Bank': 'शासन स्कोर · विश्व बैंक',
  'Courts · National Judicial Data Grid': 'न्यायालय · राष्ट्रीय न्यायिक डेटा ग्रिड',
  'Insolvency and Bankruptcy Code · IBBI': 'दिवालियापन और शोधन अक्षमता संहिता · IBBI',
  'Decriminalisation milestones · Jan Vishwas': 'अपराधमुक्ति के पड़ाव · जन विश्वास',
  'Justice and dispute resolution': 'न्याय और विवाद समाधान',
  'Real GDP growth': 'वास्तविक GDP वृद्धि',
  'CPI inflation': 'CPI मुद्रास्फीति',
  'Core CPI inflation (excluding food and fuel)': 'मुख्य CPI मुद्रास्फीति (भोजन और ईंधन को छोड़कर)',
  'Nominal GDP growth': 'नाममात्र GDP वृद्धि',
  'GDP deflator inflation': 'GDP डिफ्लेटर मुद्रास्फीति',
  'CPI inflation, rural': 'CPI मुद्रास्फीति, ग्रामीण',
  'CPI inflation, urban': 'CPI मुद्रास्फीति, शहरी',
  'IIP growth': 'IIP वृद्धि',
  'WPI inflation': 'WPI मुद्रास्फीति',
  'Unemployment rate': 'बेरोजगारी दर',
  'Merchandise exports': 'वस्तु निर्यात',
  'Merchandise imports': 'वस्तु आयात',
  'Merchandise trade balance': 'वस्तु व्यापार संतुलन',
  'Current account balance': 'चालू खाता शेष',
  'Services exports': 'सेवा निर्यात',
  'Services imports': 'सेवा आयात',
  'Services trade surplus': 'सेवा व्यापार अधिशेष',
  Remittances: 'प्रेषण',
  'Forex reserves': 'विदेशी मुद्रा भंडार',
  'Rupee per US dollar': 'अमेरिकी डॉलर के प्रति रुपया',
  'Centre’s fiscal deficit': 'केंद्र का राजकोषीय घाटा',
  'Centre’s capital expenditure': 'केंद्र का पूंजीगत व्यय',
  'Net direct tax collections': 'शुद्ध प्रत्यक्ष कर संग्रह',
  'Corporate tax collections': 'कॉर्पोरेट कर संग्रह',
  'Non-corporate tax collections (mainly personal income tax)': 'गैर-कॉर्पोरेट कर संग्रह (मुख्यतः व्यक्तिगत आयकर)',
  'Direct tax to GDP ratio': 'GDP में प्रत्यक्ष कर का अनुपात',
  'Direct taxes’ share of total tax revenue': 'कुल कर राजस्व में प्रत्यक्ष करों की हिस्सेदारी',
  'Persons filing income-tax returns': 'आयकर रिटर्न दाखिल करने वाले व्यक्ति',
  'Taxpayers (return filers plus those with tax deducted at source)': 'करदाता (रिटर्न दाखिल करने वाले और स्रोत पर कर कटौती वाले)',
};

const PHRASES = [
  ['The board could not load its data', 'बोर्ड अपना डेटा लोड नहीं कर सका'],
  ['Loading the latest figures', 'नवीनतम आंकड़े लोड हो रहे हैं'],
  ['Loading the latest indicators', 'नवीनतम संकेतक लोड हो रहे हैं'],
  ['Try again', 'फिर प्रयास करें'],
  ['Return to the overview', 'सारांश पर लौटें'],
  ['Select an indicator to see its full history and source.', 'पूरा इतिहास और स्रोत देखने के लिए कोई संकेतक चुनें।'],
  ['Figures refresh daily at 6 pm IST.', 'आंकड़े प्रतिदिन शाम 6 बजे IST पर अपडेट होते हैं।'],
  ['No new releases in the last', 'पिछले समय में कोई नया प्रकाशन नहीं'],
  ['last 10 days', 'पिछले 10 दिन'],
  ['Last 12 readings', 'पिछली 12 रीडिंग'],
  ['Not enough data in this period. Choose a longer range above.', 'इस अवधि में पर्याप्त डेटा नहीं है। ऊपर लंबी अवधि चुनें।'],
  ['Not enough years to draw a trend.', 'रुझान दिखाने के लिए पर्याप्त वर्ष नहीं हैं।'],
  ['A trend line appears once two releases are entered.', 'दो प्रकाशन दर्ज होने के बाद रुझान रेखा दिखाई देगी।'],
  ['Data as on', 'डेटा की स्थिति'],
  ['Read', 'पढ़ा गया'],
  ['refreshed', 'अपडेट किया गया'],
  ['not available yet', 'अभी उपलब्ध नहीं'],
  ['showing the last good copy', 'पिछली सही प्रति दिखाई जा रही है'],
  ['pending cases', 'लंबित मामले'],
  ['cases pending', 'मामले लंबित'],
  ['Age of pending cases', 'लंबित मामलों की आयु'],
  ['Age of pending grievances', 'लंबित शिकायतों की आयु'],
  ['Last month:', 'पिछला महीना:'],
  ['filed', 'दाखिल'],
  ['disposed', 'निपटाए गए'],
  ['clearance', 'निपटान दर'],
  ['falling', 'घट रहा है'],
  ['growing', 'बढ़ रहा है'],
  ['out of', 'में से'],
  ['rank', 'रैंक'],
  ['significant', 'महत्वपूर्ण'],
  ['within margin', 'सीमा के भीतर'],
  ['in the last 90 days', 'पिछले 90 दिनों में'],
  ['not refreshed today', 'आज अपडेट नहीं हुआ'],
  ['Show all', 'सभी दिखाएँ'],
  ['Show fewer', 'कम दिखाएँ'],
  ['Find a country or product', 'देश या उत्पाद खोजें'],
  ['No match.', 'कोई मिलान नहीं।'],
  ['Countries', 'देश'],
  ['Products', 'उत्पाद'],
  ['data awaited', 'डेटा प्रतीक्षारत'],
  ['not yet uploaded', 'अभी अपलोड नहीं हुआ'],
  ['share of all', 'सभी का हिस्सा'],
  ['countries and territories', 'देश और क्षेत्र'],
  ['Largest product', 'सबसे बड़ा उत्पाद'],
  ['Top 10 products', 'शीर्ष 10 उत्पाद'],
  ['Sources:', 'स्रोत:'],
];

const DATA_LABELS = {
  "Households' inflation expectations, one year ahead": 'घरेलू मुद्रास्फीति अपेक्षाएँ, एक वर्ष आगे',
  "Households' inflation expectations, three months ahead": 'घरेलू मुद्रास्फीति अपेक्षाएँ, तीन महीने आगे',
  "Households' perception of current inflation": 'घरेलू वर्तमान मुद्रास्फीति धारणा',
  'Capacity utilisation in manufacturing': 'विनिर्माण में क्षमता उपयोग',
  'Capacity utilisation in manufacturing, seasonally adjusted': 'विनिर्माण में क्षमता उपयोग, मौसमी रूप से समायोजित',
  'Manufacturing PMI (HSBC)': 'विनिर्माण PMI (HSBC)',
  'Services PMI (HSBC)': 'सेवा PMI (HSBC)',
  'Crude oil price (Indian basket)': 'कच्चे तेल की कीमत (भारतीय बास्केट)',
  'Crude oil price in rupees': 'रुपये में कच्चे तेल की कीमत',
  'Current account balance, US$': 'चालू खाता शेष, US$',
  'Net direct tax collections, this year so far': 'इस वर्ष अब तक शुद्ध प्रत्यक्ष कर संग्रह',
  'Gross direct tax collections (before refunds)': 'सकल प्रत्यक्ष कर संग्रह (रिफंड से पहले)',
  'Direct taxes’ share of total tax revenue': 'कुल कर राजस्व में प्रत्यक्ष करों की हिस्सेदारी',
  'Direct tax buoyancy': 'प्रत्यक्ष कर उछाल',
  'Cost of collecting direct taxes': 'प्रत्यक्ष कर संग्रह की लागत',
  'Income-tax returns filed': 'दाखिल आयकर रिटर्न',
  'State government market borrowing': 'राज्य सरकार का बाजार उधार',
  'Policy repo rate': 'नीतिगत रेपो दर',
  'Standing deposit facility rate': 'स्थायी जमा सुविधा दर',
  'Marginal standing facility rate': 'सीमांत स्थायी सुविधा दर',
  'Cash reserve ratio': 'नकद आरक्षित अनुपात',
  'Real policy rate (repo minus CPI inflation)': 'वास्तविक नीतिगत दर (रेपो माइनस CPI मुद्रास्फीति)',
  'Real 10-year yield (G-sec minus CPI inflation)': 'वास्तविक 10-वर्षीय प्रतिफल (G-sec माइनस CPI मुद्रास्फीति)',
  '91-day T-bill yield': '91-दिवसीय T-बिल प्रतिफल',
  '10-year G-sec yield': '10-वर्षीय G-sec प्रतिफल',
  'Non-food bank credit growth': 'गैर-खाद्य बैंक ऋण वृद्धि',
  'Credit to agriculture and allied activities': 'कृषि और संबद्ध गतिविधियों को ऋण',
  'Credit to industry': 'उद्योग को ऋण',
  'Credit to services': 'सेवा क्षेत्र को ऋण',
  'Personal loans': 'व्यक्तिगत ऋण',
  'Bank deposit growth': 'बैंक जमा वृद्धि',
  'Credit-deposit ratio': 'ऋण-जमा अनुपात',
  'Broad money (M3) growth': 'व्यापक मुद्रा (M3) वृद्धि',
  'Net FDI': 'शुद्ध FDI',
  'Gross FDI into India': 'भारत में सकल FDI',
  'Net portfolio investment': 'शुद्ध पोर्टफोलियो निवेश',
  'Net NRI deposit inflows': 'शुद्ध NRI जमा प्रवाह',
  'External commercial borrowing registrations': 'बाहरी वाणिज्यिक उधार पंजीकरण',
  'Digital payments, value': 'डिजिटल भुगतान, मूल्य',
};

function translate(value) {
  if (!value || typeof value !== 'string') return value;
  if (EXACT[value]) return EXACT[value];
  if (DATA_LABELS[value]) return DATA_LABELS[value];
  let out = value;
  for (const [from, to] of [...PHRASES, ...Object.entries(EXACT), ...Object.entries(DATA_LABELS)]
    .sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(from).join(to);
  }
  return out;
}

function useTranslatedDom(language) {
  const originals = useRef(new WeakMap());
  const attributes = useRef(new WeakMap());

  useEffect(() => {
    document.documentElement.lang = language === 'hi' ? 'hi' : 'en';
    const root = document.body;
    let updating = false;
    const update = () => {
      if (updating) return;
      updating = true;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!originals.current.has(node)) originals.current.set(node, node.nodeValue);
        const original = originals.current.get(node);
        const next = language === 'hi' ? translate(original) : original;
        if (node.nodeValue !== next) node.nodeValue = next;
      }
      root.querySelectorAll('[aria-label],[title],[placeholder]').forEach((el) => {
        let saved = attributes.current.get(el);
        if (!saved) {
          saved = {};
          attributes.current.set(el, saved);
        }
        ['aria-label', 'title', 'placeholder'].forEach((name) => {
          if (el.hasAttribute(name) && saved[name] == null) saved[name] = el.getAttribute(name);
          if (saved[name] != null) el.setAttribute(name, language === 'hi' ? translate(saved[name]) : saved[name]);
        });
      });
      updating = false;
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
    return () => observer.disconnect();
  }, [language, originals, attributes]);
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem('site-language') === 'hi' ? 'hi' : 'en'; } catch { return 'en'; }
  });
  const changeLanguage = (next) => {
    setLanguage(next);
    try { localStorage.setItem('site-language', next); } catch { /* keep it for this visit */ }
  };
  useTranslatedDom(language);
  const value = useMemo(() => ({ language, setLanguage: changeLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const hindi = language === 'hi';
  return (
    <div className="eb-language-switch" role="group" aria-label="Language">
      <button type="button" aria-pressed={!hindi} onClick={() => setLanguage('en')}>A <span>English</span></button>
      <button type="button" aria-pressed={hindi} onClick={() => setLanguage('hi')}>अ <span>हिंदी</span></button>
    </div>
  );
}
