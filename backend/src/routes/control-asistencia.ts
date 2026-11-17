import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db.js';

// Estos routers se protegen en server.ts: directora / docente respectivamente.
export const controlAsistenciaRouter = Router();
export const solicitudesDocenteRouter = Router();
const CARPETA_FOTOS = path.resolve(process.cwd(), 'uploads', 'asistencia');
const ZONA = 'America/La_Paz';

type ErrorDB = { code?: string };
const idValido = (valor: unknown): valor is string =>
  typeof valor === 'string' && /^[1-9]\d{0,18}$/.test(valor);

function texto(valor: unknown, minimo: number, maximo: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio.length >= minimo && limpio.length <= maximo ? limpio : null;
}
function hoyBolivia(): { fecha: string; segundos: number } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? '';
  return {
    fecha: `${valor('year')}-${valor('month')}-${valor('day')}`,
    segundos: +valor('hour') * 3600 + +valor('minute') * 60 + +valor('second'),
  };
}
function fechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}
function diaIso(fecha: string): number {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return dia === 0 ? 7 : dia;
}
function diferenciaDias(fechaInicio: string, fechaFinal: string): number {
  return (Date.parse(`${fechaFinal}T12:00:00Z`) - Date.parse(`${fechaInicio}T12:00:00Z`)) / 86400000;
}
function segundosHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60;
}
function falloInterno(res: { status: (s: number) => { json: (x: object) => void } },
  error: unknown, contexto: string) {
  console.error(contexto, error);
  res.status(500).json({ mensaje: 'No se pudo completar la operación. Comprueba la migración SQL del Bloque 3.' });
}

// DOCENTE: generar una solicitud solamente para sus clases y su propia cuenta.
solicitudesDocenteRouter.post('/solicitudes', async (req, res) => {
  const usuarioId = res.locals.usuario.id as string;
  const { horario_id, fecha, tipo, motivo, descripcion } = req.body ?? {};
  const motivoSeguro = texto(motivo, 3, 120);
  const descripcionSegura = texto(descripcion, 10, 1200);
  const ahora = hoyBolivia();
  if (!idValido(horario_id) || !fechaValida(fecha) ||
      !['correccion', 'justificacion'].includes(tipo) || !motivoSeguro || !descripcionSegura) {
    res.status(400).json({ mensaje: 'Selecciona una clase y fecha válida, motivo y descripción de 10 a 1200 caracteres.' }); return;
  }
  const dias = diferenciaDias(fecha, ahora.fecha);
  if (dias < 0 || dias > 45) {
    res.status(400).json({ mensaje: 'Solo se permiten solicitudes para clases de hoy o de los últimos 45 días.' }); return;
  }
  try {
    const horario = await pool.query(`
      SELECT h.id, h.dia_semana, TO_CHAR(h.hora_inicio, 'HH24:MI') AS hora_inicio
      FROM public.horarios_clase h
      JOIN public.asignaciones_docentes a ON a.id = h.asignacion_id
      JOIN public.docentes d ON d.id = a.docente_id
      JOIN public.perfiles p ON p.id = d.perfil_id
      JOIN public.materias m ON m.id = a.materia_id
      WHERE h.id = $1 AND d.perfil_id = $2 AND p.rol = 'docente'
        AND p.activo = TRUE AND d.activo = TRUE AND a.activo = TRUE
        AND h.activo = TRUE AND m.activo = TRUE
        AND a.gestion = EXTRACT(YEAR FROM $3::date)::integer
        AND h.vigencia_desde <= $3::date
        AND (h.vigencia_hasta IS NULL OR h.vigencia_hasta >= $3::date)`, [horario_id, usuarioId, fecha]);
    const clase = horario.rows[0];
    if (!clase || Number(clase.dia_semana) !== diaIso(fecha)) {
      res.status(403).json({ mensaje: 'Esa clase no pertenece a tu cuenta o no corresponde al día seleccionado.' }); return;
    }
    if (dias === 0) {
      const inicio = segundosHora(clase.hora_inicio);
      const permitido = tipo === 'correccion' ? ahora.segundos > inicio + 900 : ahora.segundos >= inicio;
      if (!permitido) {
        res.status(400).json({ mensaje: tipo === 'correccion'
          ? 'Solicita una corrección cuando hayan transcurrido los 15 minutos posteriores al inicio.'
          : 'La justificación se habilita a partir del inicio de la clase.' }); return;
      }
    }
    const existente = await pool.query(`
      SELECT estado FROM public.asistencias WHERE horario_id = $1 AND fecha = $2::date LIMIT 1`,
    [horario_id, fecha]);
    if (existente.rows[0] && existente.rows[0].estado !== 'falta') {
      res.status(409).json({ mensaje: 'Esta clase ya tiene una asistencia registrada. No se puede duplicar.' }); return;
    }
    await pool.query(`
      INSERT INTO public.solicitudes_asistencia
        (horario_id, perfil_docente_id, fecha_clase, tipo, motivo, descripcion)
      VALUES ($1, $2, $3::date, $4, $5, $6)`,
    [horario_id, usuarioId, fecha, tipo, motivoSeguro, descripcionSegura]);
    res.status(201).json({ mensaje: 'Solicitud enviada a Dirección de Carrera. Queda pendiente de revisión.' });
  } catch (error) {
    if ((error as ErrorDB)?.code === '23505') {
      res.status(409).json({ mensaje: 'Ya existe una solicitud para esta clase y fecha.' }); return;
    }
    falloInterno(res, error, 'Crear solicitud docente:');
  }
});

