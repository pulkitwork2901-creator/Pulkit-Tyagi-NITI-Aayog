import { useCallback, useEffect, useState } from 'react';

const REFRESH_MS = 30 * 60 * 1000;

// Loads the board's JSON and refreshes it every 30 minutes while the page is open.
export default function useIndicators(source) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  const load = useCallback(async () => {
    try {
      const res = await fetch(source, { cache: 'no-store' });
      if (!res.ok) throw new Error(`The data file returned ${res.status}`);
      const data = await res.json();
      setState({ status: 'ok', data, error: null });
    } catch (err) {
      setState((s) => ({ status: s.data ? 'ok' : 'error', data: s.data, error: err.message }));
    }
  }, [source]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return { ...state, reload: load };
}
