/**
 * SGC FINI-UAGRM | Auxiliaturas de cátedra: Etapa 1, convocatorias.
 * Protegido en server.ts por JWT y permitirRoles('directora').
 * No crea, modifica ni elimina tablas; usa la estructura v1 ya instalada.
 */
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const estados = new Set(['borrador', 'publicada', 'cerrada', 'evaluacion', 'finalizada', 'anulada']);

type Requisito = { descripcion: string; obligatorio: boolean };
type DatosConvocatoria = {
  materia_id: string;
  gestion: number;
  semestre: number;
  titulo: string;
  descripcion: string | null;
  requisitos_generales: string | null;
  fecha_apertura: string;
  fecha_cierre: string;
  fecha_examen: string | null;
  cupos: number;
  requisitos: Requisito[];
};

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function texto(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 && s.length <= max ? s : null;
}
function textoOpcional(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return texto(value, max) ?? undefined;
}
function entero(value: unknown, min: number, max: number): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function identificador(value: unknown): string | null {
  const s = String(value ?? '');
  if (!/^[1-9]\d{0,18}$/.test(s)) return null;
  try { return BigInt(s) <= 9223372036854775807n ? s : null; }
  catch { return null; }
}
function fecha(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}
function fechaOpcional(value: unknown): string | null | undefined {
  if (value === null || value === '' || value === undefined) return null;
  return fecha(value) ?? undefined;
}

function validarDatos(body: unknown): { datos?: DatosConvocatoria; mensaje?: string } {
  if (!objeto(body)) return { mensaje: 'Envía los datos de la convocatoria en formato JSON.' };
  const materia_id = identificador(body.materia_id);
  const gestion = entero(body.gestion, 2000, 2100);
  const semestre = entero(body.semestre, 1, 2);
  const titulo = texto(body.titulo, 200);
  const descripcion = textoOpcional(body.descripcion, 10000);
  const requisitos_generales = textoOpcional(body.requisitos_generales, 10000);
  const fecha_apertura = fecha(body.fecha_apertura);
  const fecha_cierre = fecha(body.fecha_cierre);
  const fecha_examen = fechaOpcional(body.fecha_examen);
  const cupos = entero(body.cupos, 1, 10000);

  if (!materia_id || gestion === null || semestre === null || !titulo ||
      descripcion === undefined || requisitos_generales === undefined ||
      !fecha_apertura || !fecha_cierre || fecha_examen === undefined || cupos === null) {
    return { mensaje: 'Revisa materia, gestión, semestre (1/2), título, fechas YYYY-MM-DD y cupos.' };
  }
  if (fecha_cierre < fecha_apertura) {
    return { mensaje: 'La fecha de cierre no puede ser anterior a la apertura.' };
  }
  if (fecha_examen !== null && fecha_examen < fecha_apertura) {
    return { mensaje: 'La fecha de examen no puede ser anterior a la apertura.' };
  }
  if (!Array.isArray(body.requisitos) || body.requisitos.length < 1 || body.requisitos.length > 30) {
    return { mensaje: 'Incluye entre 1 y 30 requisitos en la convocatoria.' };
  }
  const requisitos: Requisito[] = [];
  const vistos = new Set<string>();
  for (const item of body.requisitos as unknown[]) {
    if (!objeto(item)) return { mensaje: 'Cada requisito debe ser un objeto con descripción y obligatorio.' };
    const descripcionRequisito = texto(item.descripcion, 500);
    const obligatorio = item.obligatorio === undefined ? true : item.obligatorio;
    if (!descripcionRequisito || typeof obligatorio !== 'boolean') {
      return { mensaje: 'Cada requisito necesita una descripción (máximo 500 caracteres) y un booleano obligatorio.' };
    }
    const llave = descripcionRequisito.toLocaleLowerCase('es');
    if (vistos.has(llave)) return { mensaje: 'No se permiten requisitos duplicados.' };
    vistos.add(llave);
    requisitos.push({ descripcion: descripcionRequisito, obligatorio });
  }
  return { datos: { materia_id, gestion, semestre, titulo, descripcion,
    requisitos_generales, fecha_apertura, fecha_cierre, fecha_examen, cupos, requisitos } };
}

function errorSQL(error: unknown): { status: number; mensaje: string } {
  if (objeto(error)) {
    if (error.code === '23505') return { status: 409, mensaje: 'Ya existe una convocatoria para esa materia, gestión y semestre.' };
    if (error.code === '23503') return { status: 400, mensaje: 'Una referencia no existe o hay información asociada que impide la operación.' };
    if (error.code === '23514' || error.code === '22003' || error.code === '22P02') {
      return { status: 400, mensaje: 'Los datos no cumplen las restricciones de PostgreSQL.' };
    }
  }
  console.error('Error en Auxiliaturas/Convocatorias:', error);
  return { status: 500, mensaje: 'No se pudo completar la operación con la base de datos.' };
}

