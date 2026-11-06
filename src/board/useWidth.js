import { useEffect, useRef, useState } from 'react';

// Measures an element's width so SVG charts can draw at real pixel size.
export default function useWidth(fallback = 320, min = 200) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(min, Math.round(entry.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width];
}
