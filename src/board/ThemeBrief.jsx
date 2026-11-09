import { formatValue, signed } from './format.js';

// Two sentences under each theme heading that tell a first-time reader what
// the indicators say together. Written from the latest figures, so the words
// change with the data; any figure that is missing is simply left out.

const f = (v, d = 1) => signed(formatValue(v, d));
const pct = (i, d = 1) => (i ? <strong>{f(i.value, d)}%</strong> : null);
const bn = (v) => <strong>US$ {formatValue(Math.abs(v), 1)} bn</strong>;
const yearAgo = (i) => {
  const h = (i?.history || []).filter((p) => p.value != null);
  const last = h.at(-1);
  if (!last) return null;
  const key = `${Number(last.date.slice(0, 4)) - 1}${last.date.slice(4, 7)}`;
  return h.find((p) => p.date.slice(0, 7) === key) || null;
};

function growth(b) {
  const { gdp, iip, pmi_mfg: pm, pmi_services: ps, cpi, wpi, cpi_rural: cr, cpi_urban: cu, unemployment: ur } = b;
  const expanding = pm && ps ? (pm.value > 50 && ps.value > 50 ? 'both above 50, so activity is expanding' : 'one or both below 50, so activity is slowing') : null;
  const s1 = gdp && (
    <>
      The economy grew {pct(gdp)} in {gdp.period}
      {iip ? <>, industrial output rose {pct(iip)} in {iip.period}</> : null}
      {expanding ? <>, and the business surveys (PMIs) are {expanding} (manufacturing {formatValue(pm.value, 1)}, services {formatValue(ps.value, 1)})</> : null}.
    </>
  );
  const dir = cpi && cpi.change != null ? (cpi.change > 0 ? 'rising' : cpi.change < 0 ? 'easing' : 'steady') : null;
  const s2 = cpi && (
    <>
      Retail (CPI) inflation is {dir ? `${dir} at ` : ''}{pct(cpi, 2)}
      {wpi ? <>, with wholesale prices up {pct(wpi, 2)}{wpi.value > cpi.value ? ', a sign that more cost pressure may reach shoppers' : ''}</> : null}
      {cr && cu ? <>; prices are rising faster in {cr.value >= cu.value ? 'villages' : 'towns'} ({cr.value >= cu.value ? `rural ${f(cr.value, 2)}% against urban ${f(cu.value, 2)}%` : `urban ${f(cu.value, 2)}% against rural ${f(cr.value, 2)}%`})</> : null}
      {ur ? <>, while unemployment is {pct(ur)}</> : null}.
    </>
  );
  return [s1, s2];
}

function external(b) {
  const { trade_balance: tb, services_net: sv, remittances: rem, cad, inr_usd: inr, fx_reserves: fx, fwd_premia_3m: fwd } = b;
  const cover = tb && sv && tb.value < 0 && sv.period === tb.period ? Math.round((sv.value / -tb.value) * 100) : null;
  const s1 = tb && (
    <>
      India ran a goods trade {tb.value < 0 ? 'deficit' : 'surplus'} of {bn(tb.value)} in {tb.period}
      {cover != null ? <>, but a services surplus of {bn(sv.value)} covered about {cover}% of it</> : null}
      {rem ? <>; with remittances of {bn(rem.value)} in {rem.period}</> : null}
      {cad ? <>, the current account {cad.value < 0 ? 'deficit' : 'surplus'} was only <strong>{formatValue(Math.abs(cad.value), 1)}% of GDP</strong> ({cad.period})</> : null}.
    </>
  );
  const ya = yearAgo(inr);
  const fall = inr && ya ? ((inr.value / ya.value - 1) * 100) : null;
  const s2 = inr && (
    <>
      The rupee is at <strong>₹{formatValue(inr.value, 2)}</strong> per dollar
      {fall != null ? <>, {Math.abs(fall).toFixed(1)}% {fall > 0 ? 'weaker' : 'stronger'} than a year ago</> : null}
      {fx ? <>; forex reserves of {bn(fx.value)} are the buffer</> : null}
      {fwd ? <>, while a 3-month forward premium of <strong>{formatValue(fwd.value, 2)}%</strong>{fwd.compare_value != null && fwd.value > fwd.compare_value ? ' and rising' : ''} points to continued pressure on the rupee</> : null}.
    </>
  );
  return [s1, s2];
}

function fiscal(b) {
  const { repo, cpi, gsec10: g, fiscal_deficit: fd, capex_centre: cx, gst_gross: gst } = b;
  const move = repo && repo.change ? `after a ${Math.round(Math.abs(repo.change) * 100)} basis point ${repo.change > 0 ? 'hike' : 'cut'}` : 'unchanged';
  const real = repo && cpi ? repo.value - cpi.value : null;
  const s1 = repo && (
    <>
      RBI's policy repo rate is {pct(repo, 2)} ({move})
      {real != null ? <>, which against CPI inflation of {pct(cpi, 2)} leaves a real policy rate of about <strong>{Math.abs(real) < 0.05 ? 'zero' : `${f(real, 1)}%`}</strong>{real < 0.5 ? ', so policy is still not tight' : ''}</> : null}
      {g ? <>; the 10-year government bond yield is {pct(g, 2)}</> : null}.
    </>
  );
  const gy = gst && gst.compare_value ? ((gst.value / gst.compare_value - 1) * 100) : null;
  const s2 = fd && (
    <>
      The Centre had used {pct(fd)} of its full-year fiscal deficit target by {fd.period}
      {fd.compare_value != null ? <> (against {f(fd.compare_value)}% a year earlier)</> : null}
      {cx ? <> and {pct(cx)} of its capital budget</> : null}
      {gy != null ? <>; GST collections of <strong>₹{formatValue(gst.value, 2)} lakh crore</strong> in {gst.period} were {Math.abs(gy).toFixed(0)}% {gy >= 0 ? 'higher' : 'lower'} than a year earlier</> : null}.
    </>
  );
  return [s1, s2];
}

function money(b) {
  const { credit_nonfood: cr, deposit_growth: dep, credit_services: cs, m3_growth: m3, fdi_net: fdi, fpi_net: fpi, nri_deposits: nri } = b;
  const s1 = cr && (
    <>
      Bank credit is growing {pct(cr)} a year
      {dep ? <> against deposits at {pct(dep)}</> : null}
      {cs ? <>, fastest for services ({pct(cs)})</> : null}
      {m3 ? <>, and broad money (M3) is up {pct(m3)}</> : null}.
    </>
  );
  const s2 = (fdi || nri) && (
    <>
      {fdi ? <>Foreign investment flows are modest (net FDI {fdi.value < 0 ? 'outflow of ' : ''}{bn(fdi.value)}{fpi ? <>, portfolio {fpi.value < 0 ? 'outflow of ' : ''}{bn(fpi.value)}</> : null} in {fdi.period})</> : null}
      {fdi && nri ? ', while ' : null}
      {nri ? <>NRI deposits brought in {bn(nri.value)} in {nri.period}{nri.compare_value != null ? <>, against {bn(nri.compare_value)} a year earlier</> : null}</> : null}.
    </>
  );
  return [s1, s2];
}

const WRITERS = {
  'Growth and prices': growth,
  'External sector': external,
  'Fiscal and monetary': fiscal,
  'Money, credit and capital flows': money,
};

export default function ThemeBrief({ group, byId }) {
  const write = WRITERS[group];
  if (!write || !byId) return null;
  const lines = write(byId).filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="eb-themebrief">
      <p className="eb-themebrief-kicker">What these figures say together</p>
      {lines.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  );
}
