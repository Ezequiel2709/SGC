import { API_URL } from './api';

export type ClaseDocente = {
  horario_id: string;
  asignacion_id: string;
  materia: string;
  codigo_materia: string;
  gestion: number;
  dia_semana: number;
  aula: string | null;
  hora_inicio: string;
  hora_fin: string;
  asistencia_id: string | null;
  estado_asistencia: string | null;
  origen_asistencia: string | null;
  hoy: boolean;
  puede_marcar: boolean;
};
export type MisClases = {
  fecha: string;
  hora: string;
  zona_horaria: string;
  clases: ClaseDocente[];
};
export type AsistenciaDocente = {
  id: string;
  fecha: string;
  hora_registro: string;
  materia: string;
  estado: string;
  origen_registro: string;
  aula: string | null;
  tiene_foto: boolean;
};

async function mensajeError(respuesta: Response): Promise<string> {
  const datos: unknown = await respuesta.json().catch(() => null);
  if (typeof datos === 'object' && datos !== null && 'mensaje' in datos &&
      typeof datos.mensaje === 'string') return datos.mensaje;
  return 'No se pudo completar la operación.';
}
export async function obtenerMisClases(token: string): Promise<MisClases> {
  const respuesta = await fetch(`${API_URL}/api/docente/mis-clases`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) throw new Error(await mensajeError(respuesta));
  return respuesta.json() as Promise<MisClases>;
}
export async function obtenerMisAsistencias(token: string): Promise<AsistenciaDocente[]> {
  const respuesta = await fetch(`${API_URL}/api/docente/mis-asistencias`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) throw new Error(await mensajeError(respuesta));
  const resultado = await respuesta.json() as { asistencias: AsistenciaDocente[] };
  return resultado.asistencias;
}
export async function marcarMiEntrada(token: string, horarioId: string, foto: File): Promise<string> {
  const formulario = new FormData();
  formulario.append('foto', foto);
  const respuesta = await fetch(`${API_URL}/api/docente/marcar/${encodeURIComponent(horarioId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formulario,
  });
  if (!respuesta.ok) throw new Error(await mensajeError(respuesta));
  const resultado = await respuesta.json() as { mensaje: string };
  return resultado.mensaje;
}
export async function obtenerMiFoto(token: string, asistenciaId: string): Promise<string> {
  const respuesta = await fetch(`${API_URL}/api/docente/mi-foto/${encodeURIComponent(asistenciaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) throw new Error(await mensajeError(respuesta));
  const foto = await respuesta.blob();
  if (!['image/jpeg','image/png'].includes(foto.type)) {
    throw new Error('El servidor no devolvió una imagen válida.');
  }
  return URL.createObjectURL(foto);
}

export type MiSolicitud = {
  id: string;
  tipo: 'correccion' | 'justificacion';
  motivo: string;
  descripcion: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  fecha_clase: string;
  fecha_solicitud: string;
  fecha_revision: string | null;
  observacion_revision: string | null;
  materia: string;
  hora_inicio: string;
};

export async function obtenerMisSolicitudes(token: string): Promise<MiSolicitud[]> {
  const res = await fetch(`${API_URL}/api/docente/mis-solicitudes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await mensajeError(res));
  const r = await res.json() as { solicitudes: MiSolicitud[] };
  return r.solicitudes;
}

export async function enviarMiSolicitud(token: string, datos: {
  horario_id: string; fecha: string; tipo: 'correccion' | 'justificacion';
  motivo: string; descripcion: string;
}): Promise<string> {
  const res = await fetch(`${API_URL}/api/docente/solicitudes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  if (!res.ok) throw new Error(await mensajeError(res));
  const r = await res.json() as { mensaje: string };
  return r.mensaje;
}
