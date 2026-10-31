import { h, mount, form, validate, toast, field, avatar, DAYS_SHORT, DAYS_FULL, todayISO } from './ui.js';
import { icon, logoMark, avatarSvg, AVATAR_KEYS } from './icons.js';
import { api, post, fileToDataUrl, ApiError } from './api.js';
import { S, loadMe, go } from './state.js';

// ------------------------------------------------------------------ diseño público (hero + panel)
function heroArt() {
  const wrap = h('div', { class: 'hero' });
  const img = h('img', { class: 'photo', src: '/img/hero.jpg', alt: '' });
  const art = h('div', { class: 'art' });
  art.innerHTML = `<svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
    <g stroke="#2B353C" stroke-width="1.2">
      <circle cx="560" cy="330" r="330"/><circle cx="560" cy="330" r="270"/><circle cx="560" cy="330" r="210"/><circle cx="560" cy="330" r="150"/>
      <path d="M-40 330h880M560 -20v700"/>
    </g>
    <circle cx="560" cy="330" r="92" stroke="#B69A6A" stroke-width="1.6"/>
    <circle cx="560" cy="330" r="14" fill="#B69A6A"/>
    <g stroke="#E5E7EB" stroke-width="1.4" stroke-linecap="round">
      <path d="M120 600h560"/><path d="M190 540v120M610 540v120"/><path d="M240 560v80M560 560v80"/><path d="M290 575v50M510 575v50"/>
    </g>
    <g stroke="#B69A6A" stroke-width="1.6"><path d="M120 720h120"/></g>
  </svg>`;
  img.addEventListener('error', () => img.remove());
  wrap.append(art, img, h('div', { class: 'shade' }),
    h('div', { class: 'caption' },
      h('div', { class: 'eyebrow' }, 'Entrenamiento personalizado'),
      h('h2', {}, 'Rutinas, nutrición y progreso. Guiados por tu entrenador.')));
  return wrap;
}
const publicLayout = (inner, { wide = false, showLogo = true } = {}) =>
  h('div', { class: 'split-screen view-in' }, heroArt(),
    h('main', { class: `pane ${wide ? 'wide' : ''}` },
      showLogo ? h('div', { class: 'top-logo' }, h('a', { class: 'logo', href: '#/', 'aria-label': 'GYMTRACK' }, logoMark(), 'GYMTRACK')) : null,
      h('div', { class: 'inner' }, inner)));

// ------------------------------------------------------------------ bienvenida
export function welcomeView() {
  return publicLayout(h('div', { class: 'center' },
    h('div', { class: 'welcome-logo' }, 'GYMTRACK'),
    h('div', { class: 'welcome-line' }),
    h('p', { class: 'welcome-phrase' }, h('b', {}, 'Tu esfuerzo.'), ' Tu evolución.'),
    h('div', { class: 'stack' },
      h('a', { class: 'btn lg block', href: '#/entrar' }, 'Iniciar sesión'),
      h('a', { class: 'btn secondary lg block', href: '#/registro' }, 'Crear cuenta'))), { showLogo: false });
}

// ------------------------------------------------------------------ inicio de sesión
export function loginView() {
  const st = { email: localStorage.getItem('gt_email') || '', password: '', remember: !!localStorage.getItem('gt_email') };
  const defs = [
    { key: 'email', label: 'Correo electrónico', type: 'email', req: true, autocomplete: 'email', placeholder: 'tu@correo.com', full: true },
    { key: 'password', label: 'Contraseña', type: 'password', req: true, autocomplete: 'current-password', full: true },
  ];
  const f = form(defs, st);
  const msg = h('div', { class: 'form-error', hidden: true, role: 'alert' });
  const btn = h('button', { class: 'btn lg block', type: 'submit' }, 'Iniciar sesión');
  const remember = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.remember, onchange: (e) => { st.remember = e.target.checked; } }), h('span', { class: 'small' }, 'Recordar sesión'));
  const el = h('form', { class: 'stack lg', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const errs = validate(defs, st);
    f.showErrors(errs);
    if (Object.keys(errs).length) return;
    btn.disabled = true;
    try {
      await post('/auth/login', { email: st.email, password: st.password, remember: st.remember });
      st.remember ? localStorage.setItem('gt_email', st.email.trim()) : localStorage.removeItem('gt_email');
      const d = await loadMe();
      go(d.user.role === 'trainer' ? '#/resumen' : '#/inicio');
    } catch (err) {
      msg.textContent = err.message; msg.hidden = false;
    } finally { btn.disabled = false; }
  } },
    h('div', {}, h('h1', {}, 'Bienvenido de nuevo'), h('p', { class: 'muted', style: { marginTop: '8px' } }, 'Ingresa para continuar con tu entrenamiento.')),
    msg, f,
    h('div', { class: 'row between' }, remember, h('a', { class: 'link small', href: '#/recuperar' }, '¿Olvidaste tu contraseña?')),
    btn,
    h('p', { class: 'center small muted' }, '¿Aún no tienes cuenta? ', h('a', { class: 'link', href: '#/registro' }, 'Crear cuenta')));
  return publicLayout(el);
}

