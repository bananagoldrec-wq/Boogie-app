/**
 * prefs.js
 * Faixas ocultas pelo usuário ("não curti"), salvas no localStorage.
 * Servem para filtrar o que a pessoa não gosta (some das listas e da rádio)
 * e como sinal de preferência. 100% local, sem login.
 *
 * Exposto como: window.Hidden
 */
(function () {
  "use strict";

  const KEY = "disco_boogie_hidden";

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  function key(t) { return norm(t.artist) + "::" + norm(t.title); }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function write(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) { /* ignore */ }
  }

  function list() { return read(); }
  function has(t) { const k = key(t); return read().some((x) => key(x) === k); }
  function add(t) {
    const arr = read();
    const k = key(t);
    if (arr.some((x) => key(x) === k)) return;
    arr.push({ artist: t.artist, title: t.title, country: t.country || null });
    write(arr);
  }
  function remove(t) {
    const k = key(t);
    write(read().filter((x) => key(x) !== k));
  }
  function clear() { write([]); }

  window.Hidden = { list, has, add, remove, clear };
})();
