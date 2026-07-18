'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const SK = 'rotina-v2';

const DAYS     = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const START_H  = 5;
const END_H    = 23;

const CATS = [
  { id:'exercise', label:'Exercício',   color:'#A8C4A2' },
  { id:'food',     label:'Alimentação', color:'#F2C89B' },
  { id:'work',     label:'Trabalho',    color:'#A8B8D4' },
  { id:'study',    label:'Estudo',      color:'#C4A8D4' },
  { id:'sleep',    label:'Sono',        color:'#A8B8C4' },
  { id:'family',   label:'Família',     color:'#F2A8B8' },
  { id:'goal',     label:'Meta',        color:'#A8D4C4' },
  { id:'other',    label:'Outro',       color:'#D4C4A8' },
];

const LEVEL_NAMES = [
  '', 'Iniciante','Em Movimento','Guerreiro','Atleta','Campeão',
  'Mestre','Lenda','Imortal',
];

const ACHIEVEMENTS = [
  { id:'first',      icon:'1°',   name:'Primeiro Passo',    desc:'Conclua sua primeira atividade',             xp:50  },
  { id:'day_done',   icon:'dia',  name:'Dia Vencedor',      desc:'Conclua todas as atividades do dia',         xp:100 },
  { id:'streak3',    icon:'×3',   name:'Em Chamas',         desc:'Mantenha streak de 3 dias',                  xp:150 },
  { id:'streak7',    icon:'×7',   name:'Semana de Fogo',    desc:'Mantenha streak de 7 dias',                  xp:300 },
  { id:'streak30',   icon:'×30',  name:'Mês Perfeito',      desc:'Mantenha streak de 30 dias',                 xp:1000},
  { id:'acts50',     icon:'50',   name:'Meio Século',       desc:'Conclua 50 atividades no total',             xp:500 },
  { id:'smoke6h',    icon:'6h',   name:'6h no Controle',    desc:'6 horas sem cigarro',                        xp:30  },
  { id:'smoke12h',   icon:'12h',  name:'Meio Dia Limpo',    desc:'12 horas sem cigarro',                       xp:50  },
  { id:'smoke1d',    icon:'1d',   name:'24h Limpo',         desc:'1 dia sem cigarro',                          xp:100 },
  { id:'smoke3d',    icon:'3d',   name:'72h de Garra',      desc:'3 dias sem cigarro',                         xp:150 },
  { id:'smoke5d',    icon:'5d',   name:'5 Dias de Força',   desc:'5 dias sem cigarro',                         xp:200 },
  { id:'smoke1w',    icon:'7d',   name:'Semana Livre',      desc:'7 dias sem cigarro',                         xp:300 },
  { id:'smoke1m',    icon:'30d',  name:'Pulmões Renovados', desc:'30 dias sem cigarro',                        xp:700 },
  { id:'smoke3m',    icon:'90d',  name:'3 Meses de Vitória',desc:'90 dias sem cigarro',                        xp:1500},
  { id:'smoke1y',    icon:'1a',   name:'1 Ano de Liberdade',desc:'365 dias sem cigarro',                       xp:5000},
  { id:'lv5',        icon:'Nv 5', name:'Nível 5',           desc:'Alcance o nível 5',                          xp:200 },
  { id:'lv10',       icon:'Nv10', name:'Nível 10',          desc:'Alcance o nível 10',                         xp:500 },
  { id:'lv20',       icon:'Nv20', name:'Nível 20',          desc:'Alcance o nível 20',                         xp:1000},
];

