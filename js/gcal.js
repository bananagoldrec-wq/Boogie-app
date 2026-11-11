'use strict';

// Two-way sync between the week grid and the user's primary Google Calendar.
// Edits are saved locally first (marked dirty), pushed to Google, and then the
// week is rebuilt from Google so changes made in Google Agenda show up here too.

// OAuth "Web application" client from Google Cloud Console. Redirect URI must be
// this page's URL (https://bananagoldrec-wq.github.io/Boogie-app/tracker.html).
const GCAL_CLIENT_ID = '735980018099-rbe40eh2vmqsqfn94rjo2em3tmt7a03d.apps.googleusercontent.com';
const GCAL_SCOPE     = 'https://www.googleapis.com/auth/calendar.events email';
const GCAL_EVENTS    = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GCAL_TOKEN_KEY = 'rotina-gtoken';
const GCAL_TZ        = Intl.DateTimeFormat().resolvedOptions().timeZone;

const CAT_COLOR = { exercise:'2', study:'3', work:'9', food:'5', family:'4', goal:'7', sleep:'8' };
const COLOR_CAT = Object.fromEntries(Object.entries(CAT_COLOR).map(([c, id]) => [id, c]));

let _gcalBusy = false, _gcalAgain = false, _gcalLastOk = null, _gcalError = null;

const gpad = n => String(n).padStart(2, '0');
const gymd = d => `${d.getFullYear()}-${gpad(d.getMonth() + 1)}-${gpad(d.getDate())}`;
const gnorm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const grrule = di => `RRULE:FREQ=WEEKLY;BYDAY=${GCAL_DAYS[di]}`;

function gcalState() {
  if (!S.gcal) S.gcal = { connected: false, deletes: [] };
  if (!S.gcal.deletes) S.gcal.deletes = [];
  return S.gcal;
}

function gcalConnected() { return !!(S.gcal && S.gcal.connected); }

function gcalToken() {
  try {
    const t = JSON.parse(localStorage.getItem(GCAL_TOKEN_KEY));
    if (t && t.exp > Date.now() + 60000) return t.token;
  } catch (_) {}
  return null;
}

// ── OAuth (implicit flow by full-page redirect: popups are unreliable in iOS home-screen apps)

function gcalAuthorize(silent) {
  if (!GCAL_CLIENT_ID) { showReminderToast('A chave do Google (Client ID) ainda não foi configurada no app.'); return; }
  const st = (crypto.getRandomValues(new Uint32Array(4))).join('-');
  localStorage.setItem('rotina-gstate', st);
  if (silent) localStorage.setItem('rotina-gsilent', String(Date.now()));
  const p = new URLSearchParams({
    client_id: GCAL_CLIENT_ID,
    redirect_uri: location.origin + location.pathname,
    response_type: 'token',
    scope: GCAL_SCOPE,
    include_granted_scopes: 'true',
    state: st,
  });
  if (silent) p.set('prompt', 'none');
  if (gcalState().email) p.set('login_hint', gcalState().email);
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}

function gcalHandleRedirect() {
  if (!location.hash.includes('state=')) return;
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = localStorage.getItem('rotina-gstate');
  localStorage.removeItem('rotina-gstate');
  if (!expected || h.get('state') !== expected) return;
  if (h.get('access_token')) {
    localStorage.setItem(GCAL_TOKEN_KEY, JSON.stringify({
      token: h.get('access_token'),
      exp: Date.now() + Number(h.get('expires_in') || 3600) * 1000,
    }));
    const first = !gcalConnected();
    gcalState().connected = true;
    save();
    if (first) setTimeout(() => showReminderToast('Google Agenda conectado! Sincronizando…'), 300);
  } else if (h.get('error') && h.get('error') !== 'interaction_required' && h.get('error') !== 'login_required') {
    setTimeout(() => showReminderToast('Não foi possível conectar ao Google: ' + h.get('error')), 300);
  }
}

