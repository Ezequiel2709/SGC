/**
 * SGC FINI–UAGRM · Etapas 2–5 de Auxiliaturas de Cátedra.
 * Rutas protegidas en server.ts por autenticar + permitirRoles('directora').
 * Usa exclusivamente las 9 tablas existentes. NO requiere migraciones.
 * Todas las decisiones, evaluaciones y publicaciones son manuales de Dirección.
 */
import { Router, type Request, type Response, type RequestHandler } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { pool } from '../db.js';
import type { PoolClient } from 'pg';

const router = Router();
class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function asegurar(condicion: unknown, mensaje: string, status = 400): asserts condicion {
  if (!condicion) throw new ApiError(status, mensaje);
}
function obj(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function texto(v: unknown, max = 250): string {
  asegurar(typeof v === 'string' && !!v.trim() && v.trim().length <= max, `Texto requerido (máximo ${max} caracteres).`);
  return v.trim();
}
function opcional(v: unknown, max = 2000): string | null {
  if (v === undefined || v === null || v === '') return null;
  return texto(v, max);
}
function id(v: unknown): string {
  const s = String(v ?? '');
  asegurar(/^[1-9]\d{0,18}$/.test(s) && BigInt(s) <= 9223372036854775807n, 'Identificador inválido.');
  return s;
}
function decimal(v: unknown, max = 10000): number {
  asegurar((typeof v === 'number' || typeof v === 'string') && v !== '' &&
    Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max &&
    Math.abs(Math.round(Number(v) * 100) - Number(v) * 100) < 1e-7, 'Puntaje inválido (máximo 2 decimales).');
  return Number(v);
}
function mensajeError(err: unknown): { status: number; mensaje: string } {
  if (err instanceof ApiError) return { status: err.status, mensaje: err.message };
  if (obj(err)) {
    if (err.code === '23505') return { status: 409, mensaje: 'Ya existe ese registro o se encuentra duplicado.' };
    if (err.code === '23503') return { status: 400, mensaje: 'Referencia inexistente o registro protegido por otra relación.' };
    if (err.code === '23514' || err.code === '22P02' || err.code === '22003') return { status: 400, mensaje: 'Un valor incumple las reglas de la base de datos.' };
    if (err.code === 'P0001') return { status: 400, mensaje: 'La verificación no coincide con los requisitos o criterios de la convocatoria.' };
  }
  console.error('Error en procesos de Auxiliaturas:', err);
  return { status: 500, mensaje: 'No fue posible completar la operación.' };
}
function endpoint(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res) => { void fn(req, res).catch(err => { const e = mensajeError(err); if (!res.headersSent) res.status(e.status).json({ mensaje: e.mensaje }); }); };
}
async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (err) { await client.query('ROLLBACK').catch(() => undefined); throw err; }
  finally { client.release(); }
}
async function convocatoriaLock(client: PoolClient, convocatoriaId: string) {
  const r = await client.query('SELECT id, estado, cupos, resultados_publicados FROM public.convocatorias_auxiliatura WHERE id=$1 FOR UPDATE', [convocatoriaId]);
  asegurar(r.rowCount, 'Convocatoria no encontrada.', 404);
  return r.rows[0] as { id: string; estado: string; cupos: number; resultados_publicados: boolean };
}
async function postulacionLock(client: PoolClient, postulacionId: string) {
  // Convocatoria ANTES de postulación: evita interbloqueos entre acciones simultáneas.
  const partida = await client.query('SELECT convocatoria_id::text FROM public.postulaciones_auxiliatura WHERE id=$1', [postulacionId]);
  asegurar(partida.rowCount, 'Postulación no encontrada.', 404);
  const convId = String(partida.rows[0].convocatoria_id);
  const convocatoria = await convocatoriaLock(client, convId);
  const p = await client.query('SELECT * FROM public.postulaciones_auxiliatura WHERE id=$1 AND convocatoria_id=$2 FOR UPDATE', [postulacionId, convId]);
  asegurar(p.rowCount, 'La postulación cambió durante la operación.', 409);
  return { convocatoria, postulacion: p.rows[0], convocatoriaId: convId };
}

