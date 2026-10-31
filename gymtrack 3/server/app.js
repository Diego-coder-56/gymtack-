import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, tx, getSetting, setSetting } from './db.js';
import { EXTRA_EXERCISES, ready } from './seed.js';
import { putFile, getFile, removeFile } from './storage.js';
import {
  HttpError, bad, hashPassword, verifyPassword, createSession, setSessionCookie, clearSessionCookie,
  readCookie, COOKIE, tokenHash, newToken, requireAuth, requireTrainer, throttle, clearThrottle, clientIp,
  str, num, isoDate, oneOf, email as vEmail, password as vPassword,
} from './auth.js';

// ---------------------------------------------------------------- utilidades
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const todayUTC = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};
const isoWeekday = (iso) => { const g = new Date(iso + 'T12:00:00Z').getUTCDay(); return g === 0 ? 7 : g; };
const ageOn = (birth, on = todayUTC()) => {
  const b = new Date(birth + 'T12:00:00Z'), n = new Date(on + 'T12:00:00Z');
  let a = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--;
  return a;
};
const bmi = (w, h) => (w && h ? Math.round((w / ((h / 100) ** 2)) * 10) / 10 : null);
const parseJSON = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const clientDate = (req) => isoDate(req.query.date, { name: 'La fecha' }) || todayUTC();

export const isPremium = (u) =>
  u.role === 'trainer' || (u.plan === 'premium' && (!u.plan_until || u.plan_until >= todayUTC()));

const access = (u) => {
  const premium = isPremium(u);
  return {
    premium,
    plan: u.plan,
    plan_until: u.plan_until,
    expired: u.plan === 'premium' && !premium,
    features: { routines: premium ? 'all' : 'one', nutrition: premium, progress: premium, calendar: premium, measurements_limit: premium ? null : 3 },
  };
};
const requirePremium = (what) => (req, _res, next) => {
  if (!isPremium(req.user)) return next(new HttpError(403, `${what} es parte del plan Premium`, { upgrade: true }));
  next();
};

const pubUser = (u) => ({
  id: u.id, email: u.email, role: u.role, first_name: u.first_name, last_name: u.last_name,
  birth_date: u.birth_date, phone: u.phone, avatar: u.avatar,
  photo: u.photo ? `/api/files/${u.photo}` : null,
  plan: u.plan, plan_until: u.plan_until, premium: isPremium(u), active: !!u.active, created_at: u.created_at,
});
const getProfile = async (id, d = db) => {
  const p = (await d.get('SELECT * FROM profiles WHERE user_id = ?', id)) || {};
  const out = { ...p, days: parseJSON(p.days, []) };
  delete out.user_id;
  out.bmi = bmi(out.weight_kg, out.height_cm);
  return out;
};
const notify = (userId, text, d = db) => d.run('INSERT INTO notifications(user_id,text) VALUES(?,?)', userId, text);

// ---------------------------------------------------------------- imágenes
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
async function saveImage(dataUrl) {
  const m = typeof dataUrl === 'string' && IMG_RE.exec(dataUrl);
  if (!m) bad('La imagen no es válida (usa JPG, PNG o WebP)');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) bad('La imagen supera los 4 MB', 413);
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  if (!(isJpg || isPng || isWebp)) bad('El archivo no es una imagen válida');
  const ext = isJpg ? 'jpg' : isPng ? 'png' : 'webp';
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await putFile(name, buf, ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
  return name;
}

// ---------------------------------------------------------------- catálogos
const GOAL_KINDS = {
  lose_weight: { label: 'Bajar de peso', metric: 'weight' },
  reduce_fat: { label: 'Reducir grasa corporal', metric: 'body_fat' },
  gain_muscle: { label: 'Ganar masa muscular', metric: 'muscle_mass' },
  strength: { label: 'Aumentar fuerza' },
  endurance: { label: 'Mejorar resistencia' },
  maintain: { label: 'Mantener condición física' },
  wellness: { label: 'Mejorar salud y bienestar' },
  custom: { label: 'Meta personalizada' },
};
const METRICS = { weight: 'weight_kg', body_fat: 'body_fat', muscle_mass: 'muscle_mass', waist: 'waist' };
const LEVELS = ['principiante', 'intermedio', 'avanzado'];
const PLACES = ['gimnasio', 'casa', 'ambos'];
const TYPES = ['fuerza', 'hipertrofia', 'funcional', 'cardio', 'mixto'];
const GENDERS = ['femenino', 'masculino', 'otro', 'prefiero no decirlo'];
const AVATARS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
const MIN_AGE = 16;

function goalPct(g, profile) {
  if (g.done) return 100;
  if (g.metric && g.target_value != null && g.start_value != null) {
    const cur = profile[METRICS[g.metric]];
    if (cur == null) return 0;
    if (g.start_value === g.target_value) return cur === g.target_value ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round(((g.start_value - cur) / (g.start_value - g.target_value)) * 100)));
  }
  return g.progress || 0;
}
const listGoals = async (userId, d = db) => {
  const profile = await getProfile(userId, d);
  return (await d.all('SELECT * FROM goals WHERE user_id = ? ORDER BY done, id', userId)).map((g) => ({ ...g, done: !!g.done, pct: goalPct(g, profile) }));
};
const goalsAverage = (goals) => (goals.length ? Math.round(goals.reduce((a, g) => a + g.pct, 0) / goals.length) : 0);

async function syncProfileFromMeasurements(userId, d = db) {
  for (const [col, field] of [['weight', 'weight_kg'], ['body_fat', 'body_fat'], ['muscle_mass', 'muscle_mass'], ['waist', 'waist'], ['hip', 'hip']]) {
    const r = await d.get(`SELECT ${col} AS v FROM measurements WHERE user_id=? AND ${col} IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1`, userId);
    await d.run(`UPDATE profiles SET ${field} = ? WHERE user_id = ?`, r ? r.v : null, userId);
  }
}

