// Hindi text for the Analysis page (#/analysis). The page's sentences are
// written in both languages in the components; this file holds the Hindi for
// labels that arrive in public/data/models.json (series, pairs, divisions,
// states), keyed the same way as the data.

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MON_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

export const SHORT = {
  crude_yoy: 'oil prices', cpi: 'CPI inflation', cpi_core: 'core inflation', inr_yoy: 'rupee depreciation', inr_3m: 'rupee depreciation',
  repo_chg: 'the repo rate', credit: 'bank credit growth', deposit: 'deposit growth', m3: 'money growth', infl_exp_1y: "households' expected inflation",
  gsec10: 'the 10-year G-sec yield', imports_yoy: 'imports', exports_yoy: 'exports', fpi: 'portfolio inflows', gst_yoy: 'GST collections',
};

export const SHORT_HI = {
  crude_yoy: 'तेल की कीमतें', cpi: 'CPI मुद्रास्फीति', cpi_core: 'कोर मुद्रास्फीति', inr_yoy: 'रुपये का अवमूल्यन', inr_3m: 'रुपये का अवमूल्यन',
  repo_chg: 'रेपो दर', credit: 'बैंक ऋण वृद्धि', deposit: 'जमा वृद्धि', m3: 'मुद्रा वृद्धि', infl_exp_1y: 'परिवारों की अपेक्षित मुद्रास्फीति',
  gsec10: '10-वर्षीय G-sec प्रतिफल', imports_yoy: 'आयात', exports_yoy: 'निर्यात', fpi: 'पोर्टफोलियो प्रवाह', gst_yoy: 'GST संग्रह',
};

export const LABEL_HI = {
  cpi: 'CPI मुद्रास्फीति (% वार्षिक)',
  cpi_core: 'कोर CPI मुद्रास्फीति (% वार्षिक)',
  infl_exp_1y: 'परिवारों की एक वर्ष आगे की अपेक्षित मुद्रास्फीति (%)',
  crude_yoy: 'कच्चे तेल की कीमत, US$ (एक वर्ष में % परिवर्तन)',
  inr_yoy: 'US$ के मुकाबले रुपये का अवमूल्यन (एक वर्ष में %)',
  repo_chg: 'रेपो दर (एक वर्ष में परिवर्तन, प्रतिशत अंक)',
  gsec10: '10-वर्षीय G-sec प्रतिफल (%)',
  credit: 'गैर-खाद्य बैंक ऋण वृद्धि (% वार्षिक)',
  deposit: 'बैंक जमा वृद्धि (% वार्षिक)',
  m3: 'व्यापक मुद्रा वृद्धि (% वार्षिक)',
  exports_yoy: 'वस्तु निर्यात, 3 महीने (एक वर्ष में %)',
  imports_yoy: 'वस्तु आयात, 3 महीने (एक वर्ष में %)',
  gst_yoy: 'सकल GST, 3 महीने (एक वर्ष में %)',
  fpi: 'शुद्ध पोर्टफोलियो प्रवाह, 3 महीने (अरब US$)',
  inr_3m: '3 महीनों में रुपये का अवमूल्यन (%)',
};

export const PAIR_HI = {
  'crude_yoy|cpi': ['तेल का असर ईंधन, परिवहन और कच्चे माल की लागत पर पड़ता है।',
    'PPAC ने 2022-23 के लिए कच्चे तेल की मासिक कीमतें प्रकाशित नहीं कीं, इसलिए यह केवल उसके बाद के महीनों पर आधारित है।'],
  'inr_yoy|cpi': ['कमज़ोर रुपया तेल सहित सभी आयातों को रुपये में महँगा बनाता है।', ''],
  'repo_chg|credit': ['ऊँची नीतिगत दरों से, कुछ समय बाद, बैंक ऋण की वृद्धि धीमी होनी चाहिए।',
    'यहाँ संबंध सकारात्मक है: RBI ने 2022-24 में दरें ठीक तब बढ़ाईं जब कोविड के बाद ऋण तेज़ी से बढ़ रहा था। दोनों एक ही चक्र के साथ चले; इसका अर्थ यह नहीं कि दरें बढ़ने से ऋण बढ़ता है।'],
  'repo_chg|cpi': ['मौद्रिक नीति का असर मुद्रास्फीति पर कुछ देरी से होता है।',
    'RBI मुद्रास्फीति को देखकर भी रेपो दर तय करता है, इसलिए दोनों एक-दूसरे को एक साथ प्रभावित करते हैं; साधारण सहसंबंध इन्हें अलग नहीं कर सकता।'],
  'cpi|infl_exp_1y': ['क्या परिवारों की अपेक्षाएँ उस मुद्रास्फीति के पीछे चलती हैं जो उन्होंने देखी है?',
    'अपेक्षाओं का सर्वेक्षण हर दो महीने में होता है, इसलिए केवल उन्हीं महीनों का उपयोग किया गया है।'],
  'cpi|gsec10': ['मुद्रास्फीति बढ़ने पर बॉन्ड निवेशक ऊँचा प्रतिफल माँगते हैं।', ''],
  'imports_yoy|exports_yoy': ['भारत के निर्यात का बड़ा हिस्सा आयातित कच्चे माल से बनता है।',
    'दोनों विश्व कीमतों, खासकर तेल की कीमतों, के साथ भी ऊपर-नीचे होते हैं; भारत तेल आयात करता है, उसे परिष्कृत करता है और फिर निर्यात करता है।'],
  'fpi|inr_3m': ['पोर्टफोलियो निवेश के बाहर जाने से रुपया कमज़ोर होता है।', ''],
  'credit|gst_yoy': ['तेज़ ऋण और तेज़ खर्च आमतौर पर साथ-साथ चलते हैं।', ''],
};

