// Pruebas de extremo a extremo de la API. Ejecutar:  npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Necesita una base PostgreSQL de pruebas vacía: TEST_DATABASE_URL=postgresql://... npm test
// ¡Se BORRA todo el esquema "public" de esa base! Nunca apuntes a tu base real de Supabase.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) { console.error('Define TEST_DATABASE_URL (base de pruebas, se borrará su contenido).'); process.exit(1); }
process.env.DATABASE_URL = testUrl;
process.env.PGSSL = /@(localhost|127\.0\.0\.1)[:/]/.test(testUrl) ? 'disable' : '';
delete process.env.SUPABASE_URL; // las fotos van a memoria en las pruebas
process.env.TRAINER_EMAIL = 'coach@test.com';
process.env.TRAINER_PASSWORD = 'Coach12345';

const pgm = (await import('pg')).default;
const admin = new pgm.Client({ connectionString: testUrl, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } });
await admin.connect();
await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await admin.query(fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await admin.end();

const { createApp } = await import('../server/app.js');
const { ready } = await import('../server/seed.js');
const { db, closeDb } = await import('../server/db.js');

let server, base;
before(async () => {
  await ready();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await closeDb(); });

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body) {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) { const [kv] = c.split(';'); if (/Max-Age=0/i.test(c)) this.cookie = ''; else this.cookie = kv; }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }
  get(u) { return this.req('GET', u); }
  post(u, b = {}) { return this.req('POST', u, b); }
  put(u, b = {}) { return this.req('PUT', u, b); }
  del(u) { return this.req('DELETE', u); }
}

const iso = (off = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - off); return d.toISOString().slice(0, 10); };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const reg = (n, extra = {}) => ({
  first_name: 'Ana', last_name: 'Pérez', birth_date: '1995-04-12', email: `ana${n}@test.com`, password: 'Segura1234', password2: 'Segura1234',
  goals: ['lose_weight', 'wellness'], custom_goal: 'Correr 5K',
  profile: { height_cm: 165, weight_kg: 70, body_fat: 28, muscle_mass: 25, waist: 80, hip: 98, level: 'principiante', freq: 3, days: [1, 3, 5], duration: 60, place: 'gimnasio', training_type: 'mixto' },
  ...extra,
});

const coach = new Client(), ana = new Client(), luis = new Client();
let anaId, luisId;

test('registro valida datos y crea cuenta con medición, objetivos y sesión', async () => {
  assert.equal((await new Client().post('/api/auth/register', reg(1, { password2: 'x' }))).status, 400);
  assert.equal((await new Client().post('/api/auth/register', reg(1, { password: 'corta', password2: 'corta' }))).status, 400);
  assert.equal((await new Client().post('/api/auth/register', reg(1, { birth_date: '2020-01-01' }))).status, 400);
  assert.equal((await new Client().post('/api/auth/register', reg(1, { goals: [], custom_goal: '' }))).status, 400);
  const r = await ana.post('/api/auth/register', reg(1, { photo: PNG }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await new Client().post('/api/auth/register', reg(1))).status, 409);
  const m = await ana.get('/api/me');
  assert.equal(m.body.user.email, 'ana1@test.com');
  assert.equal(m.body.profile.bmi, 25.7);
  assert.ok(m.body.user.photo.startsWith('/api/files/'));
  assert.equal(m.body.access.premium, false);
  anaId = m.body.user.id;
  const g = await ana.get('/api/me/goals');
  assert.equal(g.body.items.length, 3);
  assert.equal((await luis.post('/api/auth/register', reg(2, { first_name: 'Luis' }))).status, 201);
  luisId = (await luis.get('/api/me')).body.user.id;
});

test('rutas privadas exigen sesión y roles', async () => {
  const anon = new Client();
  assert.equal((await anon.get('/api/me')).status, 401);
  assert.equal((await anon.get('/api/coach/clients')).status, 401);
  assert.equal((await ana.get('/api/coach/clients')).status, 403);
  assert.equal((await ana.post('/api/coach/exercises', { name: 'x', muscle: 'y' })).status, 403);
});

test('login: credenciales, recordar sesión y cierre', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/auth/login', { email: 'ana1@test.com', password: 'mala' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'nadie@test.com', password: 'Segura1234' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { email: 'ANA1@test.com', password: 'Segura1234', remember: true })).status, 200);
  assert.equal((await c.get('/api/me')).status, 200);
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal((await coach.post('/api/auth/login', { email: 'coach@test.com', password: 'Coach12345' })).body.role, 'trainer');
});

