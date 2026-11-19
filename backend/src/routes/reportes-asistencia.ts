import { Router } from 'express';
import { pool } from '../db.js';
import { crearExcelReporte } from '../reportes/xlsx.js';

// Montado exclusivamente para el rol directora desde server.ts.
const router = Router();
const ZONA = 'America/La_Paz';
const MAXIMO_DIAS = 366;
const MAXIMO_FILAS = 20000;

function fechaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T12:00:00Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}
function diasEntre(desde: string, hasta: string) {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000);
}
function idValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[1-9]\d{0,18}$/.test(valor);
}
function horaActualBolivia(): { fecha: string; segundos: number } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const v = (t: string) => partes.find(p => p.type === t)?.value ?? '';
  return {
    fecha: `${v('year')}-${v('month')}-${v('day')}`,
    segundos: Number(v('hour')) * 3600 + Number(v('minute')) * 60 + Number(v('second')),
  };
}
function segundosHora(valor: string): number {
  const [hora, minuto] = valor.split(':').map(Number);
  return (hora ?? 0) * 3600 + (minuto ?? 0) * 60;
}

type Filtros = { desde: string; hasta: string; docenteId: string | null; materiaId: string | null; gestion: number | null };
function leerFiltros(query: Record<string, unknown>): { filtros?: Filtros; error?: string } {
  const { desde, hasta, docente_id, materia_id, gestion } = query;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta || diasEntre(desde, hasta) > MAXIMO_DIAS) {
    return { error: 'Selecciona fechas válidas y un periodo máximo de 367 días (ambos extremos incluidos).' };
  }
  if ((docente_id !== undefined && !idValido(docente_id)) ||
      (materia_id !== undefined && !idValido(materia_id))) {
    return { error: 'El docente o la materia seleccionados no son válidos.' };
  }
  const gestionNumero = gestion === undefined || gestion === '' ? null : Number(gestion);
  if (gestionNumero !== null && (!Number.isInteger(gestionNumero) || gestionNumero < 2000 || gestionNumero > 2100)) {
    return { error: 'La gestión debe ser un año entre 2000 y 2100.' };
  }
  return {
    filtros: {
      desde, hasta,
      docenteId: typeof docente_id === 'string' ? docente_id : null,
      materiaId: typeof materia_id === 'string' ? materia_id : null,
      gestion: gestionNumero,
    },
  };
}

type FilaBD = {
  horario_id: string; fecha: string; docente_id: string; docente: string;
  materia_id: string; materia: string; codigo_materia: string; gestion: number;
  hora_inicio: string; hora_fin: string; aula: string | null;
  estado_asistencia: string | null; origen_registro: string | null;
  hora_registro: string | null; solicitud_estado: string | null;
};
type EstadoReporte = 'marcada' | 'corregida' | 'justificada' | 'falta_registrada' |
  'sin_registro' | 'en_ventana' | 'programada';
type FilaReporte = Omit<FilaBD, 'estado_asistencia' | 'origen_registro'> & {
  estado: EstadoReporte; origen_registro: string | null;
};

const SQL = `
  WITH dias AS (
    SELECT serie.dia::date AS fecha
    FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS serie(dia)
  )
  SELECT h.id::text AS horario_id, TO_CHAR(dias.fecha, 'YYYY-MM-DD') AS fecha,
    d.id::text AS docente_id, p.nombre_completo AS docente,
    m.id::text AS materia_id, m.nombre AS materia, m.codigo AS codigo_materia,
    a.gestion, TO_CHAR(h.hora_inicio,'HH24:MI') AS hora_inicio,
    TO_CHAR(h.hora_fin,'HH24:MI') AS hora_fin, h.aula,
    s.estado AS estado_asistencia, s.origen_registro,
    TO_CHAR(s.hora_registro,'YYYY-MM-DD HH24:MI') AS hora_registro,
    solicitud.estado AS solicitud_estado
  FROM dias
  JOIN public.horarios_clase h
    ON h.dia_semana = EXTRACT(ISODOW FROM dias.fecha)::integer
   AND h.vigencia_desde <= dias.fecha
   AND (h.vigencia_hasta IS NULL OR h.vigencia_hasta >= dias.fecha)
  JOIN public.asignaciones_docentes a
    ON a.id = h.asignacion_id
   AND a.gestion = EXTRACT(YEAR FROM dias.fecha)::integer
  JOIN public.docentes d ON d.id = a.docente_id
  JOIN public.perfiles p ON p.id = d.perfil_id
  JOIN public.materias m ON m.id = a.materia_id
  LEFT JOIN public.asistencias s ON s.horario_id = h.id AND s.fecha = dias.fecha
  LEFT JOIN public.solicitudes_asistencia solicitud
    ON solicitud.horario_id = h.id AND solicitud.fecha_clase = dias.fecha
  WHERE ($3::bigint IS NULL OR d.id = $3::bigint)
    AND ($4::bigint IS NULL OR m.id = $4::bigint)
    AND ($5::integer IS NULL OR a.gestion = $5::integer)
    -- No proyectamos clases futuras de docentes/materias/asignaciones desactivadas.
    -- Los registros pasados se conservan; la BD aún no guarda la fecha de baja de asignaciones.
    AND (dias.fecha <= $6::date OR
      (h.activo = TRUE AND a.activo = TRUE AND d.activo = TRUE AND m.activo = TRUE AND p.activo = TRUE))
  ORDER BY dias.fecha, h.hora_inicio, p.nombre_completo, m.nombre, h.id
  LIMIT $7
`;

