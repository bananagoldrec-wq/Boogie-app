'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const SK = 'rotina-v2';

const DAYS     = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const START_H  = 5;
const END_H    = 23;

const CATS = [
  { id:'exercise', label:'💪 Exercício',   color:'#10B981' },
  { id:'food',     label:'🍎 Alimentação', color:'#F59E0B' },
  { id:'work',     label:'💼 Trabalho',    color:'#3B82F6' },
  { id:'study',    label:'📚 Estudo',      color:'#8B5CF6' },
  { id:'sleep',    label:'😴 Sono',        color:'#6366F1' },
  { id:'family',   label:'❤️ Família',     color:'#EC4899' },
  { id:'goal',     label:'🎯 Meta',        color:'#14B8A6' },
  { id:'other',    label:'✏️ Outro',       color:'#F97316' },
];

const LEVEL_NAMES = [
  '', 'Iniciante','Em Movimento','Guerreiro','Atleta','Campeão',
  'Mestre','Lenda','Imortal',
];

const ACHIEVEMENTS = [
  { id:'first',      icon:'👣', name:'Primeiro Passo',    desc:'Conclua sua primeira atividade',             xp:50  },
  { id:'day_done',   icon:'⭐', name:'Dia Vencedor',      desc:'Conclua todas as atividades do dia',         xp:100 },
  { id:'streak3',    icon:'🔥', name:'Em Chamas',         desc:'Mantenha streak de 3 dias',                  xp:150 },
  { id:'streak7',    icon:'💥', name:'Semana de Fogo',    desc:'Mantenha streak de 7 dias',                  xp:300 },
  { id:'streak30',   icon:'🌟', name:'Mês Perfeito',      desc:'Mantenha streak de 30 dias',                 xp:1000},
  { id:'acts50',     icon:'🎖️', name:'Meio Século',       desc:'Conclua 50 atividades no total',             xp:500 },
  { id:'smoke1d',    icon:'🌬️', name:'24h Limpo',         desc:'1 dia sem cigarro',                          xp:100 },
  { id:'smoke1w',    icon:'💨', name:'Semana Livre',      desc:'7 dias sem cigarro',                         xp:300 },
  { id:'smoke1m',    icon:'🫁', name:'Pulmões Renovados', desc:'30 dias sem cigarro',                        xp:700 },
  { id:'smoke3m',    icon:'🏅', name:'3 Meses de Vitória',desc:'90 dias sem cigarro',                        xp:1500},
  { id:'smoke1y',    icon:'🏆', name:'1 Ano de Liberdade',desc:'365 dias sem cigarro',                       xp:5000},
  { id:'lv5',        icon:'⚡', name:'Nível 5',           desc:'Alcance o nível 5',                          xp:200 },
  { id:'lv10',       icon:'🎯', name:'Nível 10',          desc:'Alcance o nível 10',                         xp:500 },
  { id:'lv20',       icon:'👑', name:'Nível 20',          desc:'Alcance o nível 20',                         xp:1000},
];

