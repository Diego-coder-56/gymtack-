import {
  h, mount, form, validate, toast, modal, confirmDialog, lightbox, avatar, emptyState, simpleField, field,
  fmtDate, fmtNum, fmtMoney, fmtMin, todayISO, fullName, DAYS_FULL, DAYS_SHORT, waLink, badgePlan, calcBmi, bmiLabel,
} from './ui.js';
import { icon } from './icons.js';
import { get, post, put, del } from './api.js';
import { S, go } from './state.js';
import { lineChart, progressBar } from './charts.js';

export const COACH_NAV = [
  { path: 'resumen', label: 'Resumen', icon: 'home' },
  { path: 'clientes', label: 'Clientes', icon: 'users' },
  { path: 'ejercicios', label: 'Ejercicios', icon: 'dumbbell' },
  { path: 'rutinas', label: 'Rutinas', icon: 'notes' },
  { path: 'dietas', label: 'Planes alimenticios', icon: 'utensils' },
  { path: 'configuracion', label: 'Configuración', icon: 'settings' },
  { sep: true },
  { action: 'logout', label: 'Cerrar sesión', icon: 'logout' },
];

const page = (...kids) => h('div', { class: 'page' }, ...kids);
const head = (title, sub, action) => h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), action || null);
const cardHead = (title, right) => h('div', { class: 'card-head' }, h('h3', {}, title), right || null);
const back = (href, label) => h('a', { class: 'btn ghost sm', href, style: { marginBottom: '8px', marginLeft: '-12px' } }, icon('chevL'), label);
const clientName = (c) => fullName(c) || c.email;
const copyText = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { prompt('Copia el enlace:', t); } };
const planBadge = (c) => (c.premium ? h('span', { class: 'badge premium' }, c.plan_until ? `Premium · hasta ${fmtDate(c.plan_until, false)}` : 'Premium') : c.plan === 'premium' ? h('span', { class: 'badge warn' }, 'Premium vencido') : h('span', { class: 'badge' }, 'Gratis'));
// Redibuja una lista conservando la posición de la pantalla (evita que el editor "salte" hacia arriba).
const keepScroll = (box, render) => {
  const y = window.scrollY;
  box.style.minHeight = `${box.offsetHeight}px`;
  render();
  window.scrollTo(0, y);
  box.style.minHeight = '';
};
const moveTo = (arr, from, to) => { if (from === to || to < 0 || to >= arr.length) return; const [m] = arr.splice(from, 1); arr.splice(to, 0, m); };
const gripBtn = (kind) => h('button', { type: 'button', class: 'icon-btn drag-handle', 'data-drag': kind, 'aria-label': 'Arrastrar para reordenar', title: 'Arrastra para reordenar' }, icon('grip'));
const posSelect = (arr, i, label, onMoved) => h('select', { class: 'select pos-select', 'aria-label': label, title: label, onchange: (e) => { moveTo(arr, i, Number(e.target.value)); onMoved(); } },
  arr.map((_, k) => h('option', { value: k, selected: k === i }, `Pos. ${k + 1}`)));
// Arrastrar y soltar: el elemento solo se arrastra desde su asa (así no estorba al escribir en los campos).
function sortable(els, handleOf, arr, onChange) {
  let from = null;
  const clearMarks = () => els.forEach((e) => e.classList.remove('drop-target'));
  els.forEach((el, i) => {
    const handle = handleOf(el);
    if (!handle) return;
    const off = () => { el.draggable = false; };
    handle.addEventListener('mousedown', () => { el.draggable = true; });
    handle.addEventListener('mouseup', off);
    el.addEventListener('dragstart', (e) => {
      if (!el.draggable) return;
      e.stopPropagation(); from = i;
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i));
      requestAnimationFrame(() => el.classList.add('dragging'));
    });
    el.addEventListener('dragend', () => { from = null; off(); el.classList.remove('dragging'); clearMarks(); });
    el.addEventListener('dragover', (e) => {
      if (from === null) return;
      e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move';
      clearMarks(); if (i !== from) el.classList.add('drop-target');
    });
    el.addEventListener('drop', (e) => {
      if (from === null) return;
      e.preventDefault(); e.stopPropagation();
      const f = from; from = null; clearMarks();
      moveTo(arr, f, i); if (f !== i) onChange();
    });
  });
}
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

// ================================================================== RESUMEN
async function resumen() {
  const s = await get('/coach/stats');
  const link = (c) => h('a', { class: 'row between', href: `#/clientes/${c.id}`, style: { textDecoration: 'none', padding: '10px 0', borderBottom: '1px solid var(--line)' } }, h('span', {}, c.name), h('span', { class: 'tiny muted' }, c.plan_until ? `Vence ${fmtDate(c.plan_until, false)}` : c.plan === 'premium' ? 'Premium' : 'Gratis'));
  const list = (title, items, empty) => h('div', { class: 'card' }, cardHead(title), items.length ? h('div', {}, items.map(link)) : h('p', { class: 'muted small' }, empty));
  return page(
    head(`Hola, ${S.user.first_name}`, 'Así va tu comunidad.', h('a', { class: 'btn', href: '#/clientes' }, icon('users'), 'Ver clientes')),
    h('div', { class: 'stack lg' },
      h('div', { class: 'grid c-auto', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' } },
        stat('Clientes', s.clients), stat('Premium activos', s.premium), stat('Gratuitos', s.free), stat('Ingresos del mes', fmtMoney(s.income_month))),
      h('div', { class: 'grid c2' },
        list('Sin rutina asignada', s.no_routine, 'Todos tus clientes activos ya tienen rutina.'),
        h('div', { class: 'stack' }, list('Premium por vencer (7 días)', s.expiring, 'Ningún plan vence pronto.'), s.expired.length ? list('Premium vencidos', s.expired, '') : null)),
      h('div', { class: 'grid c2' },
        list('Últimos registros', s.recent, 'Aún no hay clientes registrados. Comparte tu enlace de registro.'),
        h('div', { class: 'card' }, cardHead('Tu biblioteca'), h('div', { class: 'stat-row' },
          h('a', { class: 'stat', href: '#/ejercicios', style: { textDecoration: 'none' } }, h('b', {}, s.library.exercises), h('span', {}, 'Ejercicios')),
          h('a', { class: 'stat', href: '#/rutinas', style: { textDecoration: 'none' } }, h('b', {}, s.library.routines), h('span', {}, 'Rutinas')),
          h('a', { class: 'stat', href: '#/dietas', style: { textDecoration: 'none' } }, h('b', {}, s.library.diets), h('span', {}, 'Planes'))),
          h('div', { class: 'row wrap', style: { marginTop: '18px' } }, h('a', { class: 'btn secondary sm', href: '#/rutinas/nueva' }, icon('plus'), 'Nueva rutina'), h('a', { class: 'btn secondary sm', href: '#/dietas/nueva' }, icon('plus'), 'Nuevo plan alimenticio')),
          h('p', { class: 'small muted', style: { marginTop: '16px' } }, `Enlace de registro para tus clientes: ${location.origin}/#/registro`)))));
}
const stat = (label, value) => h('div', { class: 'kpi' }, h('div', { class: 'eyebrow' }, label), h('div', { class: 'v' }, value));

// ================================================================== CLIENTES
async function clientes() {
  const { items } = await get('/coach/clients');
  const st = { q: '', f: 'todos' };
  const out = h('div', {});
  const draw = () => {
    const q = st.q.trim().toLowerCase();
    const rows = items.filter((c) => (st.f === 'todos' || (st.f === 'premium' && c.premium) || (st.f === 'gratis' && !c.premium) || (st.f === 'sinrutina' && !c.routines)) && (!q || `${clientName(c)} ${c.email}`.toLowerCase().includes(q)));
    mount(out, rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Cliente', 'Plan', 'Rutinas', 'Nutrición', 'Último peso', 'Último entreno', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((c) => h('tr', { class: 'click', tabindex: 0, onclick: () => go(`#/clientes/${c.id}`), onkeydown: (e) => e.key === 'Enter' && go(`#/clientes/${c.id}`) },
        h('td', {}, h('div', { class: 'row' }, avatar(c, 'sm'), h('div', {}, h('div', { style: { fontWeight: 500 } }, clientName(c), !c.active ? h('span', { class: 'badge warn', style: { marginLeft: '8px' } }, 'Desactivado') : null), h('div', { class: 'tiny muted' }, c.email)))),
        h('td', {}, planBadge(c)), h('td', {}, c.routines || h('span', { class: 'badge warn' }, 'Sin rutina')), h('td', { class: 'small' }, c.diet || '—'),
        h('td', {}, c.last_weight != null ? `${fmtNum(c.last_weight)} kg` : '—'), h('td', { class: 'small' }, c.last_workout ? fmtDate(c.last_workout) : '—'), h('td', {}, icon('chevR'))))))) : h('div', { class: 'card' }, emptyState(items.length ? 'Sin resultados' : 'Aún no tienes clientes', items.length ? 'Prueba con otro filtro o búsqueda.' : `Comparte este enlace para que se registren: ${location.origin}/#/registro`)));
  };
  const search = h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: 'Buscar por nombre o correo', 'aria-label': 'Buscar clientes', oninput: (e) => { st.q = e.target.value; draw(); } }));
  const pills = h('div', { class: 'pills' });
  const drawPills = () => mount(pills, [['todos', 'Todos'], ['premium', 'Premium'], ['gratis', 'Gratuitos'], ['sinrutina', 'Sin rutina']].map(([k, l]) => h('button', { class: 'pill', 'aria-pressed': String(st.f === k), onclick: () => { st.f = k; drawPills(); draw(); } }, l)));
  drawPills(); draw();
  return page(head('Clientes', `${items.length} ${items.length === 1 ? 'persona' : 'personas'} en tu comunidad.`), h('div', { class: 'stack' }, h('div', { class: 'row between wrap' }, pills, search), out));
}