const columnas = `
  c.id::text, c.materia_id::text, m.codigo AS materia_codigo,
  m.nombre AS materia_nombre, c.gestion, c.semestre, c.titulo,
  c.descripcion, c.requisitos_generales,
  TO_CHAR(c.fecha_apertura, 'YYYY-MM-DD') AS fecha_apertura,
  TO_CHAR(c.fecha_cierre, 'YYYY-MM-DD') AS fecha_cierre,
  TO_CHAR(c.fecha_examen, 'YYYY-MM-DD') AS fecha_examen,
  c.cupos, c.estado, c.resultados_publicados,
  c.fecha_publicacion_resultados, c.fecha_creacion, c.fecha_actualizacion,
  (SELECT COUNT(*)::integer FROM public.requisitos_convocatoria_auxiliatura r
   WHERE r.convocatoria_id = c.id) AS cantidad_requisitos
`;

// GET /api/auxiliaturas/convocatorias?gestion=2026&semestre=1&estado=borrador
router.get('/convocatorias', async (req, res) => {
  const { gestion: filtroGestion, semestre: filtroSemestre, estado: filtroEstado,
    materia_id: filtroMateria, pagina: filtroPagina, limite: filtroLimite } = req.query;
  const gestion = filtroGestion === undefined ? null : entero(filtroGestion, 2000, 2100);
  const semestre = filtroSemestre === undefined ? null : entero(filtroSemestre, 1, 2);
  const materia = filtroMateria === undefined ? null : identificador(filtroMateria);
  const pagina = filtroPagina === undefined ? 1 : entero(filtroPagina, 1, 100000);
  const limite = filtroLimite === undefined ? 25 : entero(filtroLimite, 1, 100);
  if ((filtroGestion !== undefined && gestion === null) ||
      (filtroSemestre !== undefined && semestre === null) ||
      (filtroMateria !== undefined && !materia) ||
      (filtroEstado !== undefined && (typeof filtroEstado !== 'string' || !estados.has(filtroEstado))) ||
      pagina === null || limite === null) {
    res.status(400).json({ mensaje: 'Filtros de convocatoria inválidos.' }); return;
  }
  const estado = typeof filtroEstado === 'string' ? filtroEstado : null;
  try {
    const resultado = await pool.query(
      `SELECT ${columnas} FROM public.convocatorias_auxiliatura c
       JOIN public.materias m ON m.id = c.materia_id
       WHERE ($1::integer IS NULL OR c.gestion = $1)
         AND ($2::smallint IS NULL OR c.semestre = $2)
         AND ($3::varchar IS NULL OR c.estado = $3)
         AND ($4::bigint IS NULL OR c.materia_id = $4)
       ORDER BY c.fecha_creacion DESC, c.id DESC
       LIMIT $5 OFFSET $6`,
      [gestion, semestre, estado, materia, limite, (pagina - 1) * limite]
    );
    res.json({ convocatorias: resultado.rows, pagina, limite });
  } catch (error) {
    const e = errorSQL(error); res.status(e.status).json({ mensaje: e.mensaje });
  }
});

router.get('/convocatorias/:id', async (req, res) => {
  const id = identificador(req.params.id);
  if (!id) { res.status(400).json({ mensaje: 'ID de convocatoria inválido.' }); return; }
  try {
    const [convocatoria, requisitos] = await Promise.all([
      pool.query(`SELECT ${columnas} FROM public.convocatorias_auxiliatura c
        JOIN public.materias m ON m.id = c.materia_id WHERE c.id = $1`, [id]),
      pool.query(`SELECT id::text, descripcion, obligatorio, orden
        FROM public.requisitos_convocatoria_auxiliatura
        WHERE convocatoria_id = $1 ORDER BY orden`, [id]),
    ]);
    if (!convocatoria.rowCount) {
      res.status(404).json({ mensaje: 'Convocatoria no encontrada.' }); return;
    }
    res.json({ convocatoria: convocatoria.rows[0], requisitos: requisitos.rows });
  } catch (error) {
    const e = errorSQL(error); res.status(e.status).json({ mensaje: e.mensaje });
  }
});

