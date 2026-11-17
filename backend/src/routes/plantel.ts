import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

const router = Router();

function texto(value: unknown, max = 150): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : null;
}
function opcional(value: unknown, max = 150): string | null {
  return value === '' || value === undefined || value === null ? null : texto(value, max);
}
function entero(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function idValido(value: unknown): string | null {
  const s = String(value ?? '');
  return /^[1-9]\d{0,18}$/.test(s) ? s : null;
}
function horaValida(value: unknown): string | null {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}
function errorDB(error: unknown): { status: number; mensaje: string } {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (error.code === '23505') return { status: 409, mensaje: 'El registro ya existe (CI, correo, código o asignación repetidos).' };
    if (error.code === '23503') return { status: 400, mensaje: 'Una referencia de docente, materia o asignación no existe.' };
    if (error.code === '23514') return { status: 400, mensaje: 'El horario o dato indicado incumple una restricción.' };
  }
  console.error('Error en Plantel Docente:', error);
  return { status: 500, mensaje: 'No se pudo completar la operación.' };
}

// Todas estas rutas requieren JWT y rol directora: se protegen en server.ts.
router.get('/resumen', async (_req, res) => {
  try {
    const [docentes, materias, asignaciones, horarios] = await Promise.all([
      pool.query(`SELECT d.id::text, d.perfil_id::text, d.codigo_docente, d.ci, d.telefono,
                   d.especialidad, d.activo, COALESCE(p.nombre_completo, 'Sin cuenta vinculada') AS nombre_completo,
                   p.correo
                  FROM public.docentes d LEFT JOIN public.perfiles p ON p.id=d.perfil_id
                  ORDER BY d.id DESC LIMIT 500`),
      pool.query(`SELECT id::text, codigo, nombre, semestre, activo
                  FROM public.materias ORDER BY nombre LIMIT 500`),
      pool.query(`SELECT a.id::text, a.docente_id::text, a.materia_id::text, a.gestion, a.activo,
                         COALESCE(p.nombre_completo, 'Sin cuenta vinculada') AS docente_nombre,
                         m.nombre AS materia_nombre
                  FROM public.asignaciones_docentes a
                  JOIN public.docentes d ON d.id=a.docente_id
                  LEFT JOIN public.perfiles p ON p.id=d.perfil_id
                  JOIN public.materias m ON m.id=a.materia_id
                  ORDER BY a.gestion DESC, a.id DESC LIMIT 800`),
      pool.query(`SELECT h.id::text, h.asignacion_id::text, h.dia_semana,
                         TO_CHAR(h.hora_inicio,'HH24:MI') AS hora_inicio,
                         TO_CHAR(h.hora_fin,'HH24:MI') AS hora_fin, h.aula, h.activo
                  FROM public.horarios_clase h ORDER BY h.dia_semana, h.hora_inicio LIMIT 1200`),
    ]);
    res.json({ docentes: docentes.rows, materias: materias.rows,
      asignaciones: asignaciones.rows, horarios: horarios.rows });
  } catch (error) {
    const e=errorDB(error); res.status(e.status).json({ mensaje:e.mensaje });
  }
});

// Se crea una cuenta docente con contraseña cifrada y su registro en una sola transacción.
router.post('/docentes', async (req, res) => {
  const { nombre_completo, correo, password, ci, telefono, especialidad, codigo_docente } = req.body ?? {};
  const nombre = texto(nombre_completo, 150);
  const email = texto(correo, 150)?.toLowerCase();
  const identidad = texto(ci, 30);
  const tel = opcional(telefono, 30);
  const esp = opcional(especialidad, 120);
  const codigo = opcional(codigo_docente, 30);
  if (!nombre || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !identidad ||
      typeof password !== 'string' || password.length < 12 || password.length > 128 ||
      (telefono != null && telefono !== '' && !tel) ||
      (especialidad != null && especialidad !== '' && !esp) ||
      (codigo_docente != null && codigo_docente !== '' && !codigo)) {
    res.status(400).json({ mensaje: 'Indica nombre, correo válido, CI y contraseña temporal de 12 a 128 caracteres.' });
    return;
  }
  const cliente = await pool.connect().catch(() => null);
  if (!cliente) { res.status(500).json({ mensaje: 'No se pudo conectar a PostgreSQL.' }); return; }
  try {
    const hash = await bcrypt.hash(password, 12);
    await cliente.query('BEGIN');
    const perfil = await cliente.query(
      `INSERT INTO public.perfiles (nombre_completo, correo, rol, activo, fecha_creacion, password_hash)
       VALUES ($1,$2,'docente',TRUE,CURRENT_TIMESTAMP,$3) RETURNING id`, [nombre, email, hash]);
    const resultado = await cliente.query(
      `INSERT INTO public.docentes (perfil_id, codigo_docente, ci, telefono, especialidad)
       VALUES ($1,$2,$3,$4,$5) RETURNING id::text`,
      [perfil.rows[0].id, codigo, identidad, tel, esp]);
    await cliente.query('COMMIT');
    res.status(201).json({ mensaje: 'Docente y cuenta creados.', id: resultado.rows[0].id });
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    const e=errorDB(error); res.status(e.status).json({ mensaje:e.mensaje });
  } finally { cliente.release(); }
});

