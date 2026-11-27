/* CYCLES VISUAL — FIGURAS (compartilhadas por todas as cenas): window.CyclesFigures
   Silhuetas reconhecíveis em cores chapadas — figuras humanas articuladas, animais, objetos e
   símbolos — e o ENXAME da máquina PERC, que cada cena desenha no seu próprio espaço.
   Cada figura é uma lista de partes em coordenadas locais (caixa −1…1, y pra cima):
     { p: [x0,y0, x1,y1, …] } polígono · { c: [x,y,r] } círculo · { l: [x0,y0,x1,y1,w] } traço grosso
   PERC (perfil da máquina):
     COLOR   geometria → objetos → símbolos → animais → figuras humanas
     SHAPE   articulação, flexibilidade e metamorfose (as figuras viram outras)
     SWEEP   caminhada → corrida → salto → voo
     CONTOUR rebote, colisão e multiplicação                                                   */
(function (root) {
  "use strict";
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const S = Math.sin, C = Math.cos;

  // ---------- figura humana articulada (a perna e o braço mexem com a fase) ----------
  function human(ph, art, pose) {
    // pose: 0 em pé/andando, 1 correndo, 2 pulando, 3 voando (braços abertos)
    const sw = (pose === 1 ? 0.75 : 0.45) * (0.6 + art * 0.8), a = S(ph) * sw;
    const hip = [0, -0.05], sh = [0.02, 0.48];
    const leg = (s) => { const th = a * s, kn = [hip[0] + S(th) * 0.32, hip[1] - C(th) * 0.32]; const sh2 = (pose === 2 ? 0.6 : 0.15 + Math.max(0, -s * a) * 0.9) * (0.5 + art); const ft = [kn[0] + S(th - sh2) * 0.34, kn[1] - C(th - sh2) * 0.34]; return [{ l: [hip[0], hip[1], kn[0], kn[1], 0.13] }, { l: [kn[0], kn[1], ft[0], ft[1], 0.12] }]; };
    const arm = (s) => { const th = pose === 3 ? s * 1.4 : -a * s * 1.1, el = [sh[0] + S(th) * 0.26, sh[1] - C(th) * 0.26], hd = [el[0] + S(th + 0.4 * art) * 0.26, el[1] - C(th + 0.4 * art) * 0.26]; return [{ l: [sh[0], sh[1], el[0], el[1], 0.1] }, { l: [el[0], el[1], hd[0], hd[1], 0.09] }]; };
    return [...leg(1), ...arm(-1), { p: [-0.13, -0.08, 0.13, -0.08, 0.15, 0.5, -0.11, 0.5] }, { c: [0.05, 0.72, 0.15] }, ...leg(-1), ...arm(1)];
  }
  // ---------- animais ----------
  const bird = (ph, art) => { const w = S(ph * 1.6) * (0.5 + art * 0.5); return [{ p: [-0.55, 0, 0.3, 0.12, 0.55, 0.04, 0.3, -0.1, -0.4, -0.08] }, { p: [-0.1, 0.05, 0.25, 0.05, -0.05, 0.05 + 0.8 * w] }, { p: [0.55, 0.04, 0.75, 0, 0.55, -0.02] }, { c: [0.42, 0.08, 0.035] }]; };
  const fish = (ph, art) => { const tl = S(ph * 1.3) * 0.25 * (0.5 + art); return [{ p: [-0.45, 0, -0.1, 0.25, 0.4, 0.12, 0.55, 0, 0.4, -0.12, -0.1, -0.25] }, { p: [-0.42, 0, -0.75, 0.25 + tl, -0.7, -0.25 + tl] }, { c: [0.33, 0.04, 0.04] }]; };
  const cat = (ph, art) => { const t = S(ph) * 0.2 * (0.5 + art); return [{ p: [-0.5, -0.25, 0.35, -0.25, 0.4, 0.15, -0.45, 0.15] }, { c: [0.5, 0.25, 0.2] }, { p: [0.36, 0.38, 0.4, 0.58, 0.48, 0.42] }, { p: [0.55, 0.42, 0.63, 0.58, 0.66, 0.38] }, { l: [-0.48, 0.05, -0.78, 0.45 + t, 0.08] }, { l: [-0.38, -0.25, -0.38 + t * 0.4, -0.6, 0.09] }, { l: [0.28, -0.25, 0.28 - t * 0.4, -0.6, 0.09] }]; };
  const rabbit = (ph, art) => { const h = Math.max(0, S(ph)) * 0.15 * (0.5 + art); return [{ c: [-0.1, -0.1 + h, 0.38] }, { c: [0.35, 0.2 + h, 0.2] }, { p: [0.28, 0.35 + h, 0.22, 0.85 + h, 0.34, 0.85 + h, 0.38, 0.36 + h] }, { p: [0.42, 0.35 + h, 0.45, 0.82 + h, 0.55, 0.8 + h, 0.5, 0.34 + h] }, { c: [-0.48, 0.0 + h, 0.1] }]; };
  // ---------- objetos ----------
  const chair = () => [{ p: [-0.35, 0, 0.35, 0, 0.35, 0.12, -0.35, 0.12] }, { p: [-0.35, 0.12, -0.25, 0.12, -0.25, 0.8, -0.35, 0.8] }, { l: [-0.3, 0, -0.3, -0.6, 0.08] }, { l: [0.3, 0, 0.3, -0.6, 0.08] }];
  const key = () => [{ c: [-0.45, 0, 0.25] }, { p: [-0.25, -0.06, 0.65, -0.06, 0.65, 0.06, -0.25, 0.06] }, { p: [0.4, -0.06, 0.4, -0.25, 0.5, -0.25, 0.5, -0.06] }, { p: [0.58, -0.06, 0.58, -0.2, 0.65, -0.2, 0.65, -0.06] }];
  const umbrella = () => [{ p: [-0.7, 0.2, -0.5, 0.5, 0, 0.65, 0.5, 0.5, 0.7, 0.2] }, { l: [0, 0.2, 0, -0.6, 0.06] }, { l: [0, -0.6, 0.15, -0.7, 0.06] }];
  const house = () => [{ p: [-0.45, -0.6, 0.45, -0.6, 0.45, 0.1, -0.45, 0.1] }, { p: [-0.6, 0.1, 0, 0.65, 0.6, 0.1] }, { p: [-0.1, -0.6, 0.12, -0.6, 0.12, -0.25, -0.1, -0.25] }];
  const lamp = () => [{ p: [-0.35, 0.2, 0.35, 0.2, 0.2, 0.6, -0.2, 0.6] }, { l: [0, 0.2, 0, -0.55, 0.07] }, { p: [-0.25, -0.55, 0.25, -0.55, 0.25, -0.65, -0.25, -0.65] }];
  // ---------- símbolos ----------
  const star = () => { const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.3 : 0.75, a = (i / 10) * Math.PI * 2 + Math.PI / 2; p.push(C(a) * r, S(a) * r); } return [{ p }]; };
  const arrow = () => [{ p: [-0.7, -0.12, 0.2, -0.12, 0.2, -0.35, 0.7, 0, 0.2, 0.35, 0.2, 0.12, -0.7, 0.12] }];
  const eye = () => [{ p: [-0.75, 0, -0.35, 0.3, 0.35, 0.3, 0.75, 0, 0.35, -0.3, -0.35, -0.3] }, { c: [0, 0, 0.22, 1] }];
  const crescent = () => [{ c: [0, 0, 0.6] }, { c: [0.28, 0.12, 0.5, 1] }];
  const plus = () => [{ p: [-0.15, -0.65, 0.15, -0.65, 0.15, -0.15, 0.65, -0.15, 0.65, 0.15, 0.15, 0.15, 0.15, 0.65, -0.15, 0.65, -0.15, 0.15, -0.65, 0.15, -0.65, -0.15, -0.15, -0.15] }];
  // ---------- geometria (o ponto de partida) ----------
  const square = () => [{ p: [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5] }];
  const tri = () => [{ p: [-0.6, -0.45, 0.6, -0.45, 0, 0.6] }];
  const disc = () => [{ c: [0, 0, 0.55] }];
  const half = () => [{ p: (() => { const p = [-0.6, 0]; for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; p.push(-C(a) * 0.6, S(a) * 0.6); } return p; })() }];

  // categorias na ordem do COLOR da PERC: geometria, objetos, símbolos, animais, humanos
  const CATS = [
    [square, tri, disc, half],
    [chair, key, umbrella, house, lamp],
    [star, arrow, eye, crescent, plus],
    [bird, fish, cat, rabbit],
    [(ph, art, pose) => human(ph, art, pose)],
  ];
  const CAT_NAMES = ["geometria", "objetos", "símbolos", "animais", "figuras humanas"];
  function figure(cat, idx, ph = 0, art = 0.5, pose = 0) {
    const list = CATS[clamp(cat | 0, 0, 4)];
    return list[((idx % list.length) + list.length) % list.length](ph, art, pose);
  }

  // desenha as partes (em px): posição, escala, giro; cor sólida e, se quiser, uma "espessura"
  // (a mesma silhueta numa cor mais escura, deslocada: um recorte com volume, sem degradê)
  function draw(ctx, parts, x, y, s, rot, col, depthCol, depthPx, bgCol) {
    const pass = (dx, dy, fill) => {
      const c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
      const X = (u, v) => x + dx + u * c - v * sn, Y = (u, v) => y + dy - (u * sn + v * c);
      ctx.fillStyle = fill; ctx.strokeStyle = fill;
      for (const pt of parts) {
        if (pt.p) { const p = pt.p; ctx.beginPath(); ctx.moveTo(X(p[0], p[1]), Y(p[0], p[1])); for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i], p[i + 1]), Y(p[i], p[i + 1])); ctx.closePath(); ctx.fill(); }
        else if (pt.c) { ctx.beginPath(); ctx.arc(X(pt.c[0], pt.c[1]), Y(pt.c[0], pt.c[1]), Math.abs(pt.c[2] * s), 0, Math.PI * 2); if (pt.c[3]) { ctx.fillStyle = bgCol || "#000"; ctx.fill(); ctx.fillStyle = fill; } else ctx.fill(); }
        else if (pt.l) { const l = pt.l; ctx.lineWidth = Math.max(1, l[4] * s); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(X(l[0], l[1]), Y(l[0], l[1])); ctx.lineTo(X(l[2], l[3]), Y(l[2], l[3])); ctx.stroke(); }
      }
    };
    if (depthCol && depthPx) pass(depthPx, depthPx, depthCol);
    pass(0, 0, col);
  }

  // ---------- ENXAME da PERC: figuras que nascem, se movem e se multiplicam ----------
  // espaço genérico 3D (x lado, y altura, z profundidade); a cena dá a projeção e o chão
  function swarm(opts = {}) {
    const MAX = opts.max || 48;
    const F = Array.from({ length: MAX }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, cat: 0, idx: 0, ph: 0, s: 0.4, col: 0, born: 0, life: 4, pose: 0, art: 0.5, kids: 0, rot: 0, morphT: -9, nextIdx: 0 }));
    let n = 0;
    function spawn(ctx, at, t, gen = 0) {
      const f = F.find((q) => !q.on) || F.reduce((a, b) => (a.born < b.born ? a : b));
      const P = ctx || {};
      const color = P.color ?? 0, shape = P.shape ?? 0, sweep = P.sweep ?? 0, contour = P.contour ?? 0;
      f.on = true; f.born = t; f.cat = Math.min(4, Math.round(color * 4)); f.idx = (Math.random() * 6) | 0; f.nextIdx = f.idx;
      f.pose = Math.min(3, Math.floor(sweep * 4)); // andar, correr, pular, voar
      f.art = 0.2 + shape * 0.8;                  // articulação e flexibilidade
      f.x = at.x; f.y = at.y; f.z = at.z;
      const sp = (0.6 + sweep * 2.2) * (0.6 + (P.v ?? 0.8) * 0.8) * (opts.speed || 1);
      const dir = at.dir ?? (Math.random() < 0.5 ? -1 : 1);
      f.vx = dir * sp; f.vz = (at.vz ?? 0) * sp; f.vy = f.pose >= 2 ? (1.5 + sweep * 2.5) * (opts.jump || 1) : 0;
      f.s = (opts.size || 0.45) * (0.6 + (P.v ?? 0.8) * 0.7) * (1 + (P.pitch ?? 0) * 0.35);
      f.col = (Math.random() * 4) | 0; f.ph = Math.random() * 6;
      f.life = 1 + (P.decay ?? 0.5) * 4; f.kids = gen < 2 ? Math.round(contour * 3) : 0; f.rot = 0; f.morphT = -9;
      f.bounce = 0.2 + contour * 0.7;
      n++;
      return f;
    }
    function update(dt, t, ground = 0, P) {
      for (const f of F) {
        if (!f.on) continue;
        if (t - f.born > f.life) { f.on = false; continue; }
        f.ph += dt * (f.pose === 1 ? 11 : f.pose === 3 ? 9 : 7);
        f.x += f.vx * dt; f.z += f.vz * dt;
        if (f.pose === 3) { f.y += S(f.ph * 0.3) * dt * 0.4 + dt * 0.15; } // voo: plana subindo
        else { const gy = typeof ground === "function" ? ground(f.x, f.z) : ground; f.vy -= 9 * dt; f.y += f.vy * dt; if (f.y < gy) { f.y = gy; f.vy = f.pose >= 2 ? (1.2 + Math.random()) * 2.5 * (opts.jump || 1) * f.bounce + 1 : 0; // salto/rebote
          if (f.kids > 0 && f.vy > 0) { f.kids--; const k = spawn({ color: f.cat / 4, shape: f.art, sweep: f.pose / 3.99, contour: f.bounce, v: 0.6, decay: 0.3 }, { x: f.x, y: f.y, z: f.z, dir: -Math.sign(f.vx || 1), vz: f.vz }, t, 2); k.cat = f.cat; } } } // multiplicação ao bater
        // metamorfose (SHAPE alto): de tempos em tempos a figura vira outra da mesma família
        if (P && P.shape > 0.6 && t - f.morphT > 1.2 - P.shape * 0.6) { f.morphT = t; f.nextIdx = f.idx + 1; }
        if (f.morphT > 0 && t - f.morphT > 0.15 && f.idx !== f.nextIdx) f.idx = f.nextIdx;
      }
    }
    // desenho: project(x,y,z) → [sx, sy, escala px por unidade] ou null; cores: lista de 4 + escura
    function drawAll(ctx2d, project, colors, dark, bgCol, t) {
      for (const f of F) {
        if (!f.on) continue;
        const pr = project(f.x, f.y, f.z);
        if (!pr) continue;
        const a = t - f.born, grow = Math.min(1, a / 0.2), shrink = Math.min(1, (f.life - a) / 0.4);
        const morph = f.morphT > 0 && t - f.morphT < 0.3 ? Math.abs(Math.cos(((t - f.morphT) / 0.3) * Math.PI)) : 1;
        const s = pr[2] * f.s * grow * shrink * morph;
        if (s < 1.2) continue;
        const parts = figure(f.cat, f.idx, f.ph, f.art, f.pose);
        const flip = f.vx < 0 ? -1 : 1;
        draw(ctx2d, flip < 0 ? mirror(parts) : parts, pr[0], pr[1], s, 0, colors[f.col % colors.length], dark, Math.max(1, s * 0.06), bgCol);
      }
    }
    const active = () => F.reduce((k, f) => k + (f.on ? 1 : 0), 0);
    const clear = () => { for (const f of F) f.on = false; };
    return { spawn, update, draw: drawAll, active, clear, list: F };
  }
  const mirror = (parts) => parts.map((p) => (p.p ? { p: p.p.map((v, i) => (i % 2 ? v : -v)) } : p.c ? { c: [-p.c[0], p.c[1], p.c[2], p.c[3]] } : { l: [-p.l[0], p.l[1], -p.l[2], p.l[3], p.l[4]] }));

  root.CyclesFigures = { figure, draw, swarm, human, CAT_NAMES, CATS, mirror };
})(typeof window !== "undefined" ? window : globalThis);