async function obtenerReporte(filtros: Filtros) {
  const ahora = horaActualBolivia();
  const datos = await pool.query<FilaBD>(SQL, [
    filtros.desde, filtros.hasta, filtros.docenteId, filtros.materiaId,
    filtros.gestion, ahora.fecha, MAXIMO_FILAS + 1,
  ]);
  if (datos.rows.length > MAXIMO_FILAS) {
    return { error: 'El periodo tiene demasiadas clases. Filtra por docente, materia o reduce el rango de fechas.' };
  }
  const filas: FilaReporte[] = datos.rows.map((fila) => {
    let estado: EstadoReporte;
    if (fila.estado_asistencia === 'justificado' || fila.origen_registro === 'justificacion') {
      estado = 'justificada';
    } else if (fila.estado_asistencia === 'presente' && fila.origen_registro === 'correccion') {
      estado = 'corregida';
    } else if (fila.estado_asistencia === 'presente') {
      estado = 'marcada';
    } else if (fila.estado_asistencia === 'falta') {
      estado = 'falta_registrada';
    } else if (fila.fecha > ahora.fecha) {
      estado = 'programada';
    } else if (fila.fecha === ahora.fecha && ahora.segundos <= segundosHora(fila.hora_inicio) + 900) {
      estado = 'en_ventana';
    } else {
      estado = 'sin_registro';
    }
    const { estado_asistencia: _estadoDescartado, ...resto } = fila;
    void _estadoDescartado;
    return { ...resto, estado };
  });
  const resumen = {
    programadas: filas.length,
    marcadas: filas.filter(f => f.estado === 'marcada').length,
    corregidas: filas.filter(f => f.estado === 'corregida').length,
    justificadas: filas.filter(f => f.estado === 'justificada').length,
    faltas_registradas: filas.filter(f => f.estado === 'falta_registrada').length,
    sin_registro: filas.filter(f => f.estado === 'sin_registro').length,
    en_ventana: filas.filter(f => f.estado === 'en_ventana').length,
    futuras: filas.filter(f => f.estado === 'programada').length,
    solicitudes_pendientes: filas.filter(f => f.solicitud_estado === 'pendiente').length,
  };
  const transcurridas = resumen.marcadas + resumen.corregidas + resumen.justificadas +
    resumen.faltas_registradas + resumen.sin_registro;
  const porcentaje = transcurridas > 0
    ? Math.round(((resumen.marcadas + resumen.corregidas) / transcurridas) * 1000) / 10
    : null;
  return { filtros, fecha_generacion: ahora.fecha, zona_horaria: ZONA, resumen: {
    ...resumen, transcurridas, porcentaje_marcadas: porcentaje,
  }, filas, advertencia: 'Reporte de control operativo: sin registro no equivale a falta confirmada. ' +
    'El cálculo usa horarios y vigencias, pero no descuenta feriados, suspensiones, inicio/fin de semestre ' +
    'ni conoce la fecha histórica de desactivación de una asignación. Los horarios migrados pueden tener una vigencia inicial convencional. Validar antes de emitir un informe oficial.' };
}

