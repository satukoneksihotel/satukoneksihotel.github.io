// Every page: contact details and announcement from the settings, sign-in button in the menu, e-mail verification banner.
// Only the light shared code here (no Firebase), so the contact details and WhatsApp numbers are filled in at once; the big
// Firebase library is loaded after the page has finished loading, just for the sign-in name and the e-mail check.
import "./ga.js";                      // Google Analytics (not on Admin)
import * as C from "./sk-light.js";
import { $, $$, T, lang, esc } from "./sk-text.js";
const { loadSettings, waLink } = C;
C.rememberSource();
C.trackVisit();
let NUMS = null;                       // this page's WhatsApp numbers (Admin -> Settings), set once the settings are read
// Every WhatsApp button on the website: (1) the message says which channel the visitor came from, e.g. "(via Instagram)";
// (2) it goes to this page's number - and when the page has more than one, the customer chooses who to chat with.
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href*="wa.me/"]');
  if (!a || a.hasAttribute("data-wa-direct") || location.pathname.startsWith("/admin")) return;
  let u; try { u = new URL(a.href); } catch { return; }
  let text = u.searchParams.get("text") || "";
  const src = C.leadSource();
  if (src && src.s !== "direct" && text) { const tag = `(via ${C.SOURCES[src.s]})`; if (!text.includes(tag)) text = `${text}\n\n${tag}`; }
  if (!NUMS || NUMS.length < 2) {
    if (NUMS?.length) u.pathname = "/" + NUMS[0].num;
    if (text) u.searchParams.set("text", text);
    a.href = u.toString(); return;
  }
  e.preventDefault(); e.stopPropagation();
  const name = (x, i) => (lang() === "id" ? x.label_id || x.label_en : x.label_en || x.label_id) || `WhatsApp ${i + 1}`;
  const m = C.modal(`<h3 style="margin-bottom:6px">${T("Who would you like to chat with?", "Ingin chat dengan siapa?")}</h3>
    <p class="sk-sub" style="margin:0 0 14px">${T("Choose who to chat with - your message is already written.", "Pilih dengan siapa Anda ingin chat - pesan Anda sudah tertulis.")}</p>
    <div style="display:grid;gap:10px">${NUMS.map((x, i) => `<a class="sk-btn wa" data-wa-direct target="_blank" rel="noopener" href="${C.waLink(x.num, text)}" style="justify-content:space-between">
      <span>💬 ${esc(name(x, i))}</span></a>`).join("")}</div>`);
  m.el?.querySelectorAll?.("a[data-wa-direct]").forEach((b) => b.addEventListener("click", () => setTimeout(() => m.close?.(), 100)));
}, true);

const S = await loadSettings();
NUMS = C.waFor(S);
const num = NUMS[0].num;
window.SK_WA = num;
window.SK_MAPKEY = S.mapsKey || "";   // Google Maps Embed key (home page hotel map); empty = a Google Maps link only

function fill() {
  $$("[data-wa-en]").forEach((a) => { a.href = waLink(num, lang() === "id" ? a.dataset.waId || a.dataset.waEn : a.dataset.waEn); });
  const foot = $("#footwa"), main = C.waFor(S, "/").filter((x) => x.num !== num);
  if (foot) {
    foot.parentElement.querySelectorAll(".footwa-more").forEach((x) => x.remove());
    main.forEach((x) => foot.insertAdjacentHTML("afterend", `<a class="footwa-more" data-wa-direct target="_blank" rel="noopener" href="${C.waLink(x.num, "")}">${esc((lang() === "id" ? x.label_id || x.label_en : x.label_en || x.label_id) || "WhatsApp")}</a>`));
  }
  if (S.instagram) $$("[data-soc=instagram]").forEach((a) => { a.href = S.instagram; });
  if (S.facebook) $$("[data-soc=facebook]").forEach((a) => { a.href = S.facebook; });
  $$("[data-reply]").forEach((el) => { const t = S["replyTime_" + lang()] || S.replyTime_en || ""; el.textContent = t; el.parentElement.hidden = !t; });
  $$("[data-paycheck]").forEach((el) => { const t = S["payCheck_" + lang()] || S.payCheck_en || ""; el.textContent = t; el.parentElement.hidden = !t; });
  $$("[data-hours]").forEach((el) => { const t = S["hours_" + lang()] || S.hours_en || ""; el.textContent = t; el.parentElement.hidden = !t; });
  $$("[data-email]").forEach((el) => { if (S.email) { el.textContent = S.email; el.href = "mailto:" + S.email; } el.parentElement.hidden = !S.email; });
  let bar = $(".sk-announce"); const t = S["announcement_" + lang()] || S.announcement_en || "";
  if (S.announcementOn && t) {
    if (!bar) { bar = document.createElement("div"); bar.className = "sk-announce"; document.body.insertBefore(bar, document.body.firstChild); }
    bar.textContent = t;
  } else bar?.remove();
}
fill();
addEventListener("sk-lang", fill);

const acct = $("#skAcctTxt");
const signIn = async () => { const { onUser, verifyBanner } = await import("./sk-core.js"); onUser((u) => {
  if (acct) {
    if (u && !u.isAnonymous) { acct.removeAttribute("data-id"); acct.removeAttribute("data-en"); acct.textContent = ((u.displayName || u.email || "").split(/[ @]/)[0]) || T("Account", "Akun"); }
    else { acct.setAttribute("data-en", "Sign in"); acct.setAttribute("data-id", "Masuk"); window.SK_applyLang?.(); }
  }
  $(".sk-verify")?.remove();
  const nav = $("#skNav"), b = verifyBanner(u);
  if (b && nav) nav.insertAdjacentElement("afterend", b);
}); };
if (document.readyState === "complete") signIn(); else addEventListener("load", signIn, { once: true });

// "Before you go": a page that has the window (hotel, city and guide pages) loads the small file that shows it when the visitor leaves.
const xo = document.getElementById("exitOffer");
if (xo) import("./exit-offer.js").then((m) => m.init(xo)).catch(() => {});
// every other page: hotel and tour windows (public.js tells it with "sk-place" / "sk-hotel-closed" events); the list of
// places is only fetched when such a window opens
else import("./exit-offer.js").then((m) => m.watchPlace()).catch(() => {});
