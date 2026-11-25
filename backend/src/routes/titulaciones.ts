/**
 * SGC FINI–UAGRM · Titulaciones, backend inicial.
 * Montado en server.ts únicamente para rol directora y JWT vigente.
 * No crea tablas ni aplica criterios académicos no confirmados.
 */
import { Router, type Request, type Response, type RequestHandler } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const router = Router();
const archivos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../storage/titulaciones');
const estados = new Set(['pendiente', 'aprobada', 'rechazada']);

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function asegurar(valor: unknown, mensaje: string, estado = 400): asserts valor {
  if (!valor) throw new ApiError(estado, mensaje);
}
function objeto(valor: unknown): valor is Record<string, unknown> {
  return !!valor && typeof valor === 'object' && !Array.isArray(valor);
}
function texto(valor: unknown, max = 150): string {
  asegurar(typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= max,
    `Texto obligatorio (hasta ${max} caracteres).`);
  return valor.trim();
}
function opcional(valor: unknown, max = 1000): string | null {
  if (valor == null || valor === '') return null;
  return texto(valor, max);
}
function identificador(valor: unknown): string {
  const id = String(valor ?? '');
  asegurar(/^[1-9]\d{0,18}$/.test(id), 'Identificador incorrecto.');
  asegurar(BigInt(id) <= 9223372036854775807n, 'Identificador fuera de rango.');
  return id;
}
function fecha(valor: unknown, requerido = true): string | null {
  if (!requerido && (valor == null || valor === '')) return null;
  asegurar(typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor),
    'Fecha incorrecta: utiliza YYYY-MM-DD.');
  const d = new Date(`${valor}T12:00:00Z`);
  asegurar(!Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === valor,
    'La fecha indicada no existe.');
  return valor;
}
function nota(valor: unknown): number {
  asegurar((typeof valor === 'number' || typeof valor === 'string') &&
    String(valor).trim() !== '' && Number.isFinite(Number(valor)),
    'Introduce una calificación numérica.');
  const n = Number(valor);
  asegurar(n >= 0 && n <= 100, 'La calificación debe estar entre 0 y 100.');
  return n;
}
function manejoError(err: unknown): { status: number; mensaje: string } {
  if (err instanceof ApiError) return { status: err.status, mensaje: err.message };
  if (objeto(err)) {
    if (err.code === '23505') return { status: 409, mensaje: 'El CI, RU o número de acta ya está registrado.' };
    if (err.code === '23503') return { status: 400, mensaje: 'El estudiante o usuario asociado no existe.' };
    if (['23514', '22003', '22P02', '23502'].includes(String(err.code))) {
      return { status: 400, mensaje: 'Los datos no cumplen las validaciones de PostgreSQL.' };
    }
  }
  console.error('Error en Titulaciones:', err);
  return { status: 500, mensaje: 'No se pudo completar la operación de Titulaciones.' };
}
function endpoint(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res) => {
    void fn(req, res).catch((error: unknown) => {
      const e = manejoError(error);
      if (!res.headersSent) res.status(e.status).json({ mensaje: e.mensaje });
    });
  };
}

type DatosActa = {
  estudiante_id: string;
  numero_acta: string;
  fecha_acta: string;
  nota_final: number;
  fecha_defensa: string | null;
  modalidad: string | null;
  titulo_trabajo: string | null;
  observaciones: string | null;
};
function datosActa(valor: unknown): DatosActa {
  asegurar(objeto(valor), 'Envía los datos del acta en JSON.');
  return {
    estudiante_id: identificador(valor.estudiante_id),
    numero_acta: texto(valor.numero_acta, 50),
    fecha_acta: fecha(valor.fecha_acta)!,
    nota_final: nota(valor.nota_final),
    fecha_defensa: fecha(valor.fecha_defensa, false),
    modalidad: opcional(valor.modalidad, 100),
    titulo_trabajo: opcional(valor.titulo_trabajo, 4000),
    observaciones: opcional(valor.observaciones, 3000),
  };
}

const columnasActa = `
  a.id::text, a.estudiante_id::text, a.numero_acta,
  TO_CHAR(a.fecha_acta, 'YYYY-MM-DD') AS fecha_acta, a.nota_final,
  a.estado, a.observaciones, a.registrado_por::text, a.fecha_creacion,
  TO_CHAR(a.fecha_defensa, 'YYYY-MM-DD') AS fecha_defensa,
  a.modalidad, a.titulo_trabajo, (a.documento_ruta IS NOT NULL) AS tiene_documento,
  e.ci, e.registro_universitario, e.nombres, e.apellidos
`;

// Estudiantes compartidos: no se crea un catálogo separado de Auxiliaturas.
router.get('/estudiantes', endpoint(async (req, res) => {
  const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';
  asegurar(buscar.length <= 100, 'Búsqueda demasiado larga.');
  const r = await pool.query(`
    SELECT id::text, ci, registro_universitario, nombres, apellidos, correo, telefono, activo
    FROM public.estudiantes
    WHERE activo=TRUE AND (
      $1::text='' OR ci ILIKE '%'||$1||'%' OR registro_universitario ILIKE '%'||$1||'%'
      OR nombres ILIKE '%'||$1||'%' OR apellidos ILIKE '%'||$1||'%'
      OR (nombres || ' ' || apellidos) ILIKE '%'||$1||'%'
    )
    ORDER BY apellidos, nombres, id LIMIT 100`, [buscar]);
  res.json({ estudiantes: r.rows });
}));