const SMOKE_MILESTONES = [
  { mins:20,      marker:'20m',  label:'20 minutos', type:'info',    text:'Pressão arterial e pulso normalizam — vasos começam a relaxar'                           },
  { mins:60,      marker:'1h',   label:'1 hora',     type:'warning', text:'A fissura vai crescer nas próximas horas. Cada desejo dura só 3–5 min — respire fundo.' },
  { mins:120,     marker:'2h',   label:'2 horas',    type:'info',    text:'Circulação periférica melhora: mãos e pés ficam mais quentes'                            },
  { mins:240,     marker:'4h',   label:'4 horas',    type:'warning', text:'Pico de irritabilidade e ansiedade. Seu cérebro pede nicotina — mas você é mais forte.'  },
  { mins:480,     marker:'8h',   label:'8 horas',    type:'warning', text:'A abstinência física está no auge agora. Água, movimento, distração — é isso que funciona.'},
  { mins:720,     marker:'12h',  label:'12 horas',   type:'boost',   text:'Meio dia! O pico de abstinência começa a ceder. CO praticamente eliminado do sangue.'    },
  { mins:1440,    marker:'24h',  label:'24 horas',   type:'boost',   text:'1 dia! Nicotina zerada no sangue. Risco de infarto já começou a cair — você fez isso.'   },
  { mins:2160,    marker:'36h',  label:'36 horas',   type:'warning', text:'Entre 36h e 72h vem o auge da abstinência psicológica. Seja forte — o pico está próximo do fim.'},
  { mins:2880,    marker:'48h',  label:'48 horas',   type:'info',    text:'Paladar e olfato retornam. As fissuras já são mais curtas e chegam com menos frequência.' },
  { mins:4320,    marker:'72h',  label:'72 horas',   type:'boost',   text:'3 dias! Pico físico superado. A partir daqui cada dia fica mais fácil — o corpo agradece.'},
  { mins:7200,    marker:'5d',   label:'5 dias',     type:'warning', text:'Dias 3–7 são os mais duros psicologicamente. Quando a fissura chegar, espere 5 minutos.' },
  { mins:10080,   marker:'7d',   label:'1 semana',   type:'boost',   text:'1 semana! A abstinência começa a diminuir agora. A cada semana que passa fica mais leve.' },
  { mins:14400,   marker:'10d',  label:'10 dias',    type:'info',    text:'Pele produz mais colágeno — rugas finas começam a suavizar'                              },
  { mins:20160,   marker:'2sem', label:'2 semanas',  type:'boost',   text:'2 semanas! Circulação 20–30% melhor. As fissuras agora são mais psicológicas que físicas.'},
  { mins:30240,   marker:'3sem', label:'3 semanas',  type:'warning', text:'Semanas 2–4: fissuras situacionais (café, estresse). Identifique seus gatilhos e desvie.' },
  { mins:43200,   marker:'1m',   label:'1 mês',      type:'boost',   text:'1 mês! Tosse reduz, pulmões regeneram. Dependência física praticamente zerada.'          },
  { mins:64800,   marker:'45d',  label:'45 dias',    type:'info',    text:'Cabelo e unhas mais fortes; pele com tom mais uniforme'                                  },
  { mins:90720,   marker:'2m',   label:'2 meses',    type:'boost',   text:'2 meses! Cílios pulmonares recuperados. As fissuras agora são raras e breves.'           },
  { mins:129600,  marker:'3m',   label:'3 meses',    type:'boost',   text:'3 meses! Função pulmonar +30%. A maioria não sente mais abstinência nesta fase.'         },
  { mins:259200,  marker:'6m',   label:'6 meses',    type:'info',    text:'Crises de tosse quase desaparecem; sinusite melhora'                                    },
  { mins:388800,  marker:'9m',   label:'9 meses',    type:'boost',   text:'9 meses! Pulmões em eficiência total. Energia muito maior — você venceu o hábito.'        },
  { mins:525600,  marker:'1a',   label:'1 ano',      type:'boost',   text:'1 ano! Risco cardíaco caiu pela metade. Você mudou sua história.'                       },
  { mins:1051200, marker:'2a',   label:'2 anos',     type:'info',    text:'Risco de infarto próximo ao de quem nunca fumou'                                        },
  { mins:2628000, marker:'5a',   label:'5 anos',     type:'boost',   text:'5 anos! Risco de AVC igual ao de não fumante. Pele visivelmente rejuvenescida.'          },
  { mins:5256000, marker:'10a',  label:'10 anos',    type:'info',    text:'Risco de câncer de pulmão cai 50%; câncer de boca e laringe também'                     },
  { mins:7884000, marker:'15a',  label:'15 anos',    type:'boost',   text:'15 anos! Risco cardíaco igual ao de quem nunca fumou — vitória total.'                  },
];

const TAPER_PHASES = [
  { limit:2, altDay:false, days:14, label:'2 por dia',       range:'Sem 1–2' },
  { limit:1, altDay:false, days:14, label:'1 por dia',       range:'Sem 3–4' },
  { limit:1, altDay:true,  days:14, label:'1 a cada 2 dias', range:'Sem 5–6' },
  { limit:0, altDay:false, days:0,  label:'Livre!',          range:'Depois'  },
];

// ── State ────────────────────────────────────────────────────────────────────

let S = loadState();
let weekStart = getMonday(new Date());
let editCell  = null;
let selCat    = null;

function loadState() {
  try {
    const raw = localStorage.getItem(SK);
    return raw ? JSON.parse(raw) : defaultState();
  } catch { return defaultState(); }
}

function defaultState() {
  return {
    activities: {},
    smoking: null,
    xp: 0,
    streak: 0,
    lastActiveDate: null,
    achievements: {},
    totalDone: 0,
  };
}

function save() {
  localStorage.setItem(SK, JSON.stringify(S));
}

// ── Taper helpers ─────────────────────────────────────────────────────────────

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getTaperPhase() {
  const start = new Date(S.smoking.taperStart);
  start.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const daysSince = Math.floor((today - start) / 86400000);
  let offset = 0;
  for (let i = 0; i < TAPER_PHASES.length - 1; i++) {
    if (daysSince < offset + TAPER_PHASES[i].days) {
      return { ...TAPER_PHASES[i], phaseIdx: i, dayInPhase: daysSince - offset, totalDay: daysSince };
    }
    offset += TAPER_PHASES[i].days;
  }
  const last = TAPER_PHASES.length - 1;
  return { ...TAPER_PHASES[last], phaseIdx: last, dayInPhase: 0, totalDay: daysSince };
}

function getTodayLimit() {
  const info = getTaperPhase();
  if (info.phaseIdx >= TAPER_PHASES.length - 1) return 0;
  if (info.altDay) return info.totalDay % 2 === 0 ? 1 : 0;
  return info.limit;
}

function getTodayCount() {
  return (S.smoking.taperLog || {})[todayKey()] || 0;
}

