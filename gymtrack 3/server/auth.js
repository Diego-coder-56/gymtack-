import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scrypt = promisify(crypto.scrypt);
export const COOKIE = 'gt_session';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const bad = (msg, status = 400, extra) => { throw new HttpError(status, msg, extra); };

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}
export async function verifyPassword(pw, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const tokenHash = sha;

const DAY = 24 * 3600 * 1000;

export async function createSession(userId, remember, d = db) {
  const token = newToken();
  const ttl = remember ? 30 * DAY : 1 * DAY;
  await d.run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', sha(token), userId, Date.now() + ttl);
  return { token, maxAge: remember ? ttl : null };
}

export function setSessionCookie(req, res, token, maxAge) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge) parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(req.headers.host || '');
  if (!local && (req.secure || process.env.NODE_ENV === 'production' || process.env.NETLIFY)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export async function loadUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const row = await db.get(`
    SELECT u.*, s.expires_at AS _exp FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`, sha(token));
  if (!row) return null;
  if (Number(row._exp) < Date.now() || !row.active) {
    await db.run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
    return null;
  }
  delete row._exp;
  return row;
}

export const requireAuth = async (req, _res, next) => {
  try {
    const u = await loadUser(req);
    if (!u) return next(new HttpError(401, 'Inicia sesión para continuar'));
    req.user = u;
    next();
  } catch (e) { next(e); }
};
export const requireTrainer = (req, _res, next) => {
  if (req.user?.role !== 'trainer') return next(new HttpError(403, 'Solo el entrenador puede hacer esto'));
  next();
};

// IP del visitante (detrás de Netlify)
export const clientIp = (req) =>
  req.headers['x-nf-client-connection-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';

// Limitador de intentos guardado en la base de datos (compartido entre instancias serverless)
export async function throttle(key, max = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const r = await db.get(
    `INSERT INTO rate_limits(key,n,reset_at) VALUES(?,1,?::float8)
     ON CONFLICT(key) DO UPDATE SET
       n = CASE WHEN rate_limits.reset_at < ?::float8 THEN 1 ELSE rate_limits.n + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < ?::float8 THEN ?::float8 ELSE rate_limits.reset_at END
     RETURNING n`, key, now + windowMs, now, now, now + windowMs);
  if (r.n > max) bad('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 429);
  if (Math.random() < 0.02) cleanupExpired().catch(() => {});
}
export const clearThrottle = (key) => db.run('DELETE FROM rate_limits WHERE key = ?', key);

export async function cleanupExpired() {
  const now = Date.now();
  await db.run('DELETE FROM rate_limits WHERE reset_at < ?', now);
  await db.run('DELETE FROM sessions WHERE expires_at < ?', now);
  await db.run('DELETE FROM reset_tokens WHERE expires_at < ?', now);
}

// ---------- Validadores ----------
export const str = (v, { max = 200, req = false, name = 'El campo' } = {}) => {
  if (v == null || v === '') { if (req) bad(`${name} es obligatorio`); return null; }
  if (typeof v !== 'string') bad(`${name} no es válido`);
  const t = v.trim();
  if (!t) { if (req) bad(`${name} es obligatorio`); return null; }
  if (t.length > max) bad(`${name} es demasiado largo (máx. ${max} caracteres)`);
  return t;
};
export const num = (v, { min = 0, max = 1e7, req = false, name = 'El valor', int = false } = {}) => {
  if (v == null || v === '') { if (req) bad(`${name} es obligatorio`); return null; }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) bad(`${name} debe estar entre ${min} y ${max}`);
  return int ? Math.round(n) : Math.round(n * 100) / 100;
};
export const isoDate = (v, { req = false, name = 'La fecha' } = {}) => {
  if (v == null || v === '') { if (req) bad(`${name} es obligatoria`); return null; }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T12:00:00Z'))) bad(`${name} no es válida`);
  return v;
};
export const oneOf = (v, list, { req = false, name = 'El valor' } = {}) => {
  if (v == null || v === '') { if (req) bad(`${name} es obligatorio`); return null; }
  if (!list.includes(v)) bad(`${name} no es válido`);
  return v;
};
export const email = (v) => {
  const e = str(v, { max: 160, req: true, name: 'El correo' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) bad('Escribe un correo válido');
  return e;
};
export const password = (v, name = 'La contraseña') => {
  if (typeof v !== 'string' || v.length < 8) bad(`${name} debe tener al menos 8 caracteres`);
  if (v.length > 200) bad(`${name} es demasiado larga`);
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) bad(`${name} debe incluir letras y números`);
  return v;
};
