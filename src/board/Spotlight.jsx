import { useTradeFile } from './trade/tradeKit.jsx';
import { useLanguage } from '../i18n.jsx';
import { describe, kindName } from './pages/discoveriesText.js';

// The dashboard's "found in the data today" band: the three highest-scoring
// findings from public/data/insights.json, linking to #/discoveries.
export default function Spotlight({ base }) {
  const hi = useLanguage().language === 'hi';
  const { data } = useTradeFile(`${base}insights.json`);
  if (!data?.insights?.length) return null;
  const top = data.insights.slice(0, 3);
  return (
    <section className="eb-spot" aria-labelledby="eb-spot-h">
      <div className="eb-spot-head">
        <h2 className="eb-eyebrow" id="eb-spot-h">{hi ? 'आज आंकड़ों में मिला' : 'Found in the data today'}</h2>
        <a className="eb-more" href="#/discoveries">{hi ? `सभी ${data.insights.length} खोजें` : `All ${data.insights.length} discoveries`}<span aria-hidden="true"> →</span></a>
      </div>
      <ol className="eb-spot-list">
        {top.map((x) => {
          const { title } = describe(x, hi);
          return (
            <li key={`${x.kind}-${x.rank}`}>
              <a href="#/discoveries">
                <span className="eb-ds-tag">{kindName(x.kind, hi)}</span>
                <span className="eb-spot-title">{title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
