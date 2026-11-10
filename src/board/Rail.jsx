import { formatDateTime, slug } from './format.js';
import { LanguageToggle } from '../i18n.jsx';

function NavLink({ href, current, children }) {
  return (
    <a href={href} className="eb-navlink" aria-current={current ? 'page' : undefined}>{children}</a>
  );
}

// Left navigation: the overview, one page per theme, and the sources page.
export default function Rail({ route, groups, data, error, onReload, skins = [], skin, onSkin }) {
  const mospi = data?.sources?.mospi;
  const stale = mospi && mospi.status !== 'ok';
  const active = route.name === 'indicator' ? route.group : null;
  return (
    <aside className="eb-rail">
      <div className="eb-brand">
        <p className="eb-brand-name">NITI Aayog</p>
        <p className="eb-brand-unit">Economics and Finance II Division</p>
        <LanguageToggle />
      </div>
      <nav aria-label="Board sections">
        <NavLink href="#/" current={route.name === 'overview'}>Dashboard</NavLink>
        <p className="eb-navhead" id="eb-themes">Themes</p>
        <div role="group" aria-labelledby="eb-themes">
          {groups.filter((g) => g !== 'Direct taxes').map((g) => (
            <NavLink key={g} href={`#/theme/${slug(g)}`} current={(route.name === 'theme' && route.arg === slug(g)) || active === g}>{g}</NavLink>
          ))}
        </div>
        <p className="eb-navhead" id="eb-dtax">Direct taxes</p>
        <div role="group" aria-labelledby="eb-dtax">
          <NavLink href="#/direct-taxes" current={route.name === 'direct-taxes' || (route.name === 'theme' && route.arg === 'direct-taxes') || active === 'Direct taxes'}>Collections, taxpayers and states</NavLink>
        </div>
        <p className="eb-navhead" id="eb-trade">Merchandise trade</p>
        <div role="group" aria-labelledby="eb-trade">
          <NavLink href="#/exports" current={route.name === 'exports'}>Merchandise exports: partners and products</NavLink>
          <NavLink href="#/imports" current={route.name === 'imports'}>Merchandise imports: partners and products</NavLink>
          <NavLink href="#/balance" current={route.name === 'balance'}>Merchandise trade balance by partner</NavLink>
        </div>
        <NavLink href="#/sources" current={route.name === 'sources'}>Sources and notes</NavLink>
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