// Impide que una cadena procedente de la BD se interprete como fórmula al abrirla en Excel.
function celdaCsv(valor: unknown): string {
  let contenido = valor === undefined || valor === null ? '' : String(valor);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(contenido)) contenido = `'${contenido}`;
  return `"${contenido.replace(/"/g, '""')}"`;
}
function filasExportacion(reporte: Exclude<Awaited<ReturnType<typeof obtenerReporte>>, {error: string}>) {
  const cabecera = [ 'Fecha', 'Docente', 'Materia', 'Código materia', 'Gestión',
    'Hora inicio', 'Hora fin', 'Aula', 'Estado', 'Hora de registro o autorización', 'Solicitud' ];
  const etiquetas: Record<EstadoReporte, string> = {
    marcada: 'Marcada con foto', corregida: 'Corrección aprobada',
    justificada: 'Justificada', falta_registrada: 'Falta registrada',
    sin_registro: 'Sin registro', en_ventana: 'Ventana abierta', programada: 'Programada',
  };
  const filas = reporte.filas.map(f => [f.fecha, f.docente, f.materia, f.codigo_materia,
    f.gestion, f.hora_inicio, f.hora_fin, f.aula, etiquetas[f.estado], f.hora_registro,
    f.solicitud_estado]);
  return [
    ['Reporte de asistencias SGC'],
    [`Periodo: ${reporte.filtros.desde} al ${reporte.filtros.hasta}`],
    [`Generado: ${reporte.fecha_generacion} (${ZONA})`],
    [reporte.advertencia],
    [],
    ['Clases programadas', 'Marcadas con foto', 'Correcciones', 'Justificaciones',
      'Faltas registradas', 'Sin registro', 'Ventana abierta', 'Futuras', 'Solicitudes pendientes', '% marcadas/transcurridas'],
    [reporte.resumen.programadas, reporte.resumen.marcadas, reporte.resumen.corregidas,
      reporte.resumen.justificadas, reporte.resumen.faltas_registradas, reporte.resumen.sin_registro,
      reporte.resumen.en_ventana, reporte.resumen.futuras, reporte.resumen.solicitudes_pendientes,
      reporte.resumen.porcentaje_marcadas ?? 'N/A'],
    [], cabecera, ...filas,
  ];
}
function csvDelReporte(reporte: Exclude<Awaited<ReturnType<typeof obtenerReporte>>, {error: string}>): string {
  return '\uFEFFsep=;\r\n' + filasExportacion(reporte).map(c => c.map(celdaCsv).join(';')).join('\r\n');
}

router.get('/', async (req, res) => {
  const { filtros, error } = leerFiltros(req.query);
  if (!filtros) { res.status(400).json({ mensaje: error }); return; }
  try {
    const reporte = await obtenerReporte(filtros);
    if ('error' in reporte) { res.status(422).json({ mensaje: reporte.error }); return; }
    res.set('Cache-Control', 'no-store');
    res.json(reporte);
  } catch (fallo) {
    console.error('Error al generar reporte de asistencias:', fallo);
    res.status(500).json({ mensaje: 'No fue posible generar el reporte desde PostgreSQL.' });
  }
});

router.get('/csv', async (req, res) => {
  const { filtros, error } = leerFiltros(req.query);
  if (!filtros) { res.status(400).json({ mensaje: error }); return; }
  try {
    const reporte = await obtenerReporte(filtros);
    if ('error' in reporte) { res.status(422).json({ mensaje: reporte.error }); return; }
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="SGC_Asistencias_${filtros.desde}_${filtros.hasta}.csv"`);
    res.send(csvDelReporte(reporte));
  } catch (fallo) {
    console.error('Error al exportar asistencias:', fallo);
    res.status(500).json({ mensaje: 'No fue posible exportar el reporte.' });
  }
});

router.get('/excel', async (req, res) => {
  const { filtros, error } = leerFiltros(req.query);
  if (!filtros) { res.status(400).json({ mensaje: error }); return; }
  try {
    const reporte = await obtenerReporte(filtros);
    if ('error' in reporte) { res.status(422).json({ mensaje: reporte.error }); return; }
    const archivo = crearExcelReporte(filasExportacion(reporte));
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="SGC_Asistencias_${filtros.desde}_${filtros.hasta}.xlsx"`);
    res.send(archivo);
  } catch (fallo) {
    console.error('Error al generar Excel:', fallo);
    res.status(500).json({ mensaje: 'No fue posible generar el archivo Excel.' });
  }
});

export default router;
