/* Projeto 3 — BAUHAUS ORBITAL (024)

   Uma composição Bauhaus em órbitas: papel creme, um sol vermelho no centro e quatro
   anéis. Cada instrumento é o relógio do SEU anel e só mexe nele (nenhum invade o outro):
   - KICK    o sol PULSA e solta uma onda; a lua preta do primeiro anel anda 1/4 de volta
             por kick (4 kicks = uma volta inteira, o compasso). Força = pulso e onda.
   - BASS    cada nota põe um PLANETA AZUL na entrada do anel do baixo e o anel gira um
             passo: a linha de baixo vira uma corrente de planetas. Força = tamanho.
   - HI-HAT  cada nota acende um TRIÂNGULO preto no anel de fora, um passo adiante do
             anterior (16 por volta); some antes de a volta fechar. Força = tamanho.
   - SNARE   um ARCO AMARELO grosso pula pro próximo quarto do anel do meio, com dois
             quadrados vermelhos nas pontas. Força = espessura do arco.

   Uso:
     const orbital = createBauhausOrbital(canvas);
     orbital.hit('kick' | 'bass' | 'hat' | 'snare', força 0–1);   // outro tipo: ignorado
     orbital.setBpm(124);  // opcional: andamento do clock MIDI (duração dos movimentos)
     orbital.reset();      // composição de novo
     orbital.destroy();    // encerra a cena                                              */

