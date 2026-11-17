
import { useEffect, useState } from 'react';
import { obtenerCorrespondencia } from '../lib/backend';
import FormularioCorrespondencia from '../components/FormularioCorrespondencia';
import CambiarEstadoCorrespondencia from '../components/CambiarEstadoCorrespondencia';
import DetalleCorrespondencia from '../components/DetalleCorrespondencia';

type TipoDocumento = 'recibida' | 'expedida';

type Documento = {
  id: string;
  codigo: string;
  tipo: TipoDocumento;
  referencia: string;
  remitente: string;
  destinatario: string;
  fecha: string;
  estado: string;
  gestion: number | null;
  descripcion: string;
  fechaRecepcion: string;
  fechaLimite: string;
  fechaSalida: string;
  fechaEntrega: string;
  tieneArchivo: boolean;
  tieneConstancia: boolean;
};

type CorrespondenciaProps = {
  token: string;
};

function esObjeto(
  valor: unknown
): valor is Record<string, unknown> {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor)
  );
}

function obtenerTexto(
  valor: unknown,
  valorAlternativo = ''
): string {
  if (typeof valor === 'string') {
    return valor;
  }

  if (typeof valor === 'number') {
    return String(valor);
  }

  return valorAlternativo;
}

function formatearFecha(valor: unknown): string {
  if (typeof valor !== 'string' || !valor) {
    return 'Sin fecha';
  }

  return valor.slice(0, 10);
}

function normalizarDocumento(
  valor: unknown
): Documento {
  if (!esObjeto(valor)) {
    throw new Error(
      'El backend devolvió un documento inválido.'
    );
  }

  const tipo = obtenerTexto(valor.tipo);

  if (tipo !== 'recibida' && tipo !== 'expedida') {
    throw new Error(
      'El backend devolvió un tipo de documento desconocido.'
    );
  }

  return {
    id: obtenerTexto(valor.id),
    codigo: obtenerTexto(valor.codigo) ||
      (tipo === 'expedida' && typeof valor.gestion === 'number' && typeof valor.numero_correlativo === 'number'
        ? `EXP-${valor.gestion}-${String(valor.numero_correlativo).padStart(3, '0')}`
        : 'Sin código'),
    tipo,
    referencia: obtenerTexto(
      valor.asunto ?? valor.referencia,
      'Sin asunto'
    ),
    remitente: obtenerTexto(
      valor.remitente,
      'Sin remitente'
    ),
    destinatario: obtenerTexto(
      valor.destinatario,
      'Sin destinatario'
    ),
    fecha: formatearFecha(
      valor.fecha_documento ?? valor.fecha
    ),
    estado: obtenerTexto(valor.estado, 'Sin estado'),
    gestion: typeof valor.gestion === 'number' ? valor.gestion : null,
    descripcion: obtenerTexto(valor.descripcion),
    fechaRecepcion: obtenerTexto(valor.fecha_recepcion),
    fechaLimite: obtenerTexto(valor.fecha_limite),
    fechaSalida: obtenerTexto(valor.fecha_salida),
    fechaEntrega: obtenerTexto(valor.fecha_entrega),
    tieneArchivo: !!valor.archivo_path,
    tieneConstancia: !!valor.archivo_constancia_path,
  };
}

function extraerDocumentos(
  respuesta: unknown
): Documento[] {
  let registros: unknown;

  if (Array.isArray(respuesta)) {
    registros = respuesta;
  } else if (esObjeto(respuesta)) {
    registros =
      respuesta.documentos ??
      respuesta.correspondencias ??
      respuesta.registros ??
      respuesta.data;
  }

  if (!Array.isArray(registros)) {
    throw new Error(
      'La API devolvió un formato inesperado. ' +
      'Debemos revisar la ruta GET de Correspondencia.'
    );
  }

  return registros.map(normalizarDocumento);
}

