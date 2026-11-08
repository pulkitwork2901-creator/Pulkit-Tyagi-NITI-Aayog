import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ReformBoard from './ReformBoard.jsx';

// Static hosting: read the JSON built by scripts/build_reform.py.
const DATA_URL = `${import.meta.env.BASE_URL}data/reform/evidence.json`;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ReformBoard source={DATA_URL} />
  </StrictMode>,
);
