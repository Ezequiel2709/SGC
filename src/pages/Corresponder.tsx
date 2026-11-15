
import { useState } from 'react';

type TipoDocumento = 'recibida' | 'expedida';

type Documento = {
  id: number;
  codigo: string;
  tipo: TipoDocumento;
  referencia: string;
  remitente: string;
  destinatario: string;
  fecha: string;
  estado: string;
};

const documentosEjemplo: Documento[] = [
  {
    id: 1,
    codigo: 'REC-2026-001',
    tipo: 'recibida',
    referencia: 'Solicitud de informe académico',
    remitente: 'Secretaría General',
    destinatario: 'Dirección de Carrera',
    fecha: '2026-11-10',
    estado: 'recibido',
  },
  {
    id: 2,
    codigo: 'EXP-2026-001',
    tipo: 'expedida',
    referencia: 'Respuesta a solicitud de informe',
    remitente: 'Dirección de Carrera',
    destinatario: 'Secretaría General',
    fecha: '2026-11-12',
    estado: 'entregado',
  },
  {
    id: 3,
    codigo: 'REC-2026-002',
    tipo: 'recibida',
    referencia: 'Solicitud de documentación',
    remitente: 'Decanato',
    destinatario: 'Dirección de Carrera',
    fecha: '2026-11-13',
    estado: 'pendiente',
  },
];

export default function Correspondencia() {
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const documentosFiltrados = documentosEjemplo.filter(
    (documento) => {
      const coincideBusqueda =
        documento.referencia
          .toLowerCase()
          .includes(busqueda.toLowerCase()) ||
        documento.codigo
          .toLowerCase()
          .includes(busqueda.toLowerCase()) ||
        documento.remitente
          .toLowerCase()
          .includes(busqueda.toLowerCase());

      const coincideTipo =
        filtroTipo === 'todos' ||
        documento.tipo === filtroTipo;

      return coincideBusqueda && coincideTipo;
    }
  );

  return (
    <section className="sgc-correspondencia">
      <div className="sgc-pagina-encabezado">
        <div>
          <h2>Gestión de Correspondencia</h2>
          <p>
            Consulta y seguimiento de documentos recibidos
            y expedidos de la Dirección de Carrera.
          </p>
        </div>
      </div>

      <div className="sgc-aviso">
        <strong>Vista de demostración</strong>
        <p>
          Los documentos mostrados son ficticios.
          Todavía no están conectados a PostgreSQL.
        </p>
      </div>

      <div className="sgc-filtros">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) =>
            setBusqueda(evento.target.value)
          }
          placeholder="Buscar por referencia, código o remitente..."
          aria-label="Buscar documentos"
        />

        <select
          value={filtroTipo}
          onChange={(evento) =>
            setFiltroTipo(evento.target.value)
          }
          aria-label="Filtrar por tipo de documento"
        >
          <option value="todos">Todos los documentos</option>
          <option value="recibida">Recibidos</option>
          <option value="expedida">Expedidos</option>
        </select>
      </div>

      <div className="sgc-tabla-contenedor">
        <table className="sgc-tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th>Referencia</th>
              <th>Tipo</th>
              <th>Remitente</th>
              <th>Fecha</th>
              <th>Estado</th>
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
                  <td>
                    <span className="sgc-estado">
                      {documento.estado.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  No se encontraron documentos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
