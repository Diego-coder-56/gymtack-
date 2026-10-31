// Uso: npm run trainer -- correo@dominio.com "ContraseñaSegura1" "Nombre"
// Crea la cuenta del entrenador o restablece la contraseña si el correo ya existe.
// Necesita DATABASE_URL en el entorno (o en .env, ver README).
import { db, closeDb } from './db.js';
import { hashPassword, email as vEmail, password as vPassword } from './auth.js';
import { ready } from './seed.js';

const [, , mailArg, passArg, nameArg] = process.argv;
if (!mailArg || !passArg) {
  console.log('Uso: npm run trainer -- correo contraseña [nombre]');
  process.exit(1);
}
try {
  await ready();
  const mail = vEmail(mailArg);
  const pass = vPassword(passArg);
  const hash = await hashPassword(pass);
  const ex = await db.get('SELECT id FROM users WHERE lower(email) = ?', mail);
  if (ex) {
    await db.run("UPDATE users SET pass_hash = ?, role = 'trainer', active = 1 WHERE id = ?", hash, ex.id);
    await db.run('DELETE FROM sessions WHERE user_id = ?', ex.id);
    console.log(`Contraseña actualizada y rol de entrenador confirmado para ${mail}`);
  } else {
    const id = await db.insert("INSERT INTO users(email,pass_hash,role,first_name,last_name) VALUES(?,?,'trainer',?,'')", mail, hash, nameArg || 'Entrenador');
    await db.run('INSERT INTO profiles(user_id) VALUES(?)', id);
    console.log(`Entrenador creado: ${mail}`);
  }
} catch (e) {
  console.error('Error:', e.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
