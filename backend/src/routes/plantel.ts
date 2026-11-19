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
function fechaValida(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}
function hoyBolivia(): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => partes.find(x => x.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}
function diaSiguiente(fecha: string): string {
  const fechaUtc = new Date(`${fecha}T12:00:00Z`);
  fechaUtc.setUTCDate(fechaUtc.getUTCDate() + 1);
  return fechaUtc.toISOString().slice(0, 10);
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
                         TO_CHAR(h.hora_fin,'HH24:MI') AS hora_fin, h.aula, h.activo,
                         TO_CHAR(h.vigencia_desde,'YYYY-MM-DD') AS vigencia_desde,
                         TO_CHAR(h.vigencia_hasta,'YYYY-MM-DD') AS vigencia_hasta
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
    // Serializa horarios de un docente/gestion incluso entre diferentes asignaciones.
    await cliente.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))`,
      [asig.rows[0].docente_id, asig.rows[0].gestion]);
    const choque=await cliente.query(
      `SELECT h.id FROM public.horarios_clase h
       JOIN public.asignaciones_docentes a ON a.id=h.asignacion_id
       WHERE a.docente_id=$1 AND a.gestion=$2 AND h.dia_semana=$3
         AND h.activo=TRUE AND a.activo=TRUE
         AND (h.vigencia_hasta IS NULL OR h.vigencia_hasta >= (now() AT TIME ZONE 'America/La_Paz')::date)
         AND h.hora_inicio < $5::time AND h.hora_fin > $4::time LIMIT 1`,
      [asig.rows[0].docente_id,asig.rows[0].gestion,dia,inicio,fin]);
    if (choque.rowCount) {
      await cliente.query('ROLLBACK');
      res.status(409).json({mensaje:'El docente ya tiene otra clase en ese horario.'});return;
    }
    const r=await cliente.query(
      `INSERT INTO public.horarios_clase (asignacion_id,dia_semana,hora_inicio,hora_fin,aula,vigencia_desde)
       VALUES ($1,$2,$3,$4,$5,(now() AT TIME ZONE 'America/La_Paz')::date) RETURNING id::text`, [id,dia,inicio,fin,sala]);
    await cliente.query('COMMIT');
    res.status(201).json({ mensaje:'Horario registrado.',id:r.rows[0].id });
  } catch(error) {
    await cliente.query('ROLLBACK').catch(()=>undefined);
    const e=errorDB(error);res.status(e.status).json({mensaje:e.mensaje});
  } finally {cliente.release();}
});


// Directora: programar un cambio de horario SIN editar el registro original.
// Al pasar la fecha de vigencia, las consultas docentes usan la nueva versión.
router.post('/horarios/:id/reprogramar', async (req, res) => {
  const horarioId = idValido(req.params.id);
  const { dia_semana, hora_inicio, hora_fin, aula, vigencia_desde, motivo } = req.body ?? {};
  const dia = entero(dia_semana, 1, 7);
  const inicio = horaValida(hora_inicio), fin = horaValida(hora_fin);
  const sala = opcional(aula, 50);
  const fecha = fechaValida(vigencia_desde);
  const razon = texto(motivo, 500);
  const manana = diaSiguiente(hoyBolivia());
  if (!horarioId || dia === null || !inicio || !fin || inicio >= fin || !fecha || fecha < manana ||
      !razon || (aula != null && aula !== '' && !sala)) {
    res.status(400).json({ mensaje: 'Indica día, horas correctas, motivo y fecha de vigencia desde mañana en adelante.' });
    return;
  }
  const cliente = await pool.connect().catch(() => null);
  if (!cliente) { res.status(500).json({ mensaje: 'No se pudo conectar a PostgreSQL.' }); return; }
  try {
    await cliente.query('BEGIN');
    const anteriorR = await cliente.query(`
      SELECT h.id, h.asignacion_id, h.dia_semana, h.hora_inicio, h.hora_fin, h.aula,
             TO_CHAR(h.vigencia_desde,'YYYY-MM-DD') AS desde,
             TO_CHAR(h.vigencia_hasta,'YYYY-MM-DD') AS hasta,
             a.docente_id, a.gestion
      FROM public.horarios_clase h
      JOIN public.asignaciones_docentes a ON a.id = h.asignacion_id
      JOIN public.docentes d ON d.id = a.docente_id
      WHERE h.id=$1 AND h.activo=TRUE AND a.activo=TRUE AND d.activo=TRUE
      FOR UPDATE OF h, a`, [horarioId]);
    const anterior = anteriorR.rows[0];
    if (!anterior) {
      await cliente.query('ROLLBACK');
      res.status(404).json({ mensaje: 'Horario no encontrado o inactivo.' }); return;
    }
    if (fecha <= anterior.desde || (anterior.hasta && fecha > anterior.hasta)) {
      await cliente.query('ROLLBACK');
      res.status(409).json({ mensaje: 'El cambio debe comenzar dentro de la vigencia del horario y después de su fecha de inicio.' });
      return;
    }
    // Evita dos cambios simultáneos que crearían superposiciones.
    await cliente.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))`,
      [anterior.docente_id, anterior.gestion]);
    const choque = await cliente.query(`
      SELECT h.id FROM public.horarios_clase h
      JOIN public.asignaciones_docentes a ON a.id=h.asignacion_id
      WHERE a.docente_id=$1 AND a.gestion=$2 AND a.activo=TRUE AND h.activo=TRUE
        AND h.id<>$3 AND h.dia_semana=$4
        AND h.hora_inicio < $6::time AND h.hora_fin > $5::time
        AND (h.vigencia_hasta IS NULL OR h.vigencia_hasta >= $7::date)
        AND ( $8::date IS NULL OR h.vigencia_desde <= $8::date )
      LIMIT 1`,
      [anterior.docente_id, anterior.gestion, horarioId, dia, inicio, fin, fecha, anterior.hasta ?? null]);
    if (choque.rowCount) {
      await cliente.query('ROLLBACK');
      res.status(409).json({ mensaje: 'El docente ya tiene otra clase en ese día, hora y periodo de vigencia.' });
      return;
    }
    // Divide en dos periodos. No modifica día ni horas del registro antiguo.
    await cliente.query(`UPDATE public.horarios_clase
      SET vigencia_hasta=$2::date - 1 WHERE id=$1`, [horarioId, fecha]);
    const nuevoR = await cliente.query(`
      INSERT INTO public.horarios_clase
        (asignacion_id, dia_semana, hora_inicio, hora_fin, aula, activo, vigencia_desde, vigencia_hasta)
      VALUES ($1,$2,$3,$4,$5,TRUE,$6::date,$7::date) RETURNING id::text`,
      [anterior.asignacion_id,dia,inicio,fin,sala,fecha,anterior.hasta ?? null]);
    const nuevoId = nuevoR.rows[0].id as string;
    await cliente.query(`
      INSERT INTO public.cambios_horarios
        (horario_anterior_id, horario_nuevo_id, vigencia_desde, motivo, autorizado_por)
      VALUES ($1,$2,$3::date,$4,$5)`,
      [horarioId,nuevoId,fecha,razon,res.locals.usuario.id]);
    await cliente.query('COMMIT');
    res.status(201).json({ mensaje: 'Nuevo horario programado. El anterior conserva su historial.', horario_nuevo_id: nuevoId });
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    const e=errorDB(error); res.status(e.status).json({mensaje:e.mensaje});
  } finally { cliente.release(); }
});