router.post('/materias', async (req, res) => {
  const { codigo, nombre, semestre } = req.body ?? {};
  const c=texto(codigo,30), n=texto(nombre,150);
  const s=semestre === '' || semestre == null ? null : entero(semestre,1,12);
  if (!c || !n || (semestre !== '' && semestre != null && s === null)) {
    res.status(400).json({ mensaje: 'Indica código y nombre; semestre debe ser un número entre 1 y 12.' }); return;
  }
  try {
    const r=await pool.query(
      `INSERT INTO public.materias (codigo,nombre,semestre) VALUES ($1,$2,$3) RETURNING id::text`, [c,n,s]);
    res.status(201).json({ mensaje: 'Materia registrada.', id:r.rows[0].id });
  } catch (error) { const e=errorDB(error);res.status(e.status).json({mensaje:e.mensaje}); }
});

router.post('/asignaciones', async (req, res) => {
  const { docente_id, materia_id, gestion } = req.body ?? {};
  const d=idValido(docente_id), m=idValido(materia_id), g=entero(gestion,2000,2100);
  if (!d || !m || g === null) {
    res.status(400).json({ mensaje: 'Selecciona docente, materia y una gestión válida.' }); return;
  }
  try {
    // No asignar materias a cuentas desactivadas ni a materias inactivas.
    const r=await pool.query(
      `INSERT INTO public.asignaciones_docentes (docente_id,materia_id,gestion)
       SELECT d.id,m.id,$3 FROM public.docentes d
       JOIN public.materias m ON m.id=$2 AND m.activo=TRUE
       WHERE d.id=$1 AND d.activo=TRUE RETURNING id::text`, [d,m,g]);
    if (!r.rowCount) {res.status(400).json({mensaje:'Docente o materia no existen o están inactivos.'});return;}
    res.status(201).json({ mensaje:'Asignación registrada.', id:r.rows[0].id });
  } catch (error) { const e=errorDB(error);res.status(e.status).json({mensaje:e.mensaje}); }
});

router.post('/horarios', async (req, res) => {
  const { asignacion_id, dia_semana, hora_inicio, hora_fin, aula } = req.body ?? {};
  const id=idValido(asignacion_id), dia=entero(dia_semana,1,7);
  const inicio=horaValida(hora_inicio), fin=horaValida(hora_fin);
  const sala=opcional(aula,50);
  if (!id || dia===null || !inicio || !fin || inicio>=fin || (aula != null && aula !== '' && !sala)) {
    res.status(400).json({ mensaje:'Selecciona asignación, día, horas válidas y una hora final mayor que la inicial.' });return;
  }
  const cliente=await pool.connect().catch(() => null);
  if (!cliente) {res.status(500).json({mensaje:'No se pudo conectar a PostgreSQL.'});return;}
  try {
    await cliente.query('BEGIN');
    // Bloquea el registro de asignación para serializar cambios de horarios del mismo docente.
    const asig=await cliente.query(
      `SELECT a.id, a.docente_id, a.gestion FROM public.asignaciones_docentes a
       WHERE a.id=$1 AND a.activo=TRUE FOR UPDATE`, [id]);
    if (!asig.rowCount) {await cliente.query('ROLLBACK');res.status(400).json({mensaje:'La asignación no existe o está inactiva.'});return;}
    const choque=await cliente.query(
      `SELECT h.id FROM public.horarios_clase h
       JOIN public.asignaciones_docentes a ON a.id=h.asignacion_id
       WHERE a.docente_id=$1 AND a.gestion=$2 AND h.dia_semana=$3
         AND h.activo=TRUE AND a.activo=TRUE
         AND h.hora_inicio < $5::time AND h.hora_fin > $4::time LIMIT 1`,
      [asig.rows[0].docente_id,asig.rows[0].gestion,dia,inicio,fin]);
    if (choque.rowCount) {
      await cliente.query('ROLLBACK');
      res.status(409).json({mensaje:'El docente ya tiene otra clase en ese horario.'});return;
    }
    const r=await cliente.query(
      `INSERT INTO public.horarios_clase (asignacion_id,dia_semana,hora_inicio,hora_fin,aula)
       VALUES ($1,$2,$3,$4,$5) RETURNING id::text`, [id,dia,inicio,fin,sala]);
    await cliente.query('COMMIT');
    res.status(201).json({ mensaje:'Horario registrado.',id:r.rows[0].id });
  } catch(error) {
    await cliente.query('ROLLBACK').catch(()=>undefined);
    const e=errorDB(error);res.status(e.status).json({mensaje:e.mensaje});
  } finally {cliente.release();}
});

export default router;
