/* Projeto 2 — ESCADA SEM FIM (Endless Climb)

   Cada som tem um papel só, sempre o mesmo, e tudo acontece NO TEMPO da música:
   - KICK    faz a pessoa ANDAR: cada kick é um passo, e o pé pousa exatamente no kick.
             O passo dura o intervalo entre os kicks (o andar segue o andamento).
             Força = tamanho do passo.
   - BASS    faz a ESCADA SUBIR: cada nota levanta um degrau novo à frente da pessoa.
             Força = altura do degrau. Sem baixo, o caminho segue plano.
   - HI-HAT  faz CHOVER: cada hi-hat é uma pancada de chuva que some antes do próximo.
             Força = quantidade e tamanho das gotas.
   - SNARE   muda a COR DO FUNDO na hora da batida. Força = quão clara é a cor.

   Uso:
     const visual = createEndlessClimb(canvas);
     visual.hit('kick' | 'bass' | 'hat' | 'snare', força 0–1);   // força opcional (1)
     visual.setBpm(120);   // opcional: andamento vindo do clock MIDI
     visual.reset();       // começa de novo                                          */

export function createEndlessClimb(canvas) {
  const ctx = canvas.getContext("2d");
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (s) => 0.5 - 0.5 * Math.cos(Math.PI * s); // acelera depois do pé pousar, freia antes do próximo
  const now = () => performance.now() / 1000;

  // ---------- tela ----------
  let W = 1, H = 1, DPR = 1, U = 40; // U = 1 unidade do mundo em pixels (a pessoa tem ~1 unidade)
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    U = Math.max(10, Math.min(W, H) / 7); // a pessoa tem ~1/7 da altura da tela
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  // ---------- andamento ----------
  // o passo dura um intervalo entre kicks: vem do clock MIDI, ou é medido nos próprios kicks
  const kickTimes = [], hatTimes = [];
  let bpm = null, bpmT = -9;
  function median(times, lo, hi, def) {
    const iv = [];
    for (let i = 1; i < times.length; i++) {
      const d = times[i] - times[i - 1];
      if (d >= lo && d <= hi) iv.push(d);
    }
    if (!iv.length) return def;
    iv.sort((a, b) => a - b);
    return iv[iv.length >> 1];
  }
  const tap = (arr, t) => { arr.push(t); if (arr.length > 9) arr.shift(); };
  const beatP = () => (bpm && now() - bpmT < 4 ? 60 / bpm : median(kickTimes, 0.18, 1.6, 0.5));
  const hatP = () => median(hatTimes, 0.05, 1.0, 0.25);

  // ---------- estado ----------
  // medidas em "alturas de pessoa": a pessoa tem 1; o quadril fica em 0,5; cada perna 0,6
  const STEP_W = 0.9;               // largura de cada degrau (constante: a força muda só a altura)
  const LEG = 0.3;                  // coxa = canela
  const CAM_DX = 1.6, CAM_DY = 1.3; // a pessoa fica à esquerda e abaixo do centro
  let steps, hero, drops, bg, cam;

  function reset() {
    const t = now();
    steps = [{ x: -8, y: 0, w: 9, rise: 0, born: t - 9, v: 0, dur: 0.1, floor: true }];
    hero = { x: -0.5, y: 0, feet: [[-0.6, 0], [-0.4, 0]], swing: 0, stride: null, footT: -9, footV: 0 };
    drops = [];
    bg = { from: [0, 0, 0], to: [0, 0, 0], t0: -9, hue: Math.random() * 360 };
    cam = { x: hero.x + CAM_DX, y: hero.y + CAM_DY };
    kickTimes.length = 0;
    hatTimes.length = 0;
  }
  reset();

  // chão em cada ponto: o degrau mais à direita que já começou ali (altura final)
  function groundY(x) {
    for (let i = steps.length - 1; i >= 0; i--) if (steps[i].x <= x + 1e-9) return steps[i].y;
    return steps[0].y;
  }
  // o pé não pousa colado no espelho de um degrau
  function clearRiser(x) {
    for (const st of steps) if (!st.floor && x > st.x - 0.1 && x < st.x + 0.1) return st.x + 0.1;
    return x;
  }

  // ---------- KICK: um passo ----------
  function finishStride() {
    const s = hero.stride;
    if (!s) return;
    hero.x = s.x1; hero.y = groundY(s.x1);
    hero.feet[hero.swing] = [s.f1[0], groundY(s.f1[0])];
    hero.swing ^= 1;
    hero.stride = null;
  }

  function walk(v) {
    const t = now();
    tap(kickTimes, t);
    finishStride(); // o pé do passo anterior pousa EXATAMENTE neste kick
    hero.footT = t; hero.footV = v;
    const len = 0.28 + 0.4 * v;              // força = tamanho do passo
    const x1 = hero.x + len;                 // o corpo anda um passo…
    const fx = clearRiser(x1 + len * 0.5);   // …e o pé que estava atrás pousa meio passo à frente
    hero.stride = {
      x0: hero.x, y0: hero.y, x1, y1: groundY(x1), t0: t, len,
      dur: beatP() * 0.92,                   // o passo dura até o próximo kick
      f0: hero.feet[hero.swing], f1: [fx, groundY(fx)],
      lift: 0.02 + 0.05 * v,
    };
  }

  // ---------- BASS: a escada sobe ----------
  function raise(v) {
    const t = now();
    const last = steps[steps.length - 1];
    // o degrau novo nasce À FRENTE da pessoa (nunca embaixo dela nem dos pés)
    let front = Math.max(hero.x, hero.feet[0][0], hero.feet[1][0]);
    if (hero.stride) front = Math.max(front, hero.stride.x1, hero.stride.f1[0]);
    const ahead = front + 0.35;
    let x = last.x + last.w;
    if (x < ahead) { last.w = ahead - last.x; x = ahead; } // o plano se estende até ali
    const rise = 0.1 + 0.45 * Math.pow(v, 1.1);           // força = altura do degrau
    steps.push({ x, y: last.y + rise, w: STEP_W, rise, born: t, v, dur: clamp(beatP() * 0.3, 0.07, 0.22) });
    // esquece o que ficou muito pra trás
    let behind = 0;
    while (behind < steps.length - 1 && steps[behind + 1].x < hero.x - 40) behind++;
    if (behind > 0) steps.splice(0, behind);
  }

  // ---------- HI-HAT: chuva ----------
  function rain(v) {
    const t = now();
    tap(hatTimes, t);
    // a pancada some antes do próximo hi-hat: dá pra ver o ritmo na chuva
    const life = Math.min(0.08 + 0.32 * v, Math.max(0.06, hatP() * 0.85));
    const n = Math.round(6 + 64 * Math.pow(v, 1.5)); // força = quantidade…
    for (let k = 0; k < n; k++) {
      drops.push({
        x: Math.random() * W, y: Math.random() * H,
        len: U * (0.09 + 0.5 * v) * (0.6 + 0.8 * Math.random()), // …e tamanho das gotas
        sp: H * (0.9 + 0.8 * v), born: t, life,
        a: 0.3 + 0.6 * v, w: 0.7 + 1.4 * v,
      });
    }
    if (drops.length > 2000) drops.splice(0, drops.length - 2000);
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
    const k = clamp((t - bg.t0) / 0.05, 0, 1); // troca na batida (quase instantâneo)
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
    if (type === "kick") walk(v);
    else if (type === "bass") raise(v);
    else if (type === "hat") rain(v);
    else if (type === "snare") changeBg(v);
  }
  function setBpm(b) { if (b > 30 && b < 300) { bpm = b; bpmT = now(); } }

  // ---------- movimento ----------
  function pose(t) {
    // posição do corpo e dos pés agora
    const s = hero.stride;
    if (!s) return { x: hero.x, y: hero.y, feet: hero.feet, swingX: null };
    const k = clamp((t - s.t0) / s.dur, 0, 1), e = ease(k);
    const x = lerp(s.x0, s.x1, e);
    const y = lerp(s.y0, s.y1, e) + s.lift * Math.sin(Math.PI * k);
    // o pé que anda levanta (mais alto quando sobe degrau) e pousa à frente
    const fx = lerp(s.f0[0], s.f1[0], e);
    const fy = lerp(s.f0[1], s.f1[1], Math.min(1, e * 1.4)) + (0.06 + 0.12 * s.len + Math.max(0, s.f1[1] - s.f0[1]) * 0.6) * Math.sin(Math.PI * k);
    const feet = [];
    feet[hero.swing] = [fx, fy];
    feet[hero.swing ^ 1] = hero.feet[hero.swing ^ 1];
    return { x, y, feet, swingX: fx };
  }

  function update(dt, t) {
    if (hero.stride && t - hero.stride.t0 >= hero.stride.dur) finishStride(); // sem kick novo: para
    const p = pose(t);
    const k = 1 - Math.exp(-dt * 2.4);
    cam.x += (p.x + CAM_DX - cam.x) * k;
    cam.y += (p.y + CAM_DY - cam.y) * k;
    if (drops.length && t - drops[0].born > drops[0].life) drops = drops.filter((d) => t - d.born <= d.life);
    return p;
  }

  // ---------- desenho ----------
  const sx = (x) => W / 2 + (x - cam.x) * U;
  const sy = (y) => H / 2 - (y - cam.y) * U;
  const stepY = (s, t) => {
    if (s.floor) return s.y;
    const k = clamp((t - s.born) / s.dur, 0, 1);
    const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // sobe com um pequeno exagero
    return s.y - s.rise + s.rise * e;
  };

  function drawSteps(t) {
    const lw = Math.max(1.5, U * 0.035);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], prev = steps[i - 1], lastOne = i === steps.length - 1;
      const x0 = i === 0 ? Math.min(sx(s.x), -10) : sx(s.x);
      const x1 = lastOne ? Math.max(sx(s.x + s.w), W + 10) : sx(s.x + s.w); // o último segue plano até a borda
      const y = sy(stepY(s, t));
      if (x1 < -40 || x0 > W + 40) continue;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(x0, y, x1 - x0, Math.max(0, H - y));
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = lw;
      ctx.beginPath();
      if (prev) { ctx.moveTo(x0, sy(stepY(prev, t))); ctx.lineTo(x0, y); } else ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      // brilho do degrau que acabou de subir (proporcional à força do baixo)
      const age = t - s.born;
      if (!s.floor && age < 0.3) {
        const k = 1 - age / 0.3;
        ctx.strokeStyle = `rgba(255,255,255,${(0.35 * k).toFixed(3)})`;
        ctx.lineWidth = lw * (1 + 4 * s.v * k);
        ctx.beginPath();
        ctx.moveTo(x0, sy(stepY(prev, t)));
        ctx.lineTo(x0, y);
        ctx.lineTo(Math.min(x1, sx(s.x + s.w)), y);
        ctx.stroke();
      }
    }
  }

  // perna com joelho: dados quadril e pé, acha o joelho (dobra pra frente)
  function knee(h, f, L) {
    let dx = f[0] - h[0], dy = f[1] - h[1], d = Math.hypot(dx, dy) || 1e-6;
    const max = 2 * L * 0.999;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; f = [h[0] + dx, h[1] + dy]; }
    const hh = Math.sqrt(Math.max(0, L * L - (d * d) / 4));
    return [[h[0] + dx / 2 + (dy / d) * hh, h[1] + dy / 2 - (dx / d) * hh], f];
  }

  function drawHero(t, p) {
    const lw = Math.max(2, U * 0.055);
    // o kick é o pé pousando: o corpo afunda um pouco (mais forte, mais fundo)
    const fa = t - hero.footT;
    const dip = fa < 0.14 ? (0.02 + 0.06 * hero.footV) * Math.sin((Math.PI * fa) / 0.14) : 0;
    const P = (x, y) => [sx(x), sy(y)];
    const hip = P(p.x, p.y + 0.5 - dip);
    const sh = P(p.x + 0.03, p.y + 0.82 - dip);
    const head = P(p.x + 0.05, p.y + 0.97 - dip);
    // braços balançam ao contrário da perna que anda
    const a = p.swingX == null ? 0 : clamp((p.swingX - p.x) * 1.6, -0.7, 0.7);
    const hand = (ang) => [sh[0] + 0.3 * U * Math.sin(ang), sh[1] + 0.3 * U * Math.cos(ang)];
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const ft of p.feet) {                       // pernas (com joelho)
      const [kn, f] = knee(hip, P(ft[0], ft[1]), LEG * U);
      ctx.moveTo(hip[0], hip[1]); ctx.lineTo(kn[0], kn[1]); ctx.lineTo(f[0], f[1]);
    }
    ctx.moveTo(hip[0], hip[1]); ctx.lineTo(sh[0], sh[1]); // corpo
    const h1 = hand(-a), h2 = hand(a);
    ctx.moveTo(h1[0], h1[1]); ctx.lineTo(sh[0], sh[1]); ctx.lineTo(h2[0], h2[1]); // braços
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(head[0], head[1], U * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRain(t) {
    ctx.lineCap = "round";
    for (const d of drops) {
      const age = t - d.born, k = 1 - age / d.life;
      if (k <= 0) continue;
      const y = d.y + d.sp * age, x = d.x + d.sp * 0.18 * age;
      ctx.strokeStyle = `rgba(255,255,255,${(d.a * k).toFixed(3)})`;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + d.len * 0.18, y + d.len);
      ctx.stroke();
    }
  }

  function draw(t, p) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const c = bgNow(t);
    ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.fillRect(0, 0, W, H);
    drawSteps(t);
    drawHero(t, p);
    drawRain(t);
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
    const p = update(dt, t);
    draw(t, p);
  }
  raf = requestAnimationFrame(frame);

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    window.removeEventListener("resize", resize);
  }

  return { hit, reset, setBpm, destroy, canvas };
}
