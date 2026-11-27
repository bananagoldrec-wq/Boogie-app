/* CENAS BAUHAUS 3D — 031 IMPOSSIBLE CITY · 032 MAGNETIC BALLET

   Duas cenas independentes, mesma API:
     const visual = createImpossibleCity(canvas);   // ou createMagneticBallet(canvas)
     visual.hit('kick' | 'bass' | 'hat' | 'snare', força 0–1);  // outro tipo: ignorado
     visual.setSpeed(1.2);        // 0,2–3 (1 = normal)
     visual.setPerspective(1.5);  // 0,5–2,5 (1 = normal; maior = perspectiva mais forte)
     visual.setBpm(124);          // opcional
     visual.reset();  visual.destroy();

   Direção de arte: Bauhaus — só cores chapadas (vermelho, azul, amarelo, preto, creme),
   cada face uma cor sólida, sem degradê, neon ou brilho. Muitos pequenos acontecimentos
   ao mesmo tempo, profundidade 3D forte, movimentos contínuos (nada recomeça por nota).
   Desempenho: tudo pré-alocado, só desenha a aba aberta, resolução se ajusta pra manter
   60 quadros/s; destroy() cancela o laço e solta os ouvintes.                            */

// ---------- paleta (3 tons sólidos por cor: luz, meio, sombra) ----------
const HEX = { red: "#d3262c", blue: "#1d4f9e", yellow: "#f1b70e", black: "#151515", cream: "#ede6d6" };
const NAMES = ["red", "blue", "yellow", "black", "cream"];
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (h, k) => { const [r, g, b] = rgb(h); const f = (c) => Math.round(k < 1 ? c * k : c + (255 - c) * (k - 1)); return `rgb(${f(r)},${f(g)},${f(b)})`; };
const TONE = NAMES.map((n) => (n === "black" ? [shade(HEX[n], 1.25), shade(HEX[n], 1.1), shade(HEX[n], 1)] : [shade(HEX[n], 1), shade(HEX[n], 0.84), shade(HEX[n], 0.68)]));
const COLOR = NAMES.map((n) => HEX[n]);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const now = () => performance.now() / 1000;
const easeOut = (s) => 1 - Math.pow(1 - s, 3);
const easeBack = (s) => 1 + 2.2 * Math.pow(s - 1, 3) + 1.2 * Math.pow(s - 1, 2); // passa um pouco e volta
// cor de uma peça que nunca some no fundo
const visibleOn = (c, bgName) => (NAMES[c] === bgName ? (bgName === "black" ? 4 : 3) : c);

// ---------- palco: tela, resolução adaptativa, laço, destroy ----------
function createStage(canvas, frame) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const S = { ctx, W: 1, H: 1, DPR: 1, cx: 0, cy: 0, quality: 1 };
  function resize() {
    const r = canvas.getBoundingClientRect();
    S.W = Math.max(1, r.width); S.H = Math.max(1, r.height);
    const want = Math.min(2, window.devicePixelRatio || 1);
    const cap = Math.sqrt(6e6 / (S.W * S.H)); // no máximo ~6 milhões de pixels por quadro
    S.DPR = Math.max(0.5, Math.min(want, cap) * S.quality);
    canvas.width = Math.round(S.W * S.DPR); canvas.height = Math.round(S.H * S.DPR);
    S.cx = S.W / 2; S.cy = S.H / 2;
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", resize);
  resize();
  let ftAvg = 16.7, ftT = 0, last = now(), raf = 0, alive = true;
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const t = now(), dt = Math.min(0.05, t - last);
    last = t;
    if (canvas.hidden) return; // aba fechada: não gasta nada
    ftAvg += (dt * 1000 - ftAvg) * 0.05;
    if (t - ftT > 2) {
      ftT = t;
      if (ftAvg > 19 && S.quality > 0.5) { S.quality = Math.max(0.5, S.quality - 0.15); resize(); }
      else if (ftAvg < 15.5 && S.quality < 1) { S.quality = Math.min(1, S.quality + 0.1); resize(); }
    }
    ctx.setTransform(S.DPR, 0, 0, S.DPR, 0, 0);
    frame(dt, t);
  }
  raf = requestAnimationFrame(loop);
  S.destroy = () => {
    alive = false;
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("fullscreenchange", resize);
  };
  return S;
}

