import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db.js';

const router = Router();
const ZONA = 'America/La_Paz';
const TAMANO_MAXIMO = 5 * 1024 * 1024;
const CARPETA_FOTOS = path.resolve(process.cwd(), 'uploads', 'asistencia');
const subirFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO, files: 1 },
  fileFilter: (_req, archivo, continuar) => {
    if (!['image/jpeg', 'image/png'].includes(archivo.mimetype)) {
      continuar(new Error('La evidencia debe ser una fotografía JPG o PNG.'));
      return;
    }
    continuar(null, true);
  },
}).single('foto');

type AhoraLocal = {
  fecha: string;
  hora: string;
  fechaHora: string;
  anio: number;
  dia: number;
  segundos: number;
};

function ahoraBolivia(): AhoraLocal {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const parte = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? '';
  const fecha = `${parte('year')}-${parte('month')}-${parte('day')}`;
  const hora = `${parte('hour')}:${parte('minute')}:${parte('second')}`;
  const diaJs = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return {
    fecha,
    hora,
    fechaHora: `${fecha} ${hora}`,
    anio: Number(parte('year')),
    dia: diaJs === 0 ? 7 : diaJs,
    segundos: Number(parte('hour')) * 3600 + Number(parte('minute')) * 60 + Number(parte('second')),
  };
}

function enVentana(horaInicio: string, ahora: AhoraLocal, dia: number): boolean {
  if (dia !== ahora.dia) return false;
  const [h, m] = horaInicio.split(':').map(Number);
  if (h === undefined || m === undefined) return false;
  const segundoInicio = h * 3600 + m * 60;
  return ahora.segundos >= segundoInicio - 15 * 60 && ahora.segundos <= segundoInicio + 15 * 60;
}

function esId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value);
}

