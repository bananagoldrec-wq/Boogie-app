/* Projeto 3 — BAUHAUS ORBITAL · ATTRACTION & REPULSION (024) · FM Engine 2.0

   Um sistema Bauhaus em 3D: sol vermelho, quatro ANÉIS tridimensionais inclinados (a câmera
   orbita devagar) e pequenas PARTÍCULAS que orbitam, são ATRAÍDAS e EXPELIDAS — ao mesmo
   tempo, em regiões diferentes do espaço (o kick puxa num hemisfério, a caixa expele no outro).
   Cada máquina é o relógio do seu anel; os knobs DAQUELA pista esculpem o que ela faz:
   - KICK   o sol pulsa e solta uma onda; a lua anda 1/4 de volta; ATRAI as partículas do
            hemisfério de cima. COLOR forma da lua e da onda · SHAPE compressão/torção/fratura/
            implosão do sol · SWEEP expansão da onda · CONTOUR elasticidade da atração
   - TONE   planetas no anel do baixo (corrente que gira um passo por nota). COLOR identidade ·
            SHAPE alongamento/torção · SWEEP trajetória (órbita → espiral) · CONTOUR fluidez
   - SNARE  arco amarelo pula de quarto; EXPELE as partículas do hemisfério de baixo. COLOR
            simetria (1, 2, 4 arcos…) · SHAPE recortes · SWEEP direção · CONTOUR força da ruptura
   - METAL  solta partículas (pontos, esferas, discos, agulhas, cristais = COLOR; SHAPE as
            transforma: esfera → cubo → disco → poliedro → símbolo; SWEEP órbita/vórtice/fuga;
            CONTOUR vibração; DECAY duração das partículas)
   - CHORD  os anéis se reorganizam juntos (configurações coletivas do acorde)
   - PERC   figuras em órbita (geometria, objetos, símbolos, animais, pessoas)
   SWEEP de cada pista inclina/achata o anel dela; DISTORTION rompe o anel em arcos e deforma.
   API: hit(tipo, força, ctx?) · setBpm · reset · destroy · state                             */

