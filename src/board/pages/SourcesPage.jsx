import { formatDate } from '../format.js';

export default function SourcesPage({ indicators }) {
  return (
    <>
      <header className="eb-pagehead">
        <h1>Sources and notes</h1>
        <p className="eb-asof">Where each figure comes from and how it reaches the board.</p>
      </header>

      <section className="eb-section" aria-labelledby="eb-src-table">
        <h2 id="eb-src-table">Source of each indicator</h2>
        <div className="eb-tablewrap">
          <table className="eb-table">
            <caption className="eb-sr">Source, release date and route for every indicator</caption>
            <thead>
              <tr><th scope="col">Indicator</th><th scope="col">Source</th><th scope="col" className="eb-hide-sm">Released</th><th scope="col" className="eb-hide-sm">Route</th></tr>
            </thead>
            <tbody>
              {indicators.map((i) => (
                <tr key={i.id}>
                  <th scope="row"><a href={`#/indicator/${i.id}`}>{i.label}</a></th>
                  <td>{i.source_url ? <a href={i.source_url} target="_blank" rel="noreferrer">{i.source}</a> : i.source}</td>
                  <td className="eb-hide-sm eb-muted eb-nowrap">{i.released ? formatDate(i.released) : 'On rebuild'}</td>
                  <td className="eb-hide-sm">{i.mode === 'live' ? 'Live from MoSPI' : i.mode === 'rbi' ? 'RBI DBIE download' : 'Team sheet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="eb-section eb-prose" aria-labelledby="eb-src-notes">
        <h2 id="eb-src-notes">Notes on the data</h2>
        <p>GDP and CPI come from MoSPI’s official API each time the data is rebuilt, which happens every day at 6 pm IST and whenever the team sheet changes. All other figures come from the team sheet (data/manual-indicators.csv), with one row per official release. The board shows the latest row for each indicator and keeps the earlier rows as history.</p>
        <p>IIP is entered by hand because MoSPI’s API still serves the old 2011-12 base, while the official IIP moved to the 2022-23 base in June 2026. The rupee rate and the 10-year G-sec yield are market closes reported in the press, not the FBIL reference rate.</p>
        <p>Bank credit growth is the year-on-year change in outstanding credit from RBI’s sectoral deployment release. Non-food credit comes from the fortnightly Section-42 return, and the sector figures come from the sector-wise return that covers about 95 per cent of non-food credit, so the two use different reference dates. RBI also notes that from 31 December 2025 the latest figure is as on the last day of the month, while the year-ago figure is for the last reporting fortnight under the old definition, so growth across that date is not fully like for like. The comparison shown for credit is the growth rate a year earlier.</p>
        <p>Net FDI and net FPI come from Table 35 of RBI’s monthly Bulletin, in US$ million converted here to US$ billion. They are provisional and are compared with the same month a year earlier. FPI here means the FPI line of the table, before portfolio investment by India.</p>
        <p>Changes are measured against the comparison stated in each release, such as the previous quarter, the previous month or a year earlier. The comparison is named beside each change. Green and red show whether a move is favourable, and the arrow shows its direction.</p>
      </section>
    </>
  );
}