// ---------------------------------------------------------------- rutinas / dietas
const exerciseMap = async (d = db) => new Map((await d.all('SELECT * FROM exercises')).map((e) => [e.id, e]));
// Compatibilidad: las rutinas antiguas guardaban un solo `weekday`; ahora cada día tiene `weekdays` (varios días de la semana).
const dayWeekdays = (d) => [...new Set((Array.isArray(d.weekdays) ? d.weekdays : d.weekday ? [d.weekday] : []).map(Number))].filter((n) => n >= 1 && n <= 7).sort((a, b) => a - b);
const normDays = (days) => days.map(({ weekday, ...d }) => ({ ...d, weekdays: dayWeekdays({ weekday, ...d }) }));
function resolveRoutine(row, exMap) {
  const days = normDays(parseJSON(row.days, [])).map((d) => ({
    ...d,
    exercises: (d.exercises || []).map((e) => {
      const ex = exMap.get(e.exercise_id);
      return { ...e, name: ex?.name || 'Ejercicio eliminado', muscle: ex?.muscle || '', equipment: ex?.equipment || '', description: ex?.description || '', video_url: ex?.video_url || '' };
    }),
  }));
  return { id: row.id, name: row.name, description: row.description, level: row.level, goal: row.goal, tier: row.tier, days, assigned_at: row.assigned_at, assignment_id: row.aid };
}
async function clientRoutines(user) {
  const exMap = await exerciseMap();
  const rows = await db.all(`SELECT cr.id AS aid, cr.assigned_at, r.* FROM client_routines cr JOIN routines r ON r.id = cr.routine_id
    WHERE cr.user_id = ? ORDER BY cr.assigned_at DESC, cr.id DESC`, user.id);
  let list = rows.map((r) => resolveRoutine(r, exMap));
  if (!isPremium(user)) list = list.filter((r) => r.tier === 'free').slice(0, 1);
  return list;
}
async function cleanDays(days) {
  if (!Array.isArray(days) || !days.length) bad('Agrega al menos un día a la rutina');
  if (days.length > 14) bad('Una rutina puede tener máximo 14 días');
  const ids = new Set((await db.all('SELECT id FROM exercises')).map((r) => r.id));
  return days.map((d, i) => {
    const exs = Array.isArray(d.exercises) ? d.exercises : [];
    if (exs.length > 40) bad(`El día ${i + 1} tiene demasiados ejercicios`);
    return {
      name: str(d.name, { max: 80, req: true, name: `El nombre del día ${i + 1}` }),
      weekdays: (() => {
        const raw = Array.isArray(d.weekdays) ? d.weekdays : d.weekday ? [d.weekday] : [];
        const list = raw.map(Number);
        if (list.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) bad(`Los días de la semana del día ${i + 1} no son válidos`);
        return [...new Set(list)].sort((a, b) => a - b);
      })(),
      notes: str(d.notes, { max: 300 }) || '',
      exercises: exs.map((e, j) => {
        const id = num(e.exercise_id, { min: 1, int: true, req: true, name: `El ejercicio ${j + 1} del día ${i + 1}` });
        if (!ids.has(id)) bad(`El ejercicio ${j + 1} del día ${i + 1} ya no existe`);
        return {
          exercise_id: id,
          sets: num(e.sets, { min: 1, max: 30, int: true, req: true, name: 'Las series' }),
          reps: str(e.reps, { max: 30, req: true, name: 'Las repeticiones' }),
          rest: str(e.rest, { max: 30 }) || '',
          notes: str(e.notes, { max: 300 }) || '',
        };
      }),
    };
  });
}
function cleanMeals(meals) {
  if (!Array.isArray(meals) || !meals.length) bad('Agrega al menos una comida al plan');
  if (meals.length > 12) bad('Máximo 12 comidas por plan');
  return meals.map((m, i) => {
    const items = (Array.isArray(m.items) ? m.items : []).map((x) => str(x, { max: 300 })).filter(Boolean);
    if (items.length > 25) bad(`La comida ${i + 1} tiene demasiados alimentos`);
    return { name: str(m.name, { max: 60, req: true, name: `El nombre de la comida ${i + 1}` }), time: str(m.time, { max: 10 }) || '', items, notes: str(m.notes, { max: 300 }) || '' };
  });
}
const dietRow = (r) => ({ ...r, meals: parseJSON(r.meals, []) });