router.post('/estudiantes', endpoint(async (req, res) => {
  asegurar(objeto(req.body), 'Datos de estudiante incompletos.');
  const d = req.body;
  const ci = texto(d.ci, 30);
  const ru = texto(d.registro_universitario, 40);
  const nombres = texto(d.nombres, 100);
  const apellidos = texto(d.apellidos, 100);
  const correo = opcional(d.correo, 120);
  const telefono = opcional(d.telefono, 30);
  if (correo) asegurar(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo), 'Correo no válido.');
  const r = await pool.query(`
    INSERT INTO public.estudiantes(ci,registro_universitario,nombres,apellidos,correo,telefono,activo)
    VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING id::text`,
    [ci, ru, nombres, apellidos, correo, telefono]);
  res.status(201).json({ mensaje: 'Estudiante registrado.', id: r.rows[0].id });
}));

router.get('/resumen', endpoint(async (_req, res) => {
  const [est, actas] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM public.estudiantes WHERE activo=TRUE'),
    pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER(WHERE estado='pendiente')::int AS pendientes,
      COUNT(*) FILTER(WHERE estado='aprobada')::int AS aprobadas,
      COUNT(*) FILTER(WHERE estado='rechazada')::int AS rechazadas
      FROM public.actas_graduacion`),
  ]);
  res.json({ estudiantes: est.rows[0]?.total ?? 0, ...actas.rows[0] });
}));

router.get('/actas', endpoint(async (req, res) => {
  const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';
  const estado = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
  asegurar(buscar.length <= 100, 'Búsqueda demasiado larga.');
  asegurar(!estado || estados.has(estado), 'Filtro de estado inválido.');
  const paginaRaw = req.query.pagina == null ? 1 : Number(req.query.pagina);
  const limiteRaw = req.query.limite == null ? 25 : Number(req.query.limite);
  asegurar(Number.isInteger(paginaRaw) && paginaRaw >= 1 && paginaRaw <= 100000,
    'Página incorrecta.');
  asegurar(Number.isInteger(limiteRaw) && limiteRaw >= 1 && limiteRaw <= 100,
    'El límite debe estar entre 1 y 100.');
  const r = await pool.query(`
    SELECT ${columnasActa}
    FROM public.actas_graduacion a
    JOIN public.estudiantes e ON e.id=a.estudiante_id
    WHERE ($1::text='' OR a.estado=$1)
      AND ($2::text='' OR a.numero_acta ILIKE '%'||$2||'%'
        OR e.ci ILIKE '%'||$2||'%' OR e.registro_universitario ILIKE '%'||$2||'%'
        OR (e.nombres||' '||e.apellidos) ILIKE '%'||$2||'%')
    ORDER BY a.fecha_acta DESC, a.id DESC LIMIT $3 OFFSET $4`,
    [estado, buscar, limiteRaw, (paginaRaw - 1) * limiteRaw]);
  res.json({ actas: r.rows, pagina: paginaRaw, limite: limiteRaw });
}));

router.get('/actas/:id', endpoint(async (req, res) => {
  const actaId = identificador(req.params.id);
  const r = await pool.query(`
    SELECT ${columnasActa}
    FROM public.actas_graduacion a JOIN public.estudiantes e ON e.id=a.estudiante_id
    WHERE a.id=$1`, [actaId]);
  asegurar(r.rowCount, 'Acta no encontrada.', 404);
  res.json({ acta: r.rows[0] });
}));

router.post('/actas', endpoint(async (req, res) => {
  const d = datosActa(req.body);
  const usuarioId = identificador(res.locals.usuario?.id);
  const r = await pool.query(`
    INSERT INTO public.actas_graduacion
      (estudiante_id,numero_acta,fecha_acta,nota_final,estado,observaciones,
       registrado_por,fecha_defensa,modalidad,titulo_trabajo)
    SELECT e.id,$2,$3,$4,'pendiente',$5,$6,$7,$8,$9
    FROM public.estudiantes e WHERE e.id=$1 AND e.activo=TRUE
    RETURNING id::text, estado`,
    [d.estudiante_id, d.numero_acta, d.fecha_acta, d.nota_final,
      d.observaciones, usuarioId, d.fecha_defensa, d.modalidad, d.titulo_trabajo]);
  asegurar(r.rowCount, 'El estudiante no existe o está inactivo.', 400);
  res.status(201).json({ mensaje: 'Acta registrada como pendiente.', ...r.rows[0] });
}));

router.put('/actas/:id', endpoint(async (req, res) => {
  const actaId = identificador(req.params.id);
  const d = datosActa(req.body);
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const actual = await cliente.query('SELECT estado FROM public.actas_graduacion WHERE id=$1 FOR UPDATE', [actaId]);
    asegurar(actual.rowCount, 'Acta no encontrada.', 404);
    asegurar(actual.rows[0].estado === 'pendiente', 'Solo se pueden editar actas pendientes.', 409);
    const r = await cliente.query(`
      UPDATE public.actas_graduacion a SET estudiante_id=e.id,numero_acta=$2,
      fecha_acta=$3,nota_final=$4,observaciones=$5,fecha_defensa=$6,modalidad=$7,titulo_trabajo=$8
      FROM public.estudiantes e
      WHERE a.id=$9 AND e.id=$1 AND e.activo=TRUE RETURNING a.id::text`,
      [d.estudiante_id, d.numero_acta, d.fecha_acta, d.nota_final,
        d.observaciones, d.fecha_defensa, d.modalidad, d.titulo_trabajo, actaId]);
    asegurar(r.rowCount, 'El estudiante no existe o está inactivo.', 400);
    await cliente.query('COMMIT');
    res.json({ mensaje: 'Acta pendiente actualizada.', id: actaId });
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { cliente.release(); }
}));

// Estado administrativo manual: no se calcula la aprobación a partir de la nota.
router.patch('/actas/:id/estado', endpoint(async (req, res) => {
  const actaId = identificador(req.params.id);
  asegurar(objeto(req.body), 'Indica el estado de la revisión.');
  const estado = req.body.estado;
  asegurar(estado === 'aprobada' || estado === 'rechazada',
    'Solo se permite aprobar o rechazar un acta pendiente.');
  const observaciones = opcional(req.body.observaciones, 3000);
  const r = await pool.query(`
    UPDATE public.actas_graduacion SET estado=$2,observaciones=COALESCE($3,observaciones)
    WHERE id=$1 AND estado='pendiente' RETURNING id::text, estado`,
    [actaId, estado, observaciones]);
  asegurar(r.rowCount, 'Acta inexistente o ya revisada.', 409);
  res.json({ mensaje: 'Estado actualizado por Dirección.', ...r.rows[0] });
}));

// Adjuntos protegidos: máximo 6 MiB, únicamente archivos con cabecera PDF.
const cargarPDF = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });
const recibirPDF: RequestHandler = (req, res, next) => {
  cargarPDF.single('archivo')(req, res, (error: unknown) => {
    if (!error) { next(); return; }
    const mensaje = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'El PDF supera el límite de 6 MB.' : 'No se pudo procesar el archivo adjunto.';
    res.status(400).json({ mensaje });
  });
};
router.post('/actas/:id/documento', recibirPDF, endpoint(async (req, res) => {
  const actaId = identificador(req.params.id);
  const file = req.file;
  asegurar(file && file.buffer.length >= 5 && file.buffer.subarray(0, 5).toString('ascii') === '%PDF-',
    'Adjunta un PDF válido de hasta 6 MB.');
  const nuevo = `${randomUUID()}.pdf`;
  const ruta = `titulaciones/${nuevo}`;
  const destino = path.join(archivos, nuevo);
  await mkdir(archivos, { recursive: true, mode: 0o700 });
  await writeFile(destino, file.buffer, { flag: 'wx', mode: 0o600 });
  let anterior: string | null = null;
  try {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const r = await cliente.query(`
        SELECT estado, documento_ruta FROM public.actas_graduacion WHERE id=$1 FOR UPDATE`, [actaId]);
      asegurar(r.rowCount, 'Acta no encontrada.', 404);
      asegurar(r.rows[0].estado === 'pendiente', 'Solo se admiten archivos para actas pendientes.', 409);
      anterior = r.rows[0].documento_ruta as string | null;
      await cliente.query('UPDATE public.actas_graduacion SET documento_ruta=$2 WHERE id=$1', [actaId, ruta]);
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { cliente.release(); }
  } catch (error) {
    await unlink(destino).catch(() => undefined);
    throw error;
  }
  if (anterior && /^titulaciones\/[a-f\d-]{36}\.pdf$/i.test(anterior)) {
    await unlink(path.join(archivos, path.basename(anterior))).catch(() => undefined);
  }
  res.json({ mensaje: 'PDF del acta guardado de forma privada.' });
}));

router.get('/actas/:id/documento', endpoint(async (req, res) => {
  const actaId = identificador(req.params.id);
  const r = await pool.query('SELECT documento_ruta FROM public.actas_graduacion WHERE id=$1', [actaId]);
  asegurar(r.rowCount, 'Acta no encontrada.', 404);
  const ruta = r.rows[0].documento_ruta as string | null;
  asegurar(ruta && /^titulaciones\/[a-f\d-]{36}\.pdf$/i.test(ruta),
    'Esta acta no tiene un PDF disponible.', 404);
  const buffer = await readFile(path.join(archivos, path.basename(ruta))).catch(() => null);
  asegurar(buffer, 'El PDF no se encontró en el almacenamiento privado.', 404);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="acta-${actaId}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}));

export default router;