export const SERIES_HI = {
  cpi: 'CPI मुद्रास्फीति', cpi_core: 'कोर CPI मुद्रास्फीति', credit_nonfood: 'गैर-खाद्य बैंक ऋण वृद्धि', deposit_growth: 'बैंक जमा वृद्धि',
  m3_growth: 'व्यापक मुद्रा (M3) वृद्धि', exports: 'वस्तु निर्यात', imports: 'वस्तु आयात', gst_gross: 'सकल GST संग्रह',
  inr_usd: 'रुपया प्रति अमेरिकी डॉलर', gsec10: '10-वर्षीय G-sec प्रतिफल',
};

export const UNIT_HI = {
  '% year on year': '% वार्षिक', 'US$ bn a month': 'अरब US$ प्रति माह', '₹ lakh crore a month': '₹ लाख करोड़ प्रति माह',
  '₹ per US$': '₹ प्रति US$', '%': '%', '% on a year': '% (एक वर्ष में वृद्धि)',
};

export const TAX_HI = {
  net: 'शुद्ध प्रत्यक्ष कर', corporate: 'कॉर्पोरेट कर', non_corporate: 'गैर-कॉर्पोरेट कर (मुख्यतः व्यक्तिगत आयकर)',
};
export const CHECK_HI = {
  net: 'शुद्ध प्रत्यक्ष कर', corporate: 'कॉर्पोरेट कर (शुद्ध)', non_corporate: 'गैर-कॉर्पोरेट कर, STT सहित (शुद्ध)',
};

export const DIVISION_HI = {
  '01': 'खाद्य और पेय पदार्थ',
  '02': 'पान, तंबाकू और मादक पदार्थ',
  '03': 'कपड़े और जूते',
  '04': 'आवास, पानी, बिजली, गैस और अन्य ईंधन',
  '05': 'फ़र्नीचर, घरेलू उपकरण और नियमित घरेलू रखरखाव',
  '06': 'स्वास्थ्य',
  '07': 'परिवहन',
  '08': 'सूचना और संचार',
  '09': 'मनोरंजन, खेल और संस्कृति',
  '10': 'शिक्षा सेवाएँ',
  '11': 'रेस्तरां और आवास सेवाएँ',
  '12': 'बीमा और वित्तीय सेवाएँ',
  '13': 'व्यक्तिगत देखभाल, सामाजिक सुरक्षा और विविध वस्तुएँ एवं सेवाएँ',
};

