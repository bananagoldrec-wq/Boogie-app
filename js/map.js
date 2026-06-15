/**
 * map.js
 * Mapa-múndi 2D interativo com Leaflet.js e marcadores por país.
 *
 * Expõe:
 *   window.COUNTRIES  -> metadados dos países suportados
 *   window.DiscoMap.init(onSelect) -> inicializa o mapa e marcadores
 */
(function () {
  "use strict";

  // code: ISO alpha-2 (== chave em seeds.json)
  // mb: nome/código para MusicBrainz (country:CODE)  | dg: nome para Discogs
  const COUNTRIES = [
    { code: "BR", name: "Brasil",        flag: "🇧🇷", lat: -10, lng: -52, mb: "BR", dg: "Brazil" },
    { code: "US", name: "Estados Unidos", flag: "🇺🇸", lat: 39,  lng: -98, mb: "US", dg: "US" },
    { code: "FR", name: "França",        flag: "🇫🇷", lat: 46,  lng: 2,   mb: "FR", dg: "France" },
    { code: "GB", name: "Reino Unido",   flag: "🇬🇧", lat: 54,  lng: -2,  mb: "GB", dg: "UK" },
    { code: "DE", name: "Alemanha",      flag: "🇩🇪", lat: 51,  lng: 10,  mb: "DE", dg: "Germany" },
    { code: "NG", name: "Nigéria",       flag: "🇳🇬", lat: 9,   lng: 8,   mb: "NG", dg: "Nigeria" },
    { code: "JM", name: "Jamaica",       flag: "🇯🇲", lat: 18,  lng: -77, mb: "JM", dg: "Jamaica" },
    { code: "IT", name: "Itália",        flag: "🇮🇹", lat: 42,  lng: 12,  mb: "IT", dg: "Italy" },
    { code: "AR", name: "Argentina",     flag: "🇦🇷", lat: -38, lng: -64, mb: "AR", dg: "Argentina" },
  ];

  function init(onSelect) {
    const map = L.map("map", {
      center: [20, -20],
      zoom: 2,
      minZoom: 2,
      maxZoom: 6,
      worldCopyJump: true,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      noWrap: false,
    }).addTo(map);

    COUNTRIES.forEach((c) => {
      const icon = L.divIcon({
        className: "country-pin-wrap",
        html:
          `<div class="country-pin" title="${c.name}">` +
          `<span class="pin-flag">${c.flag}</span>` +
          `<span class="pin-label">${c.name}</span>` +
          `</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([c.lat, c.lng], { icon, keyboard: true }).addTo(map);
      marker.on("click", () => {
        map.flyTo([c.lat, c.lng], 4, { duration: 0.8 });
        if (typeof onSelect === "function") onSelect(c);
      });
    });

    return map;
  }

  window.COUNTRIES = COUNTRIES;
  window.DiscoMap = { init };
})();
