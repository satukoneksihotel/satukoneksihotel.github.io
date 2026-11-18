// Staff admin: a list you can sort and tick (used by Requests, Hotels, Tours, Offers, Destinations).
// Click a column title to sort (again to reverse; remembered for this browser tab), tick one / tick all shown, then use the
// buttons in the bar that appears ("3 ticked: Hide · Show · Delete ..."). Searching and filtering stay with each page:
// it calls table.set(rows) with the rows to show.
const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * host: element to draw in. opts:
 *   cols:    [{ k, label, html(row), sort?(row) -> value, cls? }]   (no sort = not sortable)
 *   actions: [{ id, label, cls?, confirm?(rows) -> text|null, run(rows) -> Promise }]  (bulk buttons)
 *   open(row)       - a click on the row (not on a tick box, link, button or switch)
 *   key             - remembers the sort, e.g. "requests"
 *   sort, dir       - the first sort; page = rows per page (default 100)
 *   empty           - text when nothing matches;  after() - called after each draw (bind switches etc.)
 */
export function smartTable(host, opts) {
  const { cols, actions = [], open, key = "", page = 100, empty = "Nothing found.", after } = opts;
  let rows = [], shown = page;
  const sel = new Set();
  let view = { sort: opts.sort || "", dir: opts.dir || 1 };
  try { view = { ...view, ...JSON.parse(sessionStorage.getItem("admSort_" + key) || "{}") }; } catch { /* ignore */ }
  const col = (k) => cols.find((c) => c.k === k);
  const sorted = () => {
    const c = col(view.sort); if (!c?.sort) return rows;
    return [...rows].sort((a, b) => { const x = c.sort(a), y = c.sort(b); return (x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0) * view.dir; });
  };
  host.innerHTML = `<div class="bulk" hidden><b class="bsel"></b><span class="sp"></span>${actions.map((a) => `<button class="sk-btn sm ${a.cls || ""}" type="button" data-act="${e(a.id)}">${e(a.label)}</button>`).join("")}
    <button class="sk-link" type="button" data-act="__none">Clear</button></div>
    <div class="tscroll"><table class="t at"><thead><tr><th class="cb"><input type="checkbox" class="ball" aria-label="Tick all shown"></th>
    ${cols.map((c) => (c.sort ? `<th data-sort="${e(c.k)}" title="Sort by ${e(String(c.label).toLowerCase())}">${e(c.label)}<i>↕</i></th>` : `<th>${e(c.label)}</th>`)).join("")}</tr></thead><tbody></tbody></table></div>
    <p class="help tcount" style="margin:12px 0 0"></p><div class="tmore" style="text-align:center"></div>`;
  const q = (s) => host.querySelector(s), tbody = q("tbody");
  const draw = () => {
    const list = sorted(), vis = list.slice(0, shown);
    for (const id of [...sel]) if (!rows.some((r) => r.id === id)) sel.delete(id);
    tbody.innerHTML = vis.map((r) => `<tr data-id="${e(r.id)}" class="${sel.has(r.id) ? "picked" : ""}${open ? " row" : ""}"><td class="cb"><input type="checkbox" data-sel="${e(r.id)}"${sel.has(r.id) ? " checked" : ""} aria-label="Tick"></td>
      ${cols.map((c) => `<td${c.cls ? ` class="${c.cls}"` : ""}>${c.html(r)}</td>`).join("")}</tr>`).join("")
      || `<tr><td colspan="${cols.length + 1}" class="empty">${e(empty)}</td></tr>`;
    q(".tcount").textContent = list.length ? `Showing ${vis.length} of ${list.length}.${cols.some((c) => c.sort) ? " Click a column title to sort; click it again to reverse." : ""}` : "";
    q(".tmore").innerHTML = list.length > vis.length ? `<button class="sk-btn sm" type="button" data-more>Show ${Math.min(page, list.length - vis.length)} more</button>` : "";
    const t = vis.filter((r) => sel.has(r.id)).length, all = q(".ball");
    all.checked = !!vis.length && t === vis.length; all.indeterminate = t > 0 && t < vis.length;
    q(".bulk").hidden = !sel.size; q(".bsel").textContent = `${sel.size} ticked`;
    host.querySelectorAll("th[data-sort]").forEach((th) => { const on = th.dataset.sort === view.sort; th.classList.toggle("on", on); th.querySelector("i").textContent = on ? (view.dir > 0 ? "▲" : "▼") : "↕"; });
    after?.(vis);
  };
  host.querySelector("thead").addEventListener("click", (ev) => {
    const th = ev.target.closest("th[data-sort]"); if (!th) return;
    if (view.sort === th.dataset.sort) view.dir = -view.dir; else view = { sort: th.dataset.sort, dir: 1 };
    try { sessionStorage.setItem("admSort_" + key, JSON.stringify(view)); } catch { /* ignore */ }
    draw();
  });
  q(".ball").addEventListener("change", (ev) => { sorted().slice(0, shown).forEach((r) => (ev.target.checked ? sel.add(r.id) : sel.delete(r.id))); draw(); });
  tbody.addEventListener("change", (ev) => { const id = ev.target.dataset?.sel; if (!id) return; ev.target.checked ? sel.add(id) : sel.delete(id); draw(); });
  tbody.addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr[data-id]"); if (!tr || ev.target.closest("input,button,a,label,select")) return;
    const r = rows.find((x) => x.id === tr.dataset.id); if (r && open) open(r);
  });
  host.addEventListener("click", async (ev) => {
    if (ev.target.closest("[data-more]")) { shown += page; return draw(); }
    const b = ev.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "__none") { sel.clear(); return draw(); }
    const a = actions.find((x) => x.id === b.dataset.act), picked = rows.filter((r) => sel.has(r.id));
    if (!a || !picked.length) return;
    const ask = a.confirm?.(picked); if (ask && !confirm(ask)) return;
    b.disabled = true;
    try { await a.run(picked); sel.clear(); } finally { b.disabled = false; draw(); }
  });
  return {
    set(list) { rows = list; shown = page; draw(); },
    redraw: draw,
    rows: () => rows,
    selected: () => rows.filter((r) => sel.has(r.id)),
  };
}