// ---------------------------------------------------------------- app
export function createApp({ serveStatic = false, publicDir } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (serveStatic) {
      res.setHeader('Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
    next();
  });
  app.use(express.json({ limit: '6mb' }));
  app.use(['/api', '/.netlify/functions/api'], (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const api = express.Router();
  // Netlify reescribe /api/* hacia /.netlify/functions/api/*; aceptamos ambas rutas
  app.use(['/api', '/.netlify/functions/api'], api);

  // Los ids de la URL deben ser números (evita errores de la base de datos con valores raros)
  const numericParam = (_req, _res, next, v) => (/^\d{1,9}$/.test(v) ? next() : next(new HttpError(404, 'No encontrado')));
  const bindParams = (r) => ['id', 'aid', 'pid'].forEach((n) => r.param(n, numericParam));

  api.get('/health', (_req, res) => res.json({ ok: true }));

  // Prepara la base la primera vez (contenido de ejemplo y cuenta del entrenador)
  api.use(ah(async (_req, _res, next) => { await ready(); next(); }));

  // ------------------------------------------------------------ ajustes públicos
  const publicSettings = async () => ({
    trainer_name: await getSetting('trainer_name', 'Tu entrenador'),
    whatsapp: await getSetting('whatsapp'),
    premium_price: await getSetting('premium_price'),
    upsell_message: await getSetting('upsell_message'),
  });
  api.get('/public', ah(async (_req, res) => res.json({ settings: await publicSettings(), goal_kinds: GOAL_KINDS })));

  // ------------------------------------------------------------ autenticación
  api.post('/auth/register', ah(async (req, res) => {
    const b = req.body || {};
    await throttle(`reg|${clientIp(req)}`, 20, 60 * 60 * 1000);
    const mail = vEmail(b.email);
    const pass = vPassword(b.password);
    if (b.password !== b.password2) bad('Las contraseñas no coinciden');
    const first = str(b.first_name, { max: 60, req: true, name: 'El nombre' });
    const last = str(b.last_name, { max: 80, req: true, name: 'Los apellidos' });
    const birth = isoDate(b.birth_date, { req: true, name: 'La fecha de nacimiento' });
    if (birth > todayUTC()) bad('La fecha de nacimiento no es válida');
    const age = ageOn(birth);
    if (age < MIN_AGE) bad(`Debes tener al menos ${MIN_AGE} años para crear una cuenta`);
    if (age > 100) bad('La fecha de nacimiento no es válida');
    const phone = str(b.phone, { max: 30, name: 'El teléfono' });
    if (phone && !/^[0-9+()\-\s]{7,30}$/.test(phone)) bad('El teléfono no es válido');
    if (await db.get('SELECT 1 AS x FROM users WHERE lower(email) = ?', mail)) bad('Ya existe una cuenta con ese correo', 409);

    const p = b.profile || {};
    const prof = {
      gender: oneOf(p.gender, GENDERS, { name: 'El género' }),
      height_cm: num(p.height_cm, { min: 100, max: 250, req: true, name: 'La altura (cm)' }),
      weight_kg: num(p.weight_kg, { min: 25, max: 400, req: true, name: 'El peso (kg)' }),
      body_fat: num(p.body_fat, { min: 2, max: 70, name: 'El porcentaje de grasa' }),
      muscle_mass: num(p.muscle_mass, { min: 5, max: 150, name: 'La masa muscular' }),
      waist: num(p.waist, { min: 40, max: 250, name: 'La cintura' }),
      hip: num(p.hip, { min: 40, max: 250, name: 'La cadera' }),
      level: oneOf(p.level, LEVELS, { req: true, name: 'El nivel' }),
      freq: num(p.freq, { min: 1, max: 7, int: true, req: true, name: 'La frecuencia semanal' }),
      days: [...new Set((Array.isArray(p.days) ? p.days : []).map(Number).filter((d) => d >= 1 && d <= 7))].sort(),
      duration: num(p.duration, { min: 15, max: 240, int: true, req: true, name: 'La duración por sesión' }),
      place: oneOf(p.place, PLACES, { req: true, name: 'El lugar de entrenamiento' }),
      training_type: oneOf(p.training_type, TYPES, { name: 'El tipo de entrenamiento' }),
      injuries: str(p.injuries, { max: 500, name: 'Las lesiones' }),
    };
    if (!prof.days.length) bad('Elige al menos un día disponible');
    const kinds = [...new Set(Array.isArray(b.goals) ? b.goals : [])].filter((k) => k !== 'custom');
    for (const k of kinds) if (!GOAL_KINDS[k]) bad('Uno de los objetivos no es válido');
    const customGoal = str(b.custom_goal, { max: 200, name: 'La meta personalizada' });
    if (!kinds.length && !customGoal) bad('Elige al menos un objetivo');
    const avatar = b.avatar ? oneOf(b.avatar, AVATARS, { name: 'El avatar' }) : null;

    const hash = await hashPassword(pass);
    const photo = b.photo ? await saveImage(b.photo) : null;
    let uid;
    try {
      uid = await tx(async (t) => {
        const id = await t.insert('INSERT INTO users(email,pass_hash,first_name,last_name,birth_date,phone,photo,avatar) VALUES(?,?,?,?,?,?,?,?)',
          mail, hash, first, last, birth, phone, photo, photo ? null : avatar);
        await t.run(`INSERT INTO profiles(user_id,gender,height_cm,weight_kg,body_fat,muscle_mass,waist,hip,level,freq,days,duration,place,training_type,injuries)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, prof.gender, prof.height_cm, prof.weight_kg, prof.body_fat, prof.muscle_mass, prof.waist, prof.hip,
          prof.level, prof.freq, JSON.stringify(prof.days), prof.duration, prof.place, prof.training_type, prof.injuries);
        await t.run('INSERT INTO measurements(user_id,date,weight,body_fat,muscle_mass,waist,hip,notes) VALUES(?,?,?,?,?,?,?,?)',
          id, todayUTC(), prof.weight_kg, prof.body_fat, prof.muscle_mass, prof.waist, prof.hip, 'Medición inicial');
        for (const k of kinds) await t.run('INSERT INTO goals(user_id,kind,title,metric) VALUES(?,?,?,?)', id, k, GOAL_KINDS[k].label, GOAL_KINDS[k].metric || null);
        if (customGoal) await t.run('INSERT INTO goals(user_id,kind,title,metric) VALUES(?,?,?,?)', id, 'custom', customGoal, null);
        await notify(id, `¡Bienvenido/a a GYMTRACK, ${first}! Tu entrenador revisará tu perfil y te asignará tu rutina.`, t);
        return id;
      });
    } catch (e) {
      await removeFile(photo);
      if (e.code === '23505') bad('Ya existe una cuenta con ese correo', 409);
      throw e;
    }
    const { token, maxAge } = await createSession(uid, true);
    setSessionCookie(req, res, token, maxAge);
    res.status(201).json({ ok: true });
  }));

  api.post('/auth/login', ah(async (req, res) => {
    const { email: rawMail, password: pass, remember } = req.body || {};
    const mail = typeof rawMail === 'string' ? rawMail.trim().toLowerCase() : '';
    const key = `login|${clientIp(req)}|${mail}`;
    await throttle(key);
    const u = mail && typeof pass === 'string' ? await db.get('SELECT * FROM users WHERE lower(email) = ?', mail) : null;
    // Siempre verificamos un hash para no revelar si el correo existe por tiempo de respuesta
    const ok = await verifyPassword(typeof pass === 'string' ? pass : '', u ? u.pass_hash : 'aa:bb');
    if (!u || !ok) bad('Correo o contraseña incorrectos', 401);
    if (!u.active) bad('Tu cuenta está desactivada. Contacta a tu entrenador.', 403);
    await clearThrottle(key);
    const { token, maxAge } = await createSession(u.id, !!remember);
    setSessionCookie(req, res, token, maxAge);
    res.json({ ok: true, role: u.role });
  }));

  api.post('/auth/logout', ah(async (req, res) => {
    const t = readCookie(req, COOKIE);
    if (t) await db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash(t));
    clearSessionCookie(res);
    res.json({ ok: true });
  }));

  const baseUrl = (req) => (process.env.PUBLIC_URL || process.env.URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  api.post('/auth/forgot', ah(async (req, res) => {
    await throttle(`forgot|${clientIp(req)}`, 10, 60 * 60 * 1000);
    const mail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const u = mail ? await db.get('SELECT id,email FROM users WHERE lower(email) = ? AND active = 1', mail) : null;
    if (u) {
      const token = newToken();
      await db.run('INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)', tokenHash(token), u.id, Date.now() + 60 * 60 * 1000);
      // Sin servicio de correo configurado: el enlace queda en los logs de la función y el entrenador puede generarlo desde su panel.
      console.log(`\n[GYMTRACK] Enlace para restablecer la contraseña de ${u.email} (válido 1 hora):\n${baseUrl(req)}/#/restablecer/${token}\n`);
    }
    res.json({ ok: true, message: 'Si el correo existe, tu entrenador o el sistema te hará llegar un enlace para restablecer tu contraseña.' });
  }));

  api.post('/auth/reset', ah(async (req, res) => {
    await throttle(`reset|${clientIp(req)}`, 20, 60 * 60 * 1000);
    const token = str(req.body?.token, { max: 200, req: true, name: 'El enlace' });
    const pass = vPassword(req.body?.password, 'La nueva contraseña');
    const row = await db.get('SELECT * FROM reset_tokens WHERE token_hash = ?', tokenHash(token));
    if (!row || Number(row.expires_at) < Date.now()) bad('El enlace no es válido o ya venció. Solicita uno nuevo.', 400);
    const hash = await hashPassword(pass);
    await tx(async (t) => {
      await t.run('UPDATE users SET pass_hash = ? WHERE id = ?', hash, row.user_id);
      await t.run('DELETE FROM reset_tokens WHERE user_id = ?', row.user_id);
      await t.run('DELETE FROM sessions WHERE user_id = ?', row.user_id);
    });
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------ archivos privados
  api.get('/files/:name', requireAuth, ah(async (req, res) => {
    const name = req.params.name;
    if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) throw new HttpError(404, 'No encontrado');
    const owner = await db.get('SELECT id AS owner FROM users WHERE photo = ? UNION SELECT user_id FROM progress_photos WHERE file = ?', name, name);
    if (!owner || (owner.owner !== req.user.id && req.user.role !== 'trainer')) throw new HttpError(404, 'No encontrado');
    const f = await getFile(name);
    if (!f) throw new HttpError(404, 'No encontrado');
    const ext = name.split('.').pop();
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(ext === 'jpg' ? 'image/jpeg' : `image/${ext}`).send(f.buf);
  }));

  // ------------------------------------------------------------ cuenta (usuario autenticado)
  const me = express.Router();
  bindParams(me);
  api.use('/me', requireAuth, me);

  me.get('/', ah(async (req, res) => {
    res.json({ user: pubUser(req.user), profile: await getProfile(req.user.id), access: access(req.user), settings: await publicSettings(), goal_kinds: GOAL_KINDS });
  }));

  me.put('/', ah(async (req, res) => {
    const b = req.body || {};
    const u = req.user;
    const first = b.first_name !== undefined ? str(b.first_name, { max: 60, req: true, name: 'El nombre' }) : u.first_name;
    const last = b.last_name !== undefined ? str(b.last_name, { max: 80, name: 'Los apellidos' }) || '' : u.last_name;
    let birth = u.birth_date;
    if (b.birth_date !== undefined && u.role === 'client') {
      birth = isoDate(b.birth_date, { req: true, name: 'La fecha de nacimiento' });
      if (birth > todayUTC() || ageOn(birth) < MIN_AGE || ageOn(birth) > 100) bad('La fecha de nacimiento no es válida');
    }
    let phone = u.phone;
    if (b.phone !== undefined) {
      phone = str(b.phone, { max: 30, name: 'El teléfono' });
      if (phone && !/^[0-9+()\-\s]{7,30}$/.test(phone)) bad('El teléfono no es válido');
    }
    const avatar = b.avatar !== undefined ? (b.avatar ? oneOf(b.avatar, AVATARS, { name: 'El avatar' }) : null) : u.avatar;
    await db.run('UPDATE users SET first_name=?, last_name=?, birth_date=?, phone=?, avatar=? WHERE id=?', first, last, birth, phone, avatar, u.id);

    const p = b.profile;
    if (p && typeof p === 'object') {
      const cur = await getProfile(u.id);
      const days = p.days !== undefined ? [...new Set((Array.isArray(p.days) ? p.days : []).map(Number).filter((d) => d >= 1 && d <= 7))].sort() : cur.days;
      if (p.days !== undefined && !days.length) bad('Elige al menos un día disponible');
      await db.run(`UPDATE profiles SET gender=?, height_cm=?, level=?, freq=?, days=?, duration=?, place=?, training_type=?, injuries=? WHERE user_id=?`,
        p.gender !== undefined ? oneOf(p.gender, GENDERS, { name: 'El género' }) : cur.gender,
        p.height_cm !== undefined ? num(p.height_cm, { min: 100, max: 250, req: true, name: 'La altura (cm)' }) : cur.height_cm,
        p.level !== undefined ? oneOf(p.level, LEVELS, { req: true, name: 'El nivel' }) : cur.level,
        p.freq !== undefined ? num(p.freq, { min: 1, max: 7, int: true, req: true, name: 'La frecuencia' }) : cur.freq,
        JSON.stringify(days),
        p.duration !== undefined ? num(p.duration, { min: 15, max: 240, int: true, req: true, name: 'La duración' }) : cur.duration,
        p.place !== undefined ? oneOf(p.place, PLACES, { req: true, name: 'El lugar' }) : cur.place,
        p.training_type !== undefined ? oneOf(p.training_type, TYPES, { name: 'El tipo de entrenamiento' }) : cur.training_type,
        p.injuries !== undefined ? str(p.injuries, { max: 500, name: 'Las lesiones' }) : cur.injuries,
        u.id);
    }
    const fresh = await db.get('SELECT * FROM users WHERE id = ?', u.id);
    res.json({ user: pubUser(fresh), profile: await getProfile(u.id) });
  }));

  me.post('/photo', ah(async (req, res) => {
    const name = await saveImage(req.body?.data);
    const old = req.user.photo;
    await db.run('UPDATE users SET photo = ? WHERE id = ?', name, req.user.id);
    await removeFile(old);
    res.json({ photo: `/api/files/${name}` });
  }));
  me.delete('/photo', ah(async (req, res) => {
    const old = req.user.photo;
    await db.run('UPDATE users SET photo = NULL WHERE id = ?', req.user.id);
    await removeFile(old);
    res.json({ ok: true });
  }));

  me.post('/password', ah(async (req, res) => {
    const ok = await verifyPassword(String(req.body?.current || ''), req.user.pass_hash);
    if (!ok) bad('La contraseña actual no es correcta', 400);
    const pass = vPassword(req.body?.password, 'La nueva contraseña');
    const hash = await hashPassword(pass);
    const keep = tokenHash(readCookie(req, COOKIE));
    await tx(async (t) => {
      await t.run('UPDATE users SET pass_hash = ? WHERE id = ?', hash, req.user.id);
      await t.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', req.user.id, keep);
    });
    res.json({ ok: true });
  }));

  me.get('/notifications', ah(async (req, res) => {
    const items = await db.all('SELECT id,text,read,created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30', req.user.id);
    res.json({ items: items.map((n) => ({ ...n, read: !!n.read })), unread: items.filter((n) => !n.read).length });
  }));
  me.post('/notifications/read', ah(async (req, res) => {
    await db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
    res.json({ ok: true });
  }));

  // ---- objetivos
  me.get('/goals', ah(async (req, res) => { const items = await listGoals(req.user.id); res.json({ items, average: goalsAverage(items) }); }));
  me.post('/goals', ah(async (req, res) => {
    const b = req.body || {};
    const kind = oneOf(b.kind || 'custom', Object.keys(GOAL_KINDS), { req: true, name: 'El tipo de objetivo' });
    const title = str(b.title, { max: 200, name: 'El título' }) || GOAL_KINDS[kind].label;
    const metric = GOAL_KINDS[kind].metric || null;
    const profile = await getProfile(req.user.id);
    let target = null, start = null;
    if (metric && b.target_value != null && b.target_value !== '') {
      target = num(b.target_value, { min: 1, max: 400, name: 'La meta numérica' });
      start = profile[METRICS[metric]];
      if (start == null) bad('Registra primero una medición para poder fijar una meta numérica');
    }
    if ((await db.get('SELECT COUNT(*) AS c FROM goals WHERE user_id = ?', req.user.id)).c >= 30) bad('Llegaste al máximo de objetivos');
    const id = await db.insert('INSERT INTO goals(user_id,kind,title,metric,start_value,target_value) VALUES(?,?,?,?,?,?)', req.user.id, kind, title, metric, start, target);
    res.status(201).json({ id, items: await listGoals(req.user.id) });
  }));
  me.put('/goals/:id', ah(async (req, res) => {
    const g = await db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!g) bad('Objetivo no encontrado', 404);
    const b = req.body || {};
    const title = b.title !== undefined ? str(b.title, { max: 200, req: true, name: 'El título' }) : g.title;
    const progress = b.progress !== undefined ? num(b.progress, { min: 0, max: 100, int: true, name: 'El avance' }) : g.progress;
    const done = b.done !== undefined ? (b.done ? 1 : 0) : g.done;
    let target = g.target_value, start = g.start_value;
    if (g.metric && b.target_value !== undefined) {
      if (b.target_value === null || b.target_value === '') { target = null; start = null; }
      else {
        target = num(b.target_value, { min: 1, max: 400, name: 'La meta numérica' });
        start = start ?? (await getProfile(req.user.id))[METRICS[g.metric]];
        if (start == null) bad('Registra primero una medición para fijar una meta numérica');
      }
    }
    await db.run('UPDATE goals SET title=?, progress=?, done=?, target_value=?, start_value=? WHERE id=?', title, progress, done, target, start, g.id);
    res.json({ items: await listGoals(req.user.id) });
  }));
  me.delete('/goals/:id', ah(async (req, res) => {
    await db.run('DELETE FROM goals WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    res.json({ items: await listGoals(req.user.id) });
  }));

  // ---- mediciones
  const measurementBody = (b) => {
    const m = {
      date: isoDate(b.date || todayUTC(), { req: true, name: 'La fecha' }),
      weight: num(b.weight, { min: 25, max: 400, name: 'El peso' }),
      body_fat: num(b.body_fat, { min: 2, max: 70, name: 'El porcentaje de grasa' }),
      muscle_mass: num(b.muscle_mass, { min: 5, max: 150, name: 'La masa muscular' }),
      waist: num(b.waist, { min: 40, max: 250, name: 'La cintura' }),
      hip: num(b.hip, { min: 40, max: 250, name: 'La cadera' }),
      notes: str(b.notes, { max: 300, name: 'Las notas' }),
    };
    if (m.date > addDays(todayUTC(), 1)) bad('La fecha no puede estar en el futuro');
    if (![m.weight, m.body_fat, m.muscle_mass, m.waist, m.hip].some((v) => v != null)) bad('Captura al menos una medida');
    return m;
  };
  me.get('/measurements', ah(async (req, res) => {
    const all = await db.all('SELECT * FROM measurements WHERE user_id = ? ORDER BY date DESC, id DESC', req.user.id);
    const h = (await getProfile(req.user.id)).height_cm;
    const lim = access(req.user).features.measurements_limit;
    const items = (lim ? all.slice(0, lim) : all).map((m) => ({ ...m, bmi: bmi(m.weight, h) }));
    res.json({ items, total: all.length, limited: !!lim && all.length > lim });
  }));
  me.post('/measurements', ah(async (req, res) => {
    const m = measurementBody(req.body || {});
    if ((await db.get('SELECT COUNT(*) AS c FROM measurements WHERE user_id = ?', req.user.id)).c >= 2000) bad('Llegaste al máximo de mediciones');
    const id = await tx(async (t) => {
      const r = await t.insert('INSERT INTO measurements(user_id,date,weight,body_fat,muscle_mass,waist,hip,notes) VALUES(?,?,?,?,?,?,?,?)',
        req.user.id, m.date, m.weight, m.body_fat, m.muscle_mass, m.waist, m.hip, m.notes);
      await syncProfileFromMeasurements(req.user.id, t);
      return r;
    });
    res.status(201).json({ id, profile: await getProfile(req.user.id) });
  }));
  me.put('/measurements/:id', ah(async (req, res) => {
    const row = await db.get('SELECT id FROM measurements WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!row) bad('Medición no encontrada', 404);
    const m = measurementBody(req.body || {});
    await tx(async (t) => {
      await t.run('UPDATE measurements SET date=?, weight=?, body_fat=?, muscle_mass=?, waist=?, hip=?, notes=? WHERE id=?',
        m.date, m.weight, m.body_fat, m.muscle_mass, m.waist, m.hip, m.notes, row.id);
      await syncProfileFromMeasurements(req.user.id, t);
    });
    res.json({ profile: await getProfile(req.user.id) });
  }));
  me.delete('/measurements/:id', ah(async (req, res) => {
    await tx(async (t) => {
      await t.run('DELETE FROM measurements WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
      await syncProfileFromMeasurements(req.user.id, t);
    });
    res.json({ profile: await getProfile(req.user.id) });
  }));

  // ---- progreso (premium)
  me.get('/progress', requirePremium('El seguimiento de progreso'), ah(async (req, res) => {
    const rows = await db.all('SELECT * FROM measurements WHERE user_id = ? ORDER BY date, id', req.user.id);
    const series = (k) => rows.filter((r) => r[k] != null).map((r) => ({ date: r.date, value: r[k] }));
    const goals = await listGoals(req.user.id);
    res.json({
      series: { weight: series('weight'), body_fat: series('body_fat'), muscle_mass: series('muscle_mass'), waist: series('waist') },
      first: rows[0] || null, last: rows[rows.length - 1] || null,
      goals, goals_average: goalsAverage(goals),
    });
  }));
  me.get('/photos', requirePremium('Las fotos de progreso'), ah(async (req, res) => {
    const items = (await db.all('SELECT id,file,date,note FROM progress_photos WHERE user_id = ? ORDER BY date DESC, id DESC', req.user.id))
      .map((p) => ({ id: p.id, url: `/api/files/${p.file}`, date: p.date, note: p.note }));
    res.json({ items });
  }));
  me.post('/photos', requirePremium('Las fotos de progreso'), ah(async (req, res) => {
    const date = isoDate(req.body?.date || todayUTC(), { req: true });
    const note = str(req.body?.note, { max: 200, name: 'La nota' });
    if ((await db.get('SELECT COUNT(*) AS c FROM progress_photos WHERE user_id = ?', req.user.id)).c >= 200) bad('Llegaste al máximo de fotos de progreso');
    const file = await saveImage(req.body?.data);
    const id = await db.insert('INSERT INTO progress_photos(user_id,file,date,note) VALUES(?,?,?,?)', req.user.id, file, date, note);
    res.status(201).json({ id, url: `/api/files/${file}` });
  }));
  me.delete('/photos/:id', requirePremium('Las fotos de progreso'), ah(async (req, res) => {
    const p = await db.get('SELECT * FROM progress_photos WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    if (p) { await db.run('DELETE FROM progress_photos WHERE id = ?', p.id); await removeFile(p.file); }
    res.json({ ok: true });
  }));

  // ---- rutinas y registro de entrenamientos
  me.get('/routines', ah(async (req, res) => {
    res.json({ items: await clientRoutines(req.user), access: access(req.user) });
  }));
  me.post('/logs', ah(async (req, res) => {
    const b = req.body || {};
    const rid = num(b.routine_id, { min: 1, int: true, req: true, name: 'La rutina' });
    const r = (await clientRoutines(req.user)).find((x) => x.id === rid);
    if (!r) bad('Esa rutina no está asignada a tu cuenta', 403);
    const di = num(b.day_index, { min: 0, max: 20, int: true, req: true, name: 'El día' });
    if (!r.days[di]) bad('Ese día no existe en la rutina');
    const date = isoDate(b.date || todayUTC(), { req: true });
    if (date > addDays(todayUTC(), 1)) bad('La fecha no puede estar en el futuro');
    const dur = num(b.duration_min, { min: 1, max: 360, int: true, req: true, name: 'La duración (min)' });
    const id = await db.insert('INSERT INTO workout_logs(user_id,routine_id,routine_name,day_index,day_name,date,duration_min) VALUES(?,?,?,?,?,?,?)',
      req.user.id, r.id, r.name, di, r.days[di].name, date, dur);
    res.status(201).json({ id });
  }));
  me.delete('/logs/:id', ah(async (req, res) => {
    await db.run('DELETE FROM workout_logs WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    res.json({ ok: true });
  }));
  me.get('/logs', requirePremium('El calendario de entrenamientos'), ah(async (req, res) => {
    const from = isoDate(req.query.from, { req: true, name: 'La fecha inicial' });
    const to = isoDate(req.query.to, { req: true, name: 'La fecha final' });
    const items = await db.all('SELECT id,routine_id,routine_name,day_index,day_name,date,duration_min FROM workout_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id',
      req.user.id, from, to);
    res.json({ items, routines: (await clientRoutines(req.user)).map((r) => ({ id: r.id, name: r.name, days: r.days.map((d, i) => ({ index: i, name: d.name, weekdays: d.weekdays })) })) });
  }));

  // ---- nutrición (premium)
  me.get('/diet', requirePremium('El plan de nutrición'), ah(async (req, res) => {
    const row = await db.get(`SELECT d.*, cd.notes AS coach_notes, cd.assigned_at FROM client_diets cd JOIN diets d ON d.id = cd.diet_id WHERE cd.user_id = ?`, req.user.id);
    res.json({ diet: row ? dietRow(row) : null });
  }));

  // ---- tablero
  me.get('/dashboard', ah(async (req, res) => {
    const u = req.user;
    const date = clientDate(req);
    const acc = access(u);
    const profile = await getProfile(u.id);
    const first = await db.get('SELECT * FROM measurements WHERE user_id = ? ORDER BY date, id LIMIT 1', u.id);
    const goals = await listGoals(u.id);
    const logs = await db.all('SELECT date, duration_min FROM workout_logs WHERE user_id = ? ORDER BY date DESC', u.id);
    const logDates = new Set(logs.map((l) => l.date));

    let streak = 0;
    let cursor = logDates.has(date) ? date : addDays(date, -1);
    while (logDates.has(cursor)) { streak++; cursor = addDays(cursor, -1); }

    const wd = isoWeekday(date);
    const monday = addDays(date, -(wd - 1));
    const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(monday, i); return { date: d, weekday: i + 1, trained: logDates.has(d), today: d === date }; });
    const weekMinutes = logs.filter((l) => l.date >= monday && l.date <= addDays(monday, 6)).reduce((a, l) => a + l.duration_min, 0);

    const routines = await clientRoutines(u);
    let today = null, next = null;
    for (const r of routines) {
      r.days.forEach((d, i) => { if (d.weekdays.includes(wd) && !today) today = { routine_id: r.id, routine_name: r.name, day_index: i, day: d }; });
    }
    if (!today) {
      for (let k = 1; k <= 7 && !next; k++) {
        const w = ((wd - 1 + k) % 7) + 1;
        for (const r of routines) {
          const i = r.days.findIndex((d) => d.weekdays.includes(w));
          if (i >= 0) { next = { in_days: k, routine_name: r.name, day_name: r.days[i].name, weekday: w }; break; }
        }
      }
    }
    const doneToday = await db.all('SELECT id, routine_id, day_index, duration_min FROM workout_logs WHERE user_id = ? AND date = ?', u.id, date);

    const out = {
      access: acc,
      indicators: {
        weight: profile.weight_kg, height: profile.height_cm, body_fat: profile.body_fat, muscle_mass: profile.muscle_mass, bmi: profile.bmi,
        delta: first ? {
          weight: profile.weight_kg != null && first.weight != null ? Math.round((profile.weight_kg - first.weight) * 10) / 10 : null,
          body_fat: profile.body_fat != null && first.body_fat != null ? Math.round((profile.body_fat - first.body_fat) * 10) / 10 : null,
          muscle_mass: profile.muscle_mass != null && first.muscle_mass != null ? Math.round((profile.muscle_mass - first.muscle_mass) * 10) / 10 : null,
        } : {},
      },
      goals_average: goalsAverage(goals), goals_total: goals.length, goals_done: goals.filter((g) => g.pct >= 100).length,
      activity: { streak, completed_total: logs.length, week_minutes: weekMinutes, week_sessions: week.filter((d) => d.trained).length, week, planned_per_week: profile.freq },
      today, next, done_today: doneToday, routines_count: routines.length,
    };
    if (acc.premium) {
      const rows = await db.all('SELECT date, weight, body_fat FROM measurements WHERE user_id = ? ORDER BY date, id', u.id);
      out.series = {
        weight: rows.filter((r) => r.weight != null).map((r) => ({ date: r.date, value: r.weight })),
        body_fat: rows.filter((r) => r.body_fat != null).map((r) => ({ date: r.date, value: r.body_fat })),
      };
      out.photos = (await db.all('SELECT id,file,date FROM progress_photos WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 4', u.id))
        .map((p) => ({ id: p.id, url: `/api/files/${p.file}`, date: p.date }));
    }
    res.json(out);
  }));

  // ------------------------------------------------------------ panel del entrenador
  const coach = express.Router();
  bindParams(coach);
  api.use('/coach', requireAuth, requireTrainer, coach);

  coach.get('/stats', ah(async (_req, res) => {
    const today = todayUTC();
    const monthStart = today.slice(0, 8) + '01';
    const clients = await db.all("SELECT id,first_name,last_name,plan,plan_until,created_at,active,photo,avatar FROM users WHERE role='client'");
    const premium = clients.filter((c) => c.plan === 'premium' && (!c.plan_until || c.plan_until >= today));
    const expiring = clients.filter((c) => c.plan === 'premium' && c.plan_until && c.plan_until >= today && c.plan_until <= addDays(today, 7));
    const expired = clients.filter((c) => c.plan === 'premium' && c.plan_until && c.plan_until < today);
    const noRoutine = await db.all("SELECT u.id,u.first_name,u.last_name,u.plan,u.created_at FROM users u WHERE u.role='client' AND u.active=1 AND NOT EXISTS (SELECT 1 FROM client_routines c WHERE c.user_id=u.id) ORDER BY u.created_at DESC LIMIT 12");
    const income = (await db.get('SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE date >= ?', monthStart)).s;
    const slim = (c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim(), plan: c.plan, plan_until: c.plan_until });
    res.json({
      clients: clients.length, premium: premium.length, free: clients.length - premium.length, income_month: income,
      expiring: expiring.map(slim), expired: expired.map(slim),
      no_routine: noRoutine.map((c) => ({ ...slim(c), created_at: c.created_at })),
      recent: [...clients].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5).map(slim),
      library: {
        exercises: (await db.get('SELECT COUNT(*) AS c FROM exercises')).c,
        routines: (await db.get('SELECT COUNT(*) AS c FROM routines')).c,
        diets: (await db.get('SELECT COUNT(*) AS c FROM diets')).c,
      },
    });
  }));

  coach.get('/clients', ah(async (_req, res) => {
    const rows = await db.all(`
      SELECT u.id,u.email,u.first_name,u.last_name,u.photo,u.avatar,u.plan,u.plan_until,u.active,u.created_at,
        (SELECT weight FROM measurements m WHERE m.user_id=u.id AND weight IS NOT NULL ORDER BY date DESC,id DESC LIMIT 1) AS last_weight,
        (SELECT MAX(date) FROM measurements m WHERE m.user_id=u.id) AS last_measure,
        (SELECT COUNT(*) FROM client_routines c WHERE c.user_id=u.id) AS routines,
        (SELECT d.name FROM client_diets cd JOIN diets d ON d.id=cd.diet_id WHERE cd.user_id=u.id) AS diet,
        (SELECT MAX(date) FROM workout_logs w WHERE w.user_id=u.id) AS last_workout
      FROM users u WHERE u.role='client' ORDER BY u.created_at DESC`);
    res.json({ items: rows.map((r) => ({ ...pubUser(r), last_weight: r.last_weight, last_measure: r.last_measure, routines: r.routines, diet: r.diet, last_workout: r.last_workout })) });
  }));

  const clientOr404 = async (id) => {
    const c = await db.get("SELECT * FROM users WHERE id = ? AND role = 'client'", id);
    if (!c) bad('Cliente no encontrado', 404);
    return c;
  };

  coach.get('/clients/:id', ah(async (req, res) => {
    const c = await clientOr404(req.params.id);
    const profile = await getProfile(c.id);
    const measurements = (await db.all('SELECT * FROM measurements WHERE user_id = ? ORDER BY date DESC, id DESC', c.id)).map((m) => ({ ...m, bmi: bmi(m.weight, profile.height_cm) }));
    const photos = (await db.all('SELECT id,file,date,note FROM progress_photos WHERE user_id = ? ORDER BY date DESC, id DESC', c.id)).map((p) => ({ id: p.id, url: `/api/files/${p.file}`, date: p.date, note: p.note }));
    const logs = await db.all('SELECT id,routine_name,day_name,date,duration_min FROM workout_logs WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 40', c.id);
    const routines = await db.all(`SELECT cr.id AS assignment_id, cr.assigned_at, r.id, r.name, r.tier, r.level, r.goal FROM client_routines cr JOIN routines r ON r.id=cr.routine_id WHERE cr.user_id = ? ORDER BY cr.assigned_at DESC, cr.id DESC`, c.id);
    const diet = (await db.get('SELECT cd.diet_id, cd.notes, cd.assigned_at, d.name, d.calories FROM client_diets cd JOIN diets d ON d.id=cd.diet_id WHERE cd.user_id = ?', c.id)) || null;
    const payments = await db.all('SELECT * FROM payments WHERE user_id = ? ORDER BY date DESC, id DESC', c.id);
    res.json({
      user: { ...pubUser(c), age: c.birth_date ? ageOn(c.birth_date) : null, coach_notes: c.coach_notes },
      profile, goals: await listGoals(c.id), measurements, photos, logs, routines, diet, payments,
    });
  }));

  coach.put('/clients/:id', ah(async (req, res) => {
    const c = await clientOr404(req.params.id);
    const b = req.body || {};
    const plan = b.plan !== undefined ? oneOf(b.plan, ['free', 'premium'], { req: true, name: 'El plan' }) : c.plan;
    const until = b.plan_until !== undefined ? isoDate(b.plan_until || null, { name: 'La fecha de vencimiento' }) : c.plan_until;
    const notes = b.coach_notes !== undefined ? (str(b.coach_notes, { max: 4000, name: 'Las notas' }) || '') : c.coach_notes;
    const active = b.active !== undefined ? (b.active ? 1 : 0) : c.active;
    await tx(async (t) => {
      await t.run('UPDATE users SET plan=?, plan_until=?, coach_notes=?, active=? WHERE id=?', plan, plan === 'free' ? null : until, notes, active, c.id);
      if (!active) await t.run('DELETE FROM sessions WHERE user_id = ?', c.id);
      if (plan !== c.plan) await notify(c.id, plan === 'premium' ? '¡Tu plan Premium está activo! Ya tienes acceso a todas tus rutinas, nutrición y progreso.' : 'Tu plan cambió a Gratuito. Conservas tu rutina básica y tu perfil.', t);
    });
    res.json({ ok: true });
  }));

  coach.post('/clients/:id/reset-link', ah(async (req, res) => {
    const c = await clientOr404(req.params.id);
    const token = newToken();
    await db.run('INSERT INTO reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)', tokenHash(token), c.id, Date.now() + 24 * 3600 * 1000);
    res.json({ url: `${baseUrl(req)}/#/restablecer/${token}`, valid_hours: 24 });
  }));

  coach.post('/clients/:id/routines', ah(async (req, res) => {
    const c = await clientOr404(req.params.id);
    const rid = num(req.body?.routine_id, { min: 1, int: true, req: true, name: 'La rutina' });
    const r = await db.get('SELECT * FROM routines WHERE id = ?', rid);
    if (!r) bad('Rutina no encontrada', 404);
    const premium = isPremium(c);
    if (!premium && r.tier !== 'free') bad('Este cliente tiene plan gratuito: solo puedes asignarle rutinas marcadas como gratuitas, o activa su plan Premium.', 409);
    await tx(async (t) => {
      if (!premium) await t.run('DELETE FROM client_routines WHERE user_id = ?', c.id); // gratis = una rutina a la vez
      await t.run('INSERT INTO client_routines(user_id,routine_id) VALUES(?,?) ON CONFLICT (user_id, routine_id) DO NOTHING', c.id, rid);
      await notify(c.id, `Tu entrenador te asignó la rutina “${r.name}”.`, t);
    });
    res.status(201).json({ ok: true, replaced: !premium });
  }));
  coach.delete('/clients/:id/routines/:aid', ah(async (req, res) => {
    const c = await clientOr404(req.params.id);
    await db.run('DELETE FROM client_routines WHERE id = ? AND user_id = ?', req.params.aid, c.id);
    res.json({ ok: true });
  }));

  coach.put('/clients/:id/diet', ah(async (req, res) => {
    const c = await clientOr404(req.params.id);
    const did = req.body?.diet_id;
    if (did == null || did === '') {
      await db.run('DELETE FROM client_diets WHERE user_id = ?', c.id);
      return res.json({ ok: true });
    }
    if (!isPremium(c)) bad('Los planes alimenticios son parte del plan Premium. Activa el plan de este cliente primero.', 409);
    const id = num(did, { min: 1, int: true, req: true, name: 'El plan alimenticio' });
    const d = await db.get('SELECT * FROM diets WHERE id = ?', id);
    if (!d) bad('Plan alimenticio no encontrado', 404);
    const notes = str(req.body?.notes, { max: 1000, name: 'Las indicaciones' });
    await tx(async (t) => {
      await t.run(`INSERT INTO client_diets(user_id,diet_id,notes) VALUES(?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET diet_id=excluded.diet_id, notes=excluded.notes, assigned_at=gt_now()`, c.id, id, notes);
      await notify(c.id, `Tu entrenador te asignó el plan alimenticio “${d.name}”.`, t);
    });
    res.json({ ok: true });
  }));

  coach.post('/clients/:id/payments', ah(async (req, res) => {
    const c = await clientOr404(req.params.id);
    const b = req.body || {};
    const amount = num(b.amount, { min: 0, max: 1e6, req: true, name: 'El monto' });
    const method = oneOf(b.method, ['efectivo', 'transferencia', 'tarjeta', 'otro'], { req: true, name: 'El método de pago' });
    const months = num(b.months, { min: 1, max: 24, int: true, req: true, name: 'Los meses' });
    const date = isoDate(b.date || todayUTC(), { req: true });
    const note = str(b.note, { max: 200, name: 'La nota' });
    const base = c.plan === 'premium' && c.plan_until && c.plan_until >= todayUTC() ? c.plan_until : todayUTC();
    const until = addMonths(base, months);
    await tx(async (t) => {
      await t.run('INSERT INTO payments(user_id,amount,method,months,note,date) VALUES(?,?,?,?,?,?)', c.id, amount, method, months, note, date);
      await t.run("UPDATE users SET plan='premium', plan_until=? WHERE id=?", until, c.id);
      await notify(c.id, `Pago registrado. Tu plan Premium está activo hasta el ${until}.`, t);
    });
    res.status(201).json({ plan_until: until });
  }));
  coach.delete('/clients/:id/payments/:pid', ah(async (req, res) => {
    const c = await clientOr404(req.params.id);
    await db.run('DELETE FROM payments WHERE id = ? AND user_id = ?', req.params.pid, c.id);
    res.json({ ok: true });
  }));

  // ---- biblioteca de ejercicios
  const exerciseBody = (b) => ({
    name: str(b.name, { max: 100, req: true, name: 'El nombre' }),
    muscle: str(b.muscle, { max: 40, req: true, name: 'El grupo muscular' }),
    equipment: str(b.equipment, { max: 60, name: 'El equipo' }),
    description: str(b.description, { max: 1000, name: 'La descripción' }),
    video_url: (() => {
      const v = str(b.video_url, { max: 300, name: 'El enlace de video' });
      if (v && !/^https?:\/\/[^\s]+$/i.test(v)) bad('El enlace de video debe empezar con http:// o https://');
      return v;
    })(),
  });
  const INS_EX = 'INSERT INTO exercises(name,muscle,equipment,description,video_url) VALUES(?,?,?,?,?)';
  coach.get('/exercises', ah(async (_req, res) => res.json({ items: await db.all('SELECT * FROM exercises ORDER BY muscle, name') })));
  const nameTaken = async (name, exceptId = 0) => !!(await db.get('SELECT 1 AS x FROM exercises WHERE lower(name) = lower(?) AND id <> ?', name, exceptId));
  coach.post('/exercises', ah(async (req, res) => {
    const e = exerciseBody(req.body || {});
    if (await nameTaken(e.name)) bad('Ya existe un ejercicio con ese nombre', 409);
    const id = await db.insert(INS_EX, e.name, e.muscle, e.equipment, e.description, e.video_url);
    res.status(201).json({ id });
  }));
  // Importación masiva: [{name, muscle, equipment?, description?, video_url?}] (máx. 300)
  coach.post('/exercises/bulk', ah(async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || !items.length) bad('No hay ejercicios para importar');
    if (items.length > 300) bad('Máximo 300 ejercicios por importación');
    const seen = new Set((await db.all('SELECT name FROM exercises')).map((r) => r.name.toLowerCase()));
    const skipped = [];
    let added = 0;
    await tx(async (t) => {
      for (const [i, raw] of items.entries()) {
        let e;
        try { e = exerciseBody(raw || {}); } catch (err) { if (err instanceof HttpError) bad(`Línea ${i + 1}: ${err.message}`); throw err; }
        if (seen.has(e.name.toLowerCase())) { skipped.push(e.name); continue; }
        await t.run(INS_EX, e.name, e.muscle, e.equipment, e.description, e.video_url);
        seen.add(e.name.toLowerCase());
        added++;
      }
    });
    res.status(201).json({ added, skipped });
  }));
  // Catálogo ampliado de ejemplo: agrega solo los que aún no existen
  coach.post('/exercises/catalog', ah(async (_req, res) => {
    const seen = new Set((await db.all('SELECT name FROM exercises')).map((r) => r.name.toLowerCase()));
    let added = 0;
    await tx(async (t) => {
      for (const [name, muscle, equipment, description] of EXTRA_EXERCISES) {
        if (seen.has(name.toLowerCase())) continue;
        await t.run(INS_EX, name, muscle, equipment, description, null);
        added++;
      }
    });
    res.status(201).json({ added, available: EXTRA_EXERCISES.length });
  }));
  coach.put('/exercises/:id', ah(async (req, res) => {
    if (!(await db.get('SELECT 1 AS x FROM exercises WHERE id = ?', req.params.id))) bad('Ejercicio no encontrado', 404);
    const e = exerciseBody(req.body || {});
    if (await nameTaken(e.name, Number(req.params.id))) bad('Ya existe otro ejercicio con ese nombre', 409);
    await db.run('UPDATE exercises SET name=?, muscle=?, equipment=?, description=?, video_url=? WHERE id=?', e.name, e.muscle, e.equipment, e.description, e.video_url, req.params.id);
    res.json({ ok: true });
  }));
  coach.delete('/exercises/:id', ah(async (req, res) => {
    const id = Number(req.params.id);
    const using = (await db.all('SELECT name, days FROM routines')).filter((r) => parseJSON(r.days, []).some((d) => (d.exercises || []).some((e) => e.exercise_id === id)));
    if (using.length) bad(`Este ejercicio se usa en: ${using.map((r) => r.name).join(', ')}. Quítalo de esas rutinas primero.`, 409);
    await db.run('DELETE FROM exercises WHERE id = ?', id);
    res.json({ ok: true });
  }));

  // ---- rutinas
  const routineBody = async (b) => ({
    name: str(b.name, { max: 100, req: true, name: 'El nombre de la rutina' }),
    description: str(b.description, { max: 600, name: 'La descripción' }),
    level: oneOf(b.level, LEVELS, { name: 'El nivel' }),
    goal: str(b.goal, { max: 80, name: 'El objetivo' }),
    tier: oneOf(b.tier || 'premium', ['free', 'premium'], { req: true, name: 'El tipo de acceso' }),
    days: await cleanDays(b.days),
  });
  coach.get('/routines', ah(async (_req, res) => {
    const rows = await db.all('SELECT r.*, (SELECT COUNT(*) FROM client_routines c WHERE c.routine_id = r.id) AS assigned FROM routines r ORDER BY r.tier, r.name');
    res.json({ items: rows.map((r) => { const days = parseJSON(r.days, []); return { id: r.id, name: r.name, description: r.description, level: r.level, goal: r.goal, tier: r.tier, assigned: r.assigned, day_count: days.length, exercise_count: days.reduce((a, d) => a + (d.exercises?.length || 0), 0) }; }) });
  }));
  coach.get('/routines/:id', ah(async (req, res) => {
    const r = await db.get('SELECT * FROM routines WHERE id = ?', req.params.id);
    if (!r) bad('Rutina no encontrada', 404);
    res.json({ routine: { ...r, days: normDays(parseJSON(r.days, [])) } });
  }));
  coach.post('/routines', ah(async (req, res) => {
    const r = await routineBody(req.body || {});
    const id = await db.insert('INSERT INTO routines(name,description,level,goal,tier,days) VALUES(?,?,?,?,?,?)', r.name, r.description, r.level, r.goal, r.tier, JSON.stringify(r.days));
    res.status(201).json({ id });
  }));
  coach.put('/routines/:id', ah(async (req, res) => {
    if (!(await db.get('SELECT 1 AS x FROM routines WHERE id = ?', req.params.id))) bad('Rutina no encontrada', 404);
    const r = await routineBody(req.body || {});
    // Si una rutina deja de ser gratuita, los clientes gratuitos que la tenían dejan de verla (se filtra al leer).
    await db.run('UPDATE routines SET name=?, description=?, level=?, goal=?, tier=?, days=?, updated_at=gt_now() WHERE id=?', r.name, r.description, r.level, r.goal, r.tier, JSON.stringify(r.days), req.params.id);
    res.json({ ok: true });
  }));
  coach.post('/routines/:id/duplicate', ah(async (req, res) => {
    const r = await db.get('SELECT * FROM routines WHERE id = ?', req.params.id);
    if (!r) bad('Rutina no encontrada', 404);
    const id = await db.insert('INSERT INTO routines(name,description,level,goal,tier,days) VALUES(?,?,?,?,?,?)', `${r.name} (copia)`.slice(0, 100), r.description, r.level, r.goal, r.tier, r.days);
    res.status(201).json({ id });
  }));
  coach.delete('/routines/:id', ah(async (req, res) => {
    await db.run('DELETE FROM routines WHERE id = ?', req.params.id);
    res.json({ ok: true });
  }));

  // ---- planes alimenticios
  const dietBody = (b) => ({
    name: str(b.name, { max: 100, req: true, name: 'El nombre del plan' }),
    description: str(b.description, { max: 600, name: 'La descripción' }),
    calories: num(b.calories, { min: 500, max: 8000, int: true, name: 'Las calorías' }),
    protein: num(b.protein, { min: 0, max: 600, int: true, name: 'La proteína' }),
    carbs: num(b.carbs, { min: 0, max: 1200, int: true, name: 'Los carbohidratos' }),
    fat: num(b.fat, { min: 0, max: 400, int: true, name: 'Las grasas' }),
    meals: cleanMeals(b.meals),
  });
  coach.get('/diets', ah(async (_req, res) => {
    const rows = await db.all('SELECT d.*, (SELECT COUNT(*) FROM client_diets c WHERE c.diet_id = d.id) AS assigned FROM diets d ORDER BY d.name');
    res.json({ items: rows.map((d) => ({ id: d.id, name: d.name, description: d.description, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat, assigned: d.assigned, meal_count: parseJSON(d.meals, []).length })) });
  }));
  coach.get('/diets/:id', ah(async (req, res) => {
    const d = await db.get('SELECT * FROM diets WHERE id = ?', req.params.id);
    if (!d) bad('Plan no encontrado', 404);
    res.json({ diet: dietRow(d) });
  }));
  coach.post('/diets', ah(async (req, res) => {
    const d = dietBody(req.body || {});
    const id = await db.insert('INSERT INTO diets(name,description,calories,protein,carbs,fat,meals) VALUES(?,?,?,?,?,?,?)', d.name, d.description, d.calories, d.protein, d.carbs, d.fat, JSON.stringify(d.meals));
    res.status(201).json({ id });
  }));
  coach.put('/diets/:id', ah(async (req, res) => {
    if (!(await db.get('SELECT 1 AS x FROM diets WHERE id = ?', req.params.id))) bad('Plan no encontrado', 404);
    const d = dietBody(req.body || {});
    await db.run('UPDATE diets SET name=?, description=?, calories=?, protein=?, carbs=?, fat=?, meals=?, updated_at=gt_now() WHERE id=?', d.name, d.description, d.calories, d.protein, d.carbs, d.fat, JSON.stringify(d.meals), req.params.id);
    res.json({ ok: true });
  }));
  coach.post('/diets/:id/duplicate', ah(async (req, res) => {
    const d = await db.get('SELECT * FROM diets WHERE id = ?', req.params.id);
    if (!d) bad('Plan no encontrado', 404);
    const id = await db.insert('INSERT INTO diets(name,description,calories,protein,carbs,fat,meals) VALUES(?,?,?,?,?,?,?)', `${d.name} (copia)`.slice(0, 100), d.description, d.calories, d.protein, d.carbs, d.fat, d.meals);
    res.status(201).json({ id });
  }));
  coach.delete('/diets/:id', ah(async (req, res) => {
    await db.run('DELETE FROM diets WHERE id = ?', req.params.id);
    res.json({ ok: true });
  }));

  // ---- ajustes del entrenador
  coach.get('/settings', ah(async (_req, res) => res.json({ settings: await publicSettings() })));
  coach.put('/settings', ah(async (req, res) => {
    const b = req.body || {};
    const w = str(b.whatsapp, { max: 30, name: 'El WhatsApp' });
    if (w && !/^[0-9+()\-\s]{7,30}$/.test(w)) bad('El número de WhatsApp no es válido');
    await setSetting('trainer_name', str(b.trainer_name, { max: 80, req: true, name: 'El nombre público' }));
    await setSetting('whatsapp', w || '');
    await setSetting('premium_price', str(b.premium_price, { max: 80, name: 'El precio' }) || '');
    await setSetting('upsell_message', str(b.upsell_message, { max: 300, name: 'El mensaje' }) || '');
    res.json({ settings: await publicSettings() });
  }));

  // ------------------------------------------------------------ errores (y estáticos solo en local)
  api.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));
  if (serveStatic) {
    app.use(express.static(publicDir, { extensions: ['html'] }));
    app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos con formato incorrecto' });
    if (err.code === '23505') return res.status(409).json({ error: 'Ese registro ya existe' });
    if (err.code === '22P02' || err.code === '22003') return res.status(400).json({ error: 'Datos no válidos' });
    console.error(err);
    res.status(500).json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
  });

  return app;
}
