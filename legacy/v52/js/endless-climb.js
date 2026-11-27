/* Projeto 2 — ESCADA SEM FIM (Endless Climb)

   Cada som tem um papel só, sempre o mesmo, e tudo acontece NO TEMPO da música:
   - KICK    faz a pessoa ANDAR: cada kick é UM passo dado NA HORA do kick, sempre do
             mesmo tamanho (um degrau): 4 kicks no compasso = 4 passos iguais, no 4/4.
             Com escada à frente, cada kick sobe um degrau. Força = o quanto o corpo balança.
   - BASS    faz a ESCADA SUBIR: cada nota levanta um degrau novo à frente da pessoa.
             Força = altura do degrau. Sem baixo, o caminho segue plano.
   - HI-HAT  faz CHOVER (só isso): cada hi-hat é uma pancada de chuva que some antes do
             próximo. Força = quantidade e tamanho das gotas.
   - SNARE   faz a pessoa CRESCER na hora da batida e voltar ao tamanho normal até a
             próxima. Força = quanto ela cresce.
   - CHORD   muda a COR DO FUNDO na hora do acorde. Força = quão clara é a cor.

   Uso:
     const visual = createEndlessClimb(canvas);
     visual.hit('kick' | 'bass' | 'hat' | 'snare' | 'chord', força 0–1);   // força opcional (1)
     visual.setBpm(120);   // opcional: andamento vindo do clock MIDI
     visual.reset();       // começa de novo                                          */

