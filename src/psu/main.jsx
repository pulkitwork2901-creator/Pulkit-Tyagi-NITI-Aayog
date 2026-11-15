import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PsuBoard from './PsuBoard.jsx';
import { LanguageProvider } from '../i18n.jsx';

// Static hosting: read the JSON built by scripts/build_psu.py.
const DATA_URL = `${import.meta.env.BASE_URL}data/psu/psu.json`;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider><PsuBoard source={DATA_URL} /></LanguageProvider>
  </StrictMode>,
);
