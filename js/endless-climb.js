/* Projeto 2 — ESCADA SEM FIM (Endless Climb) · FM Engine 2.0

   A pessoa sobe escadas tridimensionais, um degrau por kick, no 4/4. Cada MÁQUINA do
   Model:Cycles faz uma coisa, e os knobs DAQUELA pista esculpem aquela coisa:
   - KICK   a pessoa anda: um passo igual por kick (pés no meio dos degraus).
            COLOR marcas do impacto · SHAPE compressão/torção/fratura/implosão do corpo no passo ·
            SWEEP expansão do salto e deslocamento · CONTOUR articulação, elasticidade, impacto
   - TONE   a escada sobe (um degrau por nota). COLOR identidade arquitetônica e cromática ·
            SHAPE geometria/inclinação/configuração · SWEEP perspectiva 3D e trajetória ·
            CONTOUR elasticidade da subida · DISTORTION deformação e RUPTURA (penhascos) ·
            DECAY tempo de existência dos degraus (quando acaba, o degrau desaba)
   - SNARE  a pessoa cresce. COLOR eixo/simetria · SHAPE rachaduras e fragmentos · SWEEP direção
            da explosão · CONTOUR intensidade e duração da ruptura
   - METAL  chuva. COLOR agulhas/pontos/esferas/discos/cristais · SHAPE angularidade ·
            SWEEP chuva/órbita/vórtice/fuga em perspectiva · CONTOUR vibração e dispersão
   - CHORD  o fundo muda. COLOR organização (campo/duas faixas/listras/grade/círculos) ·
            SHAPE quantos campos · SWEEP giro e ondulação · CONTOUR articulação da troca
   - PERC   figuras (geometria, objetos, símbolos, animais, pessoas) andam/correm/pulam/voam.
   QUEDA: degrau que falta (ruptura ou decay) é penhasco — a pessoa cai; na queda, o TONE abre o
   paraquedas (e empurra pra frente) e o KICK cria uma plataforma embaixo; ela pousa, se
   recupera e segue. Delay = marcas e degraus-eco em sequência; reverb = réplicas ao fundo.
   API: hit(tipo, força, ctx?) · setBpm · reset · destroy · state                           */

