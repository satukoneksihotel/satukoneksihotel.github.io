// Staff admin -> "Posters": one downloadable poster per Indonesian city (collection posters/{slug}, slug = the city's short name).
// Save = the words + price (+ an uploaded photo in posterPhotos/{slug}) are stored AND a job is queued for the cloud robot
// ("poster --city <slug> --deploy"): the Rust poster engine uses the photo staff chose (photoMode: "upload" = our own photo, "commons" = a
// Wikimedia Commons link, "auto" = the robot picks a free-licence landmark photo), makes the A4 PDF, A4 picture and Instagram picture and
// puts them on the website (/assets/files/posters/<slug>-...). Remove = both documents are deleted and the robot takes the files off the website.
// The robot writes how it went in engineControl/posterStatus { <slug>: { ok, madeAt, note, v, photo, photoPage } }.
// The live preview beside the form is only a sketch in the browser - the robot draws the real poster.
// The WhatsApp QR code, logo and NIB line are fixed in the engine - the phone number is never printed on a poster.
const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FILES = "/assets/files/posters/";
const SLUG_OK = /^[a-z0-9-]{1,40}$/;
export const PRICE_MIN = 10000, PRICE_MAX = 100000000;
export const PHOTO_MAX_CHARS = 900000;          // base64 text of an uploaded photo (the rules allow 950,000; a database document holds 1 MB)
const PHOTO_MIN_W = 1000;

// the same limits as firestore.rules (posters/{slug})
export const LIMITS = { city: 40, priceNote: 40, landmark: 200, photoCredit: 60, kicker: 40, headId: 110, headEn: 110, p1t: 50, p1s: 50,
  p2t: 50, p2s: 50, p3t: 50, p3s: 50, ctaId: 40, ctaEn: 60, web: 40, webNote: 40 };
const MODES = ["auto", "commons", "upload"];
const STANDARD = {
  priceNote: "per malam · per night",
  p1t: "Ceritakan rencana Anda", p1s: "Tell us your city, dates and guests",
  p2t: "Kami bandingkan hotel", p2s: "We compare rooms and rates for you",
  p3t: "Pesan dalam satu chat", p3s: "Groups up to 200 rooms, too",
  ctaId: "Pindai untuk chat WhatsApp", ctaEn: "Scan to chat with our team on WhatsApp",
  web: "satukoneksihotel.com", webNote: "Indonesia · ASEAN · Asia",
};
// kicker: an Indonesian city -> "Jelajahi Surabaya"; a city abroad -> its country in Indonesian, e.g. "Jelajahi Thailand"
export const defaultsFor = (city, country = "Indonesia", countryId = country) => ({ ...STANDARD, city,
  kicker: `Jelajahi ${country === "Indonesia" ? city : countryId || country}`,
  headId: `Hotel di ${city}, dipesan dalam satu chat WhatsApp.`, headEn: `Hotels in ${city}, booked in one WhatsApp chat.` });
// owner's format: Rp + commas, no space -> "Rp1,250,000"
// A price is a full number (1250000) or partly hidden with x (1xxxxxx, 12xxxxx): 5 to 9 figures, the first one 1-9.
// ---- Find landmark photos: pulled straight from Wikimedia Commons in the browser. Only what the robot accepts is shown:
// JPEG, at least 1200 px wide, a free licence (CC0 / public domain / CC BY / CC BY-SA) and a named photographer.
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const FREE = /^(cc0|public domain|pd|cc[- ]by(-sa)?[- ]?\d)/i;
const NOT_PLACE = /(map|locator|location|flag|coat_of|logo|seal|emblem|symbol|icon|diagram|chart|banner|signature|montage|collage|portrait|airport|aircraft|military|soldier|satellite|plaque|coin|stamp|drawing|painting|insect|spider|macro|food|dish|wedding|protest|accident|flood|fire)/i;
const plain = (h) => new DOMParser().parseFromString(String(h || ""), "text/html").body.textContent.replace(/\s+/g, " ").trim();   // never runs or loads anything
export const commonsFile = (v) => {
  let t = String(v || "").trim(); try { t = decodeURIComponent(t); } catch (er) { /* keep as typed */ }
  const m = t.match(/(?:File|Berkas):([^?#/]+\.jpe?g)/i) || t.match(/\/([^/?#]+\.jpe?g)(?:[?#]|$)/i);
  return (m ? m[1] : t).replace(/^\d+px-/, "").replace(/ /g, "_");
};
async function commonsAsk(params) {
  const r = await fetch(COMMONS_API + "?" + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params }));
  if (!r.ok) throw new Error("Wikimedia Commons did not answer (" + r.status + ")");
  return r.json();
}
const usable = (p) => {
  const ii = p.imageinfo && p.imageinfo[0]; if (!ii) return null;
  const md = ii.extmetadata || {}, lic = plain(md.LicenseShortName && md.LicenseShortName.value);
  const author = plain((md.Artist && md.Artist.value) || (md.Attribution && md.Attribution.value) || (md.Credit && md.Credit.value));
  const name = String(p.title || "").slice(5).replace(/ /g, "_");
  if (ii.mime !== "image/jpeg" || !FREE.test(lic) || !author || author.length > 80 || /^(unknown|own work|unknown author)$/i.test(author) || (ii.width || 0) < 1200 || NOT_PLACE.test(name)) return null;
  return { name, thumb: ii.thumburl || ii.url, page: ii.descriptionurl || "https://commons.wikimedia.org/wiki/File:" + name, author, lic, w: ii.width, h: ii.height };
};
const INFO = { prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1240" };
export async function findPhotos(city, country, words = "") {
  const qual = "incategory:Quality_images|Featured_pictures_on_Wikimedia_Commons|Valued_images";
  const asks = words ? [`${words} ${city}`, `${words} ${country}`] : [`${city} ${qual}`, `${city} ${country} ${qual}`, `${city} landmark`, `${city} ${country}`];
  const found = new Map();
  for (const a of asks) {
    let d;
    try { d = await commonsAsk({ action: "query", generator: "search", gsrsearch: a + " filetype:bitmap", gsrnamespace: "6", gsrlimit: "50", ...INFO }); }
    catch (er) { if (found.size) break; throw er; }          // Wikimedia busy: show what we have
    for (const pg of ((d.query && d.query.pages) || []).sort((x, y) => (x.index || 0) - (y.index || 0))) {
      const u = usable(pg); if (u && !found.has(u.name)) found.set(u.name, u);
    }
    if (found.size >= 60) break;
  }
  // photos whose name mentions the city first (like the robot); others only to fill up a short list
  const fold = (t) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const need = fold(city).match(/[a-z]{3,}/g)?.filter((w) => !["south", "north", "east", "west", "city", "islands", "and", "the"].includes(w)) || [];
  const LANDMARK = /(masjid|mosque|monumen|monument|tugu|jembatan|bridge|candi|temple|pura|wat_|gereja|church|cathedral|katedral|klenteng|istana|palace|keraton|kraton|museum|menara|tower|gedung|benteng|fort|alun|square|jam_gadang|skyline|panorama|pantai|beach|danau|lake|gunung|mount|landmark|heritage)/i;
  const all = [...found.values()].sort((x, y) => (LANDMARK.test(x.name) ? 0 : 1) - (LANDMARK.test(y.name) ? 0 : 1)), named = all.filter((x) => need.every((w) => fold(x.name).includes(w)));
  return (words || named.length >= 8 ? (words ? all : named) : named.concat(all.filter((x) => !named.includes(x)))).slice(0, 24);
}
export async function photoOf(fileName) {
  if (!fileName) return null;
  const d = await commonsAsk({ action: "query", titles: "File:" + fileName, ...INFO });
  const pg = ((d.query && d.query.pages) || [])[0];
  return pg ? usable(pg) : null;
}

export const normPrice = (v) => { const s = String(v ?? "").toLowerCase().replace(/[\s,.]/g, ""); return /^[1-9][0-9]*x*$/.test(s) && s.length >= 5 && s.length <= 9 ? s : ""; };
export const rupiah = (v) => "Rp" + (normPrice(v) || "0").replace(/\B(?=(.{3})+$)/g, ",");
export const priceLine = (n) => `Kamar Hotel ${rupiah(n)} / Hotel Room ${rupiah(n)}`;

// A photo file -> a JPEG small enough for one database document: width <= 2000 px (height <= 3000), quality 0.86 down to 0.5, then
// width 1600 / 1400. -> { data (base64, no prefix), w, h, chars } or throws Error with a plain message.
export async function shrinkPhoto(file) {
  if (!file || !/^image\//.test(file.type || "")) throw new Error("Please choose a photo (JPG or PNG).");
  const url = URL.createObjectURL(file);
  let img;
  try {
    img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("This file could not be opened as a photo.")); i.src = url; });
  } finally { URL.revokeObjectURL(url); }
  const W = img.naturalWidth, H = img.naturalHeight;
  if (W < PHOTO_MIN_W) throw new Error(`This photo is too small for print - use one at least ${PHOTO_MIN_W} pixels wide (this one is ${W}).`);
  for (const maxW of [2000, 1600, 1400]) {
    const s = Math.min(1, maxW / W, 3000 / H);
    const w = Math.round(W * s), h = Math.round(H * s);
    if (w < PHOTO_MIN_W || h < 600) break;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
    for (let q = 0.86; q >= 0.5 - 1e-9; q -= 0.06) {
      const data = cv.toDataURL("image/jpeg", q).split(",")[1] || "";
      if (data.length <= PHOTO_MAX_CHARS) return { data, w, h, chars: data.length };
    }
  }
  throw new Error("This photo is too detailed to store - please choose another one, or crop it a little.");
}

