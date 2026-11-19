import { API_URL } from './api';

export type Docente = {
  id: string;
  perfil_id: string | null;
  nombre_completo: string;
  correo: string | null;
  codigo_docente: string | null;
  ci: string;
  telefono: string | null;
  especialidad: string | null;
  activo: boolean;
};
export type Materia = {
  id: string;
  codigo: string;
  nombre: string;
  semestre: number | null;
  activo: boolean;
};
export type Asignacion = {
  id: string;
  docente_id: string;
  materia_id: string;
  gestion: number;
  activo: boolean;
  docente_nombre: string;
  materia_nombre: string;
};
export type Horario = {
  id: string;
  asignacion_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  aula: string | null;
  activo: boolean;
  vigencia_desde: string;
  vigencia_hasta: string | null;
};
export type ResumenPlantel = {
  docentes: Docente[];
  materias: Materia[];
  asignaciones: Asignacion[];
  horarios: Horario[];
};
export type NuevoDocente = {
  nombre_completo: string;
  correo: string;
  password: string;
  ci: string;
  codigo_docente?: string;
  telefono?: string;
  especialidad?: string;
};

async function peticion<T>(token: string, ruta: string, body?: object, metodo?: 'PATCH'): Promise<T> {
  const respuesta = await fetch(`${API_URL}/api/plantel${ruta}`, {
    method: metodo ?? (body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const resultado: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = typeof resultado === 'object' && resultado !== null && 'mensaje' in resultado &&
      typeof resultado.mensaje === 'string'
      ? resultado.mensaje : 'No se pudo completar la operación.';
    throw new Error(mensaje);
  }
  return resultado as T;
}
export function obtenerPlantel(token: string): Promise<ResumenPlantel> {
  return peticion<ResumenPlantel>(token, '/resumen');
}
export function crearDocente(token: string, datos: NuevoDocente): Promise<unknown> {
  return peticion(token, '/docentes', datos);
}
export function crearMateria(token: string, datos: {codigo: string; nombre: string; semestre?: number}): Promise<unknown> {
  return peticion(token, '/materias', datos);
}
export function crearAsignacion(token: string, datos: {docente_id: string; materia_id: string; gestion: number}): Promise<unknown> {
  return peticion(token, '/asignaciones', datos);
}
export function crearHorario(token: string, datos: {asignacion_id: string; dia_semana: number; hora_inicio: string; hora_fin: string; aula?: string}): Promise<unknown> {
  return peticion(token, '/horarios', datos);
}

export type CambioHorario = {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  aula: string;
  vigencia_desde: string;
  motivo: string;
};
export function reprogramarHorario(token: string, horarioId: string, datos: CambioHorario): Promise<unknown> {
  return peticion(token, `/horarios/${encodeURIComponent(horarioId)}/reprogramar`, datos);
}


// Historial de auditoría del horario: no permite modificar ni eliminar cambios.
export type HistorialCambioHorario = {
  id: string;
  horario_anterior_id: string;
  horario_nuevo_id: string;
  vigencia_desde: string;
  fecha_cambio: string;
  motivo: string;
  autorizado_por: string;
  autorizado_nombre: string;
  anterior_dia: number;
  anterior_inicio: string;
  anterior_fin: string;
  anterior_aula: string | null;
  anterior_desde: string;
  anterior_hasta: string | null;
  nuevo_dia: number;
  nuevo_inicio: string;
  nuevo_fin: string;
  nuevo_aula: string | null;
  nuevo_desde: string;
  nuevo_hasta: string | null;
};
export function obtenerHistorialHorario(token: string, horarioId: string): Promise<{ cambios: HistorialCambioHorario[] }> {
  return peticion(token, `/horarios/${encodeURIComponent(horarioId)}/historial`);
}


// Edición de datos administrativos. No cambia contraseñas ni borra asistencias.
export type EdicionDocente = {
  nombre_completo: string;
  correo: string;
  ci: string;
  codigo_docente: string;
  telefono: string;
  especialidad: string;
};
export function editarDatosDocente(token: string, id: string, datos: EdicionDocente): Promise<unknown> {
  return peticion(token, `/docentes/${encodeURIComponent(id)}`, datos, 'PATCH');
}
export type EdicionMateria = { codigo: string; nombre: string; semestre: number | null };
export function editarDatosMateria(token: string, id: string, datos: EdicionMateria): Promise<unknown> {
  return peticion(token, `/materias/${encodeURIComponent(id)}`, datos, 'PATCH');
}
export function establecerEstadoMateria(token: string, id: string, activo: boolean): Promise<unknown> {
  return peticion(token, `/materias/${encodeURIComponent(id)}/estado`, { activo }, 'PATCH');
}
export type EdicionAsignacion = { docente_id: string; materia_id: string; gestion: number };
export function editarDatosAsignacion(token: string, id: string, datos: EdicionAsignacion): Promise<unknown> {
  return peticion(token, `/asignaciones/${encodeURIComponent(id)}`, datos, 'PATCH');
}
export function establecerEstadoAsignacion(token: string, id: string, activo: boolean): Promise<unknown> {
  return peticion(token, `/asignaciones/${encodeURIComponent(id)}/estado`, { activo }, 'PATCH');
}
