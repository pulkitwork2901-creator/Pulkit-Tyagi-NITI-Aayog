import { formatDateTime, slug } from './format.js';

function NavLink({ href, current, children }) {
  return (
    <a href={href} className="eb-navlink" aria-current={current ? 'page' : undefined}>{children}</a>
  );
}

// Left navigation: the overview, one page per theme, and the sources page.
export default function Rail({ route, groups, data, error, onReload }) {
  const mospi = data?.sources?.mospi;
  const stale = mospi && mospi.status !== 'ok';
  const active = route.name === 'indicator' ? route.group : null;
  return (
    <aside className="eb-rail">
      <div className="eb-brand">
        <p className="eb-brand-name">NITI Aayog</p>
        <p className="eb-brand-unit">Economics and Finance II Division</p>
      </div>
      <nav aria-label="Board sections">
        <NavLink href="#/" current={route.name === 'overview'}>Dashboard</NavLink>
        <p className="eb-navhead" id="eb-themes">Themes</p>
        <div role="group" aria-labelledby="eb-themes">
          {groups.map((g) => (
            <NavLink key={g} href={`#/theme/${slug(g)}`} current={(route.name === 'theme' && route.arg === slug(g)) || active === g}>{g}</NavLink>
          ))}
        </div>
        <NavLink href="#/sources" current={route.name === 'sources'}>Sources and notes</NavLink>
      </nav>
      <div className="eb-railstatus" role="status">
        <p><span className={`eb-status-dot ${stale ? 'eb-status-stale' : ''}`} aria-hidden="true" />{stale ? 'MoSPI not reachable. Showing the last good figures.' : 'MoSPI figures are up to date.'}</p>
        <p className="eb-railmuted">Data as on {formatDateTime(data.generated_at)}</p>
        {error && <p className="eb-railmuted">Latest reload failed: {error}</p>}
        <button type="button" className="eb-btn eb-btn-rail" onClick={onReload}>Reload data</button>
      </div>
    </aside>
  );
}
