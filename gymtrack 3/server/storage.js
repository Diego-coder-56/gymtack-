// Fotos privadas en Supabase Storage (bucket "photos").
// Sin SUPABASE_URL (solo desarrollo local y pruebas) se guardan en memoria.
import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_BUCKET || 'photos';
const memory = new Map();
let client;

const useSupabase = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const sb = () => (client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));

export async function putFile(name, buf, contentType) {
  if (!useSupabase()) {
    if (process.env.NETLIFY || process.env.NODE_ENV === 'production') throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para guardar fotos');
    memory.set(name, { buf, contentType });
    return;
  }
  const { error } = await sb().storage.from(BUCKET).upload(name, buf, { contentType, upsert: false });
  if (error) throw new Error(`No se pudo guardar la imagen: ${error.message}`);
}

export async function getFile(name) {
  if (!useSupabase()) return memory.get(name) || null;
  const { data, error } = await sb().storage.from(BUCKET).download(name);
  if (error || !data) return null;
  return { buf: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
}

export async function removeFile(name) {
  if (!name || !/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return;
  try {
    if (!useSupabase()) memory.delete(name);
    else await sb().storage.from(BUCKET).remove([name]);
  } catch (e) { console.error('[storage] no se pudo borrar', name, e.message); }
}