// Directora: historial auditable de todas las versiones relacionadas con un horario.
// La búsqueda recorre hacia adelante y atrás para recuperar cambios encadenados,
// aunque se consulte una versión antigua o futura del horario.
router.get('/horarios/:id/historial', async (req, res) => {
  const horarioId = idValido(req.params.id);
  if (!horarioId) {
    res.status(400).json({ mensaje: 'Identificador de horario inválido.' });
    return;
  }
  try {
    const existe = await pool.query(
      `SELECT 1 FROM public.horarios_clase WHERE id = $1`, [horarioId]);
    if (!existe.rowCount) {
      res.status(404).json({ mensaje: 'El horario indicado no existe.' });
      return;
    }
    const resultado = await pool.query(`
      WITH RECURSIVE enlaces (origen, destino) AS (
        SELECT horario_anterior_id, horario_nuevo_id FROM public.cambios_horarios
        UNION ALL
        SELECT horario_nuevo_id, horario_anterior_id FROM public.cambios_horarios
      ), serie (id) AS (
        SELECT $1::bigint
        UNION
        SELECT e.destino FROM enlaces e JOIN serie s ON e.origen = s.id
      )
      SELECT c.id::text, c.horario_anterior_id::text, c.horario_nuevo_id::text,
             TO_CHAR(c.vigencia_desde, 'YYYY-MM-DD') AS vigencia_desde,
             TO_CHAR(c.fecha_cambio, 'YYYY-MM-DD HH24:MI') AS fecha_cambio,
             c.motivo, c.autorizado_por::text,
             COALESCE(p.nombre_completo, 'Usuario ' || c.autorizado_por::text) AS autorizado_nombre,
             a.dia_semana AS anterior_dia,
             TO_CHAR(a.hora_inicio, 'HH24:MI') AS anterior_inicio,
             TO_CHAR(a.hora_fin, 'HH24:MI') AS anterior_fin,
             a.aula AS anterior_aula,
             TO_CHAR(a.vigencia_desde, 'YYYY-MM-DD') AS anterior_desde,
             TO_CHAR(a.vigencia_hasta, 'YYYY-MM-DD') AS anterior_hasta,
             n.dia_semana AS nuevo_dia,
             TO_CHAR(n.hora_inicio, 'HH24:MI') AS nuevo_inicio,
             TO_CHAR(n.hora_fin, 'HH24:MI') AS nuevo_fin,
             n.aula AS nuevo_aula,
             TO_CHAR(n.vigencia_desde, 'YYYY-MM-DD') AS nuevo_desde,
             TO_CHAR(n.vigencia_hasta, 'YYYY-MM-DD') AS nuevo_hasta
      FROM public.cambios_horarios c
      JOIN serie s ON s.id = c.horario_anterior_id
      JOIN public.horarios_clase a ON a.id = c.horario_anterior_id
      JOIN public.horarios_clase n ON n.id = c.horario_nuevo_id
      LEFT JOIN public.perfiles p ON p.id = c.autorizado_por
      ORDER BY c.fecha_cambio DESC, c.id DESC
      LIMIT 200`, [horarioId]);
    res.json({ cambios: resultado.rows });
  } catch (error) {
    const e = errorDB(error);
    res.status(e.status).json({ mensaje: e.mensaje });
  }
});



