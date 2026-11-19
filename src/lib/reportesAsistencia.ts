import { API_URL } from './api';

export type FiltrosReporte = {
  desde: string;
  hasta: string;
  docenteId: string;
  materiaId: string;
  gestion: string;
};

export type EstadoReporte = 'marcada' | 'corregida' | 'justificada' |
  'falta_registrada' | 'sin_registro' | 'en_ventana' | 'programada';

export type FilaReporte = {
  horario_id: string;
  fecha: string;
  docente_id: string;
  docente: string;
  materia_id: string;
  materia: string;
  codigo_materia: string;
  gestion: number;
  hora_inicio: string;
  hora_fin: string;
  aula: string | null;
  hora_registro: string | null;
  solicitud_estado: string | null;
  origen_registro: string | null;
  estado: EstadoReporte;
};

export type ReporteAsistencia = {
  filtros: { desde: string; hasta: string; docenteId: string | null; materiaId: string | null; gestion: number | null };
  fecha_generacion: string;
  zona_horaria: string;
  resumen: {
    programadas: number;
    marcadas: number;
    corregidas: number;
    justificadas: number;
    faltas_registradas: number;
    sin_registro: number;
    en_ventana: number;
    futuras: number;
    solicitudes_pendientes: number;
    transcurridas: number;
    porcentaje_marcadas: number | null;
  };
  advertencia: string;
  filas: FilaReporte[];
};

function rutaReporte(f: FiltrosReporte, formato: 'json' | 'csv' | 'excel' = 'json'): string {
  const parametros = new URLSearchParams({ desde: f.desde, hasta: f.hasta });
  if (f.docenteId) parametros.set('docente_id', f.docenteId);
  if (f.materiaId) parametros.set('materia_id', f.materiaId);
  if (f.gestion) parametros.set('gestion', f.gestion);
  return `${API_URL}/api/reportes-asistencia${formato === 'json' ? '' : formato === 'csv' ? '/csv' : '/excel'}?${parametros}`;
}
async function errorPeticion(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object' && 'mensaje' in body && typeof body.mensaje === 'string') {
    return body.mensaje;
  }
  return `Error al consultar el reporte (${response.status}).`;
}

export async function obtenerReporteAsistencia(token: string, filtros: FiltrosReporte): Promise<ReporteAsistencia> {
  const response = await fetch(rutaReporte(filtros), {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error(await errorPeticion(response));
  return response.json() as Promise<ReporteAsistencia>;
}

export async function descargarReporte(token: string, filtros: FiltrosReporte, formato: 'csv' | 'excel'): Promise<void> {
  const response = await fetch(rutaReporte(filtros, formato), {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error(await errorPeticion(response));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `SGC_Asistencias_${filtros.desde}_${filtros.hasta}.${formato === 'excel' ? 'xlsx' : 'csv'}`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function fechaHoyBolivia(): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => partes.find(p => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}
