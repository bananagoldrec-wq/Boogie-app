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
    { code: "CM", name: "Camarões",       flag: "🇨🇲", lat: 6,   lng: 12,  mb: "CM", dg: "Cameroon" },
    { code: "CI", name: "Costa do Marfim", flag: "🇨🇮", lat: 7.5, lng: -5.5, mb: "CI", dg: "Cote d'Ivoire" },
    { code: "BJ", name: "Benim",          flag: "🇧🇯", lat: 9.5, lng: 2.3, mb: "BJ", dg: "Benin" },
    { code: "ET", name: "Etiópia",        flag: "🇪🇹", lat: 9,   lng: 40,  mb: "ET", dg: "Ethiopia" },
    { code: "AO", name: "Angola",         flag: "🇦🇴", lat: -12, lng: 18,  mb: "AO", dg: "Angola" },
    { code: "CD", name: "RD Congo",       flag: "🇨🇩", lat: -3,  lng: 23,  mb: "CD", dg: "DR Congo" },
    { code: "ZM", name: "Zâmbia",         flag: "🇿🇲", lat: -13, lng: 27,  mb: "ZM", dg: "Zambia" },
    { code: "SL", name: "Serra Leoa",     flag: "🇸🇱", lat: 8.5, lng: -11.8, mb: "SL", dg: "Sierra Leone" },
    { code: "ML", name: "Mali",           flag: "🇲🇱", lat: 17,  lng: -4,  mb: "ML", dg: "Mali" },
    { code: "GN", name: "Guiné",          flag: "🇬🇳", lat: 10.5, lng: -11, mb: "GN", dg: "Guinea" },
    { code: "BF", name: "Burkina Faso",   flag: "🇧🇫", lat: 12,  lng: -1.5, mb: "BF", dg: "Burkina Faso" },
    { code: "TG", name: "Togo",           flag: "🇹🇬", lat: 8.6, lng: 0.8, mb: "TG", dg: "Togo" },
    { code: "KE", name: "Quênia",         flag: "🇰🇪", lat: 0.5, lng: 37.5, mb: "KE", dg: "Kenya" },
    { code: "TZ", name: "Tanzânia",       flag: "🇹🇿", lat: -6.4, lng: 35, mb: "TZ", dg: "Tanzania" },
    { code: "ZW", name: "Zimbábue",       flag: "🇿🇼", lat: -19, lng: 29.5, mb: "ZW", dg: "Zimbabwe" },
    { code: "MG", name: "Madagascar",     flag: "🇲🇬", lat: -19, lng: 47,  mb: "MG", dg: "Madagascar" },
    { code: "MA", name: "Marrocos",       flag: "🇲🇦", lat: 32,  lng: -6,  mb: "MA", dg: "Morocco" },
    { code: "EG", name: "Egito",          flag: "🇪🇬", lat: 26,  lng: 30,  mb: "EG", dg: "Egypt" },
    { code: "SD", name: "Sudão",          flag: "🇸🇩", lat: 15,  lng: 30,  mb: "SD", dg: "Sudan" },
    { code: "SO", name: "Somália",        flag: "🇸🇴", lat: 6,   lng: 46,  mb: "SO", dg: "Somalia" },
    { code: "GM", name: "Gâmbia",         flag: "🇬🇲", lat: 13.4, lng: -15.5, mb: "GM", dg: "Gambia" },
    { code: "CG", name: "Congo",          flag: "🇨🇬", lat: -1,  lng: 15,  mb: "CG", dg: "Congo" },
    { code: "GA", name: "Gabão",          flag: "🇬🇦", lat: -0.5, lng: 11.7, mb: "GA", dg: "Gabon" },
    { code: "MZ", name: "Moçambique",     flag: "🇲🇿", lat: -18, lng: 35,  mb: "MZ", dg: "Mozambique" },
    { code: "MU", name: "Maurício",       flag: "🇲🇺", lat: -20.3, lng: 57.5, mb: "MU", dg: "Mauritius" },
    { code: "CU", name: "Cuba",           flag: "🇨🇺", lat: 22,  lng: -79, mb: "CU", dg: "Cuba" },
    { code: "CV", name: "Cabo Verde",     flag: "🇨🇻", lat: 16,  lng: -24, mb: "CV", dg: "Cape Verde" },
    { code: "CN", name: "China",          flag: "🇨🇳", lat: 35,  lng: 105, mb: "CN", dg: "China" },
    { code: "KR", name: "Coreia do Sul",  flag: "🇰🇷", lat: 36,  lng: 128, mb: "KR", dg: "South Korea" },
    { code: "ID", name: "Indonésia",      flag: "🇮🇩", lat: -2,  lng: 118, mb: "ID", dg: "Indonesia" },
    { code: "TR", name: "Turquia",        flag: "🇹🇷", lat: 39,  lng: 35,  mb: "TR", dg: "Turkey" },
    { code: "GR", name: "Grécia",         flag: "🇬🇷", lat: 39,  lng: 22,  mb: "GR", dg: "Greece" },
    { code: "RU", name: "Rússia / URSS",  flag: "🇷🇺", lat: 60,  lng: 90,  mb: "RU", dg: "Russia" },
    { code: "TT", name: "Trinidad e Tobago", flag: "🇹🇹", lat: 10.5, lng: -61, mb: "TT", dg: "Trinidad & Tobago" },
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
      zoomControl: false,
      attributionControl: false, // tela inicial minimalista, sem texto embaixo
    });
    // Zoom no canto inferior esquerdo (longe do logo flutuante).
    L.control.zoom({ position: "bottomleft" }).addTo(map);

    // Tiles do OpenStreetMap (crédito mantido no README).
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
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