// ------------------------------------------------------------------ recuperación
export function forgotView() {
  const st = { email: '' };
  const defs = [{ key: 'email', label: 'Correo electrónico', type: 'email', req: true, autocomplete: 'email', full: true }];
  const f = form(defs, st);
  const out = h('div', {});
  const draw = (sent) => mount(out, sent
    ? h('div', { class: 'stack' }, h('div', { class: 'form-ok' }, sent), h('p', { class: 'small muted' }, 'Si no recibes el enlace, pídeselo directamente a tu entrenador: puede generarte uno desde su panel.'), h('a', { class: 'btn secondary block', href: '#/entrar' }, 'Volver a iniciar sesión'))
    : h('form', { class: 'stack lg', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const errs = validate(defs, st); f.showErrors(errs);
      if (Object.keys(errs).length) return;
      try { const r = await post('/auth/forgot', { email: st.email }); draw(r.message); } catch (err) { toast(err.message, 'error'); }
    } }, f, h('button', { class: 'btn lg block', type: 'submit' }, 'Enviar enlace')));
  draw(null);
  return publicLayout(h('div', { class: 'stack lg' },
    h('div', {}, h('h1', {}, 'Recupera tu acceso'), h('p', { class: 'muted', style: { marginTop: '8px' } }, 'Escribe tu correo y te haremos llegar un enlace para crear una nueva contraseña.')),
    out, h('p', { class: 'center small' }, h('a', { class: 'link', href: '#/entrar' }, 'Volver'))));
}

export function resetView(token) {
  const st = { password: '', password2: '' };
  const defs = [
    { key: 'password', label: 'Nueva contraseña', type: 'password', req: true, strong: true, autocomplete: 'new-password', hint: 'Mínimo 8 caracteres, con letras y números.', full: true },
    { key: 'password2', label: 'Confirmar contraseña', type: 'password', req: true, autocomplete: 'new-password', full: true },
  ];
  const f = form(defs, st);
  const msg = h('div', { class: 'form-error', hidden: true });
  return publicLayout(h('form', { class: 'stack lg', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); msg.hidden = true;
    const errs = validate(defs, st, (s) => (s.password !== s.password2 ? { password2: 'Las contraseñas no coinciden' } : {}));
    f.showErrors(errs);
    if (Object.keys(errs).length) return;
    try { await post('/auth/reset', { token, password: st.password }); toast('Contraseña actualizada. Ya puedes iniciar sesión.'); go('#/entrar'); }
    catch (err) { msg.textContent = err.message; msg.hidden = false; }
  } }, h('div', {}, h('h1', {}, 'Crea una nueva contraseña')), msg, f, h('button', { class: 'btn lg block', type: 'submit' }, 'Guardar contraseña')));
}

// ------------------------------------------------------------------ registro multipaso
export const GOAL_OPTIONS = [
  ['lose_weight', 'Bajar de peso'], ['reduce_fat', 'Reducir grasa corporal'], ['gain_muscle', 'Ganar masa muscular'], ['strength', 'Aumentar fuerza'],
  ['endurance', 'Mejorar resistencia'], ['maintain', 'Mantener condición física'], ['wellness', 'Mejorar salud y bienestar'],
].map(([value, label]) => ({ value, label }));
export const dayOptions = DAYS_SHORT.map((l, i) => ({ value: i + 1, label: l, title: DAYS_FULL[i] }));
export const LEVEL_OPTIONS = [{ value: 'principiante', label: 'Principiante' }, { value: 'intermedio', label: 'Intermedio' }, { value: 'avanzado', label: 'Avanzado' }];
export const PLACE_OPTIONS = [{ value: 'gimnasio', label: 'Gimnasio' }, { value: 'casa', label: 'Casa' }, { value: 'ambos', label: 'Ambos' }];
export const TYPE_OPTIONS = [{ value: 'fuerza', label: 'Fuerza' }, { value: 'hipertrofia', label: 'Hipertrofia' }, { value: 'funcional', label: 'Funcional' }, { value: 'cardio', label: 'Cardio' }, { value: 'mixto', label: 'Mixto' }];
export const GENDER_OPTIONS = [{ value: 'femenino', label: 'Femenino' }, { value: 'masculino', label: 'Masculino' }, { value: 'otro', label: 'Otro' }, { value: 'prefiero no decirlo', label: 'Prefiero no decirlo' }];
export const DURATION_OPTIONS = [30, 45, 60, 75, 90, 120].map((m) => ({ value: m, label: `${m} minutos` }));
export const FREQ_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: `${n} ${n === 1 ? 'día' : 'días'} por semana` }));

