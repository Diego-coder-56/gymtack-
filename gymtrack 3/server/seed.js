import crypto from 'node:crypto';
import { db, tx, getSetting, setSetting } from './db.js';
import { hashPassword, email as vEmail, password as vPassword } from './auth.js';

// [nombre, músculo, equipo, descripción]
const EXERCISES = [
  ['Press de banca con barra', 'Pecho', 'Barra', 'Acostado en banco, baja la barra al pecho con control y empuja hasta extender los codos.'],
  ['Press inclinado con mancuernas', 'Pecho', 'Mancuernas', 'Banco a 30°. Baja las mancuernas a la altura del pecho y empuja sin chocarlas arriba.'],
  ['Aperturas con mancuernas', 'Pecho', 'Mancuernas', 'Codos ligeramente flexionados; abre en arco hasta sentir estiramiento y vuelve cerrando el pecho.'],
  ['Flexiones', 'Pecho', 'Peso corporal', 'Cuerpo en línea recta, baja el pecho al piso y empuja. Apoya las rodillas para hacerlo más fácil.'],
  ['Cruce de poleas', 'Pecho', 'Polea', 'Un paso al frente, jala las manijas hacia el centro del pecho apretando al final.'],
  ['Dominadas', 'Espalda', 'Barra fija', 'Agarre prono, sube hasta pasar la barbilla de la barra llevando los codos hacia las costillas.'],
  ['Jalón al pecho', 'Espalda', 'Polea', 'Jala la barra hacia la parte alta del pecho con el torso estable, sin balancearte.'],
  ['Remo con barra', 'Espalda', 'Barra', 'Torso inclinado ~45°, espalda neutra; lleva la barra al abdomen bajo.'],
  ['Remo con mancuerna', 'Espalda', 'Mancuernas', 'Apoya una mano y rodilla en banco; jala la mancuerna hacia la cadera.'],
  ['Remo en polea baja', 'Espalda', 'Polea', 'Sentado, jala el agarre al abdomen juntando escápulas; regresa con control.'],
  ['Peso muerto', 'Espalda', 'Barra', 'Barra pegada a las piernas, espalda neutra; empuja el piso y extiende cadera y rodillas a la vez.'],
  ['Sentadilla con barra', 'Piernas', 'Barra', 'Barra sobre trapecios, baja con pecho arriba hasta paralelo o más y sube empujando el piso.'],
  ['Sentadilla goblet', 'Piernas', 'Mancuernas', 'Sostén una mancuerna al pecho, baja profundo con la espalda recta.'],
  ['Prensa de piernas', 'Piernas', 'Máquina', 'Pies a la anchura de hombros; baja hasta ~90° de rodilla sin despegar la cadera.'],
  ['Zancadas', 'Piernas', 'Mancuernas', 'Da un paso largo, baja la rodilla trasera cerca del piso y regresa empujando con el talón delantero.'],
  ['Peso muerto rumano', 'Piernas', 'Barra', 'Piernas casi rectas, lleva la cadera atrás con la barra rozando los muslos hasta sentir los isquios.'],
  ['Curl femoral', 'Piernas', 'Máquina', 'Flexiona las rodillas llevando los talones hacia los glúteos de forma controlada.'],
  ['Extensión de cuádriceps', 'Piernas', 'Máquina', 'Extiende las rodillas hasta arriba, pausa un segundo y baja lento.'],
  ['Elevación de talones', 'Piernas', 'Peso corporal', 'De pie en un escalón, sube a puntas lo más alto posible y baja estirando.'],
  ['Hip thrust', 'Glúteos', 'Barra', 'Espalda alta en banco, empuja la cadera hacia arriba y aprieta glúteos arriba.'],
  ['Puente de glúteo', 'Glúteos', 'Peso corporal', 'Acostado, pies apoyados; sube la cadera apretando glúteos y baja sin tocar el piso.'],
  ['Press militar con mancuernas', 'Hombros', 'Mancuernas', 'Sentado o de pie, empuja las mancuernas sobre la cabeza sin arquear la espalda.'],
  ['Elevaciones laterales', 'Hombros', 'Mancuernas', 'Sube los brazos a los lados hasta la altura de los hombros con codos suaves.'],
  ['Pájaros', 'Hombros', 'Mancuernas', 'Torso inclinado, abre los brazos hacia los lados para trabajar el deltoide posterior.'],
  ['Face pull', 'Hombros', 'Polea', 'Jala la cuerda hacia la cara abriendo los codos; ideal para salud del hombro.'],
  ['Curl con barra', 'Bíceps', 'Barra', 'Codos pegados al torso, sube la barra sin balancear el cuerpo.'],
  ['Curl martillo', 'Bíceps', 'Mancuernas', 'Agarre neutro, sube alternando brazos con control.'],
  ['Fondos en banco', 'Tríceps', 'Banco', 'Manos en el borde del banco, baja flexionando codos hacia atrás y empuja.'],
  ['Extensión de tríceps en polea', 'Tríceps', 'Polea', 'Codos fijos a los costados, extiende hasta bloquear abajo.'],
  ['Press francés', 'Tríceps', 'Barra Z', 'Acostado, baja la barra hacia la frente flexionando solo los codos.'],
  ['Plancha', 'Core', 'Peso corporal', 'Antebrazos en el piso, cuerpo en línea recta, abdomen y glúteos apretados.'],
  ['Crunch abdominal', 'Core', 'Peso corporal', 'Sube el pecho hacia la pelvis enrollando el tronco, sin jalar el cuello.'],
  ['Elevación de piernas', 'Core', 'Peso corporal', 'Acostado o colgado, sube las piernas controlando el movimiento sin arquear la espalda baja.'],
  ['Russian twist', 'Core', 'Peso corporal', 'Sentado con el torso inclinado, gira de lado a lado llevando las manos al piso.'],
  ['Dead bug', 'Core', 'Peso corporal', 'Boca arriba, extiende brazo y pierna opuestos manteniendo la zona lumbar pegada al piso.'],
  ['Caminata en caminadora', 'Cardio', 'Caminadora', 'Ritmo constante, con inclinación opcional para subir la intensidad.'],
  ['Bicicleta estática', 'Cardio', 'Bicicleta', 'Cadencia constante o por intervalos según indique tu rutina.'],
  ['Remo en ergómetro', 'Cardio', 'Remo', 'Empuja con piernas, luego espalda y brazos; regresa en orden inverso.'],
  ['Saltar la cuerda', 'Cardio', 'Cuerda', 'Saltos cortos sobre la punta de los pies, muñecas relajadas.'],
  ['Burpees', 'Cardio', 'Peso corporal', 'Baja a flexión, salta los pies al frente y termina con un salto vertical.'],
];