// PARTE 3 | Corrección de datos administrativos. No cambia contraseñas ni borra historial.
router.patch('/docentes/:id', async (req, res) => {
  const id = idValido(req.params.id);
  const { nombre_completo, correo, ci, codigo_docente, telefono, especialidad } = req.body ?? {};
  const nombre = texto(nombre_completo, 150);
  const email = texto(correo, 150)?.toLowerCase();
  const identidad = texto(ci, 30);
  const codigo = opcional(codigo_docente, 30);
  const tel = opcional(telefono, 30);
  const esp = opcional(especialidad, 120);
  if (!id || !nombre || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !identidad ||
      (codigo_docente != null && codigo_docente !== '' && !codigo) ||
      (telefono != null && telefono !== '' && !tel) ||
      (especialidad != null && especialidad !== '' && !esp)) {
    res.status(400).json({ mensaje: 'Revisa el nombre, correo, CI y la longitud de los datos.' });
    return;
  }
  const cliente = await pool.connect().catch(() => null);
  if (!cliente) { res.status(500).json({ mensaje: 'No se pudo conectar a PostgreSQL.' }); return; }
  try {
    await cliente.query('BEGIN');
    const docente = await cliente.query(`
      SELECT d.perfil_id, p.rol FROM public.docentes d
      LEFT JOIN public.perfiles p ON p.id=d.perfil_id
      WHERE d.id=$1 FOR UPDATE OF d`, [id]);
    if (!docente.rowCount) {
      await cliente.query('ROLLBACK');
      res.status(404).json({ mensaje: 'Docente no encontrado.' }); return;
    }
    if (!docente.rows[0].perfil_id || docente.rows[0].rol !== 'docente') {
      await cliente.query('ROLLBACK');
      res.status(409).json({ mensaje: 'Este docente no tiene una cuenta docente vinculada para actualizar nombre y correo.' }); return;
    }
    await cliente.query(`UPDATE public.docentes
      SET ci=$2, codigo_docente=$3, telefono=$4, especialidad=$5 WHERE id=$1`,
      [id, identidad, codigo, tel, esp]);
    await cliente.query(`UPDATE public.perfiles
      SET nombre_completo=$2, correo=$3 WHERE id=$1 AND rol='docente'`,
      [docente.rows[0].perfil_id, nombre, email]);
    await cliente.query('COMMIT');
    res.json({ mensaje: 'Datos del docente actualizados. La contraseña no se modificó.' });
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    const e=errorDB(error); res.status(e.status).json({ mensaje:e.mensaje });
  } finally { cliente.release(); }
});