// POST crea borrador y requisitos como UNA unidad atómica.
router.post('/convocatorias', async (req, res) => {
  const validacion = validarDatos(req.body);
  if (!validacion.datos) { res.status(400).json({ mensaje: validacion.mensaje }); return; }
  const d = validacion.datos;
  const cliente = await pool.connect().catch(() => null);
  if (!cliente) { res.status(500).json({ mensaje: 'No se pudo conectar a PostgreSQL.' }); return; }
  try {
    await cliente.query('BEGIN');
    const materia = await cliente.query(
      `SELECT id FROM public.materias WHERE id = $1 AND activo = TRUE FOR KEY SHARE`,
      [d.materia_id]
    );
    if (!materia.rowCount) {
      await cliente.query('ROLLBACK');
      res.status(400).json({ mensaje: 'La materia no existe o está desactivada.' }); return;
    }
    const resultado = await cliente.query(
      `INSERT INTO public.convocatorias_auxiliatura (
        materia_id, gestion, semestre, titulo, descripcion, requisitos_generales,
        fecha_apertura, fecha_cierre, fecha_examen, cupos, estado
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'borrador')
       RETURNING id::text`,
      [d.materia_id, d.gestion, d.semestre, d.titulo, d.descripcion,
       d.requisitos_generales, d.fecha_apertura, d.fecha_cierre, d.fecha_examen, d.cupos]
    );
    const id = resultado.rows[0].id as string;
    for (const [i, requisito] of d.requisitos.entries()) {
      await cliente.query(
        `INSERT INTO public.requisitos_convocatoria_auxiliatura
          (convocatoria_id, descripcion, obligatorio, orden)
         VALUES ($1,$2,$3,$4)`,
        [id, requisito.descripcion, requisito.obligatorio, i + 1]
      );
    }
    await cliente.query('COMMIT');
    res.status(201).json({ mensaje: 'Convocatoria guardada como borrador.', id, estado: 'borrador' });
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    const e = errorSQL(error); res.status(e.status).json({ mensaje: e.mensaje });
  } finally { cliente.release(); }
});

// PUT reemplaza todos los campos y requisitos de un borrador sin postulaciones.
// No se editan convocatorias publicadas, cerradas ni con aspirantes asociados.
router.put('/convocatorias/:id', async (req, res) => {
  const id = identificador(req.params.id);
  const validacion = validarDatos(req.body);
  if (!id || !validacion.datos) {
    res.status(400).json({ mensaje: !id ? 'ID de convocatoria inválido.' : validacion.mensaje }); return;
  }
  const d = validacion.datos;
  const cliente = await pool.connect().catch(() => null);
  if (!cliente) { res.status(500).json({ mensaje: 'No se pudo conectar a PostgreSQL.' }); return; }
  try {
    await cliente.query('BEGIN');
    const actual = await cliente.query(
      `SELECT estado FROM public.convocatorias_auxiliatura WHERE id = $1 FOR UPDATE`, [id]
    );
    if (!actual.rowCount) {
      await cliente.query('ROLLBACK'); res.status(404).json({ mensaje: 'Convocatoria no encontrada.' }); return;
    }
    if (actual.rows[0].estado !== 'borrador') {
      await cliente.query('ROLLBACK'); res.status(409).json({ mensaje: 'Solo se pueden editar convocatorias en borrador.' }); return;
    }
    const postulaciones = await cliente.query(
      `SELECT 1 FROM public.postulaciones_auxiliatura WHERE convocatoria_id=$1 LIMIT 1`, [id]
    );
    if (postulaciones.rowCount) {
      await cliente.query('ROLLBACK'); res.status(409).json({ mensaje: 'La convocatoria ya tiene postulantes; no se puede modificar.' }); return;
    }
    const materia = await cliente.query(
      `SELECT id FROM public.materias WHERE id = $1 AND activo = TRUE FOR KEY SHARE`,
      [d.materia_id]
    );
    if (!materia.rowCount) {
      await cliente.query('ROLLBACK'); res.status(400).json({ mensaje: 'La materia no existe o está desactivada.' }); return;
    }
    await cliente.query(
      `UPDATE public.convocatorias_auxiliatura SET
        materia_id=$2, gestion=$3, semestre=$4, titulo=$5, descripcion=$6,
        requisitos_generales=$7, fecha_apertura=$8, fecha_cierre=$9,
        fecha_examen=$10, cupos=$11, fecha_actualizacion=now()
       WHERE id=$1`,
      [id, d.materia_id, d.gestion, d.semestre, d.titulo, d.descripcion,
       d.requisitos_generales, d.fecha_apertura, d.fecha_cierre, d.fecha_examen, d.cupos]
    );
    await cliente.query(
      `DELETE FROM public.requisitos_convocatoria_auxiliatura WHERE convocatoria_id = $1`, [id]
    );
    for (const [i, requisito] of d.requisitos.entries()) {
      await cliente.query(
        `INSERT INTO public.requisitos_convocatoria_auxiliatura
          (convocatoria_id, descripcion, obligatorio, orden)
         VALUES ($1,$2,$3,$4)`,
        [id, requisito.descripcion, requisito.obligatorio, i + 1]
      );
    }
    await cliente.query('COMMIT');
    res.json({ mensaje: 'Borrador de convocatoria actualizado.', id });
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    const e = errorSQL(error); res.status(e.status).json({ mensaje: e.mensaje });
  } finally { cliente.release(); }
});

export default router;
