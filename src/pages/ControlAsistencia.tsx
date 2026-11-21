import { useCallback, useEffect, useState } from 'react';
import {
  fotoControl, listarAsistenciasControl, listarSolicitudesControl, revisarSolicitud,
  type RegistroControl, type SolicitudControl,
} from '../lib/controlAsistencia';
import type { Docente } from '../lib/plantel';
import '../styles/control-asistencia.css';
import ModalDocenteSGC from '../components/ModalDocenteSGC';
import { RefreshCw, Camera, CheckCircle2, XCircle, ClipboardCheck, Clock3 } from 'lucide-react';

type Props = { token: string; docentes: Docente[] };
const origenTexto: Record<string,string> = {
  normal: 'Marcación con foto', correccion: 'Corrección autorizada', justificacion: 'Justificación aprobada',
};

export default function ControlAsistencia({ token, docentes }: Props) {
  const [registros, setRegistros] = useState<RegistroControl[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudControl[]>([]);
  const [docenteId, setDocenteId] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [materia, setMateria] = useState('');
  const [cargando, setCargando] = useState(false);
  const [procesando, setProcesando] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [observaciones, setObservaciones] = useState<Record<string,string>>({});
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  const [tituloFoto, setTituloFoto] = useState('');

  const actualizar = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) setCargando(true);
    try {
      const [a, s] = await Promise.all([
        listarAsistenciasControl(token, docenteId), listarSolicitudesControl(token),
      ]);
      setRegistros(a);
      setSolicitudes(s);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el control de asistencia.');
    } finally { if (mostrarCarga) setCargando(false); }
  }, [token, docenteId]);

  useEffect(() => {
    void actualizar();
    const temporizador = setInterval(() => { void actualizar(false); }, 30_000);
    return () => clearInterval(temporizador);
  }, [actualizar]);
  useEffect(() => () => { if (urlFoto) URL.revokeObjectURL(urlFoto); }, [urlFoto]);

  async function verFoto(registro: RegistroControl) {
    setError('');
    try {
      const url = await fotoControl(token, registro.id);
      setTituloFoto(`${registro.docente_nombre} · ${registro.materia} · ${registro.fecha}`);
      setUrlFoto(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la fotografía.'); }
  }
  async function decidir(solicitud: SolicitudControl, decision: 'aprobada' | 'rechazada') {
    if (procesando) return;
    const nota = (observaciones[solicitud.id] || '').trim();
    if (decision === 'rechazada' && nota.length < 5) {
      setError('Para rechazar, escribe una observación de al menos 5 caracteres.'); return;
    }
    const confirmar = window.confirm(decision === 'aprobada'
      ? `¿Aprobar la ${solicitud.tipo} de ${solicitud.docente_nombre} para ${solicitud.fecha_clase}?`
      : `¿Rechazar la ${solicitud.tipo} de ${solicitud.docente_nombre}?`);
    if (!confirmar) return;
    setProcesando(solicitud.id); setError(''); setMensaje('');
    try {
      setMensaje(await revisarSolicitud(token, solicitud.id, decision, nota));
      await actualizar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo revisar la solicitud.'); }
    finally { setProcesando(''); }
  }

  const filtrados = registros.filter(r => (!fechaDesde || r.fecha >= fechaDesde) &&
    (!fechaHasta || r.fecha <= fechaHasta) && (!materia || r.materia === materia));
  const materias = Array.from(new Set(registros.map(r => r.materia))).sort();
  const pendientes = solicitudes.filter(s => s.estado === 'pendiente');
  const revisadas = solicitudes.filter(s => s.estado !== 'pendiente');

  return <section className="control-asistencia" aria-label="Control de asistencias">
    <div className="control-cabecera">
      <div className="sgc-control-cabecera-titulo"><ClipboardCheck size={23} aria-hidden="true" /><div><h3>Control de asistencia docente</h3><p>Registros y fotografías del personal docente. Se actualiza cada 30 segundos mientras esta pantalla está abierta.</p></div></div>
      <button type="button" className="docente-boton secundario" disabled={cargando || !!procesando}
        onClick={() => void actualizar()}><RefreshCw size={16} aria-hidden="true" /> {cargando ? 'Actualizando…' : 'Actualizar ahora'}</button>
    </div>
    {error && <p className="docente-alerta error" role="alert">{error}</p>}
    {mensaje && <p className="docente-alerta exito" role="status">{mensaje}</p>}
    <div className="control-resumen">
      <div><ClipboardCheck size={19} aria-hidden="true" /><strong>{filtrados.length}</strong><span>registros mostrados</span></div>
      <div><Clock3 size={19} aria-hidden="true" /><strong>{pendientes.length}</strong><span>solicitudes pendientes</span></div>
      <div><Camera size={19} aria-hidden="true" /><strong>{filtrados.filter(x => x.origen_registro === 'normal').length}</strong><span>marcaciones normales</span></div>
    </div>
    <div className="control-encabezado-tabla">
      <h4>Asistencias registradas</h4>
      <label>Filtrar por docente <select value={docenteId} onChange={e => setDocenteId(e.target.value)}>
        <option value="">Todos los docentes</option>
        {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre_completo}</option>)}
      </select></label>
      <label>Materia <select value={materia} onChange={e => setMateria(e.target.value)}>
        <option value="">Todas las materias</option>
        {materias.map(m => <option key={m} value={m}>{m}</option>)}
      </select></label>
      <label>Desde <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} /></label>
      <label>Hasta <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} /></label>
    </div>
    <p className="control-ayuda">Se muestran hasta las 200 asistencias más recientes. Las autorizaciones administrativas aparecen diferenciadas de los marcados con foto.</p>
    <div className="control-tabla-scroll"><table className="sgc-tabla control-tabla">
      <thead><tr><th>Fecha</th><th>Docente</th><th>Materia</th><th>Clase</th><th>Estado / origen</th><th>Evidencia</th></tr></thead>
      <tbody>
        {filtrados.map(r => <tr key={r.id}>
          <td>{r.fecha}</td><td>{r.docente_nombre}</td><td>{r.materia}<small>{r.aula || 'Aula no especificada'}</small></td>
          <td>{r.hora_inicio}</td>
          <td><strong className={`sgc-control-etiqueta ${r.origen_registro === 'normal' ? 'sgc-control-etiqueta-normal' : 'sgc-control-etiqueta-administrativa'}`}>{r.estado}</strong><small>{origenTexto[r.origen_registro] || r.origen_registro || 'Normal'}
            {r.origen_registro === 'normal' ? ` · Marcado ${r.hora_registro}` : ''}</small></td>
          <td>{r.tiene_foto ? <button type="button" className="control-link" onClick={() => void verFoto(r)}><Camera size={15} aria-hidden="true" /> Ver fotografía</button>
            : <span className="control-sin-foto">Sin fotografía {r.origen_registro !== 'normal' ? '(resolución)' : ''}</span>}</td>
        </tr>)}
        {!filtrados.length && <tr><td colSpan={6}>{cargando ? 'Buscando asistencias…' : 'No hay registros para este filtro.'}</td></tr>}
      </tbody>
    </table></div>
    <h4>Solicitudes pendientes de revisión ({pendientes.length})</h4>
    {pendientes.length ? <div className="control-solicitudes">
      {pendientes.map(s => <article className="control-solicitud" key={s.id}>
        <div className="control-solicitud-titulo"><strong>{s.docente_nombre} — {s.materia}</strong><span className="docente-etiqueta habilitado">Pendiente</span></div>
        <p><strong>{s.tipo === 'correccion' ? 'Corrección de asistencia' : 'Justificación de ausencia'}</strong> · {s.fecha_clase} · Inicio {s.hora_inicio}</p>
        <p><strong>Motivo:</strong> {s.motivo}</p><p><strong>Descripción:</strong> {s.descripcion}</p>
        <small>Solicitada: {s.fecha_solicitud}</small>
        <label>Observación de Dirección (obligatoria para rechazo)
          <textarea value={observaciones[s.id] || ''} maxLength={1000} rows={2}
            onChange={e => setObservaciones(prev => ({ ...prev, [s.id]: e.target.value }))}
            placeholder="Ej.: Se verificó el justificativo o falta documentación" /></label>
        <div className="control-acciones">
          <button type="button" className="docente-boton" disabled={!!procesando}
            onClick={() => void decidir(s, 'aprobada')}><CheckCircle2 size={16} aria-hidden="true" /> Aprobar</button>
          <button type="button" className="docente-boton secundario" disabled={!!procesando}
            onClick={() => void decidir(s, 'rechazada')}><XCircle size={16} aria-hidden="true" /> Rechazar</button>
        </div>
      </article>)}
    </div> : <p className="docente-vacio">No hay solicitudes pendientes.</p>}
    <h4>Últimas solicitudes revisadas</h4>
    {revisadas.length ? <div className="control-revisadas">{revisadas.slice(0, 15).map(s =>
      <p key={s.id}><strong>{s.docente_nombre}</strong> · {s.materia} · {s.fecha_clase} · {s.tipo} · <strong>{s.estado}</strong>
        {s.observacion_revision ? ` — ${s.observacion_revision}` : ''}</p>)}</div>
      : <p className="docente-vacio">Todavía no hay solicitudes revisadas.</p>}
    {urlFoto && <ModalDocenteSGC titulo="Evidencia fotográfica" descripcion={tituloFoto}
      ocupado={false} onCerrar={() => setUrlFoto(null)}>
      <div className="sgc-control-visor-foto">
        <img src={urlFoto} alt={`Evidencia fotográfica de ${tituloFoto}`} />
        <div className="sgc-docente-modal-acciones">
          <button type="button" className="sgc-docente-modal-cancelar" onClick={() => setUrlFoto(null)}>Cerrar fotografía</button>
        </div>
      </div>
    </ModalDocenteSGC>}
  </section>;
}
