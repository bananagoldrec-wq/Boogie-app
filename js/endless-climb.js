/* Projeto 2 — ESCADA SEM FIM (Endless Climb)

   Cada som tem um papel só, sempre o mesmo:
   - KICK    constrói a escada: cada batida é um degrau novo; a força é a altura do degrau.
             Se o personagem estiver caindo, o degrau nasce embaixo dele e a escada segue dali.
   - BASS    movimenta o personagem: cada nota é um pulo pra frente (a força é a altura do pulo;
             forte pula dois degraus). Sem degrau na frente, ele cai, e durante a queda o
             baixo abre o paraquedas (com ele aberto, o baixo empurra pra frente).
   - HI-HAT  produz chuva: a força é a quantidade e o tamanho das gotas.
   - SNARE   muda a cor do fundo: a força é o quanto a cor nova é clara.

   Uso:
     const visual = createEndlessClimb(canvas);
     visual.hit('kick' | 'bass' | 'hat' | 'snare', força 0–1);   // força opcional (1)
     visual.reset();                                            // começa de novo           */

export function createEndlessClimb(canvas) {
  const ctx = canvas.getContext("2d");
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const now = () => performance.now() / 1000;

  // ---------- tela ----------
  let W = 1, H = 1, DPR = 1, U = 40; // U = 1 unidade do mundo em pixels (escala com a tela)
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    U = Math.max(10, Math.min(W, H) / 13);
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  // ---------- estado ----------
  // mundo: x pra direita, y pra cima; o personagem tem ~1 unidade de altura
  const CAM_DX = 2.6, CAM_DY = 1.9; // o personagem fica à esquerda e abaixo do centro: vê-se a escada à frente
  let steps, hero, drops, bg, cam, fallRescued;

  function reset() {
    const t = now();
    steps = [{ x: -5, y: 0, w: 6, rise: 0, born: t - 9, v: 0.5, floor: true }];
    hero = {
      x: -0.6, y: 0, vx: 0, vy: 0,
      state: "stand", on: steps[0], hop: null, queue: [],
      chuteOn: false, chuteT: -9, chuteFold: -9, chuteV: 1,
      land: -9,
    };
    drops = [];
    bg = { from: [0, 0, 0], to: [0, 0, 0], t0: -9, hue: Math.random() * 360 };
    cam = { x: hero.x + CAM_DX, y: hero.y + CAM_DY };
    fallRescued = false;
  }
  reset();

  // ---------- KICK: um degrau ----------
  function buildStep(v) {
    const t = now();
    const rise = 0.28 + 1.3 * Math.pow(v, 1.1); // força = altura do degrau
    const w = 1.3 + 1.0 * v;
    const last = steps[steps.length - 1];
    if (hero.state === "fall" && !fallRescued) {
      // caindo: o degrau nasce embaixo dele (um pouco à frente, pra onde ele vai)
      const x = hero.x + hero.vx * 0.2;
      steps.push({ x: x - w * 0.7, y: hero.y - 1.4, w: w * 1.4, rise: 0, born: t, v, rescue: true });
      fallRescued = true;
    } else {
      steps.push({ x: last.x + last.w, y: last.y + rise, w, rise, born: t, v });
    }
    // esquece o que ficou muito pra trás (não o que está à frente)
    const i = hero.on ? steps.indexOf(hero.on) : -1;
    if (i > 80 && hero.state === "stand") steps.splice(0, i - 60);
  }

  // ---------- BASS: o personagem se move ----------
  function moveHero(v) {
    const t = now();
    if (hero.state === "fall") {
      if (!hero.chuteOn) { hero.chuteOn = true; hero.chuteT = t; hero.chuteV = v; } // abre o paraquedas
      else hero.vx = Math.min(hero.vx + 0.5 + 1.6 * v, 4.5);                    // aberto: empurra pra frente
      return;
    }
    if (hero.state === "hop") { if (hero.queue.length < 2) hero.queue.push(v); return; }
    startHop(v);
  }

  function startHop(v) {
    const t = now();
    const i = steps.indexOf(hero.on);
    const n = v > 0.66 ? 2 : 1; // forte: dois degraus de uma vez
    const target = steps[i + n] || steps[i + 1];
    if (!target) {
      // não tem degrau na frente: pula no vazio e cai
      hero.state = "fall";
      hero.on = null;
      hero.vx = 1.8 + 2.4 * v;
      hero.vy = 3.5 + 4.5 * v;
      hero.chuteOn = false;
      fallRescued = false;
      return;
    }
    const x1 = target.x + Math.min(target.w * 0.45, 0.75);
    hero.hop = {
      x0: hero.x, y0: hero.y, x1, y1: target.y, t0: t,
      dur: 0.2 + 0.07 * (steps.indexOf(target) - i) + 0.1 * v,
      h: 0.3 + 0.9 * v, // força = altura do pulo
      target,
    };
    hero.state = "hop";
  }

  function landOn(s, t) {
    hero.state = "stand";
    hero.on = s;
    hero.y = s.y;
    hero.vx = hero.vy = 0;
    hero.land = t;
    if (hero.chuteOn) { hero.chuteOn = false; hero.chuteFold = t; }
  }

  // ---------- HI-HAT: chuva ----------
  function rain(v) {
    const n = Math.round(3 + 42 * Math.pow(v, 1.6)); // força = quantidade…
    for (let k = 0; k < n; k++) {
      drops.push({
        x: Math.random() * W * 1.25 - W * 0.2,
        y: -Math.random() * H * 0.4,
        len: U * (0.2 + 1.1 * v) * (0.6 + 0.8 * Math.random()), // …e tamanho das gotas
        sp: H * (1.1 + 0.9 * v) * (0.85 + 0.3 * Math.random()),
        a: 0.25 + 0.6 * v,
        w: 0.7 + 1.5 * v,
      });
    }
    if (drops.length > 1500) drops.splice(0, drops.length - 1500);
  }

  // ---------- SNARE: cor do fundo ----------
  function hsl(h, s, l) {
    const f = (n) => {
      const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return [f(0), f(8), f(4)];
  }
  function bgNow(t) {
    const k = clamp((t - bg.t0) / 0.12, 0, 1);
    return bg.from.map((c, i) => lerp(c, bg.to[i], k));
  }
  function changeBg(v) {
    const t = now();
    bg.from = bgNow(t);
    bg.hue = (bg.hue + 137.508) % 360; // cada caixa, uma cor bem diferente da anterior
    bg.to = hsl(bg.hue, 0.5 + 0.3 * v, 0.06 + 0.22 * Math.pow(v, 0.9)); // força = quão clara
    bg.t0 = t;
  }

  function hit(type, amount = 1) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    if (type === "kick") buildStep(v);
    else if (type === "bass") moveHero(v);
    else if (type === "hat") rain(v);
    else if (type === "snare") changeBg(v);
  }

  // ---------- movimento ----------
  function update(dt, t) {
    if (hero.state === "hop") {
      const h = hero.hop, s = clamp((t - h.t0) / h.dur, 0, 1);
      hero.x = lerp(h.x0, h.x1, s);
      hero.y = lerp(h.y0, h.y1, s) + (h.h + Math.max(0, h.y1 - h.y0) * 0.5) * Math.sin(Math.PI * s);
      if (s >= 1) {
        landOn(h.target, t);
        if (hero.queue.length) startHop(hero.queue.shift());
      }
    } else if (hero.state === "fall") {
      const py = hero.y;
      if (hero.chuteOn) {
        hero.vy += (-1.1 - hero.vy) * (1 - Math.exp(-dt * 5)); // desce devagar
        hero.vx += (0.5 - hero.vx) * (1 - Math.exp(-dt * 0.8)); // e plana pra frente
      } else {
        hero.vy = Math.max(hero.vy - 20 * dt, -16);
        hero.vx *= Math.exp(-dt * 0.3);
      }
      hero.x += hero.vx * dt;
      hero.y += hero.vy * dt;
      if (hero.vy < 0) {
        for (const s of steps) {
          if (py >= s.y && hero.y <= s.y && hero.x >= s.x - 0.15 && hero.x <= s.x + s.w + 0.15) { landOn(s, t); break; }
        }
      }
    }
    // câmera acompanha o personagem (mais rápido na queda)
    const kx = 1 - Math.exp(-dt * 2.2), ky = 1 - Math.exp(-dt * (hero.state === "fall" ? 4 : 2.2));
    cam.x += (hero.x + CAM_DX - cam.x) * kx;
    cam.y += (hero.y + CAM_DY - cam.y) * ky;
    // chuva
    for (const d of drops) { d.y += d.sp * dt; d.x += d.sp * 0.18 * dt; }
    if (drops.length && drops[0].y > H + 50) drops = drops.filter((d) => d.y - d.len < H + 10);
  }

  // ---------- desenho ----------
  const sx = (x) => W / 2 + (x - cam.x) * U;
  const sy = (y) => H / 2 - (y - cam.y) * U;

  function drawSteps(t) {
    const lw = Math.max(1.5, U * 0.06);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], prev = steps[i - 1];
      const age = t - s.born, grow = 1 - Math.pow(1 - clamp(age / 0.12, 0, 1), 3); // o degrau nasce crescendo
      const x0 = sx(s.x), x1 = sx(s.x + s.w * grow), y = sy(s.y);
      if (x1 < -40 || x0 > W + 40 || y < -H || y > H * 2) continue;
      const joined = prev && !s.rescue && Math.abs(prev.x + prev.w - s.x) < 1e-6;
      // corpo da escada: preenchimento suave até o chão da tela
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      if (s.rescue) ctx.fillRect(x0, y, x1 - x0, U * 0.3);
      else ctx.fillRect(x0, y, x1 - x0, Math.max(0, H - y));
      // linhas: espelho (vertical) + piso
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = lw;
      ctx.beginPath();
      if (joined) { ctx.moveTo(x0, sy(prev.y)); ctx.lineTo(x0, y); } else ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      if (s.rescue) { ctx.lineTo(x1, y + U * 0.3); ctx.lineTo(x0, y + U * 0.3); ctx.closePath(); }
      ctx.stroke();
      // brilho do degrau novo (proporcional à força do kick)
      if (age < 0.35 && !s.floor) {
        const k = 1 - age / 0.35;
        ctx.strokeStyle = `rgba(255,255,255,${(0.35 * k).toFixed(3)})`;
        ctx.lineWidth = lw * (1 + 4 * s.v * k);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      }
    }
  }

  function drawHero(t) {
    const S = U, lw = Math.max(1.5, U * 0.07);
    const px = sx(hero.x), py = sy(hero.y);
    ctx.save();
    ctx.translate(px, py);
    // pouso: amassa um pouquinho
    const la = t - hero.land, sq = la < 0.16 ? 1 - 0.2 * Math.sin((Math.PI * la) / 0.16) : 1;
    ctx.scale(1 + (1 - sq) * 0.6, sq);
    if (hero.state === "fall" && !hero.chuteOn) ctx.rotate(clamp(hero.vx * 0.05, -0.3, 0.3));

    const hipY = -0.45 * S, neckY = -0.84 * S, headY = -1.0 * S, headR = 0.13 * S;
    let f1, f2, h1, h2;
    if (hero.state === "hop") {
      const s = clamp((t - hero.hop.t0) / hero.hop.dur, 0, 1), tuck = Math.sin(Math.PI * s);
      f1 = [-0.12 * S - 0.05 * S * tuck, -0.2 * S * tuck]; f2 = [0.14 * S, -0.12 * S * tuck];
      h1 = [-0.28 * S, -0.75 * S - 0.3 * S * tuck]; h2 = [0.24 * S, -0.8 * S - 0.3 * S * tuck];
    } else if (hero.state === "fall" && hero.chuteOn) {
      f1 = [-0.06 * S, 0]; f2 = [0.07 * S, -0.02 * S];
      h1 = [-0.17 * S, -1.12 * S]; h2 = [0.17 * S, -1.12 * S];
    } else if (hero.state === "fall") {
      const fl = Math.sin(t * 22) * 0.06 * S;
      f1 = [-0.2 * S, 0.02 * S + fl]; f2 = [0.2 * S, 0.02 * S - fl];
      h1 = [-0.32 * S, -1.15 * S - fl]; h2 = [0.32 * S, -1.15 * S + fl];
    } else {
      const br = Math.sin(t * 2.2) * 0.012 * S;
      f1 = [-0.12 * S, 0]; f2 = [0.12 * S, 0];
      h1 = [-0.17 * S, -0.5 * S + br]; h2 = [0.17 * S, -0.5 * S + br];
    }
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(f1[0], f1[1]); ctx.lineTo(0, hipY); ctx.lineTo(f2[0], f2[1]);   // pernas
    ctx.moveTo(0, hipY); ctx.lineTo(0, neckY);                                 // corpo
    ctx.moveTo(h1[0], h1[1]); ctx.lineTo(0, neckY + 0.06 * S); ctx.lineTo(h2[0], h2[1]); // braços
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();

    // paraquedas: abre com o baixo, fecha no pouso
    let open = 0;
    if (hero.chuteOn) {
      const a = clamp((t - hero.chuteT) / 0.3, 0, 1);
      open = 1 + Math.sin(a * Math.PI) * 0.12 * (1 - a) - Math.pow(1 - a, 3); // abre com um leve exagero
    } else if (t - hero.chuteFold < 0.3) open = 1 - (t - hero.chuteFold) / 0.3;
    if (open > 0.01) {
      ctx.save();
      ctx.rotate(Math.sin(t * 1.6) * 0.07);
      const rx = (0.75 + 0.35 * hero.chuteV) * S * open, ry = 0.55 * S * open, cy = -2.15 * S;
      ctx.beginPath();
      ctx.ellipse(0, cy, rx, ry, 0, Math.PI, 0);
      const k = 5;                                           // borda em gomos
      for (let j = k; j > 0; j--) {
        const xa = -rx + ((2 * rx) / k) * j, xb = -rx + ((2 * rx) / k) * (j - 1);
        ctx.quadraticCurveTo((xa + xb) / 2, cy + ry * 0.28, xb, cy);
      }
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fill();
      ctx.lineWidth = lw * 0.9;
      ctx.stroke();
      ctx.lineWidth = lw * 0.45;                             // cordas
      ctx.beginPath();
      for (const fx of [-1, -0.35, 0.35, 1]) {
        ctx.moveTo(fx * rx, cy);
        ctx.lineTo(fx < 0 ? h1[0] : h2[0], fx < 0 ? h1[1] : h2[1]);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawRain() {
    if (!drops.length) return;
    ctx.lineCap = "round";
    for (const d of drops) {
      if (d.y + d.len < 0) continue;
      ctx.strokeStyle = `rgba(255,255,255,${d.a.toFixed(3)})`;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * 0.18, d.y + d.len);
      ctx.stroke();
    }
  }

  function draw(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const c = bgNow(t);
    ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.fillRect(0, 0, W, H);
    drawSteps(t);
    drawHero(t);
    drawRain();
  }

  // ---------- laço ----------
  let last = now(), raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = now(), dt = Math.min(0.05, t - last);
    last = t;
    if (canvas.hidden) return; // aba fechada: não gasta nada
    if (Math.abs(canvas.getBoundingClientRect().width - W) > 1) resize();
    update(dt, t);
    draw(t);
  }
  raf = requestAnimationFrame(frame);

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    window.removeEventListener("resize", resize);
  }

  return { hit, reset, destroy, canvas };
}