const day = (name, weekday, ex) => ({ name, weekdays: weekday ? [weekday] : [], notes: '', exercises: ex.map(([n, sets, reps, rest, notes = '']) => ({ exercise: n, sets, reps, rest, notes })) });

const ROUTINES = [
  {
    name: 'Cuerpo completo — Inicio (gratis)',
    description: 'Rutina base de 3 días para empezar con técnica y constancia. Incluida para clientes gratuitos.',
    level: 'principiante', goal: 'Salud y bienestar', tier: 'free',
    days: [
      day('Día A — Cuerpo completo', 1, [['Sentadilla goblet', 3, '10-12', '60 s'], ['Flexiones', 3, '8-10', '60 s', 'Apoya rodillas si lo necesitas'], ['Remo con mancuerna', 3, '10-12', '60 s'], ['Plancha', 3, '30 s', '45 s']]),
      day('Día B — Cuerpo completo', 3, [['Prensa de piernas', 3, '10-12', '60 s'], ['Press militar con mancuernas', 3, '10', '60 s'], ['Jalón al pecho', 3, '10-12', '60 s'], ['Crunch abdominal', 3, '15', '45 s']]),
      day('Día C — Cuerpo completo', 5, [['Zancadas', 3, '10 por pierna', '60 s'], ['Press inclinado con mancuernas', 3, '10', '60 s'], ['Remo en polea baja', 3, '12', '60 s'], ['Dead bug', 3, '10 por lado', '45 s']]),
    ],
  },
  {
    name: 'Hipertrofia Push / Pull / Legs',
    description: 'Seis sesiones por semana divididas en empuje, jalón y pierna. Progresión de cargas semanal.',
    level: 'intermedio', goal: 'Ganar masa muscular', tier: 'premium',
    days: [
      day('Push — Pecho, hombro, tríceps', 1, [['Press de banca con barra', 4, '6-8', '90 s'], ['Press inclinado con mancuernas', 3, '8-10', '75 s'], ['Press militar con mancuernas', 3, '8-10', '75 s'], ['Elevaciones laterales', 3, '12-15', '45 s'], ['Extensión de tríceps en polea', 3, '10-12', '45 s']]),
      day('Pull — Espalda y bíceps', 2, [['Dominadas', 4, '6-10', '90 s'], ['Remo con barra', 4, '8-10', '90 s'], ['Jalón al pecho', 3, '10-12', '60 s'], ['Face pull', 3, '12-15', '45 s'], ['Curl con barra', 3, '8-10', '60 s']]),
      day('Legs — Pierna completa', 3, [['Sentadilla con barra', 4, '6-8', '120 s'], ['Peso muerto rumano', 3, '8-10', '90 s'], ['Prensa de piernas', 3, '10-12', '75 s'], ['Curl femoral', 3, '10-12', '60 s'], ['Elevación de talones', 4, '12-15', '45 s']]),
      day('Push 2', 4, [['Press inclinado con mancuernas', 4, '8-10', '90 s'], ['Aperturas con mancuernas', 3, '12', '60 s'], ['Elevaciones laterales', 4, '12-15', '45 s'], ['Press francés', 3, '10', '60 s'], ['Fondos en banco', 3, '12', '45 s']]),
      day('Pull 2', 5, [['Peso muerto', 3, '5', '120 s'], ['Remo en polea baja', 3, '10-12', '75 s'], ['Remo con mancuerna', 3, '10', '60 s'], ['Pájaros', 3, '12-15', '45 s'], ['Curl martillo', 3, '10-12', '45 s']]),
      day('Legs 2 y core', 6, [['Zancadas', 3, '10 por pierna', '75 s'], ['Hip thrust', 4, '8-10', '90 s'], ['Extensión de cuádriceps', 3, '12-15', '45 s'], ['Elevación de piernas', 3, '12', '45 s'], ['Plancha', 3, '45 s', '45 s']]),
    ],
  },
  {
    name: 'Pérdida de grasa en casa',
    description: 'Circuitos sin equipo para quemar grasa y mantener músculo. 4 días por semana, 40 minutos.',
    level: 'principiante', goal: 'Reducir grasa corporal', tier: 'premium',
    days: [
      day('Circuito A — Tren inferior', 1, [['Sentadilla goblet', 4, '15', '30 s', 'Usa una mochila con peso si no tienes mancuerna'], ['Puente de glúteo', 4, '15', '30 s'], ['Zancadas', 3, '12 por pierna', '30 s'], ['Saltar la cuerda', 4, '60 s', '30 s']]),
      day('Circuito B — Tren superior y core', 2, [['Flexiones', 4, '8-12', '30 s'], ['Fondos en banco', 3, '12', '30 s'], ['Plancha', 4, '40 s', '30 s'], ['Russian twist', 3, '20', '30 s']]),
      day('Circuito C — Cardio metabólico', 4, [['Burpees', 5, '10', '40 s'], ['Saltar la cuerda', 5, '60 s', '30 s'], ['Crunch abdominal', 4, '20', '30 s'], ['Elevación de talones', 4, '20', '30 s']]),
      day('Circuito D — Cuerpo completo', 6, [['Sentadilla goblet', 4, '15', '30 s'], ['Flexiones', 4, '10', '30 s'], ['Dead bug', 3, '12 por lado', '30 s'], ['Caminata en caminadora', 1, '25 min', '—', 'Ritmo rápido o caminata exterior']]),
    ],
  },
];

