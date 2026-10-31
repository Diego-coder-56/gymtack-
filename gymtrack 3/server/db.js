import pg from 'pg';

// bigint (COUNT, SUM de enteros) y numeric llegan como número, igual que en SQLite
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

let pool;
const getPool = () => {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta la variable DATABASE_URL (cadena de conexión de Supabase)');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || process.env.PGSSL === 'disable';
  pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX) || 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: local ? false : { rejectUnauthorized: false },
  });
  pool.on('error', (e) => console.error('[pg] error en conexión inactiva:', e.message));
  return pool;
};

// Escribimos las consultas con "?" y aquí se convierten a $1, $2…
const conv = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
const clean = (params) => params.map((p) => (p === undefined ? null : p));

const makeExec = (runner) => {
  const q = (sql, params) => runner.query(conv(sql), clean(params));
  return {
    all: async (sql, ...p) => (await q(sql, p)).rows,
    get: async (sql, ...p) => (await q(sql, p)).rows[0],
    run: async (sql, ...p) => q(sql, p),
    // INSERT que devuelve el id generado
    insert: async (sql, ...p) => (await q(`${sql} RETURNING id`, p)).rows[0].id,
  };
};

export const db = makeExec({ query: (sql, params) => getPool().query(sql, params) });

export const tx = async (fn) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const r = await fn(makeExec(client));
    await client.query('COMMIT');
    return r;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* conexión ya cerrada */ }
    throw e;
  } finally {
    client.release();
  }
};

export const closeDb = async () => { if (pool) { await pool.end(); pool = null; } };

export const getSetting = async (key, fallback = '', d = db) => {
  const r = await d.get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : fallback;
};
export const setSetting = (key, value, d = db) =>
  d.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value ?? ''));
