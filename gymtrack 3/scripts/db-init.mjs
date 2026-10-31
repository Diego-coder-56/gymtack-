// Aplica supabase/schema.sql a la base indicada en DATABASE_URL (alternativa a pegarlo en el SQL Editor).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Define DATABASE_URL primero.'); process.exit(1); }
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || process.env.PGSSL === 'disable';
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
const sql = fs.readFileSync(fileURLToPath(new URL('../supabase/schema.sql', import.meta.url)), 'utf8');
await client.connect();
try { await client.query(sql); console.log('Esquema aplicado correctamente.'); }
catch (e) { console.error('Error:', e.message); process.exitCode = 1; }
finally { await client.end(); }
