import {
  h, mount, form, validate, toast, modal, confirmDialog, lightbox, avatar, spinner, lockedCard, emptyState, simpleField, field,
  fmtDate, fmtDateLong, fmtNum, fmtMin, todayISO, isoOf, parseISO, MONTHS_ES, DAYS_SHORT, DAYS_FULL, calcBmi, bmiLabel, waLink,
} from './ui.js';
import { icon, avatarSvg, AVATAR_KEYS } from './icons.js';
import { get, post, put, del, fileToDataUrl, ApiError } from './api.js';
import { S, isPremium } from './state.js';
import { lineChart, ring, progressBar } from './charts.js';
import { PREF_DEFS, GENDER_OPTIONS, GOAL_OPTIONS } from './auth.js';

export const CLIENT_NAV = [
  { path: 'inicio', label: 'Inicio', icon: 'home' },
  { path: 'perfil', label: 'Mi perfil', icon: 'user' },
  { path: 'objetivos', label: 'Mis objetivos', icon: 'target' },
  { path: 'rutinas', label: 'Rutinas', icon: 'dumbbell' },
  { path: 'progreso', label: 'Progreso físico', icon: 'chart', premium: true },
  { path: 'mediciones', label: 'Mediciones', icon: 'ruler' },
  { path: 'nutricion', label: 'Nutrición', icon: 'apple', premium: true },
  { path: 'calendario', label: 'Calendario', icon: 'calendar', premium: true },
  { path: 'configuracion', label: 'Configuración', icon: 'settings' },
  { sep: true },
  { action: 'logout', label: 'Cerrar sesión', icon: 'logout' },
];

const page = (...kids) => h('div', { class: 'page' }, ...kids);
const head = (title, sub, action) => h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), action || null);
const cardHead = (title, right) => h('div', { class: 'card-head' }, h('h3', {}, title), right || null);
const locked = (title, text, compact) => lockedCard({ title, text, settings: S.settings, compact });
const pad = (n) => String(n).padStart(2, '0');

// ================================================================== sesión de entrenamiento (reutilizable)
export function sessionModal({ routine_id, routine_name, day_index, day, date }, onDone) {
  const start = Date.now();
  const timer = h('div', { class: 'session-timer' }, '00:00');
  let touched = false;
  const dur = h('input', { class: 'input', type: 'number', min: 1, max: 360, value: 1, oninput: () => { touched = true; } });
  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    timer.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    if (!touched) dur.value = Math.max(1, Math.round(s / 60));
  }, 1000);
  const done = new Set();
  const total = day.exercises.length;
  const counter = h('span', { class: 'badge dark' }, `0 / ${total}`);
  const list = day.exercises.map((e, i) => h('label', { class: 'ex-line check', style: { cursor: 'pointer' } },
    h('input', { type: 'checkbox', onchange: (ev) => { ev.target.checked ? done.add(i) : done.delete(i); counter.textContent = `${done.size} / ${total}`; } }),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 500 } }, e.name), h('div', { class: 'meta' }, [e.muscle, e.rest ? `descanso ${e.rest}` : '', e.notes].filter(Boolean).join(' · '))),
    h('span', { class: 'sr-pill' }, `${e.sets} × ${e.reps}`)));
  modal({
    title: day.name, size: 'lg', onClose: () => clearInterval(tick),
    body: h('div', { class: 'stack' },
      h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'eyebrow' }, routine_name), timer), counter),
      h('div', {}, list),
      day.notes ? h('p', { class: 'small muted' }, day.notes) : null,
      h('div', { style: { maxWidth: '220px' } }, simpleField('Duración total (min)', dur))),
    actions: [
      { label: 'Seguir después', kind: 'secondary' },
      { label: 'Finalizar entrenamiento', onClick: async () => {
        const minutes = Math.round(Number(dur.value));
        if (!(minutes >= 1 && minutes <= 360)) throw new Error('Escribe una duración válida (1 a 360 min)');
        await post('/me/logs', { routine_id, day_index, duration_min: minutes, date: date || todayISO() });
        toast('¡Entrenamiento registrado!');
        onDone?.();
        return true;
      } },
    ],
  });
}