const todayMinus = (years) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10); };

export const PREF_DEFS = [
  { key: 'level', label: 'Nivel de experiencia', type: 'chips', options: LEVEL_OPTIONS, req: true, full: true },
  { key: 'freq', label: 'Frecuencia semanal de entrenamiento', type: 'select', options: FREQ_OPTIONS, req: true },
  { key: 'duration', label: 'Duración por sesión', type: 'select', options: DURATION_OPTIONS, req: true },
  { key: 'days', label: 'Días disponibles', type: 'chips', multi: true, day: true, options: dayOptions, req: true, reqMsg: 'Elige al menos un día', full: true },
  { key: 'place', label: 'Dónde entrenas', type: 'chips', options: PLACE_OPTIONS, req: true, full: true },
  { key: 'training_type', label: 'Tipo de entrenamiento preferido', type: 'chips', options: TYPE_OPTIONS, full: true },
  { key: 'injuries', label: 'Lesiones o limitaciones físicas', type: 'textarea', max: 500, placeholder: 'Opcional. Cuéntale a tu entrenador si tienes alguna molestia o restricción.', full: true },
];

const STEPS = [
  {
    title: 'Información personal', sub: 'Lo básico para crear tu cuenta.', short: 'Datos',
    defs: [
      { key: 'first_name', label: 'Nombre', req: true, autocomplete: 'given-name', max: 60 },
      { key: 'last_name', label: 'Apellidos', req: true, autocomplete: 'family-name', max: 80 },
      { key: 'birth_date', label: 'Fecha de nacimiento', type: 'date', req: true, autocomplete: 'bday', min: todayMinus(100), max: todayMinus(16) },
      { key: 'phone', label: 'Teléfono (opcional)', type: 'tel', autocomplete: 'tel', max: 30, placeholder: '+52 55 0000 0000' },
      { key: 'email', label: 'Correo electrónico', type: 'email', req: true, autocomplete: 'email', full: true, max: 160 },
      { key: 'password', label: 'Contraseña', type: 'password', req: true, strong: true, autocomplete: 'new-password', hint: 'Mínimo 8 caracteres, con letras y números.' },
      { key: 'password2', label: 'Confirmar contraseña', type: 'password', req: true, autocomplete: 'new-password' },
    ],
    extra: (s) => {
      const e = {};
      if (s.password && s.password2 && s.password !== s.password2) e.password2 = 'Las contraseñas no coinciden';
      if (s.phone && !/^[0-9+()\-\s]{7,30}$/.test(s.phone)) e.phone = 'Escribe un teléfono válido';
      return e;
    },
  },
  { title: 'Fotografía de perfil', sub: 'Opcional. Ayuda a tu entrenador a reconocerte.', short: 'Foto', defs: [], custom: 'photo' },
  {
    title: 'Información física', sub: 'Tu punto de partida. Podrás actualizarlo cuando quieras.', short: 'Cuerpo',
    defs: [
      { key: 'height_cm', label: 'Altura', type: 'number', unit: 'cm', req: true, min: 100, max: 250 },
      { key: 'weight_kg', label: 'Peso actual', type: 'number', unit: 'kg', req: true, min: 25, max: 400 },
      { key: 'body_fat', label: 'Porcentaje de grasa corporal', type: 'number', unit: '%', min: 2, max: 70, hint: 'Opcional, si lo conoces.' },
      { key: 'muscle_mass', label: 'Masa muscular', type: 'number', unit: 'kg', min: 5, max: 150, hint: 'Opcional, si lo conoces.' },
      { key: 'waist', label: 'Medida de cintura', type: 'number', unit: 'cm', min: 40, max: 250 },
      { key: 'hip', label: 'Medida de cadera', type: 'number', unit: 'cm', min: 40, max: 250 },
      { key: 'gender', label: 'Género (opcional)', type: 'select', options: GENDER_OPTIONS },
      { key: 'bmi', label: 'IMC', type: 'bmi' },
    ],
  },
  {
    title: 'Objetivos personales', sub: 'Elige todos los que apliquen.', short: 'Objetivos',
    defs: [
      { key: 'goals', label: 'Mis objetivos', type: 'chips', multi: true, options: GOAL_OPTIONS, full: true },
      { key: 'custom_goal', label: 'Meta personalizada', max: 200, placeholder: 'Ej. Correr 5 km sin parar', full: true, hint: 'Opcional.' },
    ],
    extra: (s) => (!(s.goals || []).length && !(s.custom_goal || '').trim() ? { goals: 'Elige al menos un objetivo o escribe una meta personalizada' } : {}),
  },
  { title: 'Experiencia y preferencias', sub: 'Con esto tu entrenador diseña tu plan.', short: 'Entrenamiento', defs: PREF_DEFS },
];