solicitudesDocenteRouter.get('/mis-solicitudes', async (_req, res) => {
  try {
    const datos = await pool.query(`
      SELECT s.id::text, s.tipo, s.motivo, s.descripcion, s.estado,
        TO_CHAR(s.fecha_clase, 'YYYY-MM-DD') AS fecha_clase,
        TO_CHAR(s.fecha_solicitud, 'YYYY-MM-DD HH24:MI') AS fecha_solicitud,
        TO_CHAR(s.fecha_revision, 'YYYY-MM-DD HH24:MI') AS fecha_revision,
        s.observacion_revision, m.nombre AS materia,
        TO_CHAR(h.hora_inicio,'HH24:MI') AS hora_inicio
      FROM public.solicitudes_asistencia s
      JOIN public.horarios_clase h ON h.id = s.horario_id
      JOIN public.asignaciones_docentes a ON a.id = h.asignacion_id
      JOIN public.materias m ON m.id = a.materia_id
      WHERE s.perfil_docente_id = $1
      ORDER BY s.fecha_solicitud DESC, s.id DESC LIMIT 80`, [res.locals.usuario.id]);
    res.json({ solicitudes: datos.rows });
  } catch (error) { falloInterno(res, error, 'Listar solicitudes propias:'); }
});

// DIRECTORA: consultar las asistencias de TODO el plantel, incluidas las del Bloque 2.
controlAsistenciaRouter.get('/asistencias', async (req, res) => {
  const docenteId = req.query.docente_id;
  if (docenteId !== undefined && (typeof docenteId !== 'string' || !idValido(docenteId))) {
    res.status(400).json({ mensaje: 'Filtro de docente inválido.' }); return;
  }
  try {
    const resultado = await pool.query(`
      SELECT s.id::text, s.estado, s.origen_registro,
        TO_CHAR(s.fecha, 'YYYY-MM-DD') AS fecha,
        TO_CHAR(s.hora_registro, 'HH24:MI') AS hora_registro,
        TO_CHAR(h.hora_inicio, 'HH24:MI') AS hora_inicio,
        m.nombre AS materia, h.aula, s.observacion,
        (s.foto_ruta IS NOT NULL) AS tiene_foto,
        d.id::text AS docente_id, p.nombre_completo AS docente_nombre
      FROM public.asistencias s
      JOIN public.horarios_clase h ON h.id = s.horario_id
      JOIN public.asignaciones_docentes a ON a.id = h.asignacion_id
      JOIN public.docentes d ON d.id = a.docente_id
      JOIN public.perfiles p ON p.id = d.perfil_id
      JOIN public.materias m ON m.id = a.materia_id
      WHERE ($1::bigint IS NULL OR d.id = $1::bigint)
      ORDER BY s.fecha DESC, s.hora_registro DESC, s.id DESC LIMIT 200`, [docenteId || null]);
    res.json({ asistencias: resultado.rows });
  } catch (error) { falloInterno(res, error, 'Control de asistencias:'); }
});