export function createEndlessClimb(canvas) {
  const ctx = canvas.getContext("2d");
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (s) => 1 - Math.pow(1 - s, 3); // quase todo o movimento logo no começo: o passo "bate" com o kick
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
  // andamento: vem do clock MIDI, ou é medido nos próprios kicks (só limita a duração do passo)
  const kickTimes = [], hatTimes = [], snareTimes = [];
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
  // tudo numa grade: cada degrau tem a largura de UM passo, e cada pé pisa no meio de um degrau
  const STEP_W = 0.6;               // largura de cada degrau = tamanho de cada passo (sempre igual)
  const LEG = 0.3;                  // coxa = canela
  const CAM_DX = 1.6, CAM_DY = 1.3; // a pessoa fica à esquerda e abaixo do centro
  let steps, hero, drops, bg, cam;

  function reset() {
    const t = now();
    steps = [{ x: -8, y: 0, w: 8 + STEP_W / 2, rise: 0, born: t - 9, v: 0, dur: 0.1, floor: true }];
    // a pessoa fica com um pé no degrau "col" (o da frente) e outro no anterior; o corpo entre os dois
    hero = { col: 0, x: -STEP_W / 2, y: 0, feet: [[-STEP_W, 0], [0, 0]], swing: 0, stride: null, footT: -9, footV: 0, growT: -9, growV: 0, growFrom: 1 };
    drops = [];
    bg = { from: [0, 0, 0], to: [0, 0, 0], t0: -9, hue: Math.random() * 360 };
    cam = { x: hero.x + CAM_DX, y: hero.y + CAM_DY };
    kickTimes.length = 0;
    hatTimes.length = 0;
    snareTimes.length = 0;
  }
  reset();

  // chão em cada ponto: o degrau mais à direita que já começou ali (altura final)
  function groundY(x) {
    for (let i = steps.length - 1; i >= 0; i--) if (steps[i].x <= x + 1e-9) return steps[i].y;
    return steps[0].y;
  }

  // ---------- KICK: um passo ----------
  function finishStride() {
    const s = hero.stride;
    if (!s) return;
    hero.col = s.col;
    hero.feet[hero.swing] = [s.f1[0], groundY(s.f1[0])];
    hero.x = s.x1; hero.y = (hero.feet[0][1] + hero.feet[1][1]) / 2;
    hero.swing ^= 1;
    hero.stride = null;
  }

  function walk(v) {
    const t = now();
    tap(kickTimes, t);
    finishStride(); // se o passo anterior ainda não terminou, termina agora
    hero.footT = t; hero.footV = v;
    // UM passo, sempre do mesmo tamanho: o pé de trás vai pro meio do próximo degrau (no plano
    // ou subindo) e o corpo avança um degrau. A força só muda o quanto o corpo balança.
    const col = hero.col + 1, fx = col * STEP_W, fy = groundY(fx);
    const other = hero.feet[hero.swing ^ 1];
    hero.stride = {
      col, x0: hero.x, y0: hero.y, x1: hero.x + STEP_W, y1: (other[1] + fy) / 2, t0: t, len: STEP_W,
      dur: clamp(beatP() * 0.35, 0.1, 0.2), // passo curto, colado no kick
      f0: hero.feet[hero.swing], f1: [fx, fy],
      lift: 0.03 + 0.06 * v,
    };
  }

  // ---------- BASS: a escada sobe ----------
  function raise(v) {
    const t = now();
    const last = steps[steps.length - 1];
    // o degrau novo nasce À FRENTE da pessoa, na grade (nunca embaixo dos pés): no primeiro
    // degrau depois do pé da frente (ou de onde ele está indo)
    const front = hero.stride ? hero.stride.col : hero.col;
    const lastCol = last.floor ? -999 : Math.round((last.x + STEP_W / 2) / STEP_W);
    const col = Math.max(front + 1, lastCol + 1);
    const rise = 0.1 + 0.35 * Math.pow(v, 1.1);           // força = altura do degrau
    // a escada à frente nunca sai da tela: se já tem os degraus que cabem à frente da pessoa
    // (o baixo tocando mais que o kick), o baixo levanta o ÚLTIMO degrau ali mesmo, na tela
    const fit = clamp(Math.floor((W / 2 / U + CAM_DX - 0.6) / STEP_W), 3, 10);
    if (col - front > fit && !last.floor) {
      const top = hero.y + (H / 2 / U + CAM_DY) * 0.85;       // e nem por cima da tela
      const y = Math.min(last.y + rise, Math.max(top, last.y));
      const r = Math.max(0.06, y - last.y);                   // no teto: o degrau dá um pulo no lugar
      last.y = y; last.rise = r; last.born = t; last.v = v; last.dur = 0.06;
      return;
    }
    const x = col * STEP_W - STEP_W / 2;
    if (last.x + last.w < x) last.w = x - last.x; // o plano se estende até ali
    steps.push({ x, y: last.y + rise, w: STEP_W, rise, born: t, v, dur: 0.06 }); // sobe na hora da nota
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
    // toda nota chove (até a mais fraca); a força muda quantidade, tamanho e brilho
    const life = Math.max(0.07, Math.min(0.1 + 0.3 * v, hatP() * 0.9));
    const n = Math.round(12 + 70 * Math.pow(v, 0.8)); // força = quantidade…
    for (let k = 0; k < n; k++) {
      drops.push({
        x: Math.random() * W, y: Math.random() * H,
        len: U * (0.16 + 0.5 * v) * (0.6 + 0.8 * Math.random()), // …e tamanho das gotas
        sp: H * (0.9 + 0.8 * v), born: t, life,
        a: 0.5 + 0.5 * v, w: 1 + 1.4 * v,
      });
    }
    if (drops.length > 2000) drops.splice(0, drops.length - 2000);
  }

  // ---------- SNARE: a pessoa cresce ----------
  // cresce de uma vez na batida (~25 ms) e volta ao normal antes da próxima caixa
  const snareP = () => median(snareTimes, 0.12, 3, beatP() * 2);
  function growNow(t) {
    const a = t - hero.growT;
    if (a < 0 || hero.growV <= 0) return 1;
    const top = 1 + Math.pow(hero.growV, 1.2); // força = quanto cresce: nota fantasma ~10–15%, caixa cheia ~2×
    const up = 0.025, back = clamp(snareP() * 0.7, 0.16, 0.6);
    if (a < up) return lerp(hero.growFrom, top, easeOut(a / up));
    const k = clamp((a - up) / back, 0, 1);
    return lerp(top, 1, 1 - Math.pow(1 - k, 2));
  }
  function grow(v) {
    const t = now();
    tap(snareTimes, t);
    hero.growFrom = growNow(t); // caixa em cima de caixa: cresce a partir de onde está
    hero.growT = t; hero.growV = Math.max(0.05, v);
  }

  // ---------- CHORD: cor do fundo ----------
  function hsl(h, s, l) {
    const f = (n) => {
      const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return [f(0), f(8), f(4)];
  }
  function bgNow(t) {
    const k = clamp((t - bg.t0) / 0.02, 0, 1); // troca na batida (instantâneo)
    return bg.from.map((c, i) => lerp(c, bg.to[i], k));
  }
  function changeBg(v) {
    const t = now();
    bg.from = bgNow(t);
    bg.hue = (bg.hue + 137.508) % 360; // cada acorde, uma cor bem diferente da anterior
    bg.to = hsl(bg.hue, 0.65 + 0.25 * v, 0.2 + 0.2 * v); // sempre uma cor bem visível; força = quão clara
    bg.t0 = t;
  }

  function hit(type, amount = 1) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    if (type === "kick") walk(v);
    else if (type === "bass") raise(v);
    else if (type === "hat") rain(v);       // hi-hat: só chuva
    else if (type === "snare") grow(v);     // caixa: a pessoa cresce
    else if (type === "chord") changeBg(v); // acorde: cor do fundo
  }
  function setBpm(b) { if (b > 30 && b < 300) { bpm = b; bpmT = now(); } }

  // ---------- movimento ----------
  function pose(t) {
    // posição do corpo e dos pés agora
    const s = hero.stride;
    if (!s) return { x: hero.x, y: hero.y, feet: hero.feet, swingX: null };
    const k = clamp((t - s.t0) / s.dur, 0, 1), e = easeOut(k);
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
    const k = 1 - Math.exp(-dt * 4.5); // a pessoa pula pra frente no kick e a câmera vem atrás (dá pra ver cada passo)
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
      // marcas fixas no chão (duas por passo): no plano, mostram cada passo andando
      const wa = (x0 - W / 2) / U + cam.x, wb = (x1 - W / 2) / U + cam.x;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = Math.max(1, lw * 0.6);
      ctx.beginPath();
      for (let gx = Math.ceil(wa / (STEP_W / 2)) * (STEP_W / 2); gx < wb; gx += STEP_W / 2) {
        const px = sx(gx);
        if (px < -5 || px > W + 5) continue;
        ctx.moveTo(px, y + lw); ctx.lineTo(px, y + lw + U * 0.07);
      }
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
    const g = growNow(t); // caixa: a pessoa cresce a partir dos pés (os pés continuam no degrau)
    const lw = Math.max(2, U * 0.055) * (1 + 0.6 * (g - 1));
    // o kick é o pé pousando: o corpo afunda um pouco (mais forte, mais fundo)
    const fa = t - hero.footT;
    const dip = (fa < 0.12 ? (0.04 + 0.08 * hero.footV) * Math.sin((Math.PI * fa) / 0.12) : 0) * g;
    const P = (x, y) => [sx(x), sy(y)];
    const hip = P(p.x, p.y + 0.5 * g - dip);
    const sh = P(p.x + 0.03 * g, p.y + 0.82 * g - dip);
    const head = P(p.x + 0.05 * g, p.y + 0.97 * g - dip);
    // braços balançam ao contrário da perna que anda
    const a = p.swingX == null ? 0 : clamp((p.swingX - p.x) * 1.6, -0.7, 0.7);
    const hand = (ang) => [sh[0] + 0.3 * g * U * Math.sin(ang), sh[1] + 0.3 * g * U * Math.cos(ang)];
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const ft of p.feet) {                       // pernas (com joelho)
      const [kn, f] = knee(hip, P(ft[0], ft[1]), LEG * g * U);
      ctx.moveTo(hip[0], hip[1]); ctx.lineTo(kn[0], kn[1]); ctx.lineTo(f[0], f[1]);
    }
    ctx.moveTo(hip[0], hip[1]); ctx.lineTo(sh[0], sh[1]); // corpo
    const h1 = hand(-a), h2 = hand(a);
    ctx.moveTo(h1[0], h1[1]); ctx.lineTo(sh[0], sh[1]); ctx.lineTo(h2[0], h2[1]); // braços
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(head[0], head[1], U * 0.12 * g, 0, Math.PI * 2);
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

  // pra testes: onde está a pessoa, a escada (soma das alturas), a chuva, o tamanho e a cor agora
  const state = () => ({ x: hero.x, y: hero.y, steps: steps.length, stairs: +steps.reduce((a, s) => a + s.y, 0).toFixed(3), drops: drops.length, size: +growNow(now()).toFixed(3), bg: bgNow(now()).map((c) => c | 0) });
  return { hit, reset, setBpm, destroy, canvas, state };
}
