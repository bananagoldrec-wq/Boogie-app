/* Projeto 4 — INFINITE MICROCOSMOS (030)

   Uma viagem sem fim num espaço tridimensional Bauhaus: a câmera anda sempre pra frente
   (com um balanço e um giro lentos); pequenos sólidos geométricos nascem lá longe,
   chegam perto, se transformam e somem ao atravessar a câmera. Cores chapadas da
   paleta Bauhaus — cada face é UMA cor sólida, sem degradê, sem brilho.
   - KICK    nascem formas novas lá longe e as que estão no caminho se transformam
             (metamorfose). Força = quantas nascem e o tamanho delas.
   - BASS    a viagem ACELERA (um empurrão que vai passando). Força = o empurrão.
   - HI-HAT  as formas soltam microfragmentos. Força = quantos e a velocidade.
   - SNARE   o fundo muda de cor, todas as formas mudam juntas de geometria e a
             rotação se inverte (das formas e da câmera). Força = o tranco.
   A composição nunca recomeça sozinha: só reset() começa de novo.

   Uso:
     const visual = createInfiniteMicrocosmos(canvas);
     visual.hit('kick' | 'bass' | 'hat' | 'snare', força 0–1);  // outro tipo: ignorado
     visual.setSpeed(1.5);        // velocidade da viagem (0,2–3; 1 = normal)
     visual.setPerspective(340);  // perspectiva em px (150–900): menor = mais profundo/grande-angular
     visual.setBpm(124);          // opcional: andamento (duração das metamorfoses)
     visual.reset();  visual.destroy();                                                   */

