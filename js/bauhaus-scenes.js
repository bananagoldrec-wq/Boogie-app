/* CENAS BAUHAUS 3D — 031 IMPOSSIBLE CITY · 032 MAGNETIC BALLET · FM Engine 2.0

   Duas cenas independentes, mesma API:
     const visual = createImpossibleCity(canvas);   // ou createMagneticBallet(canvas)
     visual.hit('kick' | 'bass' | 'hat' | 'snare' | 'chord' | 'perc', força 0–1, ctx?);
     (ctx = knobs da pista que tocou, vindos do motor FM: COLOR, SHAPE, SWEEP, CONTOUR,
      DISTORTION, DECAY, PITCH, PAN, réplica de delay/reverb… Sem ctx: a cena original)
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

// ---------- FM Engine 2.0 (opcional: sem o motor, as cenas são as originais) ----------
const FM = () => (typeof window !== "undefined" ? window.CyclesFM : null);
const NEU = { color: 0, shape: 0, sweep: 0, contour: 0, decay: 0.5, pitch: 0, pan: 0, level: 0.8, dist: 0, punch: 0, gate: 0, vis: {} };
const PR = (role) => (FM() ? FM().role(role) : NEU);
const st5 = (v) => (FM() ? FM().step5(v) : 0);
const ANC = (v, st) => (FM() ? FM().anchors(v, st) : st[2]);
const VIS0 = { pos: 0, rot: 0, scale: 0, geom: 0, persp: 0, hue: 0, gravity: 0, magnet: 0, artic: 0, frag: 0 };
const VIS = () => (FM() ? FM().visAll() : VIS0);
const FIGS = () => (typeof window !== "undefined" ? window.CyclesFigures : null);
// materiais / paletas do COLOR (0 = a cena original: qualquer cor)
const MATS = [null, [0, 4], [1, 3], [4, 3, 4], [0, 1, 2, 3]];
const pickC = (R, mat) => (mat ? mat[(R() * mat.length) | 0] : (R() * 5) | 0);
// figuras da PERC projetadas pela câmera da cena
function figProjector(S, C) {
  const o = [0, 0, 0];
  return (x, y, z) => { toCam(C, x, y, z, SP, 0); const zc = SP[2][0]; if (zc < C.near * 2) return null; o[0] = S.cx + (C.f * SP[0][0]) / zc; o[1] = S.cy - (C.f * SP[1][0]) / zc; o[2] = C.f / zc; return o; };
}
// fundo em campos (COLOR da caixa): liso, dois campos, horizonte, quatro campos, moldura
function fieldBg(S, mode, c1, c2) {
  const ctx = S.ctx; ctx.fillStyle = c1; ctx.fillRect(0, 0, S.W, S.H);
  if (!mode) return;
  ctx.fillStyle = c2;
  if (mode === 1) ctx.fillRect(S.W / 2, 0, S.W / 2, S.H);
  else if (mode === 2) ctx.fillRect(0, S.H * 0.58, S.W, S.H);
  else if (mode === 3) { ctx.fillRect(S.W / 2, 0, S.W / 2, S.H / 2); ctx.fillRect(0, S.H / 2, S.W / 2, S.H / 2); }
  else { const m = Math.min(S.W, S.H) * 0.08; ctx.fillRect(0, 0, S.W, S.H); ctx.fillStyle = c1; ctx.fillRect(m, m, S.W - 2 * m, S.H - 2 * m); }
}

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
function makeCam() { return { px: 0, py: 0, pz: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1, f: 500, near: 0.3, bend: 0 }; }
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
  const Z = dx * C.fx + dy * C.fy + dz * C.fz;
  out[0][i] = dx * C.rx + dy * C.ry + dz * C.rz;
  out[1][i] = dx * C.ux + dy * C.uy + dz * C.uz + (C.bend ? C.bend * Z * Z * 0.012 : 0); // dobra do espaço (cidade impossível)
  out[2][i] = Z;
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
// cilindro em pé: corpo (dois tons: luz e sombra) e a tampa de cima vista de cima (elipse)
function drawCylinder(S, C, x, y, z, r, h, colorIdx) {
  toCam(C, x, y + h, z, BOXV, 0); toCam(C, x, y - h, z, BOXV, 1);
  const z0 = BOXV[2][0], z1 = BOXV[2][1];
  if (z0 < C.near + r || z1 < C.near + r) return;
  const tx = S.cx + (C.f * BOXV[0][0]) / z0, ty = S.cy - (C.f * BOXV[1][0]) / z0, bx = S.cx + (C.f * BOXV[0][1]) / z1, by = S.cy - (C.f * BOXV[1][1]) / z1;
  const sr = (C.f * r) / ((z0 + z1) / 2);
  if (sr < 0.4 || Math.max(tx, bx) < -sr || Math.min(tx, bx) > S.W + sr || Math.max(ty, by) < -sr || Math.min(ty, by) > S.H + sr) return;
  let ax = bx - tx, ay = by - ty; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
  const nx = -ay * sr, ny = ax * sr, ry = sr * Math.max(0.12, Math.abs(C.fy)), rot = Math.atan2(ay, ax) - Math.PI / 2;
  const T = TONE[colorIdx], ctx = S.ctx;
  ctx.fillStyle = T[1]; ctx.beginPath(); ctx.ellipse(bx, by, sr, ry, rot, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(tx - nx, ty - ny); ctx.lineTo(tx + nx, ty + ny); ctx.lineTo(bx + nx, by + ny); ctx.lineTo(bx - nx, by - ny); ctx.closePath(); ctx.fill();
  ctx.fillStyle = T[2]; ctx.beginPath(); ctx.moveTo(tx + nx * 0.35, ty + ny * 0.35); ctx.lineTo(tx + nx, ty + ny); ctx.lineTo(bx + nx, by + ny); ctx.lineTo(bx + nx * 0.35, by + ny * 0.35); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.fy < 0 ? T[0] : T[2]; ctx.beginPath(); ctx.ellipse(tx, ty, sr, ry, rot, 0, Math.PI * 2); ctx.fill();
}
// cristal: losango em pé (metade luz, metade sombra)
function drawCrystal(S, C, x, y, z, r, rot, colorIdx) {
  toCam(C, x, y, z, SP, 0);
  const zc = SP[2][0]; if (zc < C.near + r) return;
  const sx = S.cx + (C.f * SP[0][0]) / zc, sy = S.cy - (C.f * SP[1][0]) / zc, sr = (C.f * r) / zc;
  if (sr < 0.5 || sx < -sr * 2 || sx > S.W + sr * 2 || sy < -sr * 2 || sy > S.H + sr * 2) return;
  const T = TONE[colorIdx], ctx = S.ctx, w = sr * 0.55 * (0.4 + 0.6 * Math.abs(Math.cos(rot)));
  ctx.fillStyle = T[0]; ctx.beginPath(); ctx.moveTo(sx, sy - sr * 1.5); ctx.lineTo(sx - w, sy); ctx.lineTo(sx, sy + sr * 1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = T[2]; ctx.beginPath(); ctx.moveTo(sx, sy - sr * 1.5); ctx.lineTo(sx + w, sy); ctx.lineTo(sx, sy + sr * 1.5); ctx.closePath(); ctx.fill();
}
// linha 3D sólida (conexões / tensão): recortada no plano perto
function drawLine3(S, C, x0, y0, z0, x1, y1, z1, w, col) {
  toCam(C, x0, y0, z0, BOXV, 0); toCam(C, x1, y1, z1, BOXV, 1);
  if (BOXV[2][0] < C.near || BOXV[2][1] < C.near) return;
  const ctx = S.ctx; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, (C.f * w) / ((BOXV[2][0] + BOXV[2][1]) / 2));
  ctx.beginPath(); ctx.moveTo(S.cx + (C.f * BOXV[0][0]) / BOXV[2][0], S.cy - (C.f * BOXV[1][0]) / BOXV[2][0]); ctx.lineTo(S.cx + (C.f * BOXV[0][1]) / BOXV[2][1], S.cy - (C.f * BOXV[1][1]) / BOXV[2][1]); ctx.stroke();
}

// =====================================================================================
// 031 — IMPOSSIBLE CITY
// Uma cidade abstrata Bauhaus sem fim: a câmera avança por uma avenida; prédios de blocos
// (com recuos, esferas no topo), pontes e blocos flutuando, torres penduradas no céu.
// Construção e desconstrução ao mesmo tempo em profundidades diferentes: perto da câmera a
// cidade tende a se desfazer, lá longe ela tende a se construir.
// - KICK  constrói e desconstrói: andares novos sobem, prédios se dividem em dois, blocos
//         mudam de forma ou de cor, andares de cima se desfazem; terrenos vazios ganham prédio.
//         COLOR família de materiais · SHAPE o que nasce (prédio, ponte, escada, torre, portal)
//         · SWEEP deslocamento e reorganização · CONTOUR elasticidade · DISTORTION rachaduras,
//         desabamentos e geometria impossível · DECAY quanto tempo até se desconstruir
// - BASS  a câmera acelera. SHAPE dobra o espaço (o horizonte sobe/desce) · SWEEP trajetória
//         da câmera · CONTOUR rigidez → fluidez do empurrão
// - HAT   pequenas peças 3D saltam dos telhados. COLOR cubo/esfera/disco/agulha/cristal ·
//         SHAPE angulosidade · SWEEP salto/chuva/órbita/vórtice/voo · CONTOUR dispersão · DECAY
// - SNARE o ambiente muda de cor (céu e chão). COLOR organização · SHAPE rachaduras ·
//         SWEEP direção dos estilhaços · CONTOUR ruptura (desabamento)
// - CHORD reorganização coletiva: COLOR alinhamento · SHAPE proporções · SWEEP rotação,
//         ondulação, inversão (prédios viram de cabeça pra baixo) · CONTOUR articulação →
//         andares se afastam → desmontagem
// - PERC  figuras andando nas calçadas (pessoas, animais, objetos, símbolos)
// =====================================================================================
export function createImpossibleCity(canvas) {
  const C = makeCam();
  let speed = 1, persp = 1, bpm = null;
  const ENV = [ // céu, chão, linhas do chão
    ["cream", "black"], ["blue", "cream"], ["black", "red"], ["yellow", "blue"], ["red", "cream"], ["cream", "blue"], ["black", "yellow"],
  ];
  const ENV_LIGHT = [0, 3, 5], ENV_DARK = [1, 2, 6];
  const ROW = 4, FAR = 84, LOTX = [-15, -10.5, -6, 6, 10.5, 15];
  const MAXB = 220, MAXP = 260, MAXF = 8;
  // prédio: até MAXF blocos empilhados (pré-alocado)
  const B = Array.from({ length: MAXB }, () => ({
    on: false, x: 0, z: 0, rot: 0, kind: 0, n: 0, hang: 0, sphere: -1,
    fl: Array.from({ length: MAXF }, () => ({ w: 1, d: 1, h: 1, c: 0, t0: -9, from: 0, gone: false, gt: -9, cw: 0, tw: 1, td: 1, mt: -9, el: 0 })),
    split: 0, st: -9, born: 0,
    // 2.0: deslocamento, giro-alvo, inclinação impossível, vida, afastamento dos andares, inversão
    ox: 0, oxT: 0, rotT: 0, skew: 0, life: 1e9, dying: false, gap: 0, flipT: -9, flipTo: 0, bounceT: -9, bounceA: 0,
  }));
  const PC = Array.from({ length: MAXP }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, c: 0, born: 0, life: 1, rot: 0, w: 0, kind: 0, mode: 0, asp: 1, ox: 0, oz: 0, ang: 0, rad: 0, vib: 0 }));
  let pNext = 0, camZ, boost, boostK, envI, envSwap, rowNext, counts, rnd = Math.random, t0 = now();
  let bend, bendT, camAmp, camAmpT, wave, posS, lastRisen, figs;
  let camHigh = 0, camHighT = 0, sway = 0, bendK = 0.15, gapK = 1.1, waveK = 0.5, envT = -9, envLife = 1e9;

  function rowHash(k) { let h = (k * 2654435761) >>> 0; return () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296); }
  function freeB() { for (const b of B) if (!b.on) return b; return null; }
  function newBuilding(x, z, R, rising) {
    const b = freeB();
    if (!b) return null;
    const t = now();
    // (a vaga pode ter sido de uma ponte ou torre pendurada: tudo volta ao normal)
    b.on = true; b.kind = 0; b.hang = 0; b.x = x; b.z = z; b.rot = (R() < 0.25 ? (R() - 0.5) * 0.7 : 0); b.split = 0; b.st = -9; b.born = t;
    b.ox = 0; b.oxT = 0; b.rotT = b.rot; b.skew = 0; b.dying = false; b.gap = 0; b.flipT = -9; b.bounceA = 0;
    const k = PR("kick"), mat = MATS[st5(k.color)];
    b.life = ANC(k.decay, [3, 8, 20, 60, 1e9]) * (0.8 + 0.4 * R());               // DECAY: tempo até se desconstruir
    const w = 1.2 + R() * 1.9, d = 1.2 + R() * 1.9;
    b.n = 1 + Math.floor(R() * R() * 6);
    let cw = w, cd = d;
    for (let i = 0; i < b.n; i++) {
      const f = b.fl[i];
      f.w = cw; f.d = cd; f.h = 0.8 + R() * (i === 0 ? 3.2 : 2); f.c = pickC(R, mat); f.gone = false; f.gt = -9; f.mt = -9; f.tw = cw; f.td = cd; f.el = 0;
      f.t0 = rising ? t + i * 0.06 : t - 9; // terreno novo: sobe do chão, andar por andar
      cw *= 0.62 + R() * 0.35; cd *= 0.62 + R() * 0.35;
    }
    b.sphere = R() < 0.22 ? (R() * 5) | 0 : -1;
    return b;
  }
  // SHAPE do kick: o que nasce — prédio (original), ponte, escada, torre, portal
  function archetype(b, k, R, t, mat) {
    const set = (i, w, d, h, delay) => { const f = b.fl[i]; f.w = f.tw = w; f.d = f.td = d; f.h = h; f.c = pickC(R, mat); f.gone = false; f.gt = -9; f.mt = -9; f.t0 = t + delay; };
    if (k === 1) { b.kind = 1; b.x = (R() - 0.5) * 2; b.n = 1; set(0, 7 + R() * 4, 0.8 + R(), 0.5 + R() * 0.5, 0); b.hang = 4 + R() * 4; b.sphere = -1; }
    else if (k === 2) { b.kind = 4; b.n = 5 + ((R() * 3) | 0); for (let i = 0; i < b.n; i++) set(i, 0.85, 1.7, 0.45 * (i + 1), i * 0.08); b.sphere = -1; }
    else if (k === 3) { b.kind = 0; b.n = MAXF - ((R() * 2) | 0); let w = 1 + R() * 0.4; for (let i = 0; i < b.n; i++) { set(i, w, w, 1.1 + R() * 0.9, i * 0.06); w *= 0.93; } b.sphere = R() < 0.5 ? (R() * 5) | 0 : -1; }
    else if (k === 4) { b.kind = 5; b.n = 3; const hp = 2.6 + R() * 1.4; set(0, 0.55, 0.55, hp, 0); set(1, 0.55, 0.55, hp, 0.06); set(2, 3.6, 0.7, 0.55, 0.14); b.sphere = -1; }
  }
  function makeRow(k) {
    const R = rowHash(k), z = k * ROW;
    if (k % 7 === 3) return; // rua transversal: um respiro na cidade
    for (const x of LOTX) if (R() < 0.82) newBuilding(x + (R() - 0.5) * 1.4, z + (R() - 0.5) * 1.2, R, false);
    // o impossível: ponte por cima da avenida, bloco flutuando, torre pendurada no céu
    const r = R();
    if (r < 0.16) { const b = newBuilding(0, z, R, false); if (b) { b.kind = 1; b.n = 1; const f = b.fl[0]; f.w = 7 + R() * 4; f.d = 0.8 + R(); f.h = 0.5 + R() * 0.5; b.hang = 5 + R() * 4; b.sphere = -1; } }
    else if (r < 0.3) { const b = newBuilding((R() - 0.5) * 4, z, R, false); if (b) { b.kind = 2; b.n = Math.min(b.n, 2); b.hang = 3.5 + R() * 4; b.rot = R() * 3; b.rotT = b.rot; } }
    else if (r < 0.4) { const b = newBuilding((R() < 0.5 ? -1 : 1) * (3 + R() * 3), z, R, false); if (b) { b.kind = 3; b.hang = 17 + R() * 5; } }
  }
  function reset() {
    for (const b of B) { b.on = false; b.kind = 0; }
    for (const p of PC) p.on = false;
    camZ = 0; boost = 0; boostK = 2.4; envI = 0; envSwap = false; bend = 0; bendT = 0; camAmp = 0; camAmpT = 0; wave = 0; posS = 0; lastRisen = [];
    camHigh = 0; camHighT = 0; sway = 0; bendK = 0.15; gapK = 1.1; waveK = 0.5; envT = -9; envLife = 1e9;
    counts = { builds: 0, splits: 0, morphs: 0, falls: 0, risen: 0, boosts: 0, piecesSent: 0, snares: 0, chords: 0, percs: 0, collapses: 0, cracks: 0, flips: 0, decons: 0, echoes: 0, archetypes: 0 };
    if (figs) figs.clear(); else figs = FIGS() ? FIGS().swarm({ max: 30, size: 0.42 }) : null;
    rowNext = 1;
    while (rowNext * ROW < camZ + FAR) makeRow(rowNext++);
  }

  // ---------- instrumentos ----------
  function inView(b) { const dz = b.z - camZ; return dz > 6 && dz < 46; }
  function collapse(b, t, stagger) { for (let j = b.n - 1; j >= 1; j--) { const f = b.fl[j]; if (!f.gone) { f.gone = true; f.gt = t + (b.n - 1 - j) * stagger; } } }
  function kick(v, c) {
    const t = now(), R = rnd, mat = MATS[st5(c.color)];
    const all = B.filter((b) => b.on && b.kind === 0 && b.n > 0 && inView(b)), cands = all.slice();
    const n = Math.min(cands.length, 2 + Math.round(5 * v));
    for (let i = 0; i < n; i++) {
      const b = cands.splice((R() * cands.length) | 0, 1)[0];
      const top = b.fl[b.n - 1];
      // perto da câmera a cidade tende a se desfazer; lá longe, a se construir (ao mesmo tempo)
      const a = clamp(R() + (b.z - camZ < 22 ? 0.14 : -0.14), 0, 0.999);
      if (a < 0.34 && b.n < MAXF) {               // constrói: um andar novo sobe
        const f = b.fl[b.n];
        f.w = top.w * (0.6 + R() * 0.4); f.d = top.d * (0.6 + R() * 0.4); f.tw = f.w; f.td = f.d; f.h = 0.6 + R() * 1.6 * (0.6 + v);
        f.c = pickC(R, mat); f.t0 = t; f.gone = false; f.gt = -9; f.mt = -9; f.el = c.contour;
        b.n++; counts.builds++;
      } else if (a < 0.52 && !b.split) {          // divide: o prédio abre em dois
        b.split = 1; b.st = t; counts.splits++;
      } else if (a < 0.78) {                      // transforma: o bloco de cima muda de forma e de cor
        if (top.mt > 0) { top.w = top.tw; top.d = top.td; } // outra transformação no meio: parte do alvo da anterior
        top.cw = top.w; top.tw = top.w * (0.5 + R()); top.td = top.d * (0.5 + R()); top.mt = t; top.c = pickC(R, mat); counts.morphs++;
      } else if (b.n > 1) {                       // desconstrói: o andar de cima se desfaz
        top.gone = true; top.gt = t; counts.falls++;
      }
    }
    for (const b of all) {
      // CONTOUR: elasticidade — os prédios à vista quicam com o kick (estica e encolhe, mola)
      if (c.contour > 0.05) { b.bounceT = t; b.bounceA = c.contour * (0.5 + 0.5 * v); }
      // SWEEP: deslocamento e reorganização (os prédios escorregam e giram, devagar)
      if (c.sweep > 0.05) { b.oxT = (R() - 0.5) * 6 * c.sweep; b.rotT = b.rot + (R() - 0.5) * 1.4 * c.sweep; }
      // DISTORTION: inclinação impossível; rachadura; desabamento
      if (c.dist > 0.05) {
        b.skew = Math.max(b.skew, c.dist * (0.5 + R() * 0.5));
        if (c.dist > 0.3 && !b.split && R() < c.dist * 0.25) { b.split = 1; b.st = t; counts.cracks++; }
        if (c.dist > 0.6 && b.n > 1 && R() < (c.dist - 0.55) * 0.5) { collapse(b, t, 0.07); counts.collapses++; }
      }
    }
    // terrenos vazios ao longe ganham prédios que sobem do chão (SHAPE: o que nasce)
    const R2 = rnd, nNew = 1 + Math.round(2 * v), arch = st5(c.shape);
    lastRisen.length = 0;
    for (let i = 0; i < nNew; i++) {
      const b = newBuilding(LOTX[(R2() * LOTX.length) | 0] + (R2() - 0.5) * 2, camZ + 30 + R2() * 40, R2, true);
      if (!b) continue;
      counts.risen++; lastRisen.push(b);
      if (arch && R2() < 0.4 + c.shape * 0.6) { archetype(b, arch, R2, t, mat); counts.archetypes++; }
      for (let j = 0; j < b.n; j++) b.fl[j].el = c.contour;   // CONTOUR: elasticidade
      if (c.pan) b.x += c.pan * 4;
      if (c.pitch) for (let j = 0; j < b.n; j++) b.fl[j].h *= 1 + c.pitch * 0.4;
      b.skew = c.dist * 0.8;
    }
  }
  function bass(v, c) {
    boost = Math.min(2.4, boost + 0.3 + 0.8 * v); counts.boosts++;
    boostK = ANC(c.contour, [2.4, 1.6, 1, 0.6, 0.3]) * ANC(c.decay, [3, 1.8, 1, 0.55, 0.3]); // CONTOUR: rígido → fluido · DECAY: quanto o empurrão dura
    bendT = (c.color > 0.5 ? -1 : 1) * c.shape * 0.7;               // SHAPE: dobra o espaço (COLOR: pra cima ou pra baixo)
    camAmpT = c.sweep;                                              // SWEEP: trajetória da câmera
    camHighT = c.color;                                             // COLOR: identidade do olhar (rua → vista aérea)
    sway = Math.max(sway, c.dist);                                  // DISTORTION: a cidade inteira balança e entorta
    bendK = ANC(c.decay, [1.2, 0.5, 0.15, 0.05, 0.01]);             // DECAY: quanto a dobra do espaço dura
  }
  function hat(v, c) {
    const t = now(), src = B.filter((b) => b.on && b.kind === 0 && b.n > 0 && inView(b));
    const n = 3 + Math.round(12 * v), kind = st5(c.color), mode = st5(c.sweep), life = ANC(c.decay, [0.35, 0.6, 1, 2, 4]);
    for (let i = 0; i < n; i++) {
      const b = src.length ? src[(rnd() * src.length) | 0] : null;
      const p = PC[pNext]; pNext = (pNext + 1) % MAXP;
      let h = 0; if (b) for (let j = 0; j < b.n; j++) if (!b.fl[j].gone) h += b.fl[j].h;
      p.on = true; p.born = t; p.life = life * (0.7 + rnd() * 0.6); p.kind = kind; p.mode = mode; p.asp = 1 + c.shape * 1.5; p.vib = c.contour;
      p.x = b ? b.x + b.ox : (rnd() - 0.5) * 20 + c.pan * 6; p.z = b ? b.z : camZ + 15 + rnd() * 20; p.y = h + 0.2;
      const disp = 1 + c.contour * 1.2;
      p.vx = (rnd() - 0.5) * 4 * (0.6 + v) * disp; p.vz = (rnd() - 0.5) * 4 * disp; p.vy = 3 + rnd() * 5 * (0.5 + v);
      if (mode === 1) { p.y = 9 + rnd() * 5; p.vy = -2 - rnd() * 2; p.vx *= 0.2; p.vz *= 0.2; }                                  // chuva
      else if (mode === 2) { p.ox = p.x; p.oz = p.z; p.ang = rnd() * 6.28; p.rad = 0.6 + rnd() * 1.2 * disp; p.y = h + 0.5 + rnd(); p.w = 3 + 4 * v; } // órbita no telhado
      else if (mode === 3) { p.ox = 0; p.oz = p.z; p.ang = Math.atan2(p.y - 4, p.x); p.rad = Math.abs(p.x) * 0.6 + 2; p.w = 1.5 + 2 * v; } // vórtice na avenida
      else if (mode === 4) { p.vz = -(10 + 8 * v); p.vy = 1 + rnd() * 2; }                                                    // voa pra câmera
      p.s = (0.08 + rnd() * 0.16 * (0.6 + v)) * (1 + c.pitch * 0.4); p.c = (rnd() * 5) | 0; p.rot = rnd() * 6; p.w = mode === 2 || mode === 3 ? p.w : (rnd() - 0.5) * 12;
    }
    counts.piecesSent += n;
  }
  // estilhaços de um prédio que racha (direção pelo SWEEP da caixa)
  function shards(b, n, dir, force, t) {
    let h = 0; for (let j = 0; j < b.n; j++) if (!b.fl[j].gone) h += b.fl[j].h;
    for (let i = 0; i < n; i++) {
      const p = PC[pNext]; pNext = (pNext + 1) % MAXP;
      p.on = true; p.born = t; p.life = 0.7 + rnd() * 0.7; p.kind = 0; p.mode = 0; p.asp = 1; p.vib = 0;
      p.x = b.x + b.ox + (rnd() - 0.5); p.z = b.z + (rnd() - 0.5); p.y = rnd() * h + 0.2;
      const sp = (2 + rnd() * 4) * force;
      p.vx = (rnd() - 0.5) * sp; p.vz = (rnd() - 0.5) * sp; p.vy = rnd() * sp;
      if (dir === 1) p.vx = Math.sign(b.x || 1) * sp * 1.4;
      else if (dir === 2) p.vz = -sp * 2;
      else if (dir === 3) p.vy = -sp;
      else if (dir === 4) { const a = rnd() * 6.28; p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = sp * 0.5; }
      p.s = 0.1 + rnd() * 0.18; p.c = b.fl[0].c; p.rot = rnd() * 6; p.w = (rnd() - 0.5) * 12;
    }
    counts.piecesSent += n;
  }
  function snare(v, c) {
    const org = st5(c.color);
    // COLOR: organização do ambiente — qualquer (original), claros, escuros, invertido, em sequência
    if (org === 4) envI = (envI + 1) % ENV.length;
    else { const pool = org === 1 ? ENV_LIGHT : org === 2 ? ENV_DARK : null; let e;
      if (pool) { do e = pool[(rnd() * pool.length) | 0]; while (e === envI && pool.length > 1); }
      else { e = (rnd() * (ENV.length - 1)) | 0; if (e >= envI) e++; }
      envI = e; }
    envSwap = org === 3 ? !envSwap : false;
    counts.snares++;
    // SHAPE: rachaduras · SWEEP: direção dos estilhaços · CONTOUR: ruptura (desaba)
    // DISTORTION: os prédios à vista entortam juntos (geometria impossível na hora)
    if (c.dist > 0.05) for (const b of B) if (b.on && inView(b)) b.skew = Math.max(b.skew, c.dist * (0.6 + Math.random() * 0.6));
    envT = now(); envLife = ANC(c.decay, [0.35, 0.9, 1e9, 1e9, 1e9]);   // DECAY curto: o ambiente volta ao primeiro
    if (c.shape > 0.08 || c.sweep > 0.1 || c.contour > 0.1) {
      const t = now(), list = B.filter((b) => b.on && b.kind === 0 && b.n > 0 && inView(b));
      const n = Math.min(list.length, Math.max(1, Math.round(c.shape * 6)));
      for (let i = 0; i < n; i++) {
        const b = list.splice((rnd() * list.length) | 0, 1)[0];
        if (!b.split) { b.split = 1; b.st = t; }
        shards(b, 4 + Math.round(6 * v), st5(c.sweep), 0.7 + c.contour * 1.5, t);
        if (c.contour > 0.5 && b.n > 1) { collapse(b, t, 0.05); counts.collapses++; }
        counts.cracks++;
      }
    }
  }
  function chord(v, c) {
    const t = now(), R = rnd, list = B.filter((b) => b.on && b.n > 0 && inView(b));
    const lay = st5(c.color), cfg = st5(c.shape);
    list.forEach((b, i) => {
      // COLOR: alinhamento coletivo (giro-alvo de cada prédio)
      if (lay === 1) b.rotT = 0; else if (lay === 2) b.rotT = Math.PI / 4; else if (lay === 3) b.rotT = i % 2 ? 0.45 : -0.45; else if (lay === 4) b.rotT = Math.sign(b.x || 1) * 0.6;
      // SWEEP: rotação
      if (c.sweep > 0.05) b.rotT += (i % 2 ? 1 : -1) * c.sweep * Math.PI * 0.5;
      // SHAPE: configuração — os andares de cima ganham as mesmas proporções
      if (cfg && b.kind === 0) {
        const top = b.fl[b.n - 1];
        if (top.mt > 0) { top.w = top.tw; top.d = top.td; }
        top.cw = top.w; top.mt = t;
        const base = b.fl[0].w;
        if (cfg === 1) { top.tw = base * 0.35; top.td = top.d * 0.5; } else if (cfg === 2) { top.tw = base * 1.2; top.td = top.d * 1.2; }
        else if (cfg === 3) { top.tw = base * (0.45 + 0.1 * (i % 3)); top.td = top.tw; } else { top.tw = base * (i % 2 ? 0.4 : 1.1); top.td = top.d; }
      }
      // CONTOUR: articulação → andares se afastam
      b.gap = Math.max(b.gap, c.contour * 0.9);
    });
    // SWEEP: ondulação das alturas e, no fim do knob, inversão (prédios viram de cabeça pra baixo)
    wave = Math.max(wave, Math.max(0, c.sweep - 0.3) * 1.6);
    if (c.sweep > 0.8) { const cand = list.filter((b) => b.kind === 0 && b.flipT < 0); for (let i = 0; i < Math.min(2, cand.length); i++) { const b = cand[(R() * cand.length) | 0]; b.flipT = t; b.flipTo = 3; counts.flips++; } }
    // DISTORTION: a reorganização sai torta (inclinação impossível coletiva) · DECAY: quanto dura
    if (c.dist > 0.05) for (const b of list) b.skew = Math.max(b.skew, c.dist);
    gapK = ANC(c.decay, [3, 1.8, 1.1, 0.5, 0.2]); waveK = ANC(c.decay, [1.5, 0.9, 0.5, 0.25, 0.1]);
    // CONTOUR no fim: desmontagem
    if (c.contour > 0.85) for (const b of list.slice(0, 3)) if (b.n > 1) { collapse(b, t, 0.1); b.gap = 1.6; }
    counts.chords++;
  }
  function perc(v, c) {
    if (!figs) return;
    const side = rnd() < 0.5 ? -1 : 1;
    figs.spawn(c, { x: side * (3.7 + rnd() * 1.4) + c.pan * 2, y: 0, z: camZ + 8 + rnd() * 22, dir: rnd() < 0.5 ? -1 : 1, vz: (rnd() - 0.5) * 0.4 }, now());
    counts.percs++;
  }
  // réplicas: delay = o mesmo prédio repetido mais adiante na avenida (fila em perspectiva);
  // reverb = cópias menores lá no fundo, sumindo no ponto de fuga
  function echo(type, v, c) {
    counts.echoes++;
    const t = now();
    if (type === "kick") {
      for (const o of lastRisen.slice(0, 1)) {
        if (!o.on) continue;
        const rev = c.echo === "reverb", z = rev ? camZ + FAR - 4 - c.replica : o.z + c.replica * ROW * 1.5;
        const b = newBuilding(o.x, z, rnd, true); if (!b) continue;
        const k = Math.pow(rev ? 0.6 : 0.85, c.replica);
        b.kind = o.kind; b.n = o.n; b.hang = o.hang; b.rot = b.rotT = o.rot; b.sphere = o.sphere; b.skew = o.skew;
        for (let j = 0; j < o.n; j++) { const a = o.fl[j], f = b.fl[j]; f.w = f.tw = a.w * k; f.d = f.td = a.d * k; f.h = a.h * k; f.c = a.c; f.gone = false; f.mt = -9; f.el = a.el; f.t0 = t + j * 0.05; }
      }
    } else if (type === "hat") hat(v * 0.6, c);
    else if (type === "snare") { const l = B.filter((b) => b.on && b.kind === 0 && b.n > 0 && inView(b) && !b.split); if (l.length) { const b = l[(rnd() * l.length) | 0]; b.split = 1; b.st = t; } }
    else if (type === "bass") boost = Math.min(2.4, boost + 0.15 * v);
    else if (type === "chord") wave = Math.max(wave, 0.25 * v);
    else if (type === "perc") perc(v, c);
  }
  function hit(type, amount = 1, ctx) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    const c = ctx || { ...PR(type), v };
    if (c.replica) return echo(type, v, c);
    if (type === "kick") kick(v, c); else if (type === "bass") bass(v, c); else if (type === "hat") hat(v, c); else if (type === "snare") snare(v, c);
    else if (type === "chord") chord(v, c); else if (type === "perc") perc(v, c);
  }

  // ---------- quadro ----------
  const order = [];
  const proj = () => null;
  let projFig = proj;
  const S = createStage(canvas, (dt, t) => {
    const vis = VIS();
    boost *= Math.exp(-dt * boostK);
    bend += (bendT - bend) * (1 - Math.exp(-dt * 1.5)); bendT *= Math.exp(-dt * bendK);
    camHigh += (camHighT - camHigh) * (1 - Math.exp(-dt * 0.6)); sway *= Math.exp(-dt * 0.5);
    camAmp += (camAmpT - camAmp) * (1 - Math.exp(-dt * 0.8));
    wave *= Math.exp(-dt * waveK);
    posS += (vis.pos - posS) * (1 - Math.exp(-dt * 4));
    camZ += dt * 5.2 * speed * (1 + boost);
    while (rowNext * ROW < camZ + FAR) makeRow(rowNext++);
    for (const b of B) {
      if (!b.on) continue;
      if (b.z < camZ - 4) { b.on = false; continue; }   // ficou pra trás: libera
      const k = 1 - Math.exp(-dt * 1.6);
      b.ox += (b.oxT - b.ox) * k; b.rot += (b.rotT - b.rot) * k;
      b.gap *= Math.exp(-dt * gapK);
      // DECAY: o tempo dele acabou — desconstrói de cima pra baixo
      if (!b.dying && t - b.born > b.life && b.n > 0) { b.dying = true; for (let j = b.n - 1; j >= 0; j--) { const f = b.fl[j]; f.gone = true; f.gt = t + (b.n - 1 - j) * 0.12; } counts.decons++; }
      if (b.flipT > 0 && t - b.flipT > 0.35 && b.kind !== b.flipTo) { b.kind = b.flipTo; b.hang = 12 + Math.random() * 6; }
    }
    const T = t - t0;
    // câmera: avança sempre, serpenteia devagar pela avenida (nunca no mesmo caminho);
    // SWEEP do baixo abre a trajetória (curvas largas, órbita, espiral)
    const amp = 1 + camAmp * 2.4;
    const cxw = (Math.sin(T * 0.071) * 1.3 + Math.sin(T * 0.023) * 0.6) * amp + posS * 2.5, cyw = 1.7 + (Math.sin(T * 0.11) * 0.45 + Math.sin(T * 0.037) * 0.3) * (1 + camAmp * 1.5) + camAmp * 1.2 * (1 + Math.sin(T * 0.21)) + camHigh * 7;
    const yaw = (Math.sin(T * 0.049) * 0.13 + Math.sin(T * 0.017) * 0.07) * (1 + camAmp * 2) + vis.rot * 0.25, pitch = 0.05 + Math.sin(T * 0.083) * 0.05 - camAmp * 0.06 - camHigh * 0.32;
    lookAt(C, cxw, cyw, camZ, cxw + Math.sin(yaw) * 10, cyw + pitch * 10, camZ + Math.cos(yaw) * 10);
    C.f = (Math.min(S.W, S.H) * 0.95 / persp) * (1 + vis.persp * 0.4);
    C.bend = Math.abs(bend) > 0.01 ? bend : 0;
    if (envLife < 1e8 && t - envT > envLife) { envLife = 1e9; envI = 0; envSwap = false; }
    let [sky, ground] = ENV[envI];
    if (envSwap) [sky, ground] = [ground, sky];
    const ctx = S.ctx;
    ctx.lineJoin = "round"; ctx.lineWidth = 0.8;
    ctx.fillStyle = HEX[sky]; ctx.fillRect(0, 0, S.W, S.H);
    // chão até o horizonte (sólido) e as linhas das ruas (profundidade)
    ctx.fillStyle = HEX[ground];
    if (!C.bend) {
      toCam(C, cxw, 0, camZ + 400, BOXV, 0);
      const hy = S.cy - (C.f * BOXV[1][0]) / Math.max(1, BOXV[2][0]);
      ctx.fillRect(0, Math.max(0, hy), S.W, S.H - hy);
    } else { // espaço dobrado: o chão é uma faixa que sobe (ou desce) com a distância
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) { const zz = camZ + 0.6 + (i / 14) ** 2 * FAR * 1.3; toCam(C, cxw - 90, 0, zz, BOXV, 0); const z = Math.max(C.near, BOXV[2][0]); const sx = S.cx + (C.f * BOXV[0][0]) / z, sy = S.cy - (C.f * BOXV[1][0]) / z; if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
      for (let i = 14; i >= 0; i--) { const zz = camZ + 0.6 + (i / 14) ** 2 * FAR * 1.3; toCam(C, cxw + 90, 0, zz, BOXV, 0); const z = Math.max(C.near, BOXV[2][0]); ctx.lineTo(S.cx + (C.f * BOXV[0][0]) / z, S.cy - (C.f * BOXV[1][0]) / z); }
      ctx.closePath(); ctx.fill();
    }
    const lineCol = TONE[NAMES.indexOf(ground)][ground === "black" ? 0 : 2];
    ctx.strokeStyle = lineCol; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const lx of [-3.2, 3.2, -19, 19]) {
      if (!C.bend) {
        toCam(C, lx, 0, camZ + 1, BOXV, 0); toCam(C, lx, 0, camZ + FAR, BOXV, 1);
        if (BOXV[2][0] > C.near) { ctx.moveTo(S.cx + C.f * BOXV[0][0] / BOXV[2][0], S.cy - C.f * BOXV[1][0] / BOXV[2][0]); ctx.lineTo(S.cx + C.f * BOXV[0][1] / BOXV[2][1], S.cy - C.f * BOXV[1][1] / BOXV[2][1]); }
      } else for (let i = 0; i <= 10; i++) { const zz = camZ + 1 + (i / 10) ** 2 * (FAR - 1); toCam(C, lx, 0, zz, BOXV, 0); if (BOXV[2][0] < C.near) continue; const sx = S.cx + C.f * BOXV[0][0] / BOXV[2][0], sy = S.cy - C.f * BOXV[1][0] / BOXV[2][0]; if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
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
    const dOf = (id) => (id < MAXB ? depthOf(C, B[id].x + B[id].ox, 2, B[id].z) : depthOf(C, PC[id - MAXB].x, PC[id - MAXB].y, PC[id - MAXB].z));
    order.sort((a, b) => dOf(b) - dOf(a));
    const grav = 14 * (1 + vis.gravity), hscale = 1 + vis.scale * 0.3, geo = vis.geom * 0.5;
    for (const id of order) {
      if (id < MAXB) drawBuilding(B[id], t, sky, T, hscale, geo);
      else {
        const p = PC[id - MAXB], a = t - p.born;
        if (a > p.life) { p.on = false; continue; }
        if (p.mode === 2) { p.ang += p.w * dt; p.x = p.ox + Math.cos(p.ang) * p.rad; p.z = p.oz + Math.sin(p.ang) * p.rad; p.y += dt * 0.3; p.rot += dt * 3; }
        else if (p.mode === 3) { p.ang += p.w * dt; p.rad = Math.max(0.5, p.rad - dt * 0.8); p.x = Math.cos(p.ang) * p.rad; p.y = 4 + Math.sin(p.ang) * p.rad; p.z -= dt * 3; p.rot += dt * 4; }
        else {
          p.vy -= (p.mode === 1 ? 3 : p.mode === 4 ? 2 : grav) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.w * dt;
          if (p.y < p.s) { p.y = p.s; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
        }
        const k = 1 - Math.max(0, (a - p.life * 0.6) / (p.life * 0.4)); // encolhe no fim
        const s = p.s * k, col = visibleOn(p.c, sky);
        const jx = p.vib > 0.05 ? (Math.random() - 0.5) * p.vib * s * 1.5 : 0;
        if (p.kind === 1) drawSphere(S, C, p.x + jx, p.y, p.z, s, col);
        else if (p.kind === 2) drawBox(S, C, p.x + jx, p.y, p.z, s * 1.5 * p.asp, s * 0.22, s * 1.5, p.rot, col);             // disco/placa
        else if (p.kind === 3) drawBox(S, C, p.x + jx, p.y, p.z, s * 0.22, s * 2 * p.asp, s * 0.22, p.rot, col);              // agulha
        else if (p.kind === 4) drawCrystal(S, C, p.x + jx, p.y, p.z, s * p.asp, p.rot, col);                                   // cristal
        else drawBox(S, C, p.x + jx, p.y, p.z, s, s * (p.asp > 1.05 ? p.asp : 1), s, p.rot, col);                              // cubo (original)
      }
    }
    if (figs) {
      figs.update(dt, t, 0, PR("perc"));
      if (projFig === proj) projFig = figProjector(S, C);
      figs.draw(ctx, projFig, [HEX.red, HEX.blue, HEX.yellow, sky === "black" ? HEX.cream : HEX.black], TONE[3][0], HEX[sky], t);
    }
    // LFO → peças contínuas entre as notas
    if (vis.frag > 0.05 && Math.random() < vis.frag * dt * 12) hat(0.3 * vis.frag, { ...NEU });
  });

  // altura elástica do andar subindo (CONTOUR): 0 = a original (passa um pouco e volta)
  const elastic = (k, e) => (e < 0.05 ? easeBack(k) : k >= 1 ? 1 : 1 - (1 - k) * (1 - k) * Math.cos(k * Math.PI * (1 + 3 * e)));
  function drawBuilding(b, t, sky, T, hscale, geo) {
    const bx = b.x + b.ox;
    const dz = depthOf(C, bx, 2, b.z);
    if (dz < -8 || dz > FAR + 10) return;
    let grow = clamp((FAR - (b.z - camZ)) / 10, 0, 1); // no horizonte nasce baixinho e cresce
    if (b.flipT > 0) { const fk = clamp((t - b.flipT) / 0.7, 0, 1); grow *= fk < 0.5 ? 1 - fk * 2 : (fk - 0.5) * 2; }  // inversão: encolhe e volta pendurado
    if (wave > 0.01) grow *= 1 + wave * 0.35 * Math.sin(b.z * 0.25 + T * 3);
    if (b.bounceA) { const ba = t - b.bounceT; if (ba < 1.2) grow *= 1 + b.bounceA * 0.3 * Math.exp(-ba * 4) * Math.sin(ba * 20); else b.bounceA = 0; }
    grow *= hscale;
    const skew = b.skew + geo + (sway > 0.01 ? sway * 0.6 * Math.sin(T * 2.2 + b.z * 0.3) : 0);
    if (b.kind === 3) { // torre pendurada no céu (de cabeça pra baixo)
      let y = b.hang;
      for (let i = 0; i < b.n; i++) { const f = b.fl[i]; if (f.gone && t - f.gt > 0.45) continue; const h = f.h * grow * (f.gone ? 1 - clamp((t - f.gt) / 0.45, 0, 1) : 1); if (h <= 0.001) continue; drawBox(S, C, bx + skew * i * 0.3, y - h / 2, b.z, f.w / 2, h / 2, f.d / 2, b.rot + (i % 2 ? 1 : -1) * skew * 0.4, visibleOn(f.c, sky)); y -= h + b.gap * 0.5; }
      return;
    }
    if (b.kind === 4) { // escada que sobe de lado (degraus = blocos)
      for (let i = 0; i < b.n; i++) {
        const f = b.fl[i]; const k = clamp((t - f.t0) / (0.38 * (1 + f.el * 1.6)), 0, 1); let h = f.h * elastic(k, f.el) * grow;
        if (f.gone) { const g = clamp((t - f.gt) / 0.45, 0, 1); if (g >= 1) continue; h *= 1 - g; }
        if (h <= 0.001) continue;
        const off = (i - b.n / 2) * f.w;
        drawBox(S, C, bx + Math.cos(b.rot) * off, h / 2 + skew * i * 0.25, b.z - Math.sin(b.rot) * off, f.w / 2, h / 2, f.d / 2, b.rot, visibleOn(f.c, sky));
      }
      return;
    }
    if (b.kind === 5) { // portal: dois pilares e a viga (a viga só aparece com os pilares de pé)
      const span = b.fl[2].w / 2 - b.fl[0].w / 2;
      for (let i = 0; i < 3; i++) {
        const f = b.fl[i]; const k = clamp((t - f.t0) / (0.38 * (1 + f.el * 1.6)), 0, 1); let h = f.h * elastic(k, f.el) * grow;
        if (f.gone) { const g = clamp((t - f.gt) / 0.45, 0, 1); if (g >= 1) continue; h *= 1 - g; }
        if (h <= 0.001) continue;
        if (i < 2) { const off = (i ? 1 : -1) * span; drawBox(S, C, bx + Math.cos(b.rot) * off, h / 2, b.z - Math.sin(b.rot) * off, f.w / 2, h / 2, f.d / 2, b.rot, visibleOn(f.c, sky)); }
        else { const hp = b.fl[0].h * grow; drawBox(S, C, bx + skew * 0.6, hp + h / 2 + b.gap, b.z, f.w / 2, h / 2, f.d / 2, b.rot + skew * 0.3, visibleOn(f.c, sky)); }
      }
      return;
    }
    const sp = b.split ? easeOut(clamp((t - b.st) / 0.4, 0, 1)) : 0;
    const halves = sp > 0 ? 2 : 1;
    for (let hlf = 0; hlf < halves; hlf++) {
      let y = b.kind === 0 ? 0 : b.hang;
      const off = halves === 2 ? (hlf ? 1 : -1) : 0;
      for (let i = 0; i < b.n; i++) {
        const f = b.fl[i];
        let k = clamp((t - f.t0) / (0.38 * (1 + f.el * 1.6)), 0, 1), h = f.h * elastic(k, f.el) * grow;
        if (f.gone) { const g = clamp((t - f.gt) / 0.45, 0, 1); if (g >= 1) { if (i === b.n - 1) b.n--; continue; } h *= 1 - g; y += f.h * g * 0.8; }
        if (h <= 0.001) continue;
        let w = f.w, d = f.d;
        if (f.mt > 0) { const m = easeOut(clamp((t - f.mt) / 0.35, 0, 1)); w = f.cw + (f.tw - f.cw) * m; d = f.d + (f.td - f.d) * m; if (m >= 1) { f.w = f.tw; f.d = f.td; f.mt = -9; } }
        // dividido: cada metade com metade da largura, afastando-se
        const hw = halves === 2 ? w / 4 : w / 2;
        const gap = halves === 2 ? (w / 4 + sp * 0.35) * off : 0;
        // DISTORTION: cada andar escorrega e gira um pouco mais (empilhamento impossível)
        const sk = skew * i * 0.32, rr = b.rot + (i % 2 ? 1 : -1) * skew * 0.45 * (i > 0);
        drawBox(S, C, bx + Math.cos(b.rot) * gap + sk, y + h / 2, b.z - Math.sin(b.rot) * gap, hw, h / 2, d / 2, rr, visibleOn(f.c, sky));
        y += h + b.gap * (i + 1 < b.n ? 0.6 : 0);
      }
      if (b.sphere >= 0 && b.kind === 0 && b.n > 0) drawSphere(S, C, bx + (halves === 2 ? (b.fl[0].w / 4 + sp * 0.35) * off : 0) + skew * b.n * 0.32, y + 0.45 * grow, b.z, 0.45 * Math.min(1, grow), visibleOn(b.sphere, sky));
    }
  }

  reset();
  const state = () => {
    const buildings = B.reduce((n, b) => n + (b.on ? 1 : 0), 0), pieces = PC.reduce((n, p) => n + (p.on ? 1 : 0), 0), walkers = figs ? figs.active() : 0;
    return { ...counts, buildings, pieces, walkers, objects: buildings + pieces + walkers, boost: +boost.toFixed(3), env: envI, envSwap, bend: +bend.toFixed(2), camAmp: +camAmp.toFixed(2), wave: +wave.toFixed(2),
      kinds: B.reduce((a, b) => { if (b.on) a[b.kind] = (a[b.kind] || 0) + 1; return a; }, {}), skewed: B.reduce((n, b) => n + (b.on && b.skew > 0.05 ? 1 : 0), 0), speed, persp, quality: +S.quality.toFixed(2) };
  };
  return {
    hit, reset, canvas, state,
    setSpeed: (x) => { if (Number.isFinite(+x)) speed = clamp(+x, 0.2, 3); },
    setPerspective: (x) => { if (Number.isFinite(+x)) persp = clamp(+x, 0.5, 2.5); },
    setBpm: (b) => { if (b > 30 && b < 300) bpm = b; },
    destroy: () => { S.destroy(); order.length = 0; if (figs) figs.clear(); },
  };
}

// =====================================================================================
// 032 — MAGNETIC BALLET
// Pequenas esculturas (esferas, cubos, barras, cilindros) flutuando; a câmera orbita sem parar.
// Cada peça tem um lugar de descanso que passeia devagar; forças magnéticas juntam e
// separam as peças em grupos; elas nunca se atravessam (empurram-se de leve).
// Grupos se formam e se desfazem AO MESMO TEMPO: cada kick ativa um par de ímãs (atrai) e
// o outro par solta o seu grupo (repele de leve).
// - KICK  atração magnética. COLOR identidade do grupo (cores) · SHAPE as peças atraídas viram
//         cubos, cilindros, esculturas… · SWEEP direção da força (radial, colunas, anel,
//         espiral, vento) · CONTOUR elasticidade, tensão e conexões (fios entre as peças) ·
//         DISTORTION assimetria e ruptura · DECAY quanto dura a atração
// - BASS  a rotação acelera. SHAPE estica as peças · SWEEP trajetória da câmera · CONTOUR
//         rigidez → fluidez · COLOR sentido da órbita
// - HAT   fragmentação, impulsos e metamorfoses. COLOR fragmentos (esfera, disco, agulha,
//         cristal) · SHAPE angulosidade · SWEEP explosão/chuva/órbita/vórtice/voo · CONTOUR
//         vibração e dispersão · DECAY vida dos fragmentos
// - SNARE repulsão magnética e o fundo muda de cor. COLOR organização do fundo · SHAPE cortes ·
//         SWEEP direção da explosão · CONTOUR força da ruptura
// - CHORD formação coletiva: COLOR distribuição (esfera, anel, grade, hélice, arco) · SHAPE
//         configuração das formas · SWEEP rotação/ondulação/inversão · CONTOUR articulação →
//         expansão → desmontagem
// - PERC  figuras dançando no chão (pessoas, animais, objetos, símbolos)
// =====================================================================================
export function createMagneticBallet(canvas) {
  const C = makeCam();
  let speed = 1, persp = 1, bpm = null;
  const BGS = [["cream", "cream"], ["black", "black"], ["blue", "blue"], ["yellow", "yellow"], ["red", "red"]];
  const MAXN = 150, BASEN = 64, MAG = 4;
  // tipos: 0 esfera, 1 cubo, 2 barra (os originais) · 3 cilindro, 4 escultura · fragmentos: 5 disco, 6 agulha, 7 cristal
  const P = Array.from({ length: MAXN }, () => ({
    on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hx: 0, hy: 0, hz: 0, ph: 0, type: 0, s: 0.4, c: 0,
    rot: 0, w: 0, born: 0, life: 0, mt: -9, nextType: 0, frag: false, g: 0,
    h0x: 0, h0y: 0, h0z: 0, tx: 0, ty: 0, tz: 0, hasT: false, vib: 0, mag: 0, warp: 0,
  }));
  const M = Array.from({ length: MAG }, (_, i) => ({ x: 0, y: 0, z: 0, ph: i * 1.7, a: 0, r: 0, w: 1, ox: 0, oy: 0, oz: 0, col: -1 }));
  let attract, repel, spin, spinK, orbit, orbitDir, orbitDirT, bgI, bgI2, bgMode, counts, t0 = now();
  let kickN, force, forceAmt, tension, decayK, stretch, stretchT, camAmp, camAmpT, und, formRot, figs, lastPiece;
  let stretchK = 0.3, bgT = -9, bgLife = 1e9, formT = -9, formLife = 1e9;

  function spawn(x, y, z, frag) {
    const p = P.find((q) => !q.on);
    if (!p) return null;
    const t = now(), r = 2.5 + Math.random() * 3.5, a = Math.random() * 6.283, e = (Math.random() - 0.5) * 1.6;
    p.on = true; p.frag = !!frag; p.born = t; p.life = frag ? 4 + Math.random() * 4 : 0; p.mt = -9;
    p.hx = Math.cos(a) * Math.cos(e) * r; p.hy = Math.sin(e) * r * 0.7; p.hz = Math.sin(a) * Math.cos(e) * r;
    p.h0x = p.hx; p.h0y = p.hy; p.h0z = p.hz; p.hasT = false; p.vib = 0; p.mag = 0; p.warp = 0;
    p.x = x ?? p.hx; p.y = y ?? p.hy; p.z = z ?? p.hz; p.vx = p.vy = p.vz = 0;
    p.ph = Math.random() * 100; p.type = (Math.random() * 3) | 0; p.nextType = p.type;
    p.s = (frag ? 0.12 + Math.random() * 0.12 : 0.22 + Math.random() * 0.28);
    p.c = (Math.random() * 5) | 0; p.rot = Math.random() * 6.28; p.w = (Math.random() - 0.5) * 1.5; p.g = 0;
    return p;
  }
  function reset() {
    for (const p of P) p.on = false;
    for (let i = 0; i < BASEN; i++) spawn();
    attract = 0; repel = 0; spin = 0; spinK = 1.2; orbit = Math.random() * 6.28; orbitDir = 1; orbitDirT = 1; bgI = 0; bgI2 = 1; bgMode = 0;
    kickN = 0; force = 0; forceAmt = 0; tension = 0; decayK = 0.9; stretch = 0; stretchT = 0; camAmp = 0; camAmpT = 0; und = 0; formRot = 0; lastPiece = null;
    stretchK = 0.3; bgT = -9; bgLife = 1e9; formT = -9; formLife = 1e9;
    for (const m of M) { m.a = 0; m.r = 0; m.w = 1; m.ox = m.oy = m.oz = 0; m.col = -1; }
    counts = { attracts: 0, spins: 0, frags: 0, impulses: 0, morphs: 0, repels: 0, chords: 0, percs: 0, ruptures: 0, echoes: 0, dissolves: 0 };
    if (figs) figs.clear(); else figs = FIGS() ? FIGS().swarm({ max: 20, size: 0.5 }) : null;
  }
  const nearestMag = (p) => { let best = M[0], bd = 1e9; for (const m of M) { const d = (p.x - m.x) ** 2 + (p.y - m.y) ** 2 + (p.z - m.z) ** 2; if (d < bd) { bd = d; best = m; } } return best; };
  const GROUPC = [[0, 1, 2, 3], [0, 2, 0, 2], [1, 3, 1, 3], [4, 3, 4, 3]];
  function morphTo(p, type) { if (p.type === type && p.mt < 0) return; p.nextType = type; p.mt = now(); counts.morphs++; }
  function fragment(p, k, v, kind, dir, disp, life) {
    for (let j = 0; j < k; j++) {
      const f = spawn(p.x, p.y, p.z, true); if (!f) return;
      f.c = p.c; const sp = 6 * (0.5 + v) * disp;
      f.vx = (Math.random() - 0.5) * sp; f.vy = (Math.random() - 0.5) * sp; f.vz = (Math.random() - 0.5) * sp;
      if (dir === 1) { f.vy = -Math.abs(f.vy) - sp * 0.3; }                                 // chuva / desce
      else if (dir === 2) { const r = Math.hypot(f.x, f.z) || 1; f.vx = -f.z / r * sp * 0.6; f.vz = f.x / r * sp * 0.6; } // órbita (tangente)
      else if (dir === 3) { const r = Math.hypot(f.x, f.z) || 1; f.vx = -f.z / r * sp * 0.4; f.vz = f.x / r * sp * 0.4; f.vy = Math.abs(f.vy) + sp * 0.4; } // vórtice subindo
      else if (dir === 4) { f.vx = -C.fx * sp; f.vy = -C.fy * sp; f.vz = -C.fz * sp; }       // voa pra câmera
      if (kind) f.type = kind; if (life) f.life = life * (0.7 + Math.random() * 0.6);
    }
  }

  // ---------- instrumentos ----------
  function kick(v, c) {
    attract = Math.min(3, attract + 0.9 + 1.6 * v); counts.attracts++;
    kickN++;
    // grupos se formam (par ativo) e se desfazem (o outro par) ao mesmo tempo
    const asym = c.dist;
    M.forEach((m, i) => {
      const on = (i + kickN) % 2 === 0;
      if (on) m.a = Math.min(3, m.a + 0.9 + 1.6 * v); else { m.r = Math.min(2, m.r + 0.3 + 0.6 * v); m.a *= 0.4; counts.dissolves++; }
      // DISTORTION: assimetria (um ímã domina, os outros se deslocam)
      m.w = 1 + asym * (i === kickN % MAG ? 0.9 : -0.35);
      if (asym > 0.05) { m.ox = (Math.random() - 0.5) * asym * 3; m.oy = (Math.random() - 0.5) * asym * 2; m.oz = (Math.random() - 0.5) * asym * 3; } else { m.ox = m.oy = m.oz = 0; }
    });
    force = st5(c.sweep); forceAmt = c.sweep;                  // SWEEP: direção da força
    tension = c.contour;                                        // CONTOUR: elasticidade e conexões
    decayK = ANC(c.decay, [3, 1.6, 0.9, 0.45, 0.15]);           // DECAY: quanto dura a atração
    const grp = st5(c.color), sh = st5(c.shape);
    for (const p of P) {
      if (!p.on || p.frag) continue;
      const m = nearestMag(p), i = M.indexOf(m);
      if (!((i + kickN) % 2 === 0)) continue;
      const d = Math.hypot(p.x - m.x, p.y - m.y, p.z - m.z);
      if (d > 3.2) continue;
      if (grp) p.c = GROUPC[grp - 1][i];                                                       // COLOR: identidade do grupo
      if (sh) morphTo(p, sh === 4 ? [0, 1, 3][(p.ph | 0) % 3] : sh === 1 ? 1 : sh === 2 ? 3 : 4); // SHAPE: cubos, cilindros, esculturas
      lastPiece = p;
      // DISTORTION alta: ruptura — as peças mais perto do ímã se partem
      if (asym > 0.6 && d < 1.2 && Math.random() < (asym - 0.55)) { fragment(p, 2, v, 0, 0, 1, 0); p.g = 1; counts.ruptures++; }
    }
  }
  function bass(v, c) {
    spin = Math.min(3, spin + 0.4 + 1.1 * v); counts.spins++;
    spinK = ANC(c.contour, [1.2, 0.8, 0.5, 0.3, 0.15]);         // CONTOUR: rígido → fluido
    stretchT = c.shape;                                         // SHAPE: estica as peças
    camAmpT = c.sweep;                                          // SWEEP: trajetória da câmera
    orbitDirT = c.color > 0.5 ? -1 : 1;                         // COLOR: sentido da órbita (vira devagar)
    if (c.dist > 0.05) for (const p of P) if (p.on && !p.frag) p.warp = Math.max(p.warp, c.dist * 0.8); // DISTORTION: todas as peças entortam
    stretchK = ANC(c.decay, [2, 0.8, 0.3, 0.12, 0.04]);         // DECAY: quanto o estiramento dura
  }
  function hat(v, c) {
    const alive = P.filter((p) => p.on && !p.frag);
    const n = 1 + Math.round(3 * v);
    const kind = [0, 0, 5, 6, 7][st5(c.color)], dir = st5(c.sweep), disp = 1 + c.contour * 1.2, life = ANC(c.decay, [1, 2.5, 6, 12, 25]);
    for (let i = 0; i < n && alive.length; i++) {
      const p = alive[(Math.random() * alive.length) | 0], a = Math.random();
      p.vib = c.contour;
      if (c.dist > 0.05) p.warp = Math.max(p.warp, c.dist);      // DISTORTION: a peça atingida entorta
      if (a < 0.4) {                     // fragmenta: solta pedacinhos que saem voando
        const k = 2 + Math.round(2 * v);
        fragment(p, k, v, kind, dir, disp, c.decay === 0.5 && !kind && !dir ? 0 : life);
        p.g = 1; counts.frags++;
      } else if (a < 0.75) {             // impulso: um salto pra uma direção qualquer
        const s = (3 + 6 * v) * disp; p.vx += (Math.random() - 0.5) * s; p.vy += (Math.random() - 0.5) * s; p.vz += (Math.random() - 0.5) * s; counts.impulses++;
      } else {                           // metamorfose: vira outra forma (SHAPE alto: formas angulosas)
        morphTo(p, c.shape > 0.5 ? (Math.random() < 0.5 ? 1 : 2) : (p.type + 1 + ((Math.random() * 2) | 0)) % 3);
      }
    }
  }
  function snare(v, c) {
    repel = Math.min(3, repel + 1 + 2 * v);
    const dir = st5(c.sweep), k0 = (2.5 + 5 * v) * (1 + c.contour * 1.5);
    for (const p of P) {
      if (!p.on) continue;
      const m = nearestMag(p); let dx = p.x - m.x, dy = p.y - m.y, dz = p.z - m.z; const d = Math.hypot(dx, dy, dz) || 1;
      // SWEEP: direção da explosão — radial (original), pra cima, pra baixo, lateral, pra câmera
      // direções simétricas (cada lado do grupo vai pro seu lado: nada se acumula num canto):
      // radial (original), vertical, plano horizontal, lateral (na tela), em profundidade
      if (dir === 1) { dx *= 0.2; dz *= 0.2; dy = Math.sign(dy || 1) * d; }
      else if (dir === 2) { dy *= 0.1; }
      else if (dir === 3 || dir === 4) { const ux = dir === 3 ? C.rx : C.fx, uy = dir === 3 ? C.ry : C.fy, uz = dir === 3 ? C.rz : C.fz, sg = Math.sign(dx * ux + dy * uy + dz * uz || 1); dx = ux * sg * d; dy = uy * sg * d; dz = uz * sg * d; }
      const dd = Math.hypot(dx, dy, dz) || 1, k = k0 / dd; p.vx += dx * k; p.vy += dy * k; p.vz += dz * k;
    }
    let b = (Math.random() * (BGS.length - 1)) | 0; if (b >= bgI) b++; bgI = b;
    bgMode = st5(c.color);                                       // COLOR: organização do fundo
    bgT = now(); bgLife = ANC(c.decay, [0.3, 0.8, 1e9, 1e9, 1e9]); // DECAY curto: o fundo volta ao creme
    if (bgMode) { let b2 = (Math.random() * (BGS.length - 1)) | 0; if (b2 >= bgI) b2++; bgI2 = b2; }
    attract *= 0.3; for (const m of M) m.a *= 0.3;
    // SHAPE: cortes — algumas peças se partem
    if (c.shape > 0.08) { const alive = P.filter((p) => p.on && !p.frag); for (let i = 0; i < Math.round(c.shape * 8) && alive.length; i++) { const p = alive.splice((Math.random() * alive.length) | 0, 1)[0]; fragment(p, 2 + Math.round(2 * v), v, 0, dir, 1 + c.contour, 0); p.g = 1; } }
    counts.repels++;
  }
  function chord(v, c) {
    const lay = st5(c.color), cfg = st5(c.shape), list = P.filter((p) => p.on && !p.frag), n = list.length;
    const exp = 1 + c.contour * 0.8, inv = c.sweep > 0.8 ? -1 : 1;
    formRot += (0.3 + c.sweep) * (Math.random() < 0.5 ? -1 : 1);     // SWEEP: rotação da formação
    list.forEach((p, i) => {
      // COLOR: distribuição — esfera (a original), anel, grade, hélice, arco
      let x = p.h0x, y = p.h0y, z = p.h0z;
      if (lay === 1) { const a = (i / n) * 6.283; x = Math.cos(a) * 4.5; z = Math.sin(a) * 4.5; y = ((i % 3) - 1) * 0.5; }
      else if (lay === 2) { x = ((i % 4) - 1.5) * 1.7; y = (((i / 4) | 0) % 4 - 1.5) * 1.5; z = (((i / 16) | 0) % 4 - 1.5) * 1.7; }
      else if (lay === 3) { const a = i * 0.55; x = Math.cos(a) * 3; z = Math.sin(a) * 3; y = (i / n - 0.5) * 7; }
      else if (lay === 4) { const a = (i / n - 0.5) * 2.6; x = Math.sin(a) * 5.5; z = Math.cos(a) * 5.5 - 3; y = Math.sin(i * 0.9) * 0.4; }
      const ca = Math.cos(formRot), sa = Math.sin(formRot);
      p.tx = (x * ca - z * sa) * exp; p.tz = (x * sa + z * ca) * exp; p.ty = y * exp * inv; p.hasT = true;
      // SHAPE: configuração das formas (todas iguais, alternadas, ciclo)
      if (cfg) morphTo(p, cfg === 1 ? 0 : cfg === 2 ? [0, 1][i % 2] : cfg === 3 ? [1, 2, 3][i % 3] : 4);
    });
    und = Math.max(und, Math.max(0, c.sweep - 0.3) * 1.6);               // SWEEP: ondulação
    formT = now(); formLife = ANC(c.decay, [1.5, 3, 10, 40, 1e9]);       // DECAY: quanto a formação dura antes de se soltar
    if (c.contour > 0.85) { for (let i = 0; i < Math.round(n * 0.25); i++) { const p = list[(Math.random() * n) | 0]; fragment(p, 2, v, 0, 0, 1.5, 0); p.g = 1; } } // desmontagem
    counts.chords++;
  }
  function perc(v, c) {
    if (!figs) return;
    const a = Math.random() * 6.283, r = 2 + Math.random() * 4.5;
    figs.spawn(c, { x: Math.cos(a) * r, y: FLOOR, z: Math.sin(a) * r, dir: Math.random() < 0.5 ? -1 : 1, vz: (Math.random() - 0.5) }, now());
    counts.percs++;
  }
  // réplicas: delay = uma fila de pecinhas indo para o fundo (reação em cadeia em perspectiva);
  // reverb = pecinhas cada vez mais longe, sumindo no ponto de fuga
  function echo(type, v, c) {
    counts.echoes++;
    if (type === "kick") {
      for (const m of M) if (m.a > 0.05) m.a = Math.min(3, m.a + 0.35 * v); // a atração volta em ondas
      const src = lastPiece && lastPiece.on ? lastPiece : null;
      if (src) {
        const off = c.echo === "reverb" ? 3 + c.depth * 10 : c.replica * 1.3;
        const f = spawn(src.x + C.fx * off, src.y + C.fy * off, src.z + C.fz * off, true);
        if (f) { f.type = src.type; f.c = src.c; f.s = src.s * Math.pow(c.echo === "reverb" ? 0.7 : 0.85, c.replica); f.life = 0.9 + c.replica * 0.15; }
      }
    } else if (type === "hat") hat(v * 0.6, c);
    else if (type === "snare") repel = Math.min(3, repel + 0.3 * v);
    else if (type === "bass") spin = Math.min(3, spin + 0.2 * v);
    else if (type === "chord") und = Math.max(und, 0.25 * v);
    else if (type === "perc") perc(v, c);
  }
  function hit(type, amount = 1, ctx) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    const c = ctx || { ...PR(type), v };
    if (c.replica) return echo(type, v, c);
    if (type === "kick") kick(v, c); else if (type === "bass") bass(v, c); else if (type === "hat") hat(v, c); else if (type === "snare") snare(v, c);
    else if (type === "chord") chord(v, c); else if (type === "perc") perc(v, c);
  }

  // ---------- física (contínua, orgânica) ----------
  function physics(dt, t, vis) {
    const T = t - t0;
    // os ímãs passeiam devagar (os grupos nunca se formam no mesmo lugar)
    M.forEach((m, i) => { m.x = Math.sin(T * 0.13 + m.ph) * 2.6 + m.ox + vis.pos * 1.5; m.y = Math.sin(T * 0.17 + m.ph * 1.3) * 1.4 + m.oy; m.z = Math.cos(T * 0.11 + m.ph * 0.7) * 2.6 + m.oz; m.a *= Math.exp(-dt * decayK); m.r *= Math.exp(-dt * 1.4); });
    attract *= Math.exp(-dt * decayK); repel *= Math.exp(-dt * 3); spin *= Math.exp(-dt * spinK);
    stretch += (stretchT - stretch) * (1 - Math.exp(-dt * 2)); stretchT *= Math.exp(-dt * stretchK);
    und *= Math.exp(-dt * 0.4);
    if (formLife < 1e8 && t - formT > formLife) { formLife = 1e9; for (const p of P) if (p.hasT) { p.tx = p.h0x; p.ty = p.h0y; p.tz = p.h0z; } } // a formação se solta: cada peça volta pra casa
    if (bgLife < 1e8 && t - bgT > bgLife) { bgLife = 1e9; bgI = 0; bgMode = 0; }
    const list = P, elastic = 1 - tension * 0.45, gk = vis.gravity * 3, mk = Math.max(0, vis.magnet);
    for (const p of list) {
      if (!p.on) continue;
      if (p.frag && t - p.born > p.life) { p.on = false; continue; }
      if (p.hasT) { const k = 1 - Math.exp(-dt * (0.8 + (1 - tension) * 1.5)); p.hx += (p.tx - p.hx) * k; p.hy += (p.ty - p.hy) * k; p.hz += (p.tz - p.hz) * k; }
      // casa que respira (passeio lento)
      const hx = p.hx + Math.sin(T * 0.3 + p.ph) * 0.6, hy = p.hy + Math.sin(T * 0.23 + p.ph * 1.7) * 0.5 + (und ? und * Math.sin(p.hx * 0.8 + T * 2.4) : 0), hz = p.hz + Math.cos(T * 0.27 + p.ph) * 0.6;
      let ax = (hx - p.x) * 0.55, ay = (hy - p.y) * 0.55 - gk, az = (hz - p.z) * 0.55;
      const m = nearestMag(p);
      const att = m.a * m.w + mk;
      if (att > 0.02) {
        const k = Math.min(6, att * 2.2 * (0.6 + tension * 0.8));
        let fx = (m.x - p.x) * k, fy = (m.y - p.y) * k, fz = (m.z - p.z) * k;
        // SWEEP: direção da força — radial, colunas, anel, espiral, vento
        if (force === 1) { fy *= 0.15; ay += (Math.round(p.y / 1.2) * 1.2 - p.y) * 2 * forceAmt; }
        else if (force === 2 || force === 3) { // anel / espiral: velocidade tangente com um alvo (nunca acumula energia)
          const rx = p.x - m.x, rz = p.z - m.z, r = Math.hypot(rx, rz) || 1, tx = -rz / r, tz = rx / r;
          const want = 1.2 + forceAmt * 1.6, cur = p.vx * tx + p.vz * tz, dv = (want - cur) * 2.5;
          fx += tx * dv; fz += tz * dv; if (force === 3) fy += (1.6 - p.vy) * 1.2; }
        else if (force === 4) { fx = Math.abs(fx) + k * 1.5; fy *= 0.5; fz *= 0.5; }
        ax += fx; ay += fy; az += fz;
        p.mag = M.indexOf(m);
      } else p.mag = -1;
      if (m.r > 0.02) { const dx = p.x - m.x, dy = p.y - m.y, dz = p.z - m.z, d = Math.hypot(dx, dy, dz) || 1; if (d < 3.5) { const k = (m.r * 2.5) / d; ax += dx * k; ay += dy * k; az += dz * k; } }
      p.vx += ax * dt; p.vy += ay * dt; p.vz += az * dt;
      const damp = Math.exp(-dt * 1.9 * elastic); p.vx *= damp; p.vy *= damp; p.vz *= damp;
      const sp2 = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz; if (sp2 > 64) { const q = 8 / Math.sqrt(sp2); p.vx *= q; p.vy *= q; p.vz *= q; } // nunca dispara
      const rr = p.x * p.x + p.y * p.y + p.z * p.z; if (rr > 144 && !p.frag) { p.vx -= p.x * dt * 0.8; p.vy -= p.y * dt * 0.8; p.vz -= p.z * dt * 0.8; } // longe demais: volta pro palco
      p.rot += p.w * dt * (1 + spin * 1.5);
      p.g *= Math.exp(-dt * 2);
      p.vib *= Math.exp(-dt * 1.5);
      p.warp *= Math.exp(-dt * 0.35);
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

  const order = [], conn = [];
  const FLOOR = -4.2;
  let projFig = null;
  const S = createStage(canvas, (dt, t) => {
    const vis = VIS();
    physics(dt, t, vis);
    const T = t - t0;
    camAmp += (camAmpT - camAmp) * (1 - Math.exp(-dt * 0.8));
    orbitDir += (orbitDirT - orbitDir) * (1 - Math.exp(-dt * 0.7));
    orbit += dt * (0.16 + spin * 0.55 + vis.rot * 0.3) * speed * orbitDir;
    // SWEEP do baixo: a elevação e a distância da câmera passam a viajar (curva, órbita, espiral)
    const elev = 0.32 + Math.sin(T * 0.07) * (0.14 + camAmp * 0.35), R = (15 / persp) * (1 + camAmp * 0.35 * Math.sin(T * 0.19));
    lookAt(C, Math.sin(orbit) * Math.cos(elev) * R, Math.sin(elev) * R, Math.cos(orbit) * Math.cos(elev) * R, 0, -0.4, 0);
    C.f = ((Math.min(S.W, S.H) * 1.05) / persp) * (1 + vis.persp * 0.4);
    const bg = BGS[bgI][0], ctx = S.ctx;
    ctx.lineJoin = "round"; ctx.lineWidth = 0.8;
    fieldBg(S, bgMode, HEX[bg], HEX[BGS[bgI2][0]]);
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
    // figuras da PERC dançando no chão (ficam dentro do disco)
    if (figs) {
      figs.update(dt, t, FLOOR, PR("perc"));
      for (const f of figs.list) if (f.on && Math.hypot(f.x, f.z) > 8.2) { f.vx = -f.vx; f.vz = -f.vz; f.x *= 0.98; f.z *= 0.98; }
      if (!projFig) projFig = figProjector(S, C);
      figs.draw(ctx, projFig, [HEX.red, HEX.blue, HEX.yellow, bg === "black" ? HEX.cream : HEX.black], TONE[3][0], HEX[bg], t);
    }
    // CONTOUR do kick: tensão — fios entre as peças de cada grupo que está se formando
    if (tension > 0.2) {
      const col = bg === "black" ? HEX.cream : HEX.black, w = 0.012 + tension * 0.02;
      for (let mi = 0; mi < MAG; mi++) {
        const m = M[mi]; if (m.a < 0.15) continue;
        conn.length = 0;
        for (const p of P) if (p.on && !p.frag && p.mag === mi && (p.x - m.x) ** 2 + (p.y - m.y) ** 2 + (p.z - m.z) ** 2 < 6) conn.push(p);
        conn.sort((a, b) => Math.atan2(a.z - m.z, a.x - m.x) - Math.atan2(b.z - m.z, b.x - m.x));
        for (let i = 0; i < conn.length && i < 12; i++) { const a = conn[i], b = conn[(i + 1) % Math.min(conn.length, 12)]; if (a !== b) drawLine3(S, C, a.x, a.y, a.z, b.x, b.y, b.z, w, col); drawLine3(S, C, a.x, a.y, a.z, m.x, m.y, m.z, w * 0.6, col); }
      }
    }
    // peças, do fundo pra frente
    order.length = 0;
    for (let i = 0; i < MAXN; i++) if (P[i].on) order.push(i);
    order.sort((a, b) => depthOf(C, P[b].x, P[b].y, P[b].z) - depthOf(C, P[a].x, P[a].y, P[a].z));
    const scl = 1 + vis.scale * 0.4, st = 1 + stretch * 1.2;
    for (const i of order) {
      const p = P[i];
      // metamorfose: encolhe, troca de forma, cresce de novo
      let k = 1;
      if (p.mt > 0) { const m = clamp((now() - p.mt) / 0.3, 0, 1); k = m < 0.5 ? 1 - m * 1.6 : 0.2 + (m - 0.5) * 1.6; if (m >= 0.5) p.type = p.nextType; if (m >= 1) p.mt = -9; }
      if (p.frag) k *= clamp((p.born + p.life - now()) / 0.6, 0, 1); // pedacinho some encolhendo
      const s = p.s * k * (1 - p.g * 0.35) * scl, col = visibleOn(p.c, bg);
      if (s < 0.01) continue;
      const x = p.vib > 0.05 ? p.x + (Math.random() - 0.5) * p.vib * s * 0.6 : p.x;
      // DISTORTION: deformação geométrica — a esfera vira cristal, caixas e barras se achatam e torcem
      const wp = p.warp > 0.05 ? p.warp : 0, wx = 1 + wp * 0.8, wy = 1 - wp * 0.45, wr = p.rot + wp * 1.2 * Math.sin(T * 1.7 + p.ph);
      if (p.type === 0) { if (wp > 0.4) drawCrystal(S, C, x, p.y, p.z, s * (0.8 + wp * 0.5), wr, col); else drawSphere(S, C, x, p.y, p.z, s, col); }
      else if (p.type === 1) drawBox(S, C, x, p.y, p.z, s * wx, s * st * wy, s / wx, wr, col);
      else if (p.type === 2) drawBox(S, C, x, p.y, p.z, s * 0.32 * wx, s * 1.9 * st * wy, s * 0.32, wr, col); // barra (escultura vertical)
      else if (p.type === 3) drawCylinder(S, C, x, p.y, p.z, s * 0.6, s * 1.1 * st, col);
      else if (p.type === 4) { // escultura: base, haste e esfera
        drawBox(S, C, x, p.y - s * 0.75, p.z, s * 0.7, s * 0.3, s * 0.7, p.rot, col);
        drawBox(S, C, x, p.y + s * 0.05 * st, p.z, s * 0.16, s * 0.55 * st, s * 0.16, p.rot, visibleOn(3, bg));
        drawSphere(S, C, x, p.y + s * (0.6 + 0.55 * st), p.z, s * 0.42, visibleOn((p.c + 1) % 3, bg));
      }
      else if (p.type === 5) drawBox(S, C, x, p.y, p.z, s * 1.3, s * 0.16, s * 1.3, p.rot, col);           // disco
      else if (p.type === 6) drawBox(S, C, x, p.y, p.z, s * 0.12, s * 2.2, s * 0.12, p.rot, col);           // agulha
      else drawCrystal(S, C, x, p.y, p.z, s, p.rot, col);                                                    // cristal
    }
    // LFO → fragmentação contínua entre as notas
    if (vis.frag > 0.05 && Math.random() < vis.frag * dt * 6) hat(0.3 * vis.frag, { ...NEU });
    if (Math.abs(vis.geom) > 0.4 && Math.random() < Math.abs(vis.geom) * dt * 2) { const p = P[(Math.random() * MAXN) | 0]; if (p.on && !p.frag) morphTo(p, (p.type + 1) % 5); }
  });

  reset();
  const state = () => {
    const pieces = P.reduce((n, p) => n + (p.on ? 1 : 0), 0), walkers = figs ? figs.active() : 0;
    return { ...counts, pieces, walkers, objects: pieces + walkers, attract: +attract.toFixed(3), repel: +repel.toFixed(3), spin: +spin.toFixed(3), bg: bgI, bgMode,
      mags: M.map((m) => +(m.a * m.w).toFixed(2)).join(","), dissolving: M.map((m) => +m.r.toFixed(2)).join(","), force, tension: +tension.toFixed(2), stretch: +stretch.toFixed(2),
      types: P.reduce((a, p) => { if (p.on) a[p.type] = (a[p.type] || 0) + 1; return a; }, {}), formed: P.reduce((n, p) => n + (p.on && p.hasT ? 1 : 0), 0), cy: +(P.reduce((n, p) => n + (p.on ? p.y : 0), 0) / Math.max(1, P.reduce((n, p) => n + (p.on ? 1 : 0), 0))).toFixed(2), speed, persp, quality: +S.quality.toFixed(2) };
  };
  return {
    hit, reset, canvas, state,
    setSpeed: (x) => { if (Number.isFinite(+x)) speed = clamp(+x, 0.2, 3); },
    setPerspective: (x) => { if (Number.isFinite(+x)) persp = clamp(+x, 0.5, 2.5); },
    setBpm: (b) => { if (b > 30 && b < 300) bpm = b; },
    destroy: () => { S.destroy(); order.length = 0; conn.length = 0; if (figs) figs.clear(); },
  };
}