export function createBauhausOrbital(canvas) {
  const ctx = canvas.getContext("2d");
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (s) => 1 - Math.pow(1 - s, 3);
  const now = () => performance.now() / 1000;
  const TAU = Math.PI * 2;

  const PAPER = "#ede6d6", INK = "#151515", RED = "#d3262c", BLUE = "#1d4f9e", YELLOW = "#f1b70e";

  // ---------- tela ----------
  let W = 1, H = 1, DPR = 1, R = 100, cx = 0, cy = 0;
  let grain = null; // textura de papel, feita uma vez por tamanho
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    R = Math.min(W, H) * 0.46; cx = W / 2; cy = H / 2;
    grain = null;
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  // anéis (fração de R): sol · kick · baixo · caixa · hi-hat
  const RING = { sun: 0.13, kick: 0.24, bass: 0.44, snare: 0.66, hat: 0.88 };

  // ---------- andamento (só pra duração dos movimentos) ----------
  let bpm = null, bpmT = -9;
  const kickTimes = [];
  const beatP = () => {
    if (bpm && now() - bpmT < 4) return 60 / bpm;
    const iv = [];
    for (let i = 1; i < kickTimes.length; i++) { const d = kickTimes[i] - kickTimes[i - 1]; if (d > 0.18 && d < 1.6) iv.push(d); }
    iv.sort((a, b) => a - b);
    return iv.length ? iv[iv.length >> 1] : 0.5;
  };
  const move = () => clamp(beatP() * 0.35, 0.1, 0.22); // movimentos curtos, colados na batida

  // ---------- estado ----------
  let S;
  function reset() {
    S = {
      kick: { step: 0, from: 0, to: 0, t0: -9, v: 0, dur: 0.15, pulseT: -9, waves: [] },
      bass: { turn: 0, from: 0, to: 0, t0: -9, dur: 0.15, planets: [], n: 0 },
      snare: { q: -1, arcs: [] },
      hat: { i: -1, sats: [] },
    };
    kickTimes.length = 0;
  }
  reset();

  // ---------- os instrumentos ----------
  function kick(v) {
    const t = now(), K = S.kick;
    kickTimes.push(t); if (kickTimes.length > 9) kickTimes.shift();
    K.from = angleNow(K, t); K.step++; K.to = K.step * (TAU / 4); K.t0 = t; K.dur = move(); K.v = v;
    K.pulseT = t;
    K.waves.push({ t0: t, v });
    if (K.waves.length > 6) K.waves.shift();
  }
  function bass(v) {
    const t = now(), B = S.bass;
    B.from = angleNow(B, t); B.turn++; B.to = B.turn * (TAU / 16); B.t0 = t; B.dur = move();
    // o planeta novo nasce na ENTRADA (no alto) e já gira junto com o anel
    B.planets.push({ a: -Math.PI / 2 - B.to, n: B.n++, born: t, v }); // depois do passo, fica no alto
    if (B.planets.length > 14) B.planets.shift();
  }
  function snare(v) {
    const t = now(), N = S.snare;
    N.q = (N.q + 1) % 4;
    N.arcs.push({ q: N.q, born: t, v });
    if (N.arcs.length > 4) N.arcs.shift();
  }
  function hat(v) {
    const t = now(), Hh = S.hat;
    Hh.i = (Hh.i + 1) % 16;
    Hh.sats.push({ i: Hh.i, born: t, v });
    if (Hh.sats.length > 32) Hh.sats.shift();
  }
  function hit(type, amount = 1) {
    const v = clamp(Number.isFinite(+amount) ? +amount : 1, 0, 1);
    if (type === "kick") kick(v);
    else if (type === "bass") bass(v);
    else if (type === "hat") hat(v);
    else if (type === "snare") snare(v);
  }
  function setBpm(b) { if (b > 30 && b < 300) { bpm = b; bpmT = now(); } }

  // giro de um anel agora (passo com freio no fim: o movimento "bate" com a nota)
  function angleNow(X, t) {
    const k = clamp((t - X.t0) / X.dur, 0, 1);
    return lerp(X.from, X.to, easeOut(k));
  }

  // ---------- desenho ----------
  function paper() {
    if (!grain) {
      grain = document.createElement("canvas");
      grain.width = canvas.width; grain.height = canvas.height;
      const g = grain.getContext("2d");
      g.fillStyle = PAPER; g.fillRect(0, 0, grain.width, grain.height);
      const img = g.getImageData(0, 0, grain.width, grain.height), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      g.putImageData(img, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(grain, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function construction() {
    const lw = Math.max(1, R * 0.004);
    ctx.strokeStyle = INK;
    // linhas de construção: horizontal e vertical pelo centro, e uma diagonal
    ctx.globalAlpha = 0.14; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.moveTo(cx - R * 1.3, cy + R * 1.3); ctx.lineTo(cx + R * 1.3, cy - R * 1.3);
    ctx.stroke();
    // os anéis
    ctx.globalAlpha = 0.55;
    for (const k of ["kick", "bass", "snare", "hat"]) {
      ctx.lineWidth = k === "hat" ? lw * 0.8 : lw;
      ctx.beginPath(); ctx.arc(cx, cy, RING[k] * R, 0, TAU); ctx.stroke();
    }
    // 16 marcas no anel de fora (os lugares dos hi-hats)
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 16, r0 = RING.hat * R, r1 = r0 + R * (i % 4 === 0 ? 0.05 : 0.025);
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawSnare(t) {
    // arco amarelo grosso no quarto da vez; o anterior apaga enquanto o novo entra
    for (const A of S.snare.arcs) {
      const age = t - A.born, fade = clamp(1 - age / 1.6, 0, 1);
      if (fade <= 0) continue;
      const k = easeOut(clamp(age / 0.08, 0, 1));         // entra de uma vez
      const a0 = -Math.PI / 2 + A.q * (TAU / 4) + 0.07, a1 = a0 + (TAU / 4 - 0.14) * k;
      const w = R * (0.035 + 0.075 * A.v);
      const r = RING.snare * R;
      ctx.globalAlpha = A === S.snare.arcs[S.snare.arcs.length - 1] ? 1 : fade * 0.5;
      ctx.lineCap = "butt";
      ctx.strokeStyle = INK; ctx.lineWidth = w + Math.max(2, R * 0.008);
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
      ctx.strokeStyle = YELLOW; ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
      // quadrados vermelhos nas pontas
      const s = R * (0.03 + 0.03 * A.v);
      ctx.fillStyle = RED;
      for (const a of [a0, a1]) {
        ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a);
        ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBass(t) {
    const B = S.bass, rot = angleNow(B, t), r = RING.bass * R;
    const last = B.planets[B.planets.length - 1];
    // raio de construção do centro até o planeta mais novo (some rápido)
    if (last && t - last.born < 0.35) {
      const a = last.a + rot, k = 1 - (t - last.born) / 0.35;
      ctx.globalAlpha = 0.6 * k; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, R * 0.005);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const n = B.planets.length;
    B.planets.forEach((p, i) => {
      const a = p.a + rot, age = t - p.born;
      const pop = age < 0.12 ? 1 + 0.35 * Math.sin((Math.PI * age) / 0.12) : 1; // nasce com um estalo
      const old = n - 1 - i;                                                     // quantas notas mais novas
      const alpha = old < 8 ? 1 : clamp(1 - (old - 7) / 6, 0, 1);
      if (alpha <= 0) return;
      const rr = R * (0.025 + 0.07 * p.v) * pop * (old < 8 ? 1 : 0.85);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = old === 0 ? BLUE : old % 5 === 2 ? INK : BLUE;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rr, 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawHat(t) {
    const r = RING.hat * R;
    const life = 0.5;
    ctx.fillStyle = INK;
    for (const s of S.hat.sats) {
      const age = t - s.born, k = 1 - age / life;
      if (k <= 0) continue;
      const a = -Math.PI / 2 + (s.i * TAU) / 16;
      const size = R * (0.018 + 0.05 * s.v) * (age < 0.05 ? 0.6 + 0.4 * (age / 0.05) : 1);
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.rotate(a + Math.PI / 2); // o triângulo aponta pra fora
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.87, size * 0.5); ctx.lineTo(-size * 0.87, size * 0.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawKick(t) {
    const K = S.kick;
    // ondas do kick: um anel preto sai do sol até o anel do kick
    for (const w of K.waves) {
      const age = t - w.t0, k = age / 0.32;
      if (k >= 1) continue;
      const r = lerp(RING.sun, RING.bass * 0.98, easeOut(k)) * R;
      ctx.globalAlpha = (1 - k) * (0.4 + 0.6 * w.v);
      ctx.strokeStyle = INK; ctx.lineWidth = R * (0.006 + 0.02 * w.v) * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // a lua do kick: 1/4 de volta por kick, com um rastro do caminho
    const a = -Math.PI / 2 + angleNow(K, t), rk = RING.kick * R;
    const kk = clamp((t - K.t0) / K.dur, 0, 1);
    if (kk < 1 || t - K.t0 < 0.3) {
      const a0 = -Math.PI / 2 + K.from, fade = 1 - clamp((t - K.t0 - K.dur) / 0.3, 0, 1);
      ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = INK; ctx.lineWidth = R * 0.02; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx, cy, rk, a0, Math.max(a0, a)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rk, cy + Math.sin(a) * rk, R * 0.045, 0, TAU); ctx.fill();
    // o sol: pulsa no kick (mais forte, maior)
    const pa = t - K.pulseT;
    const pulse = pa < 0.28 ? (0.1 + 0.32 * K.v) * (pa < 0.03 ? pa / 0.03 : Math.pow(1 - (pa - 0.03) / 0.25, 2)) : 0;
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.arc(cx, cy, RING.sun * R * (1 + pulse), 0, TAU); ctx.fill();
  }

  function draw(t) {
    paper();
    construction();
    drawSnare(t);
    drawBass(t);
    drawHat(t);
    drawKick(t);
  }

  // ---------- laço ----------
  let raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (canvas.hidden) return; // aba fechada: não gasta nada
    if (Math.abs(canvas.getBoundingClientRect().width - W) > 1) resize();
    draw(now());
  }
  raf = requestAnimationFrame(frame);

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    window.removeEventListener("resize", resize);
  }

  // pra testes: em que passo está cada anel
  const state = () => ({ kick: S.kick.step, bass: S.bass.turn, planets: S.bass.planets.length, snare: S.snare.arcs.length, snareQ: S.snare.q, hat: S.hat.sats.length, hatI: S.hat.i });
  return { hit, reset, setBpm, destroy, canvas, state };
}
