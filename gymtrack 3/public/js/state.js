import { api } from './api.js';

// Estado global compartido (sesión actual)
export const S = {
  user: null, profile: null, access: null, settings: {}, goalKinds: {},
  listeners: new Set(),
};

export async function loadMe() {
  const d = await api('/me', { silent401: true });
  S.user = d.user; S.profile = d.profile; S.access = d.access; S.settings = d.settings; S.goalKinds = d.goal_kinds;
  S.listeners.forEach((fn) => fn());
  return d;
}
export const clearMe = () => { S.user = S.profile = S.access = null; S.listeners.forEach((fn) => fn()); };
export const isTrainer = () => S.user?.role === 'trainer';
export const isPremium = () => !!S.access?.premium;

export const go = (hash) => {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
};