// ---------- câmera e desenho 3D (faces chapadas, recorte no plano perto) ----------
// câmera = posição + base (direita, cima, frente). Ponto do mundo → câmera → tela.
function makeCam() { return { px: 0, py: 0, pz: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1, f: 500, near: 0.3 }; }
function lookAt(C, px, py, pz, tx, ty, tz) {
  C.px = px; C.py = py; C.pz = pz;
  let fx = tx - px, fy = ty - py, fz = tz - pz; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = fz, ry = 0, rz = -fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // direita (horizontal)
  const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;         // cima = frente × direita
  C.rx = rx; C.ry = ry; C.rz = rz; C.ux = ux; C.uy = uy; C.uz = uz; C.fx = fx; C.fy = fy; C.fz = fz;
}
// buffers reaproveitados (nada é criado por quadro)
const QX = new Float32Array(8), QY = new Float32Array(8), QZ = new Float32Array(8);
const CX = new Float32Array(16), CY = new Float32Array(16), CZ = new Float32Array(16);
function toCam(C, x, y, z, out, i) {
  const dx = x - C.px, dy = y - C.py, dz = z - C.pz;
  out[0][i] = dx * C.rx + dy * C.ry + dz * C.rz;
  out[1][i] = dx * C.ux + dy * C.uy + dz * C.uz;
  out[2][i] = dx * C.fx + dy * C.fy + dz * C.fz;
}
const BOXV = [new Float32Array(8), new Float32Array(8), new Float32Array(8)];
// caixa: centro, meia-largura/altura/profundidade, giro em Y; tone(face) → índice do tom
const FACES = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]; // frente, trás, esq, dir, cima, baixo
const FACE_TONE = [1, 1, 2, 2, 0, 2];
function drawBox(S, C, x, y, z, hw, hh, hd, rot, colorIdx) {
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < 8; i++) {
    const lx = (i & 1) ^ ((i >> 1) & 1) ? hw : -hw; // 0:-,1:+,2:+,3:- (frente); 4..7 igual atrás
    const ly = i & 2 ? hh : -hh, lz = i & 4 ? hd : -hd;
    toCam(C, x + lx * c + lz * s, y + ly, z - lx * s + lz * c, BOXV, i);
  }
  const T = TONE[colorIdx];
  let mx = 0, my = 0, mz = 0; // centro da caixa (pra saber o lado de fora de cada face)
  for (let i = 0; i < 8; i++) { mx += BOXV[0][i]; my += BOXV[1][i]; mz += BOXV[2][i]; }
  mx /= 8; my /= 8; mz /= 8;
  for (let f = 0; f < 6; f++) {
    const q = FACES[f];
    // normal da face (virada pra fora) e se ela está de frente pra câmera
    const a = q[0], b = q[1], d = q[3];
    const ux = BOXV[0][b] - BOXV[0][a], uy = BOXV[1][b] - BOXV[1][a], uz = BOXV[2][b] - BOXV[2][a];
    const wx = BOXV[0][d] - BOXV[0][a], wy = BOXV[1][d] - BOXV[1][a], wz = BOXV[2][d] - BOXV[2][a];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * (BOXV[0][a] - mx) + ny * (BOXV[1][a] - my) + nz * (BOXV[2][a] - mz) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    if (nx * BOXV[0][a] + ny * BOXV[1][a] + nz * BOXV[2][a] >= 0) continue;
    for (let k = 0; k < 4; k++) { QX[k] = BOXV[0][q[k]]; QY[k] = BOXV[1][q[k]]; QZ[k] = BOXV[2][q[k]]; }
    fillPoly(S, C, 4, T[FACE_TONE[f]]);
  }
}
// polígono (em QX/QY/QZ) recortado no plano perto e preenchido com uma cor sólida
function fillPoly(S, C, n, col) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, zi = QZ[i], zj = QZ[j], inI = zi >= C.near, inJ = zj >= C.near;
    if (inI) { CX[m] = QX[i]; CY[m] = QY[i]; CZ[m] = zi; m++; }
    if (inI !== inJ) { const k = (C.near - zi) / (zj - zi); CX[m] = QX[i] + (QX[j] - QX[i]) * k; CY[m] = QY[i] + (QY[j] - QY[i]) * k; CZ[m] = C.near; m++; }
  }
  if (m < 3) return;
  const ctx = S.ctx;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < m; i++) {
    const sx = S.cx + (C.f * CX[i]) / CZ[i], sy = S.cy - (C.f * CY[i]) / CZ[i];
    CX[i] = sx; CY[i] = sy;
    if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
  }
  if (x1 < 0 || x0 > S.W || y1 < 0 || y0 > S.H) return; // fora da tela
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(CX[0], CY[0]);
  for (let i = 1; i < m; i++) ctx.lineTo(CX[i], CY[i]);
  ctx.closePath(); ctx.fill();
  if (x1 - x0 > 24 || y1 - y0 > 24) { ctx.strokeStyle = col; ctx.stroke(); } // face grande: contorno da mesma cor (sem frestas)
}
// esfera: disco de sombra + disco de luz deslocado (duas cores sólidas, sem degradê)
const SP = [new Float32Array(1), new Float32Array(1), new Float32Array(1)];
function drawSphere(S, C, x, y, z, r, colorIdx) {
  toCam(C, x, y, z, SP, 0);
  const zc = SP[2][0];
  if (zc < C.near + r * 0.5) return;
  const sx = S.cx + (C.f * SP[0][0]) / zc, sy = S.cy - (C.f * SP[1][0]) / zc, sr = (C.f * r) / zc;
  if (sr < 0.4 || sx < -sr || sx > S.W + sr || sy < -sr || sy > S.H + sr) return;
  const T = TONE[colorIdx], ctx = S.ctx;
  ctx.fillStyle = T[2]; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T[0]; ctx.beginPath(); ctx.arc(sx - sr * 0.13, sy - sr * 0.13, sr * 0.84, 0, Math.PI * 2); ctx.fill();
}
const depthOf = (C, x, y, z) => (x - C.px) * C.fx + (y - C.py) * C.fy + (z - C.pz) * C.fz;