test('cliente gratuito: rutina básica sí; nutrición, progreso, fotos y calendario bloqueados', async () => {
  for (const u of ['/api/me/diet', '/api/me/progress', '/api/me/photos', '/api/me/logs?from=2026-01-01&to=2026-12-31']) {
    const r = await ana.get(u);
    assert.equal(r.status, 403, u);
    assert.equal(r.body.upgrade, true);
  }
  assert.equal((await ana.post('/api/me/photos', { data: PNG })).status, 403);
  const d = await ana.get(`/api/me/dashboard?date=${iso(0)}`);
  assert.equal(d.status, 200);
  assert.equal(d.body.series, undefined);
});

test('el entrenador asigna rutinas: gratis solo rutinas gratuitas, una a la vez', async () => {
  const lib = await coach.get('/api/coach/routines');
  const free = lib.body.items.filter((r) => r.tier === 'free');
  const prem = lib.body.items.filter((r) => r.tier === 'premium');
  assert.ok(free.length >= 1 && prem.length >= 2);
  assert.equal((await coach.post(`/api/coach/clients/${anaId}/routines`, { routine_id: prem[0].id })).status, 409);
  assert.equal((await coach.post(`/api/coach/clients/${anaId}/routines`, { routine_id: free[0].id })).status, 201);
  const mine = await ana.get('/api/me/routines');
  assert.equal(mine.body.items.length, 1);
  assert.ok(mine.body.items[0].days[0].exercises[0].name);
  assert.equal((await coach.post(`/api/coach/clients/${anaId}/diet`.replace('/diet', '/routines'), { routine_id: free[0].id })).status, 201);
  assert.equal((await coach.put(`/api/coach/clients/${anaId}/diet`, { diet_id: 1 })).status, 409);
  const n = await ana.get('/api/me/notifications');
  assert.ok(n.body.unread >= 2);
});

test('registrar pago activa Premium y desbloquea todo', async () => {
  const p = await coach.post(`/api/coach/clients/${anaId}/payments`, { amount: 500, method: 'transferencia', months: 1 });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.ok(p.body.plan_until > new Date().toISOString().slice(0, 10));
  assert.equal((await ana.get('/api/me')).body.access.premium, true);

  const lib = await coach.get('/api/coach/routines');
  const prem = lib.body.items.find((r) => r.tier === 'premium');
  assert.equal((await coach.post(`/api/coach/clients/${anaId}/routines`, { routine_id: prem.id })).status, 201);
  assert.equal((await ana.get('/api/me/routines')).body.items.length, 2);

  const diets = await coach.get('/api/coach/diets');
  assert.equal((await coach.put(`/api/coach/clients/${anaId}/diet`, { diet_id: diets.body.items[0].id, notes: 'Toma 2 L de agua' })).status, 200);
  const diet = await ana.get('/api/me/diet');
  assert.equal(diet.status, 200);
  assert.ok(diet.body.diet.meals.length > 0);
  assert.equal(diet.body.diet.coach_notes, 'Toma 2 L de agua');

  const ph = await ana.post('/api/me/photos', { data: PNG, date: iso(5), note: 'Frente' });
  assert.equal(ph.status, 201);
  assert.equal((await ana.get('/api/me/photos')).body.items.length, 1);
});

test('mediciones: validación, sincronía con el perfil, progreso y metas numéricas', async () => {
  assert.equal((await ana.post('/api/me/measurements', { date: iso(1) })).status, 400);
  assert.equal((await ana.post('/api/me/measurements', { date: iso(1), weight: 9 })).status, 400);
  assert.equal((await ana.post('/api/me/measurements', { date: iso(-30), weight: 60 })).status, 400); // futuro
  await ana.post('/api/me/measurements', { date: iso(10), weight: 69, body_fat: 27 });
  // misma fecha que la medición inicial: gana la más reciente registrada
  await ana.post('/api/me/measurements', { date: iso(0), weight: 67.5, body_fat: 26 });
  const prof = (await ana.get('/api/me')).body.profile;
  assert.equal(prof.weight_kg, 67.5);
  const goal = await ana.post('/api/me/goals', { kind: 'lose_weight', target_value: 60 });
  assert.equal(goal.status, 201);
  const g = goal.body.items.find((x) => x.target_value === 60);
  assert.equal(g.start_value, 67.5);
  await ana.post('/api/me/measurements', { date: iso(0), weight: 63.75 });
  const g2 = (await ana.get('/api/me/goals')).body.items.find((x) => x.target_value === 60);
  assert.equal(g2.pct, 50);
  const pr = await ana.get('/api/me/progress');
  assert.ok(pr.body.series.weight.length >= 4);
});

