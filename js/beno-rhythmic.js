/* Projeto 7 — BENO · FESTA LÁ EM CIMA (instalação audiovisual)

   Tipografia Bauhaus em 3D (letras geométricas de blocos, na linha do alfabeto universal de
   Herbert Bayer; plasticidade de Joost Schmidt; construção de Moholy-Nagy; círculo, triângulo e
   quadrado de Kandinsky; a ordem de Gropius). Cada letra é um conjunto de blocos extrudados em
   profundidade, faces de cor sólida (sem degradê, sem neon, sem brilho). A palavra BENO vira
   FESTA LÁ EM CIMA só enquanto o ACORDE toca (a máquina CHORD): o acorde entra, os blocos se
   soltam e se reconstroem na outra palavra; o acorde para (2 compassos de folga, pra não piscar
   quando ele toca de 2 em 2), volta BENO — com MIDI Clock, na cabeça do compasso. Embaixo, como
   num cartaz de divulgação, a data: 5 DE DEZEMBRO (fixa, em tinta, com a barra e o fio).
   A legibilidade manda: toda deformação volta, e em FESTA LÁ EM CIMA as deformações são menores.

   - KICK   impacto, expansão e reconstrução das letras (mola). COLOR família geométrica da
            tipografia (bloco, extrusão funda, lâmina, arredondada, pontilhada) · SHAPE deformação
            e metamorfose tipográfica · SWEEP direção da expansão · CONTOUR elasticidade e
            articulação · DISTORTION fragmentação · DECAY duração da onda de choque
   - TONE   rotação, profundidade, deslocamento e órbita das letras. COLOR eixo · SHAPE extrusão
            · SWEEP trajetória · CONTOUR elasticidade · DISTORTION oscilação · DECAY duração
   - METAL  micropartículas geométricas criadas e expulsas das letras. COLOR família (quadrado,
            círculo, triângulo, agulha, cruz) · SHAPE porte e angulosidade · SWEEP direção
            (explosão, sobe, lateral, espiral, para a câmera) · CONTOUR vibração · DISTORTION
            dispersão · DECAY vida
   - SNARE  mudança cromática (paletas: Bayer, Moholy-Nagy, Kandinsky, Joost Schmidt, Gropius)
            e fragmentação. SHAPE quais letras racham · SWEEP direção · CONTOUR força da ruptura
            · DISTORTION quanto fragmenta · DECAY quanto tempo fica partido
   - PERC   pequenas esculturas cinéticas independentes ao redor das palavras
   - CHORD  multiplicação e reorganização espacial: cópias da palavra em profundidade (fila,
            grade, arco, escada, túnel = COLOR; quantas = SHAPE) e as letras se reorganizam
   Delay = cópias em sequência na perspectiva; reverb = cópias sumindo no ponto de fuga.
   LFO visual: posição, rotação, escala, geometria, perspectiva, gravidade, magnetismo,
   articulação, fragmentação — modulação contínua entre as notas.

   Uso:
     const visual = createBenoRhythmic(canvas);
     visual.hit('kick' | 'bass' | 'hat' | 'snare' | 'perc' | 'chord', força 0–1, ctx?);
     visual.setText('auto' | 'beno' | 'festa');   visual.setHoldBars(2);  // folga depois do último acorde
     visual.setIntensity(0–2);  visual.setPerspective(0.5–2.5);  visual.setBpm(124);
     visual.clock({ kind: 'beat', beat, bar, inBar }) // vindo do MIDI Clock (opcional)
     visual.reset();  visual.destroy();                                                      */

