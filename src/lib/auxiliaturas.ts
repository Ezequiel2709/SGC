/** SGC · cliente tipado de Auxiliaturas, Bloque 19.
 * Usa la sesión JWT en memoria y el proxy /api ya configurado en Vite.
 * Este bloque consume exclusivamente las rutas de Convocatorias del Bloque 18.
 */
import { API_URL } from './api';

export type EstadoConvocatoria =
  | 'borrador' | 'publicada' | 'cerrada' | 'evaluacion' | 'finalizada' | 'anulada';

export type Convocatoria = {
  id: string;
  materia_id: string;
  materia_codigo: string;
  materia_nombre: string;
  gestion: number;
  semestre: number;
  titulo: string;
  descripcion: string | null;
  requisitos_generales: string | null;
  fecha_apertura: string;
  fecha_cierre: string;
  fecha_examen: string | null;
  cupos: number;
  estado: EstadoConvocatoria;
  resultados_publicados: boolean;
  fecha_publicacion_resultados: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
  cantidad_requisitos: number;
};

export type RequisitoConvocatoria = {
  id: string;
  descripcion: string;
  obligatorio: boolean;
  orden: number;
};

export type ConvocatoriaDetalle = {
  convocatoria: Convocatoria;
  requisitos: RequisitoConvocatoria[];
};

export type MateriaAux = {
  id: string;
  codigo: string;
  nombre: string;
  semestre: number | null;
  activo: boolean;
};

export type DatosConvocatoria = {
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
  requisitos: { descripcion: string; obligatorio: boolean }[];
};

export type ListadoConvocatorias = {
  convocatorias: Convocatoria[];
  pagina: number;
  limite: number;
};

async function solicitar<T>(token: string, ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(`${API_URL}/api/${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opciones.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      ...opciones.headers,
    },
  });
  const datos: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = datos && typeof datos === 'object' && 'mensaje' in datos &&
      typeof datos.mensaje === 'string'
      ? datos.mensaje : `No se completó la solicitud (${respuesta.status}).`;
    throw new Error(mensaje);
  }
  return datos as T;
}

export async function obtenerConvocatoriasAux(
  token: string, pagina = 1, estado = 'todos'
): Promise<ListadoConvocatorias> {
  const parametros = new URLSearchParams({ pagina: String(pagina), limite: '25' });
  if (estado !== 'todos') parametros.set('estado', estado);
  return solicitar<ListadoConvocatorias>(token, `auxiliaturas/convocatorias?${parametros}`);
}

export async function obtenerConvocatoriaAux(token: string, id: string): Promise<ConvocatoriaDetalle> {
  return solicitar<ConvocatoriaDetalle>(token, `auxiliaturas/convocatorias/${encodeURIComponent(id)}`);
}

export async function guardarConvocatoriaAux(
  token: string, datos: DatosConvocatoria, id?: string
): Promise<{ mensaje: string; id: string; estado?: string }> {
  return solicitar(token, `auxiliaturas/convocatorias${id ? `/${encodeURIComponent(id)}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(datos),
  });
}

export async function obtenerMateriasAux(token: string): Promise<MateriaAux[]> {
  const datos = await solicitar<{ materias: MateriaAux[] }>(token, 'plantel/resumen');
  return datos.materias.filter(materia => materia.activo);
}