// ================================================================== DETALLE DE CLIENTE
async function clienteDetalle({ args }) {
  const id = args[0];
  const root = h('div', { class: 'page' });
  let tab = 'resumen';
  let data = await get(`/coach/clients/${id}`);
  const reload = async () => { data = await get(`/coach/clients/${id}`); draw(); };
  const tabs = [['resumen', 'Resumen'], ['rutinas', 'Rutinas'], ['nutricion', 'Nutrición'], ['plan', 'Plan y pagos'], ['notas', 'Notas']];

  const draw = () => {
    const { user: u } = data;
    const wa = waLink(u.phone, `Hola ${u.first_name}, soy tu entrenador en GYMTRACK.`);
    const body = h('div', {});
    const views = { resumen: tabResumen, rutinas: tabRutinas, nutricion: tabNutricion, plan: tabPlan, notas: tabNotas };
    mount(root,
      back('#/clientes', 'Clientes'),
      h('div', { class: 'card', style: { marginBottom: '24px' } }, h('div', { class: 'row wrap', style: { gap: '20px' } }, avatar(u, 'lg'),
        h('div', { class: 'grow stack sm' }, h('h1', {}, clientName(u)), h('div', { class: 'row wrap muted small' }, [u.age != null ? `${u.age} años` : null, u.email, u.phone].filter(Boolean).map((t) => h('span', {}, t))), h('div', { class: 'row wrap' }, planBadge(u), !u.active ? h('span', { class: 'badge warn' }, 'Cuenta desactivada') : null)),
        wa ? h('a', { class: 'btn secondary sm', href: wa, target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'WhatsApp') : null)),
      h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; draw(); } }, l))),
      body);
    mount(body, views[tab]());
  };

  // ---- Resumen
  const tabResumen = () => {
    const { profile: p, goals, measurements: ms, photos, logs } = data;
    const chartData = [...ms].reverse().filter((m) => m.weight != null).map((m) => ({ date: m.date, value: m.weight }));
    const kv = (pairs) => h('dl', { class: 'kv' }, pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
    return h('div', { class: 'stack lg' },
      h('div', { class: 'grid c2' },
        h('div', { class: 'card' }, cardHead('Perfil de entrenamiento'), kv([['Nivel', p.level], ['Frecuencia', p.freq ? `${p.freq} días/semana` : null], ['Días disponibles', (p.days || []).map((d) => DAYS_FULL[d - 1]).join(', ')], ['Duración', p.duration ? `${p.duration} min` : null], ['Lugar', p.place], ['Preferencia', p.training_type], ['Lesiones / limitaciones', p.injuries ? h('span', { style: { color: 'var(--danger)' } }, p.injuries) : 'Ninguna indicada']])),
        h('div', { class: 'card' }, cardHead('Cuerpo actual'), kv([['Altura', p.height_cm ? `${p.height_cm} cm` : null], ['Peso', p.weight_kg ? `${fmtNum(p.weight_kg)} kg` : null], ['Grasa corporal', p.body_fat != null ? `${fmtNum(p.body_fat)} %` : null], ['Masa muscular', p.muscle_mass != null ? `${fmtNum(p.muscle_mass)} kg` : null], ['Cintura / cadera', p.waist || p.hip ? `${p.waist ?? '—'} / ${p.hip ?? '—'} cm` : null], ['IMC', p.bmi ? `${p.bmi} · ${bmiLabel(p.bmi)}` : null], ['Género', p.gender]]))),
      h('div', { class: 'grid c2' },
        h('div', { class: 'card' }, cardHead('Objetivos'), goals.length ? h('div', { class: 'stack' }, goals.map((g) => h('div', {}, h('div', { class: 'row between small', style: { marginBottom: '6px' } }, g.title, h('b', {}, `${g.pct}%`)), progressBar(g.pct, true)))) : h('p', { class: 'muted small' }, 'Sin objetivos.')),
        h('div', { class: 'card' }, cardHead('Evolución del peso', h('span', { class: 'tiny muted' }, 'kg')), lineChart(chartData, { unit: ' kg' }))),
      h('div', { class: 'card' }, cardHead('Mediciones', h('span', { class: 'tiny muted' }, `${ms.length} ${ms.length === 1 ? 'registro' : 'registros'}`)), ms.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['Fecha', 'Peso', 'Grasa', 'Músculo', 'Cintura', 'Cadera', 'IMC'].map((t) => h('th', {}, t)))), h('tbody', {}, ms.slice(0, 8).map((m) => h('tr', {}, h('td', {}, fmtDate(m.date)), h('td', {}, m.weight ?? '—'), h('td', {}, m.body_fat ?? '—'), h('td', {}, m.muscle_mass ?? '—'), h('td', {}, m.waist ?? '—'), h('td', {}, m.hip ?? '—'), h('td', {}, m.bmi ?? '—')))))) : h('p', { class: 'muted small' }, 'Sin mediciones.')),
      h('div', { class: 'grid c2' },
        h('div', { class: 'card' }, cardHead('Entrenamientos recientes'), logs.length ? h('div', {}, logs.slice(0, 8).map((l) => h('div', { class: 'row between', style: { padding: '9px 0', borderBottom: '1px solid var(--line)' } }, h('div', {}, h('div', { style: { fontWeight: 500 } }, l.day_name), h('div', { class: 'tiny muted' }, l.routine_name)), h('div', { class: 'small muted', style: { textAlign: 'right' } }, fmtDate(l.date), h('br'), fmtMin(l.duration_min))))) : h('p', { class: 'muted small' }, 'Aún no registra entrenamientos.')),
        h('div', { class: 'card' }, cardHead('Fotos de progreso'), photos.length ? h('div', { class: 'photo-grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' } }, photos.slice(0, 8).map((ph) => h('figure', {}, h('img', { src: ph.url, alt: `Foto ${fmtDate(ph.date)}`, loading: 'lazy', onclick: () => lightbox(ph.url) }), h('figcaption', {}, fmtDate(ph.date, false))))) : h('p', { class: 'muted small' }, 'Sin fotos de progreso.'))));
  };

  // ---- Rutinas
  const tabRutinas = () => {
    const box = h('div', { class: 'stack lg' });
    const st = { routine_id: '' };
    const load = async () => {
      const lib = (await get('/coach/routines')).items;
      const premium = data.user.premium;
      const sel = h('select', { class: 'select', 'aria-label': 'Rutina a asignar', onchange: (e) => { st.routine_id = e.target.value; } }, h('option', { value: '' }, 'Elige una rutina…'),
        lib.map((r) => h('option', { value: r.id, disabled: !premium && r.tier !== 'free' }, `${r.name}${r.tier === 'free' ? ' · gratuita' : ' · Premium'}${!premium && r.tier !== 'free' ? ' (requiere Premium)' : ''}`)));
      mount(box,
        h('div', { class: 'card' }, cardHead('Rutinas asignadas'), data.routines.length ? h('div', {}, data.routines.map((r) => h('div', { class: 'row between', style: { padding: '12px 0', borderBottom: '1px solid var(--line)' } },
          h('div', {}, h('div', { style: { fontWeight: 500 } }, r.name), h('div', { class: 'tiny muted' }, `Asignada ${fmtDate(r.assigned_at)} · ${r.tier === 'free' ? 'gratuita' : 'Premium'}`)),
          h('div', { class: 'row' }, h('a', { class: 'btn ghost sm', href: `#/rutinas/${r.id}` }, 'Ver / editar'), h('button', { class: 'btn danger sm', onclick: async () => { await del(`/coach/clients/${id}/routines/${r.assignment_id}`); toast('Rutina retirada'); reload(); } }, 'Quitar'))))) : h('p', { class: 'muted' }, 'Este cliente aún no tiene rutinas asignadas.'),
          !premium && data.routines.length ? h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Al ser un cliente gratuito, solo verá una rutina gratuita (la más reciente).') : null),
        h('div', { class: 'card' }, cardHead('Asignar rutina'), h('div', { class: 'row wrap' }, h('div', { class: 'grow', style: { minWidth: '240px' } }, sel),
          h('button', { class: 'btn', onclick: async () => { if (!st.routine_id) return toast('Elige una rutina', 'error'); try { const r = await post(`/coach/clients/${id}/routines`, { routine_id: Number(st.routine_id) }); toast(r.replaced ? 'Rutina asignada (reemplaza la gratuita anterior)' : 'Rutina asignada'); reload(); } catch (e) { toast(e.message, 'error'); } } }, 'Asignar')),
          !premium ? h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Cliente gratuito: solo puedes asignar rutinas marcadas como gratuitas, y reemplaza la anterior. Activa Premium en “Plan y pagos” para asignar cualquier rutina.') : null));
    };
    load();
    return box;
  };

  // ---- Nutrición
  const tabNutricion = () => {
    const box = h('div', { class: 'stack lg' });
    const load = async () => {
      if (!data.user.premium) return mount(box, h('div', { class: 'card' }, emptyState('Los planes alimenticios son Premium', 'Activa el plan Premium de este cliente para asignarle nutrición.', h('button', { class: 'btn', onclick: () => { tab = 'plan'; draw(); } }, 'Ir a Plan y pagos'))));
      const diets = (await get('/coach/diets')).items;
      const st = { diet_id: data.diet?.diet_id ?? '', notes: data.diet?.notes || '' };
      mount(box,
        data.diet ? h('div', { class: 'card pearl' }, h('div', { class: 'eyebrow' }, 'Plan actual'), h('h2', { style: { margin: '6px 0' } }, data.diet.name), h('p', { class: 'small muted' }, `${data.diet.calories ?? '—'} kcal · asignado ${fmtDate(data.diet.assigned_at)}`)) : null,
        h('div', { class: 'card stack' }, cardHead(data.diet ? 'Cambiar plan' : 'Asignar plan alimenticio'),
          h('select', { class: 'select', 'aria-label': 'Plan alimenticio', onchange: (e) => { st.diet_id = e.target.value; } }, h('option', { value: '' }, 'Elige un plan…'), diets.map((d) => h('option', { value: d.id, selected: String(st.diet_id) === String(d.id) }, `${d.name}${d.calories ? ` · ${d.calories} kcal` : ''}`))),
          field({ key: 'notes', label: 'Indicaciones para este cliente (opcional)', type: 'textarea', max: 1000, placeholder: 'Ej. Toma 2.5 L de agua al día. Cambia el arroz por camote en la cena.' }, st),
          h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: async () => { if (!st.diet_id) return toast('Elige un plan', 'error'); try { await put(`/coach/clients/${id}/diet`, { diet_id: Number(st.diet_id), notes: st.notes }); toast('Plan asignado'); reload(); } catch (e) { toast(e.message, 'error'); } } }, 'Guardar asignación'),
            data.diet ? h('button', { class: 'btn danger', onclick: async () => { await put(`/coach/clients/${id}/diet`, { diet_id: null }); toast('Plan retirado'); reload(); } }, 'Quitar plan') : null)));
    };
    load();
    return box;
  };

  // ---- Plan y pagos
  const tabPlan = () => {
    const u = data.user;
    const plan = { plan: u.plan, plan_until: u.plan_until || '' };
    const pay = { amount: S.settings.premium_price?.match(/\d[\d,.]*/)?.[0]?.replace(/,/g, '') || '', method: 'transferencia', months: 1, date: todayISO(), note: '' };
    return h('div', { class: 'stack lg' },
      h('div', { class: 'card stack' }, cardHead('Plan del cliente', planBadge(u)),
        h('div', { class: 'form-grid' }, field({ key: 'plan', label: 'Plan', type: 'select', options: [{ value: 'free', label: 'Gratuito' }, { value: 'premium', label: 'Premium' }] }, plan), field({ key: 'plan_until', label: 'Premium vence el', type: 'date', hint: 'Déjalo vacío para que no venza.' }, plan)),
        h('div', {}, h('button', { class: 'btn', onclick: async () => { try { await put(`/coach/clients/${id}`, { plan: plan.plan || 'free', plan_until: plan.plan_until || null }); toast('Plan actualizado'); reload(); } catch (e) { toast(e.message, 'error'); } } }, 'Guardar plan'))),
      h('div', { class: 'card stack' }, cardHead('Registrar pago'), h('p', { class: 'small muted' }, 'Al registrar un pago se activa o extiende el plan Premium automáticamente. (Los cobros se hacen fuera de la plataforma: efectivo, transferencia, etc.)'),
        h('div', { class: 'form-grid' },
          field({ key: 'amount', label: 'Monto (MXN)', type: 'number', req: true, min: 0 }, pay),
          field({ key: 'months', label: 'Meses de Premium', type: 'select', options: [1, 2, 3, 6, 12].map((n) => ({ value: n, label: `${n} ${n === 1 ? 'mes' : 'meses'}` })) }, pay),
          field({ key: 'method', label: 'Método', type: 'select', options: ['efectivo', 'transferencia', 'tarjeta', 'otro'].map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) })) }, pay),
          field({ key: 'date', label: 'Fecha de pago', type: 'date' }, pay), field({ key: 'note', label: 'Nota (opcional)', max: 200, full: true }, pay)),
        h('div', {}, h('button', { class: 'btn', onclick: async () => { if (pay.amount === '') return toast('Escribe el monto', 'error'); try { const r = await post(`/coach/clients/${id}/payments`, { ...pay, amount: Number(pay.amount), months: Number(pay.months) }); toast(`Premium activo hasta ${fmtDate(r.plan_until)}`); reload(); } catch (e) { toast(e.message, 'error'); } } }, 'Registrar pago y activar Premium'))),
      h('div', { class: 'card' }, cardHead('Historial de pagos'), data.payments.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['Fecha', 'Monto', 'Meses', 'Método', 'Nota', ''].map((t) => h('th', {}, t)))), h('tbody', {}, data.payments.map((p) => h('tr', {}, h('td', {}, fmtDate(p.date)), h('td', {}, fmtMoney(p.amount)), h('td', {}, p.months), h('td', {}, p.method), h('td', { class: 'small muted' }, p.note || ''), h('td', {}, h('button', { class: 'icon-btn', 'aria-label': 'Eliminar pago', onclick: async () => { if (await confirmDialog('Eliminar pago', 'Solo borra el registro; no cambia el plan del cliente.', 'Eliminar', true)) { await del(`/coach/clients/${id}/payments/${p.id}`); reload(); } } }, icon('trash')))))))) : h('p', { class: 'muted small' }, 'Sin pagos registrados.')),
      h('div', { class: 'card stack' }, cardHead('Acceso de la cuenta'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn secondary', onclick: async () => { const r = await post(`/coach/clients/${id}/reset-link`); modal({ title: 'Enlace para restablecer contraseña', body: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, `Envíaselo a ${u.first_name} por WhatsApp o correo. Válido ${r.valid_hours} horas y de un solo uso.`), h('input', { class: 'input', readonly: true, value: r.url, onfocus: (e) => e.target.select() })), actions: [{ label: 'Cerrar', kind: 'secondary' }, { label: 'Copiar enlace', onClick: async () => { await copyText(r.url); return false; } }] }); } }, icon('link'), 'Generar enlace de recuperación'),
          h('button', { class: `btn ${u.active ? 'danger' : 'secondary'}`, onclick: async () => { if (u.active && !(await confirmDialog('Desactivar cuenta', `${u.first_name} no podrá iniciar sesión hasta que la reactives. No se borran sus datos.`, 'Desactivar', true))) return; await put(`/coach/clients/${id}`, { active: !u.active }); toast(u.active ? 'Cuenta desactivada' : 'Cuenta reactivada'); reload(); } }, u.active ? 'Desactivar cuenta' : 'Reactivar cuenta'))));
  };

  // ---- Notas
  const tabNotas = () => {
    const st = { coach_notes: data.user.coach_notes || '' };
    return h('div', { class: 'card stack' }, cardHead('Notas privadas'), h('p', { class: 'small muted' }, 'Solo tú las ves. Úsalas para lesiones, ajustes, acuerdos o recordatorios.'),
      field({ key: 'coach_notes', label: 'Notas', type: 'textarea', max: 4000 }, st, {}),
      h('div', {}, h('button', { class: 'btn', onclick: async () => { try { await put(`/coach/clients/${id}`, { coach_notes: st.coach_notes }); toast('Notas guardadas'); data.user.coach_notes = st.coach_notes; } catch (e) { toast(e.message, 'error'); } } }, 'Guardar notas')));
  };

  draw();
  return root;
}