function logCigarette() {
  const key = todayKey();
  if (!S.smoking.taperLog) S.smoking.taperLog = {};
  S.smoking.taperLog[key] = (S.smoking.taperLog[key] || 0) + 1;
  save();
  renderSmokingDetail();
  refreshSmokingStrip();
}

function countSmokeFree() {
  if (!S.smoking?.taperStart) return 0;
  const start = new Date(S.smoking.taperStart);
  start.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const log = S.smoking.taperLog || {};
  let count = 0;
  for (let d = new Date(start); d < today; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!log[k]) count++;
  }
  return count;
}

function fmtBRL(n) {
  return `R$ ${n.toLocaleString('pt-BR')}`;
}

function removeCigarette() {
  const key = todayKey();
  if (!S.smoking.taperLog) return;
  const cur = S.smoking.taperLog[key] || 0;
  if (cur <= 0) return;
  S.smoking.taperLog[key] = cur - 1;
  if (S.smoking.taperLog[key] === 0) delete S.smoking.taperLog[key];
  save();
  renderSmokingDetail();
  refreshSmokingStrip();
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMonday(d) {
  const r = new Date(d);
  r.setHours(0,0,0,0);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  return r;
}

function wk()  { return weekStart.toISOString().slice(0,10); }
function aKey(di,h) { return `${wk()}-${DAY_KEYS[di]}-${h}`; }

// ── Activity CRUD ─────────────────────────────────────────────────────────────

function getAct(di,h) { return S.activities[aKey(di,h)] || null; }

function setAct(di,h,act) {
  const k = aKey(di,h);
  if (!act) { delete S.activities[k]; }
  else       { S.activities[k] = act; }
  save();
}

// ── XP & Level engine ─────────────────────────────────────────────────────────

function xpForLevel(lv) { return 150 + lv * 100; }

function calcLevel(totalXP) {
  let xp = totalXP, lv = 1, need = xpForLevel(1);
  while (xp >= need) { xp -= need; lv++; need = xpForLevel(lv); }
  return { lv, cur: xp, need };
}

function addXP(amount, originEl) {
  const before = calcLevel(S.xp).lv;
  S.xp = Math.max(0, S.xp + amount);
  save();
  const after = calcLevel(S.xp).lv;
  refreshXPBar();

  if (amount > 0 && originEl) floatXP(`+${amount} XP`, originEl);

  if (after > before) {
    for (let lv = before + 1; lv <= after; lv++) showLevelUp(lv);
    checkAchievement('lv5',  after >= 5);
    checkAchievement('lv10', after >= 10);
    checkAchievement('lv20', after >= 20);
  }
}

function refreshXPBar() {
  const { lv, cur, need } = calcLevel(S.xp);
  const title = LEVEL_NAMES[Math.min(lv, LEVEL_NAMES.length - 1)] || 'Lenda';
  q('#level-badge').textContent  = `Nv ${lv}`;
  q('#level-title').textContent  = title;
  q('#xp-label').textContent     = `${cur} / ${need} XP`;
  q('#xp-bar').style.width       = `${(cur / need) * 100}%`;
}

// ── Streak ────────────────────────────────────────────────────────────────────

function touchStreak() {
  const today = new Date().toDateString();
  if (S.lastActiveDate === today) return;

  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (S.lastActiveDate === yesterday) {
    S.streak++;
  } else if (S.lastActiveDate !== today) {
    S.streak = 1;
  }

  S.lastActiveDate = today;
  save();
  refreshStreak();
  checkAchievement('streak3',  S.streak >= 3);
  checkAchievement('streak7',  S.streak >= 7);
  checkAchievement('streak30', S.streak >= 30);
}

function refreshStreak() {
  q('#streak-num').textContent = S.streak;
}

// ── Achievements ──────────────────────────────────────────────────────────────

function checkAchievement(id, condition) {
  if (!condition || S.achievements[id]) return;
  S.achievements[id] = { date: new Date().toISOString() };
  save();

  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return;

  addXP(def.xp, null);
  showAchToast(def);
  if (['streak7','smoke1m','smoke1y','day_done'].includes(id)) launchConfetti();
}

function showAchToast(def) {
  q('#ach-toast-icon').textContent = def.icon;
  q('#ach-toast-name').textContent = def.name;
  q('#ach-toast-xp').textContent   = `+${def.xp} XP`;
  const t = q('#ach-toast');
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 3000);
}

// ── Mark done / undo ──────────────────────────────────────────────────────────

function toggleDone(di, h, originEl) {
  const act = getAct(di, h);
  if (!act) return;

  act.done = !act.done;
  setAct(di, h, act);

  if (act.done) {
    S.totalDone = (S.totalDone || 0) + 1;
    save();
    addXP(15, originEl);
    touchStreak();
    checkAchievement('first', true);
    checkAchievement('acts50', S.totalDone >= 50);

    // check if all today's activities are done
    const allDone = checkAllTodayDone();
    if (allDone) {
      addXP(75, originEl);
      checkAchievement('day_done', true);
    }
  } else {
    S.totalDone = Math.max(0, (S.totalDone || 1) - 1);
    save();
    addXP(-10, null);
  }

  buildGrid();
  updateTodayProgress();
}

