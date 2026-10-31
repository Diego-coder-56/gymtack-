// Servidor local para desarrollo (sirve la API y la carpeta public/). En producción se usa la función de Netlify.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { ready } from './seed.js';

const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

await ready();
createApp({ serveStatic: true, publicDir }).listen(PORT, () => {
  console.log(`\n  GYMTRACK (local) listo en http://localhost:${PORT}\n`);
});