// Renew an expired token without user interaction, at most once every 10 minutes
function gcalRenewSilently() {
  const last = Number(localStorage.getItem('rotina-gsilent') || 0);
  if (Date.now() - last < 10 * 60000) return false;
  gcalAuthorize(true);
  return true;
}

function gcalDisconnect() {
  const tok = gcalToken();
  if (tok) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(tok), { method: 'POST' }).catch(() => {});
  localStorage.removeItem(GCAL_TOKEN_KEY);
  gcalState().connected = false;
  save();
  renderGcalSettings();
}

// ── API

async function gapi(path, opts = {}) {
  const tok = gcalToken();
  if (!tok) throw new Error('auth');
  const r = await fetch(path.startsWith('http') ? path : GCAL_EVENTS + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
  });
  if (r.status === 401) { localStorage.removeItem(GCAL_TOKEN_KEY); throw new Error('auth'); }
  if (r.status === 204) return null;
  if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

async function gdelete(id) {
  try { await gapi('/' + encodeURIComponent(id), { method: 'DELETE' }); }
  catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
}

function eventBody(act, date) {
  const addMins = (hhmm, mins) => {
    const [h, m] = hhmm.split(':').map(Number);
    const t = Math.min(h * 60 + m + mins, 23 * 60 + 59);
    return `${gpad(Math.floor(t / 60))}:${gpad(t % 60)}`;
  };
  const end  = act.endTime && act.endTime > act.startTime ? act.endTime : addMins(act.startTime, 60);
  const lead = S.notifLeadMins || 10;
  return {
    summary: act.text,
    start: { dateTime: `${gymd(date)}T${act.startTime}:00`, timeZone: GCAL_TZ },
    end:   { dateTime: `${gymd(date)}T${end}:00`,           timeZone: GCAL_TZ },
    colorId: CAT_COLOR[act.category],
    reminders: { useDefault: false, overrides: [...new Set([60, lead, 1, 0])].map(minutes => ({ method: 'popup', minutes })) },
    extendedProperties: { private: { cat: act.category, src: 'minha-rotina' } },
  };
}

// Stop a weekly series from happening on one weekday (deletes it if no days are left)
async function gcalRemoveDay(seriesId, di) {
  const parent = await gapi('/' + encodeURIComponent(seriesId));
  const rec = parent.recurrence || [];
  const idx = rec.findIndex(r => r.startsWith('RRULE:'));
  const m = idx >= 0 && rec[idx].match(/BYDAY=([A-Z,]+)/);
  const days = m ? m[1].split(',').filter(d => d !== GCAL_DAYS[di]) : [];
  if (!days.length) { await gdelete(seriesId); return; }
  const next = rec.slice();
  next[idx] = rec[idx].replace(/BYDAY=[A-Z,]+/, 'BYDAY=' + days.join(','));
  await gapi('/' + encodeURIComponent(seriesId), { method: 'PATCH', body: JSON.stringify({ recurrence: next }) });
}

// ── Sync

function weekDayDate(mon, di) { const d = new Date(mon); d.setDate(d.getDate() + di); return d; }

async function gcalListWeek(mon) {
  const end = new Date(mon); end.setDate(end.getDate() + 7);
  const res = await gapi(`?timeMin=${encodeURIComponent(mon.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}` +
                         '&singleEvents=true&orderBy=startTime&maxResults=250');
  return (res.items || []).filter(e => e.status !== 'cancelled' && e.start && e.start.dateTime);
}

function eventStart(e) {
  const s = new Date(e.start.dateTime);
  return { s, di: (s.getDay() + 6) % 7, hhmm: `${gpad(s.getHours())}:${gpad(s.getMinutes())}` };
}