function checkAllTodayDone() {
  const now         = new Date();
  const todayMonday = getMonday(now);
  if (weekStart.getTime() !== todayMonday.getTime()) return false;
  const di = now.getDay() === 0 ? 6 : now.getDay() - 1;

  for (let h = START_H; h <= END_H; h++) {
    const act = getAct(di, h);
    if (act && !act.done) return false;
  }
  return true;
}

// ── Today progress bar ────────────────────────────────────────────────────────

function updateTodayProgress() {
  const now         = new Date();
  const todayMonday = getMonday(now);
  if (weekStart.getTime() !== todayMonday.getTime()) {
    q('#today-fill').style.width  = '0%';
    q('#today-count').textContent = '—';
    return;
  }

  const di    = now.getDay() === 0 ? 6 : now.getDay() - 1;
  let total   = 0, done = 0;
  for (let h = START_H; h <= END_H; h++) {
    const act = getAct(di, h);
    if (act) { total++; if (act.done) done++; }
  }

  const pct = total ? (done / total) * 100 : 0;
  q('#today-fill').style.width  = `${pct}%`;
  q('#today-count').textContent = total ? `${done} de ${total} feitas` : 'Nenhuma planejada';
}

// ── Grid ──────────────────────────────────────────────────────────────────────

function buildGrid() {
  const grid = q('#week-grid');
  grid.innerHTML = '';

  const now         = new Date();
  const todayMonday = getMonday(now);
  const isThisWeek  = weekStart.getTime() === todayMonday.getTime();
  const todayDI     = now.getDay() === 0 ? 6 : now.getDay() - 1;

  // Corner
  grid.appendChild(mk('div', 'g-corner'));

  // Day headers
  DAYS.forEach((name, i) => {
    const date    = new Date(weekStart);
    date.setDate(date.getDate() + i);
    const isToday = isThisWeek && i === todayDI;

    const hdr   = mk('div', `g-day${isToday ? ' is-today' : ''}`);
    const dname = mk('span', 'dh-name'); dname.textContent = name;
    const ddate = mk('span', 'dh-date'); ddate.textContent = date.getDate();
    hdr.appendChild(dname);
    hdr.appendChild(ddate);
    grid.appendChild(hdr);
  });

  // Hour rows
  for (let h = START_H; h <= END_H; h++) {
    const lbl = mk('div', 'g-time');
    lbl.textContent = `${String(h).padStart(2,'0')}h`;
    grid.appendChild(lbl);

    DAYS.forEach((_, di) => {
      const isToday = isThisWeek && di === todayDI;
      const cell    = mk('div', `g-cell${isToday ? ' is-today-col' : ''}`);
      cell.dataset.di   = di;
      cell.dataset.hour = h;

      const act = getAct(di, h);
      if (act) {
        renderChip(cell, act);
        cell.addEventListener('click', e => {
          if (e.target.classList.contains('chip-edit')) return;
          toggleDone(di, h, cell);
        });
      } else {
        cell.addEventListener('click', () => openActModal(di, h));
      }
      grid.appendChild(cell);
    });
  }

  if (isThisWeek) placeTimeLine(todayDI, now);
  updateTodayProgress();
}

function renderChip(cell, act) {
  const cat   = CATS.find(c => c.id === act.category);
  const color = cat ? cat.color : '#8E8E93';

  const chip  = mk('div', `chip${act.done ? ' is-done' : ''}`);
  chip.style.background  = hexA(color, 0.14);
  chip.style.borderLeft  = `3px solid ${color}`;

  const chk  = mk('span', 'chip-check'); chk.textContent = '✓';
  const txt  = mk('span', 'chip-text');  txt.textContent = act.text;
  const edit = mk('button', 'chip-edit');
  edit.type = 'button';
  edit.textContent = '✎';
  edit.setAttribute('aria-label', 'Editar');
  edit.addEventListener('click', e => { e.stopPropagation(); openActModal(Number(cell.dataset.di), Number(cell.dataset.hour), true); });

  chip.appendChild(chk);
  chip.appendChild(txt);
  chip.appendChild(edit);
  cell.appendChild(chip);
}

function placeTimeLine(di, now) {
  const h   = now.getHours();
  if (h < START_H || h > END_H) return;
  const cell = q(`.g-cell[data-di="${di}"][data-hour="${h}"]`);
  if (!cell) return;
  const line = mk('div', 'time-line');
  line.style.top = `${(now.getMinutes() / 60) * 100}%`;
  cell.appendChild(line);
}

// ── Activity modal ────────────────────────────────────────────────────────────

function openActModal(di, h, editMode = false) {
  editCell = { di, h };
  const act = getAct(di, h);

  const date = new Date(weekStart);
  date.setDate(date.getDate() + di);

  q('#act-label').textContent = `${DAYS[di]} ${date.getDate()}/${date.getMonth()+1} — ${String(h).padStart(2,'0')}h`;

  const inp = q('#act-input');
  inp.value = act ? act.text : '';

  selCat = act ? act.category : null;
  refreshCatUI();

  q('#btn-del-act').hidden = !act;
  q('#act-overlay').hidden = false;
  if (editMode || !act) setTimeout(() => inp.focus(), 100);
}

function closeActModal() {
  q('#act-overlay').hidden = true;
  editCell = null;
}