test('entrenamientos: registrar sesión, racha y rutina del día', async () => {
  const routines = (await ana.get('/api/me/routines')).body.items;
  const r = routines.find((x) => x.tier === 'free');
  assert.equal((await ana.post('/api/me/logs', { routine_id: 99999, day_index: 0, duration_min: 30 })).status, 403);
  const d = iso(1), e = iso(0);
  assert.equal((await ana.post('/api/me/logs', { routine_id: r.id, day_index: 0, duration_min: 45, date: d })).status, 201);
  assert.equal((await ana.post('/api/me/logs', { routine_id: r.id, day_index: 1, duration_min: 50, date: e })).status, 201);
  const dash = (await ana.get(`/api/me/dashboard?date=${e}`)).body;
  assert.equal(dash.activity.streak, 2);
  assert.equal(dash.activity.completed_total, 2);
  assert.ok(dash.activity.week_minutes >= 50);
  assert.ok(dash.series.weight.length >= 4);
  const cal = await ana.get(`/api/me/logs?from=${iso(30)}&to=${iso(-1)}`);
  assert.equal(cal.body.items.length, 2);
});

test('aislamiento: un cliente no ve ni modifica datos de otro', async () => {
  const ph = (await ana.get('/api/me/photos')).body.items[0];
  const file = ph.url;
  assert.equal((await ana.get(file)).status, 200);
  assert.equal((await luis.get(file)).status, 404);
  assert.equal((await coach.get(file)).status, 200);
  assert.equal((await new Client().get(file)).status, 401);
  const anaMeas = (await ana.get('/api/me/measurements')).body.items[0];
  assert.equal((await luis.del(`/api/me/measurements/${anaMeas.id}`)).status, 200); // no-op
  assert.equal((await ana.get('/api/me/measurements')).body.items.some((m) => m.id === anaMeas.id), true);
  assert.equal((await luis.put(`/api/me/measurements/${anaMeas.id}`, { weight: 50 })).status, 404);
  const anaGoal = (await ana.get('/api/me/goals')).body.items[0];
  assert.equal((await luis.put(`/api/me/goals/${anaGoal.id}`, { done: true })).status, 404);
  assert.equal((await luis.get('/api/me/routines')).body.items.length, 0);
  assert.equal((await luis.get('/api/me/goals')).body.items.every((g) => g.id !== anaGoal.id), true);
});

test('plan vencido vuelve a gratis automáticamente', async () => {
  await db.run("UPDATE users SET plan_until = '2020-01-01' WHERE id = ?", anaId);
  const m = await ana.get('/api/me');
  assert.equal(m.body.access.premium, false);
  assert.equal(m.body.access.expired, true);
  assert.equal((await ana.get('/api/me/diet')).status, 403);
  assert.equal((await ana.get('/api/me/routines')).body.items.length, 1);
  assert.equal((await ana.get('/api/me/measurements')).body.items.length <= 3, true);
});

test('el entrenador gestiona ejercicios, rutinas y dietas (CRUD y reglas)', async () => {
  const ex = await coach.post('/api/coach/exercises', { name: 'Sentadilla búlgara', muscle: 'Piernas', equipment: 'Mancuernas', video_url: 'https://example.com/v' });
  assert.equal(ex.status, 201);
  assert.equal((await coach.post('/api/coach/exercises', { name: 'x', muscle: 'y', video_url: 'javascript:alert(1)' })).status, 400);
  const rt = await coach.post('/api/coach/routines', { name: 'Mi rutina', tier: 'free', level: 'intermedio', days: [{ name: 'Día 1', weekday: 2, exercises: [{ exercise_id: ex.body.id, sets: 3, reps: '10', rest: '60 s' }] }] });
  assert.equal(rt.status, 201, JSON.stringify(rt.body));
  assert.equal((await coach.post('/api/coach/routines', { name: 'Mala', days: [] })).status, 400);
  assert.equal((await coach.post('/api/coach/routines', { name: 'Mala', days: [{ name: 'D', exercises: [{ exercise_id: 99999, sets: 3, reps: '10' }] }] })).status, 400);
  assert.equal((await coach.del(`/api/coach/exercises/${ex.body.id}`)).status, 409);
  const dup = await coach.post(`/api/coach/routines/${rt.body.id}/duplicate`);
  assert.equal(dup.status, 201);
  assert.equal((await coach.del(`/api/coach/routines/${dup.body.id}`)).status, 200);
  const dt = await coach.post('/api/coach/diets', { name: 'Plan X', calories: 2000, protein: 140, carbs: 200, fat: 60, meals: [{ name: 'Desayuno', time: '08:00', items: ['Avena', 'Fruta'] }] });
  assert.equal(dt.status, 201, JSON.stringify(dt.body));
  assert.equal((await coach.put(`/api/coach/diets/${dt.body.id}`, { name: 'Plan X2', meals: [] })).status, 400);
  assert.equal((await coach.get(`/api/coach/diets/${dt.body.id}`)).body.diet.meals[0].items.length, 2);
});

