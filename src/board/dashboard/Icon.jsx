// Small line icons (24 x 24 grid, drawn in currentColor) that label each panel
// and tile at a glance. Purely decorative: every one sits next to a text title.
const PATHS = {
  growth: 'M4 20V10M10 20V6M16 20v-8M3 20h18M14 5l3-2 3 2',
  prices: 'M3 12l9-9h7v7l-9 9-7-7zM15.5 7.5h.01',
  wholesale: 'M3 9l9-5 9 5v11H3V9zM8 20v-6h8v6',
  rates: 'M6 18L18 6M7.5 7.5h.01M16.5 16.5h.01M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  money: 'M4 7h16v10H4zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7 7v10M17 7v10',
  trade: 'M3 17h13l3-4H6l-3 4zM7 13V8h6v5M9 8V5h2v3M3 20c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1',
  flows: 'M4 8h13l-3-3M20 16H7l3 3',
  jobs: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  reserves: 'M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7l8-4zM9 12l2 2 4-4',
  rupee: 'M7 5h10M7 9h10M7 5c5 0 6 2 6 4s-2 4-6 4l7 6',
  credit: 'M3 6h18v12H3zM3 10h18M7 15h3',
};

export default function Icon({ name, size = 18 }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg className="eb-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