const draftKey = 'gt_reg_draft';
const SENSITIVE = new Set(['password', 'password2', 'photo']);

export function registerView() {
  let draft = {};
  try { draft = JSON.parse(sessionStorage.getItem(draftKey) || '{}'); } catch { /* ignore */ }
  const st = { goals: [], days: [], ...draft, password: '', password2: '', photo: null };
  let step = Math.min(Number(sessionStorage.getItem(draftKey + '_step') || 0), STEPS.length - 1);
  if (step > 0 && !st.email) step = 0;
  const save = () => {
    const copy = Object.fromEntries(Object.entries(st).filter(([k]) => !SENSITIVE.has(k)));
    sessionStorage.setItem(draftKey, JSON.stringify(copy)); sessionStorage.setItem(draftKey + '_step', String(step));
  };

  const root = h('div', { class: 'stack lg' });
  const render = () => {
    const def = STEPS[step];
    save();
    const stepper = h('div', { class: 'stepper', role: 'list', 'aria-label': 'Progreso del registro' }, STEPS.map((s, i) =>
      h('div', { class: `s ${i < step ? 'done' : ''} ${i === step ? 'cur' : ''}`, role: 'listitem', 'aria-current': i === step ? 'step' : null },
        h('span', { class: 'dot' }, i < step ? icon('check') : String(i + 1)),
        h('span', { class: 'lbl' }, s.short),
        i < STEPS.length - 1 ? h('span', { class: 'ln' }, h('i')) : null)));
    stepper.querySelectorAll('.dot svg').forEach((s) => { s.style.width = '14px'; s.style.height = '14px'; });
    const msg = h('div', { class: 'form-error', hidden: true, role: 'alert' });
    const body = def.custom === 'photo' ? photoStep(st, save) : form(def.defs, st, { onChange: () => save() });
    const last = step === STEPS.length - 1;
    const next = h('button', { class: `btn ${last ? 'lg' : ''}`, type: 'submit' }, last ? 'CREAR MI CUENTA' : 'Continuar');
    const back = step > 0 ? h('button', { class: 'btn secondary', type: 'button', onclick: () => { step--; render(); window.scrollTo({ top: 0 }); } }, icon('chevL'), 'Atrás') : h('a', { class: 'btn ghost', href: '#/' }, 'Cancelar');

    mount(root,
      stepper,
      h('div', {}, h('div', { class: 'eyebrow' }, `Paso ${step + 1} de ${STEPS.length}`), h('h1', { style: { marginTop: '8px' } }, def.title), h('p', { class: 'muted', style: { marginTop: '6px' } }, def.sub)),
      h('form', { class: 'stack lg', novalidate: true, onsubmit: async (e) => {
        e.preventDefault(); msg.hidden = true;
        if (def.defs.length) {
          const errs = validate(def.defs, st, def.extra);
          body.showErrors?.(errs);
          if (Object.keys(errs).length) return;
        }
        if (!last) { step++; render(); window.scrollTo({ top: 0 }); return; }
        next.disabled = true; next.textContent = 'Creando tu cuenta…';
        try {
          await submit(st);
          sessionStorage.removeItem(draftKey); sessionStorage.removeItem(draftKey + '_step');
          const d = await loadMe();
          mount(root, success(d.user));
        } catch (err) {
          next.disabled = false; next.textContent = 'CREAR MI CUENTA';
          if (err instanceof ApiError && err.status === 409) { step = 0; render(); STEPS[0] && root.querySelector('[data-key="email"]')?.setError?.(err.message); toast(err.message, 'error'); return; }
          msg.textContent = err.message; msg.hidden = false;
        }
      } }, msg, body, h('div', { class: 'row between' }, back, next)),
      h('p', { class: 'center small muted' }, '¿Ya tienes cuenta? ', h('a', { class: 'link', href: '#/entrar' }, 'Iniciar sesión')));
  };
  render();
  return publicLayout(root, { wide: true });
}