// ================================================================== INICIO
async function inicio() {
  const d = await get(`/me/dashboard?date=${todayISO()}`);
  const ind = d.indicators, dl = ind.delta || {};
  const delta = (v, unit) => (v == null || v === 0 ? 'Sin cambios aún' : h('span', {}, h('b', {}, `${v > 0 ? '+' : '−'}${fmtNum(Math.abs(v))} ${unit}`), ' desde el inicio'));
  const bmi = ind.bmi;
  const kpis = h('div', { class: 'grid c5' },
    kpi('Peso actual', ind.weight, 'kg', delta(dl.weight, 'kg')),
    kpi('Altura', ind.height, 'cm', 'Tu punto de referencia'),
    kpi('Grasa corporal', ind.body_fat, '%', ind.body_fat == null ? 'Agrégala en Mediciones' : delta(dl.body_fat, '%')),
    kpi('Masa muscular', ind.muscle_mass, 'kg', ind.muscle_mass == null ? 'Agrégala en Mediciones' : delta(dl.muscle_mass, 'kg')),
    kpi('IMC', bmi, '', bmiLabel(bmi)));

  // Rutina del día
  const todayCard = h('div', { class: 'card' });
  if (d.today) {
    const doneToday = d.done_today.some((l) => l.routine_id === d.today.routine_id && l.day_index === d.today.day_index);
    mount(todayCard,
      cardHead('Rutina de hoy', doneToday ? h('span', { class: 'badge premium' }, 'Completada') : h('span', { class: 'badge' }, `${d.today.day.exercises.length} ejercicios`)),
      h('div', { class: 'eyebrow' }, d.today.routine_name),
      h('h2', { style: { margin: '6px 0 14px' } }, d.today.day.name),
      h('div', {}, d.today.day.exercises.slice(0, 6).map((e, i) => h('div', { class: 'ex-line' }, h('span', { class: 'n' }, i + 1), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 500 } }, e.name), h('div', { class: 'meta' }, e.muscle)), h('span', { class: 'sr-pill' }, `${e.sets} × ${e.reps}`)))),
      d.today.day.exercises.length > 6 ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, `y ${d.today.day.exercises.length - 6} ejercicios más`) : null,
      h('div', { class: 'row', style: { marginTop: '20px' } },
        h('button', { class: 'btn', onclick: () => sessionModal(d.today, () => route()) }, icon('play'), doneToday ? 'Repetir entrenamiento' : 'Comenzar entrenamiento'),
        h('a', { class: 'btn ghost', href: '#/rutinas' }, 'Ver rutina')));
  } else if (d.routines_count) {
    mount(todayCard, cardHead('Rutina de hoy', h('span', { class: 'badge' }, 'Descanso')),
      h('h2', {}, 'Hoy toca recuperar'),
      h('p', { class: 'muted', style: { marginTop: '8px' } }, d.next ? `Tu próxima sesión: ${DAYS_FULL[d.next.weekday - 1]} · ${d.next.day_name}.` : 'Tu rutina no tiene días fijos: entra a Rutinas y entrena cuando quieras.'),
      h('a', { class: 'btn secondary', style: { marginTop: '18px' }, href: '#/rutinas' }, 'Ver mis rutinas'));
  } else {
    mount(todayCard, cardHead('Rutina de hoy'), emptyState('Tu rutina está en camino', 'Tu entrenador revisará tu perfil y te asignará tu plan. Te avisaremos aquí mismo.'));
  }

  const a = d.activity;
  const activity = h('div', { class: 'card' },
    cardHead('Actividad', h('span', { class: 'badge', title: 'Días seguidos entrenando' }, icon('flame'), `Racha ${a.streak} ${a.streak === 1 ? 'día' : 'días'}`)),
    h('div', { class: 'week' }, a.week.map((w) => h('div', { class: `d ${w.trained ? 'on' : ''} ${w.today ? 'today' : ''}` }, h('i'), DAYS_SHORT[w.weekday - 1]))),
    h('div', { class: 'stat-row', style: { marginTop: '22px' } },
      h('div', { class: 'stat' }, h('b', {}, a.completed_total), h('span', {}, 'Entrenamientos')),
      h('div', { class: 'stat' }, h('b', {}, fmtMin(a.week_minutes)), h('span', {}, 'Esta semana')),
      h('div', { class: 'stat' }, h('b', {}, `${a.week_sessions}/${a.planned_per_week || '—'}`), h('span', {}, 'Sesiones semana'))));

  // Objetivos
  const goalsCard = h('div', { class: 'card' },
    cardHead('Cumplimiento de objetivos', h('a', { class: 'link small', href: '#/objetivos' }, 'Administrar')),
    d.goals_total ? h('div', { class: 'row', style: { gap: '24px' } }, ring(d.goals_average), h('div', { class: 'grow stack sm' }, h('b', { style: { fontSize: '18px' } }, `${d.goals_done} de ${d.goals_total} cumplidos`), h('p', { class: 'small muted' }, 'El avance de tus metas numéricas se calcula solo con tus mediciones.')))
      : emptyState('Sin objetivos todavía', 'Define qué quieres lograr.', h('a', { class: 'btn sm', href: '#/objetivos' }, 'Agregar objetivo')));

  let progress;
  if (d.series) {
    progress = h('div', { class: 'grid c2' },
      h('div', { class: 'card' }, cardHead('Evolución del peso', h('span', { class: 'tiny muted' }, 'kg')), lineChart(d.series.weight, { unit: ' kg' })),
      h('div', { class: 'card' }, cardHead('Grasa corporal', h('span', { class: 'tiny muted' }, '%')), lineChart(d.series.body_fat, { unit: ' %' })));
  } else {
    progress = locked('Gráficas y fotos de progreso', 'Con Premium ves tu evolución de peso y grasa, el historial completo de mediciones y tus fotos de progreso.');
  }

  const photos = d.photos?.length ? h('div', { class: 'card' }, cardHead('Fotografías de progreso', h('a', { class: 'link small', href: '#/progreso' }, 'Ver todas')),
    h('div', { class: 'photo-grid' }, d.photos.map((p) => h('figure', {}, h('img', { src: p.url, alt: `Foto del ${fmtDate(p.date)}`, onclick: () => lightbox(p.url) }), h('figcaption', {}, fmtDate(p.date)))))) : null;

  const route = () => { window.dispatchEvent(new HashChangeEvent('hashchange')); };
  return page(
    head(`Hola, ${S.user.first_name}`, 'Este es tu resumen de hoy.'),
    h('div', { class: 'stack lg' }, kpis, h('div', { class: 'grid split' }, todayCard, activity), progress, h('div', { class: d.photos?.length ? 'grid c2' : '' }, goalsCard, photos)));
}
function kpi(label, value, unit, sub) {
  return h('div', { class: 'kpi' }, h('div', { class: 'eyebrow' }, label), h('div', { class: 'v' }, value == null ? '—' : fmtNum(value), value != null && unit ? h('small', {}, unit) : null), h('div', { class: 'd' }, sub));
}