const DIETS = [
  {
    name: 'Definición — 1,800 kcal', description: 'Déficit moderado con proteína alta. Ajusta porciones según la evolución semanal.',
    calories: 1800, protein: 150, carbs: 170, fat: 55,
    meals: [
      { name: 'Desayuno', time: '08:00', items: ['3 huevos revueltos con espinaca', '2 rebanadas de pan integral', '1 fruta mediana'], notes: '' },
      { name: 'Colación', time: '11:00', items: ['1 yogurt griego natural', '10 almendras'], notes: '' },
      { name: 'Comida', time: '14:30', items: ['150 g de pechuga de pollo a la plancha', '1/2 taza de arroz o frijoles', 'Ensalada verde libre con limón y aceite de oliva (1 cdta)'], notes: '' },
      { name: 'Colación', time: '17:30', items: ['1 scoop de proteína o 1 lata de atún', '1 fruta'], notes: 'Antes de entrenar si lo haces por la tarde' },
      { name: 'Cena', time: '20:30', items: ['120 g de pescado o pollo', 'Verduras al vapor', '1 tortilla de maíz'], notes: '' },
    ],
  },
  {
    name: 'Volumen limpio — 2,600 kcal', description: 'Superávit controlado para ganar masa muscular con poca grasa.',
    calories: 2600, protein: 170, carbs: 320, fat: 70,
    meals: [
      { name: 'Desayuno', time: '07:30', items: ['1 taza de avena cocida con leche', '1 plátano', '3 claras + 2 huevos', '1 cdta de crema de cacahuate'], notes: '' },
      { name: 'Colación', time: '10:30', items: ['Sándwich de pavo integral', '1 fruta'], notes: '' },
      { name: 'Comida', time: '14:00', items: ['180 g de carne magra o pollo', '1 taza de arroz', '1/2 taza de frijoles', 'Verduras'], notes: '' },
      { name: 'Pre-entreno', time: '17:00', items: ['1 plátano', '1 yogurt griego', 'Café opcional'], notes: '' },
      { name: 'Post-entreno', time: '19:30', items: ['1 scoop de proteína con leche', '1 pieza de pan o tortillas'], notes: '' },
      { name: 'Cena', time: '21:00', items: ['150 g de pescado o pollo', 'Camote o papa mediana', 'Ensalada'], notes: '' },
    ],
  },
];

