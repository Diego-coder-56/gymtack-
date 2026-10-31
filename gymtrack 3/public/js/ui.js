import { icon, avatarSvg } from './icons.js';

// Crea elementos DOM de forma segura (los textos nunca se interpretan como HTML).
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'selected', 'hidden', 'indeterminate'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...kids) => { clear(el); append(el, kids); return el; };

// ---------- formato ----------
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_ES = MONTHS;
export const DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtDate = (s, withYear = true) => { if (!s) return '—'; const d = parseISO(s.slice(0, 10)); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${withYear ? ' ' + d.getFullYear() : ''}`; };
export const fmtDateLong = (s) => { const d = parseISO(s); return `${DAYS_FULL[(d.getDay() + 6) % 7]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };
export const fmtNum = (n, dec = 1) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: dec }));
export const fmtMoney = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `${m} min`);
export const timeAgo = (sql) => {
  const d = new Date(sql.replace(' ', 'T') + 'Z');
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return fmtDate(sql.slice(0, 10));
};
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
export const initials = (u) => `${(u.first_name || u.email || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase();
export const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim();
export const calcBmi = (w, hcm) => (w && hcm ? Math.round((w / ((hcm / 100) ** 2)) * 10) / 10 : null);
export const bmiLabel = (b) => (b == null ? '' : b < 18.5 ? 'Bajo peso' : b < 25 ? 'Peso normal' : b < 30 ? 'Sobrepeso' : 'Obesidad');
export const waLink = (num, text = '') => { const d = String(num || '').replace(/\D/g, ''); return d ? `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}` : null; };

// ---------- componentes ----------
export function avatar(u, size = '') {
  const el = h('span', { class: `avatar ${size}` });
  if (u.photo) el.append(h('img', { src: u.photo, alt: '', loading: 'lazy' }));
  else if (u.avatar) el.append(avatarSvg(u.avatar));
  else el.textContent = initials(u);
  return el;
}
export const badgePlan = (u) => (u.premium ? h('span', { class: 'badge premium' }, 'Premium') : h('span', { class: 'badge' }, 'Gratis'));
export const spinner = () => h('div', { class: 'loading' }, h('div', { class: 'spinner' }));

export function toast(msg, type = 'ok') {
  const t = h('div', { class: `toast ${type === 'error' ? 'error' : ''}`, role: 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, type === 'error' ? 5200 : 3000);
}

export function modal({ title, body, actions = [], size = '', onClose }) {
  const prevFocus = document.activeElement;
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' });
  const close = (result) => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    prevFocus?.focus?.();
    onClose?.(result);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  const foot = h('div', { class: 'modal-foot' }, actions.map((a) => {
    const b = h('button', { class: `btn ${a.kind || ''}`, type: 'button', onclick: async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { const r = await a.onClick(close); if (r !== false && a.closes !== false) close(r); }
      catch (err) { toast(err.message || 'Ocurrió un error', 'error'); }
      finally { b.disabled = false; }
    } }, a.label);
    return b;
  }));
  const box = h('div', { class: `modal ${size}` },
    h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onclick: () => close() }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? foot : null);
  overlay.append(box);
  document.body.append(overlay);
  (box.querySelector('input,select,textarea') || box.querySelector('.btn'))?.focus();
  return { close };
}

export const confirmDialog = (title, text, okLabel = 'Confirmar', danger = false) =>
  new Promise((resolve) => {
    modal({
      title, body: h('p', { class: 'muted' }, text), onClose: (r) => resolve(r === true),
      actions: [{ label: 'Cancelar', kind: 'secondary' }, { label: okLabel, kind: danger ? 'danger' : '', onClick: () => true }],
    });
  });

export function lightbox(src) {
  modal({ title: '', body: h('img', { class: 'lightbox', src, alt: 'Foto de progreso' }), size: 'lg' });
}

// ---------- formularios ----------
// Cada campo: {key,label,type,req,options,unit,hint,min,max,step,placeholder,full,autocomplete,help}
export function field(def, state, ctx = {}) {
  const wrap = h('div', { class: `field ${def.full ? 'full' : ''}`, 'data-key': def.key });
  const id = `f-${def.key}-${Math.random().toString(36).slice(2, 7)}`;
  const label = h('label', { for: id }, def.label, def.req ? h('span', { class: 'req', title: 'Obligatorio' }, '*') : null);
  const err = h('div', { class: 'err', role: 'alert', hidden: true });
  const hint = def.hint ? h('div', { class: 'hint' }, def.hint) : null;
  let control;
  let extra = null;

  const set = (v) => { state[def.key] = v; ctx.onChange?.(def.key, v); if (wrap.classList.contains('invalid')) setError(null); };
  const setError = (m) => { wrap.classList.toggle('invalid', !!m); err.hidden = !m; err.textContent = m || ''; };
  wrap.setError = setError;

  if (def.type === 'select') {
    control = h('select', { class: 'select', id, onchange: (e) => set(e.target.value) },
      h('option', { value: '' }, def.placeholder || 'Selecciona…'),
      def.options.map((o) => h('option', { value: o.value ?? o, selected: String(state[def.key] ?? '') === String(o.value ?? o) }, o.label ?? o)));
  } else if (def.type === 'textarea') {
    control = h('textarea', { class: 'textarea', id, maxlength: def.max || 500, placeholder: def.placeholder || '', oninput: (e) => set(e.target.value) });
    control.value = state[def.key] ?? '';
  } else if (def.type === 'chips') {
    const group = h('div', { class: 'chips', role: 'group', 'aria-label': def.label });
    const draw = () => {
      clear(group);
      const cur = def.multi ? (state[def.key] || []) : state[def.key];
      for (const o of def.options) {
        const val = o.value ?? o;
        const on = def.multi ? cur.includes(val) : cur === val;
        group.append(h('button', { type: 'button', class: `chip ${def.day ? 'day' : ''}`, 'aria-pressed': String(on), title: o.title || '', onclick: () => {
          if (def.multi) { const a = new Set(state[def.key] || []); a.has(val) ? a.delete(val) : a.add(val); set([...a].sort()); }
          else set(cur === val && !def.req ? '' : val);
          draw();
        } }, o.label ?? o));
      }
    };
    draw();
    control = group;
  } else if (def.type === 'bmi') {
    const val = h('b', {}, '—'), lab = h('span', { class: 'muted small' });
    control = h('div', { class: 'bmi-box', id }, h('div', {}, h('div', { class: 'small muted' }, 'Se calcula con tu peso y altura'), lab), val);
    wrap.update = () => { const b = calcBmi(Number(state.weight_kg), Number(state.height_cm)); val.textContent = b ? fmtNum(b) : '—'; lab.textContent = bmiLabel(b); };
    wrap.update();
  } else {
    const attrs = {
      class: 'input', id, type: def.type === 'number' ? 'number' : def.type === 'combo' ? 'text' : def.type || 'text', autocomplete: def.autocomplete || 'off',
      list: def.type === 'combo' ? `${id}-list` : null,
      placeholder: def.placeholder || '', maxlength: def.max && def.type !== 'number' ? def.max : null,
      min: def.min, max: def.type === 'number' ? def.max : null, step: def.step || (def.type === 'number' ? 'any' : null), inputmode: def.type === 'number' ? 'decimal' : null,
      oninput: (e) => set(e.target.value),
    };
    const input = h('input', attrs);
    input.value = state[def.key] ?? '';
    if (def.type === 'combo') extra = h('datalist', { id: `${id}-list` }, (def.options || []).map((o) => h('option', { value: o.value ?? o })));
    if (def.type === 'password') {
      const tg = h('button', { type: 'button', class: 'icon-btn toggle', 'aria-label': 'Mostrar u ocultar contraseña', onclick: () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        clear(tg); tg.append(icon(show ? 'eyeOff' : 'eye'));
      } }, icon('eye'));
      control = h('div', { class: 'input-wrap' }, input, tg);
    } else if (def.unit) control = h('div', { class: 'input-wrap' }, input, h('span', { class: 'suffix' }, def.unit));
    else control = input;
  }
  append(wrap, [label, control, extra, hint, err]);
  return wrap;
}

export function form(defs, state, { onChange } = {}) {
  const root = h('div', { class: 'form-grid' });
  const fields = new Map();
  const ctx = { onChange: (k, v) => { onChange?.(k, v); for (const f of fields.values()) f.update?.(); } };
  for (const d of defs) { const f = field(d, state, ctx); fields.set(d.key, f); root.append(f); }
  root.showErrors = (errs) => {
    let first = null;
    for (const [k, f] of fields) { f.setError(errs[k] || null); if (errs[k] && !first) first = f; }
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first?.querySelector('input,select,textarea,button')?.focus({ preventScroll: true });
  };
  return root;
}

export function validate(defs, state, extra) {
  const errs = {};
  for (const d of defs) {
    const v = state[d.key];
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (d.req && empty) { errs[d.key] = d.reqMsg || 'Este campo es obligatorio'; continue; }
    if (empty) continue;
    if (d.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) errs[d.key] = 'Escribe un correo válido';
    if (d.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) errs[d.key] = 'Escribe un número';
      else if (d.min != null && n < d.min) errs[d.key] = `Debe ser al menos ${d.min}`;
      else if (d.max != null && n > d.max) errs[d.key] = `Debe ser máximo ${d.max}`;
    }
    if (d.type === 'password' && d.strong && (v.length < 8 || !/[A-Za-z]/.test(v) || !/\d/.test(v))) errs[d.key] = 'Mínimo 8 caracteres, con letras y números';
  }
  return { ...errs, ...(extra ? extra(state) : {}) };
}

export const simpleField = (label, input, { hint, req } = {}) =>
  h('div', { class: 'field' }, h('label', {}, label, req ? h('span', { class: 'req' }, '*') : null), input, hint ? h('div', { class: 'hint' }, hint) : null);

export function lockedCard({ title, text, settings, compact = false }) {
  const wa = waLink(settings?.whatsapp, 'Hola, quiero activar mi plan Premium en GYMTRACK');
  return h('div', { class: `locked ${compact ? 'compact' : ''}` },
    h('div', { class: 'ico' }, icon('lock')),
    h('h3', {}, title || 'Función Premium'),
    h('p', {}, text || 'Disponible con tu plan Premium.'),
    settings?.premium_price ? h('div', { class: 'badge premium' }, settings.premium_price) : null,
    settings?.upsell_message ? h('p', { class: 'small' }, settings.upsell_message) : null,
    wa ? h('a', { class: 'btn sm', href: wa, target: '_blank', rel: 'noopener' }, icon('whatsapp'), `Hablar con ${settings.trainer_name || 'mi entrenador'}`)
      : h('p', { class: 'small' }, 'Pide a tu entrenador que active tu plan Premium.'));
}

export const emptyState = (title, text, action) =>
  h('div', { class: 'empty' }, h('h3', {}, title), h('p', {}, text), action || null);