const STYLE = `<style>
.po{display:grid;gap:18px;max-width:1240px}
.po .panel{margin:0}
.po h2{font:700 20px 'Playfair Display',serif;color:var(--teal2);margin:0 0 4px}
.po-sub{margin:0 0 14px;color:var(--mute);font-size:14px}
.po-note{font-size:13px;color:var(--mute);background:#faf8f4;border-radius:12px;padding:10px 14px}
.po-list{display:grid;gap:12px}
.po-item{display:grid;grid-template-columns:96px 1fr auto;gap:16px;align-items:center;border:1.5px solid #e4e2df;border-radius:14px;padding:12px;background:#fff}
.po-th{width:96px;aspect-ratio:4/5;border-radius:10px;background:#f1efeb;overflow:hidden;display:grid;place-items:center;font-size:11px;color:#5b6463;text-align:center}
.po-th img{width:100%;height:100%;object-fit:cover;display:block}
.po-item h3{margin:0;font:700 18px 'Playfair Display',serif;color:var(--teal2)}
.po-item .pr{font-weight:700;font-size:14px;margin:2px 0 6px}
.po-item .dl{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:13px;margin-top:6px}
.po-item .dl a{color:var(--teal2);font-weight:700}
.po-item .credit{font-size:12px;color:var(--mute);margin-top:4px}
.po-acts{display:flex;flex-direction:column;gap:8px}
.po-chip{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:5px 12px;font:700 12.5px 'Plus Jakarta Sans',sans-serif;background:#f1efeb;color:#5b6463;margin:0 6px 4px 0}
.po-chip i{width:8px;height:8px;border-radius:50%;background:#b7b2a8}
.po-chip.ok{background:#e4f4ea;color:#12602c}.po-chip.ok i{background:#15803d}
.po-chip.warn{background:#fff3d6;color:#8a6212}.po-chip.warn i{background:#d9971a}
.po-chip.bad{background:#fdeceb;color:#b42318}.po-chip.bad i{background:#b42318}
.po-edit{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:22px;align-items:start}
.po-side{position:sticky;top:12px}
.po-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px 18px}
.po label{display:block;font:700 13px 'Plus Jakarta Sans',sans-serif;color:var(--teal2)}
.po label input:not([type=radio]):not([type=checkbox]),.po label select{display:block;width:100%;margin-top:6px;height:42px;border:1.5px solid #e4e2df;border-radius:10px;padding:0 12px;background:#fff;font:600 15px 'Plus Jakarta Sans',sans-serif}
.po label input:focus,.po label select:focus{outline:0;border-color:var(--gold)}
.po label input:disabled,.po label select:disabled{background:#f6f4ef;color:#5b6463}
.po label small{display:block;font-weight:500;color:var(--mute);font-size:12px;margin-top:4px}
.po label small.full{color:#b42318}
.po-price{margin-top:8px;font:800 16px 'Plus Jakarta Sans',sans-serif;color:var(--teal2);background:#f7f0df;border-radius:10px;padding:10px 14px}
.po-modes{display:grid;gap:8px;margin-bottom:12px}
.po-modes label.mode{display:flex;gap:10px;align-items:flex-start;border:1.5px solid #e4e2df;border-radius:12px;padding:10px 14px;cursor:pointer;font-weight:700}
.po-modes label.mode.on{border-color:var(--gold);background:#fbf6ea}
.po-modes label.mode small{display:block;font-weight:500;color:var(--mute);font-size:12.5px}
.po-modes input[type=radio]{margin-top:3px}
.po-box{border:1.5px dashed #e4e2df;border-radius:12px;padding:14px;display:grid;gap:12px}
.po-box[hidden]{display:none}
.po input,.po select{box-sizing:border-box}
.po-up{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.po-up img{width:150px;height:100px;object-fit:cover;border-radius:10px;background:#f1efeb}
.po-up .info{font-size:13px;color:var(--mute)}
.po-ck{display:flex!important;gap:10px;align-items:flex-start;font-weight:700}
.po-ck input{margin-top:3px}
.po-bar{position:sticky;bottom:0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:#fffffff2;border-top:1px solid #e4e2df;padding:12px 4px;z-index:2;margin-top:18px}
.po-bar .msg{font-size:13.5px;color:var(--mute)}
.pv-cap{font-size:12.5px;color:var(--mute);margin:8px 2px 0}
.pv-wrap{width:100%;aspect-ratio:1240/1754;position:relative;overflow:hidden;border-radius:6px;box-shadow:0 10px 30px #0003;background:#072425}
.pv{position:absolute;left:0;top:0;width:1240px;height:1754px;transform-origin:0 0;background:#072425;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;overflow:hidden}
.pv-ph{position:absolute;left:0;top:0;width:1240px;height:1060px;background:linear-gradient(160deg,#1e7374,#0e494a 55%,#072425) center/cover no-repeat}
.pv-ph:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,23,24,.7) 0%,rgba(3,23,24,0) 30%,rgba(7,36,37,.55) 66%,#072425 100%)}
.pv-auto{position:absolute;left:0;right:0;top:330px;text-align:center;font:600 34px 'Plus Jakarta Sans',sans-serif;color:#ffffffb3;z-index:1;padding:0 120px}
.pv-frame{position:absolute;inset:26px;border:2px solid rgba(223,192,123,.75);z-index:5}
.pv-top{position:absolute;z-index:6;top:70px;left:80px;right:80px;display:flex;justify-content:space-between;align-items:center}
.pv-top b{font-weight:800;font-size:30px;letter-spacing:.12em}
.pv-top span{font-weight:600;font-size:14px;letter-spacing:.08em;color:#F4EFE6;border:1px solid rgba(223,192,123,.5);border-radius:999px;padding:9px 16px;background:rgba(3,23,24,.55)}
.pv-head{position:absolute;z-index:6;left:80px;right:80px;bottom:704px}
.pv-kick{display:inline-block;font-weight:700;font-size:17px;letter-spacing:.22em;text-transform:uppercase;color:#072425;background:#DFC07B;padding:8px 18px;border-radius:999px}
.pv-kick:empty{display:none}
.pv-city{font-family:'Playfair Display',serif;font-weight:900;line-height:.92;text-transform:uppercase;margin-top:16px;color:#DFC07B;white-space:nowrap;overflow:hidden}
.pv-hid{font-family:'Playfair Display',serif;font-weight:700;font-size:48px;line-height:1.12;margin-top:20px}
.pv-hen{font-family:'Playfair Display',serif;font-style:italic;font-weight:700;font-size:29px;color:#DFC07B;margin-top:10px}
.pv-steps{position:absolute;z-index:6;left:80px;right:80px;top:1080px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.pv-st{background:rgba(14,73,74,.55);border:1px solid rgba(223,192,123,.45);border-radius:16px;padding:18px 22px;min-height:150px}
.pv-st i{display:block;font-style:normal;font-family:'Playfair Display',serif;font-weight:900;font-size:32px;color:#DFC07B}
.pv-st b{display:block;font-weight:800;font-size:21px;margin-top:8px;line-height:1.25}
.pv-st small{display:block;font-size:16px;color:#c9d6d3;margin-top:6px;line-height:1.35}
.pv-price{position:absolute;z-index:6;left:80px;right:80px;top:1262px;border:2px solid #DFC07B;border-radius:18px;padding:22px 30px;display:flex;justify-content:space-between;align-items:center;gap:20px;background:rgba(3,23,24,.45)}
.pv-price b{display:block;font-weight:800;font-size:46px;color:#DFC07B;line-height:1.1}
.pv-price span{display:block;font-weight:600;font-size:24px;margin-top:6px}
.pv-price em{font-style:normal;font-weight:600;font-size:20px;color:#F4EFE6;text-align:right;max-width:330px}
.pv-credit{position:absolute;z-index:6;right:80px;top:1395px;font-size:13px;color:#ffffffa6}
.pv-foot{position:absolute;z-index:6;left:26px;right:26px;bottom:26px;height:270px;background:#F4EFE6;color:#072425;display:flex;align-items:center;gap:30px;padding:0 44px}
.pv-q{flex:none;width:250px;text-align:center}
.pv-q b{display:block;font-size:19px;font-weight:800;color:#0e494a;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-q small{display:block;font-size:13px;color:#5a6564;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-qr{width:170px;height:170px;margin:0 auto;background:#fff;border:3px solid #25D366;border-radius:14px;padding:9px}
.pv-qr.web{border-color:#C69B3D}
.pv-qr img{width:100%;height:100%;display:block}
.pv-cta{flex:1;min-width:0;text-align:center}
.pv-cta .pill{display:inline-block;background:#25D366;color:#063b1f;font-weight:800;font-size:17px;letter-spacing:.08em;padding:8px 16px;border-radius:999px}
.pv-cta b{display:block;font-family:'Playfair Display',serif;font-weight:900;font-size:40px;color:#0e494a;margin-top:12px;line-height:1.05}
.pv-cta span{display:block;font-size:18px;font-weight:600;color:#3d4a49;margin-top:6px}
@media(max-width:1000px){.po-edit{grid-template-columns:1fr}.po-side{position:static;max-width:420px}}
@media(max-width:700px){.po-item{grid-template-columns:72px 1fr}.po-th{width:72px}.po-acts{grid-column:1/-1;flex-direction:row}}
</style>`;