function saveAct() {
  if (!editCell) return;
  const text = q('#act-input').value.trim();
  const existing = getAct(editCell.di, editCell.h);
  setAct(editCell.di, editCell.h, text ? {
    text,
    category: selCat || 'other',
    done: existing ? existing.done : false,
  } : null);
  closeActModal();
  buildGrid();
}

// ── Categories ────────────────────────────────────────────────────────────────

function buildCatGrid() {
  const grid = q('#cat-grid');
  CATS.forEach(cat => {
    const btn = mk('button', 'cat-btn');
    btn.type = 'button';
    btn.dataset.id = cat.id;

    const dot = mk('span', 'cat-dot');
    dot.style.background = cat.color;
    const lbl = mk('span');
    lbl.textContent = cat.label;

    btn.appendChild(dot); btn.appendChild(lbl);
    btn.addEventListener('click', () => { selCat = cat.id; refreshCatUI(); });
    grid.appendChild(btn);
  });
}

function refreshCatUI() {
  qAll('.cat-btn').forEach(btn => {
    const active = btn.dataset.id === selCat;
    const cat    = CATS.find(c => c.id === btn.dataset.id);
    btn.classList.toggle('active', active);
    btn.style.borderColor = active && cat ? cat.color : '';
    btn.style.background  = active && cat ? hexA(cat.color, 0.15) : '';
  });
}

// ── Smoking tracker ───────────────────────────────────────────────────────────

function refreshSmokingStrip() {
  if (!S.smoking) return;

  if (S.smoking.mode === 'taper') {
    if (!S.smoking.taperStart) return;
    const info  = getTaperPhase();
    const limit = getTodayLimit();
    const count = getTodayCount();
    const done  = info.phaseIdx >= TAPER_PHASES.length - 1;
    q('#ss-time').textContent = done ? 'Livre!' : `${count}/${limit}`;
    q('#ss-money').hidden = true;
    return;
  }

  if (!S.smoking.quitDate) return;

  const diffMs   = Date.now() - new Date(S.smoking.quitDate).getTime();
  if (diffMs < 0) { q('#ss-time').textContent = 'Em breve'; return; }

  const mins  = Math.floor(diffMs / 60000);
  const days  = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m     = mins % 60;

  q('#ss-time').textContent = days > 0  ? `${days}d ${hours}h`
                            : hours > 0 ? `${hours}h ${m}m`
                            :             `${m}m`;

  if (S.smoking.cigarettesPerDay && S.smoking.packPrice) {
    const cigsPerPack  = 20;
    const cigsSaved    = (mins / 1440) * S.smoking.cigarettesPerDay;
    const moneySaved   = (cigsSaved / cigsPerPack) * S.smoking.packPrice;
    q('#ss-money').textContent = `R$ ${moneySaved.toFixed(0)} poupados`;
  }

  // Achievements
  checkAchievement('smoke6h',  mins >= 360);
  checkAchievement('smoke12h', mins >= 720);
  checkAchievement('smoke1d',  mins >= 1440);
  checkAchievement('smoke3d',  mins >= 4320);
  checkAchievement('smoke5d',  mins >= 7200);
  checkAchievement('smoke1w',  mins >= 10080);
  checkAchievement('smoke1m',  mins >= 43200);
  checkAchievement('smoke3m',  mins >= 129600);
  checkAchievement('smoke1y',  mins >= 525600);
}

function renderSmokingDetail() {
  if (S.smoking?.mode === 'taper') { renderTaperDetail(); return; }
  q('#smoke-sheet-title').textContent = 'Sem Cigarro';
  if (!S.smoking?.quitDate) {
    q('#smoke-big-counter').innerHTML = `
      <span class="bc-value" style="font-size:24px;color:var(--text3)">—</span>
      <span class="bc-label">Configure sua data de parar de fumar</span>
    `;
    q('#smoke-stats-row').innerHTML = '';
    q('#smoke-timeline').innerHTML  = '';
    return;
  }

  const diffMs  = Math.max(0, Date.now() - new Date(S.smoking.quitDate).getTime());
  const mins    = Math.floor(diffMs / 60000);
  const days    = Math.floor(mins / 1440);
  const hours   = Math.floor((mins % 1440) / 60);
  const m       = mins % 60;

  const timeStr = days > 0  ? `${days}d ${hours}h`
                : hours > 0 ? `${hours}h ${m}m`
                :             `${m}m`;

  q('#smoke-big-counter').innerHTML = `
    <span class="bc-value">${timeStr}</span>
    <span class="bc-label">sem cigarro</span>
  `;

  const cpd   = S.smoking.cigarettesPerDay || 0;
  const price = S.smoking.packPrice || 0;
  const cigs  = Math.floor((mins / 1440) * cpd);
  const money = ((cigs / 20) * price).toFixed(2);

  const savings = days * 150;
  q('#smoke-stats-row').innerHTML = `
    <div class="savings-card">
      <div class="sv-label">Saldo poupado</div>
      <div class="sv-value">${fmtBRL(savings)}</div>
      <div class="sv-sub">${days} ${days === 1 ? 'dia' : 'dias'} sem fumar · R$ 150/dia</div>
    </div>
    <div class="stat-card"><span class="stat-value">${cigs}</span><span class="stat-label">cigarros não fumados</span></div>
    <div class="stat-card"><span class="stat-value">R$ ${money}</span><span class="stat-label">do maço</span></div>
  `;

  // Next milestone card
  const nextM   = SMOKE_MILESTONES.find(m => mins < m.mins);
  const nextDiv = q('#smoke-next');
  nextDiv.innerHTML = '';
  if (nextM) {
    const tc   = nextM.type === 'warning' ? 'snc-warning' : nextM.type === 'boost' ? 'snc-boost' : 'snc-info';
    const tlbl = nextM.type === 'warning' ? 'Atenção' : nextM.type === 'boost' ? 'Próxima conquista' : 'Próximo marco';
    nextDiv.innerHTML = `
      <div class="smoke-next-card ${tc}">
        <div class="snc-label">${tlbl} · ${nextM.label}</div>
        <div class="snc-text">${nextM.text}</div>
      </div>
    `;
  }

  // Timeline
  const container = q('#smoke-timeline');
  container.innerHTML = '<h3 style="font-size:10px;color:var(--text3);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.8px">Recuperação do corpo</h3>';

  let nextShown = false;
  SMOKE_MILESTONES.forEach(m => {
    const done      = mins >= m.mins;
    const isNext    = !done && !nextShown;
    if (isNext) nextShown = true;

    const typeClass = m.type ? ` tl-${m.type}` : '';
    const row       = mk('div', `tl-row${done ? ' done' : isNext ? ' next' : ''}${typeClass}`);
    row.innerHTML = `
      <div class="tl-marker">${m.marker}</div>
      <div class="tl-body">
        <span class="tl-time">${m.label}</span>
        <span class="tl-text">${m.text}</span>
      </div>
      <span class="${done ? 'tl-check' : 'tl-lock'}">${done ? '✓' : isNext ? '...' : ''}</span>
    `;
    container.appendChild(row);
  });
}