async function gcalSyncWeek(mon) {
  const wkKey  = mon.toISOString().slice(0, 10);
  const prefix = wkKey + '-';
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  let events   = await gcalListWeek(mon);
  const local  = Object.entries(S.activities).filter(([k, a]) => k.startsWith(prefix) && a);
  const replace = new Set();
  let pushed = false;

  // 1. Push local changes
  for (const [k, a] of local) {
    const di   = DAY_KEYS.indexOf(k.slice(prefix.length).split('-')[0]);
    const date = weekDayDate(mon, di);
    if (a.gcalId) {
      replace.add(k);
      if (!a.dirty) continue;
      if (a.gcalRecurringId && (a.scope === 'all' || !a.pin)) {
        // Change every week (or un-pin): take this weekday out of the series, recreate it on its own
        await gcalRemoveDay(a.gcalRecurringId, di);
        const body = eventBody(a, date);
        if (a.pin) body.recurrence = [grrule(di)];
        await gapi('', { method: 'POST', body: JSON.stringify(body) });
        // Unlink so a retry after a failure re-links by matching instead of creating it twice
        delete a.gcalId; delete a.gcalRecurringId;
      } else {
        const body = eventBody(a, date);
        if (a.pin && !a.gcalRecurringId) body.recurrence = [grrule(di)];
        await gapi('/' + encodeURIComponent(a.gcalId), { method: 'PATCH', body: JSON.stringify(body) });
      }
      a.dirty = false; delete a.scope;
      save();
      pushed = true;
      continue;
    }
    // Not linked yet: link to an identical Google event, otherwise create it (only from today on)
    const match = events.find(e => !e._used && eventStart(e).di === di &&
      eventStart(e).hhmm === a.startTime && gnorm(e.summary) === gnorm(a.text));
    if (match) { match._used = true; replace.add(k); continue; }
    if (date < today) continue;  // don't backfill past days into Google
    const body = eventBody(a, date);
    if (a.pin) body.recurrence = [grrule(di)];
    await gapi('', { method: 'POST', body: JSON.stringify(body) });
    replace.add(k);
    pushed = true;
  }
  if (pushed) events = await gcalListWeek(mon);

  // 2. Rebuild the week from Google, keeping local done flags
  const doneById = {}, doneByKey = {};
  for (const [k, a] of local) {
    if (a.gcalId) doneById[a.gcalId] = a.done;
    doneByKey[k] = a.done;
    if (replace.has(k)) delete S.activities[k];
  }
  for (const e of events) {
    const { s, di } = eventStart(e);
    const en  = new Date(e.end.dateTime);
    const h   = s.getHours(), m = s.getMinutes() < 30 ? 0 : 30;
    const key = `${wkKey}-${DAY_KEYS[di]}-${h}-${m}`;
    const prev = S.activities[key];
    if (prev && prev.gcalId) { prev.text += ' · ' + (e.summary || ''); continue; }
    S.activities[key] = {
      text: e.summary || '(sem título)',
      category: (e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.cat) || COLOR_CAT[e.colorId] || 'other',
      done: doneById[e.id] ?? doneByKey[key] ?? false,
      startTime: `${gpad(h)}:${gpad(s.getMinutes())}`,
      endTime: en.toDateString() === s.toDateString() ? `${gpad(en.getHours())}:${gpad(en.getMinutes())}` : null,
      pin: e.recurringEventId ? true : undefined,
      gcalId: e.id,
      gcalRecurringId: e.recurringEventId,
    };
  }
}