export function createBauhausOrbital(canvas) {
  const ctx = canvas.getContext("2d");
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (s) => 1 - Math.pow(1 - s, 3);
  const now = () => performance.now() / 1000;
  const TAU = Math.PI * 2;
  const FM = () => window.CyclesFM;
  const NEU = { color: 0, shape: 0, sweep: 0, contour: 0, decay: 0.5, pitch: 0, pan: 0, level: 0.8, dist: 0, punch: 0, gate: 0, vis: {} };
  const P = (role) => (FM() ? FM().role(role) : NEU);
  const st5 = (v) => (FM() ? FM().step5(v) : 0);
  const PAPER = "#ede6d6", INK = "#151515", RED = "#d3262c", BLUE = "#1d4f9e", YELLOW = "#f1b70e";
  const COLS = [RED, BLUE, YELLOW, INK];

  // ---------- tela ----------
  let W = 1, H = 1, DPR = 1, R = 100, cx = 0, cy = 0, grain = null;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    R = Math.min(W, H) * 0.42; cx = W / 2; cy = H / 2; grain = null;
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  let bpm = null, bpmT = -9;
  const kickTimes = [];
  const beatP = () => { if (bpm && now() - bpmT < 4) return 60 / bpm; const iv = []; for (let i = 1; i < kickTimes.length; i++) { const d = kickTimes[i] - kickTimes[i - 1]; if (d > 0.18 && d < 1.6) iv.push(d); } iv.sort((a, b) => a - b); return iv.length ? iv[iv.length >> 1] : 0.5; };
  const move = () => clamp(beatP() * 0.35, 0.1, 0.22);

  // ---------- 3D: câmera que orbita devagar ----------
  let camA = 0, camE = 0.42;
  const cam = { ca: 1, sa: 0, ce: 1, se: 0, f: 1 };
  function setCam() { cam.ca = Math.cos(camA); cam.sa = Math.sin(camA); cam.ce = Math.cos(camE); cam.se = Math.sin(camE); cam.f = 4.2; }
  // mundo (unidades: o anel de fora tem raio ~1) → tela; devolve [x, y, profundidade, escala]
  const out = [0, 0, 0, 0];
  function proj(x, y, z) {
    const x1 = x * cam.ca - z * cam.sa, z1 = x * cam.sa + z * cam.ca;
    const y2 = y * cam.ce - z1 * cam.se, z2 = y * cam.se + z1 * cam.ce;
    const d = cam.f + z2, k = (cam.f / d) * R;
    out[0] = cx + x1 * k; out[1] = cy - y2 * k; out[2] = z2; out[3] = k;
    return out;
  }

  // ---------- estado ----------
  const RING = { kick: 0.3, bass: 0.55, snare: 0.78, hat: 1.0 };
  const RKEYS = ["kick", "bass", "snare", "hat"];
  const MAXP = 140;
  let S, parts, figs, counts;
  function newRing() { return { tilt: 0, tiltT: 0, ecc: 0, eccT: 0, yaw: 0, broken: 0, chordT: 0 }; }
  function reset() {
    S = {
      kick: { step: 0, from: 0, to: 0, t0: -9, v: 0, dur: 0.15, pulseT: -9, waves: [], shape: 0, kind: 0, sweep: 0 },
      bass: { turn: 0, from: 0, to: 0, t0: -9, dur: 0.15, planets: [], n: 0 },
      snare: { q: -1, arcs: [] },
      rings: { kick: newRing(), bass: newRing(), snare: newRing(), hat: newRing() },
      attract: 0, repel: 0, attractK: 1, repelK: 1, attractDecay: 1.4, chordBreak: 0, chordK: 3, chordDecay: 1.2, chordLife: 1e9,
    };
    parts = Array.from({ length: MAXP }, () => ({ on: false, r: 0.6, a: 0, inc: 0, node: 0, w: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, born: 0, life: 4, kind: 1, shape: 0, s: 0.02, col: 0, free: false }));
    for (let i = 0; i < 40; i++) emit(0.5, { color: 0.25, shape: 0, sweep: 0.25, contour: 0, decay: 1, pitch: 0, dist: 0, pan: 0 }, true);
    figs = window.CyclesFigures ? window.CyclesFigures.swarm({ max: 18, size: 0.07, speed: 0.15 }) : null;
    kickTimes.length = 0;
    counts = { kicks: 0, notes: 0, arcs: 0, emitted: 0, attracts: 0, repels: 0, chords: 0, percs: 0, echoes: 0 };
  }

  // ---------- partículas (as pequenas esferas que orbitam, são atraídas e expelidas) ----------
  function emit(v, c, quiet) {
    const p = parts.find((q) => !q.on) || parts.reduce((a, b) => (a.born < b.born ? a : b));
    const t = now();
    p.on = true; p.free = false; p.born = quiet ? t - Math.random() * 3 : t;
    p.r = 0.25 + Math.random() * 0.85 * (1 + c.pitch * 0.3); p.a = Math.random() * TAU;
    p.inc = (Math.random() - 0.5) * (0.4 + c.sweep * 2.4); p.node = Math.random() * TAU;
    p.w = (0.25 + Math.random() * 0.35) / Math.pow(p.r, 1.2);
    p.kind = st5(c.color); p.shape = c.shape; p.s = 0.006 + 0.011 * v + Math.random() * 0.006;
    p.col = (Math.random() * 4) | 0; p.life = A(c.decay, [1.2, 3, 7, 14, 40]); p.vib = c.contour; p.mode = st5(c.sweep);
    p.vx = p.vy = p.vz = 0;
    if (p.mode === 4 && !quiet) { // chuva: cai de cima, atravessa o sistema e é capturada numa órbita
      p.free = true; p.freeT = t; p.x = (Math.random() - 0.5) * 1.6; p.z = (Math.random() - 0.5) * 1.6; p.y = 1.1 + Math.random() * 0.4; p.vy = -0.9 - v;
    }
    if (!quiet) counts.emitted++;
    return p;
  }
  const A = (v, st) => (FM() ? FM().anchors(v, st) : st[0]);

  // ---------- instrumentos ----------
  function kick(v, c) {
    const t = now(), K = S.kick;
    kickTimes.push(t); if (kickTimes.length > 9) kickTimes.shift();
    K.from = angNow(K, t); K.step++; K.to = K.step * (TAU / 4); K.t0 = t; K.dur = move(); K.v = v;
    K.pulseT = t; K.shape = c.shape; K.kind = st5(c.color); K.sweep = c.sweep; K.punch = c.punch;
    K.waves.push({ t0: t, v, kind: K.kind, reach: 0.6 + c.sweep * 0.8, dur: 0.32 * A(c.decay, [0.4, 0.7, 1, 2, 4]) }); if (K.waves.length > 6) K.waves.shift();
    S.attractDecay = A(c.decay, [3, 2, 1.4, 0.7, 0.3]); K.dist = c.dist;
    // ATRAÇÃO (hemisfério de cima): força com a elasticidade do CONTOUR
    S.attract = Math.min(3, S.attract + 0.8 + 1.6 * v); S.attractK = 0.4 + c.contour * 1.6;
    counts.kicks++; counts.attracts++;
  }
  function bass(v, c) {
    const t = now(), B = S.bass;
    B.from = angNow(B, t); B.turn++; B.to = B.turn * (TAU / 16); B.t0 = t; B.dur = move() * (1 + c.contour);
    B.planets.push({ a: -Math.PI / 2 - B.to, n: B.n++, born: t, v, shape: c.shape, kind: st5(c.color), spiral: c.sweep, pitch: c.pitch, dist: c.dist, life: A(c.decay, [1.2, 3, 1e9, 1e9, 1e9]) });
    if (B.planets.length > 14) B.planets.shift();
    counts.notes++;
  }
  function snare(v, c) {
    const t = now(), N = S.snare;
    N.q = (N.q + 1) % 4;
    // COLOR: organização — 1 arco, 2 opostos, 4 em cruz, assimétrico, 8 fatias
    const sym = st5(c.color), qs = sym === 1 ? [N.q, N.q + 2] : sym === 2 ? [0, 1, 2, 3] : sym === 3 ? [N.q, N.q + 1.5] : sym === 4 ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [N.q];
    for (const q of qs) N.arcs.push({ q, born: t, v, cut: c.shape, span: sym === 4 ? 0.5 : 1, life: A(c.decay, [0.4, 0.8, 1.6, 4, 10]) });
    if (N.arcs.length > 12) N.arcs.splice(0, N.arcs.length - 12);
    // EXPULSÃO (hemisfério de baixo): direção pelo SWEEP, força pelo CONTOUR
    S.repel = Math.min(3, S.repel + 1 + 2 * v); S.repelK = 0.5 + c.contour * 2; S.repelDir = st5(c.sweep);
    for (const p of parts) if (p.on && !p.free && p.y < 0.05) { // as do hemisfério de baixo saem voando
      const d = Math.hypot(p.x, p.y, p.z) || 1, k = (0.6 + 1.2 * v) * S.repelK;
      const dir = S.repelDir;
      if (!p.free) p.freeT = now();
      p.free = true;
      p.vx = (dir === 1 ? -p.z : p.x) / d * k; p.vz = (dir === 1 ? p.x : p.z) / d * k;
      p.vy = dir === 2 ? -k : dir === 3 ? k : (p.y / d) * k;
    }
    counts.arcs++; counts.repels++;
  }
  function hat(v, c) {
    const n = 2 + Math.round(5 * v);
    for (let i = 0; i < n; i++) emit(v, c);
  }
  function chord(v, c) {
    // os anéis se reorganizam juntos: inclinações e excentricidades do "acorde" (SHAPE escolhe)
    const cfg = st5(c.shape), t = now();
    RKEYS.forEach((k, i) => {
      const r = S.rings[k];
      r.tiltT = [0, 0.5 * (i % 2 ? 1 : -1), i * 0.35, 0.8 * Math.sin(i * 1.7), (i - 1.5) * 0.6][cfg] * (0.5 + v);
      r.eccT = c.color * 0.5 * (i % 2 ? 1 : 0.4);
      r.chordT = t; r.spin = c.sweep * (i % 2 ? 1 : -1);
    });
    S.chordK = A(c.contour, [3, 2, 1.2, 0.6, 0.3]);                 // CONTOUR: articulação (rápida → lenta, elástica)
    RKEYS.forEach((k, i) => { const r = S.rings[k]; r.amp = c.contour * 0.22 * v * (i % 2 ? 1 : -1); r.ampT = t; }); // e os anéis respiram (mola)
    S.chordBreak = Math.max(S.chordBreak, c.dist);                   // DISTORTION: todos os anéis se rompem juntos
    S.chordDecay = A(c.decay, [3, 1.8, 1.2, 0.6, 0.25]);
    S.chordLife = A(c.decay, [0.6, 1.5, 1e9, 1e9, 1e9]);             // DECAY curto: os anéis voltam ao lugar
    counts.chords++;
  }
  function perc(v, c) {
    if (!figs) return;
    const a = Math.random() * TAU, r = 0.5 + Math.random() * 0.5;
    figs.spawn(c, { x: Math.cos(a) * r, y: 0.05, z: Math.sin(a) * r, dir: Math.random() < 0.5 ? -1 : 1, vz: (Math.random() - 0.5) }, now());
    counts.percs++;
  }
  function hit(type, amount = 1, c) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    const k = c || { ...P(type), v };
    // réplicas (delay/reverb): só partículas e ondas menores, cada vez mais longe (perspectiva)
    if (k.replica) {
      counts.echoes++;
      if (type === "kick") { S.kick.waves.push({ t0: now(), v: v * 0.7, kind: S.kick.kind, reach: 0.6 + k.replica * 0.15 }); if (S.kick.waves.length > 8) S.kick.waves.shift(); }
      else for (let i = 0; i < 2 + Math.round(4 * v); i++) { const p = emit(v * 0.6, k); p.r = Math.min(1.6, p.r + (k.depth || 0) * 0.8); }
      return;
    }
    if (type === "kick") kick(v, k); else if (type === "bass") bass(v, k); else if (type === "hat") hat(v, k);
    else if (type === "snare") snare(v, k); else if (type === "chord") chord(v, k); else if (type === "perc") perc(v, k);
  }
  function setBpm(b) { if (b > 30 && b < 300) { bpm = b; bpmT = now(); } }
  function angNow(X, t) { const k = clamp((t - X.t0) / X.dur, 0, 1); return lerp(X.from, X.to, easeOut(k)); }

  // ---------- física (contínua) ----------
  function update(dt, t) {
    const vis = FM() ? FM().visAll() : {};
    camA += dt * (0.07 + (vis.rot || 0) * 0.3); camE = 0.42 + Math.sin(t * 0.05) * 0.12 + (vis.persp || 0) * 0.25;
    setCam();
    S.attract *= Math.exp(-dt * (S.attractDecay || 1.4)); S.repel *= Math.exp(-dt * 2.2);
    S.chordBreak *= Math.exp(-dt * (S.chordDecay || 1.2));
    // anéis: inclinação e excentricidade pelo SWEEP da pista dona; ruptura pela DISTORTION
    RKEYS.forEach((k, i) => {
      const r = S.rings[k], p = P(k);
      if (r.chordT > 0 && t - r.chordT > (S.chordLife || 1e9)) { r.tiltT = 0; r.eccT = 0; r.spin = 0; }
      const tgtTilt = clamp((r.tiltT || 0) + p.sweep * (i % 2 ? 0.9 : -0.9) + (vis.geom || 0) * 0.3, -1.25, 1.25), rk = 1 - Math.exp(-dt * (S.chordK || 3));
      r.tilt += (tgtTilt - r.tilt) * rk;
      r.ecc += ((r.eccT || 0) + p.sweep * 0.35 - r.ecc) * rk;
      r.yaw += dt * (r.spin || 0) * 0.6;
      r.broken += (Math.max(p.dist, S.chordBreak * 0.9) - r.broken) * (1 - Math.exp(-dt * 4));
    });
    const magnet = 1 + (vis.magnet || 0);
    for (const p of parts) {
      if (!p.on) continue;
      if (t - p.born > p.life) { p.on = false; continue; }
      if (p.free) { // expelida: voa e volta aos poucos pra uma órbita
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const d = Math.hypot(p.x, p.y, p.z);
        const pull = 0.6 * magnet; p.vx -= (p.x / d) * pull * dt; p.vy -= (p.y / d) * pull * dt; p.vz -= (p.z / d) * pull * dt;
        const damp = Math.exp(-dt * 1.6); p.vx *= damp; p.vy *= damp; p.vz *= damp;
        // capturada de novo numa órbita que passa EXATAMENTE por onde ela está (sem salto):
        // com a = 90°, x = −r·cos(i)·sen(n), z = r·cos(i)·cos(n), y = r·sen(i)
        if (t - p.freeT > 1.2 && d > 0.15 && d < 1.5) { p.free = false; p.r = d; p.a = Math.PI / 2; p.inc = Math.asin(clamp(p.y / d, -1, 1)); p.node = Math.atan2(-p.x, p.z); p.w = (0.25 + Math.random() * 0.3) / Math.pow(d, 1.2); p.mode = 0; }
        if (d > 2.4) p.on = false;
        continue;
      }
      p.a += p.w * dt * (p.mode === 2 ? 2.5 : 1);
      // ATRAÇÃO (hemisfério de cima): o raio encolhe com elasticidade (CONTOUR do kick)
      if (p.y >= 0 && S.attract > 0.02) p.r = Math.max(0.12, p.r - S.attract * S.attractK * 0.18 * dt * magnet);
      if (p.mode === 2) p.r = Math.max(0.12, p.r - dt * 0.05);                // vórtice: espirala pra dentro
      if (p.mode === 3) p.r += dt * 0.25;                                     // fuga em perspectiva
      const ca = Math.cos(p.a) * p.r, sa = Math.sin(p.a) * p.r;
      p.x = ca * Math.cos(p.node) - sa * Math.cos(p.inc) * Math.sin(p.node);
      p.z = ca * Math.sin(p.node) + sa * Math.cos(p.inc) * Math.cos(p.node);
      p.y = sa * Math.sin(p.inc);
      if (p.vib > 0.05) { p.x += (Math.random() - 0.5) * p.vib * 0.02; p.y += (Math.random() - 0.5) * p.vib * 0.02; }
      if (p.r > 2) p.on = false;
    }
    if (figs) { figs.update(dt, t, 0, P("perc")); for (const f of figs.list) if (f.on) { const a = Math.atan2(f.z, f.x) + dt * 0.8, r = Math.hypot(f.x, f.z); f.x = Math.cos(a) * r; f.z = Math.sin(a) * r; } }
  }

  // ---------- desenho ----------
  function paper() {
    if (!grain || grain.width !== canvas.width) {
      grain = document.createElement("canvas"); grain.width = canvas.width; grain.height = canvas.height;
      const g = grain.getContext("2d"); g.fillStyle = PAPER; g.fillRect(0, 0, grain.width, grain.height);
      const img = g.getImageData(0, 0, grain.width, grain.height), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      g.putImageData(img, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(grain, 0, 0); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  // ponto num anel (com inclinação, excentricidade e giro)
  function ringPt(k, a) {
    const r = S.rings[k], ag = now() - (r.ampT || -99), rr = RING[k] * (r.amp ? 1 + r.amp * Math.exp(-ag * 2.2) * Math.sin(ag * 11) : 1), aa = a + r.yaw;
    const x = Math.cos(aa) * rr * (1 + r.ecc), z = Math.sin(aa) * rr * (1 - r.ecc * 0.5);
    const ct = Math.cos(r.tilt), stt = Math.sin(r.tilt);
    return [x, z * stt, z * ct];
  }
  function drawRing(k, front) {
    const r = S.rings[k], n = 72, lw = Math.max(1, R * 0.004);
    ctx.strokeStyle = INK; ctx.lineWidth = lw * (k === "hat" ? 0.8 : 1);
    ctx.beginPath(); let on = false;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      // DISTORTION: o anel se rompe em arcos (falhas regulares que crescem) e se deforma
      const gap = r.broken > 0.05 && (Math.sin(a * (3 + Math.round(r.broken * 5))) > 1 - r.broken * 1.3);
      const p = ringPt(k, a);
      const wob = r.broken * 0.06 * Math.sin(a * 7 + now() * 2);
      const q = proj(p[0] * (1 + wob), p[1], p[2] * (1 + wob));
      const isFront = q[2] < 0;
      if (gap || isFront !== front) { on = false; continue; }
      if (on) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); on = true; }
    }
    ctx.stroke();
  }
  function drawSun(t) {
    const K = S.kick, pa = t - K.pulseT;
    const pulse = pa < 0.28 ? (0.1 + 0.32 * K.v) * (pa < 0.03 ? pa / 0.03 : Math.pow(1 - (pa - 0.03) / 0.25, 2)) * (K.punch ? 1.4 : 1) : 0;
    const q = proj(0, 0, 0), rs = 0.13 * q[3] * (1 + pulse);
    // SHAPE (kick) no impacto: compressão → torção → fratura → implosão
    const imp = pa < 0.3 ? 1 - pa / 0.3 : 0, sh = K.shape;
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(sh > 0.3 ? sh * imp * 0.8 : 0); ctx.scale(1 + sh * imp * 0.3, 1 - sh * imp * 0.35 * (sh > 0.85 ? 2 : 1));
    if (sh > 0.55 && imp > 0.15) { // fratura: o sol em duas metades que se afastam
      const off = (sh - 0.55) * rs * 1.2 * imp;
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(-off, 0, rs, Math.PI / 2, Math.PI * 1.5); ctx.fill(); ctx.beginPath(); ctx.arc(off, 0, rs, -Math.PI / 2, Math.PI / 2); ctx.fill();
    } else if ((K.dist || 0) > 0.1) { // DISTORTION (kick): o sol deforma em coroa serrilhada (geometria, não tamanho)
      const m = 18, d = K.dist;
      for (const [col, k, o] of [["#a81c21", 1, 0], [RED, 0.86, -0.12]]) { ctx.fillStyle = col; ctx.beginPath(); for (let j = 0; j < m; j++) { const aa = (j / m) * TAU + t * 0.3, rr = rs * k * (j % 2 ? 1 - d * 0.35 : 1 + d * 0.15); ctx[j ? "lineTo" : "moveTo"](rs * o + Math.cos(aa) * rr, rs * o + Math.sin(aa) * rr); } ctx.closePath(); ctx.fill(); }
    } else { ctx.fillStyle = "#a81c21"; ctx.beginPath(); ctx.arc(0, 0, rs, 0, TAU); ctx.fill(); ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(-rs * 0.12, -rs * 0.12, rs * 0.86, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawWaves(t) {
    const K = S.kick;
    for (const w of K.waves) {
      const k = (t - w.t0) / (w.dur || 0.32); if (k >= 1 || k < 0) continue;
      const r = lerp(0.13, w.reach, easeOut(k)), q = proj(0, 0, 0), rr = r * q[3];
      ctx.strokeStyle = INK; ctx.lineWidth = R * (0.006 + 0.02 * w.v) * (1 - k * 0.6);
      ctx.beginPath();
      if (w.kind === 2) ctx.rect(q[0] - rr, q[1] - rr * 0.6, rr * 2, rr * 1.2);
      else if (w.kind === 3) { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i / 3) * TAU; ctx[i ? "lineTo" : "moveTo"](q[0] + Math.cos(a) * rr, q[1] + Math.sin(a) * rr * 0.6); } ctx.closePath(); }
      else if (w.kind === 4) { ctx.moveTo(q[0], q[1] - rr * 0.75); ctx.lineTo(q[0] + rr, q[1]); ctx.lineTo(q[0], q[1] + rr * 0.75); ctx.lineTo(q[0] - rr, q[1]); ctx.closePath(); } // losango
      else ctx.ellipse(q[0], q[1], rr, rr * (w.kind === 1 ? 0.35 : 0.6), 0, 0, TAU);
      ctx.stroke();
    }
  }
  function drawParticle(p) {
    const q = proj(p.x, p.y, p.z), s = Math.max(1, p.s * q[3]);
    const col = COLS[p.col], kind = p.shape > 0.1 ? Math.min(4, Math.round(p.shape * 4)) : p.kind; // SHAPE transforma a família
    ctx.fillStyle = col; ctx.strokeStyle = col;
    const x = q[0], y = q[1];
    ctx.beginPath();
    if (kind === 0) ctx.arc(x, y, s, 0, TAU);                                         // esfera
    else if (kind === 1) ctx.rect(x - s, y - s, s * 2, s * 2);                        // cubo
    else if (kind === 2) ctx.ellipse(x, y, s * 1.5, s * 0.55, p.a, 0, TAU);          // disco
    else if (kind === 3) { for (let i = 0; i < 6; i++) { const a = p.a + (i / 6) * TAU; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * s * 1.3, y + Math.sin(a) * s * 1.3); } ctx.closePath(); } // poliedro
    else { for (let i = 0; i < 10; i++) { const a = p.a + (i / 10) * TAU, r = i % 2 ? s * 0.55 : s * 1.5; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); } // símbolo (estrela)
    ctx.fill();
  }
  function drawArcs(t) {
    for (const A2 of S.snare.arcs) {
      const age = t - A2.born, fade = clamp(1 - age / (A2.life || 1.6), 0, 1); if (fade <= 0) continue;
      const k = easeOut(clamp(age / 0.08, 0, 1)), last = A2 === S.snare.arcs[S.snare.arcs.length - 1];
      const a0 = A2.q * (TAU / 4) + 0.07, a1 = a0 + ((TAU / 4) * A2.span - 0.14) * k;
      const w = R * (0.03 + 0.06 * A2.v) * (last ? 1 : 0.55);
      const n = 18; ctx.lineCap = "butt";
      for (const [colr, lw] of [[INK, w + Math.max(2, R * 0.008)], [YELLOW, w]]) {
        ctx.strokeStyle = colr; ctx.lineWidth = lw; ctx.beginPath(); let on = false;
        for (let i = 0; i <= n; i++) {
          const a = lerp(a0, a1, i / n);
          if (A2.cut > 0.2 && Math.floor(i * (1 + A2.cut * 3)) % 3 === 2) { on = false; continue; } // recortes (SHAPE)
          const p = ringPt("snare", a), q = proj(p[0], p[1], p[2]);
          if (on) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); on = true; }
        }
        ctx.stroke();
      }
    }
  }
  function drawPlanets(t) {
    const B = S.bass, rot = angNow(B, t), n = B.planets.length;
    B.planets.forEach((pl, i) => {
      const old = n - 1 - i; if (old > 12) return;
      const ageP = t - pl.born; if (ageP > pl.life + 0.3) return;                         // DECAY: o planeta some
      const die = ageP > pl.life ? 1 - (ageP - pl.life) / 0.3 : 1;
      // SWEEP (tone): trajetória — órbita → espiral (os mais velhos descem pra dentro)
      const a = pl.a + rot, spiral = pl.spiral * old * 0.05;
      const p = ringPt("bass", a), k = 1 - spiral;
      const q = proj(p[0] * k, p[1] * k, p[2] * k);
      const age = t - pl.born, pop = age < 0.12 ? 1 + 0.35 * Math.sin((Math.PI * age) / 0.12) : 1;
      const s = (0.016 + 0.034 * pl.v) * q[3] * pop * (old < 8 ? 1 : 0.8) * (1 + pl.pitch * 0.3) * die;
      if (s < 0.3) return;
      // SHAPE (tone): alongamento / torção · COLOR: identidade (disco, quadrado, anel, meia-lua, triângulo) · DIST: serrilhado
      ctx.fillStyle = old === 0 ? BLUE : old % 5 === 2 ? INK : BLUE;
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(a * pl.shape); ctx.scale(1 + pl.shape * 1.5, 1 - pl.shape * 0.4);
      ctx.beginPath();
      if (pl.dist > 0.1) { const m = 12; for (let j = 0; j < m; j++) { const aa = (j / m) * TAU, rr = s * (j % 2 ? 1 - pl.dist * 0.45 : 1 + pl.dist * 0.2); ctx[j ? "lineTo" : "moveTo"](Math.cos(aa) * rr, Math.sin(aa) * rr); } ctx.closePath(); }
      else if (pl.kind === 1) ctx.rect(-s, -s, 2 * s, 2 * s);
      else if (pl.kind === 2) { ctx.arc(0, 0, s, 0, TAU); ctx.moveTo(s * 0.5, 0); ctx.arc(0, 0, s * 0.5, 0, TAU, true); }
      else if (pl.kind === 3) ctx.arc(0, 0, s, Math.PI, 0);
      else if (pl.kind === 4) { ctx.moveTo(0, -s * 1.1); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); }
      else ctx.arc(0, 0, s, 0, TAU);
      ctx.fill("evenodd"); ctx.restore();
    });
  }
  function drawMoon(t) {
    const K = S.kick, a = -Math.PI / 2 + angNow(K, t), p = ringPt("kick", a), q = proj(p[0], p[1], p[2]), s = 0.03 * q[3];
    ctx.fillStyle = INK; ctx.beginPath();
    if (K.kind === 2) ctx.rect(q[0] - s, q[1] - s, 2 * s, 2 * s); else if (K.kind === 3) { ctx.moveTo(q[0], q[1] - s * 1.2); ctx.lineTo(q[0] + s, q[1] + s * 0.8); ctx.lineTo(q[0] - s, q[1] + s * 0.8); ctx.closePath(); } else if (K.kind === 4) { ctx.moveTo(q[0], q[1] - s * 1.4); ctx.lineTo(q[0] + s, q[1]); ctx.lineTo(q[0], q[1] + s * 1.4); ctx.lineTo(q[0] - s, q[1]); ctx.closePath(); } else ctx.arc(q[0], q[1], s, 0, TAU);
    ctx.fill();
    return q[2];
  }
  const order = [];
  function draw(t) {
    paper();
    ctx.lineJoin = "round";
    // linhas de construção
    ctx.globalAlpha = 1; ctx.strokeStyle = "#cfc7b6"; ctx.lineWidth = Math.max(1, R * 0.004);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    for (const k of RKEYS) drawRing(k, false);       // metade de trás dos anéis
    // partículas de trás, sol, partículas da frente
    order.length = 0; for (let i = 0; i < MAXP; i++) if (parts[i].on) { proj(parts[i].x, parts[i].y, parts[i].z); order.push([out[2], i]); }
    order.sort((a, b) => b[0] - a[0]);
    for (const [z, i] of order) if (z >= 0) drawParticle(parts[i]);
    drawWaves(t); drawSun(t);
    for (const k of RKEYS) drawRing(k, true);        // metade da frente
    for (const [z, i] of order) if (z < 0) drawParticle(parts[i]);
    drawArcs(t); drawPlanets(t); drawMoon(t);
    if (figs) figs.draw(ctx, (x, y, z) => { const q = proj(x, y, z); return [q[0], q[1], q[3]]; }, [RED, BLUE, YELLOW, INK], "#8c8577", PAPER, t);
  }

  // ---------- laço ----------
  let last = now(), raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = now(), dt = Math.min(0.05, t - last); last = t;
    if (canvas.hidden) return;
    if (Math.abs(canvas.getBoundingClientRect().width - W) > 1) resize();
    update(dt, t); draw(t);
  }
  reset();
  raf = requestAnimationFrame(frame);
  function destroy() { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); window.removeEventListener("resize", resize); grain = null; }
  const state = () => ({ ...counts, kick: S.kick.step, bass: S.bass.turn, planets: S.bass.planets.length, snare: S.snare.arcs.length, snareQ: S.snare.q,
    particles: parts.reduce((n, p) => n + (p.on ? 1 : 0), 0), expelled: parts.reduce((n, p) => n + (p.on && p.free ? 1 : 0), 0),
    attract: +S.attract.toFixed(3), repel: +S.repel.toFixed(3), tilt: +S.rings.bass.tilt.toFixed(3), broken: +S.rings.hat.broken.toFixed(3),
    figures: figs ? figs.active() : 0, objects: parts.reduce((n, p) => n + (p.on ? 1 : 0), 0) + S.bass.planets.length + S.snare.arcs.length + (figs ? figs.active() : 0) });
  return { hit, reset, setBpm, destroy, canvas, state };
}