function renderTaperDetail() {
  q('#smoke-sheet-title').textContent = 'Desmame';

  if (!S.smoking?.taperStart) {
    q('#smoke-big-counter').innerHTML = `
      <span class="bc-value" style="font-size:24px;color:var(--text3)">—</span>
      <span class="bc-label">Configure o desmame</span>`;
    q('#smoke-stats-row').innerHTML = '';
    q('#smoke-next').innerHTML = '';
    q('#smoke-timeline').innerHTML = '';
    return;
  }

  const info  = getTaperPhase();
  const limit = getTodayLimit();
  const count = getTodayCount();
  const done  = info.phaseIdx >= TAPER_PHASES.length - 1;

  // Big counter
  if (done) {
    q('#smoke-big-counter').innerHTML = `
      <span class="bc-value" style="color:var(--success)">Livre!</span>
      <span class="bc-label">Desmame concluído</span>`;
  } else {
    const sub = limit === 0
      ? 'dia de descanso — não fume hoje'
      : count >= limit ? 'limite de hoje atingido'
      : `restam ${limit - count} hoje`;
    q('#smoke-big-counter').innerHTML = `
      <div class="taper-counter">
        <span class="tc-smoked" style="color:${count > 0 ? 'var(--gold)' : 'var(--text3)'}">${count}</span>
        <span class="tc-sep">/</span>
        <span class="tc-limit">${limit}</span>
      </div>
      <span class="bc-label">${sub}</span>`;
  }

  // Stats
  const daysLeft  = done ? 0 : info.days - info.dayInPhase;
  const smokeFree = countSmokeFree();
  const savings   = smokeFree * 150;
  q('#smoke-stats-row').innerHTML = `
    <div class="savings-card">
      <div class="sv-label">Saldo poupado</div>
      <div class="sv-value">${fmtBRL(savings)}</div>
      <div class="sv-sub">${smokeFree} ${smokeFree === 1 ? 'dia' : 'dias'} sem fumar · R$ 150/dia</div>
    </div>
    ${!done ? `<div class="stat-card"><span class="stat-value">Fase ${info.phaseIdx + 1}</span><span class="stat-label">${info.label}</span></div>
    <div class="stat-card"><span class="stat-value">${daysLeft}</span><span class="stat-label">dias na fase</span></div>` : ''}`;

  // Log button / rest-day card
  const nextDiv = q('#smoke-next');
  nextDiv.innerHTML = '';
  if (!done) {
    if (limit === 0) {
      nextDiv.innerHTML = `
        <div class="smoke-next-card snc-boost">
          <div class="snc-label">Dia de descanso</div>
          <div class="snc-text">Hoje é dia de não fumar. Cada pausa é uma vitória real.</div>
        </div>`;
    } else {
      const canSmoke = count < limit;
      nextDiv.innerHTML = `
        <div class="taper-log-row">
          <button id="btn-log-cig" class="btn ${canSmoke ? 'primary' : 'danger'}">${canSmoke ? `Registrar (${count + 1} de ${limit})` : 'Limite de hoje atingido'}</button>
          ${count > 0 ? `<button id="btn-remove-cig" class="btn secondary" style="flex:0 0 auto;padding:14px 20px">-1</button>` : ''}
        </div>`;
      if (canSmoke) q('#btn-log-cig').addEventListener('click', logCigarette);
      if (count > 0) q('#btn-remove-cig').addEventListener('click', removeCigarette);
    }
  }

  // Phase plan
  const container = q('#smoke-timeline');
  container.innerHTML = '<h3 class="tl-section-title">Plano de desmame</h3>';
  TAPER_PHASES.forEach((ph, i) => {
    const isDone   = i < info.phaseIdx;
    const isActive = i === info.phaseIdx;
    const row = mk('div', `tl-row${isDone ? ' done' : isActive ? ' next tl-boost' : ''}`);
    row.innerHTML = `
      <div class="tl-marker">${ph.range}</div>
      <div class="tl-body">
        <span class="tl-time">${ph.label}${isActive && ph.days > 0 ? ` · ${daysLeft} dias restantes` : ''}</span>
        ${isDone ? '<span class="tl-text">Concluído</span>' : ''}
      </div>
      <span class="${isDone ? 'tl-check' : isActive ? 'tl-lock' : 'tl-lock'}">${isDone ? '✓' : isActive ? '...' : ''}</span>`;
    container.appendChild(row);
  });

  // 7-day history bars
  const taperLog  = S.smoking.taperLog || {};
  const maxBefore = S.smoking.cigarettesPerDay || 5;
  const DAY_ABB   = ['D','S','T','Q','Q','S','S'];
  const startDate = new Date(S.smoking.taperStart); startDate.setHours(0,0,0,0);

  const histEl = mk('div');
  histEl.innerHTML = '<h3 class="tl-section-title" style="margin-top:14px">Últimos 7 dias</h3>';
  const barsEl = mk('div', 'taper-bars');

  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const c = taperLog[k] || 0;

    const dSince  = Math.floor((d - startDate) / 86400000);
    let   dayLim  = 0;
    let   off2    = 0;
    for (let pi = 0; pi < TAPER_PHASES.length - 1; pi++) {
      if (dSince < off2 + TAPER_PHASES[pi].days) {
        const ph = TAPER_PHASES[pi];
        dayLim = ph.altDay ? (dSince % 2 === 0 ? 1 : 0) : ph.limit;
        break;
      }
      off2 += TAPER_PHASES[pi].days;
    }

    const hPx       = Math.round(Math.min(44, Math.max(c > 0 ? 3 : 0, (c / maxBefore) * 44)));
    const barColor  = c === 0 ? 'var(--border)' : c <= dayLim ? 'var(--success)' : 'var(--danger)';
    const col = mk('div', 'tb-col');
    col.innerHTML = `
      <div class="tb-bar-wrap"><div class="tb-bar" style="height:${hPx}px;background:${barColor}"></div></div>
      <div class="tb-count">${c > 0 ? c : ''}</div>
      <div class="tb-day${i === 0 ? ' tb-today' : ''}">${DAY_ABB[d.getDay()]}</div>`;
    barsEl.appendChild(col);
  }

  histEl.appendChild(barsEl);
  container.appendChild(histEl);
}

