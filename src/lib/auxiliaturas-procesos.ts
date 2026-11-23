/** Cliente de procesos de Auxiliaturas (etapas 2–5). Sesión solo en memoria. */
import { API_URL } from './api';
import type { Convocatoria } from './auxiliaturas';

export type EstudianteAux = {
  id: string; ci: string; registro_universitario: string;
  nombres: string; apellidos: string; correo: string | null; telefono: string | null; activo: boolean;
};
export type PostulacionAux = {
  id: string; convocatoria_id: string; estudiante_id: string; estado: string;
  observaciones: string | null; fecha_postulacion: string;
  ci: string; registro_universitario: string; nombres: string; apellidos: string;
  documentos_cantidad: number; criterios_configurados: number; criterios_calificados: number;
  puntaje_total: string | null; resultado: 'seleccionado' | 'no_seleccionado' | null;
};
export type DocumentoAux = {
  id: string; tipo_documento: string; nombre_archivo: string; estado: string; observaciones: string | null;
  fecha_entrega: string;
};
export type RequisitoVerificacion = {
  requisito_id: string; descripcion: string; obligatorio: boolean;
  cumple: boolean | null; observaciones: string | null;
};
export type CriterioAux = {
  id: string; codigo: string; nombre: string; puntaje_maximo: string; orden: number;
};
export type EvaluadorAux = {
  id: string; nombre_docente: string; codigo_docente: string | null;
  tipo: 'titular' | 'invitado'; orden: number;
};
export type PuntajeAux = {
  criterio_id: string; codigo: string; nombre: string; puntaje_maximo: string;
  puntaje: string | null; observaciones: string | null; orden: number;
};
export type ResultadoAux = {
  postulacion_id: string; estado: string; nombres: string; apellidos: string;
  registro_universitario: string; criterios_configurados: number;
  criterios_calificados: number; puntaje_total: string | null;
  decision: 'seleccionado' | 'no_seleccionado' | null;
  observaciones: string | null; resultados_publicados: boolean; cupos: number;
};

async function solicitar<T>(token: string, ruta: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}/api/auxiliaturas/${ruta}`, {
    ...init,
    headers: { Authorization:`Bearer ${token}`, ...(init.body ? {'Content-Type':'application/json'} : {}), ...init.headers },
  });
  const data: unknown = await response.json().catch(()=>null);
  if (!response.ok) {
    const mensaje = data && typeof data==='object' && 'mensaje' in data && typeof data.mensaje==='string'
      ? data.mensaje : `Error del servidor (${response.status}).`;
    throw new Error(mensaje);
  }
  return data as T;
}
function json(method: string, datos: unknown): RequestInit { return { method, body: JSON.stringify(datos) }; }
export async function listarConvocatoriasProceso(token: string): Promise<Convocatoria[]> {
  const r = await solicitar<{convocatorias: Convocatoria[]}>(token, 'convocatorias?limite=100');
  return r.convocatorias;
}
export async function cambiarEstadoConv(token:string,id:string,estado:string) {
  return solicitar<{mensaje:string}>(token,`convocatorias/${encodeURIComponent(id)}/estado`,json('PATCH',{estado}));
}
export async function buscarEstudiantesAux(token:string,buscar:string) {
  const r=await solicitar<{estudiantes:EstudianteAux[]}>(token,`estudiantes?buscar=${encodeURIComponent(buscar)}`);
  return r.estudiantes;
}
export async function crearEstudianteAux(token:string,d:Record<string,string>) {
  return solicitar<{mensaje:string;id:string}>(token,'estudiantes',json('POST',d));
}
export async function listarPostulacionesAux(token:string,conv:string) {
  const r=await solicitar<{postulaciones:PostulacionAux[]}>(token,`postulaciones?convocatoria_id=${encodeURIComponent(conv)}`);
  return r.postulaciones;
}
export async function registrarPostulacionAux(token:string,conv:string,est:string,observaciones:string) {
  return solicitar<{mensaje:string;id:string}>(token,'postulaciones',json('POST',{
    convocatoria_id:conv,estudiante_id:est,observaciones,
  }));
}
export async function listarDocumentosAux(token:string,post:string) {
  const r=await solicitar<{documentos:DocumentoAux[]}>(token,`postulaciones/${encodeURIComponent(post)}/documentos`);
  return r.documentos;
}
export async function subirDocumentoAux(token:string,post:string,tipo:string,archivo:File) {
  const form=new FormData();form.append('tipo_documento',tipo);form.append('archivo',archivo);
  const response=await fetch(`${API_URL}/api/auxiliaturas/postulaciones/${encodeURIComponent(post)}/documentos`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`},body:form,
  });
  const data:unknown=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(data && typeof data==='object' && 'mensaje' in data &&
    typeof data.mensaje==='string' ? data.mensaje : 'No se pudo cargar el archivo.');
}
export async function revisarDocumentoAux(token:string,id:string,estado:string,observaciones:string|null) {
  return solicitar<{mensaje:string}>(token,`documentos/${encodeURIComponent(id)}/estado`,
    json('PATCH',{estado,observaciones}));
}
export async function descargarDocumentoAux(token:string,id:string,nombre:string) {
  const r=await fetch(`${API_URL}/api/auxiliaturas/documentos/${encodeURIComponent(id)}/descargar`,{
    headers:{Authorization:`Bearer ${token}`},
  });
  if(!r.ok) throw new Error(`No se pudo descargar el documento (${r.status}).`);
  const blob=await r.blob();const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=nombre;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}