const SMOKE_MILESTONES = [
  { mins:20,      icon:'❤️',  label:'20 minutos', text:'Pressão e pulso voltam ao normal'         },
  { mins:480,     icon:'🩸',  label:'8 horas',    text:'CO no sangue cai à metade'                },
  { mins:1440,    icon:'🫁',  label:'24 horas',   text:'Pulmões começam a limpar o muco'          },
  { mins:2880,    icon:'👃',  label:'48 horas',   text:'Paladar e olfato retornam'                },
  { mins:4320,    icon:'💨',  label:'72 horas',   text:'Respiração fica muito mais fácil'         },
  { mins:20160,   icon:'🏃',  label:'2 semanas',  text:'Circulação melhora visivelmente'          },
  { mins:43200,   icon:'🌱',  label:'1 mês',      text:'Pulmões se regeneram, menos tosse'        },
  { mins:129600,  icon:'💪',  label:'3 meses',    text:'Função pulmonar melhora até 30%'          },
  { mins:388800,  icon:'⚡',  label:'9 meses',    text:'Energia significativamente maior'         },
  { mins:525600,  icon:'💝',  label:'1 ano',      text:'Risco cardíaco cai à metade'              },
  { mins:2628000, icon:'🧠',  label:'5 anos',     text:'Risco de AVC como não fumante'            },
  { mins:5256000, icon:'🏅',  label:'10 anos',    text:'Risco de câncer de pulmão cai 50%'       },
  { mins:7884000, icon:'🏆',  label:'15 anos',    text:'Coração igual ao de não fumante'          },
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
  const flame = S.streak >= 7 ? '⚡🔥' : S.streak >= 3 ? '🔥' : S.streak > 0 ? '🔥' : '💤';
  q('#flame-icon').textContent = flame;
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
  const existing = getAct(editCell.di, editCell.hour);
  setAct(editCell.di, editCell.hour, text ? {
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
  if (!S.smoking?.quitDate) return;

  const diffMs   = Date.now() - new Date(S.smoking.quitDate).getTime();
  if (diffMs < 0) { q('#ss-time').textContent = '🚭 Em breve'; return; }

  const mins  = Math.floor(diffMs / 60000);
  const days  = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m     = mins % 60;

  q('#ss-time').textContent = days > 0  ? `🚭 ${days}d ${hours}h`
                            : hours > 0 ? `🚭 ${hours}h ${m}m`
                            :             `🚭 ${m}m`;

  if (S.smoking.cigarettesPerDay && S.smoking.packPrice) {
    const cigsPerPack  = 20;
    const cigsSaved    = (mins / 1440) * S.smoking.cigarettesPerDay;
    const moneySaved   = (cigsSaved / cigsPerPack) * S.smoking.packPrice;
    q('#ss-money').textContent = `💰 R$ ${moneySaved.toFixed(0)} economizados`;
  }

  // Achievements
  checkAchievement('smoke1d', mins >= 1440);
  checkAchievement('smoke1w', mins >= 10080);
  checkAchievement('smoke1m', mins >= 43200);
  checkAchievement('smoke3m', mins >= 129600);
  checkAchievement('smoke1y', mins >= 525600);
}

function renderSmokingDetail() {
  if (!S.smoking?.quitDate) {
    q('#smoke-big-counter').innerHTML = `
      <span class="bc-value" style="font-size:32px">🚭</span>
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

  q('#smoke-stats-row').innerHTML = `
    <div class="stat-card"><span class="stat-value">🚬 ${cigs}</span><span class="stat-label">cigarros não fumados</span></div>
    <div class="stat-card"><span class="stat-value">R$ ${money}</span><span class="stat-label">economizados</span></div>
  `;

  // Timeline
  const container = q('#smoke-timeline');
  container.innerHTML = '<h3 style="font-size:13px;color:var(--text2);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Recuperação do corpo</h3>';

  let nextShown = false;
  SMOKE_MILESTONES.forEach(m => {
    const done   = mins >= m.mins;
    const isNext = !done && !nextShown;
    if (isNext) nextShown = true;

    const row  = mk('div', `tl-row${done ? ' done' : isNext ? ' next' : ''}`);
    row.innerHTML = `
      <span class="tl-icon">${m.icon}</span>
      <div class="tl-body">
        <span class="tl-time">${m.label}</span>
        <span class="tl-text">${m.text}</span>
      </div>
      <span class="${done ? 'tl-check' : 'tl-lock'}">${done ? '✓' : isNext ? '⏳' : '🔒'}</span>
    `;
    container.appendChild(row);
  });
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

  const COLORS = ['#7C3AED','#F59E0B','#10B981','#3B82F6','#EC4899','#F97316'];
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
    setAct(editCell.di, editCell.hour, null);
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
    const val   = q('#quit-input').value;
    const cpd   = parseFloat(q('#cig-per-day').value) || 0;
    const price = parseFloat(q('#pack-price').value)  || 0;
    if (val) {
      S.smoking = { quitDate: new Date(val).toISOString(), cigarettesPerDay: cpd, packPrice: price };
      save();
      refreshSmokingStrip();
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

  // Smoking strip click when not configured → open setup
  if (!S.smoking?.quitDate) {
    q('#ss-time').textContent  = '🚭 Config';
    q('#ss-money').textContent = '';
  }

  requestAnimationFrame(() => setTimeout(scrollToCurrent, 60));
}

function openSetup() {
  if (S.smoking) {
    const d = new Date(S.smoking.quitDate);
    q('#quit-input').value  = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    q('#cig-per-day').value = S.smoking.cigarettesPerDay || '';
    q('#pack-price').value  = S.smoking.packPrice || '';
  }
  q('#setup-overlay').hidden = false;
}

// Setup shortcut when not configured
document.addEventListener('DOMContentLoaded', () => {
  init();
  // Intercept smoke-strip click to open setup if not configured
  const orig = q('#smoke-strip').onclick;
  if (!S.smoking?.quitDate) {
    q('#smoke-strip').addEventListener('click', () => {
      openSetup();
    }, { once: true });
  }
});