// Carga contenido de ejemplo la primera vez (ejercicios, rutinas, planes) y ajustes por defecto.
export async function seedIfEmpty(d = db) {
  const hasEx = (await d.get('SELECT COUNT(*) AS c FROM exercises')).c;
  if (!hasEx) {
    const ids = {};
    for (const [n, m, e, desc] of EXERCISES) {
      ids[n] = await d.insert('INSERT INTO exercises(name,muscle,equipment,description) VALUES(?,?,?,?)', n, m, e, desc);
    }
    for (const r of ROUTINES) {
      const days = r.days.map((day) => ({
        ...day,
        exercises: day.exercises.map(({ exercise, ...rest }) => ({ exercise_id: ids[exercise], ...rest })),
      }));
      await d.run('INSERT INTO routines(name,description,level,goal,tier,days) VALUES(?,?,?,?,?,?)', r.name, r.description, r.level, r.goal, r.tier, JSON.stringify(days));
    }
    for (const x of DIETS) {
      await d.run('INSERT INTO diets(name,description,calories,protein,carbs,fat,meals) VALUES(?,?,?,?,?,?,?)', x.name, x.description, x.calories, x.protein, x.carbs, x.fat, JSON.stringify(x.meals));
    }
  }
  if (!(await getSetting('trainer_name', '', d))) await setSetting('trainer_name', 'Tu entrenador', d);
  if ((await getSetting('premium_price', null, d)) === null) await setSetting('premium_price', '', d);
}

// Crea la cuenta del entrenador si aún no existe ninguna.
// Usa TRAINER_EMAIL y TRAINER_PASSWORD (variables de entorno) o los valores recibidos.
export async function ensureTrainer({ email, password, name } = {}, d = db) {
  const existing = await d.get("SELECT id FROM users WHERE role='trainer' LIMIT 1");
  if (existing) return null;
  const mail = String(email || process.env.TRAINER_EMAIL || '').trim().toLowerCase();
  const pass = password || process.env.TRAINER_PASSWORD || '';
  if (!mail || !pass) {
    console.warn('[GYMTRACK] No hay entrenador. Define TRAINER_EMAIL y TRAINER_PASSWORD en las variables de entorno.');
    return null;
  }
  vEmail(mail);
  vPassword(pass, 'TRAINER_PASSWORD');
  const hash = await hashPassword(pass);
  const id = await d.insert("INSERT INTO users(email,pass_hash,role,first_name,last_name) VALUES(?,?,'trainer',?,?)", mail, hash, name || process.env.TRAINER_NAME || 'Entrenador', '');
  await d.run('INSERT INTO profiles(user_id) VALUES(?)', id);
  console.log(`[GYMTRACK] Entrenador creado: ${mail}`);
  return { email: mail };
}