async function gcalSync() {
  if (!gcalConnected()) return;
  if (!gcalToken()) { if (!gcalRenewSilently()) renderGcalSettings(); return; }
  if (_gcalBusy) { _gcalAgain = true; return; }
  _gcalBusy = true;
  try {
    const st = gcalState();
    while (st.deletes.length) {
      const d = st.deletes[0];
      if (d.scope === 'all' && d.recurringId) await gcalRemoveDay(d.recurringId, d.di);
      else await gdelete(d.id);
      st.deletes.shift();
      save();
    }
    if (!st.email) {
      try { st.email = (await gapi('https://www.googleapis.com/oauth2/v3/userinfo')).email; } catch (_) {}
    }
    const thisMon = getMonday(new Date());
    await gcalSyncWeek(weekStart);
    if (weekStart.getTime() !== thisMon.getTime()) await gcalSyncWeek(thisMon);
    save();
    _gcalLastOk = new Date();
    _gcalError = null;
    buildGrid();
    updateTodayProgress();
  } catch (e) {
    _gcalError = e.message === 'auth' ? 'auth' : 'net';
    if (e.message === 'auth') gcalRenewSilently();
  } finally {
    _gcalBusy = false;
    renderGcalSettings();
    if (_gcalAgain) { _gcalAgain = false; gcalSync(); }
  }
}

// Called by the activity modal. Returns false if the user cancelled.
function gcalBeforeSave(orig, next) {
  if (!gcalConnected() || !orig || !orig.gcalId || !next) return true;
  next.gcalId = orig.gcalId;
  next.gcalRecurringId = orig.gcalRecurringId;
  next.dirty = true;
  if (orig.gcalRecurringId && next.pin) {
    const changed = orig.text !== next.text || orig.startTime !== next.startTime ||
                    orig.endTime !== next.endTime || orig.category !== next.category;
    if (changed) next.scope = confirm('Aplicar a mudança em todas as semanas?\n\nOK = todas as semanas\nCancelar = só neste dia') ? 'all' : 'one';
  }
  return true;
}

function gcalQueueDelete(act, di) {
  if (!gcalConnected() || !act || !act.gcalId) return;
  let scope = 'one';
  if (act.gcalRecurringId) scope = confirm('Remover de todas as semanas?\n\nOK = todas as semanas\nCancelar = só neste dia') ? 'all' : 'one';
  gcalState().deletes.push({ id: act.gcalId, recurringId: act.gcalRecurringId, di, scope });
  save();
}

// ── Settings UI

function renderGcalSettings() {
  const status = q('#gcal-status');
  if (!status) return;
  const connected = gcalConnected();
  const hasToken  = !!gcalToken();
  q('#btn-gcal-connect').hidden    = connected && hasToken;
  q('#btn-gcal-connect').textContent = connected ? 'Reconectar Google Agenda' : 'Conectar Google Agenda';
  q('#btn-gcal-sync').hidden       = !(connected && hasToken);
  q('#btn-gcal-disconnect').hidden = !connected;
  q('#gcal-list').hidden           = connected;
  q('#gcal-links-label').hidden    = connected;
  if (!connected) {
    status.textContent = 'Conecte para que tudo que você criar ou mudar aqui apareça no Google Agenda (com notificação no celular), e vice-versa.';
  } else if (!hasToken || _gcalError === 'auth') {
    status.textContent = 'A conexão expirou. Toque em "Reconectar".';
  } else if (_gcalError === 'net') {
    status.textContent = 'Não foi possível sincronizar agora. Vou tentar de novo.';
  } else if (_gcalBusy) {
    status.textContent = 'Sincronizando…';
  } else {
    const who = S.gcal.email ? ` (${S.gcal.email})` : '';
    status.textContent = `✓ Conectado${who}` + (_gcalLastOk ? ` · sincronizado às ${gpad(_gcalLastOk.getHours())}:${gpad(_gcalLastOk.getMinutes())}` : '');
  }
}

gcalHandleRedirect();

document.addEventListener('DOMContentLoaded', () => {
  q('#btn-gcal-connect').addEventListener('click', () => gcalAuthorize(false));
  q('#btn-gcal-sync').addEventListener('click', () => { gcalSync(); renderGcalSettings(); });
  q('#btn-gcal-disconnect').addEventListener('click', () => {
    if (confirm('Desconectar o Google Agenda? Os eventos continuam no Google, só param de sincronizar.')) gcalDisconnect();
  });
  renderGcalSettings();
  gcalSync();
  setInterval(gcalSync, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) gcalSync(); });
});
