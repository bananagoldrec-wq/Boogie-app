/**
 * map.js
 * Mapa-múndi 2D interativo com Leaflet.js e marcadores por país.
 *
 * Expõe:
 *   window.COUNTRIES  -> metadados dos países suportados
 *   window.DiscoMap.init(onSelect) -> inicializa o mapa e marcadores
 *
 * A disponibilidade (available) vem do data/seeds.json; aqui ficam apenas
 * nome, bandeira, coordenadas e códigos das APIs externas.
 */
(function () {
  "use strict";

  // code: ISO alpha-2 (== chave em seeds.json)
  // mb: country para MusicBrainz | dg: nome para Discogs
  const COUNTRIES = [
    { code: "US", name: "Estados Unidos", flag: "🇺🇸", lat: 39,  lng: -98, mb: "US", dg: "US" },
    { code: "BR", name: "Brasil",         flag: "🇧🇷", lat: -10, lng: -52, mb: "BR", dg: "Brazil" },
    { code: "FR", name: "França",         flag: "🇫🇷", lat: 46,  lng: 2,   mb: "FR", dg: "France" },
    { code: "GB", name: "Reino Unido",    flag: "🇬🇧", lat: 54,  lng: -2,  mb: "GB", dg: "UK" },
    { code: "DE", name: "Alemanha",       flag: "🇩🇪", lat: 51,  lng: 10,  mb: "DE", dg: "Germany" },
    { code: "IT", name: "Itália",         flag: "🇮🇹", lat: 42,  lng: 12,  mb: "IT", dg: "Italy" },
    { code: "NG", name: "Nigéria",        flag: "🇳🇬", lat: 9,   lng: 8,   mb: "NG", dg: "Nigeria" },
    { code: "JM", name: "Jamaica",        flag: "🇯🇲", lat: 18,  lng: -77, mb: "JM", dg: "Jamaica" },
    { code: "AR", name: "Argentina",      flag: "🇦🇷", lat: -38, lng: -64, mb: "AR", dg: "Argentina" },
    { code: "JP", name: "Japão",          flag: "🇯🇵", lat: 36,  lng: 138, mb: "JP", dg: "Japan" },
    { code: "ZA", name: "África do Sul",  flag: "🇿🇦", lat: -29, lng: 24,  mb: "ZA", dg: "South Africa" },
    { code: "IN", name: "Índia",          flag: "🇮🇳", lat: 22,  lng: 79,  mb: "IN", dg: "India" },
    { code: "CO", name: "Colômbia",       flag: "🇨🇴", lat: 4,   lng: -73, mb: "CO", dg: "Colombia" },
    { code: "MX", name: "México",         flag: "🇲🇽", lat: 23,  lng: -102,mb: "MX", dg: "Mexico" },
    { code: "ES", name: "Espanha",        flag: "🇪🇸", lat: 40,  lng: -4,  mb: "ES", dg: "Spain" },
    { code: "NL", name: "Países Baixos",  flag: "🇳🇱", lat: 52,  lng: 5,   mb: "NL", dg: "Netherlands" },
    { code: "BE", name: "Bélgica",        flag: "🇧🇪", lat: 50,  lng: 4,   mb: "BE", dg: "Belgium" },
    { code: "SE", name: "Suécia",         flag: "🇸🇪", lat: 62,  lng: 15,  mb: "SE", dg: "Sweden" },
    { code: "CA", name: "Canadá",         flag: "🇨🇦", lat: 56,  lng: -106,mb: "CA", dg: "Canada" },
    { code: "AU", name: "Austrália",      flag: "🇦🇺", lat: -25, lng: 134, mb: "AU", dg: "Australia" },
    { code: "PH", name: "Filipinas",      flag: "🇵🇭", lat: 13,  lng: 122, mb: "PH", dg: "Philippines" },
    { code: "GH", name: "Gana",           flag: "🇬🇭", lat: 8,   lng: -1,  mb: "GH", dg: "Ghana" },
    { code: "SN", name: "Senegal",        flag: "🇸🇳", lat: 14,  lng: -14, mb: "SN", dg: "Senegal" },
    { code: "CU", name: "Cuba",           flag: "🇨🇺", lat: 22,  lng: -79, mb: "CU", dg: "Cuba" },
    { code: "CV", name: "Cabo Verde",     flag: "🇨🇻", lat: 16,  lng: -24, mb: "CV", dg: "Cape Verde" },
    { code: "CN", name: "China",          flag: "🇨🇳", lat: 35,  lng: 105, mb: "CN", dg: "China" },
    { code: "MN", name: "Mongólia",       flag: "🇲🇳", lat: 47,  lng: 104, mb: "MN", dg: "Mongolia" },
    { code: "GL", name: "Groenlândia",    flag: "🇬🇱", lat: 72,  lng: -40, mb: "GL", dg: "Greenland" },
  ];

  function init(onSelect) {
    const map = L.map("map", {
      center: [20, 0],
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
        map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 4), { duration: 0.8 });
        if (typeof onSelect === "function") onSelect(c);
      });
    });

    return map;
  }

  window.COUNTRIES = COUNTRIES;
  window.DiscoMap = { init };
})();
