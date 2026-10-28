/* banana gold records · séries e lançamentos — lógica do app.
   Mesma base das agendas do Frisson e do Pato: grava no aparelho e
   sincroniza pelo Firestore quando dá. Duas coleções:
   - bg_releases: cada volume de cada série institucional;
   - bg_events:   tarefas da equipe no calendário (master, arte...).
   O catálogo levantado no Bandcamp vem embutido (SEED_RELEASES) e o que
   a equipe edita por cima vira um doc com o mesmo id. Apagar um volume
   grava { deleted: true }, pra ele não voltar da base embutida. */

(() => {
  "use strict";

  /* A página fica até 10 min no cache do GitHub Pages/navegador. Se o
     HTML velho carregar este JS novo (ou o contrário), os elementos não
     batem e o app trava sem desenhar nada. BUILD tem que ser igual ao
     data-build do bananagold.html: suba os dois juntos com o ?v=. */
  const BUILD = "22";
  if (document.documentElement.dataset.build !== BUILD) {
    const tried = (() => { try { return sessionStorage.getItem("bg_build_reload") === BUILD; } catch (err) { return false; } })();
    if (!tried) {
      try { sessionStorage.setItem("bg_build_reload", BUILD); } catch (err) {}
      // busca a página de novo ignorando o cache, depois recarrega
      fetch(location.href, { cache: "reload" }).catch(() => {}).finally(() => location.reload());
      return;
    }
  }

  /* Mesmo projeto Firebase do Frisson, em coleções separadas (bg_*) —
     veja o README pras regras. */
  const firebaseConfig = {
    apiKey: "AIzaSyBq_x9Mfyv0aT-wblKcbWScUGn1htCg_3g",
    authDomain: "frisson-agenda.firebaseapp.com",
    projectId: "frisson-agenda",
    storageBucket: "frisson-agenda.firebasestorage.app",
    messagingSenderId: "28732138318",
    appId: "1:28732138318:web:67e28575aa1040770f741f",
  };

  // Trava de acesso simples: segura visitante casual, mas não é
  // segurança de verdade — quem ler o código encontra a senha.
  const APP_PASSWORD = "bananagold";
  const UNLOCK_KEY = "bg_unlocked_v1";
  const LOCAL_KEY = "bg_local_v1";
  const TAB_KEY = "bg_tab_v1";

  const BANDCAMP = "https://bananagoldrecords.bandcamp.com";
  const SOUNDCLOUD = "https://soundcloud.com/bananagoldrecords";

  const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /* ── séries institucionais ─────────────────────────────── */
  const SERIES = [
    { id: "groovy", nome: "Groovy Tools", sigla: "GRV", cor: "#ff8a3d" },
    { id: "carna", nome: "Carna Tools", sigla: "CRN", cor: "#ff4fa3" },
    { id: "jacuzzi", nome: "Jacuzzi Edits", sigla: "JCZ", cor: "#3fc6ff" },
    { id: "gangue", nome: "Gangue do Sorriso", sigla: "GDS", cor: "#ffd400" },
    { id: "baile", nome: "Baile Tools", sigla: "BLT", cor: "#b07cff" },
    { id: "selector", nome: "Selector Tools", sigla: "SLT", cor: "#ffffff" },
    { id: "tributes", nome: "Tributes", sigla: "TRB", cor: "#ff5a36" },
    // catálogo geral: tudo o que o selo lançou fora das séries. Não tem
    // volume — aparece como lista no fim da aba Séries e no calendário.
    // projetos com nome livre, criados pela equipe (aba Demos ou + Novo)
    { id: "projetos", nome: "Projetos novos", sigla: "PRJ", cor: "#ffffff", geral: true },
    { id: "catalogo", nome: "Outros lançamentos", sigla: "BG", cor: "#000000", geral: true },
  ];
  const SERIES_BY_ID = Object.fromEntries(SERIES.map((s) => [s.id, s]));
  const isGeral = (r) => !!(SERIES_BY_ID[r.serie] || {}).geral;

  const STATUS = [
    { id: "planejado", nome: "Planejado" },
    { id: "producao", nome: "Em produção" },
    { id: "agendado", nome: "Agendado" },
    { id: "lancado", nome: "Lançado" },
  ];
  const STATUS_NAME = Object.fromEntries(STATUS.map((s) => [s.id, s.nome]));

  const CHECKLIST = [
    { id: "master", nome: "Master final" },
    { id: "arte", nome: "Capa / arte" },
    { id: "metadados", nome: "Metadados, ISRC e créditos" },
    { id: "bandcamp", nome: "Upload no Bandcamp" },
    { id: "distribuicao", nome: "Distribuidora (Spotify, Beatport...)" },
    { id: "press", nome: "Press release" },
    { id: "divulgacao", nome: "Posts e teaser" },
  ];

  const TASK_TYPES = [
    { id: "master", nome: "Master" },
    { id: "arte", nome: "Arte" },
    { id: "metadados", nome: "Metadados" },
    { id: "upload", nome: "Upload / distribuição" },
    { id: "divulgacao", nome: "Divulgação" },
    { id: "reuniao", nome: "Reunião" },
    { id: "outro", nome: "Outro" },
  ];
  const TASK_TYPE_NAME = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t.nome]));

  /* "Gerar cronograma": tarefas contando pra trás da data de lançamento.
     O id é fixo por lançamento + etapa, então gerar de novo atualiza as
     datas em vez de duplicar (e mantém o que já foi marcado como feito). */
  const PLAN_STEPS = [
    { id: "master", dias: -28, tipo: "master", titulo: "Entregar master" },
    { id: "arte", dias: -21, tipo: "arte", titulo: "Fechar capa / arte" },
    { id: "metadados", dias: -18, tipo: "metadados", titulo: "Metadados, ISRC e créditos" },
    { id: "upload", dias: -14, tipo: "upload", titulo: "Subir no Bandcamp e na distribuidora" },
    { id: "press", dias: -10, tipo: "divulgacao", titulo: "Press release pronto" },
    { id: "teaser", dias: -7, tipo: "divulgacao", titulo: "Teaser nas redes" },
    { id: "posts", dias: 0, tipo: "divulgacao", titulo: "Posts do lançamento" },
  ];

  /* ── catálogo levantado no Bandcamp (out/2026) ─────────────
     Data com dia = confirmada na página do lançamento. dataMes = o
     Bandcamp só mostrou mês/ano na discografia; a equipe confere o dia.
     Volumes sem data = previstos na série, ainda não achados no Bandcamp. */
  function seed(serie, vol, extra) {
    return {
      serie, vol,
      titulo: "", artistas: "", status: "planejado", formato: "EP",
      data: "", dataMes: false, responsavel: "",
      bandcamp: "", soundcloud: "", faixas: "", obs: "",
      checklist: {}, fonte: "",
      ...extra,
    };
  }
  const ALL_DONE = Object.fromEntries(CHECKLIST.map((c) => [c.id, true]));
  const SEED_LIST = [
    seed("groovy", 1, {
      titulo: "Groovy Tools Vol. 01", status: "lancado", data: "2026-01-01", dataMes: true,
      soundcloud: `${SOUNDCLOUD}/sets/groovy-tools-vol-01`, checklist: ALL_DONE,
      fonte: "Bandcamp: discografia do selo lista \"Jan 2026\" (sem dia).",
    }),
    seed("groovy", 2), seed("groovy", 3), seed("groovy", 4),

    seed("carna", 1, {
      titulo: "Carnatools Vol. 01", artistas: "Gaspar Muniz & BENO", status: "lancado",
      data: "2026-02-13", bandcamp: `${BANDCAMP}/track/kiri-gaspar-muniz-edit`, soundcloud: `${SOUNDCLOUD}/sets/carnatools-vol-1`, checklist: ALL_DONE,
      obs: "4 edits pro calor do Carnaval, entre house e disco.",
      faixas: "Kiriê (Gaspar Muniz Edit)",
      fonte: "Bandcamp: faixa Kiriê (Gaspar Muniz Edit), do Carnatools Vol. 01, released February 13, 2026.",
    }),
    seed("carna", 2), seed("carna", 3), seed("carna", 4),

    seed("jacuzzi", 1, {
      titulo: "Jacuzzi Edits (EP)", status: "lancado", data: "2025-05-09",
      faixas: "Tudo O Que Você Podia Ser (BENO & Gaspar Muniz Edit)\nDeixe O Amor Passar (Gaspar Muniz Edit)\nSpooky (BENO Edit)\nHealing Feeling (Lysia Edit)",
      bandcamp: `${BANDCAMP}/album/jacuzzi-edits-ep`, soundcloud: `${SOUNDCLOUD}/sets/jacuzzi-edits`, checklist: ALL_DONE,
      fonte: "Bandcamp: released May 9, 2025.",
    }),
    seed("jacuzzi", 2),

    seed("gangue", 1, {
      titulo: "Gangue do Sorriso", formato: "Compilação", status: "lancado", data: "2023-03-24",
      artistas: "Bernardo Pinheiro, Lipelis, Tom Noble, Golden Kong, Gaspar Muniz e outros",
      bandcamp: `${BANDCAMP}/album/gangue-do-sorriso`, checklist: ALL_DONE,
      faixas: "Bernardo Pinheiro - Elementos\nLipelis - Money Back\nÉrica Alves ft. Banana Gold - Owner of a Lonely Heart\nMangodjs & Eduardo Chermont - Simonal\nDJ FlavYa - Odara\nCamões - Senha do Ghetto\nGolden Kong & Gaspar Muniz - Vem Dançar\nTom Noble - You Can Drive\nCESRV - Becos e Vielas\nCapetini - O Último Baile",
      obs: "Primeiro lançamento do selo. 10 faixas: Miami bass, electro, house, italo e baile funk.",
      fonte: "Bandcamp: released March 24, 2023.",
    }),
    seed("gangue", 2, {
      titulo: "Gangue do Sorriso Vol. 02", formato: "Compilação", status: "lancado",
      data: "2025-06-01", dataMes: true, checklist: ALL_DONE, soundcloud: SOUNDCLOUD,
      faixas: "Lágrimas E Chuva (Gaspar Muniz Acid Tears Mix)\nQual A Ideia (Lysia Synth Mix)\nWhat Is This (Paco Cabana & Mangolab Italo Mix)",
      fonte: "Bandcamp: discografia do selo lista \"Jun 2025\" (sem dia).",
    }),
    seed("gangue", 3), seed("gangue", 4),

    seed("baile", 1, {
      titulo: "BAILE TOOLS [001]", artistas: "Gaspar Muniz & BENO", status: "lancado", data: "2024-02-10",
      bandcamp: `${BANDCAMP}/album/baile-tools-001`, checklist: ALL_DONE,
      faixas: "Rhythm of the Baile (Banana Gold Edit)\nDeixa os Garoto Brink (Banana Gold Edit)\nPump Up the Bass (Banana Gold Edit)\nCowboy Re-Volt (Banana Gold Edit)",
      fonte: "Bandcamp: released February 10, 2024.",
    }),
    seed("baile", 2, {
      titulo: "BAILE TOOLS [002]", artistas: "Gaspar Muniz & BENO", status: "lancado", data: "2025-02-28",
      bandcamp: `${BANDCAMP}/album/baile-tools-002`, checklist: ALL_DONE,
      faixas: "O Baile Ready (Banana Gold Edit)\nPlanet Baile (Banana Gold Edit)\nShort D. (Banana Gold Edit)\nEverybody Dance Now (Banana Gold Edit)",
      fonte: "Bandcamp: released February 28, 2025.",
    }),
    seed("baile", 3, {
      titulo: "BAILE TOOLS [003]", status: "lancado", data: "2026-03-10",
      bandcamp: `${BANDCAMP}/album/baile-tools-003`, soundcloud: `${SOUNDCLOUD}/sets/baile-tools-003`, checklist: ALL_DONE,
      faixas: "Parado no Bailão (Banana Gold Mix)\nRoof On Faya! (Banana Gold ft. PEBO Mix)\nVolt das Arábia (Banana Gold ft. PEBO Mix)\nDance On The Chão (Banana Gold Mix)",
      fonte: "Bandcamp: released March 10, 2026.",
    }),
    seed("baile", 4),

    seed("selector", 1), seed("selector", 2), seed("selector", 3),

    seed("tributes", 1, {
      titulo: "Roy Ayers Tribute", artistas: "Banana Gold & Coco Discos", status: "lancado", data: "2025-04-18",
      bandcamp: `${BANDCAMP}/album/roy-ayers-tribute`, soundcloud: `${SOUNDCLOUD}/sets/roy-ayers-tribute`, checklist: ALL_DONE,
      faixas: "Hey Uh What You Say Come On (Disco House Mix) — Coco Discos & Banana Gold\nLove Will Bring Us Back Together (Banana Gold House Mix)",
      obs: "Pequeno tributo à lenda do jazz-funk e do neo-soul.",
      fonte: "Bandcamp: released April 18, 2025.",
    }),
    seed("tributes", 2, { titulo: "Djavan Tribute" }),
    seed("tributes", 3, { titulo: "Jorge Ben Tribute" }),
  ];

  /* Catálogo geral (fora das séries). [slug, título, artistas, data,
     dataMes, caminho no Bandcamp]. Mesma regra: dataMes = o Bandcamp só
     mostrou mês/ano na discografia. */
  const CATALOGO = [
    ["erva-venenosa", "Erva Venenosa (Banana Gold Remix)", "Banana Gold", "2023-02-16", false, "track/erva-venenosa-banana-gold-remix"],
    ["azul", "Azul (Banana Gold Remix)", "Banana Gold", "2023-05-06", false, "track/azul-banana-gold-remix"],
    ["debaixo-do-mar", "Debaixo do Mar", "Simo Not Simon", "2023-08-25", false, "track/simo-not-simon-debaixo-do-mar"],
    ["old-new-house", "Old New House EP", "KAIR", "2023-09-29", false, "album/old-new-house-ep"],
    ["tem-q-pegar", "Tem Q Pegar (Original Mix)", "João Brasil", "2023-12-15", false, "track/tem-q-pegar-original-mix"],
    ["os-orixas", "Trio Mocotó - Os Orixás (Remix)", "Banana Gold", "2024-02-02", false, "album/trio-mocot-os-orix-s-remix"],
    ["sempre-em-movimento", "Sempre em Movimento EP", "Seed Selector", "2024-04-26", false, "album/sempre-em-movimento-ep"],
    ["vem-chegando-o-verao", "Vem Chegando O Verão (Mulú & Banana Gold Edit)", "Mulú & Banana Gold", "2024-04-30", false, "track/vem-chegando-o-ver-o-mul-banana-gold-edit"],
    ["agepe-mama", "Agepê - Mama (Nepal & Banana Gold Edit)", "Nepal, Gaspar Muniz & BENO", "2024-08-23", false, "track/agepe-mama-nepal-banana-gold-edit"],
    ["super-crema", "PR.A.DO / Super Crema (EP)", "PR.A.DO ft. Gaspar Muniz", "2024-12-18", false, "album/pr-a-do-super-crema-ep"],
    ["que-nem-mare", "Que Nem Maré (EP)", "LON & Banana Gold", "2025-01-27", false, "album/que-nem-mar-ep"],
    ["polen", "Pólen", "Banana Gold · remix Simo Not Simon", "2025-02-17", false, "album/p-len"],
    ["caso-serio", "Rita Lee - Caso Sério (KAIR & MAKZ Edit)", "KAIR & MAKZ", "2025-02-25", false, "track/rita-lee-caso-s-rio-kair-makz-edit"],
    ["barril", "Barril", "Kalebe & Mangolab", "2025-04-09", false, "album/kalebe-mangolab-barril"],
    ["flerte-revival", "Letrux - Flerte Revival (Gaspar Muniz, BENO & Banana Gold Remix)", "Gaspar Muniz & BENO", "2025-07-11", false, "album/letrux-flerte-revival-gaspar-muniz-beno-banana-gold-remix"],
    ["could-u-be-loved", "Could U Be Loved (House Mix)", "Perpettuo & BENO", "2025-08-01", true, ""],
    ["poderosa", "Poderosa", "Filipe Shock", "2025-08-08", false, "album/filipe-shock-poderosa"],
    ["crazy", "Crazy", "Caio Gomes", "2025-09-19", false, ""],
    ["raizes-cruzadas", "Raízes Cruzadas", "Kelson & BENO", "2025-09-26", false, "album/kelson-beno-ra-zes-cruzadas"],
    ["burlesco-affair", "Burlesco Affair", "T_Pazos", "2025-10-31", false, ""],
    ["tropic-soul", "Tropic Soul (incl. Beranger Remix)", "Mari Rossi", "2025-11-21", false, ""],
    ["coco-discos", "Coco Discos & Banana Gold", "Coco Discos & Banana Gold", "2026-01-31", false, "album/coco-discos-banana-gold"],
    ["ensalada-de-verano", "Ensalada de Verano (incl. remixes BENO & Pedro Botafogo)", "Mary Olivetti feat. Maria Luma", "2026-02-01", true, ""],
    ["freed-from-desire", "Freed From Desire (Gaspar Muniz, BENO & Pebo Italo Edit)", "Gaspar Muniz, BENO & Pebo", "2026-02-27", false, "album/freed-from-desire-gaspar-muniz-beno-pebo-italo-edit"],
    ["pangaea-01", "Pangaea Vol. 01", "Vários", "2026-03-20", false, "album/pangaea-vol-01"],
    ["bg001", "BG001", "BENO, PERPETTUO, KAIR & PEBO", "2026-03-27", false, "album/beno-perpettuo-kair-pebo-bg001"],
    ["ripa-na-xulipa", "Ripa na Xulipa (Bauhouse Edit)", "Bauhouse", "2026-04-01", false, "album/ripa-na-xulipa-bauhouse-edit"],
    ["alla-prima", "Alla Prima", "C4STRO", "2026-04-03", false, "album/c4stro-alla-prima"],
    ["tipsy-kings", "Tipsy Kings EP", "Ocsav", "2026-04-24", false, "track/ocsav-untz-do-tres-original-mix"],
    ["saire", "Haréton Salvanini - Sairé (BENO & Pebo Remix)", "BENO & Pebo", "2026-05-08", false, "album/hare-ton-salvanini-saire-beno-pebo-remix"],
    ["lua", "Lua", "Gui Donada", "2026-05-15", false, "album/gui-donada-lua"],
    ["not-quite-my-tempo", "Not Quite My Tempo", "VP Leone & Bernardo Campos", "2026-05-22", false, "album/vp-leone-bernardo-campos-not-quite-my-tempo"],
    ["miragem", "Miragem", "Fabio Santanna", "2026-06-05", false, "album/fabio-santanna-miragem"],
    ["bateu-onda", "Bateu Onda (álbum)", "Fabio Santanna", "2026-07-10", false, "album/fabio-santanna-bateu-onda-full-album"],
    ["3-da-tarde", "3 da Tarde (Zopelar Remix)", "BENO & Bernardo Campos", "2026-07-01", true, ""],
    ["cruel-summer", "Cruel Summer (Gazpacho Happy Summer Mix)", "Gazpacho", "2026-07-01", true, ""],
    ["count-it-off", "Count It Off", "Losciale", "2026-08-01", true, ""],
    ["eu-gosto-disso", "Eu Gosto Disso", "VP Leone", "2026-08-01", true, ""],
    ["miss-you", "Miss You", "Jeria", "2026-08-01", true, ""],
    ["feels-so-good", "Feels So Good", "DJ Atlance", "2026-09-01", true, ""],
    ["dont-u-know", "Don't U Know", "Elluzy", "2026-09-11", false, "album/elluzy-dont-u-know"],
    ["jazz-corner", "Jazz Corner (BG025)", "Milton Chuquer", "2026-09-25", false, ""],
    ["brazilian-greatest-edits-01", "Brazilian Greatest Edits Vol. 01", "Vários", "2026-09-01", true, ""],
    ["brazilian-greatest-edits-02", "Brazilian Greatest Edits Vol. 02", "Vários", "2026-10-01", true, ""],
    ["piece-of-inspiration", "Piece Of Inspiration", "Milton Chuquer", "2026-10-01", true, ""],
    ["sweet-dancer", "Sweet Dancer", "Boogietraxx", "2026-10-01", true, ""],
  ];
  const FONTE_EXTRA = {
    "crazy": "Deezer: ℗ 2025 Banana Gold Records, 19/09/2025 (Bandcamp mostra set/2025).",
    "burlesco-affair": "Deezer: lançamento em 31/10/2025 (Bandcamp mostra out/2025).",
    "tropic-soul": "Premiere do remix do Beranger anunciou 21/11 (Bandcamp mostra nov/2025) — conferir.",
    "jazz-corner": "Traxsource: BG025, 25/09/2026.",
  };
  CATALOGO.forEach(([slug, titulo, artistas, data, dataMes, path]) => {
    SEED_LIST.push(seed("catalogo", 0, {
      id: `cat-${slug}`, titulo, artistas, data, dataMes, status: "lancado", formato: "Single",
      bandcamp: path ? `${BANDCAMP}/${path}` : "", checklist: ALL_DONE,
      fonte: FONTE_EXTRA[slug] || (dataMes ? "Bandcamp: discografia do selo mostra só mês/ano." : "Bandcamp: data da página do lançamento."),
    }));
  });
  /* ── planilha da equipe: "Calendário de Lançamentos - BANANA GOLD 2026"
     (Google Sheets, aba CALENDARIO 2026). É a fonte das datas de 2026.
     [id, data, plataforma, sub label, resp. capa, notas, flags]
     id = um lançamento que já existe acima, ou "+slug|título|artistas"
     pra um que só está na planilha. flags: m = master OK, a = arte
     final, t = texto pronto. Quando a página do Bandcamp mostra outro
     dia, vale o do Bandcamp (já aconteceu) e a planilha fica na fonte. */
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1qE7TOlo3JiCqXyudmGMj1B8K-ZEnsTCD70dvbSWvLYY/edit";
  const BC = "bandcamp only", ALL = "todas as plataformas";
  const PLANILHA = [
    ["groovy-01", "2026-01-21", ALL, "Groovy Tools", "Perpettuo", "", "m"],
    ["cat-coco-discos", "2026-01-23", BC, "Coco Disco", "Perpettuo", "", "m"],
    ["cat-ensalada-de-verano", "2026-02-06", ALL, "Custom", "Perpettuo", "Contrato OK", "m"],
    ["carna-01", "2026-02-13", BC, "Carna Tools", "Perpettuo", "", "m"],
    ["cat-freed-from-desire", "2026-02-27", BC, "Custom", "Perpettuo", "", "m"],
    ["baile-03", "2026-03-10", BC, "Baile Tools", "Lysia", "", "m"],
    ["+the-simple-things|The Simple Things|Andrea Rdam", "2026-03-13", ALL, "House", "Perpettuo", "Contrato OK", "m"],
    ["cat-pangaea-01", "2026-03-20", BC, "Pangeia", "Perpettuo", "", "m"],
    ["cat-bg001", "2026-03-27", BC, "Custom", "Perpettuo", "", "m"],
    ["cat-ripa-na-xulipa", "2026-04-01", BC, "Single Edit", "Lysia", "", "m"],
    ["cat-alla-prima", "2026-04-03", ALL, "Custom", "Perpettuo", "", "m"],
    ["+the-simple-things-beno|The Simple Things (BENO Remix)|Andrea Rdam", "2026-04-10", ALL, "House", "Perpettuo", "", "m"],
    ["+malicia|Malicia / Back To The Beginning|Lon Sounds", "2026-04-15", ALL, "Coco Disco", "Lysia", "Contrato OK", "m"],
    ["jacuzzi-02", "2026-04-22", BC, "Jacuzzi Edits", "", "", "m"],
    ["cat-tipsy-kings", "2026-04-24", ALL, "Custom", "Perpettuo", "Contratos OK", "m"],
    ["+gaspar-lysia|Gaspar Muniz & Lysia|Gaspar Muniz & Lysia", "2026-05-01", BC, "Custom", "Lysia", "", "m"],
    ["cat-saire", "2026-05-08", BC, "Disco", "Perpettuo", "", "m"],
    ["cat-lua", "2026-05-15", BC, "Disco", "Lysia", "Contrato OK", "m"],
    ["cat-not-quite-my-tempo", "2026-05-22", BC, "Disco", "Perpettuo", "", "m"],
    ["+astral-livre|Astral Livre (EP)|Gui Donada", "2026-05-29", ALL, "Custom", "Lysia", "Contrato OK", "m"],
    ["cat-miragem", "2026-06-05", ALL, "Disco", "Lysia", "Contrato pendente", "m"],
    ["+keep-me-in-the-light|Keep Me In The Light|", "2026-06-12", ALL, "House", "Lysia", "Contrato OK", "m"],
    ["+pura-danca|Pura Dança|Fabio Santanna", "2026-06-19", ALL, "Disco", "Lysia", "Contrato pendente", "m"],
    ["+pigme|Pigme|", "2026-06-26", BC, "Coco Disco", "Lysia", "", "m"],
    ["+tuio-maravilha|Tuio Maravilha|", "2026-07-03", ALL, "", "Lysia", "", ""],
    ["cat-bateu-onda", "2026-07-10", ALL, "Disco", "Lysia", "Contrato pendente", "m"],
    ["cat-cruel-summer", "2026-07-17", BC, "", "Lysia", "", "m"],
    ["cat-3-da-tarde", "2026-07-24", ALL, "", "Lysia", "", "mat"],
    ["+eric-costa|Eric Costa|Eric Costa", "2026-07-31", ALL, "", "Lysia", "Contrato OK", "m"],
    ["cat-miss-you", "2026-08-07", ALL, "", "Lysia", "Contrato OK", "m"],
    ["+jeria-remixes|Remixes Francisco Jeria|Francisco Jeria", "2026-08-14", ALL, "", "Lysia", "Reagendar", ""],
    ["cat-eu-gosto-disso", "2026-08-21", BC, "", "Lysia", "Na planilha: VP Leone Edits", "m"],
    ["cat-count-it-off", "2026-08-28", ALL, "", "Lysia", "Contrato OK", "mt"],
    ["cat-feels-so-good", "2026-09-04", ALL, "", "Lysia", "Contrato OK", "m"],
    ["cat-dont-u-know", "2026-09-11", ALL, "", "Lysia", "Contrato OK", "m"],
    ["cat-brazilian-greatest-edits-01", "2026-09-18", BC, "", "Lysia", "", ""],
    ["cat-jazz-corner", "2026-09-25", ALL, "", "Lysia", "Contrato OK", "m"],
    ["cat-piece-of-inspiration", "2026-10-02", BC, "", "Lysia", "Contrato OK", ""],
    ["cat-brazilian-greatest-edits-02", "2026-10-09", BC, "", "Lysia", "", ""],
    ["cat-sweet-dancer", "2026-10-16", ALL, "", "Lysia", "Contrato OK", "m"],
    ["+beno-single|BENO (single)|BENO", "2026-10-23", ALL, "", "Lysia", "", ""],
    ["+banana-sampler|Banana Sampler|Kelson, Seed, Panko, Tuca e Cent", "2026-10-30", ALL, "", "Lysia", "", ""],
    ["+kair-makz-edit|KAIR & MAKZ Edit|KAIR & MAKZ", "2026-11-06", BC, "", "", "", ""],
    ["+d-marco|D.Marco|D.Marco", "2026-11-13", ALL, "", "", "", ""],
    ["+fabio-santanna-edits|Fabio Santanna Edits EP|Fabio Santanna", "2026-11-20", BC, "", "", "", ""],
    ["+lonsounds-pack|LONSOUNDS Pack|Lon Sounds", "2026-11-27", ALL, "", "", "", ""],
    ["+tropicals-edits|Tropicals EP Edits|Tropicals", "2026-12-04", BC, "", "", "", ""],
    ["+capetini|Capetini|Capetini", "2026-12-11", ALL, "", "", "", ""],
    ["+bryan|Bryan|Bryan", "2026-12-18", BC, "", "", "", ""],
  ];
  const SEED_BY_ID = Object.fromEntries(SEED_LIST.map((r) => [r.id || seedId(r.serie, r.vol), r]));
  PLANILHA.forEach(([ref, data, plataforma, subLabel, capa, notas, flags]) => {
    const extra = { plataforma, subLabel, capa, contrato: notas, planilha: data };
    let r = SEED_BY_ID[ref];
    if (!r) {
      // só está na planilha: entra no catálogo geral
      const [slug, titulo, artistas] = ref.slice(1).split("|");
      const futuro = data >= keyFromDate(new Date());
      r = seed("catalogo", 0, {
        id: `cat-${slug}`, titulo, artistas, formato: "Single", data,
        status: futuro ? "agendado" : "lancado",
        checklist: {
          master: flags.includes("m"),
          bandcamp: flags.includes("a") && flags.includes("m"),
          arte: flags.includes("a"),
          press: flags.includes("t"),
        },
        fonte: futuro
          ? "Planilha da equipe (calendário 2026)."
          : "Planilha da equipe (calendário 2026). Não achei no Bandcamp — confirmar se saiu.",
      });
      SEED_LIST.push(r);
      SEED_BY_ID[r.id] = r;
    } else if (r.dataMes || !r.data || r.data === data) {
      r.data = data;
      r.dataMes = false;
      r.fonte = r.data && r.fonte && !r.fonte.startsWith("Bandcamp: discografia")
        ? `${r.fonte} Confere com a planilha da equipe.`
        : "Planilha da equipe (calendário 2026).";
    } else {
      r.fonte = `${r.fonte} Na planilha estava ${formatBr(data)}.`;
    }
    if (ref === "jacuzzi-02") {
      r.titulo = r.titulo || "Jacuzzi Edits Vol. 02";
      r.status = "lancado";
      r.fonte = "Planilha da equipe: 22/04/2026, bandcamp only. Não achei no Bandcamp — confirmar se saiu.";
    }
    Object.assign(r, extra);
  });
  const SEED_RELEASES = Object.fromEntries(SEED_LIST.map(({ id, ...r }) => [id || seedId(r.serie, r.vol), r]));

  function seedId(serie, vol) { return `${serie}-${pad2(vol)}`; }

  /* ── state ─────────────────────────────────────────────── */
  const today = new Date();
  const todayKey = keyFromDate(today);
  let view = { year: today.getFullYear(), month: today.getMonth() + 1 };
  /* tracks = faixas e demos. Uma faixa com releaseId está no set list
     daquele lançamento; sem releaseId é uma demo na fila. */
  const COLS = ["releases", "events", "tracks"];
  const emptyCols = () => ({ releases: {}, events: {}, tracks: {} });
  let stored = emptyCols();   // o que está na nuvem/aparelho
  let pending = emptyCols();  // gravado sem nuvem, a subir
  let releases = {};          // efetivo = base + stored
  let tracks = {};            // efetivo = faixas da base + stored
  let activeReleaseId = null;
  let activeDayKey = null;
  let activeTaskId = null;

  function rebuildReleases() {
    const next = {};
    Object.entries(SEED_RELEASES).forEach(([id, r]) => { next[id] = { ...r }; });
    Object.entries(stored.releases).forEach(([id, r]) => {
      if (!r || r.deleted) delete next[id];
      else next[id] = { ...(next[id] || {}), ...r };
    });
    releases = next;
    rebuildTracks();
  }

  /* As faixas da base saem do campo `faixas` de cada lançamento, com id
     fixo (lançamento--posição), então editar/mover vira um doc por cima. */
  /* WAVs da pasta "MUSICAS BANANA" no Google Drive (id do arquivo).
     Precisam estar compartilhados como "Qualquer pessoa com o link". */
  const SEED_DEMO_AUDIO = {
    "Marcos Tocae Edit": ["1d36JPOrsiFPmV2uZb9KpYuawggcjEiI3", "MARCOS TOCAE - MANDELAR v2.wav", 60939544],
    "Ítalo Airplane": ["1cgMouUc0gXicPmoczE3-8zOvLHW7XYkA", "italo airplane.mp3", 10374791],
  };
  // arquivos que saíram do Drive: um link salvo pra eles cede lugar ao novo
  const RETIRED_DRIVE_IDS = ["1CPBRLgUvZ0bMQwXHpNrbbIsfkEKKdKlP", "1INxU8b6Obx_pE05K4FY7RFv0rAUnm9HB"];
  function driveAudio([fid, nome, tamanho]) {
    return { url: `https://drive.google.com/uc?export=download&id=${fid}`, link: `https://drive.google.com/file/d/${fid}/view`, nome, tamanho, origem: "drive", seed: true };
  }

  const SEED_DEMOS = [
    "Velejo", "Bounce Like That", "1234", "Demo BIBI", "Lizzie", "Joca Remix", "Dádiva",
    "Marcos Tocae Edit", "Ítalo Airplane", "Track Alemães", "Tracey Girl", "Olhos Coloridos", "Track Gush e Joana",
  ];

  function rebuildTracks() {
    const next = {};
    Object.entries(releases).forEach(([rid, r]) => {
      String(r.faixas || "").split("\n").map((t) => t.trim()).filter(Boolean).forEach((titulo, i) => {
        next[`${rid}--${i + 1}`] = { titulo, artista: "", releaseId: rid, ordem: i + 1, link: "", obs: "", base: true };
      });
    });
    // demos que a equipe passou pra começar a fila (ordem da lista)
    SEED_DEMOS.forEach((titulo, i) => {
      const slug = titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      next[`demo-${slug}`] = { titulo, artista: "", releaseId: "", ordem: 0, link: "", obs: "", criado: `2026-10-27T00:00:${String(i).padStart(2, "0")}Z`, base: true };
      if (SEED_DEMO_AUDIO[titulo]) next[`demo-${slug}`].audio = driveAudio(SEED_DEMO_AUDIO[titulo]);
    });
    Object.entries(stored.tracks).forEach(([id, t]) => {
      if (!t || t.deleted) delete next[id];
      else {
        const base = next[id];
        next[id] = { ...(base || {}), ...t };
        // áudio do Drive vale mais que um "só neste aparelho" ou que nada
        const stale = t.audio && (t.audio.local || t.audio.seed || RETIRED_DRIVE_IDS.some((fid) => (t.audio.url || "").includes(fid)));
        if (base && base.audio && (!t.audio || stale)) next[id].audio = base.audio;
      }
    });
    tracks = next;
  }

  /* ── armazenamento: nuvem com reserva no aparelho ───────── */
  let db, cols = {}, doc, onSnapshot, writeBatch;
  let fbApp = null, fbUser = null;
  let cloudReady = false;
  let warnedLocal = false;

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      if (!raw) return;
      stored = { ...emptyCols(), ...(raw.stored || {}) };
      pending = { ...emptyCols(), ...(raw.pending || {}) };
    } catch (err) {}
  }

  function saveLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ stored, pending }));
    } catch (err) {}
  }

  function hasPending() {
    return COLS.some((c) => Object.keys(pending[c]).length);
  }

  /* changes: { releases?: {id: doc|null}, events?: {id: doc|null} } —
     null apaga. Na nuvem vai num writeBatch só. */
  async function write(changes) {
    if (cloudReady) {
      const batch = writeBatch(db);
      Object.entries(changes).forEach(([col, items]) => {
        Object.entries(items).forEach(([id, entry]) => {
          if (entry) batch.set(doc(cols[col], id), entry);
          else batch.delete(doc(cols[col], id));
        });
      });
      await batch.commit();
      return "cloud";
    }
    Object.entries(changes).forEach(([col, items]) => {
      Object.entries(items).forEach(([id, entry]) => {
        if (entry) stored[col][id] = entry;
        else delete stored[col][id];
        pending[col][id] = entry;
      });
    });
    saveLocal();
    renderAll();
    if (!warnedLocal) {
      warnedLocal = true;
      showToast("Salvo neste aparelho — sobe pra nuvem quando a conexão voltar.");
      return "local-warned";
    }
    return "local";
  }

  async function flushPending() {
    if (!hasPending()) return;
    const batch = writeBatch(db);
    Object.entries(pending).forEach(([col, items]) => {
      Object.entries(items).forEach(([id, entry]) => {
        if (entry) batch.set(doc(cols[col], id), entry);
        else batch.delete(doc(cols[col], id));
      });
    });
    try {
      await batch.commit();
      const n = COLS.reduce((sum, c) => sum + Object.keys(pending[c]).length, 0);
      pending = emptyCols();
      saveLocal();
      showToast(`${n} alteração(ões) feitas offline enviadas pra nuvem.`);
    } catch (err) {
      console.error(err);
    }
  }

  function goLocal(reason) {
    cloudReady = false;
    if (reason) console.warn("Banana Gold em modo local:", reason);
    if (!warnedLocal) {
      warnedLocal = true;
      showToast("Sem nuvem agora — tudo segue salvo neste aparelho.");
    }
  }

  function startSync() {
    let firstSnaps = 0;
    COLS.forEach((col) => {
      let first = true;
      onSnapshot(cols[col], (snap) => {
        const next = {};
        snap.forEach((d) => { next[d.id] = d.data(); });
        // as alterações offline ainda não estão no snapshot
        Object.entries(pending[col]).forEach(([id, entry]) => {
          if (entry) next[id] = entry;
          else delete next[id];
        });
        stored[col] = next;
        if (first) {
          first = false;
          if (++firstSnaps === COLS.length) {
            cloudReady = true;
            flushPending();
          }
        }
        saveLocal();
        renderAll();
      }, (err) => {
        console.error(err);
        goLocal(err && err.code);
      });
    });
  }

  async function connectFirebase() {
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"),
      ]);
      doc = fsMod.doc;
      onSnapshot = fsMod.onSnapshot;
      writeBatch = fsMod.writeBatch;

      fbApp = appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(fbApp);
      db = fsMod.getFirestore(fbApp);
      cols = {
        releases: fsMod.collection(db, "bg_releases"),
        events: fsMod.collection(db, "bg_events"),
        tracks: fsMod.collection(db, "bg_tracks"),
      };

      authMod.signInAnonymously(auth).catch((err) => goLocal(err && err.code));
      let started = false;
      authMod.onAuthStateChanged(auth, (user) => {
        fbUser = user;
        if (user && !started) {
          started = true;
          startSync();
        }
      });
    } catch (err) {
      goLocal("Firebase indisponível");
    }
  }

  /* ── helpers ───────────────────────────────────────────── */
  function pad2(n) { return String(n).padStart(2, "0"); }
  function dateKey(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }
  function keyFromDate(dt) { return dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
  function dateFromKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function addDaysKey(key, delta) {
    const dt = dateFromKey(key);
    dt.setDate(dt.getDate() + delta);
    return keyFromDate(dt);
  }
  function daysBetween(fromKey, toKey) {
    return Math.round((dateFromKey(toKey) - dateFromKey(fromKey)) / 86400000);
  }
  function formatBr(key) {
    const [y, m, d] = key.split("-");
    return `${d}/${m}/${y}`;
  }
  function formatRelease(r) {
    if (!r.data) return "sem data";
    const [y, m] = r.data.split("-").map(Number);
    if (r.dataMes) return `${MONTH_NAMES[m - 1].slice(0, 3)}/${y} · dia a confirmar`;
    return `${formatBr(r.data)} (${WEEKDAY_NAMES[dateFromKey(r.data).getDay()]})`;
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function releaseLabel(r) {
    if (isGeral(r)) return r.titulo || "lançamento";
    const s = SERIES_BY_ID[r.serie];
    return `${s ? s.nome : r.serie} Vol. ${pad2(r.vol)}`;
  }
  function newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
  function checklistDone(r) {
    return CHECKLIST.filter((c) => r.checklist && r.checklist[c.id]).length;
  }
  function seriesColor(serie) {
    return (SERIES_BY_ID[serie] || {}).cor || "#ffffff";
  }

  /* ── feriados nacionais + Rio ──────────────────────────── */
  function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return dateKey(year, month, day);
  }
  const holidayCache = {};
  function holidaysForYear(year) {
    if (holidayCache[year]) return holidayCache[year];
    const easter = easterSunday(year);
    const map = {
      [dateKey(year, 1, 1)]: "Ano Novo",
      [dateKey(year, 1, 20)]: "São Sebastião",
      [dateKey(year, 4, 21)]: "Tiradentes",
      [dateKey(year, 4, 23)]: "São Jorge",
      [dateKey(year, 5, 1)]: "Dia do Trabalho",
      [dateKey(year, 9, 7)]: "Independência",
      [dateKey(year, 10, 12)]: "Nossa Sra. Aparecida",
      [dateKey(year, 11, 2)]: "Finados",
      [dateKey(year, 11, 15)]: "República",
      [dateKey(year, 11, 20)]: "Consciência Negra",
      [dateKey(year, 12, 25)]: "Natal",
      [addDaysKey(easter, -48)]: "Carnaval",
      [addDaysKey(easter, -47)]: "Carnaval",
      [addDaysKey(easter, -2)]: "Sexta-feira Santa",
      [addDaysKey(easter, 60)]: "Corpus Christi",
    };
    holidayCache[year] = map;
    return map;
  }
  function getHoliday(key) { return holidaysForYear(Number(key.slice(0, 4)))[key]; }

  /* ── consultas ─────────────────────────────────────────── */
  function releasesOnDay(key) {
    return Object.entries(releases).filter(([, r]) => r.data === key && !r.dataMes);
  }
  function releasesLooseInMonth(y, m) {
    const prefix = `${y}-${pad2(m)}`;
    return Object.entries(releases).filter(([, r]) => r.dataMes && r.data && r.data.startsWith(prefix));
  }
  function eventsOnDay(key) {
    return Object.entries(stored.events).filter(([, e]) => e && e.data === key);
  }
  function seriesReleases(serie) {
    return Object.entries(releases).filter(([, r]) => r.serie === serie).sort((a, b) => a[1].vol - b[1].vol);
  }
  function people() {
    const set = new Set();
    Object.values(releases).forEach((r) => {
      if (r.responsavel) set.add(r.responsavel.trim());
      if (r.capa) set.add(r.capa.trim());
    });
    Object.values(stored.events).forEach((e) => e && e.responsavel && set.add(e.responsavel.trim()));
    Object.values(tracks).forEach((t) => t.artista && !t.releaseId && set.add(t.artista.trim()));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  /* ── render: séries ────────────────────────────────────── */
  const seriesListEl = document.getElementById("series-list");
  const OPEN_KEY = "bg_open_series_v1";
  let openSeries = new Set();
  try { openSeries = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch (err) {}
  function saveOpenSeries() {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openSeries])); } catch (err) {}
  }

  function renderSeries() {
    const allOpen = SERIES.every((s) => openSeries.has(s.id));
    seriesListEl.innerHTML = `
      <div class="series-tools">
        <button class="link-btn" type="button" data-toggle-all>${allOpen ? "Recolher tudo" : "Abrir tudo"}</button>
      </div>` + SERIES.map((s) => {
      const list = seriesReleases(s.id);
      return s.geral ? catalogSection(s, list) : seriesSection(s, list);
    }).join("");
  }

  function lastAndNext(list) {
    const dated = list.filter(([, r]) => r.data).sort((a, b) => a[1].data.localeCompare(b[1].data));
    const last = dated.filter(([, r]) => r.status === "lancado").pop();
    const next = dated.find(([, r]) => r.status !== "lancado");
    return { last: last && last[1], next: next && next[1] };
  }

  function shortDate(r) {
    return r.dataMes ? formatRelease(r).split(" · ")[0] : formatBr(r.data);
  }

  /* Barra da série: fechada mostra o resumo (um quadradinho por volume,
     cheio = lançado), aberta mostra os cartões. */
  function seriesBar(s, list, summary, dots, addLabel) {
    const open = openSeries.has(s.id);
    return `
      <div class="series-bar" data-toggle-serie="${s.id}" role="button" tabindex="0" aria-expanded="${open}">
        <span class="chevron" aria-hidden="true">${open ? "▾" : "▸"}</span>
        <span class="bar-main">
          <span class="bar-title">${esc(s.nome)}</span>
          <span class="bar-summary">${summary}</span>
        </span>
        ${dots}
        <button class="btn btn-small btn-dark bar-add" type="button" data-add-vol="${s.id}">${addLabel}</button>
      </div>`;
  }

  function seriesSection(s, list) {
    const lancados = list.filter(([, r]) => r.status === "lancado").length;
    const { last, next } = lastAndNext(list);
    const summary = [
      `${lancados}/${list.length} lançados`,
      last && `último: ${esc(last.titulo || releaseLabel(last))} · ${esc(shortDate(last))}`,
      next && `próximo: Vol. ${pad2(next.vol)} · ${esc(shortDate(next))}`,
    ].filter(Boolean).join(" — ");
    const dots = `<span class="vol-dots">${list.map(([id, r]) =>
      `<button class="vol-dot dot-${r.status}" type="button" data-release="${esc(id)}" title="${esc(`Vol. ${pad2(r.vol)} · ${STATUS_NAME[r.status]}${r.data ? ` · ${shortDate(r)}` : ""}`)}">${pad2(r.vol)}</button>`).join("")}</span>`;
    return `
      <section class="series${openSeries.has(s.id) ? " is-open" : ""}" style="--serie:${s.cor}">
        ${seriesBar(s, list, summary, dots, "+ Vol.")}
        ${openSeries.has(s.id) ? `<div class="vol-row">
          ${list.map(([id, r]) => volCard(id, r)).join("") || `<p class="empty">Nenhum volume ainda.</p>`}
        </div>` : ""}
      </section>`;
  }

  function catalogSection(s, list) {
    const rows = list.slice().sort((a, b) => (b[1].data || "").localeCompare(a[1].data || ""));
    const { last } = lastAndNext(list);
    const summary = s.id === "projetos"
      ? `${list.length} projeto${list.length === 1 ? "" : "s"} — ${list.filter(([, r]) => r.status !== "lancado").length} em andamento`
      : [`${list.length} lançamentos`, last && `último: ${esc(last.titulo)} · ${esc(shortDate(last))}`].filter(Boolean).join(" — ");
    return `
      <section class="series series-geral${openSeries.has(s.id) ? " is-open" : ""}" style="--serie:${s.cor}">
        ${seriesBar(s, list, summary, "", "+ Novo")}
        ${openSeries.has(s.id) ? `<div class="cat-list">
          ${rows.map(([id, r]) => `
            <button class="cat-row" type="button" data-release="${esc(id)}">
              <span class="cat-date${r.dataMes ? " is-approx" : ""}">${r.data ? esc(shortDate(r)) : "sem data"}</span>
              <span class="cat-main"><b>${esc(r.titulo || "título a definir")}</b><span>${esc([r.artistas, r.subLabel, r.plataforma === BC ? "bandcamp only" : ""].filter(Boolean).join(" · "))}</span></span>
              <span class="chip chip-${r.status}">${STATUS_NAME[r.status] || r.status}</span>
            </button>`).join("") || `<p class="empty">Nada ainda.</p>`}
        </div>` : ""}
      </section>`;
  }

  function volCard(id, r) {
    const done = checklistDone(r);
    return `
      <button class="vol-card status-${r.status}" type="button" data-release="${esc(id)}">
        <span class="vol-num">VOL. ${pad2(r.vol)}</span>
        <span class="vol-title">${esc(r.titulo || "título a definir")}</span>
        <span class="vol-date${r.dataMes ? " is-approx" : ""}">${esc(formatRelease(r))}</span>
        <span class="vol-foot">
          <span class="chip chip-${r.status}">${STATUS_NAME[r.status] || r.status}</span>
          ${r.bandcamp ? `<span class="mini" title="Tem link do Bandcamp">bc</span>` : ""}
        </span>
        <span class="progress" title="Checklist ${done}/${CHECKLIST.length}"><i style="width:${(done / CHECKLIST.length) * 100}%"></i></span>
      </button>`;
  }

  function toggleSerie(id) {
    if (openSeries.has(id)) openSeries.delete(id);
    else openSeries.add(id);
    saveOpenSeries();
    renderSeries();
  }

  seriesListEl.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-vol]");
    if (add) return openNewRelease(add.dataset.addVol);
    const card = e.target.closest("[data-release]");
    if (card) return openRelease(card.dataset.release);
    if (e.target.closest("[data-toggle-all]")) {
      const allOpen = SERIES.every((s) => openSeries.has(s.id));
      openSeries = new Set(allOpen ? [] : SERIES.map((s) => s.id));
      saveOpenSeries();
      return renderSeries();
    }
    const bar = e.target.closest("[data-toggle-serie]");
    if (bar) toggleSerie(bar.dataset.toggleSerie);
  });
  seriesListEl.addEventListener("keydown", (e) => {
    const bar = e.target.closest && e.target.matches("[data-toggle-serie]") && e.target;
    if (bar && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      toggleSerie(bar.dataset.toggleSerie);
    }
  });

  /* ── render: calendário ────────────────────────────────── */
  const calGrid = document.getElementById("cal-grid");
  const monthLabel = document.getElementById("month-label");
  const monthLoose = document.getElementById("month-loose");

  function renderCalendar() {
    const { year, month } = view;
    monthLabel.textContent = `${MONTH_NAMES[month - 1]} ${year}`;

    const loose = releasesLooseInMonth(year, month);
    monthLoose.hidden = !loose.length;
    monthLoose.innerHTML = loose.length
      ? `<span class="loose-label">Neste mês, dia a confirmar:</span>` +
        loose.map(([id, r]) => `<button class="pill" type="button" data-release="${esc(id)}" style="--serie:${seriesColor(r.serie)}">${esc(releaseLabel(r))}</button>`).join("")
      : "";

    const first = new Date(year, month - 1, 1).getDay();
    const days = new Date(year, month, 0).getDate();
    let html = "";
    for (let i = 0; i < first; i++) html += `<div class="cal-cell is-blank"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = dateKey(year, month, d);
      const wd = (first + d - 1) % 7;
      const holiday = getHoliday(key);
      const rel = releasesOnDay(key);
      const evs = eventsOnDay(key).sort((a, b) => (a[1].feito ? 1 : 0) - (b[1].feito ? 1 : 0));
      const cls = ["cal-cell"];
      if (wd === 5) cls.push("is-friday");
      if (holiday) cls.push("is-holiday");
      if (key === todayKey) cls.push("is-today");
      if (rel.length) cls.push("has-release");
      const items = [
        ...rel.map(([, r]) => `<span class="ev ev-release${isGeral(r) ? " ev-geral" : ""}" style="--serie:${seriesColor(r.serie)}">${esc(isGeral(r) ? r.titulo : `${SERIES_BY_ID[r.serie] ? SERIES_BY_ID[r.serie].sigla : ""} ${pad2(r.vol)}`)}</span>`),
        ...evs.slice(0, 3).map(([, e]) => `<span class="ev ev-task${e.feito ? " is-done" : ""}">${esc(e.titulo)}</span>`),
      ];
      if (evs.length > 3) items.push(`<span class="ev ev-more">+${evs.length - 3}</span>`);
      html += `
        <button class="${cls.join(" ")}" type="button" data-day="${key}">
          <span class="cal-num">${d}</span>
          ${holiday ? `<span class="cal-holiday">${esc(holiday)}</span>` : ""}
          <span class="cal-items">${items.join("")}</span>
        </button>`;
    }
    calGrid.innerHTML = html;
  }

  calGrid.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-day]");
    if (cell) openDay(cell.dataset.day);
  });
  monthLoose.addEventListener("click", (e) => {
    const pill = e.target.closest("[data-release]");
    if (pill) openRelease(pill.dataset.release);
  });

  function shiftMonth(delta) {
    let { year, month } = view;
    month += delta;
    if (month < 1) { month = 12; year--; }
    if (month > 12) { month = 1; year++; }
    view = { year, month };
    renderCalendar();
  }
  document.getElementById("prev-month").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("next-month").addEventListener("click", () => shiftMonth(1));
  document.getElementById("today-btn").addEventListener("click", () => {
    view = { year: today.getFullYear(), month: today.getMonth() + 1 };
    renderCalendar();
  });

  let touchX = 0, touchY = 0;
  calGrid.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
  calGrid.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ── tarefas (lista do painel do dia) ──────────────────── */
  function countdown(key) {
    const n = daysBetween(todayKey, key);
    if (n === 0) return "hoje";
    if (n === 1) return "amanhã";
    if (n > 0) return `em ${n} dias`;
    return `${-n} dias atrás`;
  }

  function taskRow(id, e) {
    const r = e.releaseId && releases[e.releaseId];
    const late = !e.feito && e.data && e.data < todayKey;
    return `
      <div class="row task-row${e.feito ? " is-done" : ""}" style="--serie:${r ? seriesColor(r.serie) : "#000"}">
        <input type="checkbox" class="task-check" data-toggle-task="${esc(id)}" ${e.feito ? "checked" : ""} aria-label="Feito" />
        <button class="row-main" type="button" data-task="${esc(id)}">
          <b>${esc(e.titulo)}</b>
          <span>${esc(TASK_TYPE_NAME[e.tipo] || "Outro")}${r ? ` · ${esc(releaseLabel(r))}` : ""}${e.responsavel ? ` · ${esc(e.responsavel)}` : ""}</span>
        </button>
        <span class="row-side"><span class="${late ? "late" : ""}">${e.data ? `${formatBr(e.data)} · ${countdown(e.data)}` : ""}</span></span>
      </div>`;
  }

  async function toggleTask(id, feito) {
    const e = stored.events[id];
    if (!e) return;
    try {
      await write({ events: { [id]: { ...e, feito } } });
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  }

  function onListClick(e) {
    const rel = e.target.closest("[data-release]");
    if (rel) return openRelease(rel.dataset.release);
    const task = e.target.closest("[data-task]");
    if (task) {
      const ev = stored.events[task.dataset.task];
      if (ev) openDay(ev.data || todayKey, task.dataset.task);
    }
  }
  function onListChange(e) {
    const box = e.target.closest("[data-toggle-task]");
    if (box) toggleTask(box.dataset.toggleTask, box.checked);
  }
  [document.getElementById("day-items")].forEach((el) => {
    el.addEventListener("click", onListClick);
    el.addEventListener("change", onListChange);
  });

  /* Cada parte desenha sozinha: se uma quebrar, as outras aparecem e o
     erro vira um aviso na tela em vez de página em branco. */
  function safe(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error(name, err);
      showToast(`Erro ao montar ${name}. Fecha e abre o app de novo.`);
    }
  }

  function renderAll() {
    safe("os dados", rebuildReleases);
    safe("as séries", renderSeries);
    safe("o calendário", renderCalendar);
    safe("as demos", renderDemos);
    safe("a lista de pessoas", () => {
      document.getElementById("people").innerHTML = people().map((p) => `<option value="${esc(p)}"></option>`).join("");
    });
    if (!dayPanel.hidden && activeDayKey) safe("o dia", renderDayItems);
    if (!releasePanel.hidden && activeReleaseId) safe("o set list", renderSetlist);
  }

  /* ── abas ──────────────────────────────────────────────── */
  const tabs = document.querySelectorAll(".tab");
  function setTab(name) {
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    ["catalogo", "calendario", "demos"].forEach((v) => {
      document.getElementById(`view-${v}`).hidden = v !== name;
    });
    try { localStorage.setItem(TAB_KEY, name); } catch (err) {}
  }
  tabs.forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));

  /* ── painéis ───────────────────────────────────────────── */
  const backdrop = document.getElementById("backdrop");
  const releasePanel = document.getElementById("release-panel");
  const dayPanel = document.getElementById("day-panel");

  function openPanel(panel) {
    [releasePanel, dayPanel].forEach((p) => { p.hidden = p !== panel; });
    backdrop.hidden = false;
    panel.querySelector(".panel-body").scrollTop = 0;
  }
  function closePanels() {
    releasePanel.hidden = true;
    dayPanel.hidden = true;
    backdrop.hidden = true;
    activeReleaseId = null;
    activeDayKey = null;
    activeTaskId = null;
  }
  backdrop.addEventListener("click", closePanels);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePanels));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

  /* ── editor de lançamento ──────────────────────────────── */
  const rSerie = document.getElementById("r-serie");
  const rVol = document.getElementById("r-vol");
  const rTitulo = document.getElementById("r-titulo");
  const rArtistas = document.getElementById("r-artistas");
  const rStatus = document.getElementById("r-status");
  const rFormato = document.getElementById("r-formato");
  const rPlataforma = document.getElementById("r-plataforma");
  const rSubLabel = document.getElementById("r-sublabel");
  const rCapa = document.getElementById("r-capa");
  const rContrato = document.getElementById("r-contrato");
  const rData = document.getElementById("r-data");
  const rMes = document.getElementById("r-mes");
  const rResp = document.getElementById("r-resp");
  const rBandcamp = document.getElementById("r-bandcamp");
  const rSoundcloud = document.getElementById("r-soundcloud");
  const rObs = document.getElementById("r-obs");
  const rChecklist = document.getElementById("r-checklist");
  const rSource = document.getElementById("r-source");
  const rDelete = document.getElementById("r-delete");
  const rDetails = document.getElementById("r-details");

  rSerie.innerHTML = SERIES.map((s) => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  rStatus.innerHTML = STATUS.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("");
  rChecklist.innerHTML = CHECKLIST.map((c) => `<label class="check"><input type="checkbox" data-check="${c.id}" /> ${esc(c.nome)}</label>`).join("");

  function syncVolField() {
    rVol.closest(".field").hidden = !!(SERIES_BY_ID[rSerie.value] || {}).geral;
  }
  rSerie.addEventListener("change", syncVolField);

  function fillRelease(r) {
    rSerie.value = r.serie;
    rVol.value = r.vol;
    syncVolField();
    rTitulo.value = r.titulo || "";
    rArtistas.value = r.artistas || "";
    rStatus.value = r.status || "planejado";
    rFormato.value = r.formato || "EP";
    rPlataforma.value = r.plataforma || "";
    rSubLabel.value = r.subLabel || "";
    rCapa.value = r.capa || "";
    rContrato.value = r.contrato || "";
    rData.value = r.data || "";
    rMes.checked = !!r.dataMes;
    rResp.value = r.responsavel || "";
    rBandcamp.value = r.bandcamp || "";
    rSoundcloud.value = r.soundcloud || "";
    rObs.value = r.obs || "";
    rChecklist.querySelectorAll("[data-check]").forEach((box) => { box.checked = !!(r.checklist && r.checklist[box.dataset.check]); });
    const links = [r.bandcamp && `<a href="${esc(r.bandcamp)}" target="_blank" rel="noopener">abrir no Bandcamp ↗</a>`, r.soundcloud && `<a href="${esc(r.soundcloud)}" target="_blank" rel="noopener">abrir no SoundCloud ↗</a>`].filter(Boolean).join(" · ");
    rSource.innerHTML = [r.fonte && esc(r.fonte), links].filter(Boolean).join("<br>");
    document.getElementById("release-title").textContent = releaseLabel(r);
    document.getElementById("release-sub").textContent = formatRelease(r);
  }

  function openRelease(id) {
    const r = releases[id];
    if (!r) return;
    activeReleaseId = id;
    fillRelease(r);
    rDelete.hidden = false;
    rDetails.open = false;
    rDetails.hidden = true;
    renderSetlist();
    openPanel(releasePanel);
  }

  function openNewRelease(serie, dataKey) {
    const vols = seriesReleases(serie).map(([, r]) => r.vol);
    const vol = vols.length ? Math.max(...vols) + 1 : 1;
    activeReleaseId = null;
    fillRelease(seed(serie, vol, { data: dataKey || "", status: dataKey ? "agendado" : "planejado" }));
    rDelete.hidden = true;
    rDetails.open = true;
    rDetails.hidden = false;
    renderSetlist();
    openPanel(releasePanel);
    rTitulo.focus();
  }

  function readRelease() {
    const checklist = {};
    rChecklist.querySelectorAll("[data-check]").forEach((box) => { if (box.checked) checklist[box.dataset.check] = true; });
    const base = activeReleaseId ? releases[activeReleaseId] : {};
    return {
      ...base,
      serie: rSerie.value,
      vol: Math.max(1, parseInt(rVol.value, 10) || 1),
      titulo: rTitulo.value.trim(),
      artistas: rArtistas.value.trim(),
      status: rStatus.value,
      formato: rFormato.value,
      plataforma: rPlataforma.value,
      subLabel: rSubLabel.value.trim(),
      capa: rCapa.value.trim(),
      contrato: rContrato.value.trim(),
      data: rData.value,
      dataMes: rMes.checked && !!rData.value,
      responsavel: rResp.value.trim(),
      bandcamp: rBandcamp.value.trim(),
      soundcloud: rSoundcloud.value.trim(),
      obs: rObs.value.trim(),
      checklist,
      fonte: base.fonte || "",
    };
  }

  function idForNew(r) {
    if (isGeral(r)) return newId("cat");
    const id = seedId(r.serie, r.vol);
    return releases[id] || stored.releases[id] ? newId(r.serie) : id;
  }

  async function saveRelease() {
    const r = readRelease();
    const clash = !isGeral(r) && Object.entries(releases).find(([id, o]) => id !== activeReleaseId && o.serie === r.serie && o.vol === r.vol);
    if (clash && !confirm(`Já existe ${releaseLabel(r)}. Salvar mesmo assim?`)) return null;
    const id = activeReleaseId || idForNew(r);
    try {
      const mode = await write({ releases: { [id]: r } });
      activeReleaseId = id;
      rDelete.hidden = false;
      renderSetlist();
      if (mode !== "local-warned") showToast(`${releaseLabel(r)} salvo.`);
      return id;
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
      return null;
    }
  }

  document.getElementById("r-save").addEventListener("click", async () => {
    if (await saveRelease()) closePanels();
  });

  rDelete.addEventListener("click", async () => {
    if (!activeReleaseId) return;
    const r = releases[activeReleaseId];
    if (!confirm(`Apagar ${releaseLabel(r)}? As tarefas ligadas a ele ficam no calendário.`)) return;
    const id = activeReleaseId;
    try {
      await write({ releases: { [id]: SEED_RELEASES[id] ? { deleted: true } : null } });
      showToast("Volume apagado.");
      closePanels();
    } catch (err) {
      console.error(err);
      showToast("Não deu pra apagar. Tenta de novo.");
    }
  });

  document.getElementById("r-plan").addEventListener("click", async () => {
    const r = readRelease();
    if (!r.data || r.dataMes) {
      showToast("Põe o dia exato do lançamento antes de gerar o cronograma.");
      return;
    }
    const id = await saveRelease();
    if (!id) return;
    const events = {};
    PLAN_STEPS.forEach((step) => {
      const evId = `${id}__${step.id}`;
      const prev = stored.events[evId];
      events[evId] = {
        titulo: `${step.titulo} — ${releaseLabel(r)}`,
        tipo: step.tipo,
        data: addDaysKey(r.data, step.dias),
        responsavel: (prev && prev.responsavel) || r.responsavel,
        releaseId: id,
        feito: !!(prev && prev.feito),
        obs: (prev && prev.obs) || "",
      };
    });
    try {
      await write({ events });
      showToast(`Cronograma criado: ${PLAN_STEPS.length} tarefas no calendário.`);
    } catch (err) {
      console.error(err);
      showToast("Não deu pra criar o cronograma. Tenta de novo.");
    }
  });

  /* ── faixas: set list dos projetos e fila de demos ──────── */
  const slList = document.getElementById("r-setlist");
  const slAddRow = document.getElementById("r-setlist-add");
  const slNew = document.getElementById("sl-new");
  const slPull = document.getElementById("sl-pull");
  const slHint = document.getElementById("sl-hint");

  function setlistOf(rid) {
    return Object.entries(tracks)
      .filter(([, t]) => t.releaseId === rid)
      .sort((a, b) => (a[1].ordem || 0) - (b[1].ordem || 0));
  }
  function demoQueue() {
    return Object.entries(tracks)
      .filter(([, t]) => !t.releaseId)
      .sort((a, b) => (a[1].criado || "").localeCompare(b[1].criado || ""));
  }
  function nextOrdem(rid) {
    return setlistOf(rid).reduce((m, [, t]) => Math.max(m, t.ordem || 0), 0) + 1;
  }
  function trackDoc(id, patch) {
    const { base, ...t } = { ...tracks[id], ...patch };
    return t;
  }
  async function writeTracks(changes, okMsg) {
    try {
      const mode = await write({ tracks: changes });
      if (okMsg && mode !== "local-warned") showToast(okMsg);
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  }
  function moveTrack(id, rid) {
    if (!tracks[id]) return;
    const msg = rid ? `Mandada pra ${releaseLabel(releases[rid])}.` : "Voltou pra fila de demos.";
    return writeTracks({ [id]: trackDoc(id, { releaseId: rid || "", ordem: rid ? nextOrdem(rid) : 0 }) }, msg);
  }
  function deleteTrack(id) {
    if (tracks[id] && tracks[id].audio) removeAudioFile(id, tracks[id].audio);
    return writeTracks({ [id]: tracks[id] && tracks[id].base ? { deleted: true } : null }, "Faixa apagada.");
  }

  /* Projetos que ainda podem receber música: tudo que não saiu, séries
     primeiro (na ordem da aba), depois o catálogo por data. */
  function targetReleases() {
    const order = Object.fromEntries(SERIES.map((s, i) => [s.id, i]));
    return Object.entries(releases)
      .filter(([, r]) => r.status !== "lancado")
      .sort((a, b) => (order[a[1].serie] - order[b[1].serie]) ||
        (isGeral(a[1]) ? (a[1].data || "9").localeCompare(b[1].data || "9") : a[1].vol - b[1].vol));
  }
  function targetOptions() {
    const groups = {};
    targetReleases().forEach(([id, r]) => { (groups[r.serie] = groups[r.serie] || []).push([id, r]); });
    // projetos novos primeiro: são os que a equipe acabou de criar
    const ordem = [SERIES_BY_ID.projetos, ...SERIES.filter((s) => s.id !== "projetos")];
    return `<option value="__new">+ Criar projeto novo…</option>` + ordem.filter((s) => groups[s.id]).map((s) =>
      `<optgroup label="${esc(s.nome)}">${groups[s.id].map(([id, r]) =>
        `<option value="${esc(id)}">${esc(s.geral ? `${r.titulo || "sem nome"}${r.formato ? ` (${r.formato})` : ""}` : `Vol. ${pad2(r.vol)}${r.titulo ? ` — ${r.titulo}` : ""}`)}</option>`).join("")}</optgroup>`).join("");
  }

  function renderSetlist() {
    const rid = activeReleaseId;
    // dentro do projeto fica só a lista de músicas; elas chegam pela aba Demos
    slHint.hidden = true;
    slAddRow.hidden = true;
    slPull.hidden = true;
    document.querySelector(".setlist-wrap").hidden = !rid;
    if (!rid) { slList.innerHTML = ""; return; }
    const list = setlistOf(rid);
    slList.innerHTML = list.map(([id, t], i) => `
      <li class="sl-row">
        <span class="sl-num">${i + 1}</span>
        <span class="sl-name" contenteditable="plaintext-only" spellcheck="false" role="textbox" data-track-name="${esc(id)}" aria-label="Nome da faixa ${i + 1}">${esc(t.titulo)}</span>
        <span class="sl-tools">
          ${audioButtons(id, t, false)}
        </span>
      </li>`).join("") || `<li class="empty">Nenhuma música ainda. Mande pela aba Demos.</li>`;
    const demos = demoQueue();
    slPull.innerHTML = `<option value="">${demos.length ? `Puxar uma demo da fila (${demos.length})…` : "Nenhuma demo na fila"}</option>` +
      demos.map(([id, t]) => `<option value="${esc(id)}">${esc(t.titulo)}${t.artista ? ` — ${esc(t.artista)}` : ""}</option>`).join("");
    slPull.disabled = !demos.length;
  }

  async function swapOrder(id, dir) {
    const list = setlistOf(activeReleaseId);
    const i = list.findIndex(([tid]) => tid === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    // renumera tudo pra não depender de ordens repetidas
    const ids = list.map(([tid]) => tid);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const changes = {};
    ids.forEach((tid, k) => { if (tracks[tid].ordem !== k + 1) changes[tid] = trackDoc(tid, { ordem: k + 1 }); });
    await writeTracks(changes);
  }

  slList.addEventListener("click", (e) => {
    const up = e.target.closest("[data-track-up]");
    if (up) return swapOrder(up.dataset.trackUp, -1);
    const down = e.target.closest("[data-track-down]");
    if (down) return swapOrder(down.dataset.trackDown, 1);
    const out = e.target.closest("[data-track-out]");
    if (out) return moveTrack(out.dataset.trackOut, "");
  });
  slList.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest("[data-track-name]")) { e.preventDefault(); e.target.blur(); }
    if (e.key === "Escape") e.stopPropagation();
  });
  slList.addEventListener("focusout", (e) => {
    const el = e.target.closest("[data-track-name]");
    const t = el && tracks[el.dataset.trackName];
    if (!t) return;
    const titulo = el.textContent.replace(/\s+/g, " ").trim();
    if (!titulo) { el.textContent = t.titulo; return; }
    if (titulo !== t.titulo) writeTracks({ [el.dataset.trackName]: trackDoc(el.dataset.trackName, { titulo }) }, "Nome da faixa salvo.");
  });

  async function addToSetlist() {
    const titulo = slNew.value.trim();
    if (!titulo || !activeReleaseId) { slNew.focus(); return; }
    slNew.value = "";
    await writeTracks({ [newId("t")]: { titulo, artista: "", releaseId: activeReleaseId, ordem: nextOrdem(activeReleaseId), link: "", obs: "", criado: new Date().toISOString() } });
    slNew.focus();
  }
  document.getElementById("sl-add").addEventListener("click", addToSetlist);
  slNew.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addToSetlist(); } });
  slPull.addEventListener("change", () => {
    if (slPull.value && activeReleaseId) moveTrack(slPull.value, activeReleaseId);
  });

  /* aba Demos: só o nome da música e pra onde ela vai */
  const dTitulo = document.getElementById("d-titulo");
  const dDestino = document.getElementById("d-destino");
  const dSave = document.getElementById("d-save");
  const demoList = document.getElementById("demo-list");
  const demoProjects = document.getElementById("demo-projects");
  const npBox = document.getElementById("new-project");
  const npNome = document.getElementById("np-nome");
  let npFormato = "EP";
  let npFor = null;  // "form" ou o id da música que vai pro projeto novo

  function demoRow(id, t) {
    return `
      <div class="row demo-row">
        <span class="demo-name" contenteditable="plaintext-only" spellcheck="false" role="textbox" data-track-name="${esc(id)}">${esc(t.titulo)}</span>
        <select class="demo-move" data-move-track="${esc(id)}" aria-label="Pra onde vai">
          <option value="__">${t.releaseId ? "Realocar…" : "Mandar pra…"}</option>
          ${t.releaseId ? `<option value="">← Voltar pra fila</option>` : ""}
          ${targetOptions()}
        </select>
        <span class="demo-audio">${audioButtons(id, t, true)}</span>
        <button class="demo-del" type="button" data-del-track="${esc(id)}" aria-label="Apagar" title="Apagar">×</button>
      </div>`;
  }

  function renderDemos() {
    const keep = dDestino.value;
    dDestino.innerHTML = `<option value="">Fila de demos (sem projeto)</option>` + targetOptions();
    if ([...dDestino.options].some((o) => o.value === keep) && keep !== "__new") dDestino.value = keep;
    const queue = demoQueue();
    document.getElementById("demo-count").textContent = queue.length ? `(${queue.length})` : "";
    demoList.innerHTML = queue.map(([id, t]) => demoRow(id, t)).join("") ||
      `<p class="empty">Nenhuma demo na fila.</p>`;
    demoProjects.innerHTML = targetReleases()
      .map(([rid, r]) => [rid, r, setlistOf(rid)])
      .filter(([, , list]) => list.length)
      .map(([rid, r, list]) => `
        <div class="demo-project" style="--serie:${seriesColor(r.serie)}">
          <button class="demo-project-head" type="button" data-release="${esc(rid)}">
            <b>${esc(releaseLabel(r))}${r.formato && isGeral(r) ? ` · ${esc(r.formato)}` : ""}</b>
            <span>${list.length} faixa${list.length > 1 ? "s" : ""}${r.data ? ` · ${esc(shortDate(r))}` : ""}</span>
          </button>
          ${list.map(([id, t]) => demoRow(id, t)).join("")}
        </div>`).join("") ||
      `<p class="empty">Nenhuma música mandada pra projeto ainda.</p>`;
  }

  /* Com áudio escolhido: um arquivo usa o nome digitado (ou o do
     arquivo); vários viram uma demo cada, com o nome do arquivo. */
  async function addDemo(filesArg) {
    const files = filesArg && filesArg.length ? [...filesArg] : [...dFile.files];
    const titulo = dTitulo.value.trim();
    if (!titulo && !files.length) { showToast("Escreve o nome da música ou escolhe um WAV."); dTitulo.focus(); return; }
    const rid = dDestino.value === "__new" ? "" : dDestino.value;
    const items = files.length
      ? files.map((f) => [files.length === 1 && titulo ? titulo : fileTitle(f.name), f])
      : [[titulo, null]];
    const changes = {};
    let ordem = rid ? nextOrdem(rid) : 0;
    const created = items.map(([nome, f]) => {
      const id = newId("t");
      changes[id] = { titulo: nome, artista: "", releaseId: rid, ordem: rid ? ordem++ : 0, link: "", obs: "", criado: new Date().toISOString() };
      return [id, f];
    });
    dTitulo.value = "";
    dFile.value = "";
    syncFileLabel();
    await writeTracks(changes, created.length > 1 ? `${created.length} demos adicionadas.` : rid ? `Entrou em ${releaseLabel(releases[rid])}.` : "Demo adicionada.");
    created.forEach(([id, f]) => { if (f) uploadAudio(id, f); });
    dTitulo.focus();
  }
  dSave.addEventListener("click", () => addDemo());
  dTitulo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addDemo(); } });

  /* ── áudio (WAV) das demos ─────────────────────────────────
     Sobe pro Firebase Storage (bg_demos/<faixa>/<arquivo>) e guarda no
     doc da faixa { url, path, nome, tamanho }. Se o Storage não estiver
     ligado ou a nuvem cair, guarda o arquivo neste aparelho (IndexedDB)
     com { local: true } — toca aqui, e dá pra subir de novo depois. */
  const dFile = document.getElementById("d-file");
  const dFileLabel = document.getElementById("d-file-label");
  const audioInput = document.getElementById("audio-input");
  const player = new Audio();
  player.preload = "auto";
  let playingId = null;      // faixa carregada no player (tocando ou pausada)
  let queue = [];            // ids da lista onde o play foi apertado
  const localUrls = new Map();  // id → blob: URL dos áudios guardados no aparelho
  const localMeta = new Map();  // id → "24-bit · 48 kHz" lido do cabeçalho do WAV
  let audioFor = null;
  const uploads = {};  // id da faixa → % enviado
  const MAX_AUDIO = 300 * 1024 * 1024;

  function fileTitle(name) {
    return name.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_]+/g, " ").trim() || "Demo";
  }
  function fmtSize(n) {
    return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  }
  function syncFileLabel() {
    const n = dFile.files.length;
    dFileLabel.textContent = n ? (n === 1 ? `♪ ${dFile.files[0].name}` : `♪ ${n} arquivos`) : "♪ WAV";
    dFileLabel.closest(".file-btn").classList.toggle("has-file", !!n);
    if (n === 1 && !dTitulo.value.trim()) dTitulo.placeholder = fileTitle(dFile.files[0].name);
    if (!n) dTitulo.placeholder = "Nome da música";
  }
  dFile.addEventListener("change", syncFileLabel);

  function audioButtons(id, t, full) {
    if (uploads[id] != null) return `<span class="up-prog" data-prog="${esc(id)}">${uploads[id]}%</span>`;
    const a = t.audio;
    if (a && a.local) preloadLocal(id);
    const on = playingId === id && !player.paused;
    const play = a ? `<button type="button" class="play-btn${on ? " is-playing" : ""}" data-play="${esc(id)}" aria-label="${on ? "Pausar" : "Tocar"}" title="${esc(a.nome || "áudio")}${a.local ? " (só neste aparelho)" : ""}">${on ? "❚❚" : "▶"}</button>` : "";
    if (!full) return play;
    const down = a && a.url ? `<a class="audio-down" href="${esc(a.link || a.url)}" target="_blank" rel="noopener" download="${esc(a.nome || "demo.wav")}" title="${a.link ? "Abrir o link original" : `Baixar ${esc(a.nome || "")}`}" aria-label="Baixar">${a.link ? "↗" : "⤓"}</a>` : "";
    const local = a && a.local ? `<span class="audio-local" title="Esse áudio só está no aparelho de quem subiu">só aqui</span>` : "";
    return `${play}${down}${local}<button type="button" class="wav-btn" data-pick-audio="${esc(id)}" title="${a ? "Trocar o áudio" : "Adicionar WAV"}">${a ? "trocar" : "+ WAV"}</button><button type="button" class="wav-btn wav-link" data-link-audio="${esc(id)}" title="Colar link do Google Drive ou Dropbox">🔗</button>`;
  }

  /* IndexedDB: áudio guardado só neste aparelho */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("bg_audio", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbDo(mode, fn) {
    const db2 = await idb();
    return new Promise((res, rej) => {
      const tx = db2.transaction("files", mode);
      const req = fn(tx.objectStore("files"));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  }

  let storageMod = null;
  async function storage() {
    if (!fbApp || !fbUser) throw new Error("sem nuvem");
    if (!storageMod) storageMod = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js");
    const st = storageMod.getStorage(fbApp);
    // o padrão do SDK é tentar por 10 min — parecia travado em 0%
    st.maxUploadRetryTime = 20000;
    st.maxOperationRetryTime = 20000;
    return { mod: storageMod, st };
  }

  function setProgress(id, pct) {
    uploads[id] = pct;
    const el = document.querySelector(`[data-prog="${CSS.escape(id)}"]`);
    if (el) el.textContent = `${pct}%`;
  }

  async function uploadAudio(id, file) {
    if (!tracks[id]) return;
    if (file.size > MAX_AUDIO) { showToast(`Arquivo grande demais (${fmtSize(file.size)}). Máximo 300 MB.`); return; }
    const old = tracks[id].audio;
    setProgress(id, 0);
    renderAll();
    let audio;
    try {
      const { mod, st } = await storage();
      const path = `bg_demos/${id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const task = mod.uploadBytesResumable(mod.ref(st, path), file, { contentType: file.type || "audio/wav" });
      await new Promise((res, rej) => {
        // se nada andar em 25 s, a nuvem não está aceitando: desiste
        let last = 0, stall = setTimeout(() => task.cancel(), 25000);
        task.on("state_changed", (snap) => {
          if (snap.bytesTransferred > last) {
            last = snap.bytesTransferred;
            clearTimeout(stall);
            stall = setTimeout(() => task.cancel(), 60000);
          }
          setProgress(id, Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }, (err) => { clearTimeout(stall); rej(err); }, () => { clearTimeout(stall); res(); });
      });
      audio = { url: await mod.getDownloadURL(task.snapshot.ref), path, nome: file.name, tamanho: file.size };
    } catch (err) {
      const code = (err && (err.code || err.message)) || "";
      console.warn("Storage indisponível, guardando no aparelho:", code);
      const motivo = /unauthorized/.test(code) ? "as regras do Storage ainda não liberam"
        : /sem nuvem/.test(code) ? "sem conexão com a nuvem"
        : "o Storage da nuvem não respondeu (ainda não ligado?)";
      try {
        await idbDo("readwrite", (os) => os.put(file, id));
        audio = { local: true, nome: file.name, tamanho: file.size };
        if (localUrls.has(id)) URL.revokeObjectURL(localUrls.get(id));
        localUrls.set(id, URL.createObjectURL(file));
        readWavInfo(file).then((info) => { if (info) localMeta.set(id, info); });
        showToast(`Áudio guardado só neste aparelho — ${motivo}.`);
      } catch (err2) {
        console.error(err2);
        delete uploads[id];
        renderAll();
        showToast("Não deu pra guardar o áudio nem neste aparelho. Tenta um arquivo menor.");
        return;
      }
    }
    delete uploads[id];
    if (!tracks[id]) return;
    await writeTracks({ [id]: trackDoc(id, { audio }) }, audio.local ? null : `Áudio salvo (${fmtSize(file.size)}).`);
    if (old && old.path !== audio.path) removeAudioFile(id, old, !audio.local);
  }

  async function removeAudioFile(id, a, keepLocal) {
    try {
      if (a.path) {
        const { mod, st } = await storage();
        await mod.deleteObject(mod.ref(st, a.path));
      }
      if (a.local && !keepLocal) await idbDo("readwrite", (os) => os.delete(id));
    } catch (err) {
      console.warn("não deu pra apagar o áudio antigo", err);
    }
  }

  /* Áudios guardados no aparelho viram blob: URL antes do toque — o
     Safari do iPhone só deixa tocar se o play acontece direto no toque,
     sem esperar o IndexedDB. */
  const loadingLocal = new Set();
  function preloadLocal(id) {
    if (localUrls.has(id) || loadingLocal.has(id)) return;
    loadingLocal.add(id);
    idbDo("readonly", (os) => os.get(id)).then((blob) => {
      if (!blob) return;
      localUrls.set(id, URL.createObjectURL(blob));
      return readWavInfo(blob).then((info) => { if (info) localMeta.set(id, info); });
    }).catch(() => {}).finally(() => loadingLocal.delete(id));
  }

  /* lê o cabeçalho do WAV: bits e taxa de amostragem */
  async function readWavInfo(blob) {
    try {
      const v = new DataView(await blob.slice(0, 4096).arrayBuffer());
      if (v.getUint32(0, false) !== 0x52494646) return null;  // "RIFF"
      for (let i = 12; i < v.byteLength - 24; ) {
        const idTag = v.getUint32(i, false), size = v.getUint32(i + 4, true);
        if (idTag === 0x666d7420) {  // "fmt "
          const ch = v.getUint16(i + 10, true), rate = v.getUint32(i + 12, true), bits = v.getUint16(i + 22, true);
          return `${bits}-bit · ${(rate / 1000).toFixed(rate % 1000 ? 1 : 0)} kHz · ${ch === 1 ? "mono" : "estéreo"}`;
        }
        i += 8 + size + (size % 2);
      }
    } catch (err) {}
    return null;
  }

  /* ── player ──────────────────────────────────────────────── */
  const plBar = document.getElementById("player-bar");
  const plToggle = document.getElementById("pl-toggle");
  const plTitle = document.getElementById("pl-title");
  const plSub = document.getElementById("pl-sub");
  const plSeek = document.getElementById("pl-seek");
  const plCur = document.getElementById("pl-cur");
  const plDur = document.getElementById("pl-dur");
  const plDown = document.getElementById("pl-down");
  let seeking = false;

  function fmtTime(sec) {
    if (!isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60), s2 = Math.floor(sec % 60);
    return `${m}:${String(s2).padStart(2, "0")}`;
  }

  function where(t) {
    return t.releaseId && releases[t.releaseId] ? releaseLabel(releases[t.releaseId]) : "Fila de demos";
  }

  function syncPlayerBar() {
    const t = playingId && tracks[playingId];
    plBar.hidden = !t;
    document.body.classList.toggle("has-player", !!t);
    if (!t) return;
    const a = t.audio || {};
    plTitle.textContent = t.titulo;
    plSub.textContent = [localMeta.get(playingId) || (/\.wav$/i.test(a.nome || "") ? "WAV original, sem compressão" : a.nome),
      a.tamanho ? fmtSize(a.tamanho) : "", where(t), a.local ? "só neste aparelho" : ""].filter(Boolean).join(" · ");
    plToggle.textContent = player.paused ? "▶" : "❚❚";
    plToggle.setAttribute("aria-label", player.paused ? "Tocar" : "Pausar");
    plDown.hidden = !(a.url || localUrls.has(playingId));
    plDown.href = a.link || a.url || localUrls.get(playingId) || "#";
    plDown.download = a.nome || "demo.wav";
    const i = queue.indexOf(playingId);
    document.getElementById("pl-prev").disabled = i <= 0 && player.currentTime < 3;
    document.getElementById("pl-next").disabled = i < 0 || i >= queue.length - 1;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.titulo, artist: "Banana Gold Records", album: where(t) });
    }
  }

  /* Endereços pra tentar, em ordem. Drive: a API oficial (não tem a tela
     de aviso de arquivo grande; precisa da Google Drive API ligada no
     projeto) e depois os dois endereços de download direto. */
  let srcList = [];
  let srcIdx = 0;
  function driveIdOf(a) {
    const m = `${a.url || ""} ${a.link || ""}`.match(/(?:id=|\/d\/)([\w-]{10,})/);
    return m && m[1];
  }
  function audioSources(id, a) {
    if (a.origem === "drive") {
      const fid = driveIdOf(a);
      if (fid) {
        return [
          `https://www.googleapis.com/drive/v3/files/${fid}?alt=media&key=${firebaseConfig.apiKey}`,
          `https://drive.usercontent.google.com/download?id=${fid}&export=download&confirm=t`,
          `https://drive.google.com/uc?export=download&id=${fid}`,
        ];
      }
    }
    const one = a.url || localUrls.get(id);
    return one ? [one] : [];
  }

  function playTrack(id) {
    const t = tracks[id];
    const a = t && t.audio;
    if (!a) return;
    srcList = audioSources(id, a);
    srcIdx = 0;
    const src = srcList[0];
    if (!src) {
      if (a.local) { preloadLocal(id); showToast("Esse áudio só está no aparelho de quem subiu."); }
      return;
    }
    if (playingId !== id || !srcList.includes(player.src)) player.src = src;
    playingId = id;
    player.play().catch((err) => {
      console.warn(err);
      showToast("Não deu pra tocar esse arquivo aqui.");
    });
    syncPlayerBar();
    renderAll();
  }

  function togglePlay(id, list) {
    if (playingId === id) {
      if (player.paused) player.play().catch(() => {});
      else player.pause();
      return;
    }
    if (list) queue = list;
    else if (!queue.includes(id)) queue = [id];
    playTrack(id);
  }

  function step(dir) {
    if (dir < 0 && player.currentTime > 3) { player.currentTime = 0; return; }
    const i = queue.indexOf(playingId) + dir;
    if (i >= 0 && i < queue.length) playTrack(queue[i]);
  }

  ["play", "pause"].forEach((ev) => player.addEventListener(ev, () => { syncPlayerBar(); renderAll(); }));
  player.addEventListener("ended", () => {
    const i = queue.indexOf(playingId);
    if (i >= 0 && i < queue.length - 1) playTrack(queue[i + 1]);
    else { syncPlayerBar(); renderAll(); }
  });
  player.addEventListener("loadedmetadata", () => { plDur.textContent = fmtTime(player.duration); });
  player.addEventListener("timeupdate", () => {
    plCur.textContent = fmtTime(player.currentTime);
    if (!seeking && player.duration) plSeek.value = String(Math.round((player.currentTime / player.duration) * 1000));
  });
  player.addEventListener("error", () => {
    const a = playingId && tracks[playingId] && tracks[playingId].audio;
    if (!a) return;
    // tenta o próximo endereço antes de desistir
    if (srcIdx < srcList.length - 1) {
      srcIdx += 1;
      player.src = srcList[srcIdx];
      player.play().catch(() => {});
      return;
    }
    if (a.origem === "drive") showToast("O Drive não entregou o áudio. Confere se o arquivo está como \"Qualquer pessoa com o link\" e se a Google Drive API está ativada no projeto. Enquanto isso, ↗ abre no Drive.");
    else showToast("Falhou ao carregar o áudio — confere a conexão ou sobe o arquivo de novo.");
  });
  plSeek.addEventListener("input", () => {
    seeking = true;
    if (player.duration) plCur.textContent = fmtTime((plSeek.value / 1000) * player.duration);
  });
  plSeek.addEventListener("change", () => {
    if (player.duration) player.currentTime = (plSeek.value / 1000) * player.duration;
    seeking = false;
  });
  plToggle.addEventListener("click", () => { if (playingId) togglePlay(playingId); });
  document.getElementById("pl-prev").addEventListener("click", () => step(-1));
  document.getElementById("pl-next").addEventListener("click", () => step(1));
  document.getElementById("pl-close").addEventListener("click", () => {
    player.pause();
    playingId = null;
    syncPlayerBar();
    renderAll();
  });
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", () => player.play());
      navigator.mediaSession.setActionHandler("pause", () => player.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
    } catch (err) {}
  }

  /* Link do Google Drive / Dropbox no lugar do upload. Vira um endereço
     que o player toca direto; o link original fica pra abrir/baixar.
     Drive: o arquivo precisa estar em "Qualquer pessoa com o link"; acima
     de ~100 MB o Drive mostra um aviso antes do download e não toca aqui. */
  function audioFromLink(raw) {
    const link = raw.trim();
    let u;
    try { u = new URL(link); } catch (err) { return null; }
    const host = u.hostname.replace(/^www\./, "");
    if (/(^|\.)drive\.google\.com$/.test(host) || host === "docs.google.com") {
      const m = u.pathname.match(/\/d\/([\w-]{10,})/) || [null, u.searchParams.get("id")];
      if (!m[1]) return null;
      return { url: `https://drive.google.com/uc?export=download&id=${m[1]}`, link, nome: "Google Drive", origem: "drive" };
    }
    if (/(^|\.)dropbox\.com$/.test(host)) {
      u.searchParams.delete("dl");
      u.searchParams.set("raw", "1");
      return { url: u.toString(), link, nome: decodeURIComponent(u.pathname.split("/").pop() || "Dropbox"), origem: "dropbox" };
    }
    if (/\.(wav|aiff?|mp3|flac|m4a|ogg)(\?|$)/i.test(u.pathname)) {
      return { url: link, link, nome: decodeURIComponent(u.pathname.split("/").pop()), origem: "link" };
    }
    return null;
  }

  async function linkAudio(id) {
    const t = tracks[id];
    if (!t) return;
    const raw = window.prompt(`Cole o link do WAV de "${t.titulo}" (Google Drive ou Dropbox).\nNo Drive, compartilhe como "Qualquer pessoa com o link".`, (t.audio && t.audio.link) || "");
    if (raw == null || !raw.trim()) return;
    const audio = audioFromLink(raw);
    if (!audio) { showToast("Não reconheci esse link. Use um link de compartilhamento do Google Drive ou do Dropbox."); return; }
    const old = t.audio;
    await writeTracks({ [id]: trackDoc(id, { audio }) }, `Link salvo (${audio.nome}). Toque no ▶ pra ouvir.`);
    if (old && (old.path || old.local)) removeAudioFile(id, old);
  }

  function onAudioClick(e) {
    const linkBtn = e.target.closest("[data-link-audio]");
    if (linkBtn) { e.stopPropagation(); linkAudio(linkBtn.dataset.linkAudio); return true; }
    const play = e.target.closest("[data-play]");
    if (play) {
      e.stopPropagation();
      const list = [...e.currentTarget.querySelectorAll("[data-play]")].map((b) => b.dataset.play);
      togglePlay(play.dataset.play, list);
      return true;
    }
    const pick = e.target.closest("[data-pick-audio]");
    if (pick) { audioFor = pick.dataset.pickAudio; audioInput.value = ""; audioInput.click(); return true; }
    return false;
  }
  audioInput.addEventListener("change", () => {
    if (audioFor && audioInput.files[0]) uploadAudio(audioFor, audioInput.files[0]);
    audioFor = null;
  });
  [demoList, demoProjects, slList].forEach((el) => el.addEventListener("click", onAudioClick, true));

  /* arrastar WAVs pra aba Demos cria uma demo por arquivo */
  const viewDemos = document.getElementById("view-demos");
  viewDemos.addEventListener("dragover", (e) => { e.preventDefault(); viewDemos.classList.add("is-drop"); });
  viewDemos.addEventListener("dragleave", (e) => { if (e.target === viewDemos) viewDemos.classList.remove("is-drop"); });
  viewDemos.addEventListener("drop", (e) => {
    e.preventDefault();
    viewDemos.classList.remove("is-drop");
    const files = [...e.dataTransfer.files].filter((f) => /^audio\//.test(f.type) || /\.(wav|aiff?|mp3|flac)$/i.test(f.name));
    if (files.length) addDemo(files);
  });

  /* projeto novo: nome livre + EP/LP. Entra em "Projetos novos" e já
     recebe a música que pediu ele. */
  function openNewProject(forWhat) {
    npFor = forWhat;
    npNome.value = "";
    npFormato = "EP";
    npBox.querySelectorAll("[data-np-formato]").forEach((x) => x.classList.toggle("is-on", x.dataset.npFormato === "EP"));
    npBox.hidden = false;
    npBox.scrollIntoView({ behavior: "smooth", block: "center" });
    npNome.focus();
  }
  function closeNewProject() {
    npBox.hidden = true;
    npFor = null;
    renderDemos();
  }
  npBox.addEventListener("click", (e) => {
    const b = e.target.closest("[data-np-formato]");
    if (!b) return;
    npFormato = b.dataset.npFormato;
    npBox.querySelectorAll("[data-np-formato]").forEach((x) => x.classList.toggle("is-on", x === b));
  });
  document.getElementById("np-cancel").addEventListener("click", closeNewProject);
  npNome.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("np-create").click(); } });
  document.getElementById("np-create").addEventListener("click", async () => {
    const nome = npNome.value.trim();
    if (!nome) { showToast("Dá um nome pro projeto."); npNome.focus(); return; }
    const pid = newId("prj");
    const projeto = seed("projetos", 0, { titulo: nome, formato: npFormato, status: "producao" });
    delete projeto.id;
    const target = npFor;
    try {
      await write({ releases: { [pid]: projeto } });
    } catch (err) {
      console.error(err);
      showToast("Não deu pra criar o projeto. Tenta de novo.");
      return;
    }
    npBox.hidden = true;
    npFor = null;
    if (target === "form") {
      renderDemos();
      dDestino.value = pid;
      if (dTitulo.value.trim()) await addDemo();
      else { showToast(`Projeto ${nome} criado.`); dTitulo.focus(); }
    } else if (target && tracks[target]) {
      await moveTrack(target, pid);
    } else {
      showToast(`Projeto ${nome} criado.`);
    }
  });

  dDestino.addEventListener("change", () => { if (dDestino.value === "__new") openNewProject("form"); });

  function onDemoClick(e) {
    const rel = e.target.closest("[data-release]");
    if (rel) return openRelease(rel.dataset.release);
    const del = e.target.closest("[data-del-track]");
    if (del && confirm(`Apagar "${tracks[del.dataset.delTrack].titulo}"?`)) deleteTrack(del.dataset.delTrack);
  }
  function onDemoMove(e) {
    const sel = e.target.closest("[data-move-track]");
    if (!sel || sel.value === "__") return;
    if (sel.value === "__new") return openNewProject(sel.dataset.moveTrack);
    moveTrack(sel.dataset.moveTrack, sel.value);
  }
  function onDemoKey(e) {
    if (e.key === "Enter" && e.target.closest("[data-track-name]")) { e.preventDefault(); e.target.blur(); }
  }
  function onDemoRename(e) {
    const el = e.target.closest("[data-track-name]");
    const t = el && tracks[el.dataset.trackName];
    if (!t) return;
    const titulo = el.textContent.replace(/\s+/g, " ").trim();
    if (!titulo) { el.textContent = t.titulo; return; }
    if (titulo !== t.titulo) writeTracks({ [el.dataset.trackName]: trackDoc(el.dataset.trackName, { titulo }) }, "Nome salvo.");
  }
  [demoList, demoProjects].forEach((el) => {
    el.addEventListener("click", onDemoClick);
    el.addEventListener("change", onDemoMove);
    el.addEventListener("keydown", onDemoKey);
    el.addEventListener("focusout", onDemoRename);
  });

  /* ── painel do dia + tarefas ───────────────────────────── */
  const dayItems = document.getElementById("day-items");
  const tTitulo = document.getElementById("t-titulo");
  const tTipo = document.getElementById("t-tipo");
  const tData = document.getElementById("t-data");
  const tResp = document.getElementById("t-resp");
  const tRelease = document.getElementById("t-release");
  const tObs = document.getElementById("t-obs");
  const tFeito = document.getElementById("t-feito");
  const tDelete = document.getElementById("t-delete");

  tTipo.innerHTML = TASK_TYPES.map((t) => `<option value="${t.id}">${t.nome}</option>`).join("");

  function fillReleaseOptions(selected) {
    const opts = Object.entries(releases).sort((a, b) =>
      a[1].serie.localeCompare(b[1].serie) || a[1].vol - b[1].vol);
    tRelease.innerHTML = `<option value="">— nenhum —</option>` +
      opts.map(([id, r]) => `<option value="${esc(id)}"${id === selected ? " selected" : ""}>${esc(releaseLabel(r))}</option>`).join("");
  }

  function renderDayItems() {
    const rel = releasesOnDay(activeDayKey);
    const evs = eventsOnDay(activeDayKey);
    dayItems.innerHTML =
      rel.map(([id, r]) => `
        <button class="row" type="button" data-release="${esc(id)}" style="--serie:${seriesColor(r.serie)}">
          <span class="row-bar"></span>
          <span class="row-main"><b>Lançamento · ${esc(releaseLabel(r))}</b><span>${esc(r.titulo || "")}</span></span>
          <span class="row-side"><span class="chip chip-${r.status}">${STATUS_NAME[r.status]}</span></span>
        </button>`).join("") +
      evs.map(([id, e]) => taskRow(id, e)).join("") ||
      `<p class="empty">Nada marcado nesse dia.</p>`;
  }

  function openDay(key, taskId) {
    activeDayKey = key;
    const dt = dateFromKey(key);
    document.getElementById("day-title").textContent = `${WEEKDAY_NAMES[dt.getDay()]}, ${formatBr(key)}`;
    const holiday = getHoliday(key);
    document.getElementById("day-sub").textContent = [holiday, dt.getDay() === 5 ? "sexta: dia bom pra lançar" : ""].filter(Boolean).join(" · ");
    renderDayItems();
    editTask(taskId || null);
    openPanel(dayPanel);
  }

  function editTask(id) {
    activeTaskId = id;
    const e = id ? stored.events[id] : null;
    document.getElementById("task-form-title").textContent = e ? "Editar tarefa" : "Nova tarefa";
    tTitulo.value = e ? e.titulo : "";
    tTipo.value = e ? e.tipo : "outro";
    tData.value = e ? e.data : activeDayKey;
    tResp.value = e ? e.responsavel || "" : "";
    fillReleaseOptions(e ? e.releaseId : "");
    tObs.value = e ? e.obs || "" : "";
    tFeito.checked = !!(e && e.feito);
    tDelete.hidden = !e;
  }

  dayItems.addEventListener("click", (e) => {
    const task = e.target.closest("[data-task]");
    if (task) {
      e.stopPropagation();
      editTask(task.dataset.task);
      tTitulo.focus();
    }
  }, true);

  document.getElementById("t-save").addEventListener("click", async () => {
    const titulo = tTitulo.value.trim();
    if (!titulo) {
      showToast("Escreve o nome da tarefa.");
      tTitulo.focus();
      return;
    }
    const id = activeTaskId || newId("t");
    const entry = {
      titulo,
      tipo: tTipo.value,
      data: tData.value || activeDayKey,
      responsavel: tResp.value.trim(),
      releaseId: tRelease.value,
      feito: tFeito.checked,
      obs: tObs.value.trim(),
    };
    try {
      const mode = await write({ events: { [id]: entry } });
      if (mode !== "local-warned") showToast("Tarefa salva.");
      if (entry.data !== activeDayKey) activeDayKey = entry.data;
      renderDayItems();
      editTask(null);
    } catch (err) {
      console.error(err);
      showToast("Não deu pra salvar. Tenta de novo.");
    }
  });

  tDelete.addEventListener("click", async () => {
    if (!activeTaskId || !confirm("Apagar essa tarefa?")) return;
    try {
      await write({ events: { [activeTaskId]: null } });
      showToast("Tarefa apagada.");
      renderDayItems();
      editTask(null);
    } catch (err) {
      console.error(err);
      showToast("Não deu pra apagar. Tenta de novo.");
    }
  });

  document.getElementById("t-new-release").addEventListener("click", () => {
    openNewRelease(SERIES[0].id, activeDayKey);
  });

  /* ── exportar ──────────────────────────────────────────── */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  document.getElementById("open-sheet").href = SHEET_URL;

  document.getElementById("export-csv").addEventListener("click", () => {
    const head = ["Série", "Volume", "Título", "Artistas", "Formato", "Status", "Data", "Dia confirmado", "Plataforma", "Sub label", "Responsável", "Capa", "Contrato", "Checklist", "Bandcamp", "SoundCloud", "Observações"];
    const rows = SERIES.flatMap((s) => seriesReleases(s.id).map(([, r]) => [
      s.nome, r.vol, r.titulo, r.artistas, r.formato, STATUS_NAME[r.status], r.data ? formatBr(r.data) : "",
      r.data ? (r.dataMes ? "não" : "sim") : "", r.plataforma, r.subLabel, r.responsavel, r.capa, r.contrato, `${checklistDone(r)}/${CHECKLIST.length}`, r.bandcamp, r.soundcloud, r.obs,
    ]));
    const csv = "\ufeff" + [head, ...rows].map((r) => r.map(csvEscape).join(";")).join("\n");
    download("banana-gold-catalogo.csv", csv, "text/csv;charset=utf-8");
  });

  function icsText(s) {
    return String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
  }

  document.getElementById("export-ics").addEventListener("click", () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Banana Gold Records//Lancamentos//PT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Banana Gold · lançamentos"];
    const event = (uid, key, summary, desc) => {
      lines.push("BEGIN:VEVENT", `UID:${uid}@bananagold`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${key.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDaysKey(key, 1).replace(/-/g, "")}`,
        `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(desc)}`, "END:VEVENT");
    };
    Object.entries(releases).forEach(([id, r]) => {
      if (r.data && !r.dataMes) event(`rel-${id}`, r.data, `🍌 ${releaseLabel(r)}${r.titulo ? ` — ${r.titulo}` : ""}`, [STATUS_NAME[r.status], r.bandcamp].filter(Boolean).join("\n"));
    });
    Object.entries(stored.events).forEach(([id, e]) => {
      if (e && e.data) event(`task-${id}`, e.data, `${e.feito ? "✓ " : ""}${e.titulo}`, [e.responsavel && `Responsável: ${e.responsavel}`, e.obs].filter(Boolean).join("\n"));
    });
    lines.push("END:VCALENDAR");
    download("banana-gold-lancamentos.ics", lines.join("\r\n"), "text/calendar;charset=utf-8");
    showToast("Calendário exportado — abre o arquivo pra importar no Google Agenda.");
  });

  /* ── trava de senha ────────────────────────────────────── */
  const loginGate = document.getElementById("login-gate");
  const loginForm = document.getElementById("login-form");
  const loginPassword = document.getElementById("login-password");
  const loginError = document.getElementById("login-error");

  function isUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === "1"; } catch (err) { return false; }
  }

  function startApp() {
    loadLocal();
    renderAll();
    connectFirebase();
    setTimeout(() => { if (!cloudReady) goLocal("timeout"); }, 15000);
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (loginPassword.value.trim().toLowerCase() === APP_PASSWORD) {
      try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (err) {}
      loginGate.hidden = true;
      startApp();
    } else {
      loginError.hidden = false;
      loginPassword.value = "";
      loginPassword.focus();
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    try { localStorage.removeItem(UNLOCK_KEY); } catch (err) {}
    location.reload();
  });

  /* ── toast ─────────────────────────────────────────────── */
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2800);
  }

  /* ── service worker (habilita instalar como app) ──────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw-bananagold.js").catch(() => {});
    });
  }

  /* ── init ──────────────────────────────────────────────── */
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved && document.getElementById(`view-${saved}`)) setTab(saved);
  } catch (err) {}
  rebuildReleases();
  renderCalendar();
  if (isUnlocked()) startApp();
  else {
    loginGate.hidden = false;
    loginPassword.focus();
  }
})();