// ── Achievements screen ───────────────────────────────────────────────────────

function renderAchievements() {
  const grid = q('#ach-grid');
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const unlocked = !!S.achievements[a.id];
    const card     = mk('div', `ach-card${unlocked ? ' unlocked' : ''}`);
    card.innerHTML = `
      <span class="ach-card-icon">${a.icon}</span>
      <span class="ach-card-name">${a.name}</span>
      <span class="ach-card-desc">${a.desc}</span>
      <span class="ach-card-xp">+${a.xp} XP</span>
    `;
    grid.appendChild(card);
  });
}

// ── Level-up modal ────────────────────────────────────────────────────────────

function showLevelUp(lv) {
  const title = LEVEL_NAMES[Math.min(lv, LEVEL_NAMES.length - 1)] || 'Lenda';
  q('#levelup-num').textContent   = `Nível ${lv}`;
  q('#levelup-title').textContent = title;
  q('#levelup-modal').hidden = false;
  launchConfetti();
}

// ── Confetti ──────────────────────────────────────────────────────────────────

function launchConfetti() {
  const canvas = q('#confetti-canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#8B7CC8','#C8A96B','#6BC8A4','#7B9EC8','#F2A8B8','#F2C89B'];
  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: -10,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    size: 4 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot: Math.random() * 360,
    rSpeed: (Math.random() - 0.5) * 8,
  }));

  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      if (p.y > canvas.height + 20) return;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.rot += p.rSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    if (alive) frame = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  cancelAnimationFrame(frame);
  draw();
}

// ── Floating XP text ──────────────────────────────────────────────────────────

function floatXP(text, el) {
  const rect  = el.getBoundingClientRect();
  const span  = document.createElement('div');
  span.className   = 'xp-float';
  span.textContent = text;
  span.style.left  = `${rect.left + rect.width / 2 - 24}px`;
  span.style.top   = `${rect.top  - 10}px`;
  document.body.appendChild(span);
  span.addEventListener('animationend', () => span.remove());
}

// ── Week navigation ───────────────────────────────────────────────────────────

function shiftWeek(delta) {
  weekStart = new Date(weekStart);
  weekStart.setDate(weekStart.getDate() + delta * 7);
  updateWeekLabel();
  buildGrid();
}