router.patch('/materias/:id', async (req, res) => {
  const id=idValido(req.params.id);
  const { codigo, nombre, semestre }=req.body ?? {};
  const c=texto(codigo,30), n=texto(nombre,150);
  const s=semestre === '' || semestre == null ? null : entero(semestre,1,12);
  if (!id || !c || !n || (semestre !== '' && semestre != null && s === null)) {
    res.status(400).json({ mensaje: 'Indica código, nombre y semestre válido (1 a 12).' }); return;
  }
  try {
    const r=await pool.query(`UPDATE public.materias
      SET codigo=$2, nombre=$3, semestre=$4 WHERE id=$1 RETURNING id`, [id,c,n,s]);
    if (!r.rowCount) { res.status(404).json({ mensaje: 'Materia no encontrada.' }); return; }
    res.json({ mensaje: 'Datos de la materia actualizados.' });
  } catch (error) { const e=errorDB(error); res.status(e.status).json({mensaje:e.mensaje}); }
});

// Evita desactivar materias que todavía se utilizan en asignaciones activas.
router.patch('/materias/:id/estado', async (req, res) => {
  const id=idValido(req.params.id), activo=req.body?.activo;
  if (!id || typeof activo !== 'boolean') {
    res.status(400).json({ mensaje: 'Indica una materia y un estado válido.' }); return;
  }
  try {
    const r=await pool.query(`UPDATE public.materias m SET activo=$2
      WHERE m.id=$1 AND ($2=TRUE OR NOT EXISTS (
        SELECT 1 FROM public.asignaciones_docentes a WHERE a.materia_id=m.id AND a.activo=TRUE
      )) RETURNING id`, [id,activo]);
    if (!r.rowCount) {
      const existente=await pool.query('SELECT 1 FROM public.materias WHERE id=$1',[id]);
      res.status(existente.rowCount ? 409 : 404).json({ mensaje: existente.rowCount
        ? 'Desactiva primero las asignaciones activas de esta materia.' : 'Materia no encontrada.' });
      return;
    }
    res.json({ mensaje: activo ? 'Materia activada.' : 'Materia desactivada sin eliminar sus registros.' });
  } catch (error) { const e=errorDB(error); res.status(e.status).json({mensaje:e.mensaje}); }
});

