
import { API_URL } from './api';

// Comprobar conexión con el backend
export async function probarBackend() {
  const respuesta = await fetch(`${API_URL}/api/health`);

  if (!respuesta.ok) {
    throw new Error('No se pudo conectar con el backend');
  }

  return respuesta.json();
}

// Tipo de usuario del sistema
export type Usuario = {
  id: number;
  nombre_completo: string;
  correo: string;
  rol: 'directora' | 'secretaria' | 'docente';
};

// Respuesta del inicio de sesión
export type RespuestaLogin = {
  mensaje: string;
  token: string;
  usuario: Usuario;
};

// Iniciar sesión
export async function iniciarSesion(
  correo: string,
  password: string
): Promise<RespuestaLogin> {
  const respuesta = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ correo, password }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(
      datos.mensaje || 'No se pudo iniciar sesión.'
    );
  }

  return datos as RespuestaLogin;
}

// Obtener documentos de Correspondencia
export async function obtenerCorrespondencia(
  token: string
): Promise<unknown> {
  const respuesta = await fetch(
    `${API_URL}/api/correspondencia`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!respuesta.ok) {
    if (respuesta.status === 401) {
      const datos = await respuesta.json();

      throw new Error(
        datos.mensaje || 'Error de autenticación.'
      );
    }

    if (respuesta.status === 403) {
      throw new Error(
        'No tienes permisos para consultar Correspondencia.'
      );
    }

    throw new Error(
      'No se pudieron obtener los documentos de Correspondencia.'
    );
  }
  

  return respuesta.json();
}

export type NuevoDocumento = {
  tipo: 'recibida' | 'expedida';
  remitente: string;
  destinatario: string;
  referencia: string;
  descripcion?: string;
  fecha_documento?: string;
  fecha_recepcion?: string;
  fecha_limite?: string;
  gestion?: number;
};

export type ResultadoRegistro = {
  mensaje: string;
  codigo: string | null;
  documento: Record<string, unknown>;
};

export async function registrarCorrespondencia(
  token: string,
  documento: NuevoDocumento
): Promise<ResultadoRegistro> {
  const respuesta = await fetch(
    `${API_URL}/api/correspondencia`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(documento),
    }
  );

  const datos: unknown = await respuesta.json();

  if (!respuesta.ok) {
    let mensaje = 'No se pudo registrar el documento.';

    if (
      typeof datos === 'object' &&
      datos !== null &&
      'mensaje' in datos &&
      typeof datos.mensaje === 'string'
    ) {
      mensaje = datos.mensaje;
    }

    throw new Error(mensaje);
  }

  return datos as ResultadoRegistro;
}

export type DatosCambioEstado = {
  estado: string;
  comentario?: string;
  fecha_salida?: string;
};

export type ResultadoCambioEstado = {
  mensaje: string;
  documento: Record<string, unknown>;
};

export async function cambiarEstadoCorrespondencia(
  token: string,
  documentoId: string,
  datos: DatosCambioEstado
): Promise<ResultadoCambioEstado> {
  const respuesta = await fetch(
    `${API_URL}/api/correspondencia/${encodeURIComponent(documentoId)}/estado`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(datos),
    }
  );

  const resultado: unknown = await respuesta.json();

  if (!respuesta.ok) {
    if (
      typeof resultado === 'object' &&
      resultado !== null &&
      'mensaje' in resultado &&
      typeof resultado.mensaje === 'string'
    ) {
      throw new Error(resultado.mensaje);
    }

    throw new Error(
      'No se pudo actualizar el estado del documento.'
    );
  }

  return resultado as ResultadoCambioEstado;
}

// Operaciones adicionales del módulo de Correspondencia.
async function respuestaCorrespondencia(respuesta: Response): Promise<unknown> {
  const datos: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    if (datos && typeof datos === 'object' && 'mensaje' in datos && typeof datos.mensaje === 'string') {
      throw new Error(datos.mensaje);
    }
    throw new Error(`Error del servidor (${respuesta.status}).`);
  }
  return datos;
}

function rutaDocumento(id: string, operacion: string) {
  if (!/^\d+$/.test(id)) throw new Error('Identificador de documento inválido.');
  return `${API_URL}/api/correspondencia/${id}/${operacion}`;
}

export type MovimientoCorrespondencia = {
  id: number;
  estado_anterior: string;
  estado_nuevo: string;
  comentario: string | null;
  fecha_seguimiento: string;
  realizado_por: string;
};

export type RelacionCorrespondencia = {
  id: number;
  referencia: string;
  tipo: 'recibida' | 'expedida';
  estado: string;
  gestion: number;
  numero_correlativo: number | null;
};

export async function consultarHistorial(token: string, id: string): Promise<MovimientoCorrespondencia[]> {
  const respuesta = await fetch(rutaDocumento(id, 'historial'), { headers: { Authorization: `Bearer ${token}` } });
  const datos = await respuestaCorrespondencia(respuesta) as { historial: MovimientoCorrespondencia[] };
  return datos.historial;
}

export async function consultarRelaciones(token: string, id: string): Promise<RelacionCorrespondencia[]> {
  const respuesta = await fetch(rutaDocumento(id, 'respuestas'), { headers: { Authorization: `Bearer ${token}` } });
  const datos = await respuestaCorrespondencia(respuesta) as { relacionados: RelacionCorrespondencia[] };
  return datos.relacionados;
}

export async function vincularRespuesta(token: string, id: string, idRespuesta: number): Promise<void> {
  const respuesta = await fetch(rutaDocumento(id, 'respuesta'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ documento_respuesta_id: idRespuesta }),
  });
  await respuestaCorrespondencia(respuesta);
}

export async function adjuntarOficio(token: string, id: string, archivo: File): Promise<void> {
  const cuerpo = new FormData();
  cuerpo.append('archivo', archivo);
  const respuesta = await fetch(rutaDocumento(id, 'archivo'), {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: cuerpo,
  });
  await respuestaCorrespondencia(respuesta);
}

export async function registrarConstancia(
  token: string, id: string,
  datos: { archivo: File; fecha_entrega: string; tipo_constancia: 'sello' | 'firma' }
): Promise<void> {
  const cuerpo = new FormData();
  cuerpo.append('archivo', datos.archivo);
  cuerpo.append('fecha_entrega', datos.fecha_entrega);
  cuerpo.append('tipo_constancia', datos.tipo_constancia);
  const respuesta = await fetch(rutaDocumento(id, 'constancia'), {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: cuerpo,
  });
  await respuestaCorrespondencia(respuesta);
}

export async function descargarAdjunto(
  token: string, id: string, tipo: 'archivo' | 'constancia'
): Promise<void> {
  const respuesta = await fetch(rutaDocumento(id, tipo), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    await respuestaCorrespondencia(respuesta);
    return;
  }
  const blob = await respuesta.blob();
  const tipoMime = respuesta.headers.get('content-type') || blob.type;
  const ext = tipoMime.includes('pdf') ? 'pdf' : tipoMime.includes('png') ? 'png' : 'jpg';
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${tipo === 'archivo' ? 'oficio' : 'constancia'}-${id}.${ext}`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Vista previa autenticada: no expone el token JWT en una URL pública.
export async function obtenerVistaPreviaAdjunto(
  token: string, id: string, tipo: 'archivo' | 'constancia'
): Promise<{ url: string; mime: string }> {
  const respuesta = await fetch(rutaDocumento(id, tipo), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    await respuestaCorrespondencia(respuesta);
    throw new Error('No se pudo abrir la vista previa.');
  }
  const blob = await respuesta.blob();
  return { url: URL.createObjectURL(blob), mime: blob.type };
}