test('entrenador: lista y detalle de clientes, stats, enlace de recuperación y ajustes', async () => {
  const list = await coach.get('/api/coach/clients');
  assert.equal(list.body.items.length, 2);
  const det = await coach.get(`/api/coach/clients/${anaId}`);
  const now = new Date();
  const had = now.getUTCMonth() > 3 || (now.getUTCMonth() === 3 && now.getUTCDate() >= 12);
  assert.equal(det.body.user.age, now.getUTCFullYear() - 1995 - (had ? 0 : 1));
  assert.ok(det.body.measurements.length >= 4);
  assert.ok(det.body.payments.length === 1);
  const st = await coach.get('/api/coach/stats');
  assert.equal(st.body.clients, 2);
  assert.ok(st.body.income_month >= 500);
  const link = await coach.post(`/api/coach/clients/${luisId}/reset-link`);
  const token = link.body.url.split('/').pop();
  assert.equal((await new Client().post('/api/auth/reset', { token: 'zzz', password: 'Nueva12345' })).status, 400);
  assert.equal((await new Client().post('/api/auth/reset', { token, password: 'Nueva12345' })).status, 200);
  assert.equal((await luis.get('/api/me')).status, 401); // sesiones cerradas
  assert.equal((await new Client().post('/api/auth/reset', { token, password: 'Otra123456' })).status, 400); // un solo uso
  assert.equal((await new Client().post('/api/auth/login', { email: 'ana2@test.com', password: 'Nueva12345' })).status, 200);
  const s = await coach.put('/api/coach/settings', { trainer_name: 'Coach Test', whatsapp: '+52 55 1234 5678', premium_price: '$500 MXN/mes' });
  assert.equal(s.body.settings.trainer_name, 'Coach Test');
  assert.equal((await ana.get('/api/public')).body.settings.premium_price, '$500 MXN/mes');
});

test('desactivar cliente bloquea acceso; cambio de contraseña', async () => {
  assert.equal((await coach.put(`/api/coach/clients/${anaId}`, { active: false })).status, 200);
  assert.equal((await ana.get('/api/me')).status, 401);
  assert.equal((await new Client().post('/api/auth/login', { email: 'ana1@test.com', password: 'Segura1234' })).status, 403);
  await coach.put(`/api/coach/clients/${anaId}`, { active: true });
  const c = new Client();
  await c.post('/api/auth/login', { email: 'ana1@test.com', password: 'Segura1234' });
  assert.equal((await c.post('/api/me/password', { current: 'mal', password: 'Nueva12345' })).status, 400);
  assert.equal((await c.post('/api/me/password', { current: 'Segura1234', password: 'Nueva12345' })).status, 200);
  assert.equal((await new Client().post('/api/auth/login', { email: 'ana1@test.com', password: 'Nueva12345' })).status, 200);
});

test('subida de imágenes rechaza archivos falsos', async () => {
  const c = new Client();
  await c.post('/api/auth/login', { email: 'ana1@test.com', password: 'Nueva12345' });
  const fake = 'data:image/png;base64,' + Buffer.from('<?php echo 1; ?>').toString('base64');
  assert.equal((await c.post('/api/me/photo', { data: fake })).status, 400);
  assert.equal((await c.post('/api/me/photo', { data: 'data:text/html;base64,PGI+' })).status, 400);
  assert.equal((await c.post('/api/me/photo', { data: PNG })).status, 200);
  assert.equal((await c.del('/api/me/photo')).status, 200);
});