// ================================================================== EJERCICIOS
const MUSCLES = ['Pecho', 'Espalda', 'Piernas', 'Glúteos', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazos', 'Core', 'Cardio', 'Cuerpo completo', 'Movilidad'];
async function ejercicios() {
  let { items } = await get('/coach/exercises');
  const st = { q: '', m: 'Todos' };
  const out = h('div', {}), pills = h('div', { class: 'pills' });
  const reload = async () => { items = (await get('/coach/exercises')).items; drawPills(); draw(); };
  const draw = () => {
    const q = st.q.trim().toLowerCase();
    const rows = items.filter((e) => (st.m === 'Todos' || e.muscle === st.m) && (!q || `${e.name} ${e.equipment || ''}`.toLowerCase().includes(q)));
    mount(out, rows.length ? h('div', { class: 'grid c-auto' }, rows.map((e) => h('div', { class: 'card tight stack sm' },
      h('div', { class: 'row between' }, h('span', { class: 'eyebrow' }, e.muscle), e.video_url ? h('a', { class: 'icon-btn', href: e.video_url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Ver video' }, icon('video')) : null),
      h('h4', {}, e.name), h('p', { class: 'small muted' }, [e.equipment, e.description].filter(Boolean).join(' · ') || 'Sin descripción'),
      h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn secondary sm', onclick: () => exerciseModal(e, reload, items.map((i) => i.muscle)) }, icon('edit'), 'Editar'), h('button', { class: 'btn ghost sm', onclick: async () => { if (await confirmDialog('Eliminar ejercicio', `¿Eliminar “${e.name}” de la biblioteca?`, 'Eliminar', true)) { try { await del(`/coach/exercises/${e.id}`); toast('Ejercicio eliminado'); reload(); } catch (err) { toast(err.message, 'error'); } } } }, icon('trash'))))))
      : h('div', { class: 'card' }, emptyState('Sin ejercicios', 'Agrega tu primer ejercicio a la biblioteca.')));
  };
  const drawPills = () => { const ms = ['Todos', ...new Set([...MUSCLES, ...items.map((i) => i.muscle)])].filter((m) => m === 'Todos' || items.some((i) => i.muscle === m)); mount(pills, ms.map((m) => h('button', { class: 'pill', 'aria-pressed': String(st.m === m), onclick: () => { st.m = m; drawPills(); draw(); } }, m))); };
  drawPills(); draw();
  return page(head('Ejercicios', `Tu biblioteca: ${items.length} ejercicios. Agrega los que quieras, uno por uno o en lote.`, h('div', { class: 'row wrap' },
      h('button', { class: 'btn secondary', onclick: () => importModal(reload) }, icon('upload'), 'Importar varios'),
      h('button', { class: 'btn secondary', onclick: async () => { if (await confirmDialog('Agregar catálogo ampliado', 'Se agregan unos 100 ejercicios de ejemplo (todos los grupos musculares, cardio y movilidad). Los que ya tengas no se duplican ni se modifican.', 'Agregar')) { try { const r = await post('/coach/exercises/catalog'); toast(r.added ? `${r.added} ejercicios agregados` : 'Ya tienes todo el catálogo'); reload(); } catch (e) { toast(e.message, 'error'); } } } }, icon('plus'), 'Catálogo ampliado'),
      h('button', { class: 'btn', onclick: () => exerciseModal(null, reload, items.map((i) => i.muscle)) }, icon('plus'), 'Nuevo ejercicio'))),
    h('div', { class: 'stack' }, h('div', { class: 'row between wrap' }, pills, h('div', { class: 'search' }, icon('search'), h('input', { class: 'input', type: 'search', placeholder: 'Buscar ejercicio', 'aria-label': 'Buscar ejercicio', oninput: (e) => { st.q = e.target.value; draw(); } }))), out));
}
function exerciseModal(ex, done, known = []) {
  const st = { name: ex?.name || '', muscle: ex?.muscle || '', equipment: ex?.equipment || '', description: ex?.description || '', video_url: ex?.video_url || '' };
  const muscles = [...new Set([...MUSCLES, ...known.filter(Boolean)])];
  const defs = [
    { key: 'name', label: 'Nombre', req: true, max: 100, full: true, placeholder: 'Ej. Sentadilla búlgara' },
    { key: 'muscle', label: 'Grupo muscular', type: 'combo', options: muscles, req: true, max: 40, placeholder: 'Elige uno o escribe uno nuevo', hint: 'Puedes escribir un grupo propio (ej. “Cuello”, “Funcional”).' },
    { key: 'equipment', label: 'Equipo', max: 60, placeholder: 'Barra, mancuernas, polea…' },
    { key: 'description', label: 'Técnica / descripción', type: 'textarea', max: 1000, full: true, placeholder: 'Cómo se ejecuta, errores comunes…' },
    { key: 'video_url', label: 'Enlace de video (opcional)', type: 'url', max: 300, full: true, placeholder: 'https://youtube.com/…' },
  ];
  const f = form(defs, st);
  modal({ title: ex ? 'Editar ejercicio' : 'Nuevo ejercicio', body: f, actions: [{ label: 'Cancelar', kind: 'secondary' }, { label: 'Guardar', onClick: async () => {
    const errs = validate(defs, st); f.showErrors(errs); if (Object.keys(errs).length) return false;
    const body = { ...st, name: st.name.trim(), muscle: st.muscle.trim(), equipment: st.equipment || null, description: st.description || null, video_url: st.video_url || null };
    const r = ex ? await put(`/coach/exercises/${ex.id}`, body) : await post('/coach/exercises', body);
    toast('Ejercicio guardado'); await done(r?.id); return true;
  } }] });
}

// Importar varios: una línea por ejercicio → Nombre; Grupo muscular; Equipo (opcional); Descripción (opcional)
function importModal(done) {
  const ta = h('textarea', { class: 'textarea', style: { minHeight: '220px' }, placeholder: 'Sentadilla búlgara; Piernas; Mancuernas\nCurl de bíceps con cuerda; Bíceps; Polea\nPlancha con toque de hombro; Core', oninput: () => count() });
  const info = h('p', { class: 'small muted' });
  const parse = () => ta.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, muscle, equipment, ...rest] = l.split(/[;\t]/).map((x) => x.trim());
    return { name, muscle, equipment: equipment || null, description: rest.join('; ') || null };
  });
  const count = () => { const n = parse().length; info.textContent = n ? `${n} ${n === 1 ? 'ejercicio listo' : 'ejercicios listos'} para importar.` : ''; };
  modal({ title: 'Importar varios ejercicios', size: 'lg',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Escribe o pega uno por línea, separando con punto y coma (;) o tabulador. También puedes copiar columnas desde Excel o Google Sheets.'),
      h('div', { class: 'card pearl flat tight small' }, h('b', {}, 'Formato: '), 'Nombre ; Grupo muscular ; Equipo (opcional) ; Descripción (opcional)'),
      ta, info),
    actions: [{ label: 'Cancelar', kind: 'secondary' }, { label: 'Importar', onClick: async () => {
      const items = parse();
      if (!items.length) throw new Error('Escribe al menos un ejercicio');
      const bad = items.findIndex((e) => !e.name || !e.muscle);
      if (bad >= 0) throw new Error(`Línea ${bad + 1}: falta el nombre o el grupo muscular (formato: Nombre ; Grupo)`);
      const r = await post('/coach/exercises/bulk', { items });
      toast(`${r.added} agregados${r.skipped.length ? ` · ${r.skipped.length} ya existían` : ''}`);
      await done(); return true;
    } }] });
}

// ================================================================== RUTINAS (lista + editor)
async function rutinas({ args }) {
  if (args[0]) return routineEditor(args[0]);
  const { items } = await get('/coach/routines');
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  return page(head('Rutinas', 'Crea plantillas y asígnalas a tus clientes.', h('a', { class: 'btn', href: '#/rutinas/nueva' }, icon('plus'), 'Nueva rutina')),
    items.length ? h('div', { class: 'grid c-auto' }, items.map((r) => h('div', { class: 'card stack' },
      h('div', { class: 'row between' }, h('span', { class: 'eyebrow' }, r.goal || 'Rutina'), r.tier === 'free' ? h('span', { class: 'badge' }, 'Gratuita') : h('span', { class: 'badge premium' }, 'Premium')),
      h('h3', {}, r.name), r.description ? h('p', { class: 'small muted' }, r.description) : null,
      h('div', { class: 'row wrap' }, h('span', { class: 'badge' }, `${r.day_count} días`), h('span', { class: 'badge' }, `${r.exercise_count} ejercicios`), r.level ? h('span', { class: 'badge' }, r.level) : null, h('span', { class: 'badge' }, `${r.assigned} clientes`)),
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn secondary sm', href: `#/rutinas/${r.id}` }, icon('edit'), 'Editar'),
        h('button', { class: 'btn ghost sm', onclick: async () => { const x = await post(`/coach/routines/${r.id}/duplicate`); toast('Rutina duplicada'); go(`#/rutinas/${x.id}`); } }, icon('copy'), 'Duplicar'),
        h('button', { class: 'btn ghost sm', 'aria-label': 'Eliminar', onclick: async () => { if (await confirmDialog('Eliminar rutina', `“${r.name}” se quitará también de ${r.assigned} ${r.assigned === 1 ? 'cliente' : 'clientes'}.`, 'Eliminar', true)) { await del(`/coach/routines/${r.id}`); toast('Rutina eliminada'); reload(); } } }, icon('trash')))))) : h('div', { class: 'card' }, emptyState('Crea tu primera rutina', 'Combina ejercicios de tu biblioteca en días de entrenamiento.', h('a', { class: 'btn', href: '#/rutinas/nueva' }, 'Nueva rutina'))));
}
async function routineEditor(idArg) {
  const isNew = idArg === 'nueva';
  const [{ items: lib }, existing] = await Promise.all([get('/coach/exercises'), isNew ? null : get(`/coach/routines/${idArg}`)]);
  if (!lib.length) return page(back('#/rutinas', 'Rutinas'), head('Rutina'), h('div', { class: 'card' }, emptyState('Primero agrega ejercicios', 'Necesitas ejercicios en tu biblioteca para armar una rutina.', h('a', { class: 'btn', href: '#/ejercicios' }, 'Ir a Ejercicios'))));
  const r = existing?.routine || { name: '', description: '', level: '', goal: '', tier: 'premium', days: [] };
  const st = { name: r.name, description: r.description || '', level: r.level || '', goal: r.goal || '', tier: r.tier, days: JSON.parse(JSON.stringify(r.days)) };
  st.days = st.days.map(({ weekday, ...d }) => ({ ...d, weekdays: Array.isArray(d.weekdays) ? d.weekdays : weekday ? [weekday] : [] }));
  if (!st.days.length) st.days.push({ name: 'Día 1', weekdays: [], notes: '', exercises: [] });
  const topDefs = [
    { key: 'name', label: 'Nombre de la rutina', req: true, max: 100, full: true },
    { key: 'goal', label: 'Objetivo', max: 80, placeholder: 'Ej. Ganar masa muscular' },
    { key: 'level', label: 'Nivel', type: 'select', options: [{ value: 'principiante', label: 'Principiante' }, { value: 'intermedio', label: 'Intermedio' }, { value: 'avanzado', label: 'Avanzado' }] },
    { key: 'tier', label: 'Acceso', type: 'select', req: true, options: [{ value: 'premium', label: 'Premium (solo clientes de pago)' }, { value: 'free', label: 'Gratuita (visible para clientes gratuitos)' }] },
    { key: 'description', label: 'Descripción', type: 'textarea', max: 600, full: true },
  ];
  const tf = form(topDefs, st);
  const daysBox = h('div', { class: 'stack lg' });
  const groupsOf = () => [...new Set(lib.map((e) => e.muscle))].sort((a, b) => a.localeCompare(b, 'es'));
  const inp = (obj, key, props = {}) => { const i = h('input', { class: 'input', value: obj[key] ?? '', oninput: (e) => { obj[key] = e.target.value; }, ...props }); return i; };
  const moveItem = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; drawDays(); };

  const renderDays = () => mount(daysBox, st.days.map((day, di) => h('div', { class: 'day-editor stack' },
    h('div', { class: 'row wrap' },
      h('div', { style: { alignSelf: 'flex-end' } }, gripBtn('day')),
      h('div', { class: 'grow', style: { minWidth: '200px' } }, simpleField(`Día ${di + 1}`, inp(day, 'name', { maxlength: 80, placeholder: 'Ej. Push — Pecho y tríceps' }))),
      null,
      h('div', { class: 'row', style: { alignSelf: 'flex-end', gap: '2px' } },
        posSelect(st.days, di, 'Mover este día a la posición…', () => drawDays()),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Subir día', onclick: () => moveItem(st.days, di, -1) }, icon('arrowUp')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Bajar día', onclick: () => moveItem(st.days, di, 1) }, icon('arrowDown')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Duplicar día', onclick: () => { st.days.splice(di + 1, 0, JSON.parse(JSON.stringify({ ...day, name: `${day.name} (copia)` }))); drawDays(); } }, icon('copy')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Eliminar día', onclick: () => { if (st.days.length === 1) return toast('La rutina necesita al menos un día', 'error'); st.days.splice(di, 1); drawDays(); } }, icon('trash')))),
    h('div', { class: 'field' }, h('label', {}, 'Días de la semana en que se entrena'),
      h('div', { class: 'chips' }, DAYS_FULL.map((n, i) => {
        const b = h('button', { type: 'button', class: 'chip day', title: n, 'aria-pressed': String(day.weekdays.includes(i + 1)), onclick: () => {
          const set = new Set(day.weekdays); set.has(i + 1) ? set.delete(i + 1) : set.add(i + 1);
          day.weekdays = [...set].sort((a, c) => a - c); b.setAttribute('aria-pressed', String(set.has(i + 1)));
        } }, DAYS_SHORT[i]);
        return b;
      })),
      h('div', { class: 'hint' }, 'Marca dos o más si esta sesión se repite (ej. Pecho lunes y jueves). Sin marcar = sin día fijo.')),
    h('div', { class: 'stack sm' }, day.exercises.map((ex, ei) => h('div', { class: 'ex-edit' }, gripBtn('ex'),
      h('div', { class: 'field pick' }, h('label', {}, 'Ejercicio'), h('select', { class: 'select', onchange: (e) => { ex.exercise_id = Number(e.target.value); } }, groupsOf().map((g) => h('optgroup', { label: g }, lib.filter((l) => l.muscle === g).map((l) => h('option', { value: l.id, selected: l.id === ex.exercise_id }, l.name)))))),
      h('div', { class: 'field' }, h('label', {}, 'Series'), inp(ex, 'sets', { type: 'number', min: 1, max: 30, inputmode: 'numeric' })),
      h('div', { class: 'field' }, h('label', {}, 'Repeticiones'), inp(ex, 'reps', { maxlength: 30, placeholder: '8-12' })),
      h('div', { class: 'field' }, h('label', {}, 'Descanso'), inp(ex, 'rest', { maxlength: 30, placeholder: '60 s' })),
      h('div', { class: 'row', style: { gap: '0' } }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Subir', onclick: () => moveItem(day.exercises, ei, -1) }, icon('arrowUp')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Bajar', onclick: () => moveItem(day.exercises, ei, 1) }, icon('arrowDown')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitar ejercicio', onclick: () => { day.exercises.splice(ei, 1); drawDays(); } }, icon('x'))),
      h('div', { class: 'field note' }, inp(ex, 'notes', { maxlength: 300, placeholder: 'Indicación opcional (tempo, técnica, carga sugerida…)', 'aria-label': 'Indicación' }))))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn secondary sm', type: 'button', onclick: () => { const last = day.exercises[day.exercises.length - 1]; day.exercises.push({ exercise_id: last?.exercise_id || lib[0].id, sets: last?.sets || 3, reps: last?.reps || '10', rest: last?.rest || '60 s', notes: '' }); drawDays({ day: di, ex: day.exercises.length - 1 }); } }, icon('plus'), 'Agregar ejercicio'),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: () => exerciseModal(null, async (newId) => {
        const fresh = (await get('/coach/exercises')).items;
        lib.splice(0, lib.length, ...fresh);
        if (newId) day.exercises.push({ exercise_id: newId, sets: 3, reps: '10', rest: '60 s', notes: '' });
        drawDays(newId ? { day: di, ex: day.exercises.length - 1 } : undefined);
      }, lib.map((l) => l.muscle)) }, icon('plus'), 'Crear ejercicio nuevo'))))); 
  const drawDays = (focus) => {
    keepScroll(daysBox, renderDays);
    const dayEls = [...daysBox.children].filter((el) => el.classList.contains('day-editor'));
    sortable(dayEls, (el) => el.querySelector(':scope > .row [data-drag="day"]'), st.days, () => drawDays());
    dayEls.forEach((el, di) => sortable([...el.querySelectorAll(':scope > .stack > .ex-edit')], (row) => row.querySelector(':scope > [data-drag="ex"]'), st.days[di].exercises, () => drawDays()));
    if (focus) {
      const row = daysBox.querySelectorAll('.day-editor')[focus.day]?.querySelectorAll('.ex-edit')[focus.ex];
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      row?.querySelector('select')?.focus({ preventScroll: true });
    }
  };
  drawDays();

  const save = async () => {
    const errs = validate(topDefs, st); tf.showErrors(errs); if (Object.keys(errs).length) return;
    for (const [i, d] of st.days.entries()) {
      if (!String(d.name || '').trim()) return toast(`Ponle nombre al día ${i + 1}`, 'error');
      for (const e of d.exercises) if (!e.sets || !String(e.reps || '').trim()) return toast(`Completa series y repeticiones en “${d.name}”`, 'error');
    }
    const body = { ...st, level: st.level || null, days: st.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, sets: Number(e.sets) })) })) };
    try {
      if (isNew) { const x = await post('/coach/routines', body); toast('Rutina creada'); go(`#/rutinas/${x.id}`); } else { await put(`/coach/routines/${idArg}`, body); toast('Rutina guardada'); }
    } catch (e) { toast(e.message, 'error'); }
  };
  return page(back('#/rutinas', 'Rutinas'), head(isNew ? 'Nueva rutina' : 'Editar rutina', 'Los cambios se reflejan al instante en los clientes que la tienen asignada.'),
    h('div', { class: 'stack lg' }, h('div', { class: 'card' }, tf), h('div', {}, h('div', { class: 'card-head' }, h('h3', {}, 'Días de entrenamiento')), daysBox,
      h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn secondary', type: 'button', onclick: () => { st.days.push({ name: `Día ${st.days.length + 1}`, weekdays: [], notes: '', exercises: [] }); drawDays(); } }, icon('plus'), 'Agregar día'))),
      h('div', { class: 'sticky-actions' }, h('a', { class: 'btn secondary', href: '#/rutinas' }, 'Volver'), h('button', { class: 'btn', onclick: save }, 'Guardar rutina'))));
}

