# GYMTRACK · Netlify + Supabase

Plataforma para que un entrenador gestione **ejercicios, rutinas y planes alimenticios**, con acceso **Premium** (de pago) y **Gratuito**. El acceso Premium se valida **en el servidor**.

**Cómo está armado**

| Pieza | Dónde vive |
|---|---|
| Interfaz (HTML/CSS/JS) | `public/` → Netlify (estático) |
| API (`/api/*`) | `netlify/functions/api.mjs` → función serverless de Netlify (Express) |
| Base de datos | Supabase **PostgreSQL** (`supabase/schema.sql`) |
| Fotos (perfil y progreso) | Supabase **Storage**, bucket privado `photos` |

El navegador solo habla con tu sitio de Netlify. Las claves de Supabase viven únicamente en variables de entorno del servidor. Las tablas tienen RLS activado y sin permisos para `anon`, así nadie puede leerlas desde fuera.

## Puesta en marcha (≈10 min)

### 1) Supabase
1. Crea un proyecto en https://supabase.com.
2. **SQL Editor → New query**, pega todo `supabase/schema.sql` y pulsa **Run**. Crea las tablas, la seguridad y el bucket privado `photos`.
3. Reúne tres datos:
   - **Project Settings → Database → Connection string → Transaction pooler** (puerto **6543**) → será `DATABASE_URL` (cambia `[YOUR-PASSWORD]` por la contraseña de tu base).
   - **Project Settings → API → Project URL** → `SUPABASE_URL`.
   - **Project Settings → API → `service_role` key** → `SUPABASE_SERVICE_ROLE_KEY` (secreta; no la compartas ni la subas a GitHub).

### 2) Netlify
1. Sube esta carpeta a un repositorio de GitHub (el `.gitignore` ya excluye `.env` y `node_modules`) y en Netlify elige **Add new site → Import an existing project**. La configuración la toma de `netlify.toml` (publica `public/`, funciones en `netlify/functions`).
   *(También sirve `netlify deploy --prod` con Netlify CLI. Arrastrar solo la carpeta al "drop" **no** funciona porque necesita compilar la función.)*
2. **Site configuration → Environment variables**, agrega:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | cadena del Transaction pooler |
   | `SUPABASE_URL` | URL del proyecto |
   | `SUPABASE_SERVICE_ROLE_KEY` | clave service_role |
   | `TRAINER_EMAIL` | tu correo de entrenador |
   | `TRAINER_PASSWORD` | una clave segura (8+ caracteres, letras y números) |
   | `TRAINER_NAME` | *(opcional)* tu nombre |

3. Despliega. La **primera vez que alguien abra la app** se crean solos: tu cuenta de entrenador y el contenido de ejemplo (40 ejercicios, 3 rutinas, 2 planes alimenticios).
4. Entra con `TRAINER_EMAIL` / `TRAINER_PASSWORD`. Tus clientes se registran en `https://TU-SITIO.netlify.app/#/registro`.

> Si cambias `TRAINER_PASSWORD` después, no afecta a la cuenta ya creada. Para restablecerla: `npm run trainer -- correo clave "Nombre"` (con `DATABASE_URL` en un archivo `.env` local).

## Desarrollo local (opcional)
```bash
cp .env.example .env   # completa los valores
npm install
npm start              # http://localhost:3000
```
Sin `SUPABASE_URL` las fotos se guardan en memoria (solo para desarrollo; en Netlify son obligatorias las variables de Supabase).

## Pruebas
```bash
TEST_DATABASE_URL=postgresql://... npm test
```
⚠️ **Borra todo el esquema `public`** de esa base: usa una base de pruebas vacía, **nunca** la de producción. Verifica registro, permisos, aislamiento entre clientes, bloqueo Premium, pagos y vencimiento, y la gestión del entrenador (16 pruebas).

## Notas y límites
- **Sin correos:** "Olvidé mi contraseña" deja el enlace en los **logs de la función** (Netlify → Logs → Functions) y el entrenador puede generarlo desde la ficha del cliente para enviarlo por WhatsApp.
- **Sin cobro en línea:** los pagos se registran a mano.
- **Fotos:** máx. 4 MB por imagen (el navegador las reduce antes de subirlas). Las funciones de Netlify aceptan hasta ~6 MB por petición.
- La foto de portada es un diseño geométrico; para usar tu foto guarda `public/img/hero.jpg`.
- Respalda tu base desde Supabase (Database → Backups) y, si quieres, descarga el bucket `photos`.
