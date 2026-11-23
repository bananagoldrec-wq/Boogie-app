/* Cycles Visual — análise de uma música inteira (arquivo) antes de tocar.

   Olhando a faixa toda de uma vez dá pra separar melhor os instrumentos do
   que ouvindo ao vivo: os limiares são relativos à própria música (uma intro
   só com baixo não dispara "kick", porque o kick de verdade, mais adiante,
   define o que é forte), e dá pra conferir o que acontece logo depois de cada
   batida (kick morre rápido; baixo sustenta).

   Saída: lista de eventos { t (s), v (voz), vel (1..127), note (midi) } com
   v ∈ kick, snare, hat, chord, lead, vocal, fx. É uma estimativa por
   heurística sobre o espectro — não é separação de stems. */
(function () {
  "use strict";

  const SR = 22050, N = 2048, HOP = 256, BINS = N / 2;
  const FPS = SR / HOP; // ~86 quadros por segundo
  const binHz = SR / N;
  // faixas: sub, baixo, médio-grave, médio, presença, agudo
  const BANDS = [[30, 110], [110, 250], [250, 1000], [1000, 3000], [3000, 6000], [6000, 11000]];

  function makeFFT(n) {
    const levels = Math.log2(n) | 0;
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < levels; b++) r = (r << 1) | ((i >>> b) & 1);
      rev[i] = r;
    }
    const wr = new Float32Array(n / 2), wi = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) { wr[i] = Math.cos((2 * Math.PI * i) / n); wi[i] = -Math.sin((2 * Math.PI * i) / n); }
    return function fft(re, im) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const l = i + j + half, m = i + j;
            const tr = re[l] * wr[k] - im[l] * wi[k];
            const ti = re[l] * wi[k] + im[l] * wr[k];
            re[l] = re[m] - tr; im[l] = im[m] - ti;
            re[m] += tr; im[m] += ti;
          }
        }
      }
    };
  }

  // decodifica o arquivo e reduz pra mono 22 kHz
  async function decode(arrayBuffer) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const tmp = new AC();
    const buf = await new Promise((res, rej) => {
      const p = tmp.decodeAudioData(arrayBuffer, res, rej);
      if (p && p.then) p.then(res, rej);
    });
    tmp.close && tmp.close();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(1, Math.max(1, Math.ceil(buf.duration * SR)), SR);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start(0);
    const out = await new Promise((res, rej) => {
      off.oncomplete = (e) => res(e.renderedBuffer);
      const p = off.startRendering();
      if (p && p.then) p.then(res, rej);
    });
    return out.getChannelData(0);
  }

  const pause = () => new Promise((r) => setTimeout(r, 0));

  function percentile(arr, q) {
    const step = Math.max(1, Math.floor(arr.length / 4000));
    const s = [];
    for (let i = 0; i < arr.length; i += step) s.push(arr[i]);
    s.sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))] || 0;
  }

  // picos de uma função de "ataque": máximo local, acima da média local e de um piso
  function peaks(odf, { k = 1.4, win = 0.35, floor = 0, gap = 0.1 }) {
    const W = Math.round(win * FPS), G = Math.round(gap * FPS);
    const out = [];
    let sum = 0, last = -1e9;
    for (let i = 0; i < Math.min(W, odf.length); i++) sum += odf[i];
    for (let i = 1; i < odf.length - 1; i++) {
      const a = i - W - 1, b = i + W;
      if (b < odf.length) sum += odf[b];
      if (a >= 0) sum -= odf[a];
      const n = Math.min(odf.length, b + 1) - Math.max(0, a + 1);
      const mean = sum / Math.max(1, n);
      const v = odf[i];
      if (v >= odf[i - 1] && v > odf[i + 1] && v > mean * k && v > floor && i - last >= G) {
        out.push(i);
        last = i;
      }
    }
    return out;
  }

  async function analyse(arrayBuffer, onProgress = () => {}) {
    const x = await decode(arrayBuffer);
    const F = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
    const fft = makeFFT(N);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const re = new Float32Array(N), im = new Float32Array(N);
    const logm = new Float32Array(BINS), prev = new Float32Array(BINS);

    const bandOf = new Int8Array(BINS).fill(-1);
    for (let k = 1; k < BINS; k++) {
      const hz = k * binHz;
      BANDS.forEach(([lo, hi], b) => { if (hz >= lo && hz < hi) bandOf[k] = b; });
    }
    const pcOf = new Int8Array(BINS).fill(-1);
    for (let k = 1; k < BINS; k++) {
      const hz = k * binHz;
      if (hz >= 110 && hz <= 1760) pcOf[k] = (((Math.round(12 * Math.log2(hz / 440) + 69) % 12) + 12) % 12);
    }

    const E = BANDS.map(() => new Float32Array(F));
    const FL = BANDS.map(() => new Float32Array(F));
    const chroma = new Float32Array(F * 12);
    const pitch = new Float32Array(F), prom = new Float32Array(F), mono = new Float32Array(F);
    const lowC = new Float32Array(F); // centro de massa do grave (30–300 Hz): o kick "cai" de tom, o baixo não
    const flatMid = new Float32Array(F), flatHigh = new Float32Array(F);

    for (let f = 0; f < F; f++) {
      const o = f * HOP;
      for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let pk = 0, pkI = 0, sumPL = 0, nPL = 0, lcw = 0, lcs = 0;
      let gm = 0, am = 0, nm = 0, gh = 0, ah = 0, nh = 0;
      for (let k = 1; k < BINS; k++) {
        const mag = Math.hypot(re[k], im[k]) / N;
        const pw = mag * mag;
        const b = bandOf[k];
        const lm = Math.log(1 + 1000 * mag);
        logm[k] = lm;
        if (b >= 0) {
          E[b][f] += pw;
          const d = lm - prev[k];
          if (d > 0) FL[b][f] += d;
        }
        const pc = pcOf[k];
        if (pc >= 0) chroma[f * 12 + pc] += pw;
        const hz = k * binHz;
        if (hz >= 30 && hz <= 300) { lcw += pw * hz; lcs += pw; }
        if (hz >= 150 && hz <= 3000) { sumPL += mag; nPL++; if (mag > pk) { pk = mag; pkI = k; } }
        const l = Math.log(pw + 1e-12);
        if (hz >= 1000 && hz < 6000) { gm += l; am += pw; nm++; }
        else if (hz >= 6000 && hz < 11000) { gh += l; ah += pw; nh++; }
      }
      prev.set(logm);
      // tom mais forte entre 150 Hz e 3 kHz (com interpolação), e o quanto ele se destaca
      if (pkI > 1 && pkI < BINS - 1) {
        const a = Math.hypot(re[pkI - 1], im[pkI - 1]), b0 = Math.hypot(re[pkI], im[pkI]), c = Math.hypot(re[pkI + 1], im[pkI + 1]);
        const den = a - 2 * b0 + c;
        const off = den ? (0.5 * (a - c)) / den : 0;
        pitch[f] = 69 + 12 * Math.log2(((pkI + off) * binHz) / 440);
      }
      prom[f] = nPL ? pk / (sumPL / nPL + 1e-9) : 0;
      lowC[f] = lcs > 0 ? lcw / lcs : 0;
      // segundo pico mais forte (longe do primeiro): acorde tem vários parecidos, lead/voz tem um que manda
      let sec = 0;
      for (let k = Math.ceil(150 / binHz); k <= Math.floor(3000 / binHz); k++) {
        if (Math.abs(k - pkI) <= 4) continue;
        const m = Math.hypot(re[k], im[k]) / N;
        if (m > sec) sec = m;
      }
      mono[f] = sec > 0 ? pk / sec : 10;
      flatMid[f] = nm && am > 0 ? Math.exp(gm / nm) / (am / nm) : 0;
      flatHigh[f] = nh && ah > 0 ? Math.exp(gh / nh) / (ah / nh) : 0;
      if (f % 300 === 0) { onProgress(0.85 * (f / F)); await pause(); }
    }

    const events = [];
    const T = (i) => i / FPS + N / 2 / SR;
    const velOf = (v, ref) => Math.max(25, Math.min(127, Math.round(40 + 87 * Math.min(1, v / (ref || 1)))));

    // ---- KICK: ataque no sub que morre rápido, forte em relação à música toda ----
    const kickODF = FL[0];
    const kP = percentile(kickODF, 0.995) || 1;
    const kickIdx = peaks(kickODF, { k: 1.6, floor: kP * 0.33, gap: 0.16 }).filter((i) => {
      let top = 0;
      for (let j = i; j < Math.min(F, i + 3); j++) top = Math.max(top, E[0][j]);
      const later = E[0][Math.min(F - 1, i + 12)];
      if (later > top * 0.75) return false; // não decai: baixo sustentado
      // o tom do kick despenca logo depois do ataque; o do baixo fica parado.
      // pula os 2 primeiros quadros (o estalo de qualquer ataque espalha o espectro)
      const c0 = lowC[Math.min(F - 1, i + 2)], c1 = lowC[Math.min(F - 1, i + 8)];
      return c0 > 0 && c1 > 0 && c0 / c1 > 1.2;
    });
    kickIdx.forEach((i) => events.push({ t: T(i), v: "kick", vel: velOf(kickODF[i], kP), note: 36 }));
    const kickSet = new Set();
    kickIdx.forEach((i) => { for (let d = -2; d <= 2; d++) kickSet.add(i + d); });

    // ---- SNARE/CLAP: ataque ruidoso no médio + presença ----
    const snODF = new Float32Array(F);
    for (let i = 0; i < F; i++) snODF[i] = FL[3][i] + FL[4][i];
    const sP = percentile(snODF, 0.995) || 1;
    const p3 = percentile(FL[3], 0.995) || 1;
    // clap/caixa têm corpo em 1–3 kHz; o hi-hat mora acima de 6 kHz
    const snIdx = peaks(snODF, { k: 1.5, floor: sP * 0.38, gap: 0.12 })
      .filter((i) => (flatMid[i] > 0.12 || flatMid[i + 1] > 0.12) && FL[3][i] > p3 * 0.3 && FL[3][i] > FL[5][i] * 0.5);
    snIdx.forEach((i) => events.push({ t: T(i), v: "snare", vel: velOf(snODF[i], sP), note: 50 }));
    const snSet = new Set();
    snIdx.forEach((i) => { for (let d = -2; d <= 2; d++) snSet.add(i + d); });

    // ---- HI-HAT: ataque curto no agudo, ruidoso ----
    const hP = percentile(FL[5], 0.995) || 1;
    peaks(FL[5], { k: 1.2, floor: hP * 0.25, gap: 0.05 })
      .filter((i) => !snSet.has(i) && flatHigh[i] > 0.1)
      .forEach((i) => events.push({ t: T(i), v: "hat", vel: velOf(FL[5][i], hP), note: 90 }));
    onProgress(0.9); await pause();

    // ---- CHORDS: mudança de harmonia com 3+ notas presentes ----
    const S = 20, LAG = 40; // ~230 ms de média; compara com ~460 ms antes
    const cs = new Float32Array(F * 12), H = new Float32Array(F);
    for (let i = 0; i < F; i++) {
      for (let p = 0; p < 12; p++) {
        let s = 0;
        for (let j = Math.max(0, i - S); j <= i; j++) s += chroma[j * 12 + p];
        cs[i * 12 + p] = s;
        H[i] += s;
      }
    }
    const hP90 = percentile(H, 0.9) || 1;
    let lastChord = -1e9;
    for (let i = LAG; i < F; i++) {
      if (H[i] < hP90 * 0.25) continue;
      let dot = 0, na = 0, nb = 0, mx = 0, root = 0;
      for (let p = 0; p < 12; p++) {
        const a = cs[i * 12 + p], b = cs[(i - LAG) * 12 + p];
        dot += a * b; na += a * a; nb += b * b;
        if (a > mx) { mx = a; root = p; }
      }
      let notes = 0;
      for (let p = 0; p < 12; p++) if (cs[i * 12 + p] > mx * 0.45) notes++;
      const dist = 1 - dot / (Math.sqrt(na * nb) + 1e-12);
      const since = (i - lastChord) / FPS;
      if (notes >= 3 && notes <= 7 && ((dist > 0.25 && since > 0.6) || since > 2.2)) {
        events.push({ t: T(i), v: "chord", vel: dist > 0.25 ? velOf(H[i], hP90) : 55, note: 48 + root });
        lastChord = i;
      }
    }

    // ---- LEAD e VOCAL: notas de um tom que se destaca; voz oscila, lead é estável ----
    const midE = new Float32Array(F);
    for (let i = 0; i < F; i++) midE[i] = E[2][i] + E[3][i];
    const mP = percentile(midE, 0.9) || 1;
    let seg = null;
    const closeSeg = (end) => {
      if (!seg || end - seg.start < 5) { seg = null; return; }
      const ps = Array.from(pitch.subarray(seg.start, end)).sort((a, b) => a - b);
      const med = ps[ps.length >> 1];
      let dev = 0;
      for (let j = seg.start; j < end; j++) dev += Math.abs(pitch[j] - med);
      dev /= end - seg.start;
      const isVoice = dev > 0.15 && med < 82; // voz oscila (vibrato, deslizes); synth fica cravado
      const v = isVoice ? "vocal" : "lead";
      events.push({ t: T(seg.start), v, vel: velOf(seg.energy / (end - seg.start), mP), note: Math.round(med) });
      // frases longas de voz soltam mais "respiros"
      if (isVoice) for (let j = seg.start + 45; j < end; j += 45) events.push({ t: T(j), v, vel: 50, note: Math.round(pitch[j]) });
      seg = null;
    };
    for (let i = 1; i < F; i++) {
      if (kickSet.has(i)) continue; // o kick borra o espectro: pula sem cortar a nota
      const active = prom[i] > 7 && mono[i] > 1.4 && midE[i] > mP * 0.15;
      if (!active) { closeSeg(i); continue; }
      if (!seg) seg = { start: i, energy: 0 };
      else if (Math.abs(pitch[i] - pitch[i - 1]) > 0.8) { closeSeg(i); seg = { start: i, energy: 0 }; }
      seg.energy += midE[i];
    }
    closeSeg(F);
    onProgress(0.95); await pause();

    // ---- EFEITOS: subidas de ruído (riser), descidas e impactos ----
    const hi = new Float32Array(F);
    const SM = Math.round(0.25 * FPS);
    for (let i = 0; i < F; i++) {
      let s = 0;
      for (let j = Math.max(0, i - SM); j <= i; j++) s += E[4][j] + E[5][j];
      hi[i] = s;
    }
    const R = Math.round(1.5 * FPS), Q = R >> 2;
    const hiP = percentile(hi, 0.9) || 1;
    let lastFx = -1e9, riseEnd = -1e9;
    const fl = new Float32Array(F); // planicidade (ruído) suavizada
    for (let i = 0; i < F; i++) { let a = 0; for (let j = Math.max(0, i - SM); j <= i; j++) a += flatHigh[j]; fl[i] = a / (i - Math.max(0, i - SM) + 1); }
    for (let i = R; i < F; i++) {
      // sobe de forma contínua (cada quarto da janela maior que o anterior), forte e ruidoso
      const r0 = hi[i - R], r1 = hi[i - 3 * Q], r2 = hi[i - 2 * Q], r3 = hi[i - Q], r4 = hi[i];
      const rising = r1 > r0 * 1.12 && r2 > r1 * 1.12 && r3 > r2 * 1.12 && r4 > r3 * 1.12 && r4 > hiP * 0.5;
      const falling = r1 < r0 * 0.88 && r2 < r1 * 0.88 && r3 < r2 * 0.88 && r4 < r3 * 0.88 && r0 > hiP * 0.5;
      if ((rising || falling) && fl[i] > 0.2 && i - lastFx > 0.25 * FPS) {
        events.push({ t: T(i), v: "fx", vel: rising ? Math.min(127, 60 + Math.round((r4 / (r0 + 1e-12)) * 8)) : 60, note: 84, kind: rising ? "sobe" : "desce" });
        lastFx = i;
        if (rising) riseEnd = i;
      }
      // impacto: logo depois de uma subida, o maior ataque geral
    }
    const all = new Float32Array(F);
    for (let i = 0; i < F; i++) for (let b = 0; b < 6; b++) all[i] += FL[b][i];
    const aP = percentile(all, 0.99) || 1;
    const rises = events.filter((e) => e.v === "fx" && e.kind === "sobe").map((e) => e.t);
    peaks(all, { k: 1.8, floor: aP * 0.6, gap: 1.5 })
      .filter((i) => rises.some((t) => T(i) - t > 0 && T(i) - t < 1.2))
      .forEach((i) => events.push({ t: T(i), v: "fx", vel: 127, note: 60, kind: "impacto" }));

    events.sort((a, b) => a.t - b.t);
    onProgress(1);
    const count = {};
    events.forEach((e) => (count[e.v] = (count[e.v] || 0) + 1));
    return { events, count, duration: x.length / SR };
  }

  window.CyclesAnalise = { analyse };
})();
