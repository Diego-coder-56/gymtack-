import { h, mount, spinner, toast, avatar, fullName, greeting, timeAgo, badgePlan } from './ui.js';
import { icon, logoMark } from './icons.js';
import { api, post, setUnauthorizedHandler } from './api.js';
import { S, loadMe, clearMe, go } from './state.js';
import { welcomeView, loginView, forgotView, resetView, registerView } from './auth.js';
import { clientRoutes, CLIENT_NAV } from './client.js';
import { coachRoutes, COACH_NAV } from './coach.js';

const app = document.getElementById('app');
let shell = null; // { el, view, side, topbar }
let viewToken = 0;

setUnauthorizedHandler(() => {
  if (S.user) { clearMe(); toast('Tu sesión expiró. Inicia sesión de nuevo.', 'error'); go('#/entrar'); }
});

const PUBLIC = new Set(['', 'entrar', 'registro', 'recuperar', 'restablecer']);

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
  const seg = raw.split('/').filter(Boolean).map(decodeURIComponent);
  return { seg, head: seg[0] || '' };
}

async function route() {
  const { seg, head } = parseHash();
  const isPublic = PUBLIC.has(head);
  window.scrollTo({ top: 0 });

  if (!S.user && !isPublic) { shell = null; return go('#/entrar'); }
  if (S.user && isPublic && head !== 'restablecer') return go(S.user.role === 'trainer' ? '#/resumen' : '#/inicio');

  if (isPublic) {
    shell = null;
    document.title = 'GYMTRACK';
    const views = { '': welcomeView, entrar: loginView, registro: registerView, recuperar: forgotView, restablecer: () => resetView(seg[1] || '') };
    return mount(app, views[head]());
  }

  // Refresca el plan/permisos en cada navegación: si el entrenador activa Premium, se refleja sin recargar.
  if (shell) {
    const was = S.access?.premium;
    try { await loadMe(); } catch (err) {
      if (err.status === 401) { clearMe(); shell = null; toast('Tu sesión expiró. Inicia sesión de nuevo.', 'error'); return go('#/entrar'); }
    }
    if (!S.user) return;
    if (was !== S.access?.premium) { shell = null; } else drawChrome();
  }
  const trainer = S.user.role === 'trainer';
  const routes = trainer ? coachRoutes : clientRoutes;
  const handler = routes[head];
  if (!handler) return go(trainer ? '#/resumen' : '#/inicio');
  if (!shell) buildShell();
  updateNav(head);
  shell.el.classList.remove('open');

  const token = ++viewToken;
  mount(shell.view, spinner());
  try {
    const node = await handler({ args: seg.slice(1), refreshShell });
    if (token !== viewToken) return;
    node.classList.add('view-in');
    mount(shell.view, node);
  } catch (err) {
    if (token !== viewToken) return;
    if (err.status === 401) return;
    mount(shell.view, h('div', { class: 'page' }, h('div', { class: 'card' }, h('div', { class: 'empty' }, h('h3', {}, 'No pudimos cargar esta sección'), h('p', {}, err.message || 'Inténtalo de nuevo.'), h('button', { class: 'btn', onclick: () => route() }, 'Reintentar')))));
  }
}

function buildShell() {
  const trainer = S.user.role === 'trainer';
  const nav = h('nav', { class: 'nav', 'aria-label': 'Navegación principal' });
  const items = trainer ? COACH_NAV : CLIENT_NAV;
  for (const it of items) {
    if (it.sep) { nav.append(h('hr')); continue; }
    if (it.action === 'logout') {
      nav.append(h('button', { type: 'button', onclick: logout }, icon(it.icon), it.label));
      continue;
    }
    const locked = !trainer && it.premium && !S.access?.premium;
    nav.append(h('a', { href: `#/${it.path}`, 'data-path': it.path }, icon(it.icon), it.label, locked ? icon('lock', 'lock') : null));
  }
  const side = h('aside', { class: 'side' },
    h('a', { class: 'logo', href: trainer ? '#/resumen' : '#/inicio' }, logoMark(), 'GYMTRACK', trainer ? h('small', {}, 'COACH') : null),
    nav, h('div', { class: 'side-user', id: 'side-user' }));
  const topbar = h('header', { class: 'topbar' });
  const view = h('main', { id: 'view', tabindex: '-1' });
  const scrim = h('div', { class: 'scrim', onclick: () => el.classList.remove('open') });
  const el = h('div', { class: 'shell' }, side, scrim, h('div', { class: 'main' }, topbar, view));
  shell = { el, view, side, topbar, nav };
  mount(app, el);
  drawChrome();
}

function updateNav(head) {
  shell.nav.querySelectorAll('a[data-path]').forEach((a) => {
    const on = a.dataset.path === head;
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
}

let notifOpen = false;
async function drawChrome() {
  if (!shell || !S.user) return;
  const u = S.user;
  const trainer = u.role === 'trainer';
  const side = shell.side.querySelector('#side-user');
  mount(side, avatar(u, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'name' }, fullName(u) || u.email), trainer ? h('span', { class: 'tiny muted' }, 'Entrenador') : badgePlan(u)));

  const bell = h('div', { class: 'notif-wrap' });
  const drawBell = async () => {
    let data = { items: [], unread: 0 };
    try { data = await api('/me/notifications'); } catch { /* ignore */ }
    const panel = h('div', { class: 'notif-panel', role: 'dialog', 'aria-label': 'Notificaciones' },
      data.items.length ? data.items.map((n) => h('div', { class: `notif-item ${n.read ? '' : 'unread'}` }, n.text, h('time', {}, timeAgo(n.created_at))))
        : h('div', { class: 'empty', style: { padding: '28px 12px' } }, 'No tienes notificaciones.'));
    const btn = h('button', { class: 'icon-btn', 'aria-label': `Notificaciones${data.unread ? ` (${data.unread} nuevas)` : ''}`, 'aria-expanded': String(notifOpen), onclick: async (e) => {
      e.stopPropagation();
      notifOpen = !notifOpen;
      if (notifOpen && data.unread) { post('/me/notifications/read').catch(() => {}); }
      await drawBell();
      if (notifOpen) setTimeout(() => document.addEventListener('click', closeNotif, { once: true }), 0);
    } }, icon('bell'), data.unread && !notifOpen ? h('span', { class: 'dot' }) : null);
    mount(bell, btn, notifOpen ? panel : null);
    panel.addEventListener('click', (e) => e.stopPropagation());
  };
  const closeNotif = () => { notifOpen = false; drawBell(); };
  drawBell();

  mount(shell.topbar,
    h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Abrir menú', onclick: () => shell.el.classList.add('open') }, icon('menu')),
    h('a', { href: trainer ? '#/configuracion' : '#/perfil', class: 'row', style: { textDecoration: 'none', minWidth: 0 } },
      avatar(u), h('div', { style: { minWidth: 0 } },
        h('div', { class: 'tiny muted' }, greeting()),
        h('div', { style: { fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, u.first_name || 'Hola'))),
    h('div', { class: 'grow' }),
    bell);
}
const refreshShell = async () => { await loadMe(); drawChrome(); };

async function logout() {
  try { await post('/auth/logout'); } catch { /* ignore */ }
  clearMe(); shell = null;
  go('#/');
}

window.addEventListener('hashchange', route);
(async function boot() {
  mount(app, spinner());
  try { await loadMe(); } catch { /* sin sesión */ }
  if (!location.hash) history.replaceState(null, '', S.user ? (S.user.role === 'trainer' ? '#/resumen' : '#/inicio') : '#/');
  route();
})();
