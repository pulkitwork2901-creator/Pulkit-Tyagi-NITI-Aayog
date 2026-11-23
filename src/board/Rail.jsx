import { formatDateTime, slug } from './format.js';
import { LanguageToggle, useLanguage } from '../i18n.jsx';

function NavLink({ href, current, children }) {
  return (
    <a href={href} className="eb-navlink" aria-current={current ? 'page' : undefined}>{children}</a>
  );
}

function Group({ id, title, children }) {
  return (
    <>
      <p className="eb-navhead" id={id}>{title}</p>
      <div role="group" aria-labelledby={id}>{children}</div>
    </>
  );
}

// Theme names in Hindi (the sidebar renders its own labels in both languages;
// the board's phrase translator would also rewrite words such as "States"
// inside country names, so short labels are not added to its dictionary).
const THEME_HI = {
  'Growth and jobs': 'वृद्धि और रोज़गार', 'Prices and inflation': 'कीमतें और मुद्रास्फीति', 'Interest rates and monetary policy': 'ब्याज दरें और मौद्रिक नीति',
  'Banking and credit': 'बैंकिंग और ऋण', 'Government finances': 'सरकारी वित्त', 'Trade and current account': 'व्यापार और चालू खाता',
  'Capital flows, reserves and the rupee': 'पूंजी प्रवाह, भंडार और रुपया',
};

// Left navigation, in six groups: overview, the economy by theme, trade,
// states, analysis, and reports and data.
export default function Rail({ route, groups, data, error, onReload, skins = [], skin, onSkin }) {
  const hi = useLanguage().language === 'hi';
  const L = (en, h) => (hi ? h : en);
  const mospi = data?.sources?.mospi;
  const stale = mospi && mospi.status !== 'ok';
  const active = route.name === 'indicator' ? route.group : null;
  const themes = groups.filter((g) => g !== 'Direct taxes');
  const isTheme = (g) => (route.name === 'theme' && route.arg === slug(g)) || active === g;
  return (
    <aside className="eb-rail">
      <div className="eb-brand">
        <p className="eb-brand-name">NITI Aayog</p>
        <p className="eb-brand-unit">Economics and Finance II Division</p>
        <LanguageToggle />
      </div>
      <nav aria-label={L('Board sections', 'बोर्ड के खंड')}>
        <Group id="eb-nav-overview" title={L('Overview', 'अवलोकन')}>
          <NavLink href="#/" current={route.name === 'overview'}>{L('Dashboard', 'डैशबोर्ड')}</NavLink>
          <NavLink href="#/glance" current={route.name === 'glance'}>{L('The economy at a glance', 'एक नज़र में अर्थव्यवस्था')}</NavLink>
        </Group>
        <Group id="eb-nav-themes" title={L('Economy by theme', 'विषय के अनुसार अर्थव्यवस्था')}>
          {themes.map((g) => (
            <span key={g} className="eb-navitem">
              <NavLink href={`#/theme/${slug(g)}`} current={isTheme(g)}>{L(g, THEME_HI[g] || g)}</NavLink>
              {g === 'Government finances' && (
                <NavLink href="#/direct-taxes" current={route.name === 'direct-taxes' || (route.name === 'theme' && route.arg === 'direct-taxes') || active === 'Direct taxes'}>
                  <span className="eb-navsub">{L('Direct taxes', 'प्रत्यक्ष कर')}</span>
                </NavLink>
              )}
            </span>
          ))}
        </Group>
        <Group id="eb-nav-trade" title={L('Trade', 'व्यापार')}>
          <NavLink href="#/exports" current={route.name === 'exports'}>{L('Exports', 'निर्यात')}</NavLink>
          <NavLink href="#/imports" current={route.name === 'imports'}>{L('Imports', 'आयात')}</NavLink>
          <NavLink href="#/balance" current={route.name === 'balance'}>{L('Trade balance', 'व्यापार संतुलन')}</NavLink>
          <NavLink href="#/dependence" current={route.name === 'dependence'}>{L('Import dependence', 'आयात निर्भरता')}</NavLink>
        </Group>
        <Group id="eb-nav-states" title={L('States', 'राज्य')}>
          <NavLink href="#/states" current={route.name === 'states'}>{L('State profiles', 'राज्य प्रोफ़ाइल')}</NavLink>
        </Group>
        <Group id="eb-nav-analysis" title={L('Analysis and outlook', 'विश्लेषण और परिदृश्य')}>
          <NavLink href="#/discoveries" current={route.name === 'discoveries'}>{L('Discoveries', 'खोजें')}</NavLink>
          <NavLink href="#/forecasts" current={route.name === 'forecasts' || route.name === 'analysis'}>{L('Forecasts and track record', 'पूर्वानुमान और उनका रिकॉर्ड')}</NavLink>
          <NavLink href="#/relationships" current={route.name === 'relationships'}>{L('How indicators move together', 'संकेतक साथ कैसे चलते हैं')}</NavLink>
          <NavLink href="#/tax-growth" current={route.name === 'tax-growth'}>{L('Taxes and growth', 'कर और वृद्धि')}</NavLink>
        </Group>
        <Group id="eb-nav-reports" title={L('Reports and data', 'रिपोर्ट और आंकड़े')}>
          <NavLink href="#/sources" current={route.name === 'sources'}>{L('Sources and notes', 'स्रोत और टिप्पणियाँ')}</NavLink>
        </Group>
      </nav>
      <div className="eb-railstatus" role="status">
        <p><span className={`eb-status-dot ${stale ? 'eb-status-stale' : ''}`} aria-hidden="true" />{stale ? 'MoSPI not reachable. Showing the last good figures.' : 'MoSPI figures are up to date.'}</p>
        <p className="eb-railmuted">Data as on {formatDateTime(data.generated_at)}</p>
        {data?.sources?.rbi?.age_days > 14 && (
          <p className="eb-railwarn"><span className="eb-status-dot eb-status-stale" aria-hidden="true" />RBI figures are {data.sources.rbi.age_days} days old. Upload a fresh DBIE download to data/rbi/.</p>
        )}
        {error && <p className="eb-railmuted">Latest reload failed: {error}</p>}
        <button type="button" className="eb-btn eb-btn-rail" onClick={onReload}>Reload data</button>
        {skins.length > 0 && (
          <div className="eb-skins" role="group" aria-label="Colour scheme">
            <span className="eb-railmuted eb-skins-label">Colours</span>
            {skins.map((k) => (
              <button key={k.id} type="button" className={`eb-skin eb-skin-${k.id}`} aria-pressed={skin === k.id}
                onClick={() => onSkin(k.id)} title={`${k.label} colour scheme`}>
                <i aria-hidden="true" />{k.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
