import { useEffect, useState } from 'react';

// Tiny router: #/ overview, #/theme/<slug>, #/indicator/<id>, #/sources.
// Hash addresses work on GitHub Pages without any server setup.
function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [name, arg] = raw.split('/');
  return { name: name || 'overview', arg: arg ? decodeURIComponent(arg) : null };
}

export default function useHashRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