// Estudiantes: se reutiliza la tabla compartida; no se crean duplicados.
router.get('/estudiantes', endpoint(async (req, res) => {
  const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';
  asegurar(buscar.length <= 100, 'Búsqueda demasiado larga.');
  const r = await pool.query(`SELECT id::text, ci, registro_universitario, nombres, apellidos, correo, telefono, activo
      FROM public.estudiantes WHERE activo=TRUE
        AND ($1::text='' OR ci ILIKE '%' || $1 || '%' OR registro_universitario ILIKE '%' || $1 || '%'
          OR nombres ILIKE '%' || $1 || '%' OR apellidos ILIKE '%' || $1 || '%')
      ORDER BY apellidos, nombres, id LIMIT 50`, [buscar]);
  res.json({ estudiantes: r.rows });
}));
router.post('/estudiantes', endpoint(async (req, res) => {
  asegurar(obj(req.body), 'Datos de estudiante incompletos.');
  const d = req.body;
  const ci = texto(d.ci, 35), ru = texto(d.registro_universitario, 45);
  const nombres = texto(d.nombres, 140), apellidos = texto(d.apellidos, 140);
  const correo = opcional(d.correo, 140), telefono = opcional(d.telefono, 40);
  const r = await pool.query(`INSERT INTO public.estudiantes
    (ci,registro_universitario,nombres,apellidos,correo,telefono,activo,fecha_creacion)
    VALUES ($1,$2,$3,$4,$5,$6,TRUE,now()) RETURNING id::text`, [ci,ru,nombres,apellidos,correo,telefono]);
  res.status(201).json({ id: r.rows[0].id, mensaje: 'Estudiante registrado.' });
}));

// Transición de convocatoria, manual. No publica resultados automáticamente.
router.patch('/convocatorias/:id/estado', endpoint(async (req, res) => {
  const convId = id(req.params.id);
  asegurar(obj(req.body) && typeof req.body.estado === 'string', 'Estado requerido.');
  const siguiente = req.body.estado;
  const etapas: Record<string, string[]> = {
    borrador: ['publicada'], publicada: ['cerrada'], cerrada: ['evaluacion'], evaluacion: [], finalizada: [], anulada: [],
  };
  await tx(async c => {
    const actual = await convocatoriaLock(c, convId);
    asegurar(etapas[actual.estado]?.includes(siguiente), `No se permite pasar de ${actual.estado} a ${siguiente}.`, 409);
    if (siguiente === 'evaluacion') {
      // Pueden existir habilitados listos para evaluar, pero no aspirantes sin verificar.
      const sinRevisar = await c.query(`SELECT COUNT(*)::int AS n FROM public.postulaciones_auxiliatura
        WHERE convocatoria_id=$1 AND estado IN ('registrada','en_revision')`, [convId]);
      asegurar(sinRevisar.rows[0].n === 0, 'Hay postulaciones sin resolver sus requisitos.', 409);
      const cr = await c.query('SELECT COUNT(*)::int AS n FROM public.criterios_evaluacion_auxiliatura WHERE convocatoria_id=$1',[convId]);
      asegurar(cr.rows[0].n > 0, 'Configura los criterios y máximos antes de iniciar la evaluación.', 409);
      const ev = await c.query('SELECT COUNT(*)::int AS n FROM public.evaluadores_auxiliatura WHERE convocatoria_id=$1',[convId]);
      asegurar(ev.rows[0].n === 3, 'Registra la comisión de tres evaluadores antes de iniciar la evaluación.', 409);
    }
    await c.query('UPDATE public.convocatorias_auxiliatura SET estado=$2,fecha_actualizacion=now() WHERE id=$1', [convId,siguiente]);
  });
  res.json({ mensaje: `Convocatoria actualizada a ${siguiente}.`, estado: siguiente });
}));

