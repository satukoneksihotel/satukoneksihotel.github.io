// /posters - the city posters staff made in Admin -> Posters (the robot keeps /assets/files/posters/index.json up to date).
// Each card: the poster picture, the price line and four downloads (A4 PDF for print, A4 picture, Instagram size, Facebook size).
const box = document.getElementById("posterList");
const ID = (document.documentElement.lang || "").startsWith("id");
const T = ID
  ? { pdf: "Unduh PDF A4 (cetak)", jpg: "Gambar A4", ig: "Ukuran Instagram / WhatsApp", fb: "Ukuran Facebook", none: "Belum ada poster kota.", fail: "Daftar poster tidak dapat dimuat. Coba lagi nanti." }
  : { pdf: "Download A4 PDF (print)", jpg: "A4 picture", ig: "Instagram / WhatsApp size", fb: "Facebook size", none: "No city posters yet.", fail: "The poster list could not be loaded. Please try again later." };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const rp = (v) => { const s = String(v ?? "").toLowerCase().replace(/[\s,.]/g, ""); return /^[1-9][0-9]*x*$/.test(s) ? "Rp" + s.replace(/\B(?=(.{3})+$)/g, ",") : ""; };

async function draw() {
  if (!box) return;
  let list;
  try {
    const r = await fetch("/assets/files/posters/index.json", { cache: "no-cache" });
    list = r.ok ? await r.json() : [];
  } catch (e) {
    box.innerHTML = `<p class="lead">${T.fail}</p>`;
    return;
  }
  list = (Array.isArray(list) ? list : []).filter((p) => /^[a-z0-9-]{1,40}$/.test(p.slug || ""));
  if (!list.length) {
    box.innerHTML = `<p class="lead">${T.none}</p>`;
    return;
  }
  box.innerHTML = list.map((p) => {
    const f = `/assets/files/posters/${p.slug}`;
    const v = encodeURIComponent(p.v || "");
    return `<article class="pst"><a href="${f}-A4.jpg?v=${v}" target="_blank" rel="noopener"><img src="${f}-instagram.jpg?v=${v}" width="1080" height="1350" loading="lazy" alt="${esc(p.city)} hotel poster - Satu Koneksi Hotel"></a>
<h3>${esc(p.city)}</h3><p class="pr">Kamar Hotel ${rp(p.priceRp)}<br><span>Hotel Room ${rp(p.priceRp)}</span></p>
<p class="dl"><a class="sk-btn" href="${f}-A4.pdf?v=${v}" download>${T.pdf}</a><a href="${f}-A4.jpg?v=${v}" download>${T.jpg}</a><a href="${f}-instagram.jpg?v=${v}" download>${T.ig}</a><a href="${f}-facebook.jpg?v=${v}" download>${T.fb}</a></p></article>`;
  }).join("");
}
draw();