// Se ejecuta una vez por instancia: contenido de ejemplo + entrenador. Seguro ante arranques simultáneos.
let readyPromise;
export function ready() {
  readyPromise ??= tx(async (t) => {
    await t.run('SELECT pg_advisory_xact_lock(727001)');
    await seedIfEmpty(t);
    await ensureTrainer({}, t);
  }).catch((e) => { readyPromise = null; throw e; });
  return readyPromise;
}

// Catálogo ampliado: se agrega con un clic desde Ejercicios (omite los que ya existen por nombre).
// [nombre, grupo, equipo, descripción]
export const EXTRA_EXERCISES = [
  ['Press de banca con mancuernas', 'Pecho', 'Mancuernas', 'Acostado en banco plano, empuja las mancuernas hasta extender los codos y baja con control hasta sentir estiramiento en el pecho.'],
  ['Press inclinado con barra', 'Pecho', 'Barra', 'Banco a 30°. Baja la barra a la parte alta del pecho y empuja sin rebotar.'],
  ['Press declinado con barra', 'Pecho', 'Barra', 'Banco declinado; baja la barra a la parte baja del pecho y empuja en línea recta.'],
  ['Press en máquina de pecho', 'Pecho', 'Máquina', 'Espalda pegada al respaldo, empuja las manijas al frente sin bloquear de golpe los codos.'],
  ['Aperturas en máquina (peck deck)', 'Pecho', 'Máquina', 'Codos a la altura del pecho; junta los brazos al frente apretando el pecho y regresa lento.'],
  ['Flexiones diamante', 'Pecho', 'Peso corporal', 'Manos juntas formando un diamante bajo el pecho; trabaja pecho y tríceps.'],
  ['Flexiones con pies elevados', 'Pecho', 'Peso corporal', 'Pies sobre un banco, cuerpo en línea recta; enfatiza la parte alta del pecho.'],
  ['Pullover con mancuerna', 'Pecho', 'Mancuernas', 'Acostado cruzado en banco, lleva la mancuerna detrás de la cabeza con codos suaves y regresa sobre el pecho.'],
  ['Dominadas supinas (chin-up)', 'Espalda', 'Barra fija', 'Agarre supino a la anchura de hombros; sube hasta pasar la barbilla de la barra. Trabaja también bíceps.'],
  ['Jalón agarre cerrado', 'Espalda', 'Polea', 'Agarre neutro cerrado; jala hacia el pecho llevando los codos a las costillas.'],
  ['Remo en máquina', 'Espalda', 'Máquina', 'Pecho apoyado, jala las manijas juntando escápulas y regresa sin soltar la tensión.'],
  ['Remo T con barra', 'Espalda', 'Barra', 'Torso inclinado, espalda neutra; jala la barra hacia el abdomen alto.'],
  ['Remo Pendlay', 'Espalda', 'Barra', 'Barra desde el piso en cada repetición, torso casi paralelo al suelo; jala explosivo al abdomen.'],
  ['Remo invertido', 'Espalda', 'Barra / TRX', 'Colgado bajo una barra baja con el cuerpo recto; jala el pecho hacia la barra.'],
  ['Pullover en polea', 'Espalda', 'Polea', 'Brazos casi rectos, baja la barra hacia los muslos contrayendo dorsales.'],
  ['Remo unilateral en polea', 'Espalda', 'Polea', 'Jala una manija hacia la cadera rotando ligeramente el torso; enfatiza el dorsal.'],
  ['Hiperextensiones', 'Espalda', 'Banco romano', 'Baja el torso con la espalda neutra y sube hasta alinear cuerpo; fortalece zona lumbar y glúteos.'],
  ['Buenos días', 'Espalda', 'Barra', 'Barra en la espalda alta, lleva la cadera atrás con espalda neutra y rodillas suaves; usa poco peso.'],
  ['Encogimientos de trapecio con mancuernas', 'Espalda', 'Mancuernas', 'Sube los hombros hacia las orejas sin rotarlos, pausa arriba y baja lento.'],
  ['Peso muerto sumo', 'Espalda', 'Barra', 'Pies muy abiertos y agarre estrecho; empuja el piso y extiende cadera y rodillas.'],
  ['Sentadilla frontal', 'Piernas', 'Barra', 'Barra sobre los hombros por delante, codos altos; baja profundo con el torso erguido.'],
  ['Sentadilla en máquina Smith', 'Piernas', 'Máquina Smith', 'Pies ligeramente adelante de la barra; baja controlado y sube empujando el piso.'],
  ['Sentadilla búlgara', 'Piernas', 'Mancuernas', 'Pie trasero apoyado en un banco; baja con el torso recto y empuja con la pierna delantera.'],
  ['Hack squat', 'Piernas', 'Máquina', 'Espalda en el respaldo; baja hasta 90° o más y sube sin bloquear las rodillas.'],
  ['Subidas al cajón (step-up)', 'Piernas', 'Cajón / Mancuernas', 'Sube a un cajón empujando con el talón de la pierna que apoya y baja con control.'],
  ['Sentadilla sumo con mancuerna', 'Piernas', 'Mancuernas', 'Pies abiertos y puntas afuera, mancuerna colgando al centro; baja profundo.'],
  ['Peso muerto a una pierna', 'Piernas', 'Mancuernas', 'Equilibrio en una pierna, lleva el torso al frente y la otra pierna atrás hasta sentir los isquios.'],
  ['Curl femoral acostado', 'Piernas', 'Máquina', 'Acostado boca abajo, flexiona las rodillas llevando los talones a los glúteos.'],
  ['Curl nórdico', 'Piernas', 'Peso corporal', 'Rodillas fijas, baja el torso lo más lento posible y ayúdate con las manos al subir.'],
  ['Aductores en máquina', 'Piernas', 'Máquina', 'Junta las piernas contra la resistencia de forma controlada.'],
  ['Abductores en máquina', 'Piernas', 'Máquina', 'Abre las piernas contra la resistencia sin impulso.'],
  ['Sentadilla con salto', 'Piernas', 'Peso corporal', 'Baja a media sentadilla y salta explosivo; cae suave amortiguando con las rodillas.'],
  ['Elevación de talones sentado', 'Piernas', 'Máquina', 'Sentado con peso sobre las rodillas, sube a puntas y baja estirando el sóleo.'],
  ['Zancadas caminando', 'Piernas', 'Mancuernas', 'Avanza con pasos largos alternando piernas, rodilla trasera cerca del piso.'],
  ['Patada de glúteo en polea', 'Glúteos', 'Polea', 'Con tobillera, lleva la pierna hacia atrás apretando el glúteo sin arquear la espalda.'],
  ['Hip thrust a una pierna', 'Glúteos', 'Peso corporal', 'Espalda alta en banco, una pierna elevada; empuja la cadera arriba con la otra.'],
  ['Puente de glúteo con banda', 'Glúteos', 'Banda elástica', 'Banda sobre las rodillas; sube la cadera empujando las rodillas hacia afuera.'],
  ['Abducción de cadera con banda', 'Glúteos', 'Banda elástica', 'De pie o acostado de lado, abre la pierna contra la banda con control.'],
  ['Peso muerto rumano con mancuernas', 'Glúteos', 'Mancuernas', 'Lleva la cadera atrás con las mancuernas pegadas a las piernas hasta sentir el estiramiento.'],
  ['Almeja (clamshell)', 'Glúteos', 'Banda elástica', 'Acostado de lado con rodillas flexionadas, abre la rodilla de arriba sin mover la pelvis.'],
  ['Patada de burro (donkey kick)', 'Glúteos', 'Peso corporal', 'En cuadrupedia, empuja el talón hacia el techo con la rodilla flexionada.'],
  ['Press Arnold', 'Hombros', 'Mancuernas', 'Inicia con palmas hacia ti y rota mientras empujas sobre la cabeza.'],
  ['Press militar con barra', 'Hombros', 'Barra', 'De pie, empuja la barra sobre la cabeza con el abdomen apretado y sin arquear la espalda.'],
  ['Elevaciones frontales', 'Hombros', 'Mancuernas', 'Sube las mancuernas al frente hasta la altura de los hombros y baja lento.'],
  ['Elevaciones laterales en polea', 'Hombros', 'Polea', 'Tensión constante: sube el brazo a un lado hasta la altura del hombro.'],
  ['Pájaros en máquina', 'Hombros', 'Máquina', 'Abre los brazos hacia atrás apretando el deltoide posterior.'],
  ['Remo al mentón', 'Hombros', 'Barra', 'Sube la barra pegada al cuerpo con codos arriba hasta el pecho; agarre ancho para cuidar los hombros.'],
  ['Press de hombros en máquina', 'Hombros', 'Máquina', 'Empuja las manijas sobre la cabeza con la espalda apoyada.'],
  ['Curl alterno con mancuernas', 'Bíceps', 'Mancuernas', 'Sube un brazo a la vez girando la muñeca; sin balancear el torso.'],
  ['Curl concentrado', 'Bíceps', 'Mancuernas', 'Sentado con el codo apoyado en el muslo, sube la mancuerna apretando el bíceps.'],
  ['Curl predicador', 'Bíceps', 'Barra Z', 'Brazos apoyados en el banco predicador; baja hasta casi extender y sube controlado.'],
  ['Curl en polea baja', 'Bíceps', 'Polea', 'Tensión constante, codos pegados al torso.'],
  ['Curl inclinado con mancuernas', 'Bíceps', 'Mancuernas', 'Banco inclinado a 45° con los brazos colgando; mayor estiramiento del bíceps.'],
  ['Curl con banda elástica', 'Bíceps', 'Banda elástica', 'Pisa la banda y sube las manos hacia los hombros; ideal para entrenar en casa.'],
  ['Fondos en paralelas', 'Tríceps', 'Paralelas', 'Cuerpo recto y codos cerca del torso; baja hasta 90° y empuja.'],
  ['Patada de tríceps', 'Tríceps', 'Mancuernas', 'Torso inclinado, codo fijo; extiende el antebrazo hacia atrás.'],
  ['Extensión de tríceps sobre la cabeza', 'Tríceps', 'Mancuernas', 'Mancuerna detrás de la cabeza con ambas manos; extiende los codos hacia arriba.'],
  ['Press cerrado con barra', 'Tríceps', 'Barra', 'Agarre a la anchura de hombros; baja al pecho con codos cerca del cuerpo.'],
  ['Extensión de tríceps con cuerda', 'Tríceps', 'Polea', 'Abre la cuerda al final del movimiento y aprieta el tríceps.'],
  ['Curl de muñeca', 'Antebrazos', 'Barra', 'Antebrazos apoyados con palmas arriba; flexiona y extiende solo la muñeca.'],
  ['Curl de muñeca inverso', 'Antebrazos', 'Barra', 'Antebrazos apoyados con palmas abajo; sube el dorso de la mano.'],
  ['Caminata del granjero', 'Antebrazos', 'Mancuernas', 'Camina erguido cargando pesas pesadas a los lados; trabaja agarre y core.'],
  ['Plancha lateral', 'Core', 'Peso corporal', 'Apoyado sobre un antebrazo, cuerpo en línea recta de cabeza a pies.'],
  ['Escaladores (mountain climbers)', 'Core', 'Peso corporal', 'En posición de flexión, lleva las rodillas al pecho de forma alterna y rápida.'],
  ['Rueda abdominal', 'Core', 'Rueda', 'Desde las rodillas, rueda hacia adelante sin hundir la zona lumbar y regresa con el abdomen.'],
  ['Elevación de rodillas colgado', 'Core', 'Barra fija', 'Colgado, sube las rodillas al pecho sin balancearte.'],
  ['Crunch en polea', 'Core', 'Polea', 'De rodillas, enrolla el tronco llevando los codos hacia las rodillas.'],
  ['Bicicleta abdominal', 'Core', 'Peso corporal', 'Acostado, lleva el codo hacia la rodilla opuesta alternando lados con control.'],
  ['V-ups', 'Core', 'Peso corporal', 'Acostado, sube torso y piernas a la vez formando una V.'],
  ['Pallof press', 'Core', 'Polea / Banda', 'De lado a la polea, empuja las manos al frente resistiendo la rotación.'],
  ['Superman', 'Core', 'Peso corporal', 'Boca abajo, eleva brazos y piernas a la vez y sostén un segundo.'],
  ['Bird dog', 'Core', 'Peso corporal', 'En cuadrupedia, extiende brazo y pierna opuestos manteniendo la espalda estable.'],
  ['Hollow hold', 'Core', 'Peso corporal', 'Acostado, eleva hombros y piernas con la zona lumbar pegada al piso y sostén.'],
  ['Elíptica', 'Cardio', 'Elíptica', 'Ritmo constante o intervalos; mantén el torso erguido.'],
  ['Escaladora (stair climber)', 'Cardio', 'Escaladora', 'Sube a ritmo constante sin apoyarte en los pasamanos.'],
  ['Trote suave', 'Cardio', 'Caminadora / Exterior', 'Ritmo conversacional; ideal para base aeróbica.'],
  ['Jumping jacks', 'Cardio', 'Peso corporal', 'Salta abriendo piernas y brazos a la vez y regresa al centro.'],
  ['Sprints en caminadora (intervalos)', 'Cardio', 'Caminadora', 'Alterna 20–30 s a máxima velocidad con descanso activo.'],
  ['Battle ropes', 'Cardio', 'Cuerdas de batalla', 'Ondas alternas o simultáneas con las cuerdas, rodillas flexionadas y core firme.'],
  ['Salto al cajón', 'Cardio', 'Cajón pliométrico', 'Salta con los dos pies sobre el cajón y baja caminando.'],
  ['Rodillas altas (high knees)', 'Cardio', 'Peso corporal', 'Corre en el lugar subiendo las rodillas a la altura de la cadera.'],
  ['Kettlebell swing', 'Cuerpo completo', 'Kettlebell', 'Bisagra de cadera: lanza la pesa al frente con el empuje de las caderas, no con los brazos.'],
  ['Thruster con mancuernas', 'Cuerpo completo', 'Mancuernas', 'Sentadilla frontal seguida de press sobre la cabeza en un solo movimiento.'],
  ['Cargada de potencia con mancuernas', 'Cuerpo completo', 'Mancuernas', 'Lleva las mancuernas del piso a los hombros con una extensión explosiva de cadera.'],
  ['Levantamiento turco (get-up)', 'Cuerpo completo', 'Kettlebell', 'Del piso a de pie sosteniendo una pesa sobre la cabeza; lento y controlado.'],
  ['Arrastre de trineo', 'Cuerpo completo', 'Trineo', 'Empuja o jala el trineo con pasos cortos y potentes.'],
  ['Slam con balón medicinal', 'Cuerpo completo', 'Balón medicinal', 'Eleva el balón sobre la cabeza y lánzalo con fuerza al piso.'],
  ['Arrancada con mancuerna', 'Cuerpo completo', 'Mancuernas', 'Lleva la mancuerna del piso sobre la cabeza en un solo movimiento explosivo.'],
  ['Estiramiento de cadera 90/90', 'Movilidad', 'Peso corporal', 'Sentado con ambas rodillas a 90°, inclina el torso sobre la pierna delantera.'],
  ['Gato-camello', 'Movilidad', 'Peso corporal', 'En cuadrupedia, alterna redondear y arquear la columna con respiración lenta.'],
  ['Rotación torácica', 'Movilidad', 'Peso corporal', 'En cuadrupedia o de lado, rota el torso abriendo el pecho al techo.'],
  ['Estiramiento de isquiotibiales', 'Movilidad', 'Peso corporal', 'Pierna extendida al frente, inclina el torso con la espalda recta; sostén 30 s.'],
  ['Estiramiento de pectoral en puerta', 'Movilidad', 'Peso corporal', 'Antebrazo en el marco de una puerta, gira el cuerpo hasta sentir el estiramiento.'],
  ['Postura del niño', 'Movilidad', 'Peso corporal', 'De rodillas, siéntate sobre los talones y estira los brazos al frente.'],
  ['Sentadilla profunda con pausa', 'Movilidad', 'Peso corporal', 'Baja lo más profundo posible y mantén 20–30 s con el pecho arriba.'],
  ['Círculos de hombro con banda', 'Movilidad', 'Banda elástica', 'Sostén la banda con agarre ancho y pásala de enfrente hacia atrás con brazos rectos.'],
];
