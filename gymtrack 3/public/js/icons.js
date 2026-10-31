// Iconos lineales minimalistas (24x24, trazo 1.6). Contenido estático y de confianza.
const P = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.7-3.2 3-4.8 6-4.8s5.3 1.6 6 4.8"/><path d="M16 5.6a3.2 3.2 0 0 1 0 5.8"/><path d="M18 14.9c1.7.5 2.7 2 3 4.6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  dumbbell: '<path d="M3 12h18"/><path d="M6.5 7v10M17.5 7v10"/><path d="M3.5 9.5v5M20.5 9.5v5"/><path d="M9.5 9.5v5M14.5 9.5v5"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7.5 14 3.5-4 3 2.5 4.5-6"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  apple: '<path d="M12 8c-1.6-1.4-4.6-1.2-6 .8-1.7 2.4-.8 7 1.5 9.4 1.2 1.2 2.4 1.1 3.2.6.8-.4 1.8-.4 2.6 0 .8.5 2 .6 3.2-.6 2.3-2.4 3.2-7 1.5-9.4-1.4-2-4.4-2.2-6-.8Z"/><path d="M12 8c0-2 1.2-3.6 3-4"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  logout: '<path d="M9 4.5H6.5A2 2 0 0 0 4.5 6.5v11a2 2 0 0 0 2 2H9"/><path d="M15 8l4 4-4 4M19 12H9.5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5Z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevL: '<path d="m14.5 6-6 6 6 6"/>',
  chevR: '<path d="m9.5 6 6 6-6 6"/>',
  chevD: '<path d="m6 9.5 6 6 6-6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 3.9M6.5 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-.9"/><path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 3.7"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.3-2h6.4l1.3 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="12.8" r="3.3"/>',
  upload: '<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19.5h14"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7"/>',
  edit: '<path d="M14.5 5.5 18.5 9.5 8.5 19.5H4.5v-4Z"/><path d="m13 7 4 4"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  flame: '<path d="M12 3c.5 3-1.5 4.5-3 6.5S7 13 8 15.5c.6 1.5 2 2.5 4 2.5 3 0 5-2.2 5-5 0-2.6-1.6-3.8-2.6-5.5C13.6 6 12.5 4.5 12 3Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  play: '<path d="M8 5.5v13l10.5-6.5Z"/>',
  video: '<rect x="3.5" y="6" width="12.5" height="12" rx="2.5"/><path d="m16 10.5 4.5-2.5v8L16 13.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  card: '<rect x="3" y="6" width="18" height="12.5" rx="2.5"/><path d="M3 10.5h18M7 15h3"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  whatsapp: '<path d="M4.5 19.5 5.7 15.6A7.8 7.8 0 1 1 8.6 18.4Z"/><path d="M9.2 9c.2 2.4 2.5 4.7 5 5.1.6.1 1.2-.4 1.3-1l-1.5-.8-.8.6c-.9-.4-1.7-1.2-2.1-2.1l.6-.8-.8-1.5c-.6.1-1.1.7-1.1 1.3Z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  notes: '<path d="M6 4.5h9l3 3v12H6Z"/><path d="M14.5 4.5v3.5H18M9 12h6M9 15.5h4"/>',
  utensils: '<path d="M7 4v6.5a2 2 0 0 0 2 2v7.5M11 4v6.5a2 2 0 0 1-2 2M9 4v7"/><path d="M16.5 20V4c-2 1.5-3 4-3 7 0 1.4.9 2.2 2 2.2h1"/>',
  grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></g>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
};

export const icon = (name, cls = '') => {
  const s = document.createElement('span');
  s.style.display = 'contents';
  s.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  return s.firstChild;
};

// Marca GYMTRACK: mancuerna lineal con acento champán
export const logoMark = () => {
  const s = document.createElement('span');
  s.style.display = 'contents';
  s.innerHTML = '<svg class="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#151B1F"/><path d="M6.5 16h19M9 10.5v11M23 10.5v11M12.5 12.5v7M19.5 12.5v7" stroke="#B69A6A" stroke-width="1.9" stroke-linecap="round"/></svg>';
  return s.firstChild;
};

// Avatares geométricos predeterminados
const AV = {
  a1: '<rect width="64" height="64" fill="#F1F3F4"/><circle cx="32" cy="32" r="14" fill="none" stroke="#151B1F" stroke-width="2"/><circle cx="32" cy="32" r="4" fill="#B69A6A"/>',
  a2: '<rect width="64" height="64" fill="#151B1F"/><path d="M14 40 32 14l18 26Z" fill="none" stroke="#B69A6A" stroke-width="2" stroke-linejoin="round"/>',
  a3: '<rect width="64" height="64" fill="#E5E7EB"/><rect x="18" y="18" width="28" height="28" rx="6" fill="none" stroke="#151B1F" stroke-width="2"/><rect x="26" y="26" width="12" height="12" rx="3" fill="#151B1F"/>',
  a4: '<rect width="64" height="64" fill="#F4EFE6"/><path d="M14 44c6-16 12-16 18 0s12 16 18 0" fill="none" stroke="#151B1F" stroke-width="2" stroke-linecap="round"/>',
  a5: '<rect width="64" height="64" fill="#151B1F"/><circle cx="32" cy="32" r="16" fill="none" stroke="#E5E7EB" stroke-width="1.5"/><path d="M32 16v32M16 32h32" stroke="#B69A6A" stroke-width="1.5"/>',
  a6: '<rect width="64" height="64" fill="#F1F3F4"/><path d="M16 18h32M16 32h32M16 46h32" stroke="#151B1F" stroke-width="2" stroke-linecap="round"/><circle cx="44" cy="32" r="4" fill="#B69A6A"/>',
};
export const AVATAR_KEYS = Object.keys(AV);
export const avatarSvg = (key) => {
  const s = document.createElement('span');
  s.style.display = 'contents';
  s.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">${AV[key] || AV.a1}</svg>`;
  return s.firstChild;
};