function imagenValida(archivo: Express.Multer.File): boolean {
  const b = archivo.buffer;
  if (archivo.mimetype === 'image/jpeg') {
    return b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 &&
      b[2] === 0xff && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
  }
  return archivo.mimetype === 'image/png' && b.length >= 12 &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

const horarioDocente = `
  FROM public.horarios_clase h
  JOIN public.asignaciones_docentes a ON a.id = h.asignacion_id
  JOIN public.docentes d ON d.id = a.docente_id
  JOIN public.perfiles p ON p.id = d.perfil_id
  JOIN public.materias m ON m.id = a.materia_id
`;
const filtroPropio = `
  d.perfil_id = $1 AND p.rol = 'docente' AND p.activo = TRUE
  AND d.activo = TRUE AND a.activo = TRUE AND h.activo = TRUE AND m.activo = TRUE
`;

// Muestra los horarios propios; nunca recibe un ID de docente desde React.
router.get('/mis-clases', async (_req, res) => {
  const usuarioId = res.locals.usuario?.id as string | undefined;
  const ahora = ahoraBolivia();
  try {
    const consulta = await pool.query(`
      SELECT h.id::text AS horario_id, a.id::text AS asignacion_id,
        m.nombre AS materia, m.codigo AS codigo_materia,
        a.gestion, h.dia_semana, h.aula,
        TO_CHAR(h.hora_inicio, 'HH24:MI') AS hora_inicio,
        TO_CHAR(h.hora_fin, 'HH24:MI') AS hora_fin,
        r.id::text AS asistencia_id, r.estado AS estado_asistencia,
        r.origen_registro AS origen_asistencia
      ${horarioDocente}
      LEFT JOIN public.asistencias r ON r.horario_id = h.id AND r.fecha = $3::date
      WHERE ${filtroPropio} AND a.gestion = $2
        AND h.vigencia_desde <= $3::date
        AND (h.vigencia_hasta IS NULL OR h.vigencia_hasta >= $3::date)
      ORDER BY h.dia_semana, h.hora_inicio, m.nombre
    `, [usuarioId, ahora.anio, ahora.fecha]);
    const clases = consulta.rows.map(registro => ({
      ...registro,
      hoy: registro.dia_semana === ahora.dia,
      puede_marcar: !registro.asistencia_id &&
        enVentana(registro.hora_inicio, ahora, registro.dia_semana),
    }));
    res.json({ fecha: ahora.fecha, hora: ahora.hora, zona_horaria: ZONA, clases });
  } catch (error) {
    console.error('Error al consultar las clases del docente:', error);
    res.status(500).json({ mensaje: 'No se pudieron consultar tus horarios.' });
  }
});

router.get('/mis-asistencias', async (_req, res) => {
  const usuarioId = res.locals.usuario?.id as string | undefined;
  try {
    const r = await pool.query(`
      SELECT s.id::text, TO_CHAR(s.fecha, 'YYYY-MM-DD') AS fecha,
        TO_CHAR(s.hora_registro, 'HH24:MI') AS hora_registro,
        s.estado, s.origen_registro, (s.foto_ruta IS NOT NULL) AS tiene_foto, m.nombre AS materia, h.aula
      FROM public.asistencias s
      JOIN public.horarios_clase h ON h.id = s.horario_id
      JOIN public.asignaciones_docentes a ON a.id = h.asignacion_id
      JOIN public.docentes d ON d.id = a.docente_id
      JOIN public.materias m ON m.id = a.materia_id
      WHERE d.perfil_id = $1
      ORDER BY s.fecha DESC, s.hora_registro DESC LIMIT 30
    `, [usuarioId]);
    res.json({ asistencias: r.rows });
  } catch (error) {
    console.error('Error al consultar las asistencias:', error);
    res.status(500).json({ mensaje: 'No se pudo consultar tu historial.' });
  }
});

// Solo el dueño autenticado del registro puede descargar su fotografía.
router.get('/mi-foto/:asistenciaId', async (req, res) => {
  const id = req.params.asistenciaId;
  const usuarioId = res.locals.usuario?.id as string | undefined;
  if (!esId(id)) {
    res.status(400).json({ mensaje: 'Identificador inválido.' }); return;
  }
  try {
    const consulta = await pool.query(`
      SELECT s.foto_ruta
      FROM public.asistencias s
      JOIN public.horarios_clase h ON h.id = s.horario_id
      JOIN public.asignaciones_docentes a ON a.id = h.asignacion_id
      JOIN public.docentes d ON d.id = a.docente_id
      WHERE s.id = $1 AND d.perfil_id = $2
    `, [id, usuarioId]);
    const ruta = consulta.rows[0]?.foto_ruta as string | undefined;
    if (!ruta || !/^asistencia\/[0-9a-f-]{36}\.(jpg|png)$/.test(ruta)) {
      res.status(404).json({ mensaje: 'No se encontró la evidencia.' }); return;
    }
    const archivo = await readFile(path.join(CARPETA_FOTOS, path.basename(ruta)));
    res.set('Cache-Control', 'no-store');
    res.type(ruta.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
    res.send(archivo);
  } catch (error) {
    console.error('Error al consultar evidencia:', error);
    res.status(404).json({ mensaje: 'No se pudo cargar la fotografía.' });
  }
});

router.post('/marcar/:horarioId', (req, res) => {
  subirFoto(req, res, async (error) => {
    if (error) {
      const mensaje = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? 'La fotografía supera el límite de 5 MB.'
        : error instanceof Error ? error.message : 'Fotografía inválida.';
      res.status(400).json({ mensaje });
      return;
    }
    const id = req.params.horarioId;
    const usuarioId = res.locals.usuario?.id as string | undefined;
    if (!esId(id)) {
      res.status(400).json({ mensaje: 'Horario inválido.' });
      return;
    }
    if (!req.file || !imagenValida(req.file)) {
      res.status(400).json({ mensaje: 'Debes adjuntar una fotografía JPG o PNG válida.' });
      return;
    }
    const ahora = ahoraBolivia();
    let fotoGuardada: string | null = null;
    try {
      const consulta = await pool.query(`
        SELECT h.id, h.dia_semana, TO_CHAR(h.hora_inicio, 'HH24:MI') AS hora_inicio
        ${horarioDocente}
        WHERE ${filtroPropio} AND h.id = $2 AND a.gestion = $3
          AND h.vigencia_desde <= $4::date
          AND (h.vigencia_hasta IS NULL OR h.vigencia_hasta >= $4::date)
      `, [usuarioId, id, ahora.anio, ahora.fecha]);
      const horario = consulta.rows[0];
      if (!horario) {
        res.status(403).json({ mensaje: 'El horario no pertenece a tu cuenta o está inactivo.' });
        return;
      }
      if (!enVentana(horario.hora_inicio, ahora, horario.dia_semana)) {
        res.status(403).json({ mensaje: 'El marcado solo está habilitado desde 15 minutos antes hasta 15 minutos después del inicio de tu clase.' });
        return;
      }
      // Guardamos la evidencia en carpeta privada, no servida públicamente por Express.
      await mkdir(CARPETA_FOTOS, { recursive: true });
      const extension = req.file.mimetype === 'image/jpeg' ? '.jpg' : '.png';
      const nombre = `${randomUUID()}${extension}`;
      fotoGuardada = path.join(CARPETA_FOTOS, nombre);
      await writeFile(fotoGuardada, req.file.buffer, { flag: 'wx' });
      const rutaRelativa = `asistencia/${nombre}`;
      const registro = await pool.query(`
        INSERT INTO public.asistencias
          (horario_id, fecha, estado, hora_registro, registrado_por, foto_ruta)
        VALUES ($1, $2::date, 'presente', $3::timestamp, $4, $5)
        RETURNING id::text
      `, [id, ahora.fecha, ahora.fechaHora, usuarioId, rutaRelativa]);
      res.status(201).json({
        mensaje: 'Tu entrada se registró correctamente.',
        asistencia_id: registro.rows[0].id,
        fecha: ahora.fecha, hora: ahora.hora,
      });
    } catch (fallo) {
      if (fotoGuardada) await unlink(fotoGuardada).catch(() => undefined);
      const codigo = typeof fallo === 'object' && fallo !== null && 'code' in fallo ? fallo.code : null;
      if (codigo === '23505') {
        res.status(409).json({ mensaje: 'Ya existe un registro de asistencia para esta clase y fecha.' });
        return;
      }
      if (codigo === '42703' || codigo === '23514') {
        console.error('La tabla de asistencias requiere revisar la migración SQL:', fallo);
        res.status(500).json({ mensaje: 'Revisa si aplicaste la migración SQL del Bloque 2 en sgc_db.' });
        return;
      }
      console.error('Error al registrar asistencia:', fallo);
      res.status(500).json({ mensaje: 'No se pudo registrar tu asistencia.' });
    }
  });
});

export default router;