// ---- the 16 looks (poster_engine/src/templates.rs). Colours for the live preview: page, accent, words on accent, city, words, bottom strip, its words.
export const TEMPLATES = [
  ["classic-emerald", "Classic emerald", "#072425", "#DFC07B", "#072425", "#DFC07B", "#ffffff", "#F4EFE6", "#0e494a"],
  ["classic-navy", "Classic navy", "#0b1d3a", "#E3C27A", "#0b1d3a", "#E3C27A", "#ffffff", "#F6F1E7", "#0b1d3a"],
  ["classic-burgundy", "Classic burgundy", "#3b0d18", "#E8C27D", "#3b0d18", "#E8C27D", "#ffffff", "#F7EFE9", "#3b0d18"],
  ["classic-black", "Classic black & gold", "#0d0d0d", "#D4AF37", "#0d0d0d", "#D4AF37", "#ffffff", "#F5F0E6", "#111111"],
  ["card-cream-navy", "Card - cream & navy", "#FBF6EC", "#E5C77E", "#0f2747", "#0f2747", "#0f2747", "#0f2747", "#ffffff"],
  ["card-white-teal", "Card - white & teal", "#FFFFFF", "#1E7374", "#ffffff", "#0e494a", "#0e494a", "#0e494a", "#ffffff"],
  ["card-sand-terracotta", "Card - sand & terracotta", "#F6EBDD", "#D9774B", "#ffffff", "#8a3b1f", "#5a2d1a", "#5a2d1a", "#ffffff"],
  ["card-sky-blue", "Card - sky blue", "#EAF4FB", "#F7C548", "#0b3c6b", "#0b5fa5", "#0b3c6b", "#0b3c6b", "#ffffff"],
  ["bold-sunset", "Bold - sunset", "#7a2a0c", "#FFC857", "#5a1f08", "#FFD27A", "#ffffff", "#FFFFFF", "#7a2a0c"],
  ["bold-ocean", "Bold - ocean", "#023e4a", "#48E5C2", "#023e4a", "#D2FFF4", "#ffffff", "#FFFFFF", "#023e4a"],
  ["bold-purple", "Bold - purple", "#2a0f4f", "#C77DFF", "#ffffff", "#F1E2FF", "#ffffff", "#FFFFFF", "#2a0f4f"],
  ["postcard-coral", "Postcard - coral", "#FFEDE6", "#FF6F61", "#ffffff", "#c2414b", "#7a2531", "#7a2531", "#ffffff"],
  ["postcard-red-white", "Postcard - red & white", "#FFFFFF", "#D7141A", "#ffffff", "#D7141A", "#9b0016", "#8f0013", "#ffffff"],
  ["postcard-cream-gold", "Postcard - cream & gold", "#F7F1E3", "#D6B25E", "#1d2b26", "#1d2b26", "#1d2b26", "#1d2b26", "#ffffff"],
  ["diagonal-royal-blue", "Diagonal - royal blue", "#0b3b8c", "#FFD23F", "#0b3b8c", "#FFF4C2", "#ffffff", "#FFFFFF", "#0b3b8c"],
  ["diagonal-rose", "Diagonal - rose", "#8e2a4f", "#FFD6E0", "#5a1430", "#FFE4EC", "#ffffff", "#FFFFFF", "#5a1430"],
];
export const templateName = (id) => (TEMPLATES.find((t) => t[0] === id) || TEMPLATES[0])[1];
// the preview in the chosen look's colours (fixed values from the list above - never user text)
const themeCss = (id) => {
  const [, , bg, acc, onAcc, city, ink, foot, footInk] = TEMPLATES.find((t) => t[0] === id) || TEMPLATES[0];
  return `.pv,.pv-wrap{background:${bg};color:${ink}}.pv-ph:after{background:linear-gradient(180deg,rgba(0,0,0,.6) 0%,rgba(0,0,0,0) 30%,${bg}8c 66%,${bg} 100%)}
.pv-frame{border-color:${acc}}.pv-kick{background:${acc};color:${onAcc}}.pv-city{color:${city}}.pv-hen{color:${acc}}
.pv-hid{color:${ink}}.pv-st{border-color:${acc};background:${ink}14}.pv-st i{color:${acc}}.pv-st b{color:${ink}}.pv-st small{color:${ink};opacity:.75}
.pv-price{border-color:${acc};background:${acc}}.pv-price b,.pv-price span,.pv-price em{color:${onAcc}}
.pv-foot{background:${foot};color:${footInk}}.pv-cta b,.pv-q b{color:${footInk}}.pv-cta span,.pv-q small{color:${footInk};opacity:.8}`;
};