controlAsistenciaRouter.get('/solicitudes', async (_req, res) => {
  try {
    const datos = await pool.query(`
      SELECT s.id::text, s.tipo, s.motivo, s.descripcion, s.estado,
        TO_CHAR(s.fecha_clase,'YYYY-MM-DD') AS fecha_clase,
        TO_CHAR(s.fecha_solicitud,'YYYY-MM-DD HH24:MI') AS fecha_solicitud,
        TO_CHAR(s.fecha_revision,'YYYY-MM-DD HH24:MI') AS fecha_revision,
        s.observacion_revision,
        p.nombre_completo AS docente_nombre, m.nombre AS materia,
        TO_CHAR(h.hora_inicio,'HH24:MI') AS hora_inicio
      FROM public.solicitudes_asistencia s
      JOIN public.perfiles p ON p.id = s.perfil_docente_id
      JOIN public.horarios_clase h ON h.id = s.horario_id
      JOIN public.asignaciones_docentes a ON a.id = h.asignacion_id
      JOIN public.materias m ON m.id = a.materia_id
      ORDER BY CASE WHEN s.estado='pendiente' THEN 0 ELSE 1 END,
        s.fecha_solicitud DESC, s.id DESC LIMIT 150`);
    res.json({ solicitudes: datos.rows });
  } catch (error) { falloInterno(res, error, 'Listar solicitudes de dirección:'); }
});

