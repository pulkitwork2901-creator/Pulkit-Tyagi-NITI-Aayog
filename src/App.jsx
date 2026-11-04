import EconomicBoard from './board/EconomicBoard.jsx';

// Static hosting (GitHub Pages): read the JSON built by scripts/build_indicators.py.
// Inside your FastAPI app: pass source="/api/indicators" instead.
const DATA_URL = `${import.meta.env.BASE_URL}data/indicators.json`;

export default function App() {
  return <EconomicBoard source={DATA_URL} />;
}
