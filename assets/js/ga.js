// Google Analytics 4 (owner, 11 Nov 2026) - visitors, pages and what brings customers. Loaded by site.js on every page, and on its
// own by the language pages. Not on Admin. Counts, besides page views:
//   whatsapp_click  - a WhatsApp button or link pressed, or WhatsApp opened by a form (where on the site it happened)
//   generate_lead   - a hotel / corporate request saved through the Book Now form (window.skTrack, called by public.js)
// No names, numbers or messages are ever sent to Google - only which page and which button.
(function () {
  var ID = "G-EMGZ2TENSK";
  if (window.__skGa || location.pathname.indexOf("/admin") === 0 || /^(localhost|127\.)/.test(location.hostname)) return;
  window.__skGa = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag("js", new Date());
  gtag("config", ID, { anonymize_ip: true });
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
  document.head.appendChild(s);

  function where(el) {
    var sec = el && el.closest && el.closest("section[id], header[id], footer, nav, form[id]");
    return sec ? (sec.id || sec.tagName.toLowerCase()) : "";
  }
  window.skTrack = function (name, params) { try { gtag("event", name, params || {}); } catch (e) { /* never break the page */ } };
  var last = 0;
  function wa(how, el) {
    var now = Date.now();
    if (now - last < 1500) return;         // one press = one count (a click that also opens a window)
    last = now;
    window.skTrack("whatsapp_click", { how: how, place: where(el), page_path: location.pathname });
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me/"], a[href*="api.whatsapp.com"]');
    if (a) wa("link", a);
  }, true);
  var open = window.open;                  // forms that open WhatsApp themselves (search box, Let's connect)
  window.open = function (u) {
    try { if (/wa\.me\/|api\.whatsapp\.com/.test(String(u))) wa("form", document.activeElement); } catch (e) { /* ignore */ }
    return open.apply(window, arguments);
  };
})();