// the preview's fixed parts - no user text in here (user text goes in with textContent)
const PREVIEW = `<div class="pv-wrap" id="pv-wrap"><div class="pv" id="pv">
  <div class="pv-ph" id="pv-ph"></div><div class="pv-auto" id="pv-auto"></div><div class="pv-frame"></div>
  <div class="pv-top"><b>SATU KONEKSI HOTEL</b><span>PT Satu Koneksi Hotel · NIB 2710260118389</span></div>
  <div class="pv-head"><span class="pv-kick" data-pv="kicker"></span><div class="pv-city" id="pv-city"></div>
    <div class="pv-hid" data-pv="headId"></div><div class="pv-hen" data-pv="headEn"></div></div>
  <div class="pv-steps"><div class="pv-st"><i>01</i><b data-pv="p1t"></b><small data-pv="p1s"></small></div>
    <div class="pv-st"><i>02</i><b data-pv="p2t"></b><small data-pv="p2s"></small></div>
    <div class="pv-st"><i>03</i><b data-pv="p3t"></b><small data-pv="p3s"></small></div></div>
  <div class="pv-price"><div><b id="pv-pid"></b><span id="pv-pen"></span></div><em data-pv="priceNote"></em></div>
  <div class="pv-credit" id="pv-credit"></div>
  <div class="pv-foot"><div class="pv-q"><div class="pv-qr wa"><img src="/assets/img/qr-whatsapp.svg" alt=""></div><b>WhatsApp</b></div>
    <div class="pv-cta"><span class="pill">SCAN · CHAT · BOOK</span><b data-pv="ctaId"></b><span data-pv="ctaEn"></span></div>
    <div class="pv-q"><div class="pv-qr web"><img src="/assets/img/qr-website.svg" alt=""></div><b data-pv="web"></b><small data-pv="webNote"></small></div></div>
</div></div>
<p class="pv-cap">Preview in the colours of the chosen look - the layout is in the template picture. The robot draws the final poster (A4 PDF, A4 picture, Instagram and Facebook size) after you press Save.</p>`;

const JOB = { queued: ["warn", "Waiting for the cloud robot"], running: ["warn", "The cloud robot is working on it"], done: ["ok", "Robot: done"],
  failed: ["bad", "Robot: failed"], refused: ["bad", "Robot: refused"], cancelled: ["", "Robot: cancelled"] };
const chip = (cls, text) => `<span class="po-chip ${cls}"><i></i>${e(text)}</span>`;
const kb = (chars) => Math.round(chars * 0.75 / 1024) + " KB";

