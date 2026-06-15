/**
 * playlists.js
 * Sistema de playlists 100% offline via localStorage.
 *
 * Estrutura salva em localStorage["disco_boogie_playlists"]:
 * {
 *   "playlists": [
 *     { "id": "uuid", "name": "Minha Playlist Groovy",
 *       "tracks": [ { title, artist, year, country, spotify_embed, youtube_id } ] }
 *   ]
 * }
 *
 * Expõe: window.Playlists  (camada de dados, sem UI)
 */
(function () {
  "use strict";

  const KEY = "disco_boogie_playlists";

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "pl-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { playlists: [] };
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.playlists)) return { playlists: [] };
      return data;
    } catch (err) {
      console.warn("[Playlists] localStorage ilegível, recomeçando:", err.message);
      return { playlists: [] };
    }
  }

  function write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error("[Playlists] falha ao salvar:", err.message);
      return false;
    }
  }

  function all() {
    return read().playlists;
  }

  function get(id) {
    return read().playlists.find((p) => p.id === id) || null;
  }

  function create(name) {
    const data = read();
    const pl = { id: uuid(), name: (name || "Nova Playlist").trim() || "Nova Playlist", tracks: [] };
    data.playlists.push(pl);
    write(data);
    return pl;
  }

  function rename(id, name) {
    const data = read();
    const pl = data.playlists.find((p) => p.id === id);
    if (!pl) return false;
    pl.name = (name || "").trim() || pl.name;
    return write(data);
  }

  function remove(id) {
    const data = read();
    data.playlists = data.playlists.filter((p) => p.id !== id);
    return write(data);
  }

  function slimTrack(t) {
    return {
      title: t.title,
      artist: t.artist,
      year: t.year || null,
      country: t.country || null,
      spotify_embed: t.spotify_embed || null,
      youtube_id: t.youtube_id || null,
    };
  }

  function trackKey(t) {
    return `${(t.artist || "").toLowerCase()}::${(t.title || "").toLowerCase()}`;
  }

  function addTrack(id, track) {
    const data = read();
    const pl = data.playlists.find((p) => p.id === id);
    if (!pl) return { ok: false, reason: "not_found" };
    const key = trackKey(track);
    if (pl.tracks.some((t) => trackKey(t) === key)) {
      return { ok: false, reason: "duplicate" };
    }
    pl.tracks.push(slimTrack(track));
    write(data);
    return { ok: true };
  }

  function removeTrack(id, index) {
    const data = read();
    const pl = data.playlists.find((p) => p.id === id);
    if (!pl || index < 0 || index >= pl.tracks.length) return false;
    pl.tracks.splice(index, 1);
    return write(data);
  }

  function moveTrack(id, from, to) {
    const data = read();
    const pl = data.playlists.find((p) => p.id === id);
    if (!pl) return false;
    if (from < 0 || from >= pl.tracks.length || to < 0 || to >= pl.tracks.length) return false;
    const [item] = pl.tracks.splice(from, 1);
    pl.tracks.splice(to, 0, item);
    return write(data);
  }

  window.Playlists = {
    all, get, create, rename, remove,
    addTrack, removeTrack, moveTrack,
  };
})();