// States and union territories as MoSPI names them, with a short code and a
// place on an 8 x 7 tile grid that keeps each roughly where it sits on the map.
export const STATES = {
  'Jammu And Kashmir': ['JK', 2, 0, 'जम्मू और कश्मीर'],
  Ladakh: ['LA', 3, 0, 'लद्दाख'],
  Punjab: ['PB', 1, 1, 'पंजाब'],
  'Himachal Pradesh': ['HP', 2, 1, 'हिमाचल प्रदेश'],
  Uttarakhand: ['UK', 3, 1, 'उत्तराखंड'],
  'Arunachal Pradesh': ['AR', 8, 1, 'अरुणाचल प्रदेश'],
  Chandigarh: ['CH', 1, 2, 'चंडीगढ़'],
  Haryana: ['HR', 2, 2, 'हरियाणा'],
  'NCT of Delhi': ['DL', 3, 2, 'दिल्ली'],
  'Uttar Pradesh': ['UP', 4, 2, 'उत्तर प्रदेश'],
  Bihar: ['BR', 5, 2, 'बिहार'],
  Sikkim: ['SK', 6, 2, 'सिक्किम'],
  Assam: ['AS', 7, 2, 'असम'],
  Nagaland: ['NL', 8, 2, 'नागालैंड'],
  Rajasthan: ['RJ', 2, 3, 'राजस्थान'],
  'Madhya Pradesh': ['MP', 3, 3, 'मध्य प्रदेश'],
  Chhattisgarh: ['CG', 4, 3, 'छत्तीसगढ़'],
  Jharkhand: ['JH', 5, 3, 'झारखंड'],
  'West Bengal': ['WB', 6, 3, 'पश्चिम बंगाल'],
  Meghalaya: ['ML', 7, 3, 'मेघालय'],
  Manipur: ['MN', 8, 3, 'मणिपुर'],
  Gujarat: ['GJ', 1, 4, 'गुजरात'],
  Maharashtra: ['MH', 2, 4, 'महाराष्ट्र'],
  Telangana: ['TS', 3, 4, 'तेलंगाना'],
  Odisha: ['OD', 4, 4, 'ओडिशा'],
  Tripura: ['TR', 7, 4, 'त्रिपुरा'],
  Mizoram: ['MZ', 8, 4, 'मिज़ोरम'],
  'The Dadra And Nagar Haveli And Daman And Diu': ['DH', 1, 5, 'दादरा और नगर हवेली और दमन और दीव'],
  Goa: ['GA', 2, 5, 'गोवा'],
  Karnataka: ['KA', 3, 5, 'कर्नाटक'],
  'Andhra Pradesh': ['AP', 4, 5, 'आंध्र प्रदेश'],
  Lakshadweep: ['LD', 1, 6, 'लक्षद्वीप'],
  Kerala: ['KL', 3, 6, 'केरल'],
  'Tamil Nadu': ['TN', 4, 6, 'तमिलनाडु'],
  Puducherry: ['PY', 5, 6, 'पुडुचेरी'],
  'Andaman And Nicobar Islands': ['AN', 8, 6, 'अंडमान और निकोबार द्वीप समूह'],
};
export const INDIA_NAME = 'All India';
export const INDIA_HI = 'अखिल भारत';

