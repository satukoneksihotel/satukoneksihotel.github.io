// Tiny text helpers shared by every script - no Firebase here, so the fast first draw of the Hotels page can use them
// before the Firebase scripts have loaded. sk-core.js re-exports them.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const lang = () => { try { return localStorage.getItem("okLang") || ((navigator.language || "").startsWith("id") ? "id" : "en"); } catch { return "en"; } };
export const setLang = (l) => { try { localStorage.setItem("okLang", l); } catch { /* ignore */ } };
export const L = (o, k) => (o && (o[k + "_" + lang()] || o[k + "_en"] || o[k + "_id"] || o[k])) || "";
export const T = (en, id) => (lang() === "id" ? id : en);