export function createBenoRhythmic(canvas, opts = {}) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const now = () => performance.now() / 1000;
  const TAU = Math.PI * 2;
  const FM = () => window.CyclesFM;
  const NEU = { color: 0, shape: 0, sweep: 0, contour: 0, decay: 0.5, pitch: 0, pan: 0, level: 0.8, dist: 0, punch: 0, gate: 0, vis: {} };
  const PR = (role) => (FM() ? FM().role(role) : NEU);
  const st5 = (v) => (FM() ? FM().step5(v) : clamp(Math.round(v * 4), 0, 4));
  const A = (v, st) => (FM() ? FM().anchors(v, st) : st[2]);
  const VIS0 = { pos: 0, rot: 0, scale: 0, geom: 0, persp: 0, hue: 0, gravity: 0, magnet: 0, artic: 0, frag: 0 };
  const VIS = () => (FM() ? FM().visAll() : VIS0);

  // ---------- paletas (só cores sólidas) ----------
  const PALS = [
    { name: "Herbert Bayer", bg: ["#ede6d6", "#e4dccb"], cols: ["#d3262c", "#1d4f9e", "#f1b70e", "#151515"], ink: "#151515" },
    { name: "Moholy-Nagy", bg: ["#e6e2d8", "#d9d4c8"], cols: ["#151515", "#d3262c", "#7d7a73", "#151515"], ink: "#151515" },
    { name: "Kandinsky", bg: ["#151515", "#1d2a4a"], cols: ["#f1b70e", "#ede6d6", "#d3262c", "#4a86d8"], ink: "#ede6d6" },
    { name: "Joost Schmidt", bg: ["#d3262c", "#b81f25"], cols: ["#151515", "#ede6d6", "#f1b70e", "#151515"], ink: "#151515" },
    { name: "Walter Gropius", bg: ["#f6f3ec", "#e9e6df"], cols: ["#151515", "#1d4f9e", "#d3262c", "#8c8a84"], ink: "#151515" },
  ];
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const toneCache = new Map();
  function tones(h) { // [frente, lado claro, lado escuro] — tons sólidos da mesma cor
    let t = toneCache.get(h); if (t) return t;
    const [r, g, b] = hex(h), lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
    const f = (k) => `rgb(${Math.round(k < 1 ? r * k : r + (255 - r) * (k - 1))},${Math.round(k < 1 ? g * k : g + (255 - g) * (k - 1))},${Math.round(k < 1 ? b * k : b + (255 - b) * (k - 1))})`;
    t = lum < 0.18 ? [h, f(1.28), f(1.14)] : [h, f(0.8), f(0.62)];
    toneCache.set(h, t); return t;
  }

  // ---------- alfabeto geométrico (caixa de 6 de altura, traço 1) ----------
  // r = retângulo · d = diagonal grossa · a = arco (anel de espessura 1, ângulos em graus)
  const G = {
    B: [3.7, [["r", 0, 0, 1, 6], ["r", 1, 5, 2, 6], ["r", 1, 3, 2, 4], ["a", 2, 4.5, 1.5, 90, -90], ["r", 1, 2, 2.2, 3], ["r", 1, 0, 2.2, 1], ["a", 2.2, 1.5, 1.5, 90, -90]]],
    E: [3.5, [["r", 0, 0, 1, 6], ["r", 1, 5, 3.5, 6], ["r", 1, 2.5, 3, 3.5], ["r", 1, 0, 3.5, 1]]],
    N: [4, [["r", 0, 0, 1, 6], ["r", 3, 0, 4, 6], ["d", 0.55, 5.6, 3.45, 0.4, 1.15]]],
    O: [6, [["a", 3, 3, 3, 0, 360]]],
    F: [3.5, [["r", 0, 0, 1, 6], ["r", 1, 5, 3.5, 6], ["r", 1, 2.5, 3, 3.5]]],
    S: [3.1, [["a", 1.55, 4.5, 1.5, 0, 270], ["a", 1.55, 1.5, 1.5, 90, -180]]],
    T: [4, [["r", 0, 5, 4, 6], ["r", 1.5, 0, 2.5, 5]]],
    A: [4, [["d", 0.45, 0, 2, 6, 1.1], ["d", 3.55, 0, 2, 6, 1.1], ["r", 1.15, 1.6, 2.85, 2.5]]],
    "Á": [4, [["d", 0.45, 0, 2, 6, 1.1], ["d", 3.55, 0, 2, 6, 1.1], ["r", 1.15, 1.6, 2.85, 2.5], ["d", 2.25, 6.75, 3.15, 7.75, 0.6]]],
    L: [3.5, [["r", 0, 0, 1, 6], ["r", 1, 0, 3.5, 1]]],
    M: [5, [["r", 0, 0, 1, 6], ["r", 4, 0, 5, 6], ["d", 0.55, 5.6, 2.5, 1.9, 1.05], ["d", 4.45, 5.6, 2.5, 1.9, 1.05]]],
    C: [5.6, [["a", 3, 3, 3, 42, 318]]],
    I: [1, [["r", 0, 0, 1, 6]]],
    D: [5, [["r", 0, 0, 1, 6], ["r", 1, 5, 2, 6], ["r", 1, 0, 2, 1], ["a", 2, 3, 3, 90, -90]]],
    Z: [4, [["r", 0, 5, 4, 6], ["r", 0, 0, 4, 1], ["d", 3.45, 5.4, 0.55, 0.6, 1.15]]],
    R: [3.9, [["r", 0, 0, 1, 6], ["r", 1, 5, 2, 6], ["r", 1, 3, 2, 4], ["a", 2, 4.5, 1.5, 90, -90], ["d", 1.6, 3.3, 3.5, 0, 1.1]]],
    5: [3.95, [["r", 0, 5, 3.4, 6], ["r", 0, 2.9, 1, 6], ["r", 1, 2.9, 2, 3.9], ["a", 2, 1.95, 1.95, 90, -150]]],
    " ": [1.8, []],
  };
  const GAP = 0.85, LINE = 9.2;
  // blocos de uma linha de texto (coordenadas do mundo, y pra cima, base em 0)
  function glyphBoxes(chr, ox, oy, li, out) {
    const g = G[chr] || G[" "];
    for (const p of g[1]) {
      if (p[0] === "r") { const [, x0, y0, x1, y1] = p; out.push({ x: ox + (x0 + x1) / 2, y: oy + (y0 + y1) / 2, w: (x1 - x0) / 2, h: (y1 - y0) / 2, a: 0, li }); }
      else if (p[0] === "d") { const [, x0, y0, x1, y1, th] = p, L = Math.hypot(x1 - x0, y1 - y0); out.push({ x: ox + (x0 + x1) / 2, y: oy + (y0 + y1) / 2, w: L / 2 + th * 0.12, h: th / 2, a: Math.atan2(y1 - y0, x1 - x0), li }); }
      else { // arco: segmentos de ~22° (cada um é um bloco tangente ao anel)
        const [, cx, cy, R, a0, a1] = p, span = a1 - a0, n = Math.max(2, Math.ceil(Math.abs(span) / 22)), rm = R - 0.5;
        for (let i = 0; i < n; i++) {
          const am = ((a0 + (span * (i + 0.5)) / n) * Math.PI) / 180, seg = (Math.abs(span) / n) * (Math.PI / 180);
          out.push({ x: ox + cx + Math.cos(am) * rm, y: oy + cy + Math.sin(am) * rm, w: rm * Math.sin(seg / 2) + 0.08, h: 0.5, a: am + Math.PI / 2, li, seg: 1 });
        }
      }
    }
    return g[0];
  }
  // layout de uma palavra: linhas (quebra em 2 se a tela não for muito larga) → blocos centrados
  function layout(text, wide) {
    const words = text.split(" ");
    const lines = wide || words.length < 2 ? [text] : splitTwo(words);
    const out = [], widths = [];
    let li = 0;
    lines.forEach((line, row) => {
      let x = 0; const start = out.length;
      for (const ch of line) { const w = glyphBoxes(ch, x, -row * LINE, li, out); if (ch !== " ") li++; x += w + GAP; }
      widths.push(x - GAP);
      for (let i = start; i < out.length; i++) out[i].x -= (x - GAP) / 2;     // cada linha centrada
    });
    const h = 6 + (lines.length - 1) * LINE, cy = (6 - (lines.length - 1) * LINE) / 2;
    for (const b of out) b.y -= cy;
    return { boxes: out, w: Math.max(...widths), h: h + 1.6, letters: li, lines: lines.length };
  }
  function splitTwo(words) { // a quebra que deixa as duas linhas mais parecidas ("FESTA LÁ" / "EM CIMA")
    let best = 1, bd = 1e9;
    for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(" ").length, b = words.slice(i).join(" ").length, d = Math.abs(a - b); if (d < bd) { bd = d; best = i; } }
    return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  }
  const TEXTS = opts.texts || ["BENO", "FESTA LÁ EM CIMA"];
  const DATE = opts.date ?? "5 DE DEZEMBRO";   // a linha do cartaz (vazia = sem data)
  const DATE_S = 0.4;                           // porte da data em relação à palavra

  // ---------- tela ----------
  let W = 1, H = 1, DPR = 1, quality = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    const want = Math.min(2, window.devicePixelRatio || 1), cap = Math.sqrt(6e6 / (W * H));
    DPR = Math.max(0.5, Math.min(want, cap) * quality);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    if (lay && (W / H > 2.6) !== wide) relayout(false); // tela mudou de formato: a palavra quebra (ou junta) as linhas
  }
  let ftAvg = 16.7, ftT = 0;
  function adapt(dtMs, t) {
    ftAvg += (dtMs - ftAvg) * 0.05;
    if (t - ftT < 2) return; ftT = t;
    if (ftAvg > 19 && quality > 0.5) { quality = Math.max(0.5, quality - 0.15); resize(); }
    else if (ftAvg < 15.5 && quality < 1) { quality = Math.min(1, quality + 0.1); resize(); }
  }
  const ro = window.ResizeObserver ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", resize);

  // ---------- estado ----------
  const MAXB = 280, MAXP = 520, MAXS = 14, MAXG = 6;
  const B = Array.from({ length: MAXB }, () => ({ on: false, grp: 0, seg: 0, li: 0, hx: 0, hy: 0, hw: 0.5, hh: 0.5, ha: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, w: 0.5, h: 0.5, a: 0, sx: 0, sy: 0, wx: 0, wy: 0, delay: 0, go: 0, die: 0, frag: 0, fragT: -9, used: false }));
  const PT = Array.from({ length: MAXP }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, kind: 0, col: 0, born: 0, life: 1, rot: 0, w: 0, mode: 0, ang: 0, rad: 0, vib: 0 }));
  const SC = Array.from({ length: MAXS }, () => ({ on: false, x: 0, y: 0, z: 0, fam: 0, born: 0, life: 2, rot: 0, w: 1, art: 0, mode: 0, vx: 0, vy: 0, vz: 0, bounce: 0, frag: 0, col: 0, s: 1 }));
  const GH = Array.from({ length: MAXG }, () => ({ on: false, dx: 0, dy: 0, dz: 0, s: 1, rz: 0, ry: 0, born: 0, life: 2, delay: 0, cs: 0, wave: 0 }));
  let pNext = 0;
  let word, mode, holdBars, lay, wide, counts, intensity = 1, persp = 1, bpm = null;
  let pal, bgK, colorShift, family, deform, deformT, shearK, yaw, yawV, pitch, pitchV, dolly, dollyV, orb, orbPh, orbAxis, orbMode, extr, extrT, wobble;
  let shocks, reorg, reorgMode, bar, beatN, kickBeats, lastClockT, lastKickT, lastBeatT, barSrc, pendingSwitch, lastSwitchBar, transT;
  let springK, springZ, artic, fragDecay, bgPulse, reorgT = -9, reorgArt = 0;

  function reset() {
    for (const b of B) b.on = false;
    for (const p of PT) p.on = false;
    for (const s of SC) s.on = false;
    for (const g of GH) g.on = false;
    word = opts.start === "festa" ? 1 : 0; mode = mode || "auto"; holdBars = holdBars || 2;
    pal = 0; bgK = 0; colorShift = 0; family = 0; deform = 0; deformT = 0; shearK = 0;
    yaw = 0; yawV = 0; pitch = 0; pitchV = 0; dolly = 0; dollyV = 0; orb = 0; orbPh = 0; orbAxis = 0; orbMode = 0; extr = 1; extrT = 1; wobble = 0;
    shocks = []; reorg = 0; reorgMode = 0; bar = 0; beatN = 0; kickBeats = 0; lastClockT = -9; lastKickT = -9; lastBeatT = now(); barSrc = "tempo"; pendingSwitch = false; lastSwitchBar = -1; transT = -9; lastChordT = -99; chordLive = false;
    springK = 60; springZ = 0.7; artic = 0.04; fragDecay = 2.2; bgPulse = 0;
    counts = { kicks: 0, bass: 0, hats: 0, snares: 0, percs: 0, chords: 0, switches: 0, particles: 0, echoes: 0, bars: 0 };
    lay = null; relayout(true);
  }
  // monta (ou remonta) os blocos da palavra atual; com "morph", os blocos viajam da palavra anterior
  // a palavra em cima; embaixo, a data (menor) com a barra e o fio — o cartaz inteiro centrado
  function composition() {
    const L = layout(TEXTS[word], wide);
    if (!DATE) return L;
    const Dt = layout(DATE, true), s = DATE_S, gap = 2.4, dh = 6 * s;
    const total = L.h + gap + dh, top = total / 2, wordC = top - L.h / 2, dateC = top - L.h - gap - dh / 2;
    for (const b of L.boxes) b.y += wordC;
    const dw = Dt.w * s;
    for (const b of Dt.boxes) L.boxes.push({ ...b, x: b.x * s, y: b.y * s + dateC + 0.5 * s, w: b.w * s, h: b.h * s, grp: 1, li: 100 + b.li });
    // cartaz: barra de cor à esquerda da data e um fio entre a palavra e a data (blocos de verdade)
    L.boxes.push({ x: -dw / 2 - 1.1, y: dateC, w: 0.32, h: dh * 0.62, a: 0, li: 200, grp: 2 });
    L.boxes.push({ x: 0, y: dateC + dh / 2 + gap * 0.42, w: Math.max(dw, L.w * 0.5) / 2, h: 0.09, a: 0, li: 201, grp: 2 });
    L.w = Math.max(L.w, dw + 3); L.h = total + 0.6; L.wordC = wordC;
    return L;
  }
  function relayout(hard) {
    wide = W / H > 2.6;
    const L = composition();
    const old = lay; lay = L;
    if (hard || !old) {
      let i = 0;
      for (const t of L.boxes) { const b = B[i++]; if (!b) break; place(b, t, true); }
      for (; i < MAXB; i++) B[i].on = false;
      return;
    }
    // a data e o cartaz não viajam: só vão pro lugar novo (a palavra mudou de altura)
    const keep = B.filter((b) => b.on && !b.die && b.grp);
    const tgK = L.boxes.filter((t) => t.grp);
    if (keep.length === tgK.length) keep.forEach((b, i) => place(b, tgK[i], false));
    else { for (const b of keep) b.on = false; for (const t of tgK) { const b = B.find((q) => !q.on); if (b) place(b, t, true); } }
    morphTo({ ...L, boxes: L.boxes.filter((t) => !t.grp) });
  }
  function place(b, t, snap) {
    b.on = true; b.grp = t.grp || 0; b.seg = t.seg || 0; b.li = t.li; b.hx = t.x; b.hy = t.y; b.hw = t.w; b.hh = t.h; b.ha = t.a; b.die = 0; b.delay = 0; b.go = 0;
    if (snap) { b.x = t.x; b.y = t.y; b.z = 0; b.vx = b.vy = b.vz = 0; b.w = t.w; b.h = t.h; b.a = t.a; b.sx = b.sy = b.wx = b.wy = 0; b.frag = 0; }
  }
  // BENO ↔ FESTA LÁ EM CIMA: cada bloco novo nasce de um bloco da palavra anterior (mesma ordem
  // da esquerda pra direita); os que sobram se desfazem em partículas; a viagem tem articulação
  function morphTo(L) {
    const t = now();
    const olds = B.filter((b) => b.on && !b.die && !b.grp).sort((a, b) => a.x - b.x || b.y - a.y);
    for (const b of olds) b.used = false;
    const tg = L.boxes.slice().sort((a, b) => a.x - b.x || b.y - a.y);
    const nO = olds.length;
    for (let k = 0; k < tg.length; k++) {
      const src = nO ? olds[Math.floor((k * nO) / tg.length)] : null;
      let b = src && !src.used ? src : B.find((q) => !q.on);
      if (!b) break;
      if (b !== src && src) { b.on = true; b.x = src.x; b.y = src.y; b.z = src.z; b.w = src.w * 0.5; b.h = src.h * 0.5; b.a = src.a; b.vx = b.vy = b.vz = 0; b.sx = b.sy = b.wx = b.wy = 0; b.frag = 0; }
      else if (!src) { b.on = true; b.x = tg[k].x; b.y = tg[k].y; b.z = 8; b.w = b.h = 0.05; b.a = 0; b.vx = b.vy = b.vz = 0; b.sx = b.sy = b.wx = b.wy = 0; b.frag = 0; }
      b.used = true;
      place(b, tg[k], false);
      b.delay = t + tg[k].li * artic + Math.random() * 0.03;  // CONTOUR: articulação (letra a letra)
      b.vz -= 4 + Math.random() * 4;                         // a viagem passa pela frente (profundidade)
      b.wy += (Math.random() - 0.5) * 6;
    }
    for (const b of olds) if (!b.used) { b.die = t; b.vz -= 6; b.wx = (Math.random() - 0.5) * 10; for (let i = 0; i < 3; i++) emit(b.x, b.y, b.z, 0.6, { ...NEU, sweep: 0.25 }, 0); }
    transT = t; counts.switches++;
  }
  function setWord(i, force) {
    i = i ? 1 : 0;
    if (i === word && !force) return;
    word = i; relayout(false);
  }

  // ---------- estrutura musical: compassos (MIDI Clock → kicks → tempo) ----------
  // FESTA LÁ EM CIMA = o acorde está tocando (a nota segurada, ou o último acorde há menos de holdBars
  // compassos); quando ele para, volta BENO — com o clock, na cabeça do compasso seguinte
  let lastChordT = -99, chordLive = false;
  const beatLen = () => 60 / (bpm || (FM() && FM().bpm()) || 120);
  function chordHeld(t) {
    const fm = FM();
    if (fm) { const tr = fm.trackOfRole("chord"); if (tr >= 0 && fm.tracks[tr] && fm.tracks[tr].gateOpen && t - lastChordT < 30) return true; } // nota do acorde segurada
    return t - lastChordT < holdBars * 4 * beatLen();
  }
  function newBar(n) {
    bar = n; counts.bars++;
    if (pendingSwitch && mode === "auto") { pendingSwitch = false; if (word === 1 && !chordHeld(now())) setWord(0); }
  }
  function clock(m) {
    if (!m) return;
    const t = now();
    if (m.kind === "transport" && m.state === "start") { bar = 0; beatN = 0; lastClockT = t; barSrc = "clock"; return; }
    if (m.kind !== "beat") return;
    lastClockT = t; barSrc = "clock"; lastBeatT = t; beatN = m.beat;
    if (m.inBar === 0) newBar(m.bar);
  }
  function tickStructure(t) {
    if (t - lastClockT < 2) return;                          // o clock manda
    if (t - lastKickT < 2.5) { barSrc = "kick"; return; }     // os kicks contam
    barSrc = "tempo";
    const P = 60 / (bpm || (FM() && FM().bpm()) || 120);
    if (t - lastBeatT >= P) { lastBeatT += P; if (t - lastBeatT > 1) lastBeatT = t; beatN++; if (beatN % 4 === 0) newBar(beatN / 4); }
  }
  const legib = () => (word === 1 ? 0.62 : 1);               // FESTA LÁ EM CIMA: deformação menor (leitura)

  // ---------- instrumentos ----------
  function kick(v, c) {
    const t = now(), I = intensity * legib();
    lastKickT = t; counts.kicks++;
    if (t - lastClockT >= 2) { kickBeats++; if (kickBeats % 4 === 0) newBar(kickBeats / 4); }
    family = st5(c.color);                                                         // COLOR: família tipográfica
    springK = A(c.contour, [95, 70, 45, 28, 16]); springZ = A(c.contour, [0.95, 0.75, 0.5, 0.32, 0.18]); // CONTOUR: elasticidade
    artic = 0.015 + c.contour * 0.09;                                              // e articulação
    deform = Math.max(deform, c.shape * (0.5 + 0.5 * v)); deformT = t;              // SHAPE: deformação/metamorfose
    const dir = st5(c.sweep), force = (3 + 7 * v) * I * (1 + c.dist * 0.6) * (c.punch ? 1.3 : 1);
    const cx = 0, cy = (lay && lay.wordC) || 0;                                    // centro da palavra (a data fica embaixo)
    for (const b of B) {
      if (!b.on || b.die) continue;
      const g = b.grp ? 0.3 : 1;                                                    // a data balança pouco (legível)
      let dx = b.x - cx, dy = b.y - cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; dx *= g; dy *= g;
      if (dir === 1) { b.vx += Math.sign(b.x || 1) * force * 0.9 * g; }
      else if (dir === 2) { b.vy += Math.sign(b.y || 1) * force * 0.9 * g; }
      else if (dir === 3) { b.vz -= force * 1.4 * g; }
      else if (dir === 4) { b.vx += -dy * force; b.vy += dx * force; }
      else { b.vx += dx * force * 0.8; b.vy += dy * force * 0.8; b.vz -= force * 0.35 * g; }
      // DISTORTION: fragmentação — blocos giram soltos e voam mais longe (a mola reconstrói)
      if (!b.grp && c.dist > 0.05 && Math.random() < c.dist) { b.wx += (Math.random() - 0.5) * 14 * c.dist; b.wy += (Math.random() - 0.5) * 14 * c.dist; b.vz -= Math.random() * 6 * c.dist; }
    }
    shocks.push({ t0: t, v, life: A(c.decay, [0.18, 0.32, 0.55, 1.1, 2.2]), kind: family }); // DECAY: duração do choque
    if (shocks.length > 8) shocks.shift();
    bgPulse = Math.max(bgPulse, 0.6 * v);
  }
  function bass(v, c) {
    counts.bass++;
    const I = intensity * legib();
    orbAxis = st5(c.color); orbMode = st5(c.sweep);                                 // COLOR: eixo · SWEEP: trajetória
    orb = Math.min(1.4, orb + (0.25 + 0.6 * v) * I);
    const s = Math.random() < 0.5 ? -1 : 1;
    yawV += s * (0.25 + 0.5 * v) * I * (orbAxis === 1 ? 0.3 : 1); pitchV += (orbAxis === 1 || orbAxis === 3 ? s * (0.2 + 0.3 * v) : 0) * I;
    dollyV -= (4 + 6 * v) * I;                                                      // profundidade
    extrT = 1 + c.shape * 2.2;                                                       // SHAPE: extrusão
    wobble = Math.max(wobble, c.dist);                                               // DISTORTION: oscilação
    orbDecay = A(c.decay, [3.5, 2, 1.2, 0.6, 0.3]); orbZeta = A(c.contour, [1, 0.7, 0.45, 0.3, 0.18]);
  }
  let orbDecay = 1.2, orbZeta = 0.7;
  function emit(x, y, z, v, c, kind) {
    const p = PT[pNext]; pNext = (pNext + 1) % MAXP;
    const t = now(), mode = st5(c.sweep), sp = (2 + 7 * v) * (1 + c.dist * 1.2) * intensity;
    p.on = true; p.born = t; p.life = A(c.decay, [0.3, 0.6, 1.1, 2.2, 4.5]) * (0.7 + Math.random() * 0.6);
    p.x = x; p.y = y; p.z = z; p.kind = kind ?? st5(c.color); p.mode = mode; p.vib = c.contour;
    p.s = (0.12 + Math.random() * 0.18) * (1 + c.shape * 1.4) * (0.7 + 0.6 * v); p.col = (Math.random() * 4) | 0; p.rot = Math.random() * TAU; p.w = (Math.random() - 0.5) * 8;
    const a = Math.random() * TAU, e = (Math.random() - 0.5) * 1.6;
    p.vx = Math.cos(a) * Math.cos(e) * sp; p.vy = Math.sin(e) * sp; p.vz = Math.sin(a) * Math.cos(e) * sp;
    if (mode === 1) { p.vy = Math.abs(p.vy) + sp * 0.9; p.vx *= 0.35; p.vz *= 0.35; }                  // sobe ("lá em cima")
    else if (mode === 2) { p.vx = Math.sign(x || 1) * (sp + Math.abs(p.vx)); p.vy *= 0.25; }           // corrente lateral
    else if (mode === 3) { p.ang = Math.atan2(y, x); p.rad = Math.hypot(x, y) + 0.5; p.w = (2 + 3 * v) * (Math.random() < 0.5 ? -1 : 1); } // espiral
    else if (mode === 4) { p.vz = -(sp * 1.6 + 4); p.vx *= 0.3; p.vy *= 0.3; }                          // vem pra câmera
    counts.particles++;
    return p;
  }
  function hat(v, c) {
    counts.hats++;
    const n = Math.round((3 + 10 * v) * Math.min(1.6, intensity));
    const src = B.filter((b) => b.on && !b.die && !b.grp);
    for (let i = 0; i < n && src.length; i++) {
      const b = src[(Math.random() * src.length) | 0];
      const u = (Math.random() - 0.5) * 2 * b.w, ca = Math.cos(b.a), sa = Math.sin(b.a);
      emit(b.x + ca * u, b.y + sa * u, b.z - 0.6, v, c);                             // nasce na face da letra
    }
  }
  function snare(v, c) {
    counts.snares++;
    pal = st5(c.color);                                                            // COLOR: paleta (as escolas)
    colorShift = (colorShift + 1) % 4; bgK ^= 1;                                   // mudança cromática
    fragDecay = A(c.decay, [6, 3.5, 2.2, 1.1, 0.5]);                               // DECAY: quanto tempo fica partido
    const t = now(), cut = st5(c.shape), dir = st5(c.sweep), I = intensity * legib();
    const force = (2 + 6 * v) * (0.6 + c.contour * 1.6) * I;                       // CONTOUR: força da ruptura
    const amount = 0.25 + c.dist * 0.75;                                           // DISTORTION: quanto fragmenta
    for (const b of B) {
      if (!b.on || b.die || b.grp) continue;                                       // a data não racha
      // SHAPE: quais letras racham (todas, alternadas, a primeira linha, as bordas, aleatório)
      const pick = cut === 0 ? true : cut === 1 ? b.li % 2 === 0 : cut === 2 ? b.hy > ((lay && lay.wordC) || 0) : cut === 3 ? Math.abs(b.hx) > lay.w * 0.3 : Math.random() < 0.4;
      if (!pick) continue;
      b.frag = Math.max(b.frag, amount * (0.6 + 0.4 * v)); b.fragT = t;
      if (Math.random() < amount * 0.6) {
        const k = force * (0.4 + Math.random() * 0.6);
        if (dir === 1) b.vy += k; else if (dir === 2) b.vx += Math.sign(b.hx || 1) * k; else if (dir === 3) b.vy -= k; else if (dir === 4) b.vz -= k * 1.5;
        else { const d = Math.hypot(b.x, b.y) || 1; b.vx += (b.x / d) * k; b.vy += (b.y / d) * k; }
        b.wx += (Math.random() - 0.5) * 8 * amount; b.wy += (Math.random() - 0.5) * 8 * amount;
      }
    }
  }
  function perc(v, c) {
    counts.percs++;
    const s = SC.find((q) => !q.on) || SC.reduce((a, b) => (a.born < b.born ? a : b));
    const t = now(), hw = (lay ? lay.w : 20) / 2, hh = (lay ? lay.h : 8) / 2;
    const spot = (Math.random() * 4) | 0;                                           // em cima, embaixo, nos lados
    s.on = true; s.born = t; s.fam = st5(c.color); s.art = c.shape; s.mode = st5(c.sweep); s.bounce = c.contour; s.frag = c.dist;
    s.life = A(c.decay, [0.6, 1.2, 2.5, 5, 10]); s.col = (Math.random() * 4) | 0; s.s = (0.7 + 0.6 * v) * (1 + c.pitch * 0.3);
    s.x = spot < 2 ? (Math.random() - 0.5) * hw * 2 : (spot === 2 ? -1 : 1) * (hw + 2 + Math.random() * 2);
    s.y = spot === 0 ? hh + 1.2 + Math.random() * 1.2 : spot === 1 ? -hh - 1 - Math.random() * 0.8 : (Math.random() - 0.5) * hh;
    s.z = -1 + Math.random() * 3; s.rot = Math.random() * TAU; s.w = (0.8 + Math.random() * 1.6) * (Math.random() < 0.5 ? -1 : 1);
    s.vx = s.vy = s.vz = 0;
    if (s.mode === 1) s.vy = 1.5 + v * 2; else if (s.mode === 3) s.vx = -Math.sign(s.x || 1) * (2 + v * 3); else if (s.mode === 4) s.vz = -(4 + v * 4);
  }
  function chord(v, c) {
    counts.chords++;
    lastChordT = now(); chordLive = true;
    if (mode === "auto" && word !== 1) setWord(1);                  // o acorde entrou: FESTA LÁ EM CIMA
    const t = now(), lay5 = st5(c.color), n = 1 + Math.round(c.shape * 3), life = A(c.decay, [0.6, 1.2, 2.5, 5, 10]);
    reorgMode = lay5; reorg = Math.min(1, reorg + (0.4 + 0.6 * v) * intensity * legib());   // reorganização das letras
    reorgT = t; reorgArt = c.contour;                                                        // CONTOUR: articulação (letra a letra)
    for (let i = 0; i < n; i++) {
      const g = GH.find((q) => !q.on) || GH.reduce((a, b) => (a.born < b.born ? a : b));
      g.on = true; g.born = t; g.life = life; g.delay = i * (0.06 + c.contour * 0.18); g.cs = (i + 1) % 4; g.wave = c.sweep;
      const k = i + 1;
      const LW = lay ? lay.w : 20, LH = lay ? lay.h : 8;
      if (lay5 === 0) { g.dx = 0; g.dy = LH * (0.62 + 0.5 * k); g.dz = 10 * k; g.s = 0.72; g.rz = 0; }                  // fila subindo pro fundo ("lá em cima")
      else if (lay5 === 1) { g.dx = (k % 2 ? -1 : 1) * LW * 0.42; g.dy = (k < 3 ? 1 : -1) * LH * 0.78; g.dz = 14; g.s = 0.42; g.rz = 0; } // grade nos cantos
      else if (lay5 === 2) { g.dx = (k % 2 ? 1 : -1) * LW * 0.38 * Math.ceil(k / 2); g.dy = LH * 0.35; g.dz = 12 * k; g.s = 0.6; g.rz = 0; g.ry = (k % 2 ? -1 : 1) * 0.55; } // arco
      else if (lay5 === 3) { g.dx = LW * 0.28 * k; g.dy = LH * 0.55 * k; g.dz = 9 * k; g.s = 0.6; g.rz = 0; }        // escada
      else { g.dx = 0; g.dy = LH * 0.15 * k; g.dz = 18 * k; g.s = 1 + k * 0.3; g.rz = k * 0.08; }                      // túnel (bem fundo)
      if (lay5 !== 2) g.ry = 0;
    }
    shearK = c.dist * 0.5;
  }
  // réplicas de delay/reverb: cópias e ecos em perspectiva (nada de rastro transparente)
  function echo(type, v, c) {
    counts.echoes++;
    if (type === "kick") { shocks.push({ t0: now(), v: v * 0.7, life: 0.4 + c.depth * 0.6, kind: family, depth: c.echo === "reverb" ? 0.5 + c.depth : c.replica * 0.25 }); if (shocks.length > 8) shocks.shift(); }
    else if (type === "hat") hat(v * 0.6, c);
    else if (type === "bass") { orb = Math.min(1.4, orb + 0.12 * v); }
    else if (type === "snare") { colorShift = (colorShift + 1) % 4; }
    else if (type === "perc") perc(v * 0.7, c);
    else { // chord (e o resto): uma cópia da palavra mais fundo, menor
      const g = GH.find((q) => !q.on) || GH.reduce((a, b) => (a.born < b.born ? a : b));
      const rev = c.echo === "reverb";
      g.on = true; g.born = now(); g.life = 0.5 + c.replica * 0.15; g.delay = 0; g.cs = c.replica % 4; g.wave = 0; g.ry = 0; g.rz = 0;
      g.dx = 0; g.dy = rev ? 0 : c.replica * 1.5; g.dz = rev ? 20 + c.depth * 40 : c.replica * 6; g.s = rev ? 0.8 : 1;
    }
  }
  function hit(type, amount = 1, c) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    const k = c || { ...PR(type), v };
    if (k.replica) return echo(type, v, k);
    if (type === "kick") kick(v, k); else if (type === "bass") bass(v, k); else if (type === "hat") hat(v, k);
    else if (type === "snare") snare(v, k); else if (type === "perc") perc(v, k); else if (type === "chord") chord(v, k);
  }

  // ---------- movimento ----------
  function update(dt, t) {
    const vis = VIS();
    tickStructure(t);
    if (mode === "auto" && word === 1 && !chordHeld(t)) {
      if (t - lastClockT < 2) pendingSwitch = true;                 // com clock: volta na cabeça do compasso
      else setWord(0);
    }
    chordLive = chordHeld(t);
    deform *= Math.exp(-dt * 2.2); shearK *= Math.exp(-dt * 1.2); wobble *= Math.exp(-dt * 0.9); bgPulse *= Math.exp(-dt * 5);
    reorg *= Math.exp(-dt * 0.9);
    extr += (extrT - extr) * (1 - Math.exp(-dt * 2)); extrT += (1 - extrT) * (1 - Math.exp(-dt * 0.25));
    // câmera: giro e profundidade com mola (CONTOUR do TONE = elasticidade)
    const kc = 9, cz = 2 * Math.sqrt(kc) * orbZeta;
    yawV += (-kc * yaw - cz * yawV) * dt; yaw += yawV * dt;
    pitchV += (-kc * pitch - cz * pitchV) * dt; pitch += pitchV * dt;
    dollyV += (-14 * dolly - 2 * Math.sqrt(14) * 0.8 * dollyV) * dt; dolly += dollyV * dt;
    orb *= Math.exp(-dt * orbDecay); orbPh += dt * (1.2 + orb * 2.5);
    const legal = word === 1 ? 0.35 : 0.6; yaw = clamp(yaw, -legal, legal); pitch = clamp(pitch, -0.35, 0.35); // leitura: nunca de lado demais
    // blocos: mola até a casa (+ órbita do TONE, reorganização do CHORD, LFO)
    const K = springK, C = 2 * Math.sqrt(K) * springZ;
    for (const b of B) {
      if (!b.on) continue;
      if (b.die) { const a = t - b.die; b.w *= Math.exp(-dt * 5); b.h *= Math.exp(-dt * 5); b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.sx += b.wx * dt; b.sy += b.wy * dt; if (a > 0.8 || b.w < 0.02) b.on = false; continue; }
      if (t < b.delay) continue;                                                     // articulação: espera a vez
      let tx = b.hx, ty = b.hy, tz = 0;
      if (orb > 0.01 && !b.grp) { // TONE: órbita / deslocamento de cada letra (o eixo e a trajetória mudam)
        const ph = orbPh + b.li * 0.75, o = orb * (orbMode === 0 ? 1.2 : 2.2);
        if (orbAxis === 0) { tx += Math.cos(ph) * o * 0.5; tz += Math.sin(ph) * o * 2; }
        else if (orbAxis === 1) { ty += Math.cos(ph) * o * 0.6; tz += Math.sin(ph) * o * 2; }
        else if (orbAxis === 2) { tx += Math.cos(ph) * o * 0.6; ty += Math.sin(ph) * o * 0.6; }
        else { tx += Math.cos(ph) * o * 0.5; ty += Math.sin(ph * 2) * o * 0.4; tz += Math.sin(ph) * o * 1.5; }
        if (orbMode >= 3) tz += Math.sin(ph * 0.5 + t) * o;                          // espiral / oito
      }
      if (reorg > 0.01 && !b.grp) { // CHORD: reorganização espacial (em profundidade: a palavra continua legível)
        const i = b.li, r = reorg * (reorgArt > 0.05 ? clamp((t - reorgT - i * reorgArt * 0.09) / 0.12, 0, 1) : 1);
        if (reorgMode === 0) tz += Math.sin(i * 1.3) * r * 3;
        else if (reorgMode === 1) { ty += (i % 2 ? 1 : -1) * r * 0.9; }
        else if (reorgMode === 2) tz += Math.cos(b.hx * 0.25) * r * 4;
        else if (reorgMode === 3) { tz += i * r * 0.9; ty += i * r * 0.15; }
        else tz += -Math.abs(b.hx) * r * 0.35;
      }
      if (vis.artic) ty += Math.sin(t * 3 + b.li * 0.8) * vis.artic * 0.5;
      if (wobble > 0.02 && !b.grp) tz += Math.sin(t * 9 + b.li * 2.1) * wobble * 0.8;
      b.vx += (K * (tx - b.x) - C * b.vx) * dt; b.vy += (K * (ty - b.y) - C * b.vy) * dt; b.vz += (K * (tz - b.z) - C * b.vz) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const ks = 1 - Math.exp(-dt * 10); b.w += (b.hw - b.w) * ks; b.h += (b.hh - b.h) * ks;
      let da = b.ha - b.a; da = Math.atan2(Math.sin(da), Math.cos(da)); b.a += da * ks;
      // giro dos fragmentos: assenta no múltiplo de π mais perto (o bloco volta de frente)
      b.wx *= Math.exp(-dt * 3); b.wy *= Math.exp(-dt * 3); b.sx += b.wx * dt; b.sy += b.wy * dt;
      const qx = Math.round(b.sx / Math.PI) * Math.PI, qy = Math.round(b.sy / Math.PI) * Math.PI;
      b.sx += (qx - b.sx) * (1 - Math.exp(-dt * 4)); b.sy += (qy - b.sy) * (1 - Math.exp(-dt * 4));
      b.frag *= Math.exp(-dt * fragDecay);
    }
    // partículas
    const grav = (vis.gravity || 0) * 6, mag = Math.max(0, vis.magnet || 0);
    for (const p of PT) {
      if (!p.on) continue;
      if (t - p.born > p.life) { p.on = false; continue; }
      if (p.mode === 3) { p.ang += p.w * dt * 0.4; p.rad += dt * 1.2; p.x = Math.cos(p.ang) * p.rad; p.y = Math.sin(p.ang) * p.rad * 0.6; p.z -= dt * 1.5; }
      else { p.vy -= grav * dt; if (mag) { p.vx -= p.x * mag * dt; p.vy -= p.y * mag * dt; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const d = Math.exp(-dt * 0.8); p.vx *= d; p.vy *= d; p.vz *= d; }
      p.rot += p.w * dt;
    }
    // esculturas
    for (const s of SC) {
      if (!s.on) continue;
      if (t - s.born > s.life) { s.on = false; continue; }
      s.rot += s.w * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.mode === 2) { const a = dt * 0.6, ca = Math.cos(a), sa = Math.sin(a), x = s.x, z = s.z; s.x = x * ca - z * sa; s.z = x * sa + z * ca; } // órbita
    }
    for (const g of GH) if (g.on && t - g.born > g.life + g.delay) g.on = false;
    for (let i = shocks.length - 1; i >= 0; i--) if (t - shocks[i].t0 > shocks[i].life) shocks.splice(i, 1);
    // LFO → partículas contínuas entre as notas
    if (vis.frag > 0.05 && Math.random() < vis.frag * dt * 25) hat(0.25 * vis.frag, { ...NEU });
  }

  // ---------- projeção ----------
  let F = 1, D = 70, cx0 = 0, cy0 = 0, cyw = 0, syw = 0, cpw = 1, spw = 0, offX = 0, offY = 0;
  const P3 = [0, 0, 0];
  function proj(x, y, z) { // mundo → tela (giro da palavra em torno do centro, depois a câmera)
    const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
    const y1 = y * cpw - z1 * spw, z2 = y * spw + z1 * cpw;
    const Z = Math.max(0.5, z2 + D + dolly);
    P3[0] = cx0 + offX + (F * x1) / Z; P3[1] = cy0 + offY - (F * y1) / Z; P3[2] = Z;
    return P3;
  }
  // ---------- desenho ----------
  const BV = new Float32Array(24), SV = new Float32Array(16), ZV = new Float32Array(8);
  const FACES = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const FTONE = [0, 0, 2, 1, 1, 2];
  const order = [];
  let colsNow = PALS[0].cols, bgNow = "#ede6d6", inkNow = "#151515", accentNow = "#d3262c";
  // LFO com destino COR: troca discreta (cores sólidas), acompanhando a onda
  let hueShift = 0;
  function colOf(i) { const cs = colsNow, k = i + colorShift + hueShift; let c = cs[k % cs.length]; if (c === bgNow) c = cs[(k + 1) % cs.length]; return c; }
  function drawBox(b, t, gh, flat) {
    // forma (família + deformação) → giro no plano → giro dos fragmentos → posição → (cópia) → tela
    const fam = family, thin = fam === 2 ? 0.55 : 1, dep = (fam === 1 ? 1.3 : fam === 2 ? 0.22 : 0.5) * extr;
    let w = b.w, h = b.h;
    if (w > h) h *= thin; else w *= thin;
    const morph = deform * legib() * (b.grp ? 0.25 : 1); // SHAPE: metamorfose — blocos viram cubos/pontos e voltam
    if (morph > 0.02) { const m = Math.min(w, h); w = lerp(w, m * 1.4, morph * 0.8); h = lerp(h, m * 1.4, morph * 0.8); }
    const vis = VIS(), sc = 1 + (vis.scale || 0) * 0.15;
    w *= sc; h *= sc;
    const ca = Math.cos(b.a), sa = Math.sin(b.a), cxs = Math.cos(b.sx), sxs = Math.sin(b.sx), cys = Math.cos(b.sy), sys = Math.sin(b.sy);
    const shear = (shearK + morph * 0.25 + (vis.geom || 0) * 0.2) * legib();
    const fg = b.frag > 0.03 ? b.frag : 0;
    for (let i = 0; i < 8; i++) {
      let lx = (i & 1) ^ ((i >> 1) & 1) ? w : -w, ly = i & 2 ? h : -h, lz = i & 4 ? dep : -dep;
      let x = lx * ca - ly * sa, y = lx * sa + ly * ca, z = lz;
      if (b.sx) { const y2 = y * cxs - z * sxs; z = y * sxs + z * cxs; y = y2; }
      if (b.sy) { const x2 = x * cys + z * sys; z = -x * sys + z * cys; x = x2; }
      x += b.x + (b.y + y) * shear; y += b.y; z += b.z;
      if (gh) { const gx = x * gh.s, gy = y * gh.s; x = gx * gh.crz - gy * gh.srz + gh.dx; y = gx * gh.srz + gy * gh.crz + gh.dy; const xx = x * gh.cry + z * gh.sry; z = -x * gh.sry + z * gh.cry + gh.dz; x = xx; }
      proj(x, y, z); BV[i * 3] = P3[0]; BV[i * 3 + 1] = P3[1]; BV[i * 3 + 2] = P3[2];
    }
    // cópias (CHORD, delay, reverb) em tons do próprio fundo: ecos sólidos que nunca disputam a leitura com a palavra
    const T = gh ? (gh.cs % 2 ? BGT2 : BGT1) : b.grp === 1 ? tones(inkNow) : b.grp === 2 ? tones(accentNow) : tones(colOf(b.li));
    if (fam === 4 && !gh && !b.grp) return drawDots(b, T, w, h); // pontilhada (estêncil de Bayer)
    for (let f = 0; f < (flat ? 1 : 6); f++) {
      if (b.seg && (f === 2 || f === 3) && !b.frag && !b.sx && !b.sy) continue; // pontas internas do arco: sem costura
      const q = FACES[f];
      const ax = BV[q[1] * 3] - BV[q[0] * 3], ay = BV[q[1] * 3 + 1] - BV[q[0] * 3 + 1], bx = BV[q[3] * 3] - BV[q[0] * 3], by = BV[q[3] * 3 + 1] - BV[q[0] * 3 + 1];
      if (ax * by - ay * bx >= 0) continue; // verso (no sentido da tela)
      ctx.fillStyle = T[FTONE[f]]; ctx.strokeStyle = T[FTONE[f]];
      ctx.beginPath();
      if (fam === 3 && f === 0) roundQuad(q); else { ctx.moveTo(BV[q[0] * 3], BV[q[0] * 3 + 1]); for (let k = 1; k < 4; k++) ctx.lineTo(BV[q[k] * 3], BV[q[k] * 3 + 1]); ctx.closePath(); }
      ctx.fill(); ctx.stroke();
      // DISTORTION da caixa: a frente racha (um corte na cor do fundo atravessando o bloco)
      if (fg && f === 0 && !b.seg) { const k = 0.5 + Math.sin(b.li * 7.3) * 0.2; ctx.strokeStyle = bgNow; ctx.lineWidth = Math.max(1, fg * 3.5); ctx.beginPath(); ctx.moveTo(lerp(BV[q[0] * 3], BV[q[1] * 3], k), lerp(BV[q[0] * 3 + 1], BV[q[1] * 3 + 1], k)); ctx.lineTo(lerp(BV[q[3] * 3], BV[q[2] * 3], 1 - k), lerp(BV[q[3] * 3 + 1], BV[q[2] * 3 + 1], 1 - k)); ctx.stroke(); ctx.lineWidth = 1; }
    }
  }
  function roundQuad(q) { // frente arredondada (família 3): curvas pelos cantos, cor sólida
    const P = (k) => [BV[q[k % 4] * 3], BV[q[k % 4] * 3 + 1]];
    for (let k = 0; k < 4; k++) { const a = P(k), b = P(k + 1), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (k === 0) ctx.moveTo(m[0], m[1]); const c = P(k + 1), n = P(k + 2), m2 = [(c[0] + n[0]) / 2, (c[1] + n[1]) / 2]; ctx.quadraticCurveTo(c[0], c[1], m2[0], m2[1]); }
    ctx.closePath();
  }
  function drawDots(b, T, w, h) { // pontilhado: círculos ao longo do traço
    const long = Math.max(w, h), th = Math.min(w, h), n = Math.max(1, Math.round((long * 2) / (th * 2.1))), ca = Math.cos(b.a), sa = Math.sin(b.a), alongX = w >= h;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * (long - th), lx = alongX ? u : 0, ly = alongX ? 0 : u;
      proj(b.x + lx * ca - ly * sa, b.y + lx * sa + ly * ca, b.z - 0.5);
      const r = (F * th * 0.95) / P3[2];
      ctx.fillStyle = T[2]; ctx.beginPath(); ctx.arc(P3[0] + r * 0.15, P3[1] + r * 0.15, r, 0, TAU); ctx.fill();
      ctx.fillStyle = T[0]; ctx.beginPath(); ctx.arc(P3[0], P3[1], r, 0, TAU); ctx.fill();
    }
  }
  function drawParticle(p, t) {
    proj(p.x, p.y, p.z); if (P3[2] < 1) return;
    const k = 1 - Math.max(0, (t - p.born - p.life * 0.6) / (p.life * 0.4));
    const r = Math.max(0.8, (F * p.s * k) / P3[2]);
    let x = P3[0], y = P3[1];
    if (p.vib > 0.05) { x += (Math.random() - 0.5) * p.vib * r * 2; y += (Math.random() - 0.5) * p.vib * r * 2; }
    if (x < -r * 3 || x > W + r * 3 || y < -r * 3 || y > H + r * 3) return;
    const T = tones(colOf(p.col)), c = Math.cos(p.rot), s = Math.sin(p.rot), o = Math.max(1, r * 0.18);
    for (const [fill, dx] of [[T[2], o], [T[0], 0]]) { // espessura sólida (um tom abaixo, deslocada) + frente
      ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.beginPath();
      const X = x + dx, Y = y + dx;
      if (p.kind === 1) ctx.arc(X, Y, r, 0, TAU);
      else if (p.kind === 2) { for (let i = 0; i < 3; i++) { const a = p.rot + (i / 3) * TAU; ctx[i ? "lineTo" : "moveTo"](X + Math.cos(a) * r * 1.2, Y + Math.sin(a) * r * 1.2); } ctx.closePath(); }
      else if (p.kind === 3) { ctx.lineWidth = Math.max(1, r * 0.35); ctx.moveTo(X - c * r * 2, Y - s * r * 2); ctx.lineTo(X + c * r * 2, Y + s * r * 2); ctx.stroke(); continue; }
      else if (p.kind === 4) { const a = r * 1.1, b2 = r * 0.35; ctx.moveTo(X + c * a - s * b2, Y + s * a + c * b2); for (const [u, v] of [[a, -b2], [b2, -b2], [b2, -a], [-b2, -a], [-b2, -b2], [-a, -b2], [-a, b2], [-b2, b2], [-b2, a], [b2, a], [b2, b2], [a, b2]]) ctx.lineTo(X + c * u - s * v, Y + s * u + c * v); ctx.closePath(); }
      else { ctx.moveTo(X + c * r - s * r, Y + s * r + c * r); ctx.lineTo(X - c * r - s * r, Y - s * r + c * r); ctx.lineTo(X - c * r + s * r, Y - s * r - c * r); ctx.lineTo(X + c * r + s * r, Y + s * r - c * r); ctx.closePath(); }
      ctx.fill();
    }
    ctx.lineWidth = 1;
  }
  // escultura cinética: base, haste e um elemento no alto (família = combinação de formas)
  function drawSculpture(s, t) {
    const a = t - s.born, grow = Math.min(1, a / 0.25), shrink = Math.min(1, (s.life - a) / 0.35);
    const pop = s.bounce > 0.05 ? 1 + s.bounce * 0.5 * Math.exp(-a * 5) * Math.sin(a * 18) : 1;
    const k = s.s * grow * shrink * pop; if (k <= 0.02) return;
    const fr = s.frag * Math.min(1, a / 0.6) * 1.2, arm = Math.sin(t * 3 + s.rot) * s.art * 0.9, cr = Math.cos(s.rot);
    const c1 = tones(colOf(s.col)), c2 = tones(colOf(s.col + 1)), c3 = tones(colOf(s.col + 2));
    const box = (x, y, z, w, h, T) => { proj(s.x + x * cr, s.y + y, s.z + z); const X = P3[0], Y = P3[1], f = F / P3[2]; const ww = Math.max(1, w * f * Math.max(0.25, Math.abs(cr))), hh = h * f, d = Math.max(1, w * f * 0.35 * Math.abs(Math.sin(s.rot))); ctx.fillStyle = T[1]; ctx.fillRect(X - ww + d, Y - hh - d, ww * 2, hh * 2); ctx.fillStyle = T[0]; ctx.fillRect(X - ww, Y - hh, ww * 2, hh * 2); };
    const disc = (x, y, z, r, T) => { proj(s.x + x * cr, s.y + y, s.z + z); const R = (r * F) / P3[2]; ctx.fillStyle = T[2]; ctx.beginPath(); ctx.ellipse(P3[0] + R * 0.12, P3[1] + R * 0.12, R * Math.max(0.2, Math.abs(cr)), R, 0, 0, TAU); ctx.fill(); ctx.fillStyle = T[0]; ctx.beginPath(); ctx.ellipse(P3[0], P3[1], R * Math.max(0.2, Math.abs(cr)), R, 0, 0, TAU); ctx.fill(); };
    const tri = (x, y, z, r, T) => { proj(s.x + x * cr, s.y + y, s.z + z); const R = (r * F) / P3[2]; ctx.fillStyle = T[0]; ctx.beginPath(); ctx.moveTo(P3[0], P3[1] - R); ctx.lineTo(P3[0] + R * Math.max(0.25, Math.abs(cr)), P3[1] + R * 0.7); ctx.lineTo(P3[0] - R * Math.max(0.25, Math.abs(cr)), P3[1] + R * 0.7); ctx.closePath(); ctx.fill(); };
    const f = s.fam;
    if (f === 0) { box(0, -0.9 * k - fr, 0, 0.7 * k, 0.12 * k, c1); box(0, 0, 0, 0.08 * k, 0.9 * k, c2); disc(arm * k, 1.05 * k + fr, 0, 0.42 * k, c3); }            // Moholy: base, haste, disco
    else if (f === 1) { box(0, -0.6 * k - fr, 0, 0.55 * k, 0.3 * k, c1); box(arm * 0.3 * k, 0.05 * k, 0, 0.38 * k, 0.35 * k, c2); box(-arm * 0.3 * k, 0.6 * k + fr, 0, 0.22 * k, 0.22 * k, c3); } // Schmidt: cubos empilhados
    else if (f === 2) { disc(0, 0.2 * k, 0, 0.55 * k, c1); tri(0.5 * k + fr, -0.4 * k, 0, 0.45 * k, c2); box(-0.2 * k, 0.9 * k + fr, 0, 0.6 * k, 0.05 * k, c3); }        // Kandinsky: círculo, triângulo, linha
    else if (f === 3) { box(0, 0, 0, 0.75 * k, 0.12 * k, c1); disc(-0.4 * k - fr, 0.45 * k, 0, 0.32 * k, c2); box(0.45 * k + arm * 0.2 * k, 0.5 * k + fr, 0, 0.1 * k, 0.4 * k, c3); }   // Bayer: barra e meia-lua
    else { box(-0.5 * k - fr, 0, 0, 0.07 * k, 0.75 * k, c1); box(0.5 * k + fr, 0, 0, 0.07 * k, 0.75 * k, c1); box(0, 0.75 * k + fr, 0, 0.57 * k, 0.07 * k, c2); box(0, -0.2 * k + arm * 0.2 * k, 0, 0.2 * k, 0.2 * k, c3); } // Gropius: moldura e cubo
  }
  function drawShock(sh, t) { // onda de choque do kick: forma geométrica atrás das letras (sólida, afina ao sumir)
    const k = (t - sh.t0) / sh.life; if (k < 0 || k >= 1) return;
    const z = 3 + (sh.depth || 0) * 20, R = (lay ? lay.w : 20) * (0.3 + 0.45 * (1 - Math.pow(1 - k, 3))), lw = Math.max(1, (F / (D + z)) * (0.12 + 0.2 * sh.v) * (1 - k));
    proj(0, 0, z); const X = P3[0], Y = P3[1], r = (R * F) / P3[2];
    ctx.strokeStyle = colOf(3 + (sh.kind % 2)); ctx.lineWidth = lw; ctx.beginPath();
    if (sh.kind === 2) ctx.rect(X - r, Y - r * 0.45, r * 2, r * 0.9);
    else if (sh.kind === 1) { ctx.moveTo(X, Y - r * 0.6); ctx.lineTo(X + r, Y + r * 0.45); ctx.lineTo(X - r, Y + r * 0.45); ctx.closePath(); }
    else ctx.ellipse(X, Y, r, r * 0.48, 0, 0, TAU);
    ctx.stroke(); ctx.lineWidth = 1;
  }
  function drawBackground(t, vis) {
    const P = PALS[pal]; colsNow = P.cols; bgNow = P.bg[bgK];
    inkNow = P.ink === bgNow ? (bgNow === "#151515" ? "#ede6d6" : "#151515") : P.ink;
    accentNow = ["#d3262c", "#f1b70e", "#1d4f9e"].find((c) => c !== bgNow) || "#151515";   // a barra do cartaz
    ctx.fillStyle = bgNow; ctx.fillRect(0, 0, W, H);
    // construção Bauhaus lá no fundo (parallax): o grande círculo, a diagonal e o quadrado
    const hw = lay ? lay.w : 20;
    // (em tons do próprio fundo: a palavra nunca perde contraste; só o quadradinho leva cor)
    const BT = tones(bgNow);
    proj(-hw * 0.28, hw * 0.05, 60); const cr = ((hw * 0.42) * F) / P3[2] * (1 + bgPulse * 0.06);
    ctx.fillStyle = BT[1]; ctx.beginPath(); ctx.arc(P3[0], P3[1], cr, 0, TAU); ctx.fill();
    proj(hw * 1.05, (lay ? lay.h : 8) * 0.62, 45); const x2 = P3[0], y2 = P3[1], s2 = (hw * 0.06 * F) / P3[2]; // fora da área do texto (não entra no vão das letras)
    ctx.fillStyle = tones(colOf(1))[0]; ctx.fillRect(x2 - s2, y2 - s2, s2 * 2, s2 * 2);
    ctx.save(); proj(0, 0, 50); ctx.translate(P3[0], P3[1]); ctx.rotate(-0.42 + yaw * 0.3); ctx.fillStyle = BT[2];
    const L = (hw * 1.6 * F) / P3[2], th = Math.max(2, (0.35 * F) / P3[2]); ctx.fillRect(-L / 2, -th / 2 + (hw * 0.3 * F) / P3[2], L, th); ctx.restore();
  }
  let BGT1 = ["#000", "#000", "#000"], BGT2 = BGT1;
  function render(t) {
    const vis = VIS();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineJoin = "round"; ctx.lineWidth = 1;
    // enquadramento: a palavra cabe com folga (as duas palavras usam a mesma régua → a troca não "pula")
    const fitW = (W * 0.84) / Math.max(lay.w, 18), fitH = (H * 0.6) / Math.max(lay.h, 8), fit = Math.min(fitW, fitH);
    const p = clamp(persp * (1 + (vis.persp || 0) * 0.35), 0.4, 3);
    D = 70 / p; F = fit * D;
    cx0 = W / 2; cy0 = H / 2; offX = (vis.pos || 0) * W * 0.04; offY = 0;
    const yw = yaw + (vis.rot || 0) * 0.18 + Math.sin(t * 0.21) * 0.05 * (word === 1 ? 0.5 : 1), pt = pitch + Math.sin(t * 0.17) * 0.035;
    cyw = Math.cos(yw); syw = Math.sin(yw); cpw = Math.cos(pt); spw = Math.sin(pt);
    hueShift = vis.hue > 0.33 ? 1 : vis.hue < -0.33 ? 3 : 0;
    drawBackground(t, vis);
    { const bt = tones(bgNow); BGT1 = [bt[1], bt[1], bt[2]]; BGT2 = [bt[2], bt[2], bt[1]]; }
    for (const sh of shocks) drawShock(sh, t);
    // cópias (CHORD/delay/reverb): atrás, da mais funda pra frente, só a face da frente
    const ghs = GH.filter((g) => g.on && t - g.born >= g.delay).sort((a, b) => b.dz - a.dz);
    for (const g of ghs) {
      const a = t - g.born - g.delay, k = Math.min(1, a / 0.25) * Math.min(1, (g.life - a) / 0.3);
      if (k <= 0) continue;
      const wv = g.wave ? Math.sin(t * 2 + g.dz) * g.wave * 0.3 : 0;
      const tr = { s: g.s * (0.6 + 0.4 * k), dx: g.dx, dy: g.dy, dz: g.dz + (1 - k) * 10, crz: Math.cos(g.rz + wv), srz: Math.sin(g.rz + wv), cry: Math.cos(g.ry || 0), sry: Math.sin(g.ry || 0), cs: g.cs };
      for (const b of B) if (b.on && !b.die && !b.grp) drawBox(b, t, tr, true);
    }
    // blocos da palavra (de trás pra frente) e esculturas/partículas no meio
    order.length = 0;
    for (let i = 0; i < MAXB; i++) if (B[i].on) order.push(i);
    order.sort((a, b) => B[b].z - B[a].z);
    const behind = [], front = [];
    for (const p2 of PT) if (p2.on) (p2.z > 0.5 ? behind : front).push(p2);
    for (const p2 of behind) drawParticle(p2, t);
    for (const s of SC) if (s.on && s.z >= 0) drawSculpture(s, t);
    for (const i of order) drawBox(B[i], t, null, false);
    for (const s of SC) if (s.on && s.z < 0) drawSculpture(s, t);
    for (const p2 of front) drawParticle(p2, t);
  }

  // ---------- laço ----------
  let last = now(), raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = now(), dt = Math.min(0.05, t - last); last = t;
    if (canvas.hidden) return;
    if (dt > 0) adapt(dt * 1000, t);
    update(dt, t); render(t);
  }
  resize();
  reset();
  raf = requestAnimationFrame(frame);

  function destroy() {
    alive = false; cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("fullscreenchange", resize);
    order.length = 0; shocks.length = 0; toneCache.clear();
  }
  // pra testes: blocos longe da casa (deveriam voltar sempre)
  const dump = () => B.filter((b) => b.on).map((b) => [b.li, +b.hx.toFixed(1), +b.hy.toFixed(1), b.die ? 'die' : '', b.seg ? 's' : '']);
  const strays = () => B.filter((b) => b.on && !b.die && Math.hypot(b.x - b.hx, b.y - b.hy) > 0.6).map((b) => ({ li: b.li, x: +b.x.toFixed(2), hx: +b.hx.toFixed(2), y: +b.y.toFixed(2), hy: +b.hy.toFixed(2), z: +b.z.toFixed(2), delay: +(b.delay - now()).toFixed(2) }));
  const state = () => {
    const boxes = B.reduce((n, b) => n + (b.on ? 1 : 0), 0), parts = PT.reduce((n, p) => n + (p.on ? 1 : 0), 0), scs = SC.reduce((n, s) => n + (s.on ? 1 : 0), 0), ghs = GH.reduce((n, g) => n + (g.on ? 1 : 0), 0);
    return { ...counts, word: TEXTS[word], date: DATE, chord: chordLive, mode, holdBars, bar, barSrc, boxes, particles: parts, sculptures: scs, ghosts: ghs, objects: boxes + parts + scs + ghs, palette: PALS[pal].name, family, intensity, persp, quality: +quality.toFixed(2), deform: +deform.toFixed(2), orb: +orb.toFixed(2), reorg: +reorg.toFixed(2), yaw: +yaw.toFixed(3) };
  };
  return {
    hit, reset, destroy, canvas, state, clock, strays, dump,
    setText: (m) => { m = String(m).toLowerCase(); if (m === "beno") { mode = "beno"; setWord(0); } else if (m === "festa") { mode = "festa"; setWord(1); } else { mode = "auto"; } },
    getText: () => mode,
    nextText: () => { const m = mode === "auto" ? "beno" : mode === "beno" ? "festa" : "auto"; if (m === "beno") { mode = "beno"; setWord(0); } else if (m === "festa") { mode = "festa"; setWord(1); } else mode = "auto"; return mode; },
    setHoldBars: (n) => { if (Number.isFinite(+n) && +n >= 0.25) holdBars = +n; },
    setPhraseBars: (n) => { if (Number.isFinite(+n) && +n >= 0.25) holdBars = +n; }, // (nome antigo)
    setIntensity: (x) => { if (Number.isFinite(+x)) intensity = clamp(+x, 0, 2); },
    setSpeed: (x) => { if (Number.isFinite(+x)) intensity = clamp(+x, 0, 2); },
    setPerspective: (x) => { if (Number.isFinite(+x)) persp = clamp(+x, 0.5, 2.5); },
    setBpm: (b) => { if (b > 30 && b < 300) bpm = b; },
    getSpeed: () => intensity, getPerspective: () => persp,
  };
}
