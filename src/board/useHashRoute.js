import { useEffect, useState } from 'react';

// Tiny router: #/ dashboard, #/theme/<slug>, #/indicator/<id>, #/sources,
// #/exports | #/imports (+ /country/<id>, /product/<hs8>), #/balance.
// Hash addresses work on GitHub Pages without any server setup.
function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [name, arg, arg2] = raw.split('/');
  return {
    name: name || 'overview',
    arg: arg ? decodeURIComponent(arg) : null,
    arg2: arg2 ? decodeURIComponent(arg2) : null,
  };
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