export async function poster({ main, toast, db, F, me }) {
  const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
  const [snap, st, jobs, cities] = await Promise.all([
    F.getDocs(F.collection(db, "posters")).catch((er) => { toast("Could not read the posters: " + er.message, "err"); return null; }),
    F.getDoc(F.doc(db, "engineControl", "posterStatus")).catch(() => null),
    F.getDocs(F.query(F.collection(db, "engineJobs"), F.where("engine", "==", "poster"))).catch(() => null),
    fetch(FILES + "cities.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  const posters = snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.city).localeCompare(String(b.city))) : [];
  const status = (st && st.exists() ? st.data() : null) || {};
  // cities.json: Indonesian cities (by population rank, with province) + cities in other countries (from the site's travel guides)
  const cityList = (Array.isArray(cities) ? cities : []).filter((c) => c && c.name && SLUG_OK.test(String(c.slug || "")))
    .map((c) => ({ ...c, country: String(c.country || "Indonesia"), countryId: String(c.countryId || c.country || "Indonesia") }))
    .sort((a, b) => (Number(a.rank) || 9999) - (Number(b.rank) || 9999));
  // newest poster job per city (args: --city <slug> or --remove <slug>)
  const entryOf = (slug) => cityList.find((c) => c.slug === slug) || null;
  const countries = [...new Set(cityList.map((c) => c.country))].sort((a, b) => (a === "Indonesia" ? -1 : b === "Indonesia" ? 1 : a.localeCompare(b)));
  const lastJob = {};
  for (const j of (jobs ? jobs.docs.map((d) => d.data()) : []).sort((a, b) => ms(a.createdAt) - ms(b.createdAt))) {
    const a = Array.isArray(j.args) ? j.args : [], i = a.findIndex((x) => x === "--city" || x === "--remove");
    if (i >= 0 && a[i + 1]) lastJob[a[i + 1]] = j;
  }

  const queue = (args, label) => F.addDoc(F.collection(db, "engineJobs"), { engine: "poster", args, label: label.slice(0, 120), requestedBy: me.email,
    status: "queued", createdAt: F.serverTimestamp() });

  function item(p) {
    const s = status[p.id] || null, j = lastJob[p.id], v = encodeURIComponent(String(s?.v || ""));
    const chips = (s ? chip(s.ok ? "ok" : "bad", (s.ok ? "Poster made" : "Poster not made") + (s.madeAt ? " · " + s.madeAt : "")) : chip("", "Not made yet"))
      + (j && JOB[j.status] ? chip(JOB[j.status][0], JOB[j.status][1]) : "");
    const f = (n) => `${FILES}${p.id}-${n}?v=${v}`;
    const photoKind = { upload: "our own photo", commons: "Wikimedia Commons link", auto: "robot picks the photo" }[p.photoMode] || "robot picks the photo";
    return `<div class="po-item" data-id="${e(p.id)}">
      <div class="po-th">${s?.ok ? `<img src="${e(f("instagram.jpg"))}" alt="" loading="lazy">` : "No picture yet"}</div>
      <div><h3>${e(p.city)}${entryOf(p.id) ? ", " + e(entryOf(p.id).country) : ""}</h3><div class="pr" style="font-feature-settings:'calt' 0">${e(priceLine(p.priceRp))} <small style="font-weight:500;color:var(--mute)">${e(p.priceNote || "")}</small></div>
        <div>${chips}</div>
        ${s && !s.ok && s.note ? `<div class="credit" style="color:#b42318">${e(s.note)}</div>` : ""}
        ${s?.ok ? `<div class="dl"><a href="${e(f("A4.pdf"))}" target="_blank" rel="noopener">A4 for printing (PDF)</a><a href="${e(f("A4.jpg"))}" target="_blank" rel="noopener">A4 picture</a><a href="${e(f("instagram.jpg"))}" target="_blank" rel="noopener">Instagram / WhatsApp picture</a><a href="${e(f("facebook.jpg"))}" target="_blank" rel="noopener">Facebook size</a></div>` : ""}
        <div class="credit">Look: ${e(templateName(p.template))} · Photo: ${e(photoKind)}${s?.photo ? " · " + e(s.photo) : ""}${/^https:\/\/commons\.wikimedia\.org\//.test(String(s?.photoPage || "")) ? ` · <a href="${e(s.photoPage)}" target="_blank" rel="noopener">source</a>` : ""}</div>
      </div>
      <div class="po-acts"><button class="sk-btn sm" type="button" data-edit="${e(p.id)}">Edit</button><button class="sk-btn sm red" type="button" data-rm="${e(p.id)}">Remove</button></div>
    </div>`;
  }

  function list() {
    main.innerHTML = STYLE + `<h1>🖼️ Posters</h1><div class="po">
      <div class="panel"><h2>City posters</h2>
        <p class="po-sub">One poster per city, with a landmark photo and a room price. Customers can download them from the website.</p>
        <button class="sk-btn gold" type="button" id="po-new">+ New poster</button>
        <div class="po-list" style="margin-top:16px">${posters.length ? posters.map(item).join("") : `<p class="lead">No posters yet. Press <b>New poster</b> to make the first one.</p>`}</div>
        <div class="po-note" style="margin-top:14px">Fixed on every poster (not changed here): the two QR codes (WhatsApp and website), the logo and the line "PT Satu Koneksi Hotel · NIB 2710260118389". The phone number is never printed - customers scan the QR code.</div>
      </div></div>`;
    main.querySelectorAll(".po-th img").forEach((im) => { im.onerror = () => { im.parentElement.textContent = "No picture yet"; }; });
    main.querySelector("#po-new").onclick = () => form(null);
    main.querySelectorAll("[data-edit]").forEach((b) => { b.onclick = () => form(posters.find((p) => p.id === b.dataset.edit)); });
    main.querySelectorAll("[data-rm]").forEach((b) => {
      b.onclick = async () => {
        const p = posters.find((x) => x.id === b.dataset.rm); if (!p) return;
        if (!confirm(`Remove the ${p.city} poster? It is taken off the website too.`)) return;
        b.disabled = true;
        try {
          await F.deleteDoc(F.doc(db, "posters", p.id));
          await F.deleteDoc(F.doc(db, "posterPhotos", p.id)).catch(() => {});       // nothing there when the photo was not uploaded
          await queue(["--remove", p.id, "--deploy"], `Poster ${p.city}: remove`);
          posters.splice(posters.indexOf(p), 1);
          toast(`${p.city} poster removed. The cloud robot takes it off the website within 10-15 minutes.`);
          list();
        } catch (er) { toast("Could not remove: " + er.message, "err"); b.disabled = false; }
      };
    });
  }

  async function form(p) {
    const editing = !!p;
    const taken = new Set(posters.map((x) => x.id));
    const pe = editing ? entryOf(p.id) : null;
    const S = editing ? { ...defaultsFor(p.city, pe?.country, pe?.countryId), landmark: "", photoCredit: "", ...p } : null;
    let tpl = TEMPLATES.some((t) => t[0] === S?.template) ? S.template : TEMPLATES[0][0];
    let mode = MODES.includes(S?.photoMode) ? S.photoMode : (S?.landmark ? "commons" : "auto");
    let photo = null;          // { data, w, h, chars, fresh } - fresh = chosen now (written on Save)
    if (editing && mode === "upload") {
      try { const ph = await F.getDoc(F.doc(db, "posterPhotos", p.id)); if (ph.exists() && /^[A-Za-z0-9+/=]+$/.test(String(ph.data().data || ""))) photo = { ...ph.data(), chars: String(ph.data().data).length, fresh: false }; }
      catch (er) { toast("Could not load the uploaded photo: " + er.message, "err"); }
    }
    const field = (k, label, hint = "") => `<label>${e(label)}<input data-k="${k}" maxlength="${LIMITS[k]}" value="${e(S?.[k] ?? "")}">
      <small data-c="${k}">${hint ? e(hint) + " · " : ""}<span>0</span>/${LIMITS[k]} letters</small></label>`;
    const opts = (country) => cityList.filter((c) => c.country === country).sort((a, b) => (Number(a.rank) || 9999) - (Number(b.rank) || 9999) || a.name.localeCompare(b.name))
      .map((c) => `<option value="${e(c.slug)}"${taken.has(c.slug) ? " disabled" : ""}>${e(c.name)}${c.province ? " (" + e(c.province) + ")" : ""}${taken.has(c.slug) ? " - has a poster" : ""}</option>`).join("");
    const radio = (v, title, hint) => `<label class="mode" data-m="${v}"><input type="radio" name="po-mode" value="${v}"${mode === v ? " checked" : ""}><span>${e(title)}<small>${e(hint)}</small></span></label>`;
    main.innerHTML = STYLE + `<h1>🖼️ ${editing ? "Edit poster: " + e(p.city) : "New poster"}</h1><div class="po"><div class="po-edit">
      <form class="panel" id="po-form" novalidate>
        <p><a href="#" id="po-back">← Back to all posters</a></p>
        <h2>1. City and price</h2>
        <div class="po-grid">
          <label>${editing || !cityList.length ? "City" : "Country"}${editing ? `<input value="${e(p.city)}${pe ? ", " + e(pe.country) : ""}" disabled><small>The city cannot be changed. To make a poster for another city, press New poster.</small>`
            : cityList.length ? `<select id="po-country">${countries.map((c) => `<option value="${e(c)}">${e(c)}</option>`).join("")}</select><small>Indonesia first, then A-Z.</small></label>
          <label>City<select id="po-city"><option value="">Choose a city…</option>${opts(countries[0])}</select><small id="po-city-hint">Indonesian cities, biggest first.</small>`
              : `<input disabled value="The city list could not be loaded"><small>Reload the page. If it keeps happening, tell Claude.</small>`}</label>
          <label>Room price (Rupiah) - a full price or hide figures with x<input id="po-price" type="text" inputmode="text" maxlength="13" value="${e(S?.priceRp != null ? rupiah(S.priceRp).slice(2) : "")}" placeholder="1,250,000 or 1,2xx,xxx or 1,xxx,xxx">
            <small>e.g. 1,250,000 - or hide figures with x: 1,2xx,xxx or 1,xxx,xxx</small></label>
        </div>
        <div class="po-price" id="po-line"></div>
        <div class="po-grid" style="margin-top:14px">${field("priceNote", "Small line next to the price")}</div>

        <h2 style="margin-top:22px">2. Look</h2>
        <p class="po-sub">Pick a template. The pictures show each layout (with a sample city); the preview on the right takes its colours.</p>
        <style>.po-looks{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;margin:6px 0 4px}
        .po-looks button{border:3px solid transparent;border-radius:12px;padding:0;background:#fff;cursor:pointer;overflow:hidden;font:inherit;text-align:left;box-shadow:0 2px 8px #0001}
        .po-looks button.on{border-color:#C69B3D;box-shadow:0 0 0 3px #DFC07B}.po-looks img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:#eee}
        .po-looks span{display:block;font-size:11.5px;font-weight:700;padding:6px 7px;line-height:1.25}</style>
        <div class="po-looks" id="po-looks"></div>
        <h2 style="margin-top:22px">3. Photo</h2>
        <div class="po-modes">
          ${radio("auto", "Robot picks a landmark photo", "From Wikimedia Commons, only photos with a free licence. The credit is printed small on the poster.")}
          ${radio("commons", "Choose a landmark photo", "Press Find landmark photos and click the one you like (free-licence photos from Wikimedia Commons).")}
          ${radio("upload", "Upload our own photo", "A photo we took, or one we have permission to use.")}
        </div>
        <div class="po-box" id="po-commons">
          <style>.po-find .row{display:flex;gap:8px;flex-wrap:wrap}.po-find .row input{flex:1;min-width:180px}
          .po-found{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:10px 0}
          .po-found button{border:3px solid transparent;border-radius:10px;padding:0;background:#fff;cursor:pointer;overflow:hidden;text-align:left;font:inherit}
          .po-found button.on{border-color:#C69B3D;box-shadow:0 0 0 2px #DFC07B}.po-found img{width:100%;height:90px;object-fit:cover;display:block;background:#eee}
          .po-found span{display:block;font-size:11px;line-height:1.3;padding:4px 6px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .po-chosen{display:flex;gap:10px;align-items:center;margin:8px 0}.po-chosen img{width:120px;height:80px;object-fit:cover;border-radius:8px}</style>
          <div class="po-find"><div class="row"><button type="button" class="sk-btn gold" id="po-findbtn">🔎 Find landmark photos</button>
            <input id="po-findq" maxlength="60" placeholder="Other words (optional), e.g. Monas, Tugu Pahlawan, mosque"></div>
            <small id="po-findmsg">Shows only photos the poster may use: free licence, named photographer, big enough for print.</small>
            <div class="po-found" id="po-found"></div></div>
          <div class="po-chosen" id="po-chosen" hidden><img id="po-chosen-img" alt=""><small id="po-chosen-txt"></small></div>
          ${field("landmark", "Chosen photo (filled in when you click a photo - or paste a Wikimedia Commons link)", "")}</div>
        <div class="po-box" id="po-upload">
          <label>Photo file<input type="file" id="po-file" accept="image/*"><small>JPG or PNG, at least 1000 pixels wide. Landscape works best. It is made smaller automatically.</small></label>
          <div class="po-up"><img id="po-thumb" alt="" hidden><div class="info" id="po-info">No photo chosen yet.</div></div>
          <label class="po-ck"><input type="checkbox" id="po-ok"${S?.photoOk ? " checked" : ""}><span>We took this photo or have permission to use it</span></label>
          ${field("photoCredit", "Photo credit (optional)", "printed small, e.g. Foto: Satu Koneksi Hotel")}
        </div>

        <h2 style="margin-top:22px">4. Words</h2>
        <p class="po-sub">The big title on the poster is the city name.</p>
        <div class="po-grid">
          ${field("kicker", "Small gold label", "above the city name")}
          ${field("headId", "Main line (Bahasa Indonesia)")}
          ${field("headEn", "Main line (English)", "shown in gold italics")}
        </div>
        <h2 style="margin-top:22px">5. Three steps</h2>
        <div class="po-grid">
          ${field("p1t", "Box 1 - bold line")}${field("p1s", "Box 1 - small line")}
          ${field("p2t", "Box 2 - bold line")}${field("p2s", "Box 2 - small line")}
          ${field("p3t", "Box 3 - bold line")}${field("p3s", "Box 3 - small line")}
        </div>
        <h2 style="margin-top:22px">6. Bottom strip</h2>
        <p class="po-sub">Between the WhatsApp QR code (left) and the website QR code (right). The website address and its small line go under the website QR code.</p>
        <div class="po-grid">
          ${field("ctaId", "Big line (Bahasa Indonesia)")}${field("ctaEn", "Small line (English)")}
          ${field("web", "Website address")}${field("webNote", "Small line under the website")}
        </div>
        <div class="po-note" style="margin-top:14px">Fixed on every poster: the two QR codes (WhatsApp and website), the logo and the NIB line. The phone number is never printed.</div>
        <div class="po-bar">
          <button class="sk-btn gold" id="po-save" type="submit">Save and make poster</button>
          <button class="sk-btn" id="po-reset" type="button">Reset to the standard words</button>
          <span class="msg">${editing && p.updatedBy ? "Last saved by " + e(p.updatedBy) + "." : ""}</span>
        </div>
      </form>
      <div class="po-side">${PREVIEW}</div>
    </div></div>`;

    const fm = main.querySelector("#po-form");
    const q = (s) => main.querySelector(s);
    const val = (k) => String(q(`[data-k="${k}"]`)?.value ?? "");
    const entry = () => (editing ? pe : entryOf(q("#po-city")?.value || ""));
    const cityOf = () => (editing ? p.city : entry()?.name || "");
    const stdWords = () => { const c = entry(); return defaultsFor(cityOf(), c?.country, c?.countryId); };
    const price = () => normPrice(q("#po-price").value);
    const priceOk = (v) => !!normPrice(v);

    // ---- live preview (textContent only)
    const pv = q("#pv"), wrap = q("#pv-wrap");
    const scale = () => { pv.style.transform = `scale(${wrap.clientWidth / 1240})`; };
    if (window.ResizeObserver) new ResizeObserver(scale).observe(wrap);
    scale();
    const looks = q("#po-looks");
    const themeEl = document.createElement("style"); q("#pv").prepend(themeEl);
    const showLook = () => {
      themeEl.textContent = themeCss(tpl);
      looks.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === tpl));
    };
    for (const [id, name] of TEMPLATES) {
      const b = document.createElement("button"); b.type = "button"; b.dataset.t = id; b.title = name;
      const im = document.createElement("img"); im.loading = "lazy"; im.alt = name; im.src = `/assets/files/posters/templates/${id}.jpg`;
      const sp = document.createElement("span"); sp.textContent = name;
      b.append(im, sp); b.onclick = () => { tpl = id; showLook(); }; looks.append(b);
    }
    showLook();
    function preview() {
      main.querySelectorAll("[data-pv]").forEach((el) => { el.textContent = val(el.dataset.pv); });
      const city = cityOf() || "Kota";
      const cityEl = q("#pv-city"); cityEl.textContent = city.toUpperCase();
      cityEl.style.fontSize = Math.max(70, Math.min(172, Math.floor(1080 / (city.length * 0.78)))) + "px";
      const n = price(), rp = priceOk(n) ? rupiah(n) : "Rp—";
      for (const id of ["#pv-pid", "#pv-pen", "#po-line"]) q(id).style.fontFeatureSettings = '"calt" 0';   // keep "x" an x (the font turns x between figures into ×)
      q("#pv-pid").textContent = "Kamar Hotel " + rp;
      q("#pv-pen").textContent = "Hotel Room " + rp;
      q("#po-line").textContent = priceOk(n) ? priceLine(n) : "Type a price, e.g. 1,250,000 - or hide figures with x: 1,2xx,xxx or 1,xxx,xxx";
      const ph = q("#pv-ph"), note = q("#pv-auto");
      if (mode === "upload" && photo) { ph.style.backgroundImage = `url("data:image/jpeg;base64,${photo.data}")`; note.textContent = ""; }
      else if (mode === "commons" && chosen && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(chosen.thumb)) { ph.style.backgroundImage = `url("${chosen.thumb.replace(/"/g, "%22")}")`; note.textContent = ""; }
      else { ph.style.backgroundImage = ""; note.textContent = mode === "upload" ? "Choose a photo to see it here" : mode === "commons" ? "Press Find landmark photos and click one" : "The robot adds the landmark photo"; }
      q("#pv-credit").textContent = mode === "upload" ? val("photoCredit") : (mode === "commons" && chosen ? `Foto: ${chosen.author} · ${chosen.lic} · Wikimedia Commons` : "Photo credit from Wikimedia Commons");
    }
    const count = (k) => {
      const el = q(`[data-k="${k}"]`), c = q(`[data-c="${k}"]`); if (!el || !c) return;
      c.querySelector("span").textContent = el.value.length; c.classList.toggle("full", el.value.length >= LIMITS[k]);
    };
    const fill = (vals) => { for (const [k, v] of Object.entries(vals)) { const el = q(`[data-k="${k}"]`); if (el) { el.value = v; count(k); } } preview(); };
    fm.querySelectorAll("input[data-k]").forEach((el) => { el.oninput = () => { count(el.dataset.k); preview(); }; count(el.dataset.k); });
    q("#po-price").oninput = preview;

    // ---- photo choice
    const showMode = () => {
      main.querySelectorAll(".po-modes label.mode").forEach((l) => l.classList.toggle("on", l.dataset.m === mode));
      q("#po-commons").hidden = mode !== "commons"; q("#po-upload").hidden = mode !== "upload";
      preview();
    };
    main.querySelectorAll('input[name="po-mode"]').forEach((r) => { r.onchange = () => { mode = r.value; showMode(); }; });
    const showPhoto = () => {
      const t = q("#po-thumb"), info = q("#po-info");
      if (!photo) { t.hidden = true; info.textContent = "No photo chosen yet."; return; }
      t.src = "data:image/jpeg;base64," + photo.data; t.hidden = false;
      info.textContent = `${photo.w} × ${photo.h} pixels · ${kb(photo.chars)}${photo.fresh ? " · new - stored when you press Save" : " · the photo saved now"}`;
    };
    q("#po-file").onchange = async (ev) => {
      const file = ev.target.files && ev.target.files[0]; if (!file) return;
      q("#po-info").textContent = "Preparing the photo…";
      try { photo = { ...(await shrinkPhoto(file)), fresh: true }; }
      catch (er) { toast(er.message, "err"); ev.target.value = ""; }
      showPhoto(); preview();
    };
    showPhoto(); showMode();

    // ---- Find landmark photos (pulled from Wikimedia Commons) - click one to choose it
    let chosen = null;
    const showChosen = () => {
      const box = q("#po-chosen"); box.hidden = !chosen;
      if (chosen) { q("#po-chosen-img").src = chosen.thumb; q("#po-chosen-txt").textContent = `Chosen: ${chosen.name.replace(/_/g, " ")} · Foto: ${chosen.author} · ${chosen.lic}`; }
      main.querySelectorAll("#po-found button").forEach((b) => b.classList.toggle("on", !!chosen && b.dataset.name === chosen.name));
      preview();
    };
    const choose = (ph) => {
      chosen = ph; const lm = q('[data-k="landmark"]'); lm.value = ph.page.slice(0, LIMITS.landmark); count("landmark");
      if (mode !== "commons") { mode = "commons"; const r = main.querySelector('input[name="po-mode"][value="commons"]'); if (r) r.checked = true; showMode(); }
      showChosen();
    };
    q("#po-findbtn").onclick = async () => {
      const city = cityOf(); if (!city) return toast("Choose a city first.", "err");
      const btn = q("#po-findbtn"), msg = q("#po-findmsg"), grid = q("#po-found");
      btn.disabled = true; msg.textContent = "Looking on Wikimedia Commons…"; grid.textContent = "";
      try {
        const words = q("#po-findq").value.replace(/[\r\n]/g, " ").trim();
        const list = await findPhotos(city.replace(/\s*\(.*?\)/g, ""), entry()?.country || "Indonesia", words);
        msg.textContent = list.length ? `${list.length} photos found - click one to use it.` : "No usable photo found. Try other words (a landmark's name), or upload our own photo.";
        for (const ph of list) {
          const b = document.createElement("button"); b.type = "button"; b.dataset.name = ph.name; b.title = `${ph.name.replace(/_/g, " ")}\nFoto: ${ph.author} · ${ph.lic}`;
          const im = document.createElement("img"); im.loading = "lazy"; im.alt = ph.name.replace(/_/g, " "); im.src = ph.thumb;
          const sp = document.createElement("span"); sp.textContent = ph.name.replace(/_/g, " ").replace(/\.jpe?g$/i, "");
          b.append(im, sp); b.onclick = () => choose(ph); grid.append(b);
        }
        showChosen();
      } catch (er) { msg.textContent = "Wikimedia Commons could not be reached - try again in a minute. (" + er.message + ")"; }
      btn.disabled = false;
    };
    q("#po-findq").onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); q("#po-findbtn").click(); } };
    const lmEl = q('[data-k="landmark"]');
    const loadChosen = async () => {                      // a pasted link, or the photo saved before: show it
      const name = commonsFile(lmEl.value);
      if (!/\.jpe?g$/i.test(name)) { chosen = null; return showChosen(); }
      try { chosen = await photoOf(name); } catch (er) { chosen = null; }
      if (!chosen) toast("That photo cannot be used on a poster (it needs a free licence, a named photographer and at least 1200 pixels). Press Find landmark photos.", "err");
      showChosen();
    };
    lmEl.onchange = loadChosen;
    if (lmEl.value) loadChosen();

    const sel = q("#po-city");
    if (sel) sel.onchange = () => { if (cityOf()) fill(stdWords()); else preview(); };   // a new city: its standard words
    const csel = q("#po-country");
    if (csel) csel.onchange = () => {                       // another country: its cities (biggest first), nothing chosen yet
      sel.innerHTML = `<option value="">Choose a city…</option>${opts(csel.value)}`;
      q("#po-city-hint").textContent = csel.value === "Indonesia" ? "Indonesian cities, biggest first." : `Cities in ${csel.value} from our travel guides.`;
      preview();
    };
    if (!editing && !sel) q("#po-save").disabled = true;
    q("#po-back").onclick = (ev) => { ev.preventDefault(); list(); };
    q("#po-reset").onclick = () => {
      const c = cityOf(); if (!c) return toast("Choose a city first.", "err");
      fill(stdWords()); toast("Standard words filled in - press Save to use them.");
    };

    fm.onsubmit = async (ev) => {
      ev.preventDefault();
      const slug = editing ? p.id : (sel ? sel.value : "");
      const city = cityOf();
      if (!SLUG_OK.test(slug) || !city) return toast("Choose a city.", "err");
      if (!editing && taken.has(slug)) return toast(`${city} already has a poster - edit that one.`, "err");
      const n = price();
      if (!priceOk(n)) { q("#po-price").focus(); return toast("Type the room price in Rupiah: e.g. 1,250,000, or with x for hidden figures: 1,2xx,xxx or 1,xxx,xxx (5 to 9 figures).", "err"); }
      const data = { city: city.slice(0, LIMITS.city), priceRp: n, template: tpl, photoMode: mode, photoOk: mode === "upload" && q("#po-ok").checked };
      for (const k of Object.keys(LIMITS)) {
        if (k === "city") continue;
        data[k] = val(k).replace(/[\r\n\t]+/g, " ").trim().slice(0, LIMITS[k]);
      }
      if (mode !== "commons") data.landmark = "";
      if (mode !== "upload") data.photoCredit = "";
      const empty = Object.keys(LIMITS).filter((k) => data[k] === "" && !["kicker", "webNote", "landmark", "priceNote", "photoCredit", "city"].includes(k));
      if (empty.length) { q(`[data-k="${empty[0]}"]`)?.focus(); return toast("Please fill in every box (only the small gold label, the price note, the photo credit and the line under the website may stay empty).", "err"); }
      if (mode === "commons" && !/\.jpe?g$/i.test(commonsFile(data.landmark))) {
        q('[data-k="landmark"]').focus(); return toast("Press Find landmark photos and click a photo (or choose another photo option).", "err");
      }
      if (mode === "upload" && !photo) return toast("Choose a photo file to upload (or choose another photo option).", "err");
      if (mode === "upload" && !data.photoOk) { q("#po-ok").focus(); return toast('Please tick "We took this photo or have permission to use it".', "err"); }
      const btn = q("#po-save"); btn.disabled = true;
      try {
        if (mode === "upload" && photo.fresh) {
          await F.setDoc(F.doc(db, "posterPhotos", slug), { data: photo.data, type: "image/jpeg", w: photo.w, h: photo.h, updatedBy: me.email, updatedAt: F.serverTimestamp() });
          photo.fresh = false;
        }
        await F.setDoc(F.doc(db, "posters", slug), { ...data, updatedBy: me.email, updatedAt: F.serverTimestamp() });
        if (mode !== "upload" && editing && p.photoMode === "upload") await F.deleteDoc(F.doc(db, "posterPhotos", slug)).catch(() => {});   // the old photo is no longer used
        await queue(["--city", slug, "--deploy"], `Poster ${city}: make and publish`);
        const old = posters.findIndex((x) => x.id === slug);
        const row = { id: slug, ...data, updatedBy: me.email };
        if (old >= 0) posters[old] = row; else posters.push(row);
        lastJob[slug] = { status: "queued" };
        toast("Saved. The cloud robot makes the new poster and puts it on the website, usually within 10-15 minutes.");
        list();
      } catch (er) { toast("Could not save: " + er.message, "err"); btn.disabled = false; }
    };
  }

  list();
}