export default function Correspondencia({
  token,
}: CorrespondenciaProps) {
  const [documentos, setDocumentos] =
    useState<Documento[]>([]);

  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroGestion, setFiltroGestion] = useState('todos');

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarFormulario, setMostrarFormulario] =
    useState(false);

  const [documentoSeleccionado, setDocumentoSeleccionado] =
    useState<Documento | null>(null);

  const [actualizacion, setActualizacion] = useState(0);
  const [detalleSeleccionadoId, setDetalleSeleccionadoId] = useState<string | null>(null);
  const detalleSeleccionado = documentos.find(d => d.id === detalleSeleccionadoId) ?? null;
  const gestiones = [...new Set(documentos.map(d => d.gestion).filter((g): g is number => g !== null))].sort((a,b) => b-a);
  const estados = [...new Set(documentos.map(d => d.estado))].sort();

  // Consultar los documentos cuando se abre el módulo
  // o cuando se registra un cambio.
  useEffect(() => {
    let activo = true;

    async function cargarDocumentos() {
      setCargando(true);
      setError('');

      try {
        const respuesta =
          await obtenerCorrespondencia(token);

        const registros =
          extraerDocumentos(respuesta);

        if (activo) {
          setDocumentos(registros);
        }
      } catch (err) {
        if (activo) {
          setDocumentos([]);

          setError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar los documentos.'
          );
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    void cargarDocumentos();

    return () => {
      activo = false;
    };
  }, [token, actualizacion]);

  // Buscar y filtrar los registros recibidos.
  const documentosFiltrados = documentos.filter(
    (documento) => {
      const texto = busqueda.trim().toLowerCase();

      const coincideBusqueda =
        documento.referencia
          .toLowerCase()
          .includes(texto) ||
        documento.codigo
          .toLowerCase()
          .includes(texto) ||
        documento.remitente
          .toLowerCase()
          .includes(texto);

      const coincideTipo =
        filtroTipo === 'todos' ||
        documento.tipo === filtroTipo;

      const coincideEstado = filtroEstado === 'todos' || documento.estado === filtroEstado;
      const coincideGestion = filtroGestion === 'todos' || String(documento.gestion) === filtroGestion;
      return coincideBusqueda && coincideTipo && coincideEstado && coincideGestion;
    }
  );

  function actualizarTabla() {
    setActualizacion((anterior) => anterior + 1);
  }

  return (
    <section className="sgc-correspondencia">
      <div className="sgc-pagina-encabezado">
        <h2>Gestión de Correspondencia</h2>

        <p>
          Consulta y seguimiento de documentos recibidos
          y expedidos de la Dirección de Carrera.
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          type="button"
          className="sgc-btn-principal"
          onClick={() => {
            setDocumentoSeleccionado(null);
            setMostrarFormulario(true);
          }}
          disabled={mostrarFormulario}
        >
          + Nuevo documento
        </button>
      </div>

      {mostrarFormulario && (
        <FormularioCorrespondencia
          token={token}
          alGuardar={() => {
            setMostrarFormulario(false);
            actualizarTabla();
          }}
          alCancelar={() =>
            setMostrarFormulario(false)
          }
        />
      )}

      {documentoSeleccionado && (
        <CambiarEstadoCorrespondencia
          key={`${documentoSeleccionado.id}-${documentoSeleccionado.estado}`}
          token={token}
          documentoId={documentoSeleccionado.id}
          referencia={documentoSeleccionado.referencia}
          estadoActual={documentoSeleccionado.estado}
          alGuardar={() => {
            setDocumentoSeleccionado(null);
            actualizarTabla();
          }}
          alCancelar={() =>
            setDocumentoSeleccionado(null)
          }
        />
      )}

      {detalleSeleccionado && (
        <DetalleCorrespondencia
          key={detalleSeleccionado.id}
          token={token}
          documento={detalleSeleccionado}
          documentos={documentos}
          alCerrar={() => setDetalleSeleccionadoId(null)}
          alActualizar={actualizarTabla}
        />
      )}

      {cargando && (
        <div className="sgc-aviso" role="status">
          Cargando documentos desde PostgreSQL...
        </div>
      )}

      {error && (
        <div className="sgc-aviso" role="alert">
          <strong>
            Error al consultar Correspondencia
          </strong>
          <p>{error}</p>
        </div>
      )}

      {!cargando && !error && (
        <>
          <div className="sgc-aviso">
            <strong>Correspondencia</strong>
            <p>
              Se recibieron {documentos.length} documentos
              desde el backend.
            </p>
          </div>

          <div className="sgc-filtros">
            <input
              type="search"
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
              placeholder="Buscar por asunto, código o remitente..."
              aria-label="Buscar documentos"
            />

            <select
              value={filtroTipo}
              onChange={(evento) =>
                setFiltroTipo(evento.target.value)
              }
              aria-label="Filtrar por tipo de documento"
            >
              <option value="todos">
                Todos los documentos
              </option>

              <option value="recibida">
                Recibidos
              </option>

              <option value="expedida">
                Expedidos
              </option>
            </select>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado">
              <option value="todos">Todos los estados</option>
              {estados.map(estado => <option key={estado} value={estado}>{estado.replaceAll('_', ' ')}</option>)}
            </select>
            <select value={filtroGestion} onChange={e => setFiltroGestion(e.target.value)} aria-label="Filtrar por gestión">
              <option value="todos">Todas las gestiones</option>
              {gestiones.map(gestion => <option key={gestion} value={gestion}>{gestion}</option>)}
            </select>
          </div>

          <div className="sgc-tabla-contenedor">
            <table className="sgc-tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Asunto</th>
                  <th>Tipo</th>
                  <th>Remitente</th>
                  <th>Fecha</th>
                  <th>Gestión</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {documentosFiltrados.length > 0 ? (
                  documentosFiltrados.map((documento) => (
                    <tr key={documento.id}>
                      <td>{documento.codigo}</td>

                      <td>{documento.referencia}</td>

                      <td>
                        {documento.tipo === 'recibida'
                          ? 'Recibido'
                          : 'Expedido'}
                      </td>

                      <td>{documento.remitente}</td>

                      <td>{documento.fecha}</td>
                      <td>{documento.gestion ?? '—'}</td>

                      <td>
                        <span className="sgc-estado">
                          {documento.estado.replaceAll(
                            '_',
                            ' '
                          )}
                        </span>
                      </td>

                      <td>
                        <button type="button" onClick={() => {
                          setDetalleSeleccionadoId(documento.id);
                          setDocumentoSeleccionado(null);
                          setMostrarFormulario(false);
                        }}>Ver detalle</button>{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setDetalleSeleccionadoId(null);
                            setMostrarFormulario(false);
                            setDocumentoSeleccionado(
                              documento
                            );
                          }}
                          disabled={
                            documentoSeleccionado?.id ===
                            documento.id
                          }
                        >
                          Cambiar estado
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      No se encontraron documentos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