// Directora autenticada. La fotografía NO se publica mediante express.static.
controlAsistenciaRouter.get('/foto/:id', async (req, res) => {
  const id = req.params.id;
  if (!idValido(id)) { res.status(400).json({ mensaje: 'Identificador inválido.' }); return; }
  try {
    const resultado = await pool.query('SELECT foto_ruta FROM public.asistencias WHERE id=$1', [id]);
    const ruta = resultado.rows[0]?.foto_ruta as string | undefined;
    if (!ruta || !/^asistencia\/[0-9a-f-]{36}\.(jpg|png)$/.test(ruta)) {
      res.status(404).json({ mensaje: 'No se encontró la fotografía.' }); return;
    }
    const archivo = await readFile(path.join(CARPETA_FOTOS, path.basename(ruta)));
    res.set('Cache-Control', 'no-store');
    res.type(ruta.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
    res.send(archivo);
  } catch (error) {
    console.error('Abrir foto de asistencia:', error);
    res.status(404).json({ mensaje: 'No se pudo abrir la fotografía.' });
  }
});

controlAsistenciaRouter.patch('/solicitudes/:id/revisar', async (req, res) => {
  const id = req.params.id;
  const decision = req.body?.decision;
  const observacionRaw = req.body?.observacion_revision;
  const observacion = observacionRaw === '' || observacionRaw == null
    ? '' : texto(observacionRaw, 5, 1000);
  if (!idValido(id) || !['aprobada','rechazada'].includes(decision) || observacion === null ||
      (decision === 'rechazada' && !observacion)) {
    res.status(400).json({ mensaje: 'Indica la decisión y, si rechazas, una observación de al menos 5 caracteres.' }); return;
  }
  const client = await pool.connect().catch(() => null);
  if (!client) { res.status(500).json({ mensaje: 'No se pudo conectar con PostgreSQL.' }); return; }
  try {
    await client.query('BEGIN');
    const r = await client.query(`
      SELECT id, horario_id, perfil_docente_id,
        TO_CHAR(fecha_clase, 'YYYY-MM-DD') AS fecha_clase,
        tipo, motivo, descripcion, estado
      FROM public.solicitudes_asistencia WHERE id = $1 FOR UPDATE`, [id]);
    const sol = r.rows[0];
    if (!sol || sol.estado !== 'pendiente') {
      await client.query('ROLLBACK');
      res.status(409).json({ mensaje: 'La solicitud no existe o ya fue revisada.' }); return;
    }
    let asistenciaId: string | null = null;
    if (decision === 'aprobada') {
      const anterior = await client.query(`
        SELECT id::text, estado FROM public.asistencias
        WHERE horario_id=$1 AND fecha=$2::date FOR UPDATE`, [sol.horario_id, sol.fecha_clase]);
      const estadoAnterior: string = anterior.rows[0]?.estado ?? 'sin_registro';
      if (anterior.rows[0] && estadoAnterior !== 'falta') {
        await client.query('ROLLBACK');
        res.status(409).json({ mensaje: 'Ya existe una asistencia válida para esa clase. No se puede aprobar otra.' }); return;
      }
      const nuevoEstado = sol.tipo === 'correccion' ? 'presente' : 'justificado';
      const origen = sol.tipo === 'correccion' ? 'correccion' : 'justificacion';
      const detalle = `${sol.tipo === 'correccion' ? 'Corrección' : 'Justificación'} autorizada por Dirección (solicitud #${id}). Motivo: ${sol.motivo}. ${sol.descripcion}`;
      if (anterior.rows[0]) {
        const actualizado = await client.query(`
          UPDATE public.asistencias
          SET estado=$1, observacion=$2, origen_registro=$3
          WHERE id=$4 RETURNING id::text`,
        [nuevoEstado, detalle, origen, anterior.rows[0].id]);
        asistenciaId = actualizado.rows[0].id;
      } else {
        // La hora_registro es la fecha/hora de aprobación, NO una hora de llegada del docente.
        const creado = await client.query(`
          INSERT INTO public.asistencias
            (horario_id, fecha, estado, hora_registro, observacion, registrado_por, origen_registro)
          VALUES ($1,$2::date,$3,(now() AT TIME ZONE 'America/La_Paz'),$4,$5,$6)
          RETURNING id::text`,
        [sol.horario_id, sol.fecha_clase, nuevoEstado, detalle, res.locals.usuario.id, origen]);
        asistenciaId = creado.rows[0].id;
      }
      if (sol.tipo === 'correccion') {
        await client.query(`
          INSERT INTO public.correcciones_asistencia
            (asistencia_id, estado_anterior, estado_nuevo, motivo, corregido_por)
          VALUES ($1,$2,$3,$4,$5)`,
        [asistenciaId, estadoAnterior, nuevoEstado, `${sol.motivo}: ${sol.descripcion}`, res.locals.usuario.id]);
      } else {
        await client.query(`
          INSERT INTO public.justificaciones_asistencia
            (asistencia_id, motivo, estado, revisado_por, fecha_solicitud, fecha_revision)
          SELECT $1, ($2 || ': ' || $3), 'aprobada', $4, fecha_solicitud,
            (now() AT TIME ZONE 'America/La_Paz')
          FROM public.solicitudes_asistencia WHERE id=$5`,
        [asistenciaId, sol.motivo, sol.descripcion, res.locals.usuario.id, id]);
      }
    }
    await client.query(`
      UPDATE public.solicitudes_asistencia
      SET estado=$1, revisado_por=$2, observacion_revision=$3,
        asistencia_id=$4, fecha_revision=(now() AT TIME ZONE 'America/La_Paz')
      WHERE id=$5`, [decision, res.locals.usuario.id, observacion || null, asistenciaId, id]);
    await client.query('COMMIT');
    res.json({ mensaje: decision === 'aprobada' ? 'Solicitud aprobada y registrada en el historial.' : 'Solicitud rechazada; se notificará en el panel del docente.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as ErrorDB)?.code === '23505') {
      res.status(409).json({ mensaje: 'Esa clase ya tiene una asistencia registrada.' });
    } else { falloInterno(res, error, 'Revisar solicitud:'); }
  } finally { client.release(); }
});