async function submit(st) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return post('/auth/register', {
    first_name: st.first_name, last_name: st.last_name, birth_date: st.birth_date, email: st.email, phone: st.phone || null,
    password: st.password, password2: st.password2, photo: st.photo || undefined, avatar: st.photo ? undefined : st.avatar || undefined,
    goals: st.goals || [], custom_goal: st.custom_goal || '',
    profile: {
      height_cm: num(st.height_cm), weight_kg: num(st.weight_kg), body_fat: num(st.body_fat), muscle_mass: num(st.muscle_mass), waist: num(st.waist), hip: num(st.hip),
      gender: st.gender || null, level: st.level, freq: num(st.freq), days: st.days || [], duration: num(st.duration), place: st.place,
      training_type: st.training_type || null, injuries: st.injuries || null,
    },
  });
}

function success(user) {
  return h('div', { class: 'center stack lg view-in', style: { padding: '24px 0' } },
    h('div', { style: { margin: '0 auto', width: '72px', height: '72px', borderRadius: '50%', background: 'var(--ink)', color: 'var(--gold)', display: 'grid', placeItems: 'center' } }, icon('check')),
    h('div', {}, h('h1', {}, `¡Bienvenido/a, ${user.first_name}!`), h('p', { class: 'muted', style: { marginTop: '10px' } }, 'Tu cuenta está lista. Tu entrenador revisará tu perfil y te asignará tu rutina inicial.')),
    h('button', { class: 'btn lg block', onclick: () => go('#/inicio') }, 'Ir a mi panel'));
}

function photoStep(st, save) {
  const box = h('div', { class: 'stack lg' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'user', class: 'hidden' });
  const err = h('div', { class: 'form-error', hidden: true });
  const handle = async (file) => {
    err.hidden = true;
    try { st.photo = await fileToDataUrl(file, 900, 0.82); st.avatar = null; draw(); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  };
  fileInput.addEventListener('change', () => fileInput.files[0] && handle(fileInput.files[0]));
  camInput.addEventListener('change', () => camInput.files[0] && handle(camInput.files[0]));
  const draw = () => {
    save();
    const preview = h('span', { class: 'avatar xl' });
    if (st.photo) preview.append(h('img', { src: st.photo, alt: 'Vista previa de tu foto' }));
    else if (st.avatar) preview.append(avatarSvg(st.avatar));
    else preview.append(icon('user'));
    if (!st.photo && !st.avatar) preview.firstChild.style.cssText = 'width:44px;height:44px;color:#9aa1a9';
    mount(box,
      h('div', { class: 'photo-drop' }, preview,
        h('div', { class: 'row wrap', style: { justifyContent: 'center' } },
          h('button', { class: 'btn secondary sm', type: 'button', onclick: () => fileInput.click() }, icon('upload'), st.photo ? 'Cambiar foto' : 'Subir desde el dispositivo'),
          h('button', { class: 'btn secondary sm', type: 'button', onclick: () => camInput.click() }, icon('camera'), 'Tomar fotografía'),
          st.photo ? h('button', { class: 'btn danger sm', type: 'button', onclick: () => { st.photo = null; draw(); } }, icon('trash'), 'Eliminar') : null),
        h('p', { class: 'tiny muted' }, 'JPG, PNG o WebP. Se ajusta automáticamente.')),
      err,
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'O elige un avatar'),
        h('div', { class: 'avatar-pick' }, AVATAR_KEYS.map((k) =>
          h('button', { type: 'button', 'aria-label': `Avatar ${k}`, 'aria-pressed': String(st.avatar === k && !st.photo), onclick: () => { st.avatar = st.avatar === k ? null : k; st.photo = null; draw(); } }, h('span', { class: 'avatar' }, avatarSvg(k)))))),
      fileInput, camInput);
  };
  draw();
  return box;
}