// Indicator names and units for the heat map in Hindi (the board's phrase
// dictionary does not cover all of them, and part-translated labels read badly).
export const HEAT_HI = {
  gdp: 'वास्तविक GDP वृद्धि', gdp_nominal: 'सांकेतिक GDP वृद्धि', iip: 'IIP वृद्धि',
  capacity_util: 'विनिर्माण में क्षमता उपयोग', capacity_util_sa: 'विनिर्माण में क्षमता उपयोग, मौसमी समायोजित', unemployment: 'बेरोज़गारी दर',
  cpi: 'CPI मुद्रास्फीति', cpi_core: 'कोर CPI मुद्रास्फीति (खाद्य और ईंधन के बिना)', cpi_rural: 'CPI मुद्रास्फीति, ग्रामीण', cpi_urban: 'CPI मुद्रास्फीति, शहरी',
  wpi: 'WPI मुद्रास्फीति', wpi_food: 'WPI खाद्य मुद्रास्फीति', gdp_deflator: 'GDP अपस्फीतिक मुद्रास्फीति',
  infl_exp_1y: 'परिवारों की मुद्रास्फीति अपेक्षा, एक वर्ष आगे', infl_exp_3m: 'परिवारों की मुद्रास्फीति अपेक्षा, तीन महीने आगे', infl_perception: 'वर्तमान मुद्रास्फीति की परिवारों की धारणा',
  crude_basket: 'कच्चे तेल की कीमत (भारतीय बास्केट)', crude_basket_inr: 'रुपये में कच्चे तेल की कीमत',
  repo: 'नीतिगत रेपो दर', sdf_rate: 'स्थायी जमा सुविधा दर', msf_rate: 'सीमांत स्थायी सुविधा दर', crr: 'नकद आरक्षित अनुपात',
  tbill_91: '91-दिवसीय T-बिल प्रतिफल', gsec10: '10-वर्षीय G-sec प्रतिफल', real_repo: 'वास्तविक नीतिगत दर (रेपो माइनस CPI मुद्रास्फीति)',
  real_gsec10: 'वास्तविक 10-वर्षीय प्रतिफल (G-sec माइनस CPI मुद्रास्फीति)', m3_growth: 'व्यापक मुद्रा (M3) वृद्धि',
  credit_nonfood: 'गैर-खाद्य बैंक ऋण वृद्धि', credit_agri: 'कृषि और संबद्ध गतिविधियों को ऋण', credit_industry: 'उद्योग को ऋण',
  credit_services: 'सेवा क्षेत्र को ऋण', credit_personal: 'व्यक्तिगत ऋण', deposit_growth: 'बैंक जमा वृद्धि', cd_ratio: 'ऋण-जमा अनुपात',
  digital_payments: 'डिजिटल भुगतान, मूल्य', fiscal_deficit: 'केंद्र का राजकोषीय घाटा', capex_centre: 'केंद्र का पूंजीगत व्यय',
  gst_gross: 'सकल GST संग्रह', sdl_borrowing: 'राज्य सरकारों का बाज़ार उधार',
  dt_net: 'शुद्ध प्रत्यक्ष कर संग्रह', dt_corporate: 'कॉर्पोरेट कर संग्रह', dt_noncorporate: 'गैर-कॉर्पोरेट कर संग्रह (मुख्यतः व्यक्तिगत आयकर)',
  dt_gross: 'सकल प्रत्यक्ष कर संग्रह (रिफंड से पहले)', dt_gdp: 'GDP में प्रत्यक्ष कर का अनुपात', dt_share: 'कुल कर राजस्व में प्रत्यक्ष करों का हिस्सा',
  dt_buoyancy: 'प्रत्यक्ष कर उछाल', dt_cost: 'प्रत्यक्ष कर संग्रह की लागत',
  exports: 'वस्तु निर्यात', imports: 'वस्तु आयात', trade_balance: 'वस्तु व्यापार संतुलन', services_exports: 'सेवा निर्यात',
  services_imports: 'सेवा आयात', services_net: 'सेवा व्यापार अधिशेष', remittances: 'प्रेषण (व्यक्तिगत अंतरण प्राप्तियाँ)',
  cad: 'चालू खाता शेष', ca_usd: 'चालू खाता शेष, US$', ca_goods: 'चालू खाता: वस्तु शेष', ca_services: 'चालू खाता: सेवा शेष',
  ca_primary: 'चालू खाता: प्राथमिक आय (शुद्ध)', ca_secondary: 'चालू खाता: अंतरण (शुद्ध)',
  fdi_net: 'शुद्ध FDI', fdi_gross: 'भारत में सकल FDI', fpi_net: 'शुद्ध पोर्टफोलियो निवेश', ecb_reg: 'बाहरी वाणिज्यिक उधार पंजीकरण',
  fx_reserves: 'विदेशी मुद्रा भंडार', inr_usd: 'रुपया प्रति अमेरिकी डॉलर', fwd_premia_3m: 'US$ पर 3-महीने का वायदा प्रीमियम',
  ext_debt: 'बाहरी ऋण, सकल', niip: 'शुद्ध अंतरराष्ट्रीय निवेश स्थिति',
};

export const HEAT_UNIT_HI = {
  '%': '%', '% (FBIL)': '% (FBIL)', '% (median)': '% (माध्यिका)', '% YoY': '% वार्षिक', '% a year': '% प्रति वर्ष', '% of BE': '% बजट अनुमान का',
  '% of GDP': '% GDP का', '% of collections': '% संग्रह का', '% of deposits': '% जमा का', '% of total tax revenue': '% कुल कर राजस्व का',
  '% on a year': '% वार्षिक', 'US$ bn': 'अरब US$', 'US$ bn a quarter': 'अरब US$ प्रति तिमाही', 'times nominal GDP growth': 'गुना सांकेतिक GDP वृद्धि',
};

export const CATEGORY_HI = {
  'Growth and jobs': 'वृद्धि और रोज़गार', 'Prices and inflation': 'कीमतें और मुद्रास्फीति', 'Interest rates and monetary policy': 'ब्याज दरें और मौद्रिक नीति',
  'Banking and credit': 'बैंकिंग और ऋण', 'Government finances': 'सरकारी वित्त', 'Direct taxes': 'प्रत्यक्ष कर',
  'Trade and current account': 'व्यापार और चालू खाता', 'Capital flows, reserves and the rupee': 'पूंजी प्रवाह, भंडार और रुपया',
};
