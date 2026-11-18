// One key for a state or union territory whichever source names it:
// MoSPI ("NCT of Delhi", "Jammu And Kashmir"), CBDT ("Jammu Kashmir") and
// DGCI&S ("Delhi", "Jammu and Kashmir") all reduce to the same letters.
export const stateKey = (s) => String(s || '').toLowerCase().replace('&', ' and ').replace(/nct of /, '').replace(/^the /, '')
  .replace(/\band\b/g, '').replace(/[^a-z]/g, '');

// CBDT state-wise collections (₹ crore) by financial year, keyed by stateKey.
// Jammu and Kashmir is a state in 2018-19 and a union territory after, so both entries merge.
export function taxByState(dt) {
  const out = {};
  for (const part of [dt?.by_state?.states, dt?.by_state?.uts]) {
    for (const [name, years] of Object.entries(part || {})) {
      const k = stateKey(name);
      out[k] = { ...(out[k] || {}), ...years };
    }
  }
  return out;
}
