/* Projeto 4 — INFINITE MICROCOSMOS (030) · FM Engine 2.0

   Uma viagem sem fim num espaço tridimensional Bauhaus: a câmera anda sempre pra frente
   (com um balanço e um giro lentos); pequenos sólidos nascem lá longe, chegam perto, se
   transformam e somem ao atravessar a câmera. Cores chapadas — cada face é UMA cor sólida.
   Com os knobs em 0 a cena é a 030 original; cada knob da pista leva a um lugar novo:
   - KICK   nascem formas lá longe e as do caminho se transformam (metamorfose).
            COLOR paleta das formas novas · SHAPE metamorfose entre sólidos, geometria, objetos,
            símbolos, animais e pessoas · SWEEP direção e trajetória (paradas, à deriva, espiral,
            vindo de frente, órbita) · CONTOUR fluidez da metamorfose (seca → lenta) ·
            DISTORTION torção e fragmentação · DECAY tempo de vida das formas
   - TONE   a viagem ACELERA. SHAPE estica as formas na direção da viagem · SWEEP trajetória da
            câmera (reta, curva, órbita, espiral, oito) · CONTOUR rigidez → fluidez do empurrão
   - METAL  microfragmentos. COLOR quadrado/ponto/disco/agulha/cristal · SHAPE angulosidade ·
            SWEEP explosão/chuva/órbita/vórtice/voo em perspectiva · CONTOUR vibração · DECAY vida
   - SNARE  o fundo muda de cor, as formas mudam juntas de geometria, a rotação se inverte.
            COLOR organização do fundo (liso, 2 campos, 4 campos, horizonte, moldura) · SHAPE
            quantas formas racham e se fragmentam · SWEEP direção da explosão · CONTOUR ruptura
   - CHORD  reorganização coletiva: COLOR distribuição (anel, grade, espiral, linha) · SHAPE
            configuração (formas alternadas do acorde) · SWEEP rotação/ondulação/inversão ·
            CONTOUR articulação → expansão → desmontagem
   - PERC   figuras (geometria, objetos, símbolos, animais, pessoas) andando no chão invisível
   Delay = réplicas da forma em fila na perspectiva; reverb = réplicas sumindo no ponto de fuga.
   A composição nunca recomeça sozinha: só reset() começa de novo.

   Uso:
     const visual = createInfiniteMicrocosmos(canvas);
     visual.hit('kick' | 'bass' | 'hat' | 'snare' | 'chord' | 'perc', força 0–1, ctx?);
     visual.setSpeed(1.5);  visual.setPerspective(340);  visual.setBpm(124);
     visual.reset();  visual.destroy();                                                   */