export function createEndlessClimb(canvas) {
  const ctx = canvas.getContext("2d");
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (s) => 1 - Math.pow(1 - s, 3);
  const now = () => performance.now() / 1000;
  const FM = () => window.CyclesFM;
  const Fig = () => window.CyclesFigures;
  const P = (role) => (FM() ? FM().role(role) : NEU);
  const NEU = { color: 0, shape: 0, sweep: 0, contour: 0, decay: 0.5, pitch: 0, pan: 0, level: 0.8, dist: 0, punch: 0, gate: 0, vis: {} };
  const A = (v, st) => (FM() ? FM().anchors(v, st) : st[0]);

  // ---------- tela ----------
  let W = 1, H = 1, DPR = 1, U = 40;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    U = Math.max(10, Math.min(W, H) / 7);
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  // ---------- andamento ----------
  const kickTimes = [], hatTimes = [], snareTimes = [];
  let bpm = null, bpmT = -9;
  function median(times, lo, hi, def) {
    const iv = [];
    for (let i = 1; i < times.length; i++) { const d = times[i] - times[i - 1]; if (d >= lo && d <= hi) iv.push(d); }
    if (!iv.length) return def;
    iv.sort((a, b) => a - b);
    return iv[iv.length >> 1];
  }
  const tap = (arr, t) => { arr.push(t); if (arr.length > 9) arr.shift(); };
  const beatP = () => (bpm && now() - bpmT < 4 ? 60 / bpm : median(kickTimes, 0.18, 1.6, 0.5));
  const hatP = () => median(hatTimes, 0.05, 1.0, 0.25);

  // ---------- mundo: colunas da escada (uma coluna = um degrau = um passo) ----------
  const SW = 0.6, LEG = 0.3, CAM_DX = 1.6, CAM_DY = 1.3;
  let cols, hero, drops, marks, bg, cam, shards, echoes, figs, counts;
  // a coluna c: a construída, ou (se não há) o chão plano que continua o último degrau à esquerda
  // (virtual: acompanha sempre a altura atual daquele degrau, nunca fica pra trás)
  const VIRT = { y: 0, born: -99, rise: 0, dur: 0.1, v: 0, life: Infinity, gone: false, goneT: -9, crack: 0, tilt: 0, style: 0, slab: false, fragile: false, virtual: true };
  function col(c) {
    const k = cols.get(c);
    if (k) return k;
    for (let j = c - 1; j > c - 200; j--) { const q = cols.get(j); if (q) { VIRT.y = q.y; VIRT.style = q.style; return VIRT; } }
    VIRT.y = 0; VIRT.style = 0; return VIRT;
  }
  const solid = (c) => { const k = cols.get(c); return !k || !k.gone; };
  function reset() {
    const t = now();
    cols = new Map();
    for (let c = -14; c <= 0; c++) cols.set(c, { y: 0, born: t - 9, rise: 0, dur: 0.1, v: 0, life: Infinity, gone: false, goneT: -9, crack: 0, tilt: 0, style: 0, slab: false, fragile: false });
    hero = { col: 0, x: -SW / 2, y: 0, feet: [[-SW, 0], [0, 0]], swing: 0, stride: null, footT: -9, footV: 0, footShape: 0, growT: -9, growV: 0, growFrom: 1, growAxis: 0, growCrack: 0, growDist: 0, growDecay: 1,
      state: "walk", vx: 0, vy: 0, chute: false, chuteT: -9, chuteFold: -9, landT: -9, fallT: -9, twist: 0 };
    drops = []; marks = []; shards = []; echoes = [];
    bg = { from: [0, 0, 0], to: [0, 0, 0], t0: -9, dur: 0.02, hue: Math.random() * 360, mode: 0, fields: 1, rot: 0, alt: [0, 0, 0], spin: 0, dist: 0, life: 1e9 };
    cam = { x: hero.x + CAM_DX, y: hero.y + CAM_DY, tilt: 0 };
    kickTimes.length = 0; hatTimes.length = 0; snareTimes.length = 0;
    figs = Fig() ? Fig().swarm({ max: 28, size: 0.28 }) : null;
    counts = { kicks: 0, built: 0, falls: 0, chutes: 0, rescues: 0, crumbles: 0, ruptures: 0, grows: 0, rains: 0, chords: 0, percs: 0, echoes: 0 };
  }
  reset();

  // altura do degrau sob um ponto (a inclinação da DISTORTION entra aqui: o pé acompanha)
  function treadY(x) { const c = Math.round(x / SW), k = cols.get(c); if (!k) return col(c).y; return k.y + Math.tan(k.tilt) * (x - c * SW); }

  // ---------- KICK: um passo ----------
  function finishStride() {
    const s = hero.stride;
    if (!s) return;
    hero.col = s.col;
    hero.feet[hero.swing] = [s.f1[0], treadY(s.f1[0])];
    hero.x = s.x1; hero.y = (hero.feet[0][1] + hero.feet[1][1]) / 2;
    hero.swing ^= 1;
    hero.stride = null;
    // pisou num degrau frágil (ruptura): ele desaba debaixo do pé
    const k = cols.get(hero.col);
    if (k && k.fragile && !k.gone) { k.gone = true; k.goneT = now(); counts.ruptures++; }
    if (k && k.gone) startFall(0.6);
  }
  function walk(v, c) {
    const t = now();
    tap(kickTimes, t);
    if (hero.state === "fall") { rescue(v); return; } // caindo: o kick constrói uma plataforma embaixo
    finishStride();
    if (hero.state === "fall") return;
    hero.footT = t; hero.footV = v; hero.footShape = c.shape; hero.twist = (Math.random() < 0.5 ? -1 : 1) * c.shape;
    const next = hero.col + 1;
    if (!solid(next)) { // penhasco à frente: o passo vai pro vazio
      hero.stride = null; hero.x += SW * 0.6; startFall(0.9 + v); counts.kicks++;
      return;
    }
    const fx = next * SW, fy = treadY(fx);
    const other = hero.feet[hero.swing ^ 1];
    // SWEEP (kick): expansão — o salto fica mais alto e mais longo no ar
    const lift = (0.03 + 0.06 * v) * (1 + c.sweep * 3) * (1 + c.contour * 0.6);
    hero.stride = { col: next, x0: hero.x, y0: hero.y, x1: hero.x + SW, y1: (other[1] + fy) / 2, t0: t, len: SW,
      dur: clamp(beatP() * (0.35 + c.sweep * 0.15) * A(c.decay, [0.6, 0.8, 1, 1.2, 1.4]), 0.08, 0.34), f0: hero.feet[hero.swing], f1: [fx, fy], lift };
    // DECAY (kick) longo: o pé deixa pegadas que duram · DISTORTION: o degrau pisado racha e entorta
    if (c.decay > 0.6) marks.push({ x: fx, y: fy, born: t, v, kind: -1, life: (c.decay - 0.5) * 12 });
    if (c.dist > 0.2) { const k = cols.get(next); if (k) { k.crack = Math.max(k.crack || 0, c.dist); if (!k.tilt) k.tilt = (Math.random() - 0.5) * c.dist * 0.3; } }
    // COLOR (kick): marca geométrica do impacto no degrau (nada no estado original)
    if (c.color > 0.08) marks.push({ x: fx, y: fy, born: t, v, kind: FM() ? FM().step5(c.color) : 0, life: 0.5 + c.decay * 1.2 });
    if (marks.length > 60) marks.shift();
    counts.kicks++;
  }
  function startFall(push) {
    if (hero.state === "fall") return;
    hero.state = "fall"; hero.stride = null; hero.vx = 1.2 + push; hero.vy = 1.6; hero.chute = false; hero.fallT = now(); hero.rescued = false; counts.falls++;
  }
  function rescue(v) { // plataforma de resgate embaixo, um pouco à frente; a escada segue dali
    const t = now();
    if (hero.rescued) return; // uma plataforma por queda (senão ela fugiria pra baixo a cada kick)
    hero.rescued = true; hero.fallT = t;
    const c = Math.round((hero.x + hero.vx * 0.25) / SW), y = hero.y - 1.2 - v * 0.4;
    for (let k = c - 1; k <= c + 1; k++) cols.set(k, { y, born: t, rise: 0.4, dur: 0.12, v, life: Infinity, gone: false, goneT: -9, crack: 0, tilt: 0, style: col(c - 2).style, slab: false, fragile: false });
    for (const [k] of cols) if (k > c + 1) cols.delete(k); // o que estava lá em cima à frente fica pra trás
    counts.rescues++;
  }
  function land(c, t) {
    hero.state = "recover"; hero.landT = t; hero.col = c; hero.x = c * SW - SW / 2; hero.y = col(c).y;
    hero.feet = [[(c - 1) * SW, col(c).y], [c * SW, col(c).y]]; if (!solid(c - 1)) hero.feet[0] = [c * SW - 0.15, col(c).y];
    hero.vx = hero.vy = 0;
    if (hero.chute) { hero.chute = false; hero.chuteFold = t; }
  }

  // ---------- TONE: a escada sobe ----------
  function raise(v, c) {
    const t = now();
    if (hero.state === "fall") { // na queda, o tom abre o paraquedas (e depois empurra pra frente)
      if (!hero.chute) { hero.chute = true; hero.chuteT = t; counts.chutes++; } else hero.vx = Math.min(hero.vx + 0.4 + 1.2 * v, 4);
      return;
    }
    let lastC = hero.col; for (const [k, s] of cols) if (k > lastC && s.born > 0) lastC = Math.max(lastC, k);
    const front = hero.stride ? hero.stride.col : hero.col;
    let cc = Math.max(front + 1, lastC + 1);
    const fit = clamp(Math.floor((W / 2 / U + CAM_DX - 0.6) / SW), 3, 10);
    // SHAPE (tone): geometria — regular → alto → alternado → zigue-zague → lajes soltas
    const shp = c.shape, step = FM() ? FM().step5(shp) : 0;
    let rise = (0.1 + 0.35 * Math.pow(v, 1.1)) * A(shp, [1, 1.55, 1.2, 1, 1.25]) * (1 + c.pitch * 0.5);
    if (step === 2 && cc % 2) rise *= 0.35;               // alternado: um alto, um baixo
    if (step === 3 && Math.random() < 0.4) rise = -rise * 0.7; // zigue-zague: às vezes desce
    const prev = col(cc - 1);
    if (cc - front > fit) { // já tem degraus demais à frente: levanta o último (nunca sai da tela)
      cc = lastC; const k = col(cc), top = hero.y + (H / 2 / U + CAM_DY) * 0.85;
      k.y = Math.min(k.y + Math.abs(rise), Math.max(top, k.y)); k.rise = Math.max(0.06, Math.abs(rise)); k.born = t; k.v = v; k.dur = 0.06 + c.contour * 0.25;
      return;
    }
    // DECAY (tone): quanto tempo o degrau existe (curto → desaba logo: penhascos)
    const life = A(c.decay, [2.5, 6, 20, 60, Infinity]);
    // DISTORTION (tone): degrau torto, rachado e, forte, frágil (desaba quando pisa)
    const dist = c.dist;
    const k = { y: prev.y + rise, born: t, rise, dur: 0.06 + c.contour * 0.3, v, life, gone: false, goneT: -9,
      crack: dist, tilt: dist > 0.05 ? (Math.random() - 0.5) * dist * 0.5 : 0, style: FM() ? FM().step5(c.color) : 0,
      slab: step === 4, fragile: dist > 0.55 && Math.random() < (dist - 0.5) * 0.9 };
    cols.set(cc, k);
    // esquece o que ficou muito pra trás
    for (const [kk] of cols) if (kk < hero.col - 40) cols.delete(kk);
    counts.built++;
  }

  // ---------- METAL: chuva ----------
  function rain(v, c) {
    const t = now();
    tap(hatTimes, t);
    const life = Math.max(0.07, Math.min(0.1 + 0.3 * v, hatP() * 0.9)) * (1 + c.decay * 0.8);
    const n = Math.round((12 + 70 * Math.pow(v, 0.8)) * (0.4 + c.level * 0.7));
    const kind = FM() ? FM().step5(c.color) : 0;           // agulha, ponto, esfera, disco, cristal
    const mode = FM() ? FM().step5(c.sweep) : 0;           // chuva, órbita, vórtice, fuga, chafariz
    for (let k = 0; k < n; k++) {
      drops.push({ x: Math.random() * W, y: Math.random() * H, a0: Math.random() * 6.28, r0: 0.4 + Math.random() * 3,
        len: U * (0.16 + 0.5 * v) * (0.6 + 0.8 * Math.random()), sp: H * (0.9 + 0.8 * v), born: t, life,
        w: 1 + 1.4 * v, kind, mode, ang: c.shape, jit: c.contour, pan: c.pan, dist: c.dist });
    }
    if (drops.length > 2000) drops.splice(0, drops.length - 2000);
    counts.rains++;
  }

  // ---------- SNARE: a pessoa cresce ----------
  const snareP = () => median(snareTimes, 0.12, 3, beatP() * 2);
  function growNow(t) {
    const a = t - hero.growT;
    if (a < 0 || hero.growV <= 0) return 1;
    const top = 1 + Math.pow(hero.growV, 1.2);
    const up = 0.025, back = clamp(snareP() * 0.7, 0.16, 0.6) * (0.6 + hero.growHold) * hero.growDecay;
    if (a < up) return lerp(hero.growFrom, top, easeOut(a / up));
    const k = clamp((a - up) / back, 0, 1);
    return lerp(top, 1, 1 - Math.pow(1 - k, 2));
  }
  function grow(v, c) {
    const t = now();
    tap(snareTimes, t);
    hero.growFrom = growNow(t);
    hero.growT = t; hero.growV = Math.max(0.05, v);
    hero.growAxis = FM() ? FM().step5(c.color) : 0;   // por igual, vertical, horizontal, assimétrico, espelhado
    hero.growCrack = c.shape;                          // rachaduras e fragmentos
    hero.growHold = c.contour + (c.gate ? 1 : 0);      // ruptura mais longa (e GATE sustenta)
    hero.growDist = c.dist;                            // DISTORTION: o corpo crescido entorta (serrilhado)
    hero.growDecay = A(c.decay, [0.4, 0.7, 1, 1.8, 3]); // DECAY: quanto tempo ele fica grande
    // SWEEP (snare): estilhaços na direção da explosão (cima → frente → trás → todas)
    if (c.shape > 0.25 || c.sweep > 0.1) {
      const n = 4 + Math.round(10 * c.shape * v), dir = FM() ? FM().step5(c.sweep) : 0;
      for (let i = 0; i < n; i++) {
        const a = dir === 0 ? Math.PI / 2 + (Math.random() - 0.5) : dir === 1 ? (Math.random() - 0.5) * 0.8 : dir === 2 ? Math.PI + (Math.random() - 0.5) * 0.8 : Math.random() * 6.28;
        const sp = 2 + 4 * v * (0.5 + Math.random());
        shards.push({ x: hero.x, y: hero.y + 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: t, life: 0.5 + c.contour * 0.8, s: 0.05 + Math.random() * 0.08 });
      }
      if (shards.length > 300) shards.splice(0, shards.length - 300);
    }
    counts.grows++;
  }

  // ---------- CHORD: o fundo ----------
  function hsl(h, s, l) { const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }; return [f(0), f(8), f(4)]; }
  function bgNow(t) {
    const k = clamp((t - bg.t0) / bg.dur, 0, 1), back = bg.life < 1e8 ? clamp((t - bg.t0 - bg.life) / 0.3, 0, 1) : 0;
    return bg.from.map((c, i) => lerp(lerp(c, bg.to[i], k), 0, back));
  }
  function changeBg(v, c) {
    const t = now();
    bg.from = bgNow(t);
    bg.hue = (bg.hue + 137.508) % 360;
    bg.to = hsl(bg.hue, 0.65 + 0.25 * v, 0.2 + 0.2 * v);
    bg.alt = hsl((bg.hue + 180) % 360, 0.6, 0.22 + 0.18 * v);
    bg.dur = 0.02 + c.contour * 0.5;                    // CONTOUR: troca seca → troca articulada
    bg.t0 = t;
    bg.mode = FM() ? FM().step5(c.color) : 0;           // campo, duas faixas, listras, grade, círculos
    bg.fields = 1 + Math.round(c.shape * 6);            // SHAPE: quantos campos (configuração do acorde)
    bg.spin = c.sweep;                                  // SWEEP: giro e ondulação
    bg.dist = c.dist;                                   // DISTORTION: o campo racha (faixa serrilhada)
    bg.life = A(c.decay, [0.35, 0.9, 1e9, 1e9, 1e9]);   // DECAY curto: a cor do acorde volta ao escuro
    counts.chords++;
  }

  // ---------- PERC: figuras ----------
  function perc(v, c) {
    if (!figs) return;
    const t = now();
    figs.spawn(c, { x: hero.x + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 2), y: hero.y + 0.6, z: c.pan * 2, dir: 1 }, t);
    counts.percs++;
  }

  // ---------- ecos (DELAY: em sequência à frente; REVERB: ao fundo) ----------
  function echo(type, v, c) {
    const t = now();
    counts.echoes++;
    if (type === "kick") marks.push({ x: (hero.col + c.replica) * SW, y: treadY((hero.col + c.replica) * SW), born: t, v: v * 0.8, kind: Math.max(1, FM() ? FM().step5(c.color) : 1), life: 0.5 });
    else echoes.push({ type, x: hero.x + (c.echo === "reverb" ? 2 + c.replica : c.replica * SW * 1.5), y: hero.y + 0.8 + c.replica * 0.25, born: t, v, depth: c.depth, life: 0.6 + c.space * 1.2 });
    if (echoes.length > 80) echoes.shift();
    if (marks.length > 60) marks.shift();
  }

  function hit(type, amount = 1, c) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    const cx = c || { ...(P(type) || NEU), v };
    if (cx.replica) return echo(type, v, cx);
    if (type === "kick") walk(v, cx);
    else if (type === "bass") raise(v, cx);
    else if (type === "hat") rain(v, cx);
    else if (type === "snare") grow(v, cx);
    else if (type === "chord") changeBg(v, cx);
    else if (type === "perc") perc(v, cx);
  }
  function setBpm(b) { if (b > 30 && b < 300) { bpm = b; bpmT = now(); } }

  // ---------- movimento ----------
  function pose(t) {
    const s = hero.stride;
    if (hero.state === "fall") return { x: hero.x, y: hero.y, feet: [[hero.x - 0.12, hero.y - 0.05], [hero.x + 0.1, hero.y - 0.1]], swingX: null, air: true };
    if (!s) return { x: hero.x, y: hero.y, feet: hero.feet, swingX: null };
    const k = clamp((t - s.t0) / s.dur, 0, 1), e = easeOut(k);
    const x = lerp(s.x0, s.x1, e), y = lerp(s.y0, s.y1, e) + s.lift * Math.sin(Math.PI * k);
    const fx = lerp(s.f0[0], s.f1[0], e);
    const fy = lerp(s.f0[1], s.f1[1], Math.min(1, e * 1.4)) + (0.06 + 0.12 * s.len + Math.max(0, s.f1[1] - s.f0[1]) * 0.6) * Math.sin(Math.PI * k);
    const feet = []; feet[hero.swing] = [fx, fy]; feet[hero.swing ^ 1] = hero.feet[hero.swing ^ 1];
    return { x, y, feet, swingX: fx };
  }
  function update(dt, t) {
    const PK = P("kick"), PT = P("bass"), vis = FM() ? FM().visAll() : {};
    if (hero.stride && t - hero.stride.t0 >= hero.stride.dur) finishStride();
    // degraus que acabaram o tempo (DECAY) ou romperam: desabam (os da frente viram penhasco)
    for (const [kk, s] of cols) {
      if (!s.gone && s.life !== Infinity && t - s.born > s.life && kk !== hero.col) { s.gone = true; s.goneT = t; counts.crumbles++; }
    }
    if (hero.state === "walk" && !hero.stride && !solid(hero.col)) startFall(0.4);
    if (hero.state === "fall") {
      const py = hero.y;
      if (hero.chute) { hero.vy += (-1.1 - hero.vy) * (1 - Math.exp(-dt * 5)); hero.vx += (0.5 - hero.vx) * (1 - Math.exp(-dt * 0.8)); }
      else { hero.vy = Math.max(hero.vy - 20 * (1 + (vis.gravity || 0) * 0.6) * dt, -16); hero.vx *= Math.exp(-dt * 0.3); }
      hero.x += hero.vx * dt; hero.y += hero.vy * dt;
      if (hero.vy < 0) { const c = Math.round(hero.x / SW), k = col(c); if (!k.gone && py >= k.y - 0.02 && hero.y <= k.y) land(c, t); }
      if (hero.state === "fall" && t - hero.fallT > 1.8) { hero.rescued = false; rescue(0.5); } // recuperação: sempre aparece onde pousar
    } else if (hero.state === "recover" && t - hero.landT > 0.3) hero.state = "walk";
    const p = pose(t);
    const k = 1 - Math.exp(-dt * (hero.state === "fall" ? 4 : 4.5));
    cam.x += (p.x + CAM_DX - cam.x) * k;
    cam.y += (p.y + CAM_DY - cam.y) * k;
    // SWEEP (tone): a câmera inclina e a escada ganha profundidade (perspectiva 3D)
    cam.tilt += ((PT.sweep * 0.12 + (vis.rot || 0) * 0.15) - cam.tilt) * (1 - Math.exp(-dt * 3));
    if (drops.length && t - drops[0].born > drops[0].life) drops = drops.filter((d) => t - d.born <= d.life);
    if (shards.length) { for (const s of shards) { s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; } shards = shards.filter((s) => t - s.born < s.life); }
    if (figs) figs.update(dt, t, (x) => treadY(x), P("perc")); // as figuras andam em cima dos degraus
    marks = marks.filter((m) => t - m.born < m.life);
    echoes = echoes.filter((e) => t - e.born < e.life);
    return p;
  }

  // ---------- desenho ----------
  const sx = (x) => W / 2 + (x - cam.x) * U;
  const sy = (y) => H / 2 - (y - cam.y) * U;
  const colY = (k, t) => { const a = clamp((t - k.born) / k.dur, 0, 1), e = 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2); return k.y - k.rise + k.rise * e; };
  // identidades da escada (COLOR do TONE): 0 linhas brancas (original) · 1 papel e tinta · 2 blocos
  // coloridos · 3 blocos pretos com bordas de cor · 4 Mondrian
  const BAU = ["#d3262c", "#1d4f9e", "#f1b70e", "#151515", "#ede6d6"];
  function drawSteps(t, PT, vis) {
    const lw = Math.max(1.5, U * 0.035);
    const depth = (PT.sweep * 0.55 + (vis.persp || 0) * 0.3) * U;   // profundidade 3D da escada
    const c0 = Math.floor((cam.x - W / 2 / U) / SW) - 2, c1 = Math.ceil((cam.x + W / 2 / U) / SW) + 2;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    let prevY = null, prevGone = false;
    for (let c = c0; c <= c1; c++) {
      const k = cols.get(c) || { ...col(c) }, x0 = sx(c * SW - SW / 2), x1 = sx(c * SW + SW / 2);
      const fallK = k.gone ? clamp((t - k.goneT) / 0.6, 0, 1) : 0;
      const yy = colY(k, t) - fallK * fallK * 6;                    // desaba caindo
      const y = sy(yy), st = k.style | 0;
      if (k.gone && fallK >= 1) { prevY = null; prevGone = true; continue; }
      const tl = Math.tan(k.tilt) * SW * U * 0.5;
      // corpo (massa embaixo do degrau) e face de profundidade
      if (!k.slab) {
        ctx.fillStyle = st === 0 ? "rgba(255,255,255,0.07)" : st === 1 ? "#ede6d6" : st === 2 ? BAU[((c % 3) + 3) % 3] : st === 3 ? "#151515" : BAU[((c * 7) % 4 + 4) % 4];
        ctx.beginPath(); ctx.moveTo(x0, y + tl); ctx.lineTo(x1, y - tl); ctx.lineTo(x1, H + 10); ctx.lineTo(x0, H + 10); ctx.closePath(); ctx.fill();
      } else { ctx.fillStyle = st === 0 ? "rgba(255,255,255,0.9)" : BAU[((c % 4) + 4) % 4]; ctx.fillRect(x0, y - tl - lw, x1 - x0, U * 0.18); }
      if (depth > 1) { // tampa do degrau em perspectiva (escada tridimensional)
        ctx.fillStyle = st === 0 ? "rgba(255,255,255,0.16)" : st === 3 ? BAU[((c % 3) + 3) % 3] : "#bfb8a8";
        ctx.beginPath(); ctx.moveTo(x0, y + tl); ctx.lineTo(x1, y - tl); ctx.lineTo(x1 + depth * 0.7, y - tl - depth * 0.5); ctx.lineTo(x0 + depth * 0.7, y + tl - depth * 0.5); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = st === 0 ? "rgba(255,255,255,0.92)" : st === 1 || st === 4 ? "#151515" : st === 3 ? BAU[((c % 3) + 3) % 3] : "#151515";
      ctx.lineWidth = lw * (st === 4 ? 1.6 : 1);
      ctx.beginPath();
      if (prevY != null && !prevGone && !k.slab) { ctx.moveTo(x0, prevY); ctx.lineTo(x0, y + tl); } else ctx.moveTo(x0, y + tl);
      ctx.lineTo(x1, y - tl); ctx.stroke();
      // rachaduras (DISTORTION): zigue-zague preto no degrau
      if (k.crack > 0.12) {
        ctx.strokeStyle = st === 3 ? "#ede6d6" : "#151515"; ctx.lineWidth = Math.max(1, lw * 0.6);
        ctx.beginPath(); let xx = x0 + (x1 - x0) * 0.3, yy2 = y + 2; ctx.moveTo(xx, yy2);
        for (let i = 0; i < 3 + Math.round(k.crack * 4); i++) { xx += (x1 - x0) * 0.1; yy2 += (i % 2 ? -1 : 1) * U * 0.06 * k.crack + U * 0.03; ctx.lineTo(xx, yy2); }
        ctx.stroke();
      }
      // brilho do degrau novo (proporcional à força)
      const age = t - k.born;
      if (age < 0.3 && age >= 0 && !k.gone) { const q = 1 - age / 0.3; ctx.strokeStyle = st === 0 ? `rgba(255,255,255,${(0.35 * q).toFixed(3)})` : "#151515"; ctx.lineWidth = lw * (1 + 4 * k.v * q); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      prevY = y - tl; prevGone = false;
    }
  }
  function knee(h, f, L) {
    let dx = f[0] - h[0], dy = f[1] - h[1], d = Math.hypot(dx, dy) || 1e-6;
    const max = 2 * L * 0.999;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; f = [h[0] + dx, h[1] + dy]; }
    const hh = Math.sqrt(Math.max(0, L * L - (d * d) / 4));
    return [[h[0] + dx / 2 + (dy / d) * hh, h[1] + dy / 2 - (dx / d) * hh], f];
  }
  function drawHero(t, p, PK, vis, ink) {
    const g = growNow(t), ax = hero.growAxis;
    const gx = ax === 2 ? g : ax === 1 ? 1 : ax === 3 ? 1 + (g - 1) * 0.4 : g, gy = ax === 2 ? 1 : ax === 3 ? g * 1.1 : g;
    const art = 1 + PK.contour * 1.2 + (vis.artic || 0) * 0.8;      // CONTOUR (kick): articulação
    const fa = t - hero.footT, impactDur = 0.12 * (1 + PK.contour);
    const dip = (fa < impactDur ? (0.04 + 0.08 * hero.footV) * (1 + PK.contour) * (PK.punch ? 1.5 : 1) * Math.sin((Math.PI * fa) / impactDur) : 0) * gy;
    // SHAPE (kick): no impacto, compressão → torção → fratura → implosão
    const sh = hero.footShape, imp = fa < 0.25 ? 1 - fa / 0.25 : 0;
    const squash = 1 - sh * 0.35 * imp, twist = hero.twist * 0.6 * imp, implode = sh > 0.85 ? 1 - imp * 0.6 : 1;
    const P2 = (x, y) => [sx(x), sy(y)];
    const crouch = hero.state === "recover" ? 0.25 * (1 - clamp((t - hero.landT) / 0.3, 0, 1)) : 0;
    const by = p.y - dip - crouch + (vis.pos || 0) * 0.15;
    const hip = P2(p.x, by + 0.5 * gy * squash * implode);
    const shp = P2(p.x + 0.03 * gx + twist * 0.2, by + 0.82 * gy * squash * implode);
    const head = P2(p.x + 0.05 * gx + twist * 0.3, by + 0.97 * gy * squash * implode);
    const lw = Math.max(2, U * 0.055) * (1 + 0.6 * (Math.max(gx, gy) - 1));
    const a = p.swingX == null ? (hero.state === "fall" ? (hero.chute ? 1.2 : 2.4) : 0) : clamp((p.swingX - p.x) * 1.6 * art, -0.9, 0.9);
    const hand = (ang) => [shp[0] + 0.3 * gx * U * Math.sin(ang), shp[1] + 0.3 * gy * U * Math.cos(ang)];
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const fractured = sh > 0.6 && imp > 0.2; // fratura: o corpo se separa um instante
    const off = fractured ? (sh - 0.6) * U * 0.6 * imp : 0;
    ctx.beginPath();
    for (const ft of p.feet) { const [kn, f] = knee(hip, P2(ft[0], ft[1]), LEG * gy * U); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(kn[0], kn[1]); ctx.lineTo(f[0], f[1]); }
    ctx.moveTo(hip[0], hip[1] - off); ctx.lineTo(shp[0], shp[1] - off);
    const h1 = hand(-a), h2 = hand(a);
    ctx.moveTo(h1[0], h1[1] - off * 1.5); ctx.lineTo(shp[0], shp[1] - off * 1.5); ctx.lineTo(h2[0], h2[1] - off * 1.5);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(head[0], head[1] - off * 2, U * 0.12 * Math.max(gx, gy), 0, Math.PI * 2); ctx.fill();
    // DISTORTION (kick e caixa): o corpo ganha dentes — deformação geométrica, não só tamanho
    const zig = U * (PK.dist * 0.07 + hero.growDist * Math.max(0, g - 1) * 0.12);
    if (zig > 0.6) {
      const teeth = (a0, a1, n) => { const dx = a1[0] - a0[0], dy = a1[1] - a0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L; ctx.beginPath();
        for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 0.5) / n, u2 = (i + 1) / n, sg = i % 2 ? 1 : -1;
          ctx.moveTo(a0[0] + dx * u0, a0[1] + dy * u0 - off); ctx.lineTo(a0[0] + dx * u1 + nx * zig * sg, a0[1] + dy * u1 + ny * zig * sg - off); ctx.lineTo(a0[0] + dx * u2, a0[1] + dy * u2 - off); }
        ctx.fill(); };
      teeth(hip, shp, 5); teeth(shp, h1, 3); teeth(shp, h2, 3);
    }
    // rachaduras da caixa (SHAPE da snare) no corpo crescido
    if (hero.growCrack > 0.2 && g > 1.05) {
      ctx.strokeStyle = ink === "#fff" ? "#151515" : "#ede6d6"; ctx.lineWidth = Math.max(1, lw * 0.35);
      ctx.beginPath(); ctx.moveTo(hip[0] - lw, hip[1]); ctx.lineTo(shp[0] + lw, (hip[1] + shp[1]) / 2); ctx.lineTo(shp[0] - lw, shp[1]); ctx.stroke();
    }
    // paraquedas (abre com o TONE na queda, fecha no pouso)
    let open = 0;
    if (hero.chute) open = clamp((t - hero.chuteT) / 0.3, 0, 1); else if (t - hero.chuteFold < 0.3) open = 1 - (t - hero.chuteFold) / 0.3;
    if (open > 0) {
      const cx = head[0], cy = head[1] - U * 1.1 * open, rx = U * 0.85 * open, ry = U * 0.5 * open;
      ctx.fillStyle = "#d3262c"; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ede6d6"; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.34, ry, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - rx, cy); ctx.lineTo(shp[0], shp[1]); ctx.moveTo(cx + rx, cy); ctx.lineTo(shp[0], shp[1]); ctx.stroke();
    }
  }
  function drawRain(t, ink) {
    ctx.lineCap = "round";
    for (const d of drops) {
      const age = t - d.born, k = 1 - age / d.life;
      if (k <= 0) continue;
      let x, y;
      if (d.mode === 0) { y = d.y + d.sp * age; x = d.x + d.sp * 0.18 * age + d.pan * W * 0.1; }              // chuva
      else if (d.mode === 1 || d.mode === 2) { const a = d.a0 + age * (d.mode === 2 ? 6 : 3), r = d.r0 * U * (d.mode === 2 ? Math.max(0.2, 1 - age / d.life) : 1); x = sx(hero.x) + Math.cos(a) * r; y = sy(hero.y + 0.6) + Math.sin(a) * r * 0.6; } // órbita / vórtice
      else if (d.mode === 3) { const z = 1 + age * 4; x = W / 2 + (d.x - W / 2) * z; y = H / 2 + (d.y - H / 2) * z; } // fuga em perspectiva
      else { x = d.x; y = d.y - d.sp * age * 0.8; }                                                           // chafariz
      x += (Math.random() - 0.5) * d.jit * 6; y += (Math.random() - 0.5) * d.jit * 6;                            // vibração
      if (d.dist > 0.05) x += Math.sin(age * 18 + d.a0 * 3) * d.dist * U * 0.25;                               // DISTORTION: trajetória torta
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = d.w;
      const s = d.len * 0.12 * (0.5 + k);
      if (d.kind === 0) { ctx.beginPath(); ctx.moveTo(x, y); if (d.dist > 0.05) { const z = d.dist * d.len * 0.35; ctx.lineTo(x + z, y + d.len * 0.33); ctx.lineTo(x - z * 0.6, y + d.len * 0.66); } ctx.lineTo(x + d.len * 0.18, y + d.len); ctx.stroke(); } // agulha (entortada pela DISTORTION)
      else if (d.kind === 1) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      else if (d.kind === 2) { ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.fill(); }
      else if (d.kind === 3) { ctx.beginPath(); ctx.ellipse(x, y, s * 1.6, s * 0.5, d.a0, 0, 6.283); ctx.fill(); }
      else { const n = 3 + Math.round(d.ang * 4); ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = d.a0 + (i / n) * 6.283, r = i % 2 && d.ang > 0.5 ? s * 0.5 : s * 1.4; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.fill(); } // cristal
    }
  }
  function drawBg(t, vis) {
    const c = bgNow(t);
    const col0 = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`, col1 = `rgb(${bg.alt[0] | 0},${bg.alt[1] | 0},${bg.alt[2] | 0})`;
    ctx.fillStyle = col0; ctx.fillRect(0, 0, W, H);
    if (bg.to.every((v) => v === 0)) return;
    const R0 = Math.hypot(W, H) / 2;
    if (!bg.mode) {
      // campo liso (original); SWEEP abre um segundo campo que gira devagar, DISTORTION racha o campo
      if ((bg.spin || 0) > 0.1) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(t * 0.25 * bg.spin + (vis.rot || 0) * 0.3); ctx.fillStyle = col1; ctx.fillRect(0, -R0, R0, 2 * R0 * (0.3 + 0.7 * bg.spin)); ctx.restore(); }
      if ((bg.dist || 0) > 0.05) crackBand(t, col1, R0);
      return;
    }
    // organização do acorde (COLOR), quantos campos (SHAPE), giro e ondulação (SWEEP)
    const n = Math.max(2, bg.fields), rot = (bg.spin || 0) * Math.sin(t * 0.4) * 0.6 + (vis.rot || 0) * 0.3;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.fillStyle = col1;
    const R = Math.hypot(W, H) / 2;
    if (bg.mode === 1) ctx.fillRect(0, -R, R, 2 * R);
    else if (bg.mode === 2) for (let i = 0; i < n; i++) if (i % 2) ctx.fillRect(-R + (2 * R * i) / n, -R + Math.sin(t + i) * (bg.spin || 0) * 20, (2 * R) / n, 2 * R);
    else if (bg.mode === 3) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) ctx.fillRect(-R + (2 * R * i) / n, -R + (2 * R * j) / n, (2 * R) / n, (2 * R) / n);
    else { let alt = true; for (let i = n; i > 0; i--) { ctx.fillStyle = alt ? col1 : col0; alt = !alt; ctx.beginPath(); ctx.arc(0, 0, (R * i) / n, 0, 6.283); ctx.fill(); } }
    ctx.restore();
    if ((bg.dist || 0) > 0.05) crackBand(t, col0, R0);
  }
  // faixa serrilhada atravessando o fundo (DISTORTION do chord): cor sólida, sem degradê
  function crackBand(t, col, R) {
    const d = bg.dist, n = 14, amp = H * 0.12 * d, th = H * (0.02 + 0.06 * d);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.35 + Math.sin(bg.hue) * 0.3); ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i <= n; i++) ctx.lineTo(-R + (2 * R * i) / n, ((i * 7919 + (bg.hue | 0)) % 13 / 13 - 0.5) * 2 * amp);
    for (let i = n; i >= 0; i--) ctx.lineTo(-R + (2 * R * i) / n, ((i * 7919 + (bg.hue | 0)) % 13 / 13 - 0.5) * 2 * amp + th * (0.6 + ((i * 31) % 5) / 5));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawMarks(t, ink) {
    for (const m of marks) {
      const a = (t - m.born) / m.life, x = sx(m.x), y = sy(m.y), r = U * (0.08 + 0.12 * m.v) * (1 + a);
      ctx.fillStyle = m.kind < 0 ? ink : ["#d3262c", "#1d4f9e", "#f1b70e", ink][m.kind % 4];
      ctx.beginPath();
      if (m.kind < 0) ctx.rect(x - r * 0.7, y - r * 0.3, r * 1.4, r * 0.3);   // pegada (DECAY do kick)
      else if (m.kind === 1) ctx.arc(x, y - r, r, 0, 6.283);
      else if (m.kind === 2) ctx.rect(x - r, y - 2 * r, 2 * r, 2 * r);
      else if (m.kind === 3) { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.lineTo(x, y - 2 * r); }
      else { for (let i = 0; i < 10; i++) { const aa = (i / 10) * 6.283 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r * 1.1; ctx.lineTo(x + Math.cos(aa) * rr, y - r + Math.sin(aa) * rr); } }
      ctx.closePath(); ctx.fill();
    }
  }
  function drawEchoes(t) {
    for (const e of echoes) {
      const a = (t - e.born) / e.life, s = U * (0.25 + 0.2 * e.v) * (1 - e.depth * 0.6) * (1 - a * 0.5);
      // réplicas sólidas, menores quanto mais no fundo (sem transparência)
      const x = sx(e.x) + e.depth * (W / 2 - sx(e.x)) * 0.5, y = sy(e.y) + e.depth * (H / 2 - sy(e.y)) * 0.5;
      ctx.fillStyle = { bass: "#1d4f9e", hat: "#f1b70e", snare: "#d3262c", chord: "#ede6d6", perc: "#151515" }[e.type] || "#ede6d6";
      if (e.type === "bass") ctx.fillRect(x - s, y - s * 0.25, s * 2, s * 0.5); else { ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, 6.283); ctx.fill(); }
    }
  }
  function draw(t, p) {
    const PT = P("bass"), PK = P("kick"), vis = FM() ? FM().visAll() : {};
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBg(t, vis);
    // inclinação da câmera (SWEEP do tone)
    ctx.translate(W / 2, H / 2); ctx.rotate(-cam.tilt); ctx.translate(-W / 2, -H / 2);
    const light = (bgNow(t)[0] + bgNow(t)[1] + bgNow(t)[2]) / 3 > 140;
    const ink = light ? "#151515" : "#fff";
    drawEchoes(t);
    drawSteps(t, PT, vis);
    drawMarks(t, ink);
    if (figs) figs.draw(ctx, (x, y, z) => [sx(x), sy(y) - z * 2, U * (1 - z * 0.08)], ["#d3262c", "#1d4f9e", "#f1b70e", ink], light ? "#5c5a55" : "#8a8a8a", light ? "#ede6d6" : "#000", t);
    drawHero(t, p, PK, vis, ink);
    ctx.fillStyle = ink;
    for (const s of shards) { const k = 1 - (t - s.born) / s.life; ctx.fillRect(sx(s.x), sy(s.y), U * s.s * k, U * s.s * k); }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawRain(t, ink);
  }

  // ---------- laço ----------
  let last = now(), raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = now(), dt = Math.min(0.05, t - last);
    last = t;
    if (canvas.hidden) return;
    if (Math.abs(canvas.getBoundingClientRect().width - W) > 1) resize();
    const p = update(dt, t);
    draw(t, p);
  }
  raf = requestAnimationFrame(frame);

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    window.removeEventListener("resize", resize);
    if (figs) figs.clear();
  }
  const state = () => {
    let stairs = 0; for (const [, s] of cols) if (!s.gone) stairs += s.y;
    return { ...counts, x: hero.x, y: hero.y, col: hero.col, hero: hero.state, chute: hero.chute, steps: cols.size, stairs: +stairs.toFixed(3), drops: drops.length,
      size: +growNow(now()).toFixed(3), bg: bgNow(now()).map((c) => c | 0), gaps: [...cols.values()].filter((s) => s.gone).length, figures: figs ? figs.active() : 0,
      objects: cols.size + drops.length + marks.length + shards.length + echoes.length + (figs ? figs.active() : 0) };
  };
  return { hit, reset, setBpm, destroy, canvas, state };
}
