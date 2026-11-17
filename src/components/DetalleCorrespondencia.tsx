import { useEffect, useState, type FormEvent } from 'react';
import {
  adjuntarOficio, consultarHistorial, consultarRelaciones,
  descargarAdjunto, obtenerVistaPreviaAdjunto, registrarConstancia, vincularRespuesta,
  type MovimientoCorrespondencia, type RelacionCorrespondencia,
} from '../lib/backend';

type Documento = {
  id: string;
  tipo: 'recibida' | 'expedida';
  referencia: string;
  remitente: string;
  destinatario: string;
  estado: string;
  gestion: number | null;
  codigo: string;
  descripcion: string;
  fecha: string;
  fechaRecepcion: string;
  fechaLimite: string;
  fechaSalida: string;
  fechaEntrega: string;
  tieneArchivo: boolean;
  tieneConstancia: boolean;
};

type Props = {
  token: string;
  documento: Documento;
  documentos: { id: string; tipo: 'recibida' | 'expedida'; referencia: string; codigo: string }[];
  alCerrar: () => void;
  alActualizar: () => void;
};

const estiloSeccion = { border: '1px solid #d9dfe7', borderRadius: 10, padding: 16, marginTop: 14 };
const MAX_BYTES = 5 * 1024 * 1024;
function validarArchivo(archivo: File | null): string | null {
  if (!archivo) return 'Selecciona un archivo.';
  if (archivo.size > MAX_BYTES) return 'El archivo supera los 5 MB.';
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(archivo.type)) return 'Se permite PDF, JPG o PNG.';
  return null;
}
function fechaCorta(valor: string) { return valor ? valor.slice(0, 10) : 'Sin registrar'; }