// Etapa 2: postulaciones (solo Dirección). Registrar únicamente en convocatoria publicada.
router.get('/postulaciones', endpoint(async (req, res) => {
  const convId = id(req.query.convocatoria_id);
  const r = await pool.query(`SELECT p.id::text,p.convocatoria_id::text,p.estudiante_id::text,p.estado,p.observaciones,
    p.fecha_postulacion,p.fecha_actualizacion,e.ci,e.registro_universitario,e.nombres,e.apellidos,
    v.criterios_configurados,v.criterios_calificados,v.puntaje_total,
    r.decision AS resultado,
    (SELECT COUNT(*)::int FROM public.documentos_postulacion_auxiliatura d WHERE d.postulacion_id=p.id) AS documentos_cantidad
    FROM public.postulaciones_auxiliatura p
    JOIN public.estudiantes e ON e.id=p.estudiante_id
    LEFT JOIN public.v_puntajes_auxiliatura v ON v.postulacion_id=p.id
    LEFT JOIN public.resultados_auxiliatura r ON r.postulacion_id=p.id
    WHERE p.convocatoria_id=$1 ORDER BY p.fecha_postulacion DESC,p.id DESC LIMIT 1000`,[convId]);
  res.json({ postulaciones: r.rows });
}));
router.post('/postulaciones', endpoint(async (req, res) => {
  asegurar(obj(req.body),'Datos de postulación requeridos.');
  const convocatoriaId = id(req.body.convocatoria_id), estudianteId = id(req.body.estudiante_id);
  const observaciones = opcional(req.body.observaciones, 2500);
  const registro = await tx(async c => {
    const conv = await convocatoriaLock(c, convocatoriaId);
    asegurar(conv.estado === 'publicada', 'Solo se registran postulaciones en convocatorias publicadas.', 409);
    const student = await c.query('SELECT id FROM public.estudiantes WHERE id=$1 AND activo=TRUE FOR KEY SHARE',[estudianteId]);
    asegurar(student.rowCount, 'Estudiante inexistente o inactivo.', 400);
    const r = await c.query(`INSERT INTO public.postulaciones_auxiliatura
      (convocatoria_id, estudiante_id, observaciones) VALUES ($1,$2,$3) RETURNING id::text`,
      [convocatoriaId, estudianteId, observaciones]);
    return r.rows[0].id as string;
  });
  res.status(201).json({ mensaje:'Postulación registrada.', id:registro });
}));