// =====================================================================================
// 031 — IMPOSSIBLE CITY
// Uma cidade abstrata Bauhaus sem fim: a câmera avança por uma avenida; prédios de blocos
// (com recuos, esferas no topo), pontes e blocos flutuando, torres penduradas no céu.
// - KICK  constrói e desconstrói: andares novos sobem, prédios se dividem em dois, blocos
//         mudam de forma ou de cor, andares de cima se desfazem; terrenos vazios ganham prédio.
// - BASS  a câmera acelera (um empurrão que vai passando).
// - HAT   pequenas peças 3D saltam dos telhados e caem girando.
// - SNARE o ambiente muda de cor (céu e chão), na hora.
// =====================================================================================
export function createImpossibleCity(canvas) {
  const C = makeCam();
  let speed = 1, persp = 1, bpm = null;
  const ENV = [ // céu, chão, linhas do chão
    ["cream", "black"], ["blue", "cream"], ["black", "red"], ["yellow", "blue"], ["red", "cream"], ["cream", "blue"], ["black", "yellow"],
  ];
  const ROW = 4, FAR = 84, LOTX = [-15, -10.5, -6, 6, 10.5, 15];
  const MAXB = 220, MAXP = 260, MAXF = 8;
  // prédio: até MAXF blocos empilhados (pré-alocado)
  const B = Array.from({ length: MAXB }, () => ({
    on: false, x: 0, z: 0, rot: 0, kind: 0, n: 0, hang: 0, sphere: -1,
    fl: Array.from({ length: MAXF }, () => ({ w: 1, d: 1, h: 1, c: 0, t0: -9, from: 0, gone: false, gt: -9, cw: 0, tw: 1, td: 1, mt: -9 })),
    split: 0, st: -9, born: 0,
  }));
  const PC = Array.from({ length: MAXP }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, c: 0, born: 0, life: 1, rot: 0, w: 0 }));
  let pNext = 0, camZ, boost, envI, rowNext, counts, rnd = Math.random, t0 = now();

  function rowHash(k) { let h = (k * 2654435761) >>> 0; return () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296); }
  function freeB() { for (const b of B) if (!b.on) return b; return null; }
  function newBuilding(x, z, R, rising) {
    const b = freeB();
    if (!b) return null;
    const t = now();
    // (a vaga pode ter sido de uma ponte ou torre pendurada: tudo volta ao normal)
    b.on = true; b.kind = 0; b.hang = 0; b.x = x; b.z = z; b.rot = (R() < 0.25 ? (R() - 0.5) * 0.7 : 0); b.split = 0; b.st = -9; b.born = t;
    const w = 1.2 + R() * 1.9, d = 1.2 + R() * 1.9;
    b.n = 1 + Math.floor(R() * R() * 6);
    let cw = w, cd = d;
    for (let i = 0; i < b.n; i++) {
      const f = b.fl[i];
      f.w = cw; f.d = cd; f.h = 0.8 + R() * (i === 0 ? 3.2 : 2); f.c = (R() * 5) | 0; f.gone = false; f.gt = -9; f.mt = -9; f.tw = cw; f.td = cd;
      f.t0 = rising ? t + i * 0.06 : t - 9; // terreno novo: sobe do chão, andar por andar
      cw *= 0.62 + R() * 0.35; cd *= 0.62 + R() * 0.35;
    }
    b.sphere = R() < 0.22 ? (R() * 5) | 0 : -1;
    return b;
  }
  function makeRow(k) {
    const R = rowHash(k), z = k * ROW;
    if (k % 7 === 3) return; // rua transversal: um respiro na cidade
    for (const x of LOTX) if (R() < 0.82) newBuilding(x + (R() - 0.5) * 1.4, z + (R() - 0.5) * 1.2, R, false);
    // o impossível: ponte por cima da avenida, bloco flutuando, torre pendurada no céu
    const r = R();
    if (r < 0.16) { const b = newBuilding(0, z, R, false); if (b) { b.kind = 1; b.n = 1; const f = b.fl[0]; f.w = 7 + R() * 4; f.d = 0.8 + R(); f.h = 0.5 + R() * 0.5; b.hang = 5 + R() * 4; b.sphere = -1; } }
    else if (r < 0.3) { const b = newBuilding((R() - 0.5) * 4, z, R, false); if (b) { b.kind = 2; b.n = Math.min(b.n, 2); b.hang = 3.5 + R() * 4; b.rot = R() * 3; } }
    else if (r < 0.4) { const b = newBuilding((R() < 0.5 ? -1 : 1) * (3 + R() * 3), z, R, false); if (b) { b.kind = 3; b.hang = 17 + R() * 5; } }
  }
  function reset() {
    for (const b of B) { b.on = false; b.kind = 0; }
    for (const p of PC) p.on = false;
    camZ = 0; boost = 0; envI = 0; counts = { builds: 0, splits: 0, morphs: 0, falls: 0, risen: 0, boosts: 0, piecesSent: 0, snares: 0 };
    rowNext = 1;
    while (rowNext * ROW < camZ + FAR) makeRow(rowNext++);
  }

  // ---------- instrumentos ----------
  function inView(b) { const dz = b.z - camZ; return dz > 6 && dz < 46; }
  function kick(v) {
    const t = now(), R = rnd;
    const cands = B.filter((b) => b.on && b.kind === 0 && inView(b));
    const n = Math.min(cands.length, 2 + Math.round(5 * v));
    for (let i = 0; i < n; i++) {
      const b = cands.splice((R() * cands.length) | 0, 1)[0];
      const top = b.fl[b.n - 1], a = R();
      if (a < 0.34 && b.n < MAXF) {               // constrói: um andar novo sobe
        const f = b.fl[b.n];
        f.w = top.w * (0.6 + R() * 0.4); f.d = top.d * (0.6 + R() * 0.4); f.tw = f.w; f.td = f.d; f.h = 0.6 + R() * 1.6 * (0.6 + v);
        f.c = (R() * 5) | 0; f.t0 = t; f.gone = false; f.gt = -9; f.mt = -9;
        b.n++; counts.builds++;
      } else if (a < 0.52 && !b.split) {          // divide: o prédio abre em dois
        b.split = 1; b.st = t; counts.splits++;
      } else if (a < 0.78) {                      // transforma: o bloco de cima muda de forma e de cor
        if (top.mt > 0) { top.w = top.tw; top.d = top.td; } // outra transformação no meio: parte do alvo da anterior
        top.cw = top.w; top.tw = top.w * (0.5 + R()); top.td = top.d * (0.5 + R()); top.mt = t; top.c = (R() * 5) | 0; counts.morphs++;
      } else if (b.n > 1) {                       // desconstrói: o andar de cima se desfaz
        top.gone = true; top.gt = t; counts.falls++;
      }
    }
    // terrenos vazios ao longe ganham prédios que sobem do chão
    const R2 = rnd, nNew = 1 + Math.round(2 * v);
    for (let i = 0; i < nNew; i++) {
      const b = newBuilding(LOTX[(R2() * LOTX.length) | 0] + (R2() - 0.5) * 2, camZ + 30 + R2() * 40, R2, true);
      if (b) counts.risen++;
    }
  }
  function bass(v) { boost = Math.min(2.4, boost + 0.3 + 0.8 * v); counts.boosts++; }
  function hat(v) {
    const t = now(), src = B.filter((b) => b.on && b.kind === 0 && inView(b));
    const n = 3 + Math.round(12 * v);
    for (let i = 0; i < n; i++) {
      const b = src.length ? src[(rnd() * src.length) | 0] : null;
      const p = PC[pNext]; pNext = (pNext + 1) % MAXP;
      let h = 0; if (b) for (let j = 0; j < b.n; j++) if (!b.fl[j].gone) h += b.fl[j].h;
      p.on = true; p.born = t; p.life = 0.7 + rnd() * 0.6;
      p.x = b ? b.x : (rnd() - 0.5) * 20; p.z = b ? b.z : camZ + 15 + rnd() * 20; p.y = h + 0.2;
      p.vx = (rnd() - 0.5) * 4 * (0.6 + v); p.vz = (rnd() - 0.5) * 4; p.vy = 3 + rnd() * 5 * (0.5 + v);
      p.s = 0.08 + rnd() * 0.16 * (0.6 + v); p.c = (rnd() * 5) | 0; p.rot = rnd() * 6; p.w = (rnd() - 0.5) * 12;
    }
    counts.piecesSent += n;
  }
  function snare() { let e = (rnd() * (ENV.length - 1)) | 0; if (e >= envI) e++; envI = e; counts.snares++; }
  function hit(type, amount = 1) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    if (type === "kick") kick(v); else if (type === "bass") bass(v); else if (type === "hat") hat(v); else if (type === "snare") snare(v);
  }

  // ---------- quadro ----------
  const order = [];
  const S = createStage(canvas, (dt, t) => {
    boost *= Math.exp(-dt * 2.4);
    camZ += dt * 5.2 * speed * (1 + boost);
    while (rowNext * ROW < camZ + FAR) makeRow(rowNext++);
    for (const b of B) if (b.on && b.z < camZ - 4) b.on = false;   // ficou pra trás: libera
    const T = t - t0;
    // câmera: avança sempre, serpenteia devagar pela avenida (nunca no mesmo caminho)
    const cxw = Math.sin(T * 0.071) * 1.3 + Math.sin(T * 0.023) * 0.6, cyw = 1.7 + Math.sin(T * 0.11) * 0.45 + Math.sin(T * 0.037) * 0.3;
    const yaw = Math.sin(T * 0.049) * 0.13 + Math.sin(T * 0.017) * 0.07, pitch = 0.05 + Math.sin(T * 0.083) * 0.05;
    lookAt(C, cxw, cyw, camZ, cxw + Math.sin(yaw) * 10, cyw + pitch * 10, camZ + Math.cos(yaw) * 10);
    C.f = Math.min(S.W, S.H) * 0.95 / persp;
    const [sky, ground] = ENV[envI];
    const ctx = S.ctx;
    ctx.lineJoin = "round"; ctx.lineWidth = 0.8;
    ctx.fillStyle = HEX[sky]; ctx.fillRect(0, 0, S.W, S.H);
    // chão até o horizonte (sólido) e as linhas das ruas (profundidade)
    toCam(C, cxw, 0, camZ + 400, BOXV, 0);
    const hy = S.cy - (C.f * BOXV[1][0]) / Math.max(1, BOXV[2][0]);
    ctx.fillStyle = HEX[ground]; ctx.fillRect(0, Math.max(0, hy), S.W, S.H - hy);
    const lineCol = TONE[NAMES.indexOf(ground)][ground === "black" ? 0 : 2];
    ctx.strokeStyle = lineCol; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const lx of [-3.2, 3.2, -19, 19]) {
      toCam(C, lx, 0, camZ + 1, BOXV, 0); toCam(C, lx, 0, camZ + FAR, BOXV, 1);
      if (BOXV[2][0] > C.near) { ctx.moveTo(S.cx + C.f * BOXV[0][0] / BOXV[2][0], S.cy - C.f * BOXV[1][0] / BOXV[2][0]); ctx.lineTo(S.cx + C.f * BOXV[0][1] / BOXV[2][1], S.cy - C.f * BOXV[1][1] / BOXV[2][1]); }
    }
    for (let k = Math.ceil((camZ + 1) / ROW); k * ROW < camZ + FAR; k++) {
      if (k % 7 !== 3) continue; // as ruas transversais
      for (const zz of [k * ROW - 1.6, k * ROW + 1.6]) {
        toCam(C, -40, 0, zz, BOXV, 0); toCam(C, 40, 0, zz, BOXV, 1);
        if (BOXV[2][0] > C.near && BOXV[2][1] > C.near) { ctx.moveTo(S.cx + C.f * BOXV[0][0] / BOXV[2][0], S.cy - C.f * BOXV[1][0] / BOXV[2][0]); ctx.lineTo(S.cx + C.f * BOXV[0][1] / BOXV[2][1], S.cy - C.f * BOXV[1][1] / BOXV[2][1]); }
      }
    }
    ctx.stroke();
    ctx.lineWidth = 0.8;
    // do mais longe pro mais perto
    order.length = 0;
    for (let i = 0; i < MAXB; i++) if (B[i].on) order.push(i);
    for (let i = 0; i < MAXP; i++) if (PC[i].on) order.push(MAXB + i);
    const dOf = (id) => (id < MAXB ? depthOf(C, B[id].x, 2, B[id].z) : depthOf(C, PC[id - MAXB].x, PC[id - MAXB].y, PC[id - MAXB].z));
    order.sort((a, b) => dOf(b) - dOf(a));
    for (const id of order) {
      if (id < MAXB) drawBuilding(B[id], t, sky);
      else {
        const p = PC[id - MAXB], a = t - p.born;
        if (a > p.life) { p.on = false; continue; }
        p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.w * dt;
        if (p.y < p.s) { p.y = p.s; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
        const k = 1 - Math.max(0, (a - p.life * 0.6) / (p.life * 0.4)); // encolhe no fim
        drawBox(S, C, p.x, p.y, p.z, p.s * k, p.s * k, p.s * k, p.rot, visibleOn(p.c, sky));
      }
    }
  });

  function drawBuilding(b, t, sky) {
    const dz = depthOf(C, b.x, 2, b.z);
    if (dz < -8 || dz > FAR + 10) return;
    const grow = clamp((FAR - (b.z - camZ)) / 10, 0, 1); // no horizonte nasce baixinho e cresce
    if (b.kind === 3) { // torre pendurada no céu (de cabeça pra baixo)
      let y = b.hang;
      for (let i = 0; i < b.n; i++) { const f = b.fl[i], h = f.h * grow; drawBox(S, C, b.x, y - h / 2, b.z, f.w / 2, h / 2, f.d / 2, b.rot, visibleOn(f.c, sky)); y -= h; }
      return;
    }
    const sp = b.split ? easeOut(clamp((t - b.st) / 0.4, 0, 1)) : 0;
    const halves = sp > 0 ? 2 : 1;
    for (let hlf = 0; hlf < halves; hlf++) {
      let y = b.kind === 0 ? 0 : b.hang;
      const off = halves === 2 ? (hlf ? 1 : -1) : 0;
      for (let i = 0; i < b.n; i++) {
        const f = b.fl[i];
        let k = clamp((t - f.t0) / 0.38, 0, 1), h = f.h * easeBack(k) * grow;
        if (f.gone) { const g = clamp((t - f.gt) / 0.45, 0, 1); if (g >= 1) { if (i === b.n - 1) b.n--; continue; } h *= 1 - g; y += f.h * g * 0.8; }
        if (h <= 0.001) continue;
        let w = f.w, d = f.d;
        if (f.mt > 0) { const m = easeOut(clamp((t - f.mt) / 0.35, 0, 1)); w = f.cw + (f.tw - f.cw) * m; d = f.d + (f.td - f.d) * m; if (m >= 1) { f.w = f.tw; f.d = f.td; f.mt = -9; } }
        // dividido: cada metade com metade da largura, afastando-se
        const hw = halves === 2 ? w / 4 : w / 2;
        const gap = halves === 2 ? (w / 4 + sp * 0.35) * off : 0;
        drawBox(S, C, b.x + Math.cos(b.rot) * gap, y + h / 2, b.z - Math.sin(b.rot) * gap, hw, h / 2, d / 2, b.rot, visibleOn(f.c, sky));
        y += h;
      }
      if (b.sphere >= 0 && b.kind === 0) drawSphere(S, C, b.x + (halves === 2 ? (b.fl[0].w / 4 + sp * 0.35) * off : 0), y + 0.45 * grow, b.z, 0.45 * grow, visibleOn(b.sphere, sky));
    }
  }

  reset();
  const state = () => ({ buildings: B.reduce((n, b) => n + (b.on ? 1 : 0), 0), pieces: PC.reduce((n, p) => n + (p.on ? 1 : 0), 0), boost: +boost.toFixed(3), env: envI, speed, persp, quality: +S.quality.toFixed(2), ...counts });
  return {
    hit, reset, canvas, state,
    setSpeed: (x) => { if (Number.isFinite(+x)) speed = clamp(+x, 0.2, 3); },
    setPerspective: (x) => { if (Number.isFinite(+x)) persp = clamp(+x, 0.5, 2.5); },
    setBpm: (b) => { if (b > 30 && b < 300) bpm = b; },
    destroy: () => { S.destroy(); order.length = 0; },
  };
}

