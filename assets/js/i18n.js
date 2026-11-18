/* English | Bahasa Indonesia switch.
   Public pages exist twice: English at /page and Indonesian at /id/page (<html data-page-lang>); the EN | ID buttons open the
   other page, so Google can show each language. Pages without a twin (staff admin) still swap the texts in place
   (elements with data-id hold the Indonesian text). Works without Firebase. */
(function () {
  var KEY = "okLang";
  var pageLang = document.documentElement.getAttribute("data-page-lang");
  function cur() {
    if (pageLang) return pageLang;
    try { var s = localStorage.getItem(KEY); if (s) return s; } catch (e) { /* ignore */ }
    return (navigator.language || "").toLowerCase().indexOf("id") === 0 ? "id" : "en";
  }
  function twin(l) {
    var x = document.querySelector('link[rel="alternate"][hreflang="' + l + '"]');
    if (!x) return "";
    try { return new URL(x.href).pathname; } catch (e) { return ""; }
  }
  function apply(l, root) {
    var els = (root || document).querySelectorAll("[data-id]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.hasAttribute("data-en")) el.setAttribute("data-en", el.innerHTML);
      el.innerHTML = l === "id" ? el.getAttribute("data-id") : el.getAttribute("data-en");
    }
    document.documentElement.lang = l;
    var bs = document.querySelectorAll("[data-lang]");
    for (var j = 0; j < bs.length; j++) bs[j].classList.toggle("on", bs[j].getAttribute("data-lang") === l);
  }
  window.SK_applyLang = function (root) { apply(cur(), root); };
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-lang]");
    if (!b) return;
    var l = b.getAttribute("data-lang");
    try { localStorage.setItem(KEY, l); } catch (x) { /* ignore */ }
    if (pageLang) {
      if (l === pageLang) return;
      var to = twin(l);
      if (to) { location.href = to + location.search + location.hash; return; }
    }
    apply(l);
    window.dispatchEvent(new CustomEvent("sk-lang", { detail: l }));
  });
  if (pageLang) { try { localStorage.setItem(KEY, pageLang); } catch (e) { /* ignore */ } }
  apply(cur());
})();
