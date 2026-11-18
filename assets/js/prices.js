// Price rules (the same rules as sk_engines/pricerules.py - keep the two in step; tests/test_pricerules.py checks both).
//   Normal price  = the live RollingGo price + normalMarkupPct (default 3%)
//   Member price  = Normal price - memberDiscountPct (default 5%), for signed-in customers
//   Special price = typed by staff on the hotel (specialPrice, Rp per night, until specialUntil)
// Staff change the percentages for everything at once, or for a country / city / star level (Admin -> Price rules, saved in settings/prices).
// No imports: this file also runs in node for the tests.

export const PRICE_DEFAULTS = { normalMarkupPct: 3, memberDiscountPct: 5, overrides: [] };

const low = (s) => String(s ?? "").trim().toLowerCase();
const num = (v) => (v === "" || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v));

// How specific an override is: a city beats a country, and a star level adds to either.
const weight = (o) => (low(o.city) ? 4 : 0) + (low(o.country) ? 2 : 0) + (low(o.stars) ? 1 : 0);
const fits = (o, h) => (!low(o.country) || low(o.country) === low(h.country)) && (!low(o.city) || low(o.city) === low(h.city))
  && (!low(o.stars) || low(o.stars) === low(h.stars));

// -> { markup, member } in percent for this hotel
export function ruleFor(rules, h) {
  const r = { ...PRICE_DEFAULTS, ...(rules || {}) };
  let markup = num(r.normalMarkupPct) ?? PRICE_DEFAULTS.normalMarkupPct;
  let member = num(r.memberDiscountPct) ?? PRICE_DEFAULTS.memberDiscountPct;
  const list = (Array.isArray(r.overrides) ? r.overrides : []).filter((o) => o && weight(o) && fits(o, h || {}));
  list.sort((a, b) => weight(a) - weight(b)).forEach((o) => {
    if (num(o.normalMarkupPct) !== null) markup = num(o.normalMarkupPct);
    if (num(o.memberDiscountPct) !== null) member = num(o.memberDiscountPct);
  });
  return { markup, member };
}

const up1000 = (n) => Math.ceil(Math.round(n * 100) / 100 / 1000) * 1000;      // round(…*100)/100: 1,000,000 x 1.03 is 1,030,000.0000001 in a computer

// live RollingGo price (Rp) -> { normal, member } rounded up to Rp 1,000
export function pricesFrom(liveIDR, rule) {
  const live = num(liveIDR);
  if (!live || live <= 0) return null;
  const normal = up1000(live * (1 + rule.markup / 100));
  return { normal, member: up1000(normal * (1 - rule.member / 100)) };
}

// the hotel's special price when it is still valid on that day (YYYY-MM-DD), else null
export function specialFor(h, day) {
  const p = num(h && h.specialPrice);
  if (!p || p <= 0) return null;
  if (h.specialUntil && String(h.specialUntil) < String(day)) return null;
  return p;
}