function updateWeekLabel() {
  const todayMon = getMonday(new Date());
  const lbl = q('#week-label');
  if (weekStart.getTime() === todayMon.getTime()) { lbl.textContent = 'Esta semana'; return; }
  const end = new Date(weekStart); end.setDate(end.getDate() + 6);
  const fmt = d => `${d.getDate()}/${d.getMonth()+1}`;
  lbl.textContent = `${fmt(weekStart)}–${fmt(end)}`;
}

// ── Scroll to current time ────────────────────────────────────────────────────

function scrollToCurrent() {
  const h = new Date().getHours();
  if (h < START_H || h > END_H) return;
  const wrapper = q('#grid-wrapper');
  const ROW_H   = 64;
  wrapper.scrollTop = Math.max(0, (h - START_H) * ROW_H - wrapper.clientHeight / 3);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

const q    = s => document.querySelector(s);
const qAll = s => document.querySelectorAll(s);
function mk(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function hexA(hex, a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  buildCatGrid();
  updateWeekLabel();
  buildGrid();
  refreshXPBar();
  refreshStreak();
  refreshSmokingStrip();
  setInterval(refreshSmokingStrip, 30000);

  // Week nav
  q('#btn-prev').addEventListener('click', () => shiftWeek(-1));
  q('#btn-next').addEventListener('click', () => shiftWeek(1));

  // Activity modal
  q('#act-overlay').addEventListener('click', e => { if (e.target.id === 'act-overlay') closeActModal(); });
  q('#btn-close-act').addEventListener('click', closeActModal);
  q('#btn-save-act').addEventListener('click', saveAct);
  q('#btn-del-act').addEventListener('click', () => {
    if (!editCell) return;
    setAct(editCell.di, editCell.h, null);
    closeActModal();
    buildGrid();
  });
  q('#act-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveAct(); });

  // Smoking strip → detail
  q('#smoke-strip').addEventListener('click', () => {
    renderSmokingDetail();
    q('#smoke-overlay').hidden = false;
  });
  q('#btn-close-smoke').addEventListener('click', () => { q('#smoke-overlay').hidden = true; });
  q('#smoke-overlay').addEventListener('click', e => { if (e.target.id === 'smoke-overlay') q('#smoke-overlay').hidden = true; });
  q('#btn-smoke-setup').addEventListener('click', () => {
    q('#smoke-overlay').hidden = true;
    openSetup();
  });

  // Setup modal
  q('#btn-close-setup').addEventListener('click', () => { q('#setup-overlay').hidden = true; });
  q('#setup-overlay').addEventListener('click', e => { if (e.target.id === 'setup-overlay') q('#setup-overlay').hidden = true; });
  q('#btn-save-setup').addEventListener('click', () => {
    const mode  = q('#mode-toggle .mode-btn.active')?.dataset.mode || 'quit';
    const cpd   = parseFloat(q('#cig-per-day').value) || 0;
    const price = parseFloat(q('#pack-price').value)  || 0;
    if (mode === 'taper') {
      const ts = q('#taper-start-input').value;
      if (ts) {
        S.smoking = { mode:'taper', taperStart: new Date(ts).toISOString(), cigarettesPerDay: cpd, packPrice: price, taperLog: S.smoking?.taperLog || {} };
        save(); refreshSmokingStrip();
      }
    } else {
      const val = q('#quit-input').value;
      if (val) {
        S.smoking = { mode:'quit', quitDate: new Date(val).toISOString(), cigarettesPerDay: cpd, packPrice: price };
        save(); refreshSmokingStrip();
      }
    }
    q('#setup-overlay').hidden = true;
  });

  // Achievements
  q('#btn-open-ach').addEventListener('click', () => {
    renderAchievements();
    q('#ach-overlay').hidden = false;
  });
  q('#btn-close-ach').addEventListener('click', () => { q('#ach-overlay').hidden = true; });

  // Level up
  q('#btn-close-levelup').addEventListener('click', () => { q('#levelup-modal').hidden = true; });

  if (!S.smoking) {
    q('#ss-time').textContent  = 'Configurar';
    q('#ss-money').textContent = '';
  }

  requestAnimationFrame(() => setTimeout(scrollToCurrent, 60));
}

function setSetupMode(mode) {
  qAll('#mode-toggle .mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  q('#setup-quit-section').hidden  = mode === 'taper';
  q('#setup-taper-section').hidden = mode !== 'taper';
}

function openSetup() {
  const mode = S.smoking?.mode || 'quit';
  setSetupMode(mode);

  if (S.smoking) {
    if (mode === 'taper' && S.smoking.taperStart) {
      const ts = new Date(S.smoking.taperStart);
      q('#taper-start-input').value = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')}`;
    } else if (S.smoking.quitDate) {
      const d = new Date(S.smoking.quitDate);
      q('#quit-input').value = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    }
    q('#cig-per-day').value = S.smoking.cigarettesPerDay || '';
    q('#pack-price').value  = S.smoking.packPrice || '';
  } else {
    q('#taper-start-input').value = todayKey();
  }
  q('#setup-overlay').hidden = false;
}

// Setup shortcut when not configured
document.addEventListener('DOMContentLoaded', () => {
  init();
  // Intercept smoke-strip click to open setup if not configured
  const orig = q('#smoke-strip').onclick;
  if (!S.smoking) {
    q('#smoke-strip').addEventListener('click', () => {
      openSetup();
    }, { once: true });
  }
});
