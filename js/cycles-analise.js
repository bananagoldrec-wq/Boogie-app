/* Cycles Visual — análise de uma música inteira (arquivo) antes de tocar.

   Olhando a faixa toda de uma vez dá pra separar melhor os instrumentos do
   que ouvindo ao vivo: os limiares são relativos à própria música (uma intro
   só com baixo não dispara "kick", porque o kick de verdade, mais adiante,
   define o que é forte), e dá pra conferir o que acontece logo depois de cada
   batida (kick morre rápido; baixo sustenta).

   Saída: lista de eventos { t (s), v (voz), vel (1..127), note (midi) } com
   v ∈ kick, bass, snare, clap, hat, chord, lead, vocal, fx, accent. É uma estimativa por
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
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : isFinite(v) ? v : 0);

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
    const lowC = new Float32Array(F), lowPk = new Float32Array(F); // centro de massa e fundamental do grave // centro de massa do grave (30–300 Hz): o kick "cai" de tom, o baixo não
    const flatMid = new Float32Array(F), flatHigh = new Float32Array(F);

    for (let f = 0; f < F; f++) {
      const o = f * HOP;
      for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let pk = 0, pkI = 0, sumPL = 0, nPL = 0, lcw = 0, lcs = 0, lpk = 0, lpkI = 0;
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
        if (hz >= 30 && hz <= 250 && mag > lpk) { lpk = mag; lpkI = k; }
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
      if (lpkI > 1) {
        const a = Math.hypot(re[lpkI - 1], im[lpkI - 1]), b0 = Math.hypot(re[lpkI], im[lpkI]), c = Math.hypot(re[lpkI + 1], im[lpkI + 1]);
        const den = a - 2 * b0 + c;
        lowPk[f] = (lpkI + (den ? (0.5 * (a - c)) / den : 0)) * binHz;
      }
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
    // volume geral (pra pisos absolutos: um instrumento que não existe na música
    // não pode "aparecer" só porque o limiar relativo a ele ficou baixo)
    const Etot = new Float32Array(F);
    for (let i = 0; i < F; i++) for (let b = 0; b < 6; b++) Etot[i] += E[b][i];
    const tP = percentile(Etot, 0.9) || 1e-12;
    const loud = (arr, i, frac) => {
      let m = 0;
      for (let j = i; j <= Math.min(F - 1, i + 3); j++) m = Math.max(m, arr[j]);
      return m > tP * frac;
    };
    const E34 = new Float32Array(F);
    for (let i = 0; i < F; i++) E34[i] = E[3][i] + E[4][i];
    const velOf = (v, ref) => Math.max(25, Math.min(127, Math.round(40 + 87 * Math.min(1, v / (ref || 1)))));

    // ---- KICK × BAIXO ----
    // Os dois moram no grave. Pra cada ataque em 30–250 Hz mede o que separa um do
    // outro: força do ataque, quanto já caiu em ~120 ms, o release (quanto tempo
    // até sumir), o "click" do batedor em 1–6 kHz e a queda de tom. Depois divide
    // em dois grupos DENTRO desta música (cada faixa tem seu kick e seu baixo) e,
    // se houver uma pulsação clara, ainda considera que kick cai no tempo e o
    // baixo costuma vir no contratempo.
    const El = new Float32Array(F), lowODF = new Float32Array(F), clickODF = new Float32Array(F);
    for (let i = 0; i < F; i++) { El[i] = E[0][i] + E[1][i]; lowODF[i] = FL[0][i] + FL[1][i]; clickODF[i] = FL[3][i] + FL[4][i]; }
    const lP = percentile(lowODF, 0.995) || 1, cP = percentile(clickODF, 0.99) || 1;
    const cand = peaks(lowODF, { k: 1.3, floor: lP * 0.2, gap: 0.09 }).map((i) => {
      const at = (j) => El[Math.max(0, Math.min(F - 1, j))];
      let pre = 0;
      for (let j = i - 5; j <= i - 2; j++) pre += at(j);
      pre /= 4;
      let top = 0;
      for (let j = i; j <= i + 3; j++) top = Math.max(top, at(j));
      let rel = 0;
      while (rel < 70 && at(i + 3 + rel) > top * 0.25) rel++;
      // queda de tom pela fundamental (o pico do grave): no kick despenca; no baixo fica,
      // mesmo quando a distorção some e o "centro" do som desce
      const c0 = lowPk[Math.min(F - 1, i + 1)], c1 = lowPk[Math.min(F - 1, i + 8)];
      return {
        i,
        att: Math.log((top + 1e-12) / (pre + 1e-12)),    // ataque: salto de energia
        dec: Math.log((at(i + 10) + 1e-12) / (top + 1e-12)), // quanto caiu em ~120 ms (negativo = caiu)
        rel,                                              // release em quadros (~12 ms)
        click: clickODF[i] / cP,                          // batedor
        glide: c0 > 0 && c1 > 0 ? Math.log(c0 / c1) : 0,  // queda de tom
        harm: (() => {                                    // harmônicos em 250–1000 Hz depois do ataque: baixo tem, kick quase não
          let h = 0, l = 0;
          for (let j = i + 4; j <= i + 9; j++) { h += E[2][Math.min(F - 1, j)]; l += at(j); }
          return Math.log((h + 1e-12) / (l + 1e-12));
        })(),
        str: lowODF[i] / lP,
      };
    });
    const z = (key) => {
      const v = cand.map((c) => c[key]);
      const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length || 1)) || 1;
      return (c) => (c[key] - m) / sd;
    };
    const zAtt = z("att"), zDec = z("dec"), zRel = z("rel"), zClick = z("click"), zGlide = z("glide"), zHarm = z("harm");
    cand.forEach((c) => {
      c.score = 0.6 * zAtt(c) - 0.5 * zDec(c) - 0.5 * zRel(c) + 0.8 * zClick(c) + 1.0 * zGlide(c) - 0.8 * zHarm(c);
    });

    // pulsação: período pela autocorrelação dos ataques da música toda (70–180 BPM);
    // fase: das duas posições fortes (tempo e contratempo), a que tem ataques mais "kick"
    const grid = (() => {
      // trem de impulsos dos ataques graves, pesado pelo quanto cada um parece kick
      // (o kick marca o tempo; o baixo no contratempo confundiria o período)
      const odf = new Float32Array(F);
      cand.forEach((c) => { odf[c.i] += 1 / (1 + Math.exp(-1.5 * c.score)); });
      const sm = new Float32Array(F);
      for (let i = 2; i < F - 2; i++) sm[i] = 0.1 * odf[i - 2] + 0.2 * odf[i - 1] + 0.4 * odf[i] + 0.2 * odf[i + 1] + 0.1 * odf[i + 2];
      odf.set(sm);
      const m = odf.reduce((a, b) => a + b, 0) / (F || 1);
      for (let i = 0; i < F; i++) odf[i] -= m;
      const ac = (L) => { let s = 0; for (let i = 0; i + L < F; i++) s += odf[i] * odf[i + L]; return s; };
      const lo = Math.round(FPS * 60 / 180), hi = Math.round(FPS * 60 / 70);
      if (F < hi * 8) return null;
      let best = 0, lag = 0;
      for (let L = lo; L <= hi; L++) {
        // o período certo também se repete no dobro e no compasso (4×)
        let s = ac(L) + 0.6 * ac(2 * L) + 0.4 * ac(4 * L);
        s *= Math.exp(-0.5 * Math.pow(Math.log2((60 * FPS / L) / 120) / 1.0, 2));
        if (s > best) { best = s; lag = L; }
      }
      if (!lag || best <= 0) return null;
      // refina o período (parábola entre os vizinhos do melhor atraso)
      const y0 = ac(lag - 1), y1 = ac(lag), y2 = ac(lag + 1);
      const den = y0 - 2 * y1 + y2;
      const P = (lag + (den ? (0.5 * (y0 - y2)) / den : 0)) / FPS;
      // pente: força dos ataques graves em cada fase
      const comb = new Float32Array(lag);
      const Pf = P * FPS;
      for (let i = 0; i < F; i++) comb[Math.floor((i % Pf) / Pf * lag) % lag] += lowODF[i];
      let ph1 = 0;
      for (let k = 1; k < lag; k++) if (comb[k] > comb[ph1]) ph1 = k;
      const ph2 = (ph1 + Math.round(lag / 2)) % lag;
      // qual das duas fases é a do kick? a dos ataques com mais cara de kick
      const kickness = (ph) => {
        let s = 0, n = 0;
        cand.forEach((c) => { const d = Math.abs(((c.i - ph) % Pf + Pf) % Pf); if (Math.min(d, Pf - d) <= 2) { s += c.score; n++; } });
        return n ? s / n : -1e9;
      };
      const phI = kickness(ph1) >= kickness(ph2) ? ph1 : ph2;
      return { P, phase: phI / FPS + N / 2 / SR };
    })();
    const onBeat = (t) => (grid ? Math.cos((2 * Math.PI * (t - grid.phase)) / grid.P) : 0); // 1 no tempo, −1 no contratempo
    if (grid) cand.forEach((c) => (c.score += 1.2 * onBeat(T(c.i))));

    // dois grupos (k-médias em 1D); se não separarem, decide pelo valor absoluto
    let isKick = () => false;
    if (cand.length) {
      const sc = cand.map((c) => c.score).sort((a, b) => a - b);
      let lo = sc[Math.floor(sc.length * 0.25)], hi = sc[Math.floor(sc.length * 0.75)];
      for (let it = 0; it < 15; it++) {
        const A = [], B = [];
        sc.forEach((s) => (Math.abs(s - lo) < Math.abs(s - hi) ? A : B).push(s));
        if (A.length) lo = A.reduce((a, b) => a + b, 0) / A.length;
        if (B.length) hi = B.reduce((a, b) => a + b, 0) / B.length;
      }
      if (hi - lo > 1.2) {
        const cut = (lo + hi) / 2;
        isKick = (c) => c.score > cut;
      } else {
        const rels = cand.map((c) => c.rel).sort((a, b) => a - b), decs = cand.map((c) => c.dec).sort((a, b) => a - b);
        const allKick = rels[rels.length >> 1] < 16 && decs[decs.length >> 1] < Math.log(0.5);
        isKick = () => allKick;
      }
    }
    const kickIdx = [];
    cand.forEach((c) => {
      // além de "mais kick que o resto desta música", precisa ter cara de kick em si:
      // ataque e queda de tom (a fundamental despenca). Baixo, mesmo plucado, fica no tom.
      const kickLike = c.att > 0.7 && c.glide > 0.15;
      // queda de tom forte é assinatura de kick, mesmo fora do tempo (breaks)
      if ((isKick(c) && kickLike) || (c.att > 0.7 && c.glide > 0.35)) { kickIdx.push(c.i); events.push({ t: T(c.i), v: "kick", vel: velOf(c.str, 1), note: 36 }); }
      else if (c.str > 0.25) events.push({ t: T(c.i), v: "bass", vel: velOf(c.str, 1), note: Math.round(69 + 12 * Math.log2(Math.max(30, lowC[Math.min(F - 1, c.i + 6)]) / 440)) });
    });
    const kickSet = new Set();
    kickIdx.forEach((i) => { for (let d = -2; d <= 2; d++) kickSet.add(i + d); });

    // ---- SNARE e CLAP ----
    // 1) candidatos com limiar baixo (pra não perder acentuação), exigindo corpo
    //    em 1–3 kHz e o médio pesando perto do grave;
    // 2) havendo pulsação, as posições do groove onde esses ataques costumam cair
    //    (ex.: 2 e 4) aceitam ataques mais fracos; fora delas só entra o que é forte;
    // 3) snare × clap: o clap são 2–3 estalos colados (~10–30 ms, o "flam") e quase
    //    sem corpo grave; a caixa é um ataque só, com o corpo da pele em 110–250 Hz.
    const snODF = new Float32Array(F);
    for (let i = 0; i < F; i++) snODF[i] = FL[3][i] + 0.6 * FL[4][i];
    const sP = percentile(snODF, 0.995) || 1;
    const noisier = (i) => {
      let base = 0;
      for (let j = i - 8; j <= i - 3; j++) base += flatMid[Math.max(0, j)];
      base /= 6;
      return Math.max(flatMid[i], flatMid[Math.min(F - 1, i + 1)], flatMid[Math.min(F - 1, i + 2)]) > base * 1.1;
    };
    // fração do médio (1–6 kHz) frente ao agudo (>6 kHz) logo no ataque: hi-hat mora lá em cima
    const midShare = (i) => {
      let m = 0, h = 0;
      for (let j = i; j <= Math.min(F - 1, i + 2); j++) { m += E[3][j] + E[4][j]; h += E[5][j]; }
      return m / (m + h + 1e-12);
    };
    // cauda: clap e caixa ainda soam ~45 ms depois; hi-hat fechado já sumiu
    const tail = (i) => {
      let top = 0;
      for (let j = i; j <= Math.min(F - 1, i + 2); j++) top = Math.max(top, E34[j]);
      return Math.max(E34[Math.min(F - 1, i + 4)], E34[Math.min(F - 1, i + 5)]) / (top + 1e-12);
    };
    let snCand = peaks(snODF, { k: 1.25, floor: sP * 0.16, gap: 0.08 })
      .filter((i) => midShare(i) > 0.45 && tail(i) > 0.06)
      .filter((i) => snODF[i] > 0.25 * (FL[0][i] + FL[1][i]) || kickSet.has(i))
      .filter((i) => loud(E34, i, 0.006));
    let snIdx;
    if (grid) {
      // força dos candidatos por posição dentro do tempo (8 fatias)
      const bins = new Float32Array(8);
      const binOf = (i) => Math.floor(((((T(i) - grid.phase) / grid.P) % 1) + 1) % 1 * 8) % 8;
      snCand.forEach((i) => (bins[binOf(i)] += snODF[i]));
      const bmax = Math.max(...bins) || 1;
      const groove = (i) => bins[binOf(i)] >= bmax * 0.5;
      snIdx = snCand.filter((i) => (groove(i) && snODF[i] > sP * 0.16) || (snODF[i] > sP * 0.45 && (noisier(i) || flatMid[i] > 0.1)));
      // tempos em que o médio "estoura" mais que nos vizinhos (acentos no tempo)
      const toI = (t) => Math.round((t - N / 2 / SR) * FPS);
      const beats = [];
      for (let t = grid.phase; t < F / FPS; t += grid.P) {
        const c = toI(t);
        let m = 0, mi = c;
        for (let j = Math.max(0, c - 3); j <= Math.min(F - 1, c + 4); j++) if (snODF[j] > m) { m = snODF[j]; mi = j; }
        beats.push({ m, mi });
      }
      beats.forEach((b, k) => {
        const viz = beats.slice(Math.max(0, k - 8), k + 9).map((x) => x.m).sort((a, c) => a - c);
        const med = viz[viz.length >> 1] || 0;
        if (b.m > med * 1.35 && b.m > sP * 0.12 && FL[3][b.mi] > FL[5][b.mi] * 0.3 && !snIdx.some((i) => Math.abs(i - b.mi) < 8) &&
            (snODF[b.mi] > 0.3 * (FL[0][b.mi] + FL[1][b.mi]) || kickSet.has(b.mi)) && loud(E34, b.mi, 0.006)) snIdx.push(b.mi);
      });
      snIdx.sort((a, b) => a - b);
    } else {
      snIdx = snCand.filter((i) => snODF[i] > sP * 0.3 && (noisier(i) || flatMid[i] > 0.1));
    }

    // estalos colados (flam): envelope do agudo no tempo, em resolução de ~1 ms
    const flam = (i) => {
      const center = Math.round(T(i) * SR);
      const s0 = Math.max(1, center - Math.round(0.04 * SR)), s1 = Math.min(x.length - 1, center + Math.round(0.07 * SR));
      // energia do "estalo" (diferença entre amostras ≈ agudo) em média móvel de 2,5 ms:
      // tira o chiado do ruído e deixa só os golpes
      const Wn = Math.max(4, Math.round(0.0025 * SR));
      const d2 = new Float32Array(s1 - s0);
      for (let n = s0; n < s1; n++) { const d = x[n] - x[n - 1]; d2[n - s0] = d * d; }
      const env = new Float32Array(d2.length);
      let acc = 0;
      for (let n = 0; n < d2.length; n++) { acc += d2[n]; if (n >= Wn) acc -= d2[n - Wn]; env[n] = Math.sqrt(acc / Wn); }
      // suaviza de leve e acha os picos fortes com um vale entre eles
      let mx = 0;
      for (let n = 0; n < env.length; n++) mx = Math.max(mx, env[n]);
      if (mx <= 0) return 1;
      const minGap = Math.round(0.005 * SR), span = Math.round(0.045 * SR);
      const pk = [];
      for (let n = 2; n < env.length - 2; n++) {
        if (env[n] >= mx * 0.35 && env[n] >= env[n - 1] && env[n] > env[n + 1] && env[n] >= env[n - 2] && env[n] > env[n + 2]) {
          if (pk.length && n - pk[pk.length - 1] < minGap) { if (env[n] > env[pk[pk.length - 1]]) pk[pk.length - 1] = n; continue; }
          pk.push(n);
        }
      }
      if (!pk.length) return 1;
      let count = 1;
      for (let k = 1; k < pk.length; k++) {
        if (pk[k] - pk[0] > span) break;
        let valley = Infinity;
        for (let n = pk[k - 1]; n <= pk[k]; n++) valley = Math.min(valley, env[n]);
        if (valley < Math.min(env[pk[k - 1]], env[pk[k]]) * 0.7) count++;
      }
      return count;
    };
    // corpo da pele (110–1000 Hz logo depois do ataque). Se cai junto com um kick,
    // compara com o que um kick SOZINHO tem nessa faixa (mediana dos kicks sem caixa)
    const bodyE = (i) => { let e = 0; for (let j = i + 1; j <= Math.min(F - 1, i + 4); j++) e += E[1][j] + E[2][j]; return e; };
    const snNear = new Set(); snIdx.forEach((i) => { for (let d = -3; d <= 3; d++) snNear.add(i + d); });
    const kickAlone = kickIdx.filter((i) => !snNear.has(i)).map(bodyE).sort((a, b) => a - b);
    const kickBody = kickAlone.length ? kickAlone[kickAlone.length >> 1] : 0;
    const epsB = tP * 0.004; // piso: silêncio antes não pode inflar a conta
    const body = (i) => {
      if (kickSet.has(i)) return Math.log((bodyE(i) + epsB) / (kickBody + epsB)); // excesso sobre o kick
      let pre = 0;
      for (let j = i - 6; j <= i - 3; j++) pre += E[1][Math.max(0, j)] + E[2][Math.max(0, j)];
      return Math.log((bodyE(i) / 4 + epsB) / (pre / 4 + epsB));
    };
    const bright = (i) => 1 - midShare(i); // esteira da caixa chega a 8–10 kHz; o clap para em ~5 kHz
    const sc = snIdx.map((i) => ({ i, f: flam(i), b: body(i), br: bright(i) }));
    // regras absolutas (as faixas costumam ter só um dos dois, então não dá pra
    // depender de comparar um com o outro):
    //   clap  = escuro (quase nada acima de 6 kHz) — ou estalos colados e não muito brilhante
    //   caixa = tem corpo (grave logo depois do ataque)
    //   o resto (brilhante e sem corpo) é hi-hat/percussão: fica de fora
    sc.forEach((c) => {
      // corpo: sozinha, a caixa sobe muito o grave (> ~7×); em cima de um kick, soma ~20%+ ao kick
      const hasBody = kickSet.has(c.i) ? c.b > 0.18 : c.b > 2.0;
      c.kind = c.br < 0.25 || (c.f >= 2 && c.br < 0.3 && !hasBody) ? "clap" : hasBody ? "snare" : null;
    });
    const isClap = (c) => c.kind === "clap";
    const kept = sc.filter((c) => c.kind);
    kept.forEach((c) => events.push({ t: T(c.i), v: isClap(c) ? "clap" : "snare", vel: velOf(snODF[c.i], sP * 0.6), note: 50 }));
    const snSet = new Set();
    kept.forEach((c) => { for (let d = -2; d <= 2; d++) snSet.add(c.i + d); });

    // ---- HI-HAT: ataque curto no agudo, ruidoso ----
    const hP = percentile(FL[5], 0.995) || 1;
    peaks(FL[5], { k: 1.2, floor: hP * 0.25, gap: 0.05 })
      .filter((i) => !snSet.has(i) && flatHigh[i] > 0.1 && loud(E[5], i, 0.002))
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
      if (H[i] < hP90 * 0.25 || H[i] < tP * 0.05 * (S + 1)) continue;
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
      const active = prom[i] > 7 && mono[i] > 1.4 && midE[i] > mP * 0.15 && midE[i] > tP * 0.02;
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
      if ((rising || falling) && fl[i] > 0.2 && Math.max(r0, r4) > tP * 0.005 * (SM + 1) && i - lastFx > 0.25 * FPS) {
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

    // ---- ACENTOS: ataques gerais que se destacam do entorno (o que "pesa" na música) ----
    // não importa o instrumento: o que sobressai em relação aos ~2 s ao redor
    // compara cada batida com as batidas em volta (±2 s): acento é o que sai bem acima delas
    const pk = peaks(all, { k: 1.3, win: 0.5, floor: aP * 0.3, gap: 0.1 });
    const W2 = Math.round(2 * FPS);
    pk.forEach((i, n) => {
      const viz = [];
      for (let m = n - 1; m >= 0 && i - pk[m] <= W2; m--) viz.push(all[pk[m]]);
      for (let m = n + 1; m < pk.length && pk[m] - i <= W2; m++) viz.push(all[pk[m]]);
      if (viz.length < 3) return;
      viz.sort((a, b) => a - b);
      // compara com as batidas MAIS FORTES em volta (90%), não com a média (que inclui os hi-hats)
      const med = viz[Math.min(viz.length - 1, Math.floor(viz.length * 0.9))];
      if (all[i] > med * 1.3 && all[i] > aP * 0.7) events.push({ t: T(i), v: "accent", vel: velOf(all[i] / med, 2.5), note: 60 });
    });

    events.sort((a, b) => a.t - b.t);
    onProgress(1);
    const count = {};
    events.forEach((e) => (count[e.v] = (count[e.v] || 0) + 1));
    return { events, count, duration: x.length / SR, bpm: grid ? 60 / grid.P : 0 };
  }

  window.CyclesAnalise = { analyse };
})();
