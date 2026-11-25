/** SGC · Titulaciones: cliente HTTP del Bloque 23. Token solo en memoria. */
import { API_URL } from './api';

const BASE = `${API_URL}/api/titulaciones`;
export type EstadoActa = 'pendiente' | 'aprobada' | 'rechazada';
export type EstudianteT = {
  id: string; ci: string; registro_universitario: string;
  nombres: string; apellidos: string; correo: string | null;
  telefono: string | null; activo: boolean;
};
export type ResumenT = { estudiantes: number; total: number; pendientes: number; aprobadas: number; rechazadas: number };
export type ActaT = {
  id: string; estudiante_id: string; numero_acta: string; fecha_acta: string;
  nota_final: string | number; estado: EstadoActa; observaciones: string | null;
  registrado_por: string; fecha_creacion: string; fecha_defensa: string | null;
  modalidad: string | null; titulo_trabajo: string | null; tiene_documento: boolean;
  ci: string; registro_universitario: string; nombres: string; apellidos: string;
};
export type DatosActaT = {
  estudiante_id: string; numero_acta: string; fecha_acta: string;
  nota_final: number; fecha_defensa: string | null; modalidad: string | null;
  titulo_trabajo: string | null; observaciones: string | null;
};
export type NuevoEstudianteT = {
  ci: string; registro_universitario: string; nombres: string;
  apellidos: string; correo?: string; telefono?: string;
};

function mensajeDeError(valor: unknown, defecto: string): string {
  if (valor && typeof valor === 'object' && 'mensaje' in valor &&
      typeof (valor as {mensaje?:unknown}).mensaje === 'string') {
    return String((valor as {mensaje:string}).mensaje);
  }
  return defecto;
}

async function consultar<T>(token: string, ruta: string, opciones: RequestInit = {}): Promise<T> {
  const headers = new Headers(opciones.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (opciones.body && !(opciones.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let respuesta: Response;
  try { respuesta = await fetch(`${BASE}${ruta}`, { ...opciones, headers, cache: 'no-store' }); }
  catch { throw new Error('No se pudo conectar al backend del SGC. Comprueba que esté iniciado.'); }
  const json: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const defecto = respuesta.status === 401 ? 'La sesión expiró. Inicia sesión nuevamente.' :
      respuesta.status === 403 ? 'No tienes permiso para acceder a Titulaciones.' :
        `No se pudo completar la operación (${respuesta.status}).`;
    throw new Error(mensajeDeError(json, defecto));
  }
  return json as T;
}

export async function obtenerResumenT(token: string): Promise<ResumenT> {
  return consultar<ResumenT>(token, '/resumen');
}
export async function buscarEstudiantesT(token: string, buscar = ''): Promise<EstudianteT[]> {
  const respuesta = await consultar<{estudiantes: EstudianteT[]}>(token,
    `/estudiantes?buscar=${encodeURIComponent(buscar.trim())}`);
  return respuesta.estudiantes;
}
export async function guardarEstudianteT(token: string, datos: NuevoEstudianteT): Promise<{id:string; mensaje:string}> {
  return consultar(token, '/estudiantes', { method: 'POST', body: JSON.stringify(datos) });
}
export async function listarActasT(token: string, opciones: {
  buscar?: string; estado?: string; pagina?: number; limite?: number;
} = {}): Promise<{actas:ActaT[]; pagina:number; limite:number}> {
  const params = new URLSearchParams({
    buscar: opciones.buscar?.trim() ?? '', estado: opciones.estado ?? '',
    pagina: String(opciones.pagina ?? 1), limite: String(opciones.limite ?? 25),
  });
  return consultar(token, `/actas?${params.toString()}`);
}
export async function obtenerActaT(token: string, id: string): Promise<ActaT> {
  const r = await consultar<{acta:ActaT}>(token, `/actas/${encodeURIComponent(id)}`);
  return r.acta;
}
export async function guardarActaT(token: string, datos: DatosActaT, id?: string): Promise<{mensaje:string;id:string;estado?:string}> {
  return consultar(token, id ? `/actas/${encodeURIComponent(id)}` : '/actas', {
    method: id ? 'PUT' : 'POST', body: JSON.stringify(datos),
  });
}
export async function resolverActaT(token: string, id: string, estado: 'aprobada'|'rechazada', observaciones: string): Promise<void> {
  await consultar(token, `/actas/${encodeURIComponent(id)}/estado`, {
    method: 'PATCH', body: JSON.stringify({estado, observaciones:observaciones.trim() || null}),
  });
}
export async function subirDocumentoActaT(token: string, id: string, archivo: File): Promise<void> {
  const cuerpo = new FormData(); cuerpo.append('archivo', archivo);
  await consultar(token, `/actas/${encodeURIComponent(id)}/documento`, { method:'POST', body:cuerpo });
}
export async function descargarDocumentoActaT(token: string, id: string, numero: string): Promise<void> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}/actas/${encodeURIComponent(id)}/documento`, {
      headers:{Authorization:`Bearer ${token}`}, cache:'no-store',
    });
  } catch { throw new Error('No se pudo conectar para descargar el PDF.'); }
  if (!respuesta.ok) {
    const datos: unknown = await respuesta.json().catch(() => null);
    throw new Error(mensajeDeError(datos, `No fue posible descargar el acta (${respuesta.status}).`));
  }
  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  try {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${numero.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,80) || `acta-${id}`}.pdf`;
    document.body.appendChild(enlace); enlace.click(); enlace.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1200); }
}