export function createInfiniteMicrocosmos(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const now = () => performance.now() / 1000;
  const ease = (s) => (s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2);

  // ---------- paleta Bauhaus (cada cor com 3 tons sólidos: luz, meio, sombra) ----------
  const PAL = ["#d3262c", "#1d4f9e", "#f1b70e", "#151515", "#ede6d6"]; // vermelho, azul, amarelo, preto, papel
  const BGS = ["#ede6d6", "#151515", "#1d4f9e", "#f1b70e", "#d3262c", "#f6f3ec"]; // fundos (a caixa troca)
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const tone = (h, k) => { const [r, g, b] = hex(h); const f = (c) => Math.round(k < 1 ? c * k : c + (255 - c) * (k - 1)); return `rgb(${f(r)},${f(g)},${f(b)})`; };
  const TONES = PAL.map((h, i) => (i === 3 ? [tone(h, 1), tone(h, 1.12), tone(h, 1.22)] : [tone(h, 1), tone(h, 0.84), tone(h, 0.68)]));
  // cor de uma forma que não pode sumir no fundo: se for igual ao fundo, usa outra
  const ALT = [3, 4, 3, 4, 3];

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
  }));
  const F = Array.from({ length: MAXF }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.05, born: 0, life: 0.5, c: 3, a: 0 }));
  let fNext = 0; // anel dos fragmentos: o mais velho dá lugar ao novo
  let cam, bgI, rotDir, boost, family, counts;
  const V = new Float32Array(42), P = new Float32Array(28), Z = new Float32Array(14); // um sólido de cada vez
  const triZ = new Float32Array(NT), triT = new Int8Array(NT), order = new Int16Array(NT);
  const draw = []; // lista de desenho (reaproveitada)

  function reset() {
    for (const o of O) o.on = false;
    for (const f of F) f.on = false;
    cam = { z: 0, roll: 0, t: 0 };
    bgI = 0; rotDir = 1; boost = 0; family = 0;
    counts = { births: 0, morphs: 0, boosts: 0, fragsSent: 0, snares: 0 };
    // começa com algumas formas espalhadas no caminho (a viagem não começa vazia)
    for (let i = 0; i < 30; i++) spawn(0.6, 6 + (i / 30) * (FAR - 6), true);
  }

  function freeObj() { for (const o of O) if (!o.on) return o; let far = O[0]; for (const o of O) if (o.z - cam.z < far.z - cam.z) far = o; return far; }
  function spawn(v, dz, quiet) {
    const o = freeObj(), t = now();
    const ang = Math.random() * Math.PI * 2, rad = 0.4 + Math.pow(Math.random(), 0.85) * 7.5; // umas passam perto do centro, outras pelas bordas
    o.on = true;
    o.x = camX(cam.t) + Math.cos(ang) * rad; o.y = camY(cam.t) + Math.sin(ang) * rad * 0.75;
    o.z = cam.z + (dz ?? FAR - Math.random() * 6);
    o.s = (0.28 + 0.5 * Math.random()) * (0.7 + 0.6 * v);
    o.c = (Math.random() * 5) | 0;
    o.born = quiet ? t - 1 : t;
    o.ax = Math.random() * 6.28; o.ay = Math.random() * 6.28; o.az = Math.random() * 6.28;
    o.wx = (Math.random() - 0.5) * 1.6; o.wy = (Math.random() - 0.5) * 1.6; o.wz = (Math.random() - 0.5) * 1.2;
    o.to = (Math.random() * NSH) | 0; o.fromV.set(SH[o.to]); o.mt = -9; o.punch = 0;
    if (!quiet) counts.births++;
  }
  const camX = (t) => Math.sin(t * 0.11) * 1.1 + Math.sin(t * 0.037) * 0.8; // a câmera passeia devagar
  const camY = (t) => Math.sin(t * 0.083 + 1.3) * 0.7;

  function morph(o, to, dur) {
    // começa EXATAMENTE de onde está (mesmo no meio de outra metamorfose): sem pulo
    const t = now(), k = ease(clamp((t - o.mt) / o.md, 0, 1)), A = o.fromV, B = SH[o.to];
    for (let i = 0; i < 42; i++) A[i] += (B[i] - A[i]) * k;
    o.to = to; o.mt = t; o.md = dur;
  }

  // ---------- os instrumentos ----------
  function kick(v) {
    const n = 2 + Math.round(3 * v); // 2 a 5 formas novas por kick
    for (let i = 0; i < n; i++) spawn(v);
    // metamorfose: cada forma no caminho vira outra
    const d = clamp(beat() * 0.45, 0.12, 0.3);
    for (const o of O) if (o.on) { let to = (Math.random() * (NSH - 1)) | 0; if (to >= o.to) to++; morph(o, to, d); counts.morphs++; o.punch = 0.12 + 0.2 * v; }
  }
  function bass(v) { boost = Math.min(2.2, boost + 0.25 + 0.75 * v); counts.boosts++; } // empurrão que vai passando
  function hat(v) {
    const t = now(), n = 4 + Math.round(16 * v);
    // de formas que estão na frente da câmera (as mais visíveis)
    const src = [];
    for (const o of O) if (o.on) { const dz = o.z - cam.z; if (dz > 3 && dz < 30) src.push(o); }
    for (let i = 0; i < n; i++) {
      const f = F[fNext]; fNext = (fNext + 1) % MAXF;
      const o = src.length ? src[(Math.random() * src.length) | 0] : null;
      f.on = true; f.born = t; f.life = 0.35 + 0.35 * Math.random();
      f.x = o ? o.x : camX(cam.t) + (Math.random() - 0.5) * 4; f.y = o ? o.y : camY(cam.t) + (Math.random() - 0.5) * 3; f.z = o ? o.z : cam.z + 6 + Math.random() * 14;
      const sp = (1.5 + 4 * v) * (0.5 + Math.random());
      const u = Math.random() * 2 - 1, th = Math.random() * 6.28, q = Math.sqrt(1 - u * u);
      f.vx = q * Math.cos(th) * sp; f.vy = q * Math.sin(th) * sp; f.vz = u * sp;
      f.s = (0.03 + 0.06 * Math.random()) * (0.7 + 0.6 * v);
      f.c = o ? o.c : 3; f.a = Math.random() * 6.28;
    }
    counts.fragsSent += n;
  }
  function snare(v) {
    // fundo novo (nunca o mesmo), todas as formas mudam juntas de geometria, rotação invertida
    let b = (Math.random() * (BGS.length - 1)) | 0; if (b >= bgI) b++; bgI = b;
    family = (family + 1 + ((Math.random() * (NSH - 1)) | 0)) % NSH;
    const d = clamp(beat() * 0.3, 0.08, 0.2);
    for (const o of O) if (o.on) { morph(o, family, d); o.punch = 0.15 + 0.3 * v; }
    rotDir = -rotDir;
    counts.snares++;
  }
  function hit(type, amount = 1) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    if (type === "kick") kick(v);
    else if (type === "bass") bass(v);
    else if (type === "hat") hat(v);
    else if (type === "snare") snare(v);
  }

  // ---------- movimento ----------
  function update(dt, t) {
    boost *= Math.exp(-dt * 2.6);
    const vz = BASE * speed * (1 + boost);
    cam.z += vz * dt; cam.t += dt;
    cam.roll += dt * 0.06 * rotDir * (0.5 + speed * 0.5);
    for (const o of O) {
      if (!o.on) continue;
      if (o.z - cam.z < NEAR) { o.on = false; continue; } // atravessou a câmera: some
      o.ax += o.wx * rotDir * dt; o.ay += o.wy * rotDir * dt; o.az += o.wz * rotDir * dt;
      o.punch *= Math.exp(-dt * 9);
    }
    for (const f of F) {
      if (!f.on) continue;
      if (t - f.born > f.life || f.z - cam.z < NEAR) { f.on = false; continue; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.a += 6 * dt * rotDir;
    }
  }

  // ---------- desenho ----------
  const LX = -0.45, LY = 0.6, LZ = -0.66; // luz fixa (de cima, da esquerda, da frente): só escolhe o tom
  function render(t) {
    const fpx = persp * (Math.min(W, H) / 600); // a perspectiva acompanha o tamanho da tela
    const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
    const kx = camX(cam.t), ky = camY(cam.t);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = BGS[bgI];
    ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.75;
    // ordem: do mais longe pro mais perto (formas e fragmentos juntos)
    draw.length = 0;
    for (let i = 0; i < MAXO; i++) if (O[i].on) draw.push(i);
    for (let i = 0; i < MAXF; i++) if (F[i].on) draw.push(MAXO + i);
    draw.sort((a, b) => zOf(b) - zOf(a));
    const bgCol = BGS[bgI];
    for (const id of draw) {
      if (id < MAXO) drawObj(O[id], t, fpx, cr, sr, kx, ky, bgCol);
      else drawFrag(F[id - MAXO], t, fpx, cr, sr, kx, ky, bgCol);
    }
  }
  const zOf = (id) => (id < MAXO ? O[id].z : F[id - MAXO].z);
  const colOf = (c, bgCol) => (PAL[c] === bgCol ? ALT[c] : c);

  function drawObj(o, t, fpx, cr, sr, kx, ky, bgCol) {
    const dz = o.z - cam.z;
    if (dz < NEAR || dz > FAR + 8) return;
    // nasce crescendo lá longe; na frente da câmera o tamanho é o de verdade
    const grow = clamp((t - o.born) / 0.45, 0, 1);
    const s = o.s * (0.15 + 0.85 * grow) * (1 + o.punch);
    const k = ease(clamp((t - o.mt) / o.md, 0, 1));
    const A = o.fromV, B = SH[o.to];
    const ca = Math.cos(o.ax), sa = Math.sin(o.ax), cb = Math.cos(o.ay), sb = Math.sin(o.ay), cc = Math.cos(o.az), sc = Math.sin(o.az);
    // vértices: forma (metamorfose) → giro → posição → câmera (com o giro da câmera) → tela
    for (let i = 0; i < 14; i++) {
      let x = A[i * 3] + (B[i * 3] - A[i * 3]) * k, y = A[i * 3 + 1] + (B[i * 3 + 1] - A[i * 3 + 1]) * k, z = A[i * 3 + 2] + (B[i * 3 + 2] - A[i * 3 + 2]) * k;
      let y1 = y * ca - z * sa, z1 = y * sa + z * ca; y = y1; z = z1;
      let x1 = x * cb + z * sb; z1 = -x * sb + z * cb; x = x1; z = z1;
      x1 = x * cc - y * sc; y1 = x * sc + y * cc; x = x1; y = y1;
      x = x * s + o.x - kx; y = y * s + o.y - ky; z = z * s + dz;
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

  function drawFrag(f, t, fpx, cr, sr, kx, ky, bgCol) {
    const dz = f.z - cam.z;
    if (dz < NEAR) return;
    const x = f.x - kx, y = f.y - ky;
    const rx = x * cr - y * sr, ry = x * sr + y * cr;
    const px = cx + (fpx * rx) / dz, py = cy - (fpx * ry) / dz;
    const r = Math.max(0.8, (fpx * f.s) / dz) * (1 - clamp((t - f.born) / f.life, 0, 1) * 0.6); // encolhe ao sumir
    if (px < -r || px > W + r || py < -r || py > H + r) return;
    ctx.fillStyle = PAL[colOf(f.c, bgCol)];
    const c = Math.cos(f.a) * r, s = Math.sin(f.a) * r;
    ctx.beginPath(); // um quadradinho girando
    ctx.moveTo(px + c, py + s); ctx.lineTo(px - s, py + c); ctx.lineTo(px - c, py - s); ctx.lineTo(px + s, py - c);
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
  }

  // pra testes: quantas formas e fragmentos vivos, o empurrão, o fundo, o sentido do giro
  const state = () => ({
    objects: O.reduce((n, o) => n + (o.on ? 1 : 0), 0), frags: F.reduce((n, f) => n + (f.on ? 1 : 0), 0),
    boost: +boost.toFixed(3), bg: bgI, rotDir, family, speed, persp, camZ: +cam.z.toFixed(2), quality: +quality.toFixed(2), dpr: +DPR.toFixed(2), ...counts,
  });
  return { hit, setSpeed, setPerspective, setBpm, reset, destroy, canvas, state, getSpeed: () => speed, getPerspective: () => persp };
}
