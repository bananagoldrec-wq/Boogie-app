/* PROJETO 2 — Escada sem fim · PROJETO 3 — Bauhaus Orbital.
   Usam os MESMOS sons da Sessão 1 (MIDI, Áudio, Música ou Demo): o motor da Sessão 1
   reconhece kick, baixo, hi-hat, caixa e chord e avisa aqui pelo evento "cycles:hit".
   A Sessão 1 continua exatamente como era; estas abas só trocam o desenho. */
import { createEndlessClimb } from './endless-climb.js';
import { createBauhausOrbital } from './bauhaus-orbital-024.js';

const visual = createEndlessClimb(
  document.getElementById('canvas')
);

// PROJETO 3: kick pulsa o sol e gira a lua · baixo põe planetas · hi-hat acende triângulos ·
// caixa pula o arco amarelo (o chord não entra nesta cena)
const orbital = createBauhausOrbital(
  document.getElementById('canvas3')
);
const scene = () => (proj === 3 ? orbital : visual);

// KICK: a pessoa anda (um passo por kick)      → visual.hit('kick', força)
// BASS: a escada sobe (um degrau por nota)      → visual.hit('bass', força)
// HI-HAT: chuva (só isso)                       → visual.hit('hat', força)
// SNARE: a pessoa cresce                        → visual.hit('snare', força)
// CHORD: muda a cor do fundo                    → visual.hit('chord', força)
// Reiniciar                                     → visual.reset()

let proj = 1;
const lights = {};
document.querySelectorAll('#p2-lights span').forEach((el) => { lights[el.dataset.k] = el; });
const src = document.getElementById('p2-src');
window.addEventListener('cycles:hit', (e) => {
  if (proj === 1) return;
  const V = scene();
  if (e.detail.bpm) V.setBpm(e.detail.bpm); // movimento no andamento do Cycles
  V.hit(e.detail.type, e.detail.amount);
  // luzes: o que chegou e de onde (MIDI = exato; ÁUDIO = análise do som)
  const L = lights[e.detail.type];
  if (L) { L.classList.add('on'); clearTimeout(L._t); L._t = setTimeout(() => L.classList.remove('on'), 90); }
  src.textContent = e.detail.source === 'audio' ? (e.detail.grid ? 'áudio + clock' : 'pelo áudio') : e.detail.source === 'musica' ? 'pela música' : e.detail.source === 'pad' ? 'teclas' : 'pelo MIDI';
});

// ---------- luzes: de onde vem cada papel ----------
// "T3 MIDI" = a trilha 3 está mandando notas: a chuva segue o MIDI dela (exato).
// "T3 · áudio" = essa trilha não manda notas: o papel vem do ouvido próprio do Projeto 2.
// Clique na luz pra trocar a trilha daquele papel.
const NAMES = { kick: 'Kick', bass: 'Baixo', hat: 'Hi-hat', snare: 'Caixa', chord: 'Chord' };
Object.keys(lights).forEach((k) => {
  const L = lights[k];
  L.innerHTML = `${NAMES[k] || k}<small></small>`;
  L.title = 'Clique pra trocar a trilha do Cycles que faz isso';
  L.addEventListener('click', () => {
    const api = window.CyclesP2;
    if (!api) return;
    const roles = api.chosen ? api.chosen() : api.roles();
    const taken = Object.keys(roles).filter((o) => o !== k).map((o) => roles[o]);
    const opts = [0, 1, 2, 3, 4, 5].filter((i) => !taken.includes(i)).concat(-1);
    const cur = opts.indexOf(roles[k]);
    api.setRole(k, opts[(cur + 1) % opts.length]);
    refreshLights();
  });
});
function refreshLights() {
  const api = window.CyclesP2;
  if (!api) return;
  const roles = api.roles(), live = api.live(), ouvido = api.audioOn(), auto = api.auto ? api.auto() : {};
  Object.keys(lights).forEach((k) => {
    const tr = roles[k], sm = lights[k].querySelector('small');
    const midi = tr >= 0 && live[tr];
    // "auto": o ritmo do MIDI mostrou que esse som está nessa trilha (kick nos 4 tempos, caixa no 2 e 4)
    const txt = (midi ? `T${tr + 1} MIDI` : ouvido ? (tr >= 0 ? `T${tr + 1} · áudio` : 'áudio') : tr >= 0 ? `T${tr + 1}` : '—') + (auto[k] ? ' auto' : '');
    if (sm.textContent !== txt) sm.textContent = txt;
    lights[k].classList.toggle('miss', !midi && !ouvido);
  });
}
setInterval(refreshLights, 300);
refreshLights();

// ---------- abas: Sessão 1 · Projeto 2 · Projeto 3 ----------
const canvas = document.getElementById('canvas');
const canvas3 = document.getElementById('canvas3');
const tabs = document.querySelectorAll('#seg-proj button');

function setProject(n, save = true) {
  proj = n === 2 || n === 3 ? n : 1;
  document.body.classList.toggle('proj-2', proj !== 1); // o rodapé dos projetos (luzes, reiniciar)
  document.body.classList.toggle('proj-3', proj === 3);
  canvas.hidden = proj !== 2;
  canvas3.hidden = proj !== 3;
  tabs.forEach((b) => {
    const on = +b.dataset.p === proj;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (save) try { localStorage.setItem('cv-proj', String(proj)); } catch { /* sem armazenamento: tudo bem */ }
}

tabs.forEach((b) => b.addEventListener('click', () => setProject(+b.dataset.p)));
document.getElementById('btn-reset2').addEventListener('click', () => scene().reset());

document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'p') setProject((proj % 3) + 1);       // troca de aba: 1 → 2 → 3 → 1 (funciona em tela cheia)
  else if (k === 'c' && proj !== 1) scene().reset(); // nos projetos, "limpar" = começar de novo
});

let saved = 1;
try { saved = +localStorage.getItem('cv-proj') || 1; } catch { /* idem */ }
setProject(saved, false);

window.CyclesProjeto2 = visual;  // pra testar pelo console
window.CyclesProjeto3 = orbital;