export default function DetalleCorrespondencia({ token, documento, documentos, alCerrar, alActualizar }: Props) {
  const [historial, setHistorial] = useState<MovimientoCorrespondencia[]>([]);
  const [relaciones, setRelaciones] = useState<RelacionCorrespondencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [constancia, setConstancia] = useState<File | null>(null);
  const [tipoConstancia, setTipoConstancia] = useState<'firma' | 'sello'>('firma');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [idRespuesta, setIdRespuesta] = useState('');
  const [revision, setRevision] = useState(0);
  const [vistaPrevia, setVistaPrevia] = useState<{ url: string; mime: string } | null>(null);
  useEffect(() => () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia.url); }, [vistaPrevia]);
  async function previsualizar(tipo: 'archivo' | 'constancia') {
    setError('');
    try { setVistaPrevia(await obtenerVistaPreviaAdjunto(token, documento.id, tipo)); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo obtener el archivo.'); }
  }

  useEffect(() => {
    let activo = true;
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const [movimientos, vinculados] = await Promise.all([
          consultarHistorial(token, documento.id), consultarRelaciones(token, documento.id),
        ]);
        if (activo) { setHistorial(movimientos); setRelaciones(vinculados); }
      } catch (err) {
        if (activo) setError(err instanceof Error ? err.message : 'Error al consultar datos del documento.');
      } finally { if (activo) setCargando(false); }
    }
    void cargar();
    return () => { activo = false; };
  }, [token, documento.id, revision]);

  async function ejecutar(accion: () => Promise<void>, mensaje: string) {
    if (trabajando) return;
    setTrabajando(true);
    setError('');
    setAviso('');
    try {
      await accion();
      setAviso(mensaje);
      setRevision((n) => n + 1);
      alActualizar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
    } finally { setTrabajando(false); }
  }

  function subirArchivo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problema = validarArchivo(archivo);
    if (problema) { setError(problema); return; }
    if (!archivo) return;
    void ejecutar(() => adjuntarOficio(token, documento.id, archivo), 'Oficio adjuntado correctamente.');
  }
  function subirConstancia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problema = validarArchivo(constancia);
    if (problema) { setError(problema); return; }
    if (!fechaEntrega) { setError('Indica la fecha de entrega.'); return; }
    if (!constancia) return;
    void ejecutar(() => registrarConstancia(token, documento.id, {
      archivo: constancia, fecha_entrega: fechaEntrega, tipo_constancia: tipoConstancia,
    }), 'Constancia registrada; documento marcado como entregado.');
  }
  const opcionesRespuesta = documentos.filter((d) => d.tipo === 'expedida' && d.id !== documento.id);

  return (
    <section className="sgc-modulo-destacado" style={{ display: 'block', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h3>Detalle de correspondencia · #{documento.id}</h3>
        <button type="button" onClick={alCerrar}>Cerrar detalle</button>
      </div>
      <div style={estiloSeccion}>
        <p><strong>Referencia:</strong> {documento.referencia}</p>
        <p><strong>Tipo:</strong> {documento.tipo} · <strong>Estado:</strong> {documento.estado.replaceAll('_', ' ')}</p>
        <p><strong>Gestión:</strong> {documento.gestion ?? 'Sin gestión'} · <strong>Código:</strong> {documento.codigo}</p>
        <p><strong>Remitente:</strong> {documento.remitente} · <strong>Destinatario:</strong> {documento.destinatario}</p>
        <p><strong>Descripción:</strong> {documento.descripcion || 'Sin descripción'}</p>
        <p><strong>Fecha del oficio:</strong> {fechaCorta(documento.fecha)} · <strong>Recepción:</strong> {fechaCorta(documento.fechaRecepcion)} · <strong>Límite:</strong> {fechaCorta(documento.fechaLimite)}</p>
        {documento.tipo === 'expedida' && <p><strong>Salida:</strong> {fechaCorta(documento.fechaSalida)} · <strong>Entrega:</strong> {fechaCorta(documento.fechaEntrega)}</p>}
      </div>

      {error && <p role="alert" style={{ color: '#b91c1c', marginTop: 12 }}>{error}</p>}
      {aviso && <p role="status" style={{ color: '#166534', marginTop: 12 }}>{aviso}</p>}

      <div style={estiloSeccion}>
        <h4>Archivo original del oficio</h4>
        {documento.tieneArchivo ? (
          <button type="button" disabled={trabajando} onClick={() => {
            void ejecutar(() => descargarAdjunto(token, documento.id, 'archivo'), 'Descarga iniciada.');
          }}>Descargar oficio</button>
        ) : (
          <form onSubmit={subirArchivo} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
            <button type="submit" disabled={trabajando}>Adjuntar oficio</button>
          </form>
        )}
        {documento.tieneArchivo && <button type="button" onClick={() => void previsualizar('archivo')} style={{ marginLeft: 10 }}>Vista previa del oficio</button>}
        <small style={{ display: 'block', marginTop: 8 }}>Formatos: PDF, JPG o PNG. Máximo 5 MB. No reemplaza archivos ya existentes.</small>
      </div>

      {documento.tipo === 'expedida' && (
        <div style={estiloSeccion}>
          <h4>Constancia de entrega</h4>
          {documento.tieneConstancia ? (
            <button type="button" disabled={trabajando} onClick={() => {
              void ejecutar(() => descargarAdjunto(token, documento.id, 'constancia'), 'Descarga iniciada.');
            }}>Descargar constancia</button>
          ) : documento.estado === 'enviado' ? (
            <form onSubmit={subirConstancia} style={{ display: 'grid', gap: 10, maxWidth: 480 }}>
              <label>Fecha de entrega <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} required /></label>
              <label>Tipo de constancia <select value={tipoConstancia} onChange={(e) => setTipoConstancia(e.target.value as 'firma' | 'sello')}>
                <option value="firma">Firma</option><option value="sello">Sello</option>
              </select></label>
              <label>Comprobante (PDF o imagen) <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setConstancia(e.target.files?.[0] ?? null)} required /></label>
              <button type="submit" disabled={trabajando}>Confirmar entrega</button>
            </form>
          ) : <p>Disponible después de cambiar el estado del oficio a «enviado».</p>}
          {documento.tieneConstancia && <button type="button" onClick={() => void previsualizar('constancia')} style={{ marginLeft: 10 }}>Vista previa de constancia</button>}
        </div>
      )}

      {vistaPrevia && <div style={estiloSeccion}>
        <button type="button" onClick={() => setVistaPrevia(null)}>Cerrar vista previa</button>
        {vistaPrevia.mime.includes('pdf')
          ? <iframe title="Vista previa del archivo" src={vistaPrevia.url} style={{ width: '100%', height: 520, border: 0, marginTop: 10 }} />
          : <img alt="Vista previa del archivo" src={vistaPrevia.url} style={{ width: '100%', maxHeight: 520, objectFit: 'contain', marginTop: 10 }} />}
      </div>}

      <div style={estiloSeccion}>
        <h4>Documentos relacionados</h4>
        {cargando ? <p>Cargando relaciones...</p> : relaciones.length ? (
          <ul>{relaciones.map((r) => <li key={r.id}>#{r.id} · {r.tipo} · {r.referencia} ({r.estado})</li>)}</ul>
        ) : <p>No hay respuestas vinculadas.</p>}
        {documento.tipo === 'recibida' && (
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!idRespuesta) { setError('Selecciona un oficio expedido.'); return; }
            void ejecutar(() => vincularRespuesta(token, documento.id, Number(idRespuesta)), 'Respuesta vinculada.');
          }} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <select value={idRespuesta} onChange={(e) => setIdRespuesta(e.target.value)} required>
              <option value="">Selecciona una respuesta expedida...</option>
              {opcionesRespuesta.map((d) => <option value={d.id} key={d.id}>#{d.id} · {d.codigo} · {d.referencia}</option>)}
            </select>
            <button type="submit" disabled={trabajando || !idRespuesta}>Vincular respuesta</button>
          </form>
        )}
      </div>

      <div style={estiloSeccion}>
        <h4>Historial de estados</h4>
        {cargando ? <p>Cargando historial...</p> : historial.length ? (
          <div style={{ overflowX: 'auto' }}><table className="sgc-tabla"><thead><tr>
            <th>Fecha</th><th>Anterior</th><th>Nuevo</th><th>Responsable</th><th>Comentario</th>
          </tr></thead><tbody>{historial.map((m) => <tr key={m.id}>
            <td>{new Date(m.fecha_seguimiento).toLocaleString('es-BO')}</td>
            <td>{m.estado_anterior}</td><td>{m.estado_nuevo}</td>
            <td>{m.realizado_por}</td><td>{m.comentario || '—'}</td>
          </tr>)}</tbody></table></div>
        ) : <p>Todavía no existen cambios de estado registrados.</p>}
      </div>
    </section>
  );
}