export async function consultarRequisitosAux(token:string,post:string) {
  const r=await solicitar<{requisitos:RequisitoVerificacion[]}>(token,`postulaciones/${encodeURIComponent(post)}/requisitos`);
  return r.requisitos;
}
export async function guardarRequisitosAux(token:string,post:string,estado:string,verificaciones:RequisitoVerificacion[]) {
  return solicitar<{mensaje:string}>(token,`postulaciones/${encodeURIComponent(post)}/requisitos`,json('PUT',{
    estado,verificaciones:verificaciones.map(r=>({requisito_id:r.requisito_id,cumple:r.cumple,observaciones:r.observaciones})),
  }));
}
export async function consultarCriteriosAux(token:string,conv:string) {
  const r=await solicitar<{criterios:CriterioAux[]}>(token,`convocatorias/${encodeURIComponent(conv)}/criterios`);
  return r.criterios;
}
export async function guardarCriteriosAux(token:string,conv:string,criterios:{codigo:string;nombre:string;puntaje_maximo:number}[]) {
  return solicitar<{mensaje:string}>(token,`convocatorias/${encodeURIComponent(conv)}/criterios`,json('PUT',{criterios}));
}
export async function consultarEvaluadoresAux(token:string,conv:string) {
  const r=await solicitar<{evaluadores:EvaluadorAux[]}>(token,`convocatorias/${encodeURIComponent(conv)}/evaluadores`);
  return r.evaluadores;
}
export async function guardarEvaluadoresAux(token:string,conv:string,evaluadores:{nombre_docente:string;codigo_docente:string|null;tipo:'titular'|'invitado'}[]) {
  return solicitar<{mensaje:string}>(token,`convocatorias/${encodeURIComponent(conv)}/evaluadores`,json('PUT',{evaluadores}));
}
export async function consultarPuntajesAux(token:string,post:string) {
  const r=await solicitar<{evaluaciones:PuntajeAux[]}>(token,`postulaciones/${encodeURIComponent(post)}/evaluaciones`);
  return r.evaluaciones;
}
export async function guardarPuntajesAux(token:string,post:string,evaluaciones:{criterio_id:string;puntaje:number|null;observaciones:string|null}[]) {
  return solicitar<{mensaje:string;listo:boolean;puntaje_total:string|null}>(token,
    `postulaciones/${encodeURIComponent(post)}/evaluaciones`,json('PUT',{evaluaciones}));
}
export async function consultarResultadosAux(token:string,conv:string) {
  const r=await solicitar<{resultados:ResultadoAux[]}>(token,`convocatorias/${encodeURIComponent(conv)}/resultados`);
  return r.resultados;
}
export async function registrarResultadoAux(token:string,post:string,decision:'seleccionado'|'no_seleccionado',observaciones:string) {
  return solicitar<{mensaje:string}>(token,`postulaciones/${encodeURIComponent(post)}/resultado`,json('PUT',{decision,observaciones}));
}
export async function publicarResultadosAux(token:string,conv:string) {
  return solicitar<{mensaje:string}>(token,`convocatorias/${encodeURIComponent(conv)}/publicar-resultados`,{method:'POST'});
}