// Carga real de PDFs e imágenes privadas. Multer en memoria y validación de firma.
const maxBytes = 6 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } }).single('archivo');
const storage = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'auxiliaturas');
function archivoExtension(buffer: Buffer): { extension: string; mime: string } | null {
  if (buffer.subarray(0,5).toString('ascii') === '%PDF-') return { extension: '.pdf', mime: 'application/pdf' };
  if (buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { extension: '.png', mime:'image/png' };
  if (buffer.length >= 3 && buffer[0]===255 && buffer[1]===216 && buffer[2]===255) return {extension:'.jpg',mime:'image/jpeg'};
  return null;
}
router.get('/postulaciones/:id/documentos', endpoint(async (req,res) => {
  const postId = id(req.params.id);
  const r = await pool.query(`SELECT d.id::text,d.tipo_documento,d.nombre_archivo,d.estado,d.observaciones,d.fecha_entrega
    FROM public.documentos_postulacion_auxiliatura d
    WHERE d.postulacion_id=$1 ORDER BY d.fecha_entrega DESC,d.id DESC`, [postId]);
  res.json({ documentos:r.rows });
}));
router.post('/postulaciones/:id/documentos', (req,res) => {
  upload(req,res, err => {
    if (err) { res.status(400).json({ mensaje: err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el máximo permitido de 6 MB.' : 'Archivo inválido. Envía un solo archivo PDF, PNG o JPG.' }); return; }
    void (async () => {
      const postId = id(req.params.id);
      const tipo = texto(req.body?.tipo_documento,60);
      asegurar(req.file?.buffer?.length, 'Adjunta un archivo.');
      const archivo = req.file!;
      const contenido = archivoExtension(archivo.buffer);
      asegurar(contenido, 'Solo archivos PDF, PNG o JPEG válidos.');
      const nombre = archivo.originalname.replace(/[\\/\x00-\x1f]/g, '').slice(0,255) || `documento${contenido.extension}`;
      const uuid = randomUUID() + contenido.extension;
      const rutaInterna = `auxiliaturas/${uuid}`;
      const destino = path.join(storage,uuid);
      await mkdir(storage,{recursive:true});
      let creado = false;
      try {
        await tx(async c => {
          const bloqueado = await postulacionLock(c,postId);
          asegurar(!bloqueado.convocatoria.resultados_publicados &&
            !['finalizada','anulada'].includes(bloqueado.convocatoria.estado) &&
            !['retirada','seleccionada','no_seleccionada'].includes(bloqueado.postulacion.estado),
            'La postulación no admite nuevos documentos.',409);
          await writeFile(destino,archivo.buffer,{flag:'wx'}); creado=true;
          await c.query(`INSERT INTO public.documentos_postulacion_auxiliatura
            (postulacion_id,tipo_documento,nombre_archivo,ruta_privada)
            VALUES ($1,$2,$3,$4)`,[postId,tipo,nombre,rutaInterna]);
        });
      } catch(e) { if (creado) await unlink(destino).catch(()=>undefined); throw e; }
      res.status(201).json({mensaje:'Documento guardado en almacenamiento privado.'});
    })().catch(e=> {const err2=mensajeError(e); if(!res.headersSent)res.status(err2.status).json({mensaje:err2.mensaje});});
  });
});
// Revisión documental individual. No sustituye el checklist de requisitos.
router.patch('/documentos/:id/estado',endpoint(async(req,res)=>{
  const documentoId=id(req.params.id);
  asegurar(obj(req.body)&&typeof req.body.estado==='string' &&
    ['entregado','observado','aprobado','rechazado'].includes(req.body.estado),
    'Estado documental inválido.');
  const estado=req.body.estado;
  const observaciones=opcional(req.body.observaciones,1500);
  await tx(async c=>{
    const r=await c.query('SELECT postulacion_id::text FROM public.documentos_postulacion_auxiliatura WHERE id=$1',[documentoId]);
    asegurar(r.rowCount,'Documento no encontrado.',404);
    const {convocatoria,postulacion}=await postulacionLock(c,String(r.rows[0].postulacion_id));
    asegurar(!convocatoria.resultados_publicados &&
      ['publicada','cerrada','evaluacion'].includes(convocatoria.estado) &&
      ['registrada','en_revision','habilitada','no_habilitada'].includes(postulacion.estado),
      'El documento ya no admite cambios de revisión.',409);
    await c.query(`UPDATE public.documentos_postulacion_auxiliatura
      SET estado=$2,observaciones=$3 WHERE id=$1`,[documentoId,estado,observaciones]);
  });
  res.json({mensaje:'Estado documental actualizado.'});
}));
router.get('/documentos/:id/descargar', endpoint(async (req,res) => {
  const documentoId = id(req.params.id);
  const r = await pool.query('SELECT nombre_archivo,ruta_privada FROM public.documentos_postulacion_auxiliatura WHERE id=$1',[documentoId]);
  asegurar(r.rowCount,'Documento no encontrado.',404);
  const ruta = String(r.rows[0].ruta_privada);
  asegurar(/^auxiliaturas\/[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(ruta),'Ruta privada inválida.',500);
  const destino = path.resolve(storage,path.basename(ruta));
  asegurar(path.dirname(destino)===storage, 'Ubicación de documento no permitida.', 500);
  res.download(destino,String(r.rows[0].nombre_archivo),(err)=>{if(err){console.error('Error al descargar adjunto:',err);if(!res.headersSent)res.status(404).json({mensaje:'Archivo no disponible en el servidor.'});}});
}));

// Etapa 3: revisar cada requisito y determinar habilitación.
router.get('/postulaciones/:id/requisitos', endpoint(async (req,res) => {
  const postId=id(req.params.id);
  const r=await pool.query(`SELECT req.id::text AS requisito_id,req.descripcion,req.obligatorio,
    v.cumple,v.observaciones,v.fecha_revision
    FROM public.postulaciones_auxiliatura p
    JOIN public.requisitos_convocatoria_auxiliatura req ON req.convocatoria_id=p.convocatoria_id
    LEFT JOIN public.verificaciones_requisitos_auxiliatura v
      ON v.postulacion_id=p.id AND v.requisito_id=req.id
    WHERE p.id=$1 ORDER BY req.orden`,[postId]);
  res.json({ requisitos:r.rows });
}));
router.put('/postulaciones/:id/requisitos', endpoint(async (req,res) => {
  const postId=id(req.params.id);
  asegurar(obj(req.body) && Array.isArray(req.body.verificaciones) && req.body.verificaciones.length<=30,'Lista de verificaciones inválida.');
  const decision=req.body.estado;
  asegurar(typeof decision === 'string' && ['en_revision','habilitada','no_habilitada'].includes(decision),'Estado de verificación no válido.');
  const items = req.body.verificaciones as unknown[];
  const valores=new Map<string,{cumple:boolean|null;observaciones:string|null}>();
  for(const item of items) {
    asegurar(obj(item),'Verificación inválida.');
    const requisitoId=id(item.requisito_id);
    asegurar(item.cumple===null || typeof item.cumple==='boolean','Cumplimiento debe ser sí, no o sin revisar.');
    asegurar(!valores.has(requisitoId),'Requisito duplicado.');
    valores.set(requisitoId,{cumple:item.cumple,observaciones:opcional(item.observaciones,1500)});
  }
  await tx(async c=>{
    const {convocatoria,postulacion,convocatoriaId}=await postulacionLock(c,postId);
    asegurar(['publicada','cerrada','evaluacion'].includes(convocatoria.estado),'La convocatoria no permite revisar requisitos.',409);
    asegurar(['registrada','en_revision','habilitada','no_habilitada'].includes(postulacion.estado),'No se pueden modificar requisitos tras evaluar o resolver resultados.',409);
    const rs=await c.query(`SELECT id::text,obligatorio FROM public.requisitos_convocatoria_auxiliatura WHERE convocatoria_id=$1`,[convocatoriaId]);
    const existentes=new Set(rs.rows.map(r=>String(r.id)));
    asegurar(valores.size===existentes.size && [...valores.keys()].every(k=>existentes.has(k)),
      'Envía la revisión completa de los requisitos de esta convocatoria.');
    if(decision==='habilitada') asegurar(rs.rows.every(r=>!r.obligatorio || valores.get(String(r.id))?.cumple===true),
      'No se puede habilitar: hay requisitos obligatorios pendientes o incumplidos.',409);
    if(decision==='no_habilitada') asegurar(rs.rows.some(r=>r.obligatorio && valores.get(String(r.id))?.cumple===false),
      'Para no habilitar, identifica al menos un requisito obligatorio incumplido.',409);
    for(const [requisitoId,v] of valores) {
      await c.query(`INSERT INTO public.verificaciones_requisitos_auxiliatura
        (postulacion_id,requisito_id,cumple,observaciones,fecha_revision)
        VALUES ($1,$2,$3,$4,now())
        ON CONFLICT (postulacion_id,requisito_id) DO UPDATE SET
        cumple=EXCLUDED.cumple,observaciones=EXCLUDED.observaciones,fecha_revision=now()`,
        [postId,requisitoId,v.cumple,v.observaciones]);
    }
    await c.query('UPDATE public.postulaciones_auxiliatura SET estado=$2,fecha_actualizacion=now() WHERE id=$1',[postId,decision]);
  });
  res.json({mensaje:'Revisión guardada.',estado:decision});
}));

// Etapa 4: criterios configurables (incluido CPD) y comisión evaluadora.
router.get('/convocatorias/:id/criterios', endpoint(async(req,res)=>{
  const convId=id(req.params.id);
  const r=await pool.query(`SELECT id::text,codigo,nombre,puntaje_maximo,orden
    FROM public.criterios_evaluacion_auxiliatura WHERE convocatoria_id=$1 ORDER BY orden`,[convId]);
  res.json({criterios:r.rows});
}));
router.put('/convocatorias/:id/criterios',endpoint(async(req,res)=>{
  const convId=id(req.params.id);
  asegurar(obj(req.body)&&Array.isArray(req.body.criterios)&&req.body.criterios.length>0&&req.body.criterios.length<=15,
    'Indica entre 1 y 15 criterios.');
  const vistos=new Set<string>();
  const items=(req.body.criterios as unknown[]).map((item,i)=>{
    asegurar(obj(item),'Criterio inválido.');
    const codigo=texto(item.codigo,40).toUpperCase(),nombre=texto(item.nombre,150);
    const puntajeMaximo=decimal(item.puntaje_maximo,1000);
    asegurar(puntajeMaximo>0,'El máximo de cada criterio debe ser positivo.');
    asegurar(!vistos.has(codigo),'No repitas códigos de criterios.');vistos.add(codigo);
    return {codigo,nombre,puntajeMaximo,orden:i+1};
  });
  asegurar(items.reduce((s,i)=>s+i.puntajeMaximo,0)<=10000,'La suma de máximos excede el límite.');
  await tx(async c=>{
    const conv=await convocatoriaLock(c,convId);
    asegurar(['borrador','publicada','cerrada'].includes(conv.estado),'No se cambian criterios cuando inició la evaluación.',409);
    const evaluaciones=await c.query(`SELECT 1 FROM public.evaluaciones_auxiliatura e
      JOIN public.criterios_evaluacion_auxiliatura cr ON cr.id=e.criterio_id
      WHERE cr.convocatoria_id=$1 LIMIT 1`,[convId]);
    asegurar(!evaluaciones.rowCount,'Ya existen notas; no se pueden reemplazar los criterios.',409);
    await c.query('DELETE FROM public.criterios_evaluacion_auxiliatura WHERE convocatoria_id=$1',[convId]);
    for(const item of items) await c.query(`INSERT INTO public.criterios_evaluacion_auxiliatura
      (convocatoria_id,codigo,nombre,puntaje_maximo,orden) VALUES ($1,$2,$3,$4,$5)`,
      [convId,item.codigo,item.nombre,item.puntajeMaximo,item.orden]);
  });
  res.json({mensaje:'Criterios guardados.'});
}));
router.get('/convocatorias/:id/evaluadores',endpoint(async(req,res)=>{
  const convId=id(req.params.id);
  const r=await pool.query(`SELECT id::text,nombre_docente,codigo_docente,tipo,orden
    FROM public.evaluadores_auxiliatura WHERE convocatoria_id=$1 ORDER BY orden`,[convId]);
  res.json({evaluadores:r.rows});
}));
router.put('/convocatorias/:id/evaluadores',endpoint(async(req,res)=>{
  const convId=id(req.params.id);
  asegurar(obj(req.body)&&Array.isArray(req.body.evaluadores)&&req.body.evaluadores.length===3,
    'La comisión debe registrar tres docentes (un titular y dos invitados).');
  const items=(req.body.evaluadores as unknown[]).map((x,i)=>{
    asegurar(obj(x),'Evaluador inválido.');
    const tipo= x.tipo;
    asegurar(tipo==='titular'||tipo==='invitado','Tipo de evaluador inválido.');
    return {nombre: texto(x.nombre_docente,180),codigo:opcional(x.codigo_docente,50),tipo,orden:i+1};
  });
  asegurar(items.filter(x=>x.tipo==='titular').length===1 && items.filter(x=>x.tipo==='invitado').length===2,
    'Se requiere un titular y dos invitados.');
  await tx(async c=>{
    const conv=await convocatoriaLock(c,convId);
    asegurar(['borrador','publicada','cerrada','evaluacion'].includes(conv.estado),
      'La convocatoria ya está finalizada.',409);
    const notasExistentes = await c.query(`SELECT 1 FROM public.evaluaciones_auxiliatura e
      JOIN public.postulaciones_auxiliatura p ON p.id=e.postulacion_id
      WHERE p.convocatoria_id=$1 LIMIT 1`,[convId]);
    asegurar(!notasExistentes.rowCount, 'No se puede cambiar la comisión cuando ya hay evaluaciones.', 409);
    await c.query('DELETE FROM public.evaluadores_auxiliatura WHERE convocatoria_id=$1',[convId]);
    for(const x of items) await c.query(`INSERT INTO public.evaluadores_auxiliatura
      (convocatoria_id,nombre_docente,codigo_docente,tipo,orden) VALUES($1,$2,$3,$4,$5)`,
      [convId,x.nombre,x.codigo,x.tipo,x.orden]);
  });
  res.json({mensaje:'Comisión evaluadora guardada.'});
}));
router.get('/postulaciones/:id/evaluaciones',endpoint(async(req,res)=>{
  const postId=id(req.params.id);
  const r=await pool.query(`SELECT cr.id::text AS criterio_id,cr.codigo,cr.nombre,cr.puntaje_maximo,cr.orden,
    e.puntaje,e.observaciones
    FROM public.postulaciones_auxiliatura p
    JOIN public.criterios_evaluacion_auxiliatura cr ON cr.convocatoria_id=p.convocatoria_id
    LEFT JOIN public.evaluaciones_auxiliatura e ON e.postulacion_id=p.id AND e.criterio_id=cr.id
    WHERE p.id=$1 ORDER BY cr.orden`,[postId]);
  res.json({evaluaciones:r.rows});
}));
router.put('/postulaciones/:id/evaluaciones',endpoint(async(req,res)=>{
  const postId=id(req.params.id);
  asegurar(obj(req.body)&&Array.isArray(req.body.evaluaciones)&&req.body.evaluaciones.length<=15,
    'Listado de puntajes inválido.');
  const valores=new Map<string,{puntaje:number|null;observaciones:string|null}>();
  for(const item of req.body.evaluaciones as unknown[]){
    asegurar(obj(item),'Registro de calificación inválido.');
    const criterioId=id(item.criterio_id);
    asegurar(!valores.has(criterioId),'Criterio duplicado.');
    valores.set(criterioId,{puntaje:item.puntaje===null?null:decimal(item.puntaje),observaciones:opcional(item.observaciones,1500)});
  }
  const salida=await tx(async c=>{
    const {convocatoria,postulacion,convocatoriaId}=await postulacionLock(c,postId);
    asegurar(convocatoria.estado==='evaluacion','La convocatoria debe estar en estado evaluación.',409);
    asegurar(['habilitada','evaluada'].includes(postulacion.estado),'Solo se evalúan postulaciones habilitadas.',409);
    const criterios=await c.query(`SELECT id::text,puntaje_maximo FROM public.criterios_evaluacion_auxiliatura WHERE convocatoria_id=$1`,[convocatoriaId]);
    asegurar(criterios.rowCount && criterios.rowCount>0,'Configura primero los criterios.',409);
    const comision = await c.query('SELECT COUNT(*)::int AS n FROM public.evaluadores_auxiliatura WHERE convocatoria_id=$1',[convocatoriaId]);
    asegurar(comision.rows[0].n===3, 'Registra primero la comisión de tres evaluadores.',409);
    const permitidos=new Map(criterios.rows.map(r=>[String(r.id),Number(r.puntaje_maximo)]));
    asegurar(valores.size===permitidos.size && [...valores.keys()].every(k=>permitidos.has(k)),
      'Envía todos los criterios de la convocatoria.',400);
    for(const [criterioId,v] of valores){
      if(v.puntaje===null){await c.query('DELETE FROM public.evaluaciones_auxiliatura WHERE postulacion_id=$1 AND criterio_id=$2',[postId,criterioId]);continue;}
      asegurar(v.puntaje<=permitidos.get(criterioId)!,`El puntaje supera el máximo del criterio ${criterioId}.`);
      await c.query(`INSERT INTO public.evaluaciones_auxiliatura (postulacion_id,criterio_id,puntaje,observaciones)
        VALUES ($1,$2,$3,$4) ON CONFLICT (postulacion_id,criterio_id)
        DO UPDATE SET puntaje=EXCLUDED.puntaje,observaciones=EXCLUDED.observaciones,fecha_evaluacion=now()`,
        [postId,criterioId,v.puntaje,v.observaciones]);
    }
    const notas=await c.query('SELECT criterios_configurados,criterios_calificados,puntaje_total FROM public.v_puntajes_auxiliatura WHERE postulacion_id=$1',[postId]);
    const listo=notas.rows[0].criterios_configurados>0 && notas.rows[0].criterios_configurados===notas.rows[0].criterios_calificados;
    await c.query('UPDATE public.postulaciones_auxiliatura SET estado=$2,fecha_actualizacion=now() WHERE id=$1',[postId,listo?'evaluada':'habilitada']);
    return {listo,puntaje_total:notas.rows[0].puntaje_total};
  });
  res.json({mensaje:salida.listo?'Evaluación completa.':'Evaluación parcial guardada.',...salida});
}));

// Etapa 5: decisiones humanas, control de cupos y publicación expresamente autorizada.
router.get('/convocatorias/:id/resultados',endpoint(async(req,res)=>{
  const convId=id(req.params.id);
  const r=await pool.query(`SELECT p.id::text AS postulacion_id,p.estado, e.nombres,e.apellidos,e.registro_universitario,
    v.criterios_configurados,v.criterios_calificados,v.puntaje_total,
    r.decision,r.observaciones,c.resultados_publicados,c.cupos
    FROM public.postulaciones_auxiliatura p
    JOIN public.estudiantes e ON e.id=p.estudiante_id
    JOIN public.convocatorias_auxiliatura c ON c.id=p.convocatoria_id
    LEFT JOIN public.v_puntajes_auxiliatura v ON v.postulacion_id=p.id
    LEFT JOIN public.resultados_auxiliatura r ON r.postulacion_id=p.id
    WHERE p.convocatoria_id=$1 ORDER BY v.puntaje_total DESC NULLS LAST, e.apellidos,e.nombres`,[convId]);
  res.json({resultados:r.rows});
}));
router.put('/postulaciones/:id/resultado',endpoint(async(req,res)=>{
  const postId=id(req.params.id);
  asegurar(obj(req.body)&&typeof req.body.decision === 'string'&&['seleccionado','no_seleccionado'].includes(req.body.decision),
    'Selecciona seleccionado o no seleccionado.');
  const decision=String(req.body.decision),observaciones=opcional(req.body.observaciones,2500);
  await tx(async c=>{
    const {convocatoria,postulacion,convocatoriaId}=await postulacionLock(c,postId);
    asegurar(convocatoria.estado==='evaluacion' && !convocatoria.resultados_publicados,
      'La convocatoria no admite nuevas decisiones.',409);
    asegurar(['evaluada','seleccionada','no_seleccionada'].includes(postulacion.estado),
      'La postulación necesita una evaluación completa antes de decidir.',409);
    const nota=await c.query('SELECT puntaje_total FROM public.v_puntajes_auxiliatura WHERE postulacion_id=$1',[postId]);
    asegurar(nota.rows[0]?.puntaje_total!==null && nota.rows[0]?.puntaje_total!==undefined,
      'Completa los puntajes antes de decidir.',409);
    if(decision==='seleccionado') {
      const r=await c.query(`SELECT COUNT(*)::int AS total FROM public.resultados_auxiliatura r
        JOIN public.postulaciones_auxiliatura p ON p.id=r.postulacion_id
        WHERE p.convocatoria_id=$1 AND r.decision='seleccionado' AND p.id<>$2`,[convocatoriaId,postId]);
      asegurar(r.rows[0].total<convocatoria.cupos,`Los ${convocatoria.cupos} cupos ya están ocupados.`,409);
    }
    await c.query(`INSERT INTO public.resultados_auxiliatura (postulacion_id,decision,observaciones)
      VALUES ($1,$2,$3) ON CONFLICT (postulacion_id) DO UPDATE SET
      decision=EXCLUDED.decision,observaciones=EXCLUDED.observaciones,fecha_validacion=now()`,
      [postId,decision,observaciones]);
    await c.query('UPDATE public.postulaciones_auxiliatura SET estado=$2,fecha_actualizacion=now() WHERE id=$1',
      [postId,decision==='seleccionado'?'seleccionada':'no_seleccionada']);
  });
  res.json({mensaje:'Decisión registrada por Dirección.'});
}));
router.post('/convocatorias/:id/publicar-resultados',endpoint(async(req,res)=>{
  const convId=id(req.params.id);
  await tx(async c=>{
    const conv=await convocatoriaLock(c,convId);
    asegurar(conv.estado==='evaluacion' && !conv.resultados_publicados,
      'Solo se publican resultados una vez, durante evaluación.',409);
    const stats=await c.query(`SELECT
      COUNT(*) FILTER (WHERE p.estado NOT IN ('retirada','no_habilitada'))::int AS evaluables,
      COUNT(*) FILTER (WHERE p.estado NOT IN ('retirada','no_habilitada') AND r.id IS NULL)::int AS sin_decision,
      COUNT(*) FILTER (WHERE r.decision='seleccionado')::int AS seleccionados
      FROM public.postulaciones_auxiliatura p
      LEFT JOIN public.resultados_auxiliatura r ON r.postulacion_id=p.id
      WHERE p.convocatoria_id=$1`,[convId]);
    const x=stats.rows[0];
    asegurar(x.evaluables>0,'No hay postulaciones evaluables para publicar resultados.',409);
    asegurar(x.sin_decision===0,'Quedan postulaciones sin decisión validada.',409);
    asegurar(x.seleccionados<=conv.cupos,'Se exceden los cupos aprobados.',409);
    await c.query(`UPDATE public.convocatorias_auxiliatura
      SET estado='finalizada',resultados_publicados=TRUE,fecha_publicacion_resultados=now(),fecha_actualizacion=now()
      WHERE id=$1`,[convId]);
  });
  res.json({mensaje:'Resultados publicados y convocatoria finalizada.'});
}));

export default router;
