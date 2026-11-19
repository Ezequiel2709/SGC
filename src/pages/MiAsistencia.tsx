import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  marcarMiEntrada, obtenerMiFoto, obtenerMisAsistencias, obtenerMisClases,
  obtenerMisSolicitudes, enviarMiSolicitud, type MiSolicitud,
  type AsistenciaDocente, type ClaseDocente, type MisClases,
} from '../lib/asistencia';
import '../styles/asistencia-docente.css';

type Props = { token: string; nombreDocente: string };
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TAMANO_MAXIMO = 5 * 1024 * 1024;

export default function MiAsistencia({ token, nombreDocente }: Props) {
  const [datos, setDatos] = useState<MisClases | null>(null);
  const [historial, setHistorial] = useState<AsistenciaDocente[]>([]);
  const [solicitudes, setSolicitudes] = useState<MiSolicitud[]>([]);
  const [claseSolicitud, setClaseSolicitud] = useState('');
  const [fechaSolicitud, setFechaSolicitud] = useState('');
  const [tipoSolicitud, setTipoSolicitud] = useState<'correccion' | 'justificacion'>('correccion');
  const [motivoSolicitud, setMotivoSolicitud] = useState('');
  const [descripcionSolicitud, setDescripcionSolicitud] = useState('');
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [seleccion, setSeleccion] = useState<string>('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [vistaFoto, setVistaFoto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [clases, asistencias, nuevasSolicitudes] = await Promise.all([
        obtenerMisClases(token), obtenerMisAsistencias(token), obtenerMisSolicitudes(token),
      ]);
      setDatos(clases);
      setHistorial(asistencias);
      setSolicitudes(nuevasSolicitudes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos consultar tus horarios.');
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => () => { if (vistaFoto) URL.revokeObjectURL(vistaFoto); }, [vistaFoto]);

  const clasesHoy = datos?.clases.filter(c => c.hoy) ?? [];
  const semana = datos?.clases ?? [];
  const claseElegida = clasesHoy.find(c => c.horario_id === seleccion) ?? null;

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando) return;
    if (!claseElegida || !claseElegida.puede_marcar) {
      setError('Esta clase no está habilitada. Actualiza los horarios.'); return;
    }
    if (!foto || !['image/jpeg', 'image/png'].includes(foto.type) || foto.size > TAMANO_MAXIMO) {
      setError('Adjunta una fotografía JPG o PNG de hasta 5 MB.'); return;
    }
    setGuardando(true);
    setError(''); setMensaje('');
    try {
      const resultado = await marcarMiEntrada(token, claseElegida.horario_id, foto);
      setMensaje(resultado);
      setSeleccion(''); setFoto(null);
      await cargar();
    } catch (err) {
      const mensajeError = err instanceof Error ? err.message : 'No se pudo registrar la asistencia.';
      await cargar();
      setError(mensajeError);
    } finally { setGuardando(false); }
  }

  async function solicitarRevision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviandoSolicitud || !datos) return;
    if (!claseSolicitud || !fechaSolicitud || !motivoSolicitud || descripcionSolicitud.trim().length < 10) {
      setError('Completa la clase, fecha, motivo y una descripción de al menos 10 caracteres.');
      return;
    }
    setEnviandoSolicitud(true); setMensaje(''); setError('');
    try {
      const resultado = await enviarMiSolicitud(token, {
        horario_id: claseSolicitud, fecha: fechaSolicitud,
        tipo: tipoSolicitud, motivo: motivoSolicitud, descripcion: descripcionSolicitud,
      });
      setMensaje(resultado);
      setClaseSolicitud(''); setFechaSolicitud(''); setMotivoSolicitud(''); setDescripcionSolicitud('');
      await cargar();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.'); }
    finally { setEnviandoSolicitud(false); }
  }

  async function verFoto(registro: AsistenciaDocente) {
    setError('');
    try {
      const url = await obtenerMiFoto(token, registro.id);
      setVistaFoto(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la fotografía.');
    }
  }

  function claseCard(c: ClaseDocente, habilitarAccion: boolean) {
    const estado = c.asistencia_id
      ? c.origen_asistencia === 'justificacion' ? 'Ausencia justificada'
        : c.origen_asistencia === 'correccion' ? 'Corrección autorizada' : 'Entrada registrada'
      : c.puede_marcar ? 'Disponible para marcar' : 'Fuera de la ventana de marcado';
    return (
      <article key={c.horario_id} className="docente-clase">
        <div className="docente-fila">
          <strong>{c.materia}</strong>
          <span className={c.asistencia_id ? 'docente-etiqueta completado' : c.puede_marcar ? 'docente-etiqueta habilitado' : 'docente-etiqueta'}>{estado}</span>
        </div>
        <p>{DIAS[c.dia_semana]} · {c.hora_inicio}–{c.hora_fin} · {c.aula || 'Aula no especificada'}</p>
        {habilitarAccion && c.puede_marcar && <button className="docente-boton" type="button" onClick={() => { setSeleccion(c.horario_id); setFoto(null); setMensaje(''); setError(''); }}>Marcar entrada</button>}
      </article>
    );
  }

  return (
    <section className="docente-panel">
      <div className="docente-cabecera">
        <div><small>SGC · ASISTENCIA DOCENTE</small><h2>Mi asistencia</h2><p>{nombreDocente}</p></div>
        <button type="button" className="docente-boton secundario" onClick={() => void cargar()} disabled={cargando || guardando}>Actualizar</button>
      </div>
      <div className="docente-regla">
        <strong>Registro de entrada con fotografía</strong>
        <p>La asistencia se habilita 15 minutos antes y hasta 15 minutos después del inicio de tu clase. No se registra salida.</p>
        {datos && <p>Fecha y hora del servidor (Bolivia): <strong>{datos.fecha} · {datos.hora.slice(0,5)}</strong></p>}
      </div>

      {error && <p className="docente-alerta error" role="alert">{error}</p>}
      {mensaje && <p className="docente-alerta exito" role="status">{mensaje}</p>}
      {cargando && <p role="status">Consultando tus clases y asistencias...</p>}

      {!cargando && datos && <>
        <h3>Mis clases de hoy</h3>
        {clasesHoy.length ? <div className="docente-tarjetas">{clasesHoy.map(c => claseCard(c, true))}</div>
          : <p className="docente-vacio">No tienes clases programadas para hoy.</p>}
        {claseElegida && claseElegida.puede_marcar && <form className="docente-form" onSubmit={guardar}>
          <h3>Registrar entrada · {claseElegida.materia}</h3>
          <p>Horario: {claseElegida.hora_inicio}. Adjunta una fotografía tomada en clase.</p>
          <label htmlFor="foto-asistencia">Fotografía obligatoria (JPG o PNG, máx. 5 MB)</label>
          <input id="foto-asistencia" type="file" accept="image/jpeg,image/png" capture="environment" onChange={e => setFoto(e.target.files?.[0] ?? null)} required />
          {foto && <p className="docente-archivo">Archivo seleccionado: {foto.name}</p>}
          <div className="docente-fila acciones">
            <button className="docente-boton" disabled={guardando || !foto}>{guardando ? 'Registrando...' : 'Confirmar mi entrada'}</button>
            <button type="button" className="docente-boton secundario" disabled={guardando} onClick={() => { setSeleccion(''); setFoto(null); }}>Cancelar</button>
          </div>
        </form>}

        <h3>Solicitud de corrección o justificación</h3>
        <div className="docente-regla">
          <strong>¿No pudiste marcar o no impartiste la clase?</strong>
          <p>Solicita una <strong>corrección</strong> si impartiste la clase pero venció la ventana de marcado. Usa una <strong>justificación</strong> si no pudiste impartirla. Dirección evaluará la solicitud y dejará constancia de su decisión.</p>
          <p>Solo se aceptan clases de hoy (después del horario indicado) o de los últimos 45 días. No constituye una asistencia automática.</p>
        </div>
        <form className="docente-form docente-solicitud-form" onSubmit={solicitarRevision}>
          <label>Tipo de solicitud
            <select value={tipoSolicitud} onChange={e => { setTipoSolicitud(e.target.value as 'correccion' | 'justificacion'); setMotivoSolicitud(''); }}>
              <option value="correccion">Corrección: sí impartí clase, pero no marqué a tiempo</option>
              <option value="justificacion">Justificación: no impartí clase</option>
            </select>
          </label>
          <label>Materia y horario
            <select value={claseSolicitud} onChange={e => setClaseSolicitud(e.target.value)} required>
              <option value="">Selecciona una clase</option>
              {semana.map(c => <option key={c.horario_id} value={c.horario_id}>{c.materia} · {DIAS[c.dia_semana]} · {c.hora_inicio}</option>)}
            </select>
          </label>
          <label>Fecha de esa clase
            <input type="date" value={fechaSolicitud} max={datos.fecha}
              min={new Date(Date.parse(`${datos.fecha}T12:00:00Z`) - 45 * 86400000).toISOString().slice(0, 10)}
              onChange={e => setFechaSolicitud(e.target.value)} required />
          </label>
          <label>Motivo
            <select value={motivoSolicitud} onChange={e => setMotivoSolicitud(e.target.value)} required>
              <option value="">Selecciona un motivo</option>
              {tipoSolicitud === 'correccion' ? <>
                <option value="Olvidé realizar el marcado">Olvidé realizar el marcado</option>
                <option value="Problema técnico">Problema técnico</option>
                <option value="Otro motivo">Otro motivo</option>
              </> : <>
                <option value="Enfermedad">Enfermedad</option>
                <option value="Permiso autorizado">Permiso autorizado</option>
                <option value="Actividad suspendida">Actividad suspendida</option>
                <option value="Otro motivo">Otro motivo</option>
              </>}
            </select>
          </label>
          <label>Explica lo ocurrido (mínimo 10 caracteres)
            <textarea rows={3} minLength={10} maxLength={1200} value={descripcionSolicitud}
              onChange={e => setDescripcionSolicitud(e.target.value)} required
              placeholder="Describe la situación para que la directora pueda evaluarla" />
          </label>
          <button className="docente-boton" disabled={enviandoSolicitud || semana.length === 0}>
            {enviandoSolicitud ? 'Enviando…' : 'Enviar a Dirección'}
          </button>
        </form>
        <h3>Mis solicitudes y respuestas de Dirección</h3>
        {solicitudes.length ? <div className="docente-historial">
          {solicitudes.map(s => <div className="docente-registro docente-solicitud-estado" key={s.id}>
            <div><strong>{s.materia} · {s.fecha_clase}</strong>
              <p>{s.tipo === 'correccion' ? 'Corrección' : 'Justificación'} · {s.motivo}</p>
              <p>Estado: <strong>{s.estado}</strong> · enviada el {s.fecha_solicitud}</p>
              {s.observacion_revision && <p>Respuesta: {s.observacion_revision}</p>}
            </div>
          </div>)}
        </div> : <p className="docente-vacio">Todavía no has enviado solicitudes.</p>}

        <h3>Mi horario semanal</h3>
        {semana.length ? <div className="docente-tarjetas">{semana.map(c => claseCard(c, false))}</div>
          : <p className="docente-vacio">Todavía no tienes materias y horarios activos para la gestión actual. Comunícate con Dirección de Carrera.</p>}
        <h3>Mis últimas asistencias</h3>
        {historial.length ? <div className="docente-historial">{historial.map(a => <div className="docente-registro" key={a.id}>
          <div><strong>{a.materia}</strong><p>{a.fecha} · {a.estado} · {a.origen_registro === 'normal' ? `Marcado a las ${a.hora_registro}` : a.origen_registro === 'correccion' ? 'Corrección autorizada por Dirección' : 'Justificación autorizada por Dirección'}</p></div>
          {a.tiene_foto && <button type="button" className="docente-boton secundario" onClick={() => void verFoto(a)}>Ver foto</button>}
        </div>)}</div>
          : <p className="docente-vacio">Aún no hay registros de asistencia.</p>}
      </>}

      {vistaFoto && <div className="docente-visor" role="dialog" aria-modal="true" aria-label="Evidencia fotográfica">
        <div className="docente-visor-contenido"><button type="button" className="docente-boton secundario" onClick={() => setVistaFoto(null)}>Cerrar fotografía</button><img src={vistaFoto} alt="Evidencia de tu asistencia" /></div>
      </div>}
      <p className="docente-nota">El sistema utiliza la hora del servidor. Las solicitudes son revisadas por Dirección; una autorización queda identificada en el historial como registro administrativo.</p>
    </section>
  );
}
