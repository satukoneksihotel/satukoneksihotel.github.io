/* Travel Info hub: clickable world map. Coloured countries have a guide; click (or tap, then tap the label) to open it.
   Map shapes: /data/world-map.svg (Natural Earth data). Names, links and region boxes: <script id="tmap-data">. No outside services. */
const box = document.querySelector(".tmap-box");
const dataEl = document.getElementById("tmap-data");
if (box && dataEl) init(JSON.parse(dataEl.textContent));

function lang() { return document.documentElement.lang === "id" ? "id" : "en"; }
const T = {
  en: { open: "Open travel guide →", none: "No guide yet", part: "Covered by the Europe guide", top: "Top places:", load: "Map could not load. Use the cards below." },
  id: { open: "Buka panduan perjalanan →", none: "Belum ada panduan", part: "Termasuk panduan Eropa", top: "Tempat terbaik:", load: "Peta gagal dimuat. Gunakan kartu di bawah." },
};

async function init(D) {
  const canvas = box.querySelector(".tmap-canvas");
  const tip = box.querySelector(".tmap-tip");
  try {
    const r = await fetch("/data/world-map.svg");
    if (!r.ok) throw new Error(r.status);
    canvas.innerHTML = await r.text();
  } catch (e) {
    canvas.textContent = T[lang()].load;
    return;
  }
  canvas.removeAttribute("aria-busy");
  const svg = canvas.querySelector("svg");
  const full = D.vb.slice();
  let vb = full.slice();
  let anim = 0;

  const setVB = (v) => { vb = v; svg.setAttribute("viewBox", v.map((n) => n.toFixed(1)).join(" ")); };
  let base = full.slice();
  function clamp(v) {
    const ar = svg.clientWidth / Math.max(svg.clientHeight, 1);
    const w = Math.min(Math.max(v[2], full[2] / 14), base[2]);
    const h = w / ar;
    let x = v[0] + (v[2] - w) / 2, y = v[1] + (v[3] - h) / 2;
    x = w >= full[2] ? full[0] + (full[2] - w) / 2 : Math.min(Math.max(x, full[0] - w * 0.1), full[0] + full[2] - w * 0.9);
    y = h >= full[3] ? full[1] + (full[3] - h) / 2 : Math.min(Math.max(y, full[1] - h * 0.1), full[1] + full[3] - h * 0.9);
    return [x, y, w, h];
  }
  function fit(target) {
    // keep the box's aspect ratio so the region fills the frame
    const ar = svg.clientWidth / Math.max(svg.clientHeight, 1);
    let [x, y, w, h] = target;
    const pad = 0.06;
    x -= w * pad; y -= h * pad; w *= 1 + 2 * pad; h *= 1 + 2 * pad;
    if (w / h > ar) { const nh = w / ar; y -= (nh - h) / 2; h = nh; } else { const nw = h * ar; x -= (nw - w) / 2; w = nw; }
    return [x, y, w, h];
  }
  function goTo(target) {
    cancelAnimationFrame(anim);
    const from = vb.slice();
    const to = target;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 450);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setVB(from.map((f, i) => f + (to[i] - f) * e));
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function zoom(f, cx, cy) {
    const [x, y, w, h] = vb;
    cx = cx ?? x + w / 2; cy = cy ?? y + h / 2;
    goTo(clamp([cx - (cx - x) * f, cy - (cy - y) * f, w * f, h * f]));
  }
  base = fit(full);
  setVB(base);

  // region buttons
  box.parentElement.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => {
    box.parentElement.querySelectorAll("[data-r]").forEach((o) => o.classList.toggle("on", o === b));
    goTo(fit(D.regions[b.dataset.r]));
  }));
  box.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", () => zoom(b.dataset.z === "in" ? 0.6 : 1 / 0.6)));

  // country finder
  const find = box.parentElement.querySelector(".tmap-find");
  if (find) find.addEventListener("change", () => { const g = D.guides[find.value]; if (g) location.href = g.url; });

  // hover / tap label
  let hoverKey = null;
  const sel = (k) => svg.querySelectorAll(`[data-k="${k}"]`);
  function mark(k) {
    if (hoverKey === k) return;
    if (hoverKey) sel(hoverKey).forEach((p) => p.classList.remove("hi"));
    hoverKey = k;
    if (k) sel(k).forEach((p) => p.classList.add("hi"));
  }
  function showTip(el, ev, pinned) {
    const L = lang();
    const k = el.dataset.k;
    const g = k && D.guides[k];
    let html;
    if (g) {
      const title = g[L] || g.en;
      const sub = k === "europe" ? `<small>${el.dataset.n} · ${T[L].part}</small>` : "";
      const top = g.c ? `<small class="cities">${T[L].top} ${g.c.join(" · ")}</small>` : "";
      html = `<b>${title}</b>${sub}${top}<a href="${g.url}">${T[L].open}</a>`;
    } else {
      html = `<b>${el.dataset.n || ""}</b><small>${T[L].none}</small>`;
    }
    tip.innerHTML = html;
    tip.hidden = false;
    tip.classList.toggle("pin", !!pinned);
    const r = box.getBoundingClientRect();
    let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > r.width - 6) x = ev.clientX - r.left - tw - 14;
    if (y + th > r.height - 6) y = ev.clientY - r.top - th - 14;
    tip.style.left = Math.max(6, x) + "px";
    tip.style.top = Math.max(6, y) + "px";
  }
  function hideTip() { tip.hidden = true; mark(null); }

  // drag to pan (mouse, pen and one-finger touch)
  let drag = null;
  svg.addEventListener("pointerdown", (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, vb: vb.slice(), moved: false, id: ev.pointerId };
  });
  window.addEventListener("pointermove", (ev) => {
    if (drag && drag.id === ev.pointerId) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; svg.setPointerCapture?.(ev.pointerId); svg.classList.add("grab"); hideTip(); }
      if (drag.moved) {
        const s = vb[2] / svg.clientWidth;
        setVB(clamp([drag.vb[0] - dx * s, drag.vb[1] - dy * s, drag.vb[2], drag.vb[3]]));
        return;
      }
    }
    if (ev.pointerType !== "mouse" || drag) return;
    const el = ev.target.closest && ev.target.closest("path,circle");
    if (el && svg.contains(el)) { mark(el.dataset.k || null); showTip(el, ev, false); }
    else if (!tip.matches(":hover")) hideTip();
  });
  window.addEventListener("pointerup", (ev) => {
    if (!drag || drag.id !== ev.pointerId) return;
    const moved = drag.moved;
    drag = null;
    svg.classList.remove("grab");
    if (moved) return;
    const el = ev.target.closest && ev.target.closest("path,circle");
    if (!el || !svg.contains(el)) { if (!tip.contains(ev.target)) hideTip(); return; }
    const g = el.dataset.k && D.guides[el.dataset.k];
    if (ev.pointerType === "mouse" && g) { location.href = g.url; return; }
    mark(el.dataset.k || null);
    showTip(el, ev, true);   // touch: show the label with its link first
  });
  svg.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse" && !drag) setTimeout(() => { if (!tip.matches(":hover")) hideTip(); }, 60); });
  window.addEventListener("sk-lang", hideTip);
  window.addEventListener("resize", () => { base = fit(full); setVB(clamp(vb)); });
}