// Cambiar docente/materia/gestión solo mientras la asignación no tenga clases creadas.
// Si ya tiene horarios, se conserva la asignación como historial y se crea otra.
router.patch('/asignaciones/:id', async (req, res) => {
  const id=idValido(req.params.id);
  const { docente_id, materia_id, gestion }=req.body ?? {};
  const d=idValido(docente_id), m=idValido(materia_id), g=entero(gestion,2000,2100);
  if (!id || !d || !m || g===null) {
    res.status(400).json({ mensaje: 'Selecciona docente, materia y gestión válida.' }); return;
  }
  const cliente=await pool.connect().catch(() => null);
  if (!cliente) { res.status(500).json({ mensaje: 'No se pudo conectar a PostgreSQL.' }); return; }
  try {
    await cliente.query('BEGIN');
    const anterior=await cliente.query('SELECT activo FROM public.asignaciones_docentes WHERE id=$1 FOR UPDATE',[id]);
    if (!anterior.rowCount) { await cliente.query('ROLLBACK');res.status(404).json({mensaje:'Asignación no encontrada.'});return; }
    if (!anterior.rows[0].activo) {
      await cliente.query('ROLLBACK');res.status(409).json({mensaje:'Activa la asignación antes de editarla.'});return;
    }
    const horarios=await cliente.query('SELECT 1 FROM public.horarios_clase WHERE asignacion_id=$1 LIMIT 1',[id]);
    if (horarios.rowCount) {
      await cliente.query('ROLLBACK');
      res.status(409).json({mensaje:'Esta asignación ya tiene horarios. Para conservar el historial, desactívala y crea una nueva.'});return;
    }
    const r=await cliente.query(`UPDATE public.asignaciones_docentes a
      SET docente_id=d.id, materia_id=m.id, gestion=$4
      FROM public.docentes d, public.materias m
      WHERE a.id=$1 AND d.id=$2 AND m.id=$3 AND d.activo=TRUE AND m.activo=TRUE
      RETURNING a.id`,[id,d,m,g]);
    if (!r.rowCount) {
      await cliente.query('ROLLBACK');
      res.status(400).json({mensaje:'El docente o la materia no existen o están inactivos.'});return;
    }
    await cliente.query('COMMIT');
    res.json({mensaje:'Asignación actualizada.'});
  } catch (error) {
    await cliente.query('ROLLBACK').catch(()=>undefined);
    const e=errorDB(error);res.status(e.status).json({mensaje:e.mensaje});
  } finally { cliente.release(); }
});

// Desactivar no borra horarios ni fotografías históricos. React advierte antes de ejecutar.
router.patch('/asignaciones/:id/estado', async (req, res) => {
  const id=idValido(req.params.id), activo=req.body?.activo;
  if (!id || typeof activo !== 'boolean') {
    res.status(400).json({ mensaje: 'Indica una asignación y estado válido.' }); return;
  }
  try {
    const r=await pool.query(`UPDATE public.asignaciones_docentes a SET activo=$2
      WHERE a.id=$1 AND ($2=FALSE OR (
        EXISTS(SELECT 1 FROM public.docentes d WHERE d.id=a.docente_id AND d.activo=TRUE)
        AND EXISTS(SELECT 1 FROM public.materias m WHERE m.id=a.materia_id AND m.activo=TRUE)
      )) RETURNING id`,[id,activo]);
    if (!r.rowCount) {
      const existente=await pool.query('SELECT 1 FROM public.asignaciones_docentes WHERE id=$1',[id]);
      res.status(existente.rowCount ? 409 : 404).json({mensaje: existente.rowCount
        ? 'El docente o la materia están inactivos. No se puede reactivar esta asignación.'
        : 'Asignación no encontrada.'});return;
    }
    res.json({mensaje:activo ? 'Asignación activada.' : 'Asignación desactivada. Su historial se conserva.'});
  } catch (error) { const e=errorDB(error);res.status(e.status).json({mensaje:e.mensaje}); }
});

export default router;