export function createInfiniteMicrocosmos(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const now = () => performance.now() / 1000;
  const ease = (s) => (s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2);
  const TAU = Math.PI * 2;
  const FM = () => window.CyclesFM;
  const NEU = { color: 0, shape: 0, sweep: 0, contour: 0, decay: 0.5, pitch: 0, pan: 0, level: 0.8, dist: 0, punch: 0, gate: 0, vis: {} };
  const PR = (role) => (FM() ? FM().role(role) : NEU);
  const st5 = (v) => (FM() ? FM().step5(v) : 0);
  const A = (v, st) => (FM() ? FM().anchors(v, st) : st[2]);
  const FIG = () => window.CyclesFigures;

  // ---------- paleta Bauhaus (cada cor com 3 tons sólidos: luz, meio, sombra) ----------
  const PAL = ["#d3262c", "#1d4f9e", "#f1b70e", "#151515", "#ede6d6"]; // vermelho, azul, amarelo, preto, papel
  const BGS = ["#ede6d6", "#151515", "#1d4f9e", "#f1b70e", "#d3262c", "#f6f3ec"]; // fundos (a caixa troca)
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const tone = (h, k) => { const [r, g, b] = hex(h); const f = (c) => Math.round(k < 1 ? c * k : c + (255 - c) * (k - 1)); return `rgb(${f(r)},${f(g)},${f(b)})`; };
  const TONES = PAL.map((h, i) => (i === 3 ? [tone(h, 1), tone(h, 1.12), tone(h, 1.22)] : [tone(h, 1), tone(h, 0.84), tone(h, 0.68)]));
  // cor de uma forma que não pode sumir no fundo: se for igual ao fundo, usa outra
  const ALT = [3, 4, 3, 4, 3];
  // COLOR do kick: paletas das formas novas (0 = a original, todas as cores)
  const PALSETS = [[0, 1, 2, 3, 4], [0, 2, 4], [1, 3, 4], [0, 1, 2], null /* monocromo: uma cor por kick */];

  // ---------- os sólidos: 14 vértices (8 cantos + 6 centros de face), 24 triângulos ----------
  // todos os sólidos usam os mesmos vértices na mesma ordem: a metamorfose é só mover vértices
  const CORN = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const FCEN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const QUADS = [[1, 2, 6, 5, 8], [0, 4, 7, 3, 9], [3, 7, 6, 2, 10], [0, 1, 5, 4, 11], [4, 5, 6, 7, 12], [0, 3, 2, 1, 13]];
  const TRI = [];
  for (const [a, b, c, d, e] of QUADS) TRI.push([a, b, e], [b, c, e], [c, d, e], [d, a, e]);
  const NT = TRI.length; // 24
  const make = (fc, fk) => { const v = new Float32Array(42); CORN.forEach((p, i) => { const q = fc(p); v.set(q, i * 3); }); FCEN.forEach((p, i) => { const q = fk(p); v.set(q, 24 + i * 3); }); return v; };
  const SH = [
    make((p) => p, (p) => p),                                                                     // 0 cubo
    make((p) => p.map((x) => x * 0.4833), (p) => p.map((x) => x * 1.45)),                         // 1 octaedro
    make((p) => (p[0] * p[1] * p[2] > 0 ? p.map((x) => x * 1.25) : p.map((x) => x * 0.42)), (p) => p.map((x) => x * 1.25)), // 2 tetraedro
    make((p) => p.map((x) => x * 0.55), (p) => p.map((x) => x * 2.0)),                            // 3 estrela
    make((p) => p.map((x) => x * 0.7217), (p) => p.map((x) => x * 1.25)),                         // 4 gema (quase esfera)
    make((p) => [p[0] * 1.35, p[1] * 0.2, p[2] * 1.35], (p) => [p[0] * 1.35, p[1] * 0.2, p[2] * 1.35]), // 5 placa
    make((p) => [p[0] * 0.55, p[1] * 0.9, p[2] * 0.55], (p) => [p[0] * 0.75, p[1] * 1.9, p[2] * 0.75]), // 6 fuso
  ];
  // garante a face virada pra fora em todos os triângulos (para esconder o verso)
  for (const t of TRI) {
    const v = SH[0], [a, b, c] = t;
    const ux = v[b * 3] - v[a * 3], uy = v[b * 3 + 1] - v[a * 3 + 1], uz = v[b * 3 + 2] - v[a * 3 + 2];
    const wx = v[c * 3] - v[a * 3], wy = v[c * 3 + 1] - v[a * 3 + 1], wz = v[c * 3 + 2] - v[a * 3 + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const cxm = v[a * 3] + v[b * 3] + v[c * 3], cym = v[a * 3 + 1] + v[b * 3 + 1] + v[c * 3 + 1], czm = v[a * 3 + 2] + v[b * 3 + 2] + v[c * 3 + 2];
    if (nx * cxm + ny * cym + nz * czm < 0) { t[1] = c; t[2] = b; }
  }
  const TRIF = new Int16Array(NT * 3); TRI.forEach((t, i) => TRIF.set(t, i * 3));
  const NSH = SH.length;

  // ---------- tela ----------
  // Resolução se ajusta sozinha pra manter 60 quadros/s: numa tela enorme (5K, 4K em tela
  // cheia) a nitidez baixa um pouco em vez de a animação engasgar; se sobrar fôlego, volta.
  let W = 1, H = 1, DPR = 1, cx = 0, cy = 0, quality = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    const want = Math.min(2, window.devicePixelRatio || 1);
    const cap = Math.sqrt(6e6 / (W * H));            // no máximo ~6 milhões de pixels por quadro
    DPR = Math.max(0.5, Math.min(want, cap) * quality);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    cx = W / 2; cy = H / 2;
  }
  let ftAvg = 16.7, ftT = 0;
  function adapt(dtMs, t) {
    ftAvg += (dtMs - ftAvg) * 0.05;
    if (t - ftT < 2) return;
    ftT = t;
    if (ftAvg > 19 && quality > 0.5) { quality = Math.max(0.5, quality - 0.15); resize(); }      // pesado: menos pixels
    else if (ftAvg < 15.5 && quality < 1) { quality = Math.min(1, quality + 0.1); resize(); }   // folga: mais nítido
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", resize);
  resize();

  // ---------- ajustes ----------
  let speed = 1, persp = 340, bpm = null, bpmT = -9;
  const beat = () => (bpm && now() - bpmT < 4 ? 60 / bpm : 0.5);
  function setSpeed(x) { if (Number.isFinite(+x)) speed = clamp(+x, 0.2, 3); }
  function setPerspective(px) { if (Number.isFinite(+px)) persp = clamp(+px, 150, 900); }
  function setBpm(b) { if (b > 30 && b < 300) { bpm = b; bpmT = now(); } }

  // ---------- mundo (tudo pré-alocado: nada nasce nem morre na memória durante o show) ----------
  const NEAR = 0.5, FAR = 64, BASE = 6; // unidades; BASE = unidades por segundo na velocidade 1
  const MAXO = 90, MAXF = 700;
  const O = Array.from({ length: MAXO }, () => ({
    on: false, x: 0, y: 0, z: 0, s: 1, c: 0, born: 0, ax: 0, ay: 0, az: 0, wx: 0, wy: 0, wz: 0,
    fromV: new Float32Array(42), to: 0, mt: -9, md: 0.25, punch: 0,
    // 2.0: trajetória, figura (metamorfose sólido ↔ figura), vida, torção, alvo do acorde
    vx: 0, vy: 0, vz: 0, orb: 0, fig: -1, figFrom: -1, ft: -9, fd: 0.3, life: 1e9, die: 0, twist: 0, stretch: 0, tx: 0, ty: 0, hasT: false,
  }));
  const F = Array.from({ length: MAXF }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.05, born: 0, life: 0.5, c: 3, a: 0, kind: 0, sides: 4, mode: 0, ox: 0, oy: 0, ang: 0, rad: 0, w: 0, vib: 0, len: 1, dist: 0 }));
  let fNext = 0; // anel dos fragmentos: o mais velho dá lugar ao novo
  let cam, bgI, bgI2, bgMode, rotDir, rollBoost, boost, boostK, stretch, family, counts, mono, layout, slot, und, lastBorn, camW, posS, figs;
  let tonTwist = 0, stretchK = 1.5, layoutT = -9, layoutLife = 1e9, bgT = -9, bgLife = 1e9;
  const V = new Float32Array(42), P = new Float32Array(28), Z = new Float32Array(14); // um sólido de cada vez
  const triZ = new Float32Array(NT), triT = new Int8Array(NT), order = new Int16Array(NT);
  const draw = []; // lista de desenho (reaproveitada)

  function reset() {
    for (const o of O) o.on = false;
    for (const f of F) f.on = false;
    cam = { z: 0, roll: 0, t: 0 };
    bgI = 0; bgI2 = 1; bgMode = 0; rotDir = 1; rollBoost = 0; boost = 0; boostK = 2.6; stretch = 0; family = 0; mono = 0; layout = 0; slot = 0; und = 0;
    camW = [1, 0, 0, 0, 0]; posS = 0; lastBorn = []; tonTwist = 0; stretchK = 1.5; layoutT = -9; layoutLife = 1e9; bgT = -9; bgLife = 1e9;
    counts = { births: 0, morphs: 0, boosts: 0, fragsSent: 0, snares: 0, chords: 0, percs: 0, figures: 0, shattered: 0, echoes: 0, died: 0 };
    if (figs) figs.clear(); else figs = FIG() ? FIG().swarm({ max: 24, size: 0.5 }) : null;
    // começa com algumas formas espalhadas no caminho (a viagem não começa vazia)
    for (let i = 0; i < 30; i++) spawn(0.6, 6 + (i / 30) * (FAR - 6), true);
  }

  function freeObj() { for (const o of O) if (!o.on) return o; let far = O[0]; for (const o of O) if (o.z - cam.z < far.z - cam.z) far = o; return far; }
  function spawn(v, dz, quiet, c) {
    const o = freeObj(), t = now();
    const ang = Math.random() * TAU, rad = 0.4 + Math.pow(Math.random(), 0.85) * 7.5; // umas passam perto do centro, outras pelas bordas
    o.on = true;
    o.x = camX(cam.t) + Math.cos(ang) * rad; o.y = camY(cam.t) + Math.sin(ang) * rad * 0.75;
    o.z = cam.z + (dz ?? FAR - Math.random() * 6);
    o.s = (0.28 + 0.5 * Math.random()) * (0.7 + 0.6 * v);
    o.c = (Math.random() * 5) | 0;
    o.born = quiet ? t - 1 : t;
    o.ax = Math.random() * 6.28; o.ay = Math.random() * 6.28; o.az = Math.random() * 6.28;
    o.wx = (Math.random() - 0.5) * 1.6; o.wy = (Math.random() - 0.5) * 1.6; o.wz = (Math.random() - 0.5) * 1.2;
    o.to = (Math.random() * NSH) | 0; o.fromV.set(SH[o.to]); o.mt = -9; o.punch = 0;
    o.vx = o.vy = o.vz = 0; o.orb = 0; o.fig = -1; o.figFrom = -1; o.ft = -9; o.life = 1e9; o.die = 0; o.twist = 0; o.stretch = 0; o.hasT = false;
    if (c) shapeBirth(o, v, c);
    if (!quiet) counts.births++;
    return o;
  }
  // os knobs do kick dão identidade a cada forma que nasce
  function shapeBirth(o, v, c) {
    // COLOR: paleta
    const ps = st5(c.color);
    if (ps === 4) o.c = mono; else if (ps) { const set = PALSETS[ps]; o.c = set[(Math.random() * set.length) | 0]; }
    // SHAPE: metamorfose — parte das formas nasce como figura (geometria → objetos/símbolos → animais → pessoas)
    if (FIG() && c.shape > 0.12 && Math.random() < 0.25 + c.shape * 0.6) { o.fig = pickFig(c.shape); counts.figures++; }
    // SWEEP: direção e trajetória
    const m = st5(c.sweep), sp = 0.5 + c.sweep * 2.5;
    if (m === 1) { o.vx = (Math.random() < 0.5 ? -1 : 1) * sp; o.vy = (Math.random() - 0.5) * sp * 0.4; }
    else if (m === 2) o.orb = (Math.random() < 0.5 ? -1 : 1) * (0.3 + c.sweep * 0.8);              // espiral em volta do eixo
    else if (m === 3) o.vz = -sp * 2.2;                                                              // vem de frente
    else if (m === 4) { o.orb = 0.9 * (Math.random() < 0.5 ? -1 : 1); o.vy = 0.3 * sp; }           // órbita subindo
    // PITCH: tamanho · PAN: lado · DISTORTION: torção · DECAY: tempo de vida
    o.s *= 1 + c.pitch * 0.45; o.x += c.pan * 3.5; o.twist = c.dist;
    o.life = A(c.decay, [1.5, 4, 10, 30, 1e9]) * (0.8 + 0.4 * Math.random());
    // CHORD: as formas novas seguem a distribuição do último acorde
    if (layout) place(o, slot++);
  }
  function pickFig(shape) {
    const top = Math.min(4, Math.round(shape * 4)), cat = Math.floor(Math.random() * (top + 1));
    return cat * 8 + ((Math.random() * 6) | 0);
  }
  const baseX = (t) => Math.sin(t * 0.11) * 1.1 + Math.sin(t * 0.037) * 0.8; // a câmera passeia devagar
  const baseY = (t) => Math.sin(t * 0.083 + 1.3) * 0.7;
  // TONE SWEEP: trajetória da câmera — reta (original), curva larga, órbita, espiral, oito (mistura suave)
  const camX = (t) => baseX(t) * (1 + camW[1] * 1.6) + camW[2] * 2.2 * Math.cos(t * 0.45) + camW[3] * (1.2 + Math.sin(t * 0.07)) * 2 * Math.cos(t * 0.6) + camW[4] * 2.4 * Math.sin(t * 0.4) + posS * 1.8;
  const camY = (t) => baseY(t) * (1 + camW[1] * 1.6) + camW[2] * 1.6 * Math.sin(t * 0.45) + camW[3] * (1.2 + Math.sin(t * 0.07)) * 1.5 * Math.sin(t * 0.6) + camW[4] * 1.4 * Math.sin(t * 0.8);

  function morph(o, to, dur) {
    // começa EXATAMENTE de onde está (mesmo no meio de outra metamorfose): sem pulo
    const t = now(), k = ease(clamp((t - o.mt) / o.md, 0, 1)), Av = o.fromV, B = SH[o.to];
    for (let i = 0; i < 42; i++) Av[i] += (B[i] - Av[i]) * k;
    o.to = to; o.mt = t; o.md = dur;
  }
  function morphFig(o, fig, dur) { o.figFrom = o.fig; o.fig = fig; o.ft = now(); o.fd = dur; }
  // CHORD: lugar na distribuição (anel, grade, espiral, linha)
  function place(o, i) {
    const kx = camX(cam.t), ky = camY(cam.t);
    let x = 0, y = 0;
    if (layout === 1) { const a = (i / 12) * TAU; x = Math.cos(a) * 4; y = Math.sin(a) * 3; }
    else if (layout === 2) { x = ((i % 5) - 2) * 2.2; y = (((i / 5) | 0) % 4 - 1.5) * 1.9; }
    else if (layout === 3) { const a = i * 0.7; x = Math.cos(a) * (1 + (i % 14) * 0.38); y = Math.sin(a) * (1 + (i % 14) * 0.3); }
    else { x = ((i % 11) - 5) * 0.95; y = (i % 2 ? 1 : -1) * 0.2; }
    o.tx = kx + x; o.ty = ky + y; o.hasT = true;
  }

  // ---------- os instrumentos ----------
  function kick(v, c) {
    const n = 2 + Math.round(3 * v); // 2 a 5 formas novas por kick
    if (st5(c.color) === 4) mono = (mono + 1 + ((Math.random() * 4) | 0)) % 5;
    lastBorn.length = 0;
    for (let i = 0; i < n; i++) lastBorn.push(spawn(v, undefined, false, c));
    // metamorfose: cada forma no caminho vira outra; CONTOUR = fluidez (seca → lenta)
    const d = clamp(beat() * 0.45, 0.12, 0.3) * A(c.contour, [1, 1.8, 3, 5, 8]);
    const t = now();
    for (const o of O) if (o.on && o.born < t) {
      if (o.fig >= 0 || (FIG() && c.shape > 0.12 && Math.random() < c.shape * 0.35)) {
        // figura → outra figura, ou volta a ser sólido (SHAPE baixo)
        morphFig(o, Math.random() < c.shape ? pickFig(c.shape) : -1, d);
      } else { let to = (Math.random() * (NSH - 1)) | 0; if (to >= o.to) to++; morph(o, to, d); }
      counts.morphs++; o.punch = (0.12 + 0.2 * v) * (c.punch ? 1.6 : 1);
      o.twist += (c.dist - o.twist) * 0.6;
    }
    // DISTORTION alta: algumas formas no caminho se fragmentam
    if (c.dist > 0.55) shatter(Math.round((c.dist - 0.5) * 6), 0, 0.6 + c.dist, now());
  }
  function bass(v, c) {
    boost = Math.min(2.2, boost + 0.25 + 0.75 * v); counts.boosts++; // empurrão que vai passando
    boostK = A(c.contour, [2.6, 1.8, 1.1, 0.6, 0.3]);               // CONTOUR: rígido → fluido
    stretch = Math.min(0.9, Math.max(stretch, c.shape * (0.5 + 0.5 * v)));                // SHAPE: estica na direção da viagem
    rollBoost += (c.color - 0.1) * 0.6 * v * rotDir;                 // COLOR: um giro da câmera junto
    tonTwist = Math.max(tonTwist, c.dist);                           // DISTORTION: o espaço torce (todas as formas)
    stretchK = A(c.decay, [4, 2.5, 1.5, 0.7, 0.3]);                  // DECAY: quanto o estiramento dura
    const m = st5(c.sweep);
    for (let i = 0; i < 5; i++) camWT[i] = i === m ? Math.min(1, 0.3 + c.sweep) : 0;
  }
  const camWT = [1, 0, 0, 0, 0];
  function hat(v, c) {
    const t = now(), n = 4 + Math.round(16 * v);
    // de formas que estão na frente da câmera (as mais visíveis)
    const src = [];
    for (const o of O) if (o.on && !o.die) { const dz = o.z - cam.z; if (dz > 3 && dz < 30) src.push(o); }
    const kind = st5(c.color), mode = st5(c.sweep), life = A(c.decay, [0.15, 0.3, 0.52, 1.2, 3]);
    for (let i = 0; i < n; i++) {
      const f = F[fNext]; fNext = (fNext + 1) % MAXF;
      const o = src.length ? src[(Math.random() * src.length) | 0] : null;
      f.on = true; f.born = t; f.life = life * (0.7 + 0.6 * Math.random());
      f.x = o ? o.x : camX(cam.t) + (Math.random() - 0.5) * 4 + c.pan * 3; f.y = o ? o.y : camY(cam.t) + (Math.random() - 0.5) * 3; f.z = o ? o.z : cam.z + 6 + Math.random() * 14;
      const sp = (1.5 + 4 * v) * (0.5 + Math.random()) * (1 + c.contour * 0.8);
      f.mode = mode; f.kind = kind; f.vib = c.contour; f.dist = c.dist; f.sides = c.shape < 0.34 ? 4 : c.shape < 0.67 ? 3 : 5; f.len = 1 + c.shape * 2;
      if (mode === 1) { f.vx = (Math.random() - 0.5) * 0.6; f.vy = -sp; f.vz = 0; }                                    // chuva
      else if (mode === 2) { f.ox = f.x; f.oy = f.y; f.ang = Math.random() * TAU; f.rad = 0.2; f.w = (2 + 4 * v) * (Math.random() < 0.5 ? -1 : 1); f.vx = sp * 0.25; } // órbita
      else if (mode === 3) { f.ang = Math.atan2(f.y - camY(cam.t), f.x - camX(cam.t)); f.rad = Math.hypot(f.x - camX(cam.t), f.y - camY(cam.t)); f.w = 1.5 + 3 * v; f.vz = -sp * 0.4; } // vórtice
      else if (mode === 4) { f.vx = (Math.random() - 0.5) * 0.5; f.vy = (Math.random() - 0.5) * 0.5; f.vz = -sp * 2.5; } // voo em perspectiva
      else { const u = Math.random() * 2 - 1, th = Math.random() * 6.28, q = Math.sqrt(1 - u * u); f.vx = q * Math.cos(th) * sp; f.vy = q * Math.sin(th) * sp; f.vz = u * sp; } // explosão (original)
      f.s = (0.03 + 0.06 * Math.random()) * (0.7 + 0.6 * v) * (1 + c.pitch * 0.4) * [1, 0.8, 1.7, 1.9, 1.8][kind]; // COLOR: família e porte (ponto < quadrado < disco/agulha/cristal)
      f.c = o ? o.c : 3; f.a = Math.random() * 6.28;
    }
    counts.fragsSent += n;
  }
  // formas visíveis que racham e viram fragmentos; dir: 0 radial, 1 lateral, 2 sobe, 3 desce, 4 vem pra câmera
  function shatter(n, dir, force, t) {
    let done = 0;
    for (const o of O) {
      if (done >= n) break;
      if (!o.on || o.die) continue;
      const dz = o.z - cam.z; if (dz < 4 || dz > 28) continue;
      o.die = t; done++; counts.shattered++;
      for (let i = 0; i < 10; i++) {
        const f = F[fNext]; fNext = (fNext + 1) % MAXF;
        f.on = true; f.born = t; f.life = 0.5 + Math.random() * 0.6; f.mode = 0; f.kind = 0; f.vib = 0; f.sides = 4; f.len = 1; f.dist = 0;
        f.x = o.x + (Math.random() - 0.5) * o.s; f.y = o.y + (Math.random() - 0.5) * o.s; f.z = o.z;
        const sp = (1.2 + Math.random() * 2.5) * force, a = Math.random() * TAU;
        f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp; f.vz = (Math.random() - 0.5) * sp;
        if (dir === 1) { f.vx = (f.x > camX(cam.t) ? 1 : -1) * sp * 1.4; f.vy *= 0.3; }
        else if (dir === 2) { f.vy = Math.abs(f.vy) + sp; f.vx *= 0.4; }
        else if (dir === 3) { f.vy = -Math.abs(f.vy) - sp; f.vx *= 0.4; }
        else if (dir === 4) { f.vz = -sp * 2.5; }
        f.s = o.s * (0.12 + Math.random() * 0.12); f.c = o.c; f.a = Math.random() * 6.28;
      }
      counts.fragsSent += 10;
    }
  }
  function snare(v, c) {
    // fundo novo (nunca o mesmo), todas as formas mudam juntas de geometria, rotação invertida
    let b = (Math.random() * (BGS.length - 1)) | 0; if (b >= bgI) b++; bgI = b;
    bgMode = st5(c.color);                                    // COLOR: organização do fundo
    bgT = now(); bgLife = A(c.decay, [0.3, 0.8, 1e9, 1e9, 1e9]); // DECAY curto: o fundo volta ao papel
    if (bgMode) { let b2 = (Math.random() * (BGS.length - 1)) | 0; if (b2 >= bgI) b2++; bgI2 = b2; }
    family = (family + 1 + ((Math.random() * (NSH - 1)) | 0)) % NSH;
    const d = clamp(beat() * 0.3, 0.08, 0.2) * (1 + c.contour);
    const t = now();
    // SHAPE: quantas formas racham · SWEEP: direção da explosão · CONTOUR: força da ruptura
    if (c.shape > 0.1) shatter(Math.round(c.shape * 7), st5(c.sweep), 0.8 + c.contour * 2, t);
    for (const o of O) if (o.on && !o.die) { if (o.fig >= 0) morphFig(o, (o.fig & ~7) | ((o.fig + 1) % 6), d); morph(o, family, d); o.punch = (0.15 + 0.3 * v) * (1 + c.contour * 1.5); }
    rotDir = -rotDir;
    rollBoost += rotDir * c.contour * 1.2;
    counts.snares++;
  }
  function chord(v, c) {
    const t = now();
    layout = st5(c.color); slot = 0;                           // COLOR: distribuição espacial
    layoutT = t; layoutLife = A(c.decay, [1, 2.5, 8, 30, 1e9]);  // DECAY: quanto a formação dura
    const vis = []; for (const o of O) if (o.on && !o.die && o.z - cam.z > 2) vis.push(o);
    vis.sort((a, b) => a.z - b.z);
    const cfg = st5(c.shape), shapes = [[family], [0, 1], [2, 4, 6], [3, 5, 1, 0], [0, 1, 2, 3, 4, 5, 6]][cfg];
    const d = clamp(beat() * 0.5, 0.15, 0.4) * (1 + c.contour * 2);
    vis.forEach((o, i) => {
      if (layout) place(o, i); else o.hasT = false;
      if (c.dist > 0.05) o.twist = Math.max(o.twist, c.dist);   // DISTORTION: a formação inteira torce
      morph(o, shapes[i % shapes.length], d);                    // (as figuras continuam figuras: só mudam de lugar)                    // SHAPE: configuração coletiva
    });
    // SWEEP: rotação → ondulação → inversão
    rollBoost += (0.3 + c.sweep * 1.4) * rotDir * v;
    und = Math.max(und, Math.max(0, c.sweep - 0.3) * 2.2);
    if (c.sweep > 0.8) rotDir = -rotDir;
    // CONTOUR: articulação → expansão → desmontagem
    if (c.contour > 0.3) for (const o of vis) { const kx = camX(cam.t), ky = camY(cam.t); o.vx += (o.x - kx) * c.contour * 0.6; o.vy += (o.y - ky) * c.contour * 0.6; }
    if (c.contour > 0.8) shatter(Math.round((c.contour - 0.75) * 24), 0, 1.5, t);
    counts.chords++;
  }
  function perc(v, c) {
    if (!figs) return;
    const kx = camX(cam.t);
    figs.spawn(c, { x: kx + (Math.random() - 0.5) * 7 + c.pan * 3, y: FLOOR, z: cam.z + 9 + Math.random() * 16, dir: Math.random() < 0.5 ? -1 : 1, vz: (Math.random() - 0.5) * 0.3 }, now());
    counts.percs++;
  }
  const FLOOR = -2.4;
  // réplicas de delay/reverb: a última forma repetida mais fundo na perspectiva (delay = fila;
  // reverb = cada vez menor, sumindo no ponto de fuga)
  function echo(type, v, c) {
    counts.echoes++;
    if (type === "kick" || type === "chord") {
      const src = lastBorn.filter((o) => o.on);
      for (const o of src.slice(0, 2)) {
        const r = spawn(v, undefined, false); counts.births--;
        r.x = o.x; r.y = o.y; r.c = o.c; r.to = o.to; r.fromV.set(SH[o.to]); r.fig = o.fig; r.twist = o.twist; r.life = o.life; r.vx = o.vx; r.vy = o.vy; r.orb = o.orb;
        r.z = c.echo === "reverb" ? Math.min(cam.z + FAR + 6, o.z + 8 + c.depth * 40) : o.z + c.replica * 3.2;
        r.s = o.s * Math.pow(c.echo === "reverb" ? 0.7 : 0.85, c.replica);
      }
    } else if (type === "hat") hat(v * 0.6, c);
    else if (type === "snare") { for (const o of O) if (o.on) o.punch = Math.max(o.punch, 0.1 * v); rollBoost += rotDir * 0.15 * v; }
    else if (type === "bass") boost = Math.min(2.2, boost + 0.15 * v);
    else if (type === "perc") perc(v, c);
  }
  function hit(type, amount = 1, c) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    const k = c || { ...PR(type), v };
    if (k.replica) return echo(type, v, k);
    if (type === "kick") kick(v, k);
    else if (type === "bass") bass(v, k);
    else if (type === "hat") hat(v, k);
    else if (type === "snare") snare(v, k);
    else if (type === "chord") chord(v, k);
    else if (type === "perc") perc(v, k);
  }

  // ---------- movimento ----------
  function update(dt, t) {
    const vis = FM() ? FM().visAll() : null;
    boost *= Math.exp(-dt * boostK);
    stretch *= Math.exp(-dt * stretchK);
    tonTwist *= Math.exp(-dt * 0.8);
    if (layout && t - layoutT > layoutLife) { layout = 0; for (const o of O) o.hasT = false; }  // DECAY do acorde: a formação se solta
    if (bgLife < 1e8 && t - bgT > bgLife && (bgI || bgMode)) { bgI = 0; bgMode = 0; }             // DECAY da caixa: o fundo volta
    und *= Math.exp(-dt * 0.35);
    rollBoost *= Math.exp(-dt * 1.2);
    for (let i = 0; i < 5; i++) camW[i] += (camWT[i] - camW[i]) * (1 - Math.exp(-dt * 0.6)); // trajetória muda devagar
    posS += ((vis ? vis.pos : 0) - posS) * (1 - Math.exp(-dt * 4));
    const vz = BASE * speed * (1 + boost);
    cam.z += vz * dt; cam.t += dt;
    cam.roll += dt * (0.06 * rotDir * (0.5 + speed * 0.5) + rollBoost + (vis ? vis.rot * 0.5 : 0));
    const kx = camX(cam.t), ky = camY(cam.t), magnet = vis ? vis.magnet : 0;
    for (const o of O) {
      if (!o.on) continue;
      if (o.z - cam.z < NEAR) { o.on = false; continue; } // atravessou a câmera: some
      if (!o.die && t - o.born > o.life) { o.die = t; counts.died++; }       // DECAY: fim da vida
      if (o.die && t - o.die > 0.4) { o.on = false; continue; }                  // encolhe e some
      o.ax += o.wx * rotDir * dt; o.ay += o.wy * rotDir * dt; o.az += o.wz * rotDir * dt;
      o.punch *= Math.exp(-dt * 9);
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      o.vx *= Math.exp(-dt * 0.4); o.vy *= Math.exp(-dt * 0.4);
      if (o.orb) { const dx = o.x - kx, dy = o.y - ky, a = o.orb * dt, ca = Math.cos(a), sa = Math.sin(a); o.x = kx + dx * ca - dy * sa; o.y = ky + dx * sa + dy * ca; }
      if (o.hasT) { const k = 1 - Math.exp(-dt * 2.2); o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
      if (magnet) { const k = magnet * dt * 0.5; o.x += (kx - o.x) * k; o.y += (ky - o.y) * k; }
    }
    const grav = vis ? vis.gravity * 6 : 0;
    for (const f of F) {
      if (!f.on) continue;
      if (t - f.born > f.life || f.z - cam.z < NEAR) { f.on = false; continue; }
      if (f.mode === 2) { f.ang += f.w * dt; f.rad += dt * 0.6; f.ox += f.vx * dt; f.x = f.ox + Math.cos(f.ang) * f.rad; f.y = f.oy + Math.sin(f.ang) * f.rad; }
      else if (f.mode === 3) { f.ang += f.w * dt; f.rad = Math.max(0.2, f.rad - dt * 1.2); f.x = kx + Math.cos(f.ang) * f.rad; f.y = ky + Math.sin(f.ang) * f.rad; f.z += f.vz * dt; }
      else { f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; }
      if (grav) f.vy -= grav * dt;
      f.a += 6 * dt * rotDir;
    }
    if (figs) figs.update(dt, t, FLOOR, PR("perc"));
    // LFO → fragmentação contínua (entre as notas)
    if (vis && vis.frag > 0.05 && Math.random() < vis.frag * dt * 20) hat(0.3 * vis.frag, { ...NEU, decay: 0.4 });
  }

  // ---------- desenho ----------
  const LX = -0.45, LY = 0.6, LZ = -0.66; // luz fixa (de cima, da esquerda, da frente): só escolhe o tom
  let fpx = 1, cr = 1, sr = 0, kxD = 0, kyD = 0;
  function background() {
    ctx.fillStyle = BGS[bgI];
    ctx.fillRect(0, 0, W, H);
    if (!bgMode) return;
    ctx.fillStyle = BGS[bgI2];
    // os campos giram com a câmera (o fundo pertence ao espaço, não à tela)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(cam.roll * 0.5);
    const R = Math.hypot(W, H);
    if (bgMode === 1) ctx.fillRect(0, -R, R, 2 * R);                                       // dois campos
    else if (bgMode === 2) { ctx.fillRect(0, -R, R, R); ctx.fillRect(-R, 0, R, R); }        // quatro campos
    else if (bgMode === 3) ctx.fillRect(-R, H * 0.12, 2 * R, R);                            // horizonte
    else { const m = Math.min(W, H) * 0.36; ctx.fillRect(-R, -R, 2 * R, 2 * R); ctx.fillStyle = BGS[bgI]; ctx.fillRect(-m * 1.4, -m, m * 2.8, m * 2); } // moldura
    ctx.restore();
  }
  function render(t) {
    const vis = FM() ? FM().visAll() : null;
    fpx = persp * (Math.min(W, H) / 600) * (1 + (vis ? vis.persp * 0.4 : 0)); // a perspectiva acompanha o tamanho da tela
    cr = Math.cos(cam.roll); sr = Math.sin(cam.roll);
    kxD = camX(cam.t); kyD = camY(cam.t);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    background();
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.75;
    // ordem: do mais longe pro mais perto (formas e fragmentos juntos)
    draw.length = 0;
    for (let i = 0; i < MAXO; i++) if (O[i].on) draw.push(i);
    for (let i = 0; i < MAXF; i++) if (F[i].on) draw.push(MAXO + i);
    draw.sort((a, b) => zOf(b) - zOf(a));
    const bgCol = BGS[bgI], scl = 1 + (vis ? vis.scale * 0.5 : 0), geo = vis ? vis.geom : 0;
    for (const id of draw) {
      if (id < MAXO) drawObj(O[id], t, bgCol, scl, geo);
      else drawFrag(F[id - MAXO], t, bgCol);
    }
    if (figs) figs.draw(ctx, projFig, [PAL[0], PAL[1], PAL[2], bgCol === PAL[3] ? PAL[4] : PAL[3]], tone(PAL[3], 1.3), bgCol, t);
  }
  const projOut = [0, 0, 0];
  function projFig(x, y, z) {
    const dz = z - cam.z; if (dz < NEAR * 2) return null;
    const rx0 = x - kxD, ry0 = y - kyD, rx = rx0 * cr - ry0 * sr, ry = rx0 * sr + ry0 * cr;
    projOut[0] = cx + (fpx * rx) / dz; projOut[1] = cy - (fpx * ry) / dz; projOut[2] = fpx / dz;
    return projOut;
  }
  const zOf = (id) => (id < MAXO ? O[id].z : F[id - MAXO].z);
  const colOf = (c, bgCol) => (PAL[c] === bgCol ? ALT[c] : c);

  function drawObj(o, t, bgCol, scl, geo) {
    const dz = o.z - cam.z;
    if (dz < NEAR || dz > FAR + 8) return;
    // nasce crescendo lá longe; na frente da câmera o tamanho é o de verdade; ao morrer encolhe
    const grow = clamp((t - o.born) / 0.45, 0, 1), dying = o.die ? 1 - clamp((t - o.die) / 0.4, 0, 1) : 1;
    const s0 = o.s * (0.15 + 0.85 * grow) * (1 + o.punch) * dying * scl;
    if (s0 <= 0.001) return;
    const wave = und ? und * Math.sin(o.z * 0.35 + t * 2.2) : 0;
    // metamorfose sólido ↔ figura: um encolhe enquanto o outro cresce (sem transparência)
    const fk = o.ft > 0 ? ease(clamp((t - o.ft) / o.fd, 0, 1)) : 1;
    const solidW = o.fig < 0 ? (o.figFrom < 0 ? 1 : fk) : (o.figFrom < 0 ? 1 - fk : 0);
    if (solidW > 0.02) drawSolid(o, t, bgCol, s0 * solidW, dz, wave, geo);
    if (o.fig >= 0) drawFigure(o, o.fig, s0 * fk, dz, wave, bgCol);
    if (o.figFrom >= 0 && fk < 1 && o.figFrom !== o.fig) drawFigure(o, o.figFrom, s0 * (1 - fk), dz, wave, bgCol);
  }
  function drawFigure(o, fig, s, dz, wave, bgCol) {
    if (s < 0.01) return;
    const x = o.x - kxD, y = o.y + wave - kyD, rx = x * cr - y * sr, ry = x * sr + y * cr;
    const px = cx + (fpx * rx) / dz, py = cy - (fpx * ry) / dz, ps = (fpx * s * 1.2) / dz;
    if (ps < 1 || px < -ps * 2 || px > W + ps * 2 || py < -ps * 2 || py > H + ps * 2) return;
    const parts = FIG().figure((fig / 8) | 0, fig % 8, o.ax * 2, 0.5 + o.twist * 0.5, 0);
    const T = TONES[colOf(o.c, bgCol)];
    // a figura gira em torno do próprio eixo vertical (vira de lado = fica fina): volume sem degradê
    ctx.save(); ctx.translate(px, py); ctx.rotate(-cam.roll + o.az * 0.3); ctx.scale(Math.max(0.12, Math.abs(Math.cos(o.ay))), 1);
    FIG().draw(ctx, parts, 0, 0, ps, o.twist * Math.sin(o.ax) * 0.6, T[0], T[2], Math.max(1, ps * 0.08), bgCol);
    ctx.restore();
  }
  function drawSolid(o, t, bgCol, s, dz, wave, geo) {
    const k = ease(clamp((t - o.mt) / o.md, 0, 1));
    const Av = o.fromV, B = SH[o.to];
    const ca = Math.cos(o.ax), sa = Math.sin(o.ax), cb = Math.cos(o.ay), sb = Math.sin(o.ay), cc = Math.cos(o.az), sc = Math.sin(o.az);
    const tw = (o.twist + geo * 0.5 + tonTwist) * 1.6, st = 1 + stretch;
    // vértices: forma (metamorfose) → torção → giro → posição → câmera (com o giro da câmera) → tela
    for (let i = 0; i < 14; i++) {
      let x = Av[i * 3] + (B[i * 3] - Av[i * 3]) * k, y = Av[i * 3 + 1] + (B[i * 3 + 1] - Av[i * 3 + 1]) * k, z = Av[i * 3 + 2] + (B[i * 3 + 2] - Av[i * 3 + 2]) * k;
      if (tw) { const a = y * tw, c2 = Math.cos(a), s2 = Math.sin(a), x2 = x * c2 - z * s2; z = x * s2 + z * c2; x = x2; } // DISTORTION: torção de verdade
      let y1 = y * ca - z * sa, z1 = y * sa + z * ca; y = y1; z = z1;
      let x1 = x * cb + z * sb; z1 = -x * sb + z * cb; x = x1; z = z1;
      x1 = x * cc - y * sc; y1 = x * sc + y * cc; x = x1; y = y1;
      x = x * s + o.x - kxD; y = y * s + o.y + wave - kyD; z = z * s * st + dz;
      const rx = x * cr - y * sr, ry = x * sr + y * cr;
      V[i * 3] = rx; V[i * 3 + 1] = ry; V[i * 3 + 2] = z;
      const zz = Math.max(z, 0.05);
      P[i * 2] = cx + (fpx * rx) / zz; P[i * 2 + 1] = cy - (fpx * ry) / zz; Z[i] = z;
    }
    // fora da tela? pula
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let i = 0; i < 14; i++) { const px = P[i * 2], py = P[i * 2 + 1]; if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py; }
    if (maxx < 0 || minx > W || maxy < 0 || miny > H) return;
    // faces viradas pra câmera, do fundo pra frente (a estrela é côncava)
    let n = 0;
    for (let j = 0; j < NT; j++) {
      const a = TRIF[j * 3], b = TRIF[j * 3 + 1], c = TRIF[j * 3 + 2];
      if (Z[a] < NEAR * 0.5 || Z[b] < NEAR * 0.5 || Z[c] < NEAR * 0.5) continue;
      const ux = V[b * 3] - V[a * 3], uy = V[b * 3 + 1] - V[a * 3 + 1], uz = V[b * 3 + 2] - V[a * 3 + 2];
      const wx = V[c * 3] - V[a * 3], wy = V[c * 3 + 1] - V[a * 3 + 1], wz = V[c * 3 + 2] - V[a * 3 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (nx * V[a * 3] + ny * V[a * 3 + 1] + nz * V[a * 3 + 2] >= 0) continue; // verso
      const len = Math.hypot(nx, ny, nz) || 1;
      const l = (nx * LX + ny * LY + nz * LZ) / len;
      triT[j] = l > 0.35 ? 0 : l > -0.15 ? 1 : 2;
      triZ[j] = Z[a] + Z[b] + Z[c];
      order[n++] = j;
    }
    for (let i = 1; i < n; i++) { const j = order[i]; let q = i - 1; while (q >= 0 && triZ[order[q]] < triZ[j]) { order[q + 1] = order[q]; q--; } order[q + 1] = j; }
    const T = TONES[colOf(o.c, bgCol)];
    for (let i = 0; i < n; i++) {
      const j = order[i], a = TRIF[j * 3], b = TRIF[j * 3 + 1], c = TRIF[j * 3 + 2];
      const col = T[triT[j]];
      ctx.fillStyle = col; ctx.strokeStyle = col; // contorno da mesma cor: sem frestas entre os triângulos
      ctx.beginPath();
      ctx.moveTo(P[a * 2], P[a * 2 + 1]); ctx.lineTo(P[b * 2], P[b * 2 + 1]); ctx.lineTo(P[c * 2], P[c * 2 + 1]);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawFrag(f, t, bgCol) {
    const dz = f.z - cam.z;
    if (dz < NEAR) return;
    const x = f.x - kxD, y = f.y - kyD;
    const rx = x * cr - y * sr, ry = x * sr + y * cr;
    let px = cx + (fpx * rx) / dz, py = cy - (fpx * ry) / dz;
    const r = Math.max(0.8, (fpx * f.s) / dz) * (1 - clamp((t - f.born) / f.life, 0, 1) * 0.6); // encolhe ao sumir
    if (px < -r * 4 || px > W + r * 4 || py < -r * 4 || py > H + r * 4) return;
    if (f.vib > 0.05) { px += (Math.random() - 0.5) * f.vib * r * 2.5; py += (Math.random() - 0.5) * f.vib * r * 2.5; } // CONTOUR: vibração
    const col = PAL[colOf(f.c, bgCol)];
    ctx.fillStyle = col;
    const c = Math.cos(f.a), s = Math.sin(f.a);
    ctx.beginPath();
    if (f.dist > 0.1) { const L = r * (1.2 + f.dist * 3); ctx.moveTo(px + c * L, py + s * L); ctx.lineTo(px - s * r * 0.9 - c * r * 0.3, py + c * r * 0.9 - s * r * 0.3); ctx.lineTo(px - c * L * 0.35 + s * r * 0.4, py - s * L * 0.35 - c * r * 0.4); } // DISTORTION: estilhaço torto
    else if (f.kind === 1) ctx.arc(px, py, r * 0.6, 0, TAU);                                         // ponto
    else if (f.kind === 2) ctx.ellipse(px, py, r * 1.4, r * 0.5, f.a, 0, TAU);                    // disco
    else if (f.kind === 3) { const L = r * 2.2 * f.len, w = Math.max(0.6, r * 0.22); ctx.moveTo(px + c * L, py + s * L); ctx.lineTo(px - s * w, py + c * w); ctx.lineTo(px - c * L, py - s * L); ctx.lineTo(px + s * w, py - c * w); } // agulha
    else if (f.kind === 4) { const L = r * 1.2 * f.len; ctx.moveTo(px + c * L, py + s * L); ctx.lineTo(px - s * r * 0.6, py + c * r * 0.6); ctx.lineTo(px - c * L * 0.5, py - s * L * 0.5); ctx.lineTo(px + s * r * 0.6, py - c * r * 0.6); } // cristal
    else if (f.sides === 4) { const cr2 = c * r, sr2 = s * r; ctx.moveTo(px + cr2, py + sr2); ctx.lineTo(px - sr2, py + cr2); ctx.lineTo(px - cr2, py - sr2); ctx.lineTo(px + sr2, py - cr2); } // quadradinho girando (original)
    else { const n = f.sides === 3 ? 3 : 10; for (let i = 0; i < n; i++) { const a = f.a + (i / n) * TAU, rr = f.sides === 5 && i % 2 ? r * 0.45 : r * 1.2; ctx[i ? "lineTo" : "moveTo"](px + Math.cos(a) * rr, py + Math.sin(a) * rr); } } // SHAPE: triângulo, estrela
    ctx.closePath(); ctx.fill();
  }

  // ---------- laço ----------
  let last = now(), raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = now(), dt = Math.min(0.05, t - last);
    last = t;
    if (canvas.hidden) return; // aba fechada: não gasta nada (e não acumula tempo)
    if (dt > 0) adapt(dt * 1000, t);
    update(dt, t);
    render(t);
  }
  reset();
  raf = requestAnimationFrame(frame);

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("fullscreenchange", resize);
    draw.length = 0;
    if (figs) figs.clear();
  }

  // pra testes: quantas formas e fragmentos vivos, o empurrão, o fundo, o sentido do giro
  const state = () => {
    const objects = O.reduce((n, o) => n + (o.on ? 1 : 0), 0), frags = F.reduce((n, f) => n + (f.on ? 1 : 0), 0), fg = figs ? figs.active() : 0;
    return {
      ...counts, objects: objects + frags + fg, solids: objects, frags, walkers: fg, figObjs: O.reduce((n, o) => n + (o.on && o.fig >= 0 ? 1 : 0), 0),
      boost: +boost.toFixed(3), bg: bgI, bgMode, rotDir, family, layout, speed, persp, camZ: +cam.z.toFixed(2), quality: +quality.toFixed(2), dpr: +DPR.toFixed(2),
      camPath: camW.map((w) => +w.toFixed(2)).join(","), stretch: +stretch.toFixed(2), und: +und.toFixed(2),
    };
  };
  return { hit, setSpeed, setPerspective, setBpm, reset, destroy, canvas, state, getSpeed: () => speed, getPerspective: () => persp };
}