// ================================================================== PERFIL
async function perfil({ refreshShell }) {
  await refreshShell?.();
  const u = S.user, p = S.profile;
  const personal = { first_name: u.first_name, last_name: u.last_name, birth_date: u.birth_date, phone: u.phone || '' };
  const prefs = { ...p, injuries: p.injuries || '', training_type: p.training_type || '', gender: p.gender || '' };

  // Foto
  const photoBox = h('div', { class: 'card' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  const camIn = h('input', { type: 'file', accept: 'image/*', capture: 'user', class: 'hidden' });
  const upload = async (file) => {
    try { const data = await fileToDataUrl(file, 900, 0.82); await post('/me/photo', { data }); await refreshShell(); toast('Foto actualizada'); drawPhoto(); }
    catch (e) { toast(e.message, 'error'); }
  };
  fileIn.addEventListener('change', () => fileIn.files[0] && upload(fileIn.files[0]));
  camIn.addEventListener('change', () => camIn.files[0] && upload(camIn.files[0]));
  const drawPhoto = () => mount(photoBox,
    cardHead('Fotografía de perfil'),
    h('div', { class: 'row wrap', style: { gap: '24px' } }, avatar(S.user, 'lg'),
      h('div', { class: 'stack sm' },
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn secondary sm', onclick: () => fileIn.click() }, icon('upload'), 'Subir foto'),
          h('button', { class: 'btn secondary sm', onclick: () => camIn.click() }, icon('camera'), 'Tomar foto'),
          S.user.photo ? h('button', { class: 'btn danger sm', onclick: async () => { await del('/me/photo'); await refreshShell(); drawPhoto(); toast('Foto eliminada'); } }, icon('trash'), 'Eliminar') : null),
        h('div', { class: 'row wrap', style: { gap: '8px' } }, h('span', { class: 'tiny muted' }, 'Avatar:'), AVATAR_KEYS.map((k) => h('button', { class: 'icon-btn', style: { width: '36px', height: '36px', padding: 0, borderColor: !S.user.photo && S.user.avatar === k ? 'var(--gold)' : '' }, 'aria-label': `Avatar ${k}`, onclick: async () => { if (S.user.photo) await del('/me/photo'); await put('/me', { avatar: k }); await refreshShell(); drawPhoto(); } }, h('span', { class: 'avatar sm' }, avatarSvg(k)))))),
      fileIn, camIn));
  drawPhoto();

  // Datos personales
  const pDefs = [
    { key: 'first_name', label: 'Nombre', req: true, max: 60 }, { key: 'last_name', label: 'Apellidos', req: true, max: 80 },
    { key: 'birth_date', label: 'Fecha de nacimiento', type: 'date', req: true }, { key: 'phone', label: 'Teléfono', type: 'tel', max: 30 },
  ];
  const pf = form(pDefs, personal);
  const personalCard = h('div', { class: 'card' }, cardHead('Datos personales'), pf,
    h('p', { class: 'small muted', style: { margin: '14px 0' } }, `Correo de acceso: ${u.email}`),
    h('button', { class: 'btn', onclick: async () => {
      const errs = validate(pDefs, personal); pf.showErrors(errs);
      if (Object.keys(errs).length) return;
      try { await put('/me', personal); await refreshShell(); toast('Datos guardados'); } catch (e) { toast(e.message, 'error'); }
    } }, 'Guardar cambios'));

  // Información física (la altura se edita aquí; el resto vive en Mediciones)
  const physDefs = [
    { key: 'height_cm', label: 'Altura', type: 'number', unit: 'cm', req: true, min: 100, max: 250 },
    { key: 'gender', label: 'Género (opcional)', type: 'select', options: GENDER_OPTIONS },
  ];
  const phf = form(physDefs, prefs);
  const bmiNow = p.bmi;
  const physCard = h('div', { class: 'card' }, cardHead('Información física', h('a', { class: 'link small', href: '#/mediciones' }, 'Registrar medición')),
    h('div', { class: 'grid c3', style: { marginBottom: '18px' } },
      kpi('Peso', p.weight_kg, 'kg'), kpi('Grasa', p.body_fat, '%'), kpi('IMC', bmiNow, '', bmiLabel(bmiNow))),
    phf,
    h('p', { class: 'small muted', style: { margin: '14px 0' } }, 'Tu peso, grasa y medidas se actualizan al registrar una medición, para conservar tu historial.'),
    h('button', { class: 'btn', onclick: async () => {
      const errs = validate(physDefs, prefs); phf.showErrors(errs);
      if (Object.keys(errs).length) return;
      try { await put('/me', { profile: { height_cm: prefs.height_cm, gender: prefs.gender || null } }); await refreshShell(); toast('Información guardada'); } catch (e) { toast(e.message, 'error'); }
    } }, 'Guardar'));

  // Preferencias
  const prf = form(PREF_DEFS, prefs);
  const prefCard = h('div', { class: 'card' }, cardHead('Experiencia y preferencias'), prf,
    h('button', { class: 'btn', style: { marginTop: '20px' }, onclick: async () => {
      const errs = validate(PREF_DEFS, prefs); prf.showErrors(errs);
      if (Object.keys(errs).length) return;
      try {
        await put('/me', { profile: { level: prefs.level, freq: Number(prefs.freq), days: prefs.days, duration: Number(prefs.duration), place: prefs.place, training_type: prefs.training_type || null, injuries: prefs.injuries || null } });
        await refreshShell(); toast('Preferencias guardadas');
      } catch (e) { toast(e.message, 'error'); }
    } }, 'Guardar preferencias'));

  return page(head('Mi perfil', 'Mantén tu información al día para que tu entrenador te acompañe mejor.'), h('div', { class: 'stack lg' }, photoBox, personalCard, physCard, prefCard));
}

// ================================================================== OBJETIVOS
async function objetivos() {
  const box = h('div', { class: 'stack lg' });
  const load = async () => {
    const d = await get('/me/goals');
    const addBtn = h('button', { class: 'btn', onclick: () => addGoal(load) }, icon('plus'), 'Nuevo objetivo');
    mount(box,
      h('div', { class: 'card' }, h('div', { class: 'row wrap', style: { gap: '28px' } }, ring(d.average, 120),
        h('div', { class: 'grow stack sm' }, h('h3', {}, 'Cumplimiento general'), h('p', { class: 'muted' }, d.items.length ? `${d.items.filter((g) => g.pct >= 100).length} de ${d.items.length} objetivos cumplidos.` : 'Aún no tienes objetivos.')))),
      d.items.length ? h('div', { class: 'grid c2' }, d.items.map((g) => goalCard(g, load))) : emptyState('Define tu primer objetivo', 'Elige qué quieres lograr y mide tu avance.', addBtn),
      d.items.length ? h('div', {}, addBtn) : null);
  };
  await load();
  return page(head('Mis objetivos', 'Lo que buscas lograr y cuánto llevas.'), box);
}
function goalCard(g, reload) {
  const unit = { weight: 'kg', body_fat: '%', muscle_mass: 'kg', waist: 'cm' }[g.metric];
  const slider = h('input', { type: 'range', min: 0, max: 100, step: 5, value: g.progress, 'aria-label': 'Avance manual', style: { width: '100%', accentColor: '#151B1F' } });
  const val = h('span', { class: 'small muted' }, `${g.progress}%`);
  slider.addEventListener('input', () => { val.textContent = `${slider.value}%`; });
  slider.addEventListener('change', async () => { try { await put(`/me/goals/${g.id}`, { progress: Number(slider.value) }); reload(); } catch (e) { toast(e.message, 'error'); } });
  const auto = g.metric && g.target_value != null;
  return h('div', { class: 'card' },
    h('div', { class: 'row between', style: { alignItems: 'flex-start' } },
      h('div', { class: 'stack sm' }, h('h3', {}, g.title), g.pct >= 100 ? h('span', { class: 'badge premium' }, 'Cumplido') : null),
      h('div', { class: 'row', style: { gap: '4px' } },
        h('button', { class: 'icon-btn', 'aria-label': 'Eliminar objetivo', onclick: async () => { if (await confirmDialog('Eliminar objetivo', `¿Quitar “${g.title}”?`, 'Eliminar', true)) { await del(`/me/goals/${g.id}`); reload(); } } }, icon('trash')))),
    h('div', { style: { margin: '16px 0 10px' } }, progressBar(g.pct, true)),
    h('div', { class: 'row between small' }, h('b', {}, `${g.pct}%`), auto ? h('span', { class: 'muted' }, `Meta: ${fmtNum(g.target_value)} ${unit} · inicio ${fmtNum(g.start_value)} ${unit}`) : null),
    !auto ? h('div', { style: { marginTop: '14px' } }, h('div', { class: 'row between tiny muted' }, 'Avance manual', val), slider) : null,
    h('div', { class: 'row wrap', style: { marginTop: '16px' } },
      g.metric ? h('button', { class: 'btn secondary sm', onclick: () => setTarget(g, unit, reload) }, auto ? 'Cambiar meta numérica' : 'Fijar meta numérica') : null,
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: g.done, onchange: async (e) => { await put(`/me/goals/${g.id}`, { done: e.target.checked }); reload(); } }), 'Marcar como cumplido')));
}
function setTarget(g, unit, reload) {
  const st = { v: g.target_value ?? '' };
  const f = field({ key: 'v', label: `Meta (${unit})`, type: 'number', unit, min: 1, max: 400 }, st);
  modal({ title: g.title, body: h('div', { class: 'stack' }, f, h('p', { class: 'small muted' }, 'Tomamos tu medida actual como punto de partida y calculamos el avance con cada medición nueva.')),
    actions: [{ label: 'Cancelar', kind: 'secondary' }, ...(g.target_value != null ? [{ label: 'Quitar meta', kind: 'danger', onClick: async () => { await put(`/me/goals/${g.id}`, { target_value: null }); reload(); return true; } }] : []),
      { label: 'Guardar', onClick: async () => { await put(`/me/goals/${g.id}`, { target_value: st.v === '' ? null : Number(st.v) }); reload(); return true; } }] });
}
function addGoal(reload) {
  const st = { kind: 'lose_weight', title: '', target: '' };
  const opts = [...GOAL_OPTIONS, { value: 'custom', label: 'Meta personalizada' }];
  const body = h('div', { class: 'stack' });
  const draw = () => {
    const metric = ['lose_weight', 'reduce_fat', 'gain_muscle'].includes(st.kind);
    mount(body,
      field({ key: 'kind', label: 'Tipo de objetivo', type: 'select', options: opts }, st, { onChange: () => draw() }),
      st.kind === 'custom' ? field({ key: 'title', label: 'Describe tu meta', req: true, max: 200 }, st) : null,
      metric ? field({ key: 'target', label: `Meta numérica (opcional, ${st.kind === 'reduce_fat' ? '%' : 'kg'})`, type: 'number', min: 1, max: 400, hint: 'Si la defines, el avance se calcula automáticamente con tus mediciones.' }, st) : null);
  };
  draw();
  modal({ title: 'Nuevo objetivo', body, actions: [{ label: 'Cancelar', kind: 'secondary' }, { label: 'Agregar', onClick: async () => {
    if (st.kind === 'custom' && !st.title.trim()) throw new Error('Describe tu meta');
    await post('/me/goals', { kind: st.kind, title: st.kind === 'custom' ? st.title : undefined, target_value: st.target === '' ? undefined : Number(st.target) });
    reload(); toast('Objetivo agregado'); return true;
  } }] });
}