test('ejercicios: grupo libre, nombres únicos, importar varios y catálogo ampliado', async () => {
  const a = await coach.post('/api/coach/exercises', { name: 'Press Landmine', muscle: 'Funcional' }); // grupo propio
  assert.equal(a.status, 201);
  assert.equal((await coach.post('/api/coach/exercises', { name: 'press landmine', muscle: 'Pecho' })).status, 409);
  const b = await coach.post('/api/coach/exercises/bulk', { items: [
    { name: 'Remo Meadows', muscle: 'Espalda', equipment: 'Barra' }, { name: 'Curl Zottman', muscle: 'Bíceps' }, { name: 'Press Landmine', muscle: 'Funcional' },
  ] });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.added, 2);
  assert.deepEqual(b.body.skipped, ['Press Landmine']);
  const bad = await coach.post('/api/coach/exercises/bulk', { items: [{ name: 'Ok uno', muscle: 'Core' }, { name: 'Sin grupo' }] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Línea 2/);
  const names = (await coach.get('/api/coach/exercises')).body.items.map((e) => e.name);
  assert.equal(names.includes('Ok uno'), false); // todo o nada
  assert.equal((await coach.post('/api/coach/exercises/bulk', { items: [] })).status, 400);
  const before = names.length;
  const c1 = await coach.post('/api/coach/exercises/catalog');
  assert.equal(c1.status, 201);
  assert.ok(c1.body.added >= 90);
  const c2 = await coach.post('/api/coach/exercises/catalog');
  assert.equal(c2.body.added, 0); // no duplica
  assert.equal((await coach.get('/api/coach/exercises')).body.items.length, before + c1.body.added);
  const id = a.body.id;
  assert.equal((await coach.put(`/api/coach/exercises/${id}`, { name: 'Curl Zottman', muscle: 'Funcional' })).status, 409);
  assert.equal((await coach.put(`/api/coach/exercises/${id}`, { name: 'Press Landmine', muscle: 'Hombros' })).status, 200);
  const cl = new Client();
  await cl.post('/api/auth/login', { email: 'ana1@test.com', password: 'Nueva12345' });
  assert.equal((await cl.post('/api/coach/exercises/bulk', { items: [{ name: 'x', muscle: 'y' }] })).status, 403); // solo entrenador
  assert.equal((await cl.post('/api/coach/exercises/catalog')).status, 403);
});

test('rutinas: un mismo día puede repetirse en varios días de la semana (y las antiguas se convierten)', async () => {
  const ex = (await coach.get('/api/coach/exercises')).body.items[0].id;
  const mk = (days) => coach.post('/api/coach/routines', { name: 'Torso ' + Math.random(), tier: 'free', days });
  const e = [{ exercise_id: ex, sets: 3, reps: '10' }];
  assert.equal((await mk([{ name: 'X', weekdays: [8], exercises: e }])).status, 400);
  assert.equal((await mk([{ name: 'X', weekdays: ['a'], exercises: e }])).status, 400);
  const r = await mk([{ name: 'Pecho', weekdays: [4, 1, 1], exercises: e }, { name: 'Espalda', weekdays: [2], exercises: e }, { name: 'Libre', exercises: e }]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const got = (await coach.get(`/api/coach/routines/${r.body.id}`)).body.routine.days;
  assert.deepEqual(got.map((d) => d.weekdays), [[1, 4], [2], []]);
  // formato antiguo (weekday) se acepta y se convierte
  const old = await mk([{ name: 'Viejo', weekday: 3, exercises: e }]);
  assert.deepEqual((await coach.get(`/api/coach/routines/${old.body.id}`)).body.routine.days[0].weekdays, [3]);
  // en la base, una rutina guardada con el formato viejo se lee igual
  await db.run('UPDATE routines SET days = ? WHERE id = ?', JSON.stringify([{ name: 'Legacy', weekday: 5, notes: '', exercises: [{ exercise_id: ex, sets: 3, reps: '10', rest: '', notes: '' }] }]), old.body.id);
  assert.deepEqual((await coach.get(`/api/coach/routines/${old.body.id}`)).body.routine.days[0].weekdays, [5]);
  // el cliente ve “hoy” en cualquiera de los dos días
  const c = new Client();
  assert.equal((await c.post('/api/auth/register', reg(9, { first_name: 'Eva' }))).status, 201);
  const cid = (await c.get('/api/me')).body.user.id;
  assert.equal((await coach.post(`/api/coach/clients/${cid}/routines`, { routine_id: r.body.id })).status, 201);
  const day = async (d) => (await c.get(`/api/me/dashboard?date=${d}`)).body;
  assert.equal((await day('2026-11-02')).today.day.name, 'Pecho'); // lunes
  assert.equal((await day('2026-11-05')).today.day.name, 'Pecho'); // jueves
  assert.equal((await day('2026-11-03')).today.day.name, 'Espalda'); // martes
  const wed = await day('2026-11-04');
  assert.equal(wed.today, null);
  assert.equal(wed.next.day_name, 'Pecho'); // próximo: jueves
});
