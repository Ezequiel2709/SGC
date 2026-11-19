import { API_URL } from './api';

export type RegistroControl = {
  id: string;
  estado: string;
  origen_registro: string;
  fecha: string;
  hora_registro: string;
  hora_inicio: string;
  materia: string;
  aula: string | null;
  observacion: string | null;
  tiene_foto: boolean;
  docente_id: string;
  docente_nombre: string;
};

export type SolicitudControl = {
  id: string;
  tipo: 'correccion' | 'justificacion';
  motivo: string;
  descripcion: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  fecha_clase: string;
  fecha_solicitud: string;
  fecha_revision: string | null;
  observacion_revision: string | null;
  docente_nombre: string;
  materia: string;
  hora_inicio: string;
};

async function mensajeError(res: Response): Promise<string> {
  const respuesta: unknown = await res.json().catch(() => null);
  if (respuesta && typeof respuesta === 'object' && 'mensaje' in respuesta &&
      typeof respuesta.mensaje === 'string') return respuesta.mensaje;
  return 'No se pudo completar la operación.';
}

async function peticion<T>(token: string, ruta: string, opciones?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/control-asistencia${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opciones?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(await mensajeError(res));
  return res.json() as Promise<T>;
}

export async function listarAsistenciasControl(token: string, docenteId: string): Promise<RegistroControl[]> {
  const filtro = docenteId ? `?docente_id=${encodeURIComponent(docenteId)}` : '';
  const dato = await peticion<{ asistencias: RegistroControl[] }>(token, `/asistencias${filtro}`);
  return dato.asistencias;
}
export async function listarSolicitudesControl(token: string): Promise<SolicitudControl[]> {
  const dato = await peticion<{ solicitudes: SolicitudControl[] }>(token, '/solicitudes');
  return dato.solicitudes;
}
export async function revisarSolicitud(token: string, id: string, decision: 'aprobada' | 'rechazada', observacion: string): Promise<string> {
  const dato = await peticion<{ mensaje: string }>(token, `/solicitudes/${encodeURIComponent(id)}/revisar`, {
    method: 'PATCH', body: JSON.stringify({ decision, observacion_revision: observacion }),
  });
  return dato.mensaje;
}
export async function fotoControl(token: string, asistenciaId: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/control-asistencia/foto/${encodeURIComponent(asistenciaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await mensajeError(res));
  const blob = await res.blob();
  if (!['image/jpeg', 'image/png'].includes(blob.type)) throw new Error('La evidencia no es una fotografía válida.');
  return URL.createObjectURL(blob);
}