// ================================================================== RUTINAS
async function rutinas({ args }) {
  const d = await get('/me/routines');
  const items = d.items;
  if (args[0]) {
    const r = items.find((x) => String(x.id) === args[0]);
    if (r) return routineDetail(r, d.access);
  }
  const free = !d.access.premium;
  return page(
    head('Rutinas', 'Tu plan de entrenamiento, diseñado por tu entrenador.'),
    items.length ? h('div', { class: 'grid c-auto' }, items.map((r) => h('div', { class: 'card routine-card', tabindex: 0, role: 'link', onclick: () => { location.hash = `#/rutinas/${r.id}`; }, onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/rutinas/${r.id}`; } },
      h('div', { class: 'row between' }, h('span', { class: 'eyebrow' }, r.goal || 'Rutina'), r.tier === 'free' ? h('span', { class: 'badge' }, 'Básica') : h('span', { class: 'badge premium' }, 'Premium')),
      h('h2', {}, r.name), r.description ? h('p', { class: 'muted small' }, r.description) : null,
      h('div', { class: 'row wrap' }, h('span', { class: 'badge' }, `${r.days.length} días`), r.level ? h('span', { class: 'badge' }, r.level) : null),
      h('div', { class: 'row', style: { color: 'var(--gold)', fontWeight: 500, fontSize: '14px' } }, 'Ver rutina', icon('chevR')))))
      : h('div', { class: 'card' }, emptyState('Aún no tienes rutina asignada', 'Tu entrenador revisará tu perfil y te asignará tu plan. Te avisaremos con una notificación.')),
    free ? h('div', { style: { marginTop: '28px' } }, locked(d.access.expired ? 'Tu plan Premium venció' : 'Desbloquea todas tus rutinas', d.access.expired ? 'Renueva con tu entrenador para recuperar tus rutinas completas, nutrición y seguimiento.' : 'Tu plan gratuito incluye una rutina básica. Con Premium recibes planes completos, nutrición y seguimiento de progreso.', true)) : null);
}
function routineDetail(r) {
  let di = 0;
  const wd = new Date().getDay() === 0 ? 7 : new Date().getDay();
  const t = r.days.findIndex((d) => (d.weekdays || []).includes(wd));
  if (t >= 0) di = t;
  const body = h('div', { class: 'stack' });
  const draw = () => {
    const day = r.days[di];
    mount(body,
      h('div', { class: 'pills', role: 'tablist' }, r.days.map((d, i) => h('button', { class: 'pill', role: 'tab', 'aria-pressed': String(i === di), onclick: () => { di = i; draw(); } }, (d.weekdays || []).length ? `${d.weekdays.map((w) => DAYS_FULL[w - 1].slice(0, 3)).join(' y ')} · ${d.name}` : d.name))),
      h('div', { class: 'card' },
        h('div', { class: 'row between wrap', style: { marginBottom: '8px' } }, h('div', {}, h('div', { class: 'eyebrow' }, (day.weekdays || []).length ? day.weekdays.map((w) => DAYS_FULL[w - 1]).join(' y ') : `Día ${di + 1}`), h('h2', { style: { marginTop: '4px' } }, day.name)),
          h('button', { class: 'btn', onclick: () => sessionModal({ routine_id: r.id, routine_name: r.name, day_index: di, day }) }, icon('play'), 'Iniciar entrenamiento')),
        day.notes ? h('p', { class: 'muted small' }, day.notes) : null,
        h('div', {}, day.exercises.map((e, i) => h('details', { class: 'ex-line', style: { display: 'block' } },
          h('summary', { style: { display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', listStyle: 'none' } },
            h('span', { class: 'n' }, i + 1), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 500 } }, e.name), h('div', { class: 'meta' }, [e.muscle, e.equipment, e.rest ? `descanso ${e.rest}` : ''].filter(Boolean).join(' · '))), h('span', { class: 'sr-pill' }, `${e.sets} × ${e.reps}`)),
          h('div', { style: { padding: '12px 0 4px 42px' }, class: 'small muted stack sm' }, e.description ? h('p', {}, e.description) : null, e.notes ? h('p', {}, h('b', { style: { color: 'var(--ink)' } }, 'Indicación: '), e.notes) : null,
            e.video_url ? h('a', { class: 'link', href: e.video_url, target: '_blank', rel: 'noopener noreferrer' }, 'Ver video del ejercicio') : null))))));
  };
  draw();
  return page(h('a', { class: 'btn ghost sm', href: '#/rutinas', style: { marginBottom: '8px', marginLeft: '-12px' } }, icon('chevL'), 'Rutinas'), head(r.name, r.description), body);
}

// ================================================================== PROGRESO (Premium)
async function progreso() {
  if (!isPremium()) return page(head('Progreso físico'), locked('Seguimiento de progreso', 'Gráficas de peso, grasa, masa muscular y cintura, comparativo desde tu inicio y fotos de progreso.'));
  const [pr, ph] = await Promise.all([get('/me/progress'), get('/me/photos')]);
  const photosBox = h('div', {});
  const drawPhotos = (items) => mount(photosBox,
    h('div', { class: 'card' }, cardHead('Fotografías de progreso', h('button', { class: 'btn sm', onclick: () => addPhoto(async () => drawPhotos((await get('/me/photos')).items)) }, icon('camera'), 'Agregar foto')),
      items.length ? h('div', { class: 'photo-grid' }, items.map((p) => h('figure', {}, h('img', { src: p.url, alt: `Foto del ${fmtDate(p.date)}`, loading: 'lazy', onclick: () => lightbox(p.url) }),
        h('figcaption', {}, fmtDate(p.date), p.note ? ` · ${p.note}` : ''),
        h('button', { class: 'icon-btn x', 'aria-label': 'Eliminar foto', onclick: async () => { if (await confirmDialog('Eliminar foto', 'Esta acción no se puede deshacer.', 'Eliminar', true)) { await del(`/me/photos/${p.id}`); drawPhotos((await get('/me/photos')).items); } } }, icon('trash')))))
        : emptyState('Sin fotos todavía', 'Una foto cada 2–4 semanas, con la misma luz y pose, te ayuda a ver cambios que la báscula no muestra.')));
  drawPhotos(ph.items);
  const f = pr.first, l = pr.last;
  const cmp = (k, unit) => (f && l && f[k] != null && l[k] != null ? `${fmtNum(f[k])} → ${fmtNum(l[k])} ${unit}` : '—');
  return page(head('Progreso físico', 'Tu evolución, medición a medición.'), h('div', { class: 'stack lg' },
    h('div', { class: 'grid c2' },
      h('div', { class: 'card' }, cardHead('Peso', h('span', { class: 'tiny muted' }, 'kg')), lineChart(pr.series.weight, { unit: ' kg' })),
      h('div', { class: 'card' }, cardHead('Grasa corporal', h('span', { class: 'tiny muted' }, '%')), lineChart(pr.series.body_fat, { unit: ' %' })),
      h('div', { class: 'card' }, cardHead('Masa muscular', h('span', { class: 'tiny muted' }, 'kg')), lineChart(pr.series.muscle_mass, { unit: ' kg' })),
      h('div', { class: 'card' }, cardHead('Cintura', h('span', { class: 'tiny muted' }, 'cm')), lineChart(pr.series.waist, { unit: ' cm' }))),
    h('div', { class: 'grid c2' },
      h('div', { class: 'card' }, cardHead('Desde que empezaste'), h('dl', { class: 'kv' },
        h('dt', {}, 'Peso'), h('dd', {}, cmp('weight', 'kg')), h('dt', {}, 'Grasa corporal'), h('dd', {}, cmp('body_fat', '%')), h('dt', {}, 'Masa muscular'), h('dd', {}, cmp('muscle_mass', 'kg')), h('dt', {}, 'Cintura'), h('dd', {}, cmp('waist', 'cm')), h('dt', {}, 'Cadera'), h('dd', {}, cmp('hip', 'cm')))),
      h('div', { class: 'card' }, cardHead('Objetivos', h('a', { class: 'link small', href: '#/objetivos' }, 'Administrar')), h('div', { class: 'row', style: { gap: '24px' } }, ring(pr.goals_average, 110), h('div', { class: 'grow stack sm' }, pr.goals.slice(0, 4).map((g) => h('div', {}, h('div', { class: 'row between small' }, g.title, h('b', {}, `${g.pct}%`)), progressBar(g.pct, true))))))),
    photosBox));
}
function addPhoto(done) {
  const st = { date: todayISO(), note: '', data: null };
  const fi = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  const ci = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' });
  const prev = h('div', { class: 'photo-drop' }, h('p', { class: 'muted small' }, 'Elige o toma una foto'));
  const set = async (file) => { try { st.data = await fileToDataUrl(file, 1280, 0.82); mount(prev, h('img', { src: st.data, alt: 'Vista previa', style: { maxHeight: '240px', borderRadius: '12px' } })); } catch (e) { toast(e.message, 'error'); } };
  fi.addEventListener('change', () => fi.files[0] && set(fi.files[0])); ci.addEventListener('change', () => ci.files[0] && set(ci.files[0]));
  modal({ title: 'Nueva foto de progreso', body: h('div', { class: 'stack' }, prev,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn secondary sm', onclick: () => fi.click() }, icon('upload'), 'Subir'), h('button', { class: 'btn secondary sm', onclick: () => ci.click() }, icon('camera'), 'Cámara')),
    field({ key: 'date', label: 'Fecha', type: 'date' }, st), field({ key: 'note', label: 'Nota (opcional)', max: 200, placeholder: 'Frente, perfil, espalda…' }, st), fi, ci),
  actions: [{ label: 'Cancelar', kind: 'secondary' }, { label: 'Guardar foto', onClick: async () => { if (!st.data) throw new Error('Primero elige una foto'); await post('/me/photos', st); toast('Foto guardada'); await done(); return true; } }] });
}

// ================================================================== MEDICIONES
const MDEFS = [
  { key: 'date', label: 'Fecha', type: 'date', req: true },
  { key: 'weight', label: 'Peso', type: 'number', unit: 'kg', min: 25, max: 400 },
  { key: 'body_fat', label: 'Grasa corporal', type: 'number', unit: '%', min: 2, max: 70 },
  { key: 'muscle_mass', label: 'Masa muscular', type: 'number', unit: 'kg', min: 5, max: 150 },
  { key: 'waist', label: 'Cintura', type: 'number', unit: 'cm', min: 40, max: 250 },
  { key: 'hip', label: 'Cadera', type: 'number', unit: 'cm', min: 40, max: 250 },
  { key: 'notes', label: 'Notas (opcional)', max: 300, full: true },
];
const mNum = (v) => (v === '' || v == null ? null : Number(v));
async function mediciones({ refreshShell }) {
  const box = h('div', { class: 'stack lg' });
  const load = async () => {
    const d = await get('/me/measurements');
    const st = { date: todayISO() };
    const f = form(MDEFS, st);
    const btn = h('button', { class: 'btn', onclick: async () => {
      const errs = validate(MDEFS, st, (s) => (!['weight', 'body_fat', 'muscle_mass', 'waist', 'hip'].some((k) => s[k] !== '' && s[k] != null) ? { weight: 'Captura al menos una medida' } : {}));
      f.showErrors(errs); if (Object.keys(errs).length) return;
      try { await post('/me/measurements', { date: st.date, weight: mNum(st.weight), body_fat: mNum(st.body_fat), muscle_mass: mNum(st.muscle_mass), waist: mNum(st.waist), hip: mNum(st.hip), notes: st.notes || null }); toast('Medición registrada'); await refreshShell(); load(); }
      catch (e) { toast(e.message, 'error'); }
    } }, 'Guardar medición');
    mount(box,
      h('div', { class: 'card' }, cardHead('Nueva medición'), f, h('div', { style: { marginTop: '20px' } }, btn)),
      h('div', {}, cardHead('Historial', h('span', { class: 'tiny muted' }, `${d.total} ${d.total === 1 ? 'registro' : 'registros'}`)),
        d.items.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Fecha', 'Peso', 'Grasa', 'Músculo', 'Cintura', 'Cadera', 'IMC', 'Notas', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.items.map((m) => h('tr', {}, h('td', {}, fmtDate(m.date)), h('td', {}, m.weight != null ? `${fmtNum(m.weight)} kg` : '—'), h('td', {}, m.body_fat != null ? `${fmtNum(m.body_fat)} %` : '—'), h('td', {}, m.muscle_mass != null ? `${fmtNum(m.muscle_mass)} kg` : '—'), h('td', {}, m.waist != null ? `${fmtNum(m.waist)} cm` : '—'), h('td', {}, m.hip != null ? `${fmtNum(m.hip)} cm` : '—'), h('td', {}, m.bmi ?? '—'), h('td', { class: 'muted small' }, m.notes || ''),
            h('td', { style: { whiteSpace: 'nowrap' } }, h('button', { class: 'icon-btn', 'aria-label': 'Editar', onclick: () => editMeasurement(m, async () => { await refreshShell(); load(); }) }, icon('edit')), h('button', { class: 'icon-btn', 'aria-label': 'Eliminar', onclick: async () => { if (await confirmDialog('Eliminar medición', 'Se quitará del historial.', 'Eliminar', true)) { await del(`/me/measurements/${m.id}`); await refreshShell(); load(); } } }, icon('trash')))))))) : emptyState('Sin mediciones', 'Registra tu primera medición arriba.'),
        d.limited ? h('div', { style: { marginTop: '16px' } }, locked('Historial completo', `Tu plan gratuito muestra tus últimas 3 mediciones (tienes ${d.total}). Con Premium ves todo el historial y tus gráficas.`, true)) : null));
  };
  await load();
  return page(head('Mediciones', 'Registra tu peso y medidas con regularidad (cada 1–2 semanas).'), box);
}
function editMeasurement(m, done) {
  const st = { ...m, notes: m.notes || '' };
  const f = form(MDEFS, st);
  modal({ title: 'Editar medición', body: f, actions: [{ label: 'Cancelar', kind: 'secondary' }, { label: 'Guardar', onClick: async () => {
    const errs = validate(MDEFS, st); f.showErrors(errs); if (Object.keys(errs).length) return false;
    await put(`/me/measurements/${m.id}`, { date: st.date, weight: mNum(st.weight), body_fat: mNum(st.body_fat), muscle_mass: mNum(st.muscle_mass), waist: mNum(st.waist), hip: mNum(st.hip), notes: st.notes || null });
    toast('Medición actualizada'); await done(); return true;
  } }] });
}

// ================================================================== NUTRICIÓN (Premium)
async function nutricion() {
  if (!isPremium()) return page(head('Nutrición'), locked('Plan de nutrición personalizado', 'Tu entrenador te asigna un plan con calorías, macros y comidas del día.'));
  const { diet } = await get('/me/diet');
  if (!diet) return page(head('Nutrición'), h('div', { class: 'card' }, emptyState('Aún no tienes plan alimenticio', 'Tu entrenador te asignará uno pronto y te avisaremos aquí.')));
  const kcal = diet.calories || 0;
  const macro = (label, g, k) => h('div', { class: 'macro' }, h('div', { class: 'top' }, h('span', { class: 'muted' }, label), h('b', {}, `${g ?? 0} g`)), progressBar(kcal ? Math.min(100, ((g || 0) * k * 100) / kcal) : 0, label === 'Proteína'), h('span', { class: 'tiny muted' }, kcal ? `${Math.round(((g || 0) * k * 100) / kcal)}% de las calorías` : ''));
  return page(head(diet.name, diet.description), h('div', { class: 'stack lg' },
    h('div', { class: 'grid c2' },
      h('div', { class: 'card pearl' }, h('div', { class: 'eyebrow' }, 'Calorías diarias'), h('div', { style: { fontSize: '44px', fontWeight: 600, letterSpacing: '-.04em', margin: '8px 0 4px' } }, kcal ? fmtNum(kcal, 0) : '—', h('small', { class: 'muted', style: { fontSize: '16px', marginLeft: '6px', letterSpacing: 0 } }, 'kcal')),
        diet.coach_notes ? h('div', { style: { marginTop: '18px' } }, h('div', { class: 'eyebrow' }, 'Indicaciones de tu entrenador'), h('p', { style: { marginTop: '6px' } }, diet.coach_notes)) : null),
      h('div', { class: 'card stack' }, cardHead('Macronutrientes'), macro('Proteína', diet.protein, 4), macro('Carbohidratos', diet.carbs, 4), macro('Grasas', diet.fat, 9))),
    h('div', { class: 'card' }, cardHead('Comidas del día'), diet.meals.map((m) => h('div', { class: 'meal' }, h('div', { class: 't' }, m.time || '—'), h('div', {}, h('h4', {}, m.name), m.items.length ? h('ul', {}, m.items.map((i) => h('li', {}, i))) : null, m.notes ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, m.notes) : null))))));
}

// ================================================================== CALENDARIO (Premium)
async function calendario() {
  if (!isPremium()) return page(head('Calendario'), locked('Calendario de entrenamientos', 'Visualiza tus sesiones programadas y las que ya completaste mes a mes.'));
  const rt = await get('/me/routines');
  const now = new Date();
  let year = now.getFullYear(), month = now.getMonth(), sel = todayISO();
  const box = h('div', { class: 'stack lg' });
  const draw = async () => {
    const first = new Date(year, month, 1), lead = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - lead), cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const logs = await get(`/me/logs?from=${isoOf(cells[0])}&to=${isoOf(cells[41])}`);
    const byDate = {}; logs.items.forEach((l) => (byDate[l.date] ||= []).push(l));
    const sched = (date) => { const wd = date.getDay() === 0 ? 7 : date.getDay(); const out = []; rt.items.forEach((r) => r.days.forEach((d, i) => { if ((d.weekdays || []).includes(wd)) out.push({ r, d, i }); })); return out; };
    const today = todayISO();
    const grid = h('div', { class: 'cal' }, DAYS_SHORT.map((d) => h('div', { class: 'h' }, d)), cells.map((c) => {
      const iso = isoOf(c), done = byDate[iso] || [], sc = sched(c);
      return h('button', { class: `c ${c.getMonth() !== month ? 'out' : ''} ${iso === today ? 'today' : ''} ${iso === sel ? 'sel' : ''}`, 'aria-label': fmtDateLong(iso), onclick: () => { sel = iso; draw(); } },
        h('span', { class: 'num' }, c.getDate()), done.length ? h('span', { class: 'tag done' }, `✓ ${done[0].day_name.split('—')[0].trim()}`) : (iso >= today && sc.length ? h('span', { class: 'tag' }, sc[0].d.name.split('—')[0].trim()) : null));
    }));
    const selDate = parseISO(sel), selDone = byDate[sel] || [], selSched = sched(selDate);
    mount(box,
      h('div', { class: 'card' },
        h('div', { class: 'row between', style: { marginBottom: '16px' } }, h('h3', {}, `${MONTHS_ES[month][0].toUpperCase()}${MONTHS_ES[month].slice(1)} ${year}`),
          h('div', { class: 'row', style: { gap: '4px' } }, h('button', { class: 'icon-btn', 'aria-label': 'Mes anterior', onclick: () => { month--; if (month < 0) { month = 11; year--; } draw(); } }, icon('chevL')), h('button', { class: 'btn secondary sm', onclick: () => { year = now.getFullYear(); month = now.getMonth(); sel = today; draw(); } }, 'Hoy'), h('button', { class: 'icon-btn', 'aria-label': 'Mes siguiente', onclick: () => { month++; if (month > 11) { month = 0; year++; } draw(); } }, icon('chevR')))), grid),
      h('div', { class: 'card' }, cardHead(fmtDateLong(sel)),
        selDone.length ? h('div', { class: 'stack sm', style: { marginBottom: '14px' } }, selDone.map((l) => h('div', { class: 'row between' }, h('div', {}, h('b', {}, l.day_name), h('div', { class: 'small muted' }, `${l.routine_name} · ${fmtMin(l.duration_min)}`)), h('div', { class: 'row' }, h('span', { class: 'badge premium' }, 'Completado'), h('button', { class: 'icon-btn', 'aria-label': 'Quitar registro', onclick: async () => { if (await confirmDialog('Quitar registro', 'Se descontará de tu racha y tus estadísticas.', 'Quitar', true)) { await del(`/me/logs/${l.id}`); draw(); } } }, icon('trash')))))) : null,
        selSched.length ? h('div', { class: 'stack sm' }, selSched.map(({ r, d, i }) => h('div', { class: 'row between' }, h('div', {}, h('b', {}, d.name), h('div', { class: 'small muted' }, `${r.name} · ${d.exercises.length} ejercicios`)), sel <= today ? h('button', { class: 'btn secondary sm', onclick: () => sessionModal({ routine_id: r.id, routine_name: r.name, day_index: i, day: d, date: sel }, draw) }, sel === today ? 'Entrenar' : 'Registrar') : h('span', { class: 'badge' }, 'Programado')))) : (!selDone.length ? h('p', { class: 'muted' }, 'Sin sesiones programadas este día.') : null)));
  };
  await draw();
  return page(head('Calendario', 'Tus sesiones programadas y completadas.'), box);
}

// ================================================================== CONFIGURACIÓN
async function configuracion() {
  const st = { current: '', password: '', password2: '' };
  const defs = [
    { key: 'current', label: 'Contraseña actual', type: 'password', req: true, autocomplete: 'current-password', full: true },
    { key: 'password', label: 'Nueva contraseña', type: 'password', req: true, strong: true, autocomplete: 'new-password', hint: 'Mínimo 8 caracteres, con letras y números.' },
    { key: 'password2', label: 'Confirmar nueva contraseña', type: 'password', req: true, autocomplete: 'new-password' },
  ];
  const f = form(defs, st);
  const acc = S.access, u = S.user, wa = waLink(S.settings.whatsapp);
  return page(head('Configuración', 'Tu cuenta y tu plan.'), h('div', { class: 'stack lg' },
    h('div', { class: 'card' }, cardHead('Mi plan', u.premium ? h('span', { class: 'badge premium' }, 'Premium') : h('span', { class: 'badge' }, 'Gratis')),
      u.premium ? h('p', {}, u.plan_until ? `Tu plan Premium está activo hasta el ${fmtDate(u.plan_until)}.` : 'Tu plan Premium está activo.')
        : h('div', { class: 'stack sm' }, h('p', {}, acc.expired ? 'Tu plan Premium venció. Conservas tu cuenta y tu rutina básica.' : 'Estás en el plan gratuito: rutina básica, perfil, objetivos y mediciones.'),
          S.settings.premium_price ? h('p', { class: 'small muted' }, `Premium: ${S.settings.premium_price}`) : null,
          wa ? h('a', { class: 'btn sm', style: { alignSelf: 'flex-start' }, href: waLink(S.settings.whatsapp, 'Hola, quiero activar mi plan Premium en GYMTRACK'), target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'Activar Premium') : null)),
    h('div', { class: 'card' }, cardHead('Cambiar contraseña'), f, h('button', { class: 'btn', style: { marginTop: '20px' }, onclick: async () => {
      const errs = validate(defs, st, (s) => (s.password !== s.password2 ? { password2: 'Las contraseñas no coinciden' } : {}));
      f.showErrors(errs); if (Object.keys(errs).length) return;
      try { await post('/me/password', { current: st.current, password: st.password }); toast('Contraseña actualizada'); Object.assign(st, { current: '', password: '', password2: '' }); f.querySelectorAll('input').forEach((i) => { i.value = ''; }); }
      catch (e) { toast(e.message, 'error'); }
    } }, 'Actualizar contraseña')),
    h('div', { class: 'card' }, cardHead('Sesión'), h('p', { class: 'muted small', style: { marginBottom: '14px' } }, `Sesión iniciada como ${u.email}.`), h('p', { class: 'small muted' }, 'Para cerrar sesión usa la opción del menú lateral.'))));
}

export const clientRoutes = { inicio, perfil, objetivos, rutinas, progreso, mediciones, nutricion, calendario, configuracion };