// =====================================================================================
// 032 — MAGNETIC BALLET
// Pequenas esculturas (esferas, cubos, barras) flutuando; a câmera orbita sem parar.
// Cada peça tem um lugar de descanso que passeia devagar; forças magnéticas juntam e
// separam as peças em grupos; elas nunca se atravessam (empurram-se de leve).
// - KICK  atração magnética: as peças correm pros ímãs e formam esculturas agrupadas.
// - BASS  a rotação acelera (órbita da câmera e giro das peças).
// - HAT   fragmentação, impulsos e metamorfoses (peças se partem, saltam, mudam de forma).
// - SNARE repulsão magnética (os grupos se abrem) e o fundo muda de cor.
// =====================================================================================
export function createMagneticBallet(canvas) {
  const C = makeCam();
  let speed = 1, persp = 1, bpm = null;
  const BGS = [["cream", "cream"], ["black", "black"], ["blue", "blue"], ["yellow", "yellow"], ["red", "red"]];
  const MAXN = 150, BASEN = 64, MAG = 4;
  const P = Array.from({ length: MAXN }, () => ({
    on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hx: 0, hy: 0, hz: 0, ph: 0, type: 0, s: 0.4, c: 0,
    rot: 0, w: 0, born: 0, life: 0, mt: -9, nextType: 0, frag: false, g: 0,
  }));
  const M = Array.from({ length: MAG }, (_, i) => ({ x: 0, y: 0, z: 0, ph: i * 1.7 }));
  let attract, repel, spin, orbit, bgI, counts, t0 = now();

  function spawn(x, y, z, frag) {
    const p = P.find((q) => !q.on);
    if (!p) return null;
    const t = now(), r = 2.5 + Math.random() * 3.5, a = Math.random() * 6.283, e = (Math.random() - 0.5) * 1.6;
    p.on = true; p.frag = !!frag; p.born = t; p.life = frag ? 4 + Math.random() * 4 : 0; p.mt = -9;
    p.hx = Math.cos(a) * Math.cos(e) * r; p.hy = Math.sin(e) * r * 0.7; p.hz = Math.sin(a) * Math.cos(e) * r;
    p.x = x ?? p.hx; p.y = y ?? p.hy; p.z = z ?? p.hz; p.vx = p.vy = p.vz = 0;
    p.ph = Math.random() * 100; p.type = (Math.random() * 3) | 0; p.nextType = p.type;
    p.s = (frag ? 0.12 + Math.random() * 0.12 : 0.22 + Math.random() * 0.28);
    p.c = (Math.random() * 5) | 0; p.rot = Math.random() * 6.28; p.w = (Math.random() - 0.5) * 1.5; p.g = 0;
    return p;
  }
  function reset() {
    for (const p of P) p.on = false;
    for (let i = 0; i < BASEN; i++) spawn();
    attract = 0; repel = 0; spin = 0; orbit = Math.random() * 6.28; bgI = 0;
    counts = { attracts: 0, spins: 0, frags: 0, impulses: 0, morphs: 0, repels: 0 };
  }
  const nearestMag = (p) => { let best = M[0], bd = 1e9; for (const m of M) { const d = (p.x - m.x) ** 2 + (p.y - m.y) ** 2 + (p.z - m.z) ** 2; if (d < bd) { bd = d; best = m; } } return best; };

  // ---------- instrumentos ----------
  function kick(v) { attract = Math.min(3, attract + 0.9 + 1.6 * v); counts.attracts++; }
  function bass(v) { spin = Math.min(3, spin + 0.4 + 1.1 * v); counts.spins++; }
  function hat(v) {
    const alive = P.filter((p) => p.on && !p.frag);
    const n = 1 + Math.round(3 * v);
    for (let i = 0; i < n && alive.length; i++) {
      const p = alive[(Math.random() * alive.length) | 0], a = Math.random();
      if (a < 0.4) {                     // fragmenta: solta pedacinhos que saem voando
        const k = 2 + Math.round(2 * v);
        for (let j = 0; j < k; j++) { const f = spawn(p.x, p.y, p.z, true); if (f) { f.c = p.c; f.vx = (Math.random() - 0.5) * 6 * (0.5 + v); f.vy = (Math.random() - 0.5) * 6 * (0.5 + v); f.vz = (Math.random() - 0.5) * 6 * (0.5 + v); } }
        p.g = 1; counts.frags++;
      } else if (a < 0.75) {             // impulso: um salto pra uma direção qualquer
        const s = 3 + 6 * v; p.vx += (Math.random() - 0.5) * s; p.vy += (Math.random() - 0.5) * s; p.vz += (Math.random() - 0.5) * s; counts.impulses++;
      } else {                           // metamorfose: vira outra forma (esfera ↔ cubo ↔ barra)
        p.nextType = (p.type + 1 + ((Math.random() * 2) | 0)) % 3; p.mt = now(); counts.morphs++;
      }
    }
  }
  function snare(v) {
    repel = Math.min(3, repel + 1 + 2 * v);
    for (const p of P) { if (!p.on) continue; const m = nearestMag(p); let dx = p.x - m.x, dy = p.y - m.y, dz = p.z - m.z; const d = Math.hypot(dx, dy, dz) || 1; const k = (2.5 + 5 * v) / d; p.vx += dx * k; p.vy += dy * k; p.vz += dz * k; }
    let b = (Math.random() * (BGS.length - 1)) | 0; if (b >= bgI) b++; bgI = b;
    attract *= 0.3; counts.repels++;
  }
  function hit(type, amount = 1) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    if (type === "kick") kick(v); else if (type === "bass") bass(v); else if (type === "hat") hat(v); else if (type === "snare") snare(v);
  }

  // ---------- física (contínua, orgânica) ----------
  function physics(dt, t) {
    const T = t - t0;
    // os ímãs passeiam devagar (os grupos nunca se formam no mesmo lugar)
    M.forEach((m, i) => { m.x = Math.sin(T * 0.13 + m.ph) * 2.6; m.y = Math.sin(T * 0.17 + m.ph * 1.3) * 1.4; m.z = Math.cos(T * 0.11 + m.ph * 0.7) * 2.6; });
    attract *= Math.exp(-dt * 0.9); repel *= Math.exp(-dt * 3); spin *= Math.exp(-dt * 1.2);
    const list = P;
    for (const p of list) {
      if (!p.on) continue;
      if (p.frag && t - p.born > p.life) { p.on = false; continue; }
      // casa que respira (passeio lento)
      const hx = p.hx + Math.sin(T * 0.3 + p.ph) * 0.6, hy = p.hy + Math.sin(T * 0.23 + p.ph * 1.7) * 0.5, hz = p.hz + Math.cos(T * 0.27 + p.ph) * 0.6;
      let ax = (hx - p.x) * 0.55, ay = (hy - p.y) * 0.55, az = (hz - p.z) * 0.55;
      if (attract > 0.02) { const m = nearestMag(p); const k = attract * 2.2; ax += (m.x - p.x) * k; ay += (m.y - p.y) * k; az += (m.z - p.z) * k; }
      p.vx += ax * dt; p.vy += ay * dt; p.vz += az * dt;
      const damp = Math.exp(-dt * 1.9); p.vx *= damp; p.vy *= damp; p.vz *= damp;
      p.rot += p.w * dt * (1 + spin * 1.5);
      p.g *= Math.exp(-dt * 2);
    }
    // as peças não se atravessam: cada par muito perto se empurra de leve
    for (let i = 0; i < MAXN; i++) {
      const a = list[i]; if (!a.on) continue;
      for (let j = i + 1; j < MAXN; j++) {
        const b = list[j]; if (!b.on) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, min = (a.s + b.s) * 1.25, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = ((min - d) / d) * 0.5;
        a.x -= dx * push; a.y -= dy * push; a.z -= dz * push; b.x += dx * push; b.y += dy * push; b.z += dz * push;
      }
    }
    for (const p of list) if (p.on) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
  }

  const order = [];
  const FLOOR = -4.2;
  const S = createStage(canvas, (dt, t) => {
    physics(dt, t);
    const T = t - t0;
    orbit += dt * (0.16 + spin * 0.55) * speed;
    const elev = 0.32 + Math.sin(T * 0.07) * 0.14, R = 15 / persp;
    lookAt(C, Math.sin(orbit) * Math.cos(elev) * R, Math.sin(elev) * R, Math.cos(orbit) * Math.cos(elev) * R, 0, -0.4, 0);
    C.f = (Math.min(S.W, S.H) * 1.05) / persp;
    const bg = BGS[bgI][0], ctx = S.ctx;
    ctx.lineJoin = "round"; ctx.lineWidth = 0.8;
    ctx.fillStyle = HEX[bg]; ctx.fillRect(0, 0, S.W, S.H);
    // chão: um disco chapado (um tom abaixo do fundo) e as sombras das peças nele
    const bgIdx = NAMES.indexOf(bg), floorCol = bg === "black" ? TONE[bgIdx][0] : TONE[bgIdx][1], shadowCol = bg === "black" ? TONE[4][2] : TONE[bgIdx][2];
    ctx.fillStyle = floorCol;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      toCam(C, Math.cos(a) * 9, FLOOR, Math.sin(a) * 9, BOXV, 0);
      const z = Math.max(C.near, BOXV[2][0]), sx = S.cx + (C.f * BOXV[0][0]) / z, sy = S.cy - (C.f * BOXV[1][0]) / z;
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.fill();
    ctx.fillStyle = shadowCol;
    for (const p of P) {
      if (!p.on) continue;
      toCam(C, p.x, FLOOR, p.z, BOXV, 0);
      const z = BOXV[2][0]; if (z < C.near) continue;
      const k = clamp(1 - (p.y - FLOOR) / 12, 0.25, 1), r = (C.f * p.s * 1.3 * k) / z;
      ctx.beginPath(); ctx.ellipse(S.cx + (C.f * BOXV[0][0]) / z, S.cy - (C.f * BOXV[1][0]) / z, r, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    }
    // peças, do fundo pra frente
    order.length = 0;
    for (let i = 0; i < MAXN; i++) if (P[i].on) order.push(i);
    order.sort((a, b) => depthOf(C, P[b].x, P[b].y, P[b].z) - depthOf(C, P[a].x, P[a].y, P[a].z));
    for (const i of order) {
      const p = P[i];
      // metamorfose: encolhe, troca de forma, cresce de novo
      let k = 1;
      if (p.mt > 0) { const m = clamp((now() - p.mt) / 0.3, 0, 1); k = m < 0.5 ? 1 - m * 1.6 : 0.2 + (m - 0.5) * 1.6; if (m >= 0.5) p.type = p.nextType; if (m >= 1) p.mt = -9; }
      if (p.frag) k *= clamp((p.born + p.life - now()) / 0.6, 0, 1); // pedacinho some encolhendo
      const s = p.s * k * (1 - p.g * 0.35), col = visibleOn(p.c, bg);
      if (s < 0.01) continue;
      if (p.type === 0) drawSphere(S, C, p.x, p.y, p.z, s, col);
      else if (p.type === 1) drawBox(S, C, p.x, p.y, p.z, s, s, s, p.rot, col);
      else drawBox(S, C, p.x, p.y, p.z, s * 0.32, s * 1.9, s * 0.32, p.rot, col); // barra (escultura vertical)
    }
  });

  reset();
  const state = () => ({ pieces: P.reduce((n, p) => n + (p.on ? 1 : 0), 0), attract: +attract.toFixed(3), repel: +repel.toFixed(3), spin: +spin.toFixed(3), bg: bgI, speed, persp, quality: +S.quality.toFixed(2), ...counts });
  return {
    hit, reset, canvas, state,
    setSpeed: (x) => { if (Number.isFinite(+x)) speed = clamp(+x, 0.2, 3); },
    setPerspective: (x) => { if (Number.isFinite(+x)) persp = clamp(+x, 0.5, 2.5); },
    setBpm: (b) => { if (b > 30 && b < 300) bpm = b; },
    destroy: () => { S.destroy(); order.length = 0; },
  };
}