// ================================================================== PLANES ALIMENTICIOS (lista + editor)
async function dietas({ args }) {
  if (args[0]) return dietEditor(args[0]);
  const { items } = await get('/coach/diets');
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  return page(head('Planes alimenticios', 'Plantillas de nutrición para tus clientes Premium.', h('a', { class: 'btn', href: '#/dietas/nueva' }, icon('plus'), 'Nuevo plan')),
    items.length ? h('div', { class: 'grid c-auto' }, items.map((d) => h('div', { class: 'card stack' },
      h('div', { class: 'eyebrow' }, d.calories ? `${d.calories} kcal` : 'Plan alimenticio'), h('h3', {}, d.name), d.description ? h('p', { class: 'small muted' }, d.description) : null,
      h('div', { class: 'row wrap' }, h('span', { class: 'badge' }, `${d.meal_count} comidas`), d.protein != null ? h('span', { class: 'badge' }, `P ${d.protein} · C ${d.carbs ?? '—'} · G ${d.fat ?? '—'}`) : null, h('span', { class: 'badge' }, `${d.assigned} clientes`)),
      h('div', { class: 'row wrap' }, h('a', { class: 'btn secondary sm', href: `#/dietas/${d.id}` }, icon('edit'), 'Editar'),
        h('button', { class: 'btn ghost sm', onclick: async () => { const x = await post(`/coach/diets/${d.id}/duplicate`); toast('Plan duplicado'); go(`#/dietas/${x.id}`); } }, icon('copy'), 'Duplicar'),
        h('button', { class: 'btn ghost sm', 'aria-label': 'Eliminar', onclick: async () => { if (await confirmDialog('Eliminar plan', `“${d.name}” se quitará de ${d.assigned} ${d.assigned === 1 ? 'cliente' : 'clientes'}.`, 'Eliminar', true)) { await del(`/coach/diets/${d.id}`); toast('Plan eliminado'); reload(); } } }, icon('trash')))))) : h('div', { class: 'card' }, emptyState('Crea tu primer plan', 'Define calorías, macros y comidas.', h('a', { class: 'btn', href: '#/dietas/nueva' }, 'Nuevo plan'))));
}
async function dietEditor(idArg) {
  const isNew = idArg === 'nueva';
  const d = isNew ? null : (await get(`/coach/diets/${idArg}`)).diet;
  const st = { name: d?.name || '', description: d?.description || '', calories: d?.calories ?? '', protein: d?.protein ?? '', carbs: d?.carbs ?? '', fat: d?.fat ?? '' };
  const meals = d ? d.meals.map((m) => ({ ...m, itemsText: (m.items || []).join('\n') })) : [{ name: 'Desayuno', time: '08:00', itemsText: '', notes: '' }];
  const defs = [
    { key: 'name', label: 'Nombre del plan', req: true, max: 100, full: true },
    { key: 'calories', label: 'Calorías diarias', type: 'number', unit: 'kcal', min: 500, max: 8000 }, { key: 'protein', label: 'Proteína', type: 'number', unit: 'g', min: 0, max: 600 },
    { key: 'carbs', label: 'Carbohidratos', type: 'number', unit: 'g', min: 0, max: 1200 }, { key: 'fat', label: 'Grasas', type: 'number', unit: 'g', min: 0, max: 400 },
    { key: 'description', label: 'Descripción', type: 'textarea', max: 600, full: true },
  ];
  const hint = h('p', { class: 'small muted' });
  const updHint = () => { const k = (Number(st.protein) || 0) * 4 + (Number(st.carbs) || 0) * 4 + (Number(st.fat) || 0) * 9; hint.textContent = k ? `Los macros suman ≈ ${k} kcal${st.calories ? ` (objetivo ${st.calories} kcal)` : ''}.` : ''; };
  const tf = form(defs, st, { onChange: updHint }); updHint();
  const mealsBox = h('div', { class: 'stack' });
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= meals.length) return; [meals[i], meals[j]] = [meals[j], meals[i]]; drawMeals(); };
  const renderMeals = () => mount(mealsBox, meals.map((m, i) => h('div', { class: 'day-editor stack' },
    h('div', { class: 'row wrap' },
      h('div', { style: { alignSelf: 'flex-end' } }, gripBtn('meal')),
      h('div', { class: 'grow', style: { minWidth: '180px' } }, simpleField('Comida', h('input', { class: 'input', value: m.name, maxlength: 60, oninput: (e) => { m.name = e.target.value; } }))),
      h('div', { style: { width: '120px' } }, simpleField('Hora', h('input', { class: 'input', type: 'time', value: m.time || '', oninput: (e) => { m.time = e.target.value; } }))),
      h('div', { class: 'row', style: { alignSelf: 'flex-end', gap: '2px' } }, posSelect(meals, i, 'Mover esta comida a la posición…', () => drawMeals()), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Subir', onclick: () => move(i, -1) }, icon('arrowUp')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Bajar', onclick: () => move(i, 1) }, icon('arrowDown')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Eliminar comida', onclick: () => { if (meals.length === 1) return toast('El plan necesita al menos una comida', 'error'); meals.splice(i, 1); drawMeals(); } }, icon('trash')))),
    simpleField('Alimentos (uno por línea)', h('textarea', { class: 'textarea', maxlength: 3000, oninput: (e) => { m.itemsText = e.target.value; } }, m.itemsText), { hint: 'Ej. “150 g de pechuga a la plancha”' }),
    simpleField('Nota (opcional)', h('input', { class: 'input', value: m.notes || '', maxlength: 300, oninput: (e) => { m.notes = e.target.value; } })))));
  const drawMeals = (focusLast) => {
    keepScroll(mealsBox, renderMeals);
    sortable([...mealsBox.children], (el) => el.querySelector(':scope > .row [data-drag="meal"]'), meals, () => drawMeals());
    if (focusLast) {
      const last = mealsBox.querySelector('.day-editor:last-child');
      last?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      last?.querySelector('input')?.focus({ preventScroll: true });
    }
  };
  drawMeals();
  const save = async () => {
    const errs = validate(defs, st); tf.showErrors(errs); if (Object.keys(errs).length) return;
    if (meals.some((m) => !String(m.name || '').trim())) return toast('Ponle nombre a cada comida', 'error');
    const body = { name: st.name, description: st.description || null, calories: numOrNull(st.calories), protein: numOrNull(st.protein), carbs: numOrNull(st.carbs), fat: numOrNull(st.fat),
      meals: meals.map((m) => ({ name: m.name, time: m.time || '', notes: m.notes || '', items: m.itemsText.split('\n').map((x) => x.trim()).filter(Boolean) })) };
    try { if (isNew) { const x = await post('/coach/diets', body); toast('Plan creado'); go(`#/dietas/${x.id}`); } else { await put(`/coach/diets/${idArg}`, body); toast('Plan guardado'); } } catch (e) { toast(e.message, 'error'); }
  };
  return page(back('#/dietas', 'Planes alimenticios'), head(isNew ? 'Nuevo plan alimenticio' : 'Editar plan', 'Los cambios se reflejan al instante en los clientes que lo tienen asignado.'),
    h('div', { class: 'stack lg' }, h('div', { class: 'card stack' }, tf, hint), h('div', {}, h('div', { class: 'card-head' }, h('h3', {}, 'Comidas del día')), mealsBox,
      h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn secondary', type: 'button', onclick: () => { meals.push({ name: `Comida ${meals.length + 1}`, time: '', itemsText: '', notes: '' }); drawMeals(true); } }, icon('plus'), 'Agregar comida'))),
      h('div', { class: 'sticky-actions' }, h('a', { class: 'btn secondary', href: '#/dietas' }, 'Volver'), h('button', { class: 'btn', onclick: save }, 'Guardar plan'))));
}

// ================================================================== CONFIGURACIÓN
async function configuracion({ refreshShell }) {
  const { settings } = await get('/coach/settings');
  const st = { ...settings, first_name: S.user.first_name, last_name: S.user.last_name || '' };
  const defs = [
    { key: 'first_name', label: 'Tu nombre', req: true, max: 60 }, { key: 'last_name', label: 'Apellidos', max: 80 },
    { key: 'trainer_name', label: 'Nombre público (lo ven tus clientes)', req: true, max: 80, full: true },
    { key: 'whatsapp', label: 'WhatsApp para contacto', type: 'tel', max: 30, placeholder: '+52 55 0000 0000', hint: 'Aparece en los botones “Activar Premium” de tus clientes gratuitos.' },
    { key: 'premium_price', label: 'Precio Premium (texto)', max: 80, placeholder: '$499 MXN / mes' },
    { key: 'upsell_message', label: 'Mensaje para clientes gratuitos', type: 'textarea', max: 300, full: true, placeholder: 'Ej. Premium incluye rutinas personalizadas, nutrición y seguimiento semanal.' },
  ];
  const f = form(defs, st);
  const ps = { current: '', password: '', password2: '' };
  const pdefs = [
    { key: 'current', label: 'Contraseña actual', type: 'password', req: true, autocomplete: 'current-password', full: true },
    { key: 'password', label: 'Nueva contraseña', type: 'password', req: true, strong: true, autocomplete: 'new-password' },
    { key: 'password2', label: 'Confirmar', type: 'password', req: true, autocomplete: 'new-password' },
  ];
  const pf = form(pdefs, ps);
  return page(head('Configuración', 'Tu perfil público y tu cuenta.'), h('div', { class: 'stack lg' },
    h('div', { class: 'card stack' }, cardHead('Perfil de entrenador'), f, h('div', {}, h('button', { class: 'btn', onclick: async () => {
      const errs = validate(defs, st); f.showErrors(errs); if (Object.keys(errs).length) return;
      try { await put('/me', { first_name: st.first_name, last_name: st.last_name }); await put('/coach/settings', { trainer_name: st.trainer_name, whatsapp: st.whatsapp, premium_price: st.premium_price, upsell_message: st.upsell_message }); await refreshShell(); toast('Configuración guardada'); } catch (e) { toast(e.message, 'error'); }
    } }, 'Guardar'))),
    h('div', { class: 'card stack' }, cardHead('Cambiar contraseña'), pf, h('div', {}, h('button', { class: 'btn', onclick: async () => {
      const errs = validate(pdefs, ps, (s) => (s.password !== s.password2 ? { password2: 'Las contraseñas no coinciden' } : {})); pf.showErrors(errs); if (Object.keys(errs).length) return;
      try { await post('/me/password', { current: ps.current, password: ps.password }); toast('Contraseña actualizada'); Object.assign(ps, { current: '', password: '', password2: '' }); pf.querySelectorAll('input').forEach((i) => { i.value = ''; }); } catch (e) { toast(e.message, 'error'); }
    } }, 'Actualizar contraseña'))),
    h('div', { class: 'card' }, cardHead('Enlace de registro'), h('p', { class: 'small muted', style: { marginBottom: '12px' } }, 'Compártelo con tus clientes. Todos se registran como plan gratuito y tú decides cuándo pasarlos a Premium.'),
      h('div', { class: 'row wrap' }, h('input', { class: 'input grow', readonly: true, value: `${location.origin}/#/registro`, onfocus: (e) => e.target.select(), 'aria-label': 'Enlace de registro' }), h('button', { class: 'btn secondary', onclick: () => copyText(`${location.origin}/#/registro`) }, icon('copy'), 'Copiar')))));
}

export const coachRoutes = { resumen, clientes: (ctx) => (ctx.args[0] ? clienteDetalle(ctx) : clientes(ctx)), ejercicios, rutinas, dietas, configuracion };
