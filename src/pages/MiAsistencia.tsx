import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle, ArrowRight, BookOpen, CalendarDays, CalendarCheck2,
  Camera, CheckCircle2, ChevronDown, Clock3, FilePenLine,
  HelpCircle, History, Home, LogOut, MapPin, Menu,
  RefreshCw, Send, ShieldCheck, Sun, UserRound, X,
  type LucideIcon,
} from 'lucide-react';
import {
  marcarMiEntrada, obtenerMiFoto, obtenerMisAsistencias, obtenerMisClases,
  obtenerMisSolicitudes, enviarMiSolicitud, type MiSolicitud,
  type AsistenciaDocente, type ClaseDocente, type MisClases,
} from '../lib/asistencia';
import '../styles/asistencia-docente.css';
import '../styles/portal-docente-mobile.css';

type Props = { token: string; nombreDocente: string; cerrarSesion: () => void };
type Vista = 'hoy' | 'horario' | 'solicitudes' | 'historial';
type Modal = 'marcar' | 'solicitar' | 'ayuda' | null;
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TAMANO_MAXIMO = 5 * 1024 * 1024;
const NAVEGACION: { id: Vista; titulo: string; Icono: LucideIcon }[] = [
  { id: 'hoy', titulo: 'Hoy', Icono: Home },
  { id: 'horario', titulo: 'Horario', Icono: CalendarDays },
  { id: 'solicitudes', titulo: 'Solicitudes', Icono: FilePenLine },
  { id: 'historial', titulo: 'Historial', Icono: History },
];

function fechaLegible(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${fecha}T12:00:00Z`));
}

function estadoClase(c: ClaseDocente) {
  if (c.asistencia_id) {
    if (c.origen_asistencia === 'justificacion') return { texto: 'Justificada', clase: 'completado' };
    if (c.origen_asistencia === 'correccion') return { texto: 'Corrección autorizada', clase: 'completado' };
    return { texto: 'Entrada registrada', clase: 'completado' };
  }
  if (!c.hoy) return { texto: 'Programada', clase: 'programada' };
  if (c.puede_marcar) return { texto: 'Disponible para marcar', clase: 'habilitado' };
  return { texto: 'Fuera de la ventana', clase: 'fuera' };
}

export default function MiAsistencia({ token, nombreDocente, cerrarSesion }: Props) {
  const [datos, setDatos] = useState<MisClases | null>(null);
  const [historial, setHistorial] = useState<AsistenciaDocente[]>([]);
  const [solicitudes, setSolicitudes] = useState<MiSolicitud[]>([]);
  const [vista, setVista] = useState<Vista>('hoy');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [claseSolicitud, setClaseSolicitud] = useState('');
  const [fechaSolicitud, setFechaSolicitud] = useState('');
  const [tipoSolicitud, setTipoSolicitud] = useState<'correccion' | 'justificacion'>('correccion');
  const [motivoSolicitud, setMotivoSolicitud] = useState('');
  const [descripcionSolicitud, setDescripcionSolicitud] = useState('');
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [vistaFoto, setVistaFoto] = useState<string | null>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const modalTrigger = useRef<HTMLButtonElement | null>(null);
  const menuClose = useRef<HTMLButtonElement | null>(null);
  const modalClose = useRef<HTMLButtonElement | null>(null);

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
      setError(err instanceof Error ? err.message : 'No pudimos consultar tus clases.');
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    if (!foto || !['image/jpeg', 'image/png'].includes(foto.type)) {
      setPreviewFoto(null);
      return;
    }
    const url = URL.createObjectURL(foto);
    setPreviewFoto(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);
  useEffect(() => () => { if (vistaFoto) URL.revokeObjectURL(vistaFoto); }, [vistaFoto]);
  useEffect(() => {
    if (!modal && !menuAbierto && !vistaFoto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, [modal, menuAbierto, vistaFoto]);
  useEffect(() => { if (menuAbierto) menuClose.current?.focus(); }, [menuAbierto]);
  useEffect(() => { if (modal) modalClose.current?.focus(); }, [modal]);
  useEffect(() => {
    function alEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (vistaFoto) { setVistaFoto(null); return; }
      if (modal && !guardando && !enviandoSolicitud) { setModal(null); modalTrigger.current?.focus(); return; }
      if (menuAbierto) { setMenuAbierto(false); menuTrigger.current?.focus(); }
    }
    document.addEventListener('keydown', alEsc);
    return () => document.removeEventListener('keydown', alEsc);
  }, [vistaFoto, modal, menuAbierto, guardando, enviandoSolicitud]);

  const clasesHoy = datos?.clases.filter(c => c.hoy) ?? [];
  const semana = datos?.clases ?? [];
  const claseElegida = clasesHoy.find(c => c.horario_id === seleccion) ?? null;
  const hayClaseHabilitada = clasesHoy.some(c => c.puede_marcar);
  const pendientes = solicitudes.filter(s => s.estado === 'pendiente').length;

  function navegar(nuevaVista: Vista) {
    setVista(nuevaVista);
    setMenuAbierto(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function abrirModal(nuevo: Exclude<Modal, null>, boton?: HTMLButtonElement) {
    if (boton) modalTrigger.current = boton;
    setError('');
    setMensaje('');
    setModal(nuevo);
    setMenuAbierto(false);
  }
  function cerrarModal() {
    if (guardando || enviandoSolicitud) return;
    setModal(null);
    setSeleccion('');
    setFoto(null);
    modalTrigger.current?.focus();
  }
  function abrirMarcado(c: ClaseDocente, boton: HTMLButtonElement) {
    if (!c.hoy || !c.puede_marcar) return;
    setSeleccion(c.horario_id);
    setFoto(null);
    abrirModal('marcar', boton);
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando) return;
    if (!claseElegida || !claseElegida.puede_marcar) {
      setError('La clase ya no está habilitada. Actualiza los horarios.'); return;
    }
    if (!foto || !['image/jpeg', 'image/png'].includes(foto.type) || foto.size > TAMANO_MAXIMO) {
      setError('Adjunta una fotografía JPG o PNG de hasta 5 MB.'); return;
    }
    setGuardando(true);
    setError(''); setMensaje('');
    try {
      const resultado = await marcarMiEntrada(token, claseElegida.horario_id, foto);
      setSeleccion(''); setFoto(null); setModal(null);
      await cargar();
      setMensaje(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la asistencia.');
    } finally { setGuardando(false); }
  }

  async function solicitarRevision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviandoSolicitud || !datos) return;
    if (!claseSolicitud || !fechaSolicitud || !motivoSolicitud || descripcionSolicitud.trim().length < 10) {
      setError('Completa clase, fecha, motivo y una descripción de al menos 10 caracteres.');
      return;
    }
    setEnviandoSolicitud(true); setMensaje(''); setError('');
    try {
      const resultado = await enviarMiSolicitud(token, {
        horario_id: claseSolicitud, fecha: fechaSolicitud,
        tipo: tipoSolicitud, motivo: motivoSolicitud, descripcion: descripcionSolicitud,
      });
      setClaseSolicitud(''); setFechaSolicitud(''); setMotivoSolicitud(''); setDescripcionSolicitud('');
      setModal(null);
      await cargar();
      setMensaje(resultado);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.'); }
    finally { setEnviandoSolicitud(false); }
  }

  async function verFoto(registro: AsistenciaDocente) {
    setError('');
    try {
      setVistaFoto(await obtenerMiFoto(token, registro.id));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo abrir la fotografía.'); }
  }

  function tarjetaClase(c: ClaseDocente, permiteMarcar: boolean) {
    const estado = estadoClase(c);
    return (
      <article className="dp16-clase" key={c.horario_id}>
        <div className="dp16-clase-icono"><BookOpen size={21} aria-hidden="true" /></div>
        <div className="dp16-clase-datos">
          <div className="dp16-clase-fila">
            <strong>{c.materia}</strong>
            <span className={`dp16-etiqueta ${estado.clase}`}>{estado.texto}</span>
          </div>
          <div className="dp16-metadatos">
            <span><Clock3 size={15} aria-hidden="true" /> {c.hora_inicio}–{c.hora_fin}</span>
            <span><MapPin size={15} aria-hidden="true" /> {c.aula || 'Aula no especificada'}</span>
          </div>
          {permiteMarcar && c.puede_marcar && (
            <button type="button" className="dp16-btn dp16-btn-rojo dp16-marcar" onClick={e => abrirMarcado(c, e.currentTarget)}>
              <Camera size={18} aria-hidden="true" /> Marcar mi entrada
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="docente-portal16">
      <div className="dp16-mobile-header">
        <button ref={menuTrigger} className="dp16-icon-btn" type="button" aria-label="Abrir menú de cuenta" aria-expanded={menuAbierto} onClick={() => setMenuAbierto(true)}><Menu aria-hidden="true" size={23} /></button>
        <div className="dp16-mobile-marca"><span>SGC</span><small>Portal Docente</small></div>
        <button className="dp16-icon-btn" type="button" aria-label="Actualizar información" onClick={() => void cargar()} disabled={cargando}><RefreshCw aria-hidden="true" size={20} /></button>
      </div>

      <div className="dp16-contenido">
        <header className="dp16-encabezado">
          <div>
            <span className="dp16-superior">UAGRM / PORTAL DOCENTE</span>
            <h1>{vista === 'hoy' ? 'Mi asistencia' : vista === 'horario' ? 'Mi horario' : vista === 'solicitudes' ? 'Mis solicitudes' : 'Mi historial'}</h1>
            <p>{vista === 'hoy' ? `Hola, ${nombreDocente}` : 'Dirección de Carrera · Ingeniería en Sistemas'}</p>
          </div>
          <button type="button" className="dp16-btn dp16-btn-outline dp16-refrescar" onClick={() => void cargar()} disabled={cargando}><RefreshCw size={17} aria-hidden="true" /> Actualizar</button>
        </header>

        <nav className="dp16-tabs" aria-label="Secciones del portal docente">
          {NAVEGACION.map(({ id, titulo, Icono }) => (
            <button type="button" key={id} className={`dp16-tab ${vista === id ? 'activo' : ''}`} aria-current={vista === id ? 'page' : undefined} onClick={() => navegar(id)}>
              <Icono size={19} aria-hidden="true" /><span>{titulo}</span>
            </button>
          ))}
        </nav>

        {error && !modal && <div className="dp16-aviso dp16-error" role="alert"><AlertCircle size={18} aria-hidden="true" /> {error}</div>}
        {mensaje && <div className="dp16-aviso dp16-exito" role="status"><CheckCircle2 size={18} aria-hidden="true" /> {mensaje}</div>}
        {cargando && <div className="dp16-cargando" role="status"><RefreshCw size={19} aria-hidden="true" /> Consultando tus datos...</div>}

        {!cargando && datos && <>
          {vista === 'hoy' && <div className="dp16-vista">
            <div className="dp16-fecha"><CalendarDays size={23} aria-hidden="true" /><div><strong>{fechaLegible(datos.fecha)}</strong><small>Hora del servidor: {datos.hora.slice(0,5)} · Bolivia</small></div></div>
            <div className="dp16-bienvenida"><div><span className="dp16-superior">TU JORNADA ACADÉMICA</span><h2>Clases de hoy</h2><p>{clasesHoy.length ? `Tienes ${clasesHoy.length} ${clasesHoy.length === 1 ? 'clase programada' : 'clases programadas'} para hoy.` : 'No tienes clases programadas para hoy.'}</p></div><CalendarCheck2 size={38} aria-hidden="true" /></div>
            <div className="dp16-seccion-titulo"><h3>Mis clases</h3><span>{clasesHoy.length} en total</span></div>
            {clasesHoy.length ? <div className="dp16-lista-clases">{clasesHoy.map(c => tarjetaClase(c, true))}</div> : <div className="dp16-vacio">No hay clases para este día.</div>}
            <div className="dp16-ayuda-entrada"><ShieldCheck size={21} aria-hidden="true" /><p>El marcado solo se habilita <strong>15 minutos antes y hasta 15 minutos después</strong> del inicio de la clase. Se requiere fotografía; no se marca salida.</p></div>
            <div className="dp16-accesos">
              <button type="button" className="dp16-acceso" onClick={() => navegar('horario')}><CalendarDays size={22} aria-hidden="true" /><span><strong>Mi horario</strong><small>Ver semana completa</small></span><ArrowRight size={19} aria-hidden="true" /></button>
              <button type="button" className="dp16-acceso" onClick={() => navegar('solicitudes')}><FilePenLine size={22} aria-hidden="true" /><span><strong>Solicitudes</strong><small>Corrección o justificación</small></span><ArrowRight size={19} aria-hidden="true" /></button>
            </div>
            {!hayClaseHabilitada && clasesHoy.length > 0 && <p className="dp16-nota">El botón para marcar aparecerá solo durante la ventana autorizada por el servidor.</p>}
          </div>}

          {vista === 'horario' && <div className="dp16-vista">
            <div className="dp16-seccion-titulo"><div><h2>Horario semanal</h2><p>Materias y aulas de tu gestión actual.</p></div><span>{semana.length} clases</span></div>
            {semana.length ? <div className="dp16-dias">{DIAS.slice(1).map((dia, i) => {
              const clasesDia = semana.filter(c => c.dia_semana === i + 1).sort((a,b) => a.hora_inicio.localeCompare(b.hora_inicio));
              return <details key={dia} className="dp16-dia" open={clasesDia.length > 0 && semana.filter(c => c.dia_semana < i + 1).length === 0}>
                <summary><span><CalendarDays size={19} aria-hidden="true" /> {dia}</span><span>{clasesDia.length} {clasesDia.length === 1 ? 'clase' : 'clases'} <ChevronDown size={19} aria-hidden="true" /></span></summary>
                <div className="dp16-dia-contenido">{clasesDia.length ? clasesDia.map(c => tarjetaClase(c, false)) : <p>No hay clases asignadas.</p>}</div>
              </details>;
            })}</div> : <div className="dp16-vacio">Aún no tienes horarios activos para la gestión actual. Comunícate con Dirección de Carrera.</div>}
          </div>}

          {vista === 'solicitudes' && <div className="dp16-vista">
            <div className="dp16-seccion-titulo"><div><h2>Solicitudes</h2><p>Consulta las decisiones de Dirección.</p></div><span>{pendientes} pendientes</span></div>
            <button type="button" className="dp16-btn dp16-btn-rojo dp16-btn-completo" onClick={e => abrirModal('solicitar', e.currentTarget)} disabled={!semana.length}><FilePenLine size={19} aria-hidden="true" /> Nueva solicitud</button>
            <div className="dp16-ayuda-entrada"><HelpCircle size={21} aria-hidden="true" /><p>Pide una <strong>corrección</strong> si diste clase pero no marcaste. Pide una <strong>justificación</strong> si no impartiste clase. Dirección revisará la solicitud.</p></div>
            {solicitudes.length ? <div className="dp16-lista-registros">{solicitudes.map(s => <article key={s.id} className="dp16-registro">
              <div className="dp16-registro-cabeza"><strong>{s.materia}</strong><span className={`dp16-etiqueta ${s.estado === 'aprobada' ? 'habilitado' : s.estado === 'rechazada' ? 'rechazado' : 'pendiente'}`}>{s.estado}</span></div>
              <p><CalendarDays size={15} aria-hidden="true" /> {fechaLegible(s.fecha_clase)}</p>
              <p>{s.tipo === 'correccion' ? 'Corrección' : 'Justificación'} · {s.motivo}</p>
              <small>Enviada: {s.fecha_solicitud}</small>
              {s.observacion_revision && <div className="dp16-respuesta"><strong>Respuesta de Dirección</strong><p>{s.observacion_revision}</p></div>}
            </article>)}</div> : <div className="dp16-vacio">Todavía no has enviado solicitudes.</div>}
          </div>}

          {vista === 'historial' && <div className="dp16-vista">
            <div className="dp16-seccion-titulo"><div><h2>Historial de asistencias</h2><p>Registros y fotografías disponibles.</p></div><span>{historial.length} registros</span></div>
            {historial.length ? <div className="dp16-lista-registros">{historial.map(a => <article className="dp16-registro" key={a.id}>
              <div className="dp16-registro-cabeza"><strong>{a.materia}</strong><span className="dp16-etiqueta completado">{a.estado}</span></div>
              <p><CalendarDays size={15} aria-hidden="true" /> {fechaLegible(a.fecha)}</p>
              <p><Clock3 size={15} aria-hidden="true" /> {a.origen_registro === 'normal' ? `Marcado a las ${a.hora_registro}` : a.origen_registro === 'correccion' ? 'Corrección autorizada por Dirección' : 'Justificación autorizada por Dirección'}</p>
              {a.tiene_foto && <button type="button" className="dp16-btn dp16-btn-outline" onClick={() => void verFoto(a)}><Camera size={17} aria-hidden="true" /> Ver fotografía</button>}
            </article>)}</div> : <div className="dp16-vacio">Aún no hay registros de asistencia.</div>}
          </div>}
        </>}
      </div>

      <nav className="dp16-bottom-nav" aria-label="Navegación móvil del docente">
        {NAVEGACION.map(({ id, titulo, Icono }) => <button type="button" key={id} className={vista === id ? 'activo' : ''} aria-current={vista === id ? 'page' : undefined} onClick={() => navegar(id)}><Icono size={22} aria-hidden="true" /><span>{titulo}</span></button>)}
      </nav>

      {menuAbierto && <div className="dp16-overlay dp16-menu-overlay">
        <button type="button" className="dp16-fondo" onClick={() => { setMenuAbierto(false); menuTrigger.current?.focus(); }} aria-label="Cerrar menú" />
        <aside className="dp16-drawer" role="dialog" aria-modal="true" aria-labelledby="dp16-menu-titulo">
          <div className="dp16-drawer-top"><strong id="dp16-menu-titulo">SGC · Portal Docente</strong><button ref={menuClose} type="button" className="dp16-icon-btn" onClick={() => { setMenuAbierto(false); menuTrigger.current?.focus(); }} aria-label="Cerrar menú"><X size={21}/></button></div>
          <div className="dp16-perfil"><div className="dp16-avatar"><UserRound size={28} aria-hidden="true" /></div><div><strong>{nombreDocente}</strong><span>Rol: Docente</span></div></div>
          <div className="dp16-drawer-subtitulo">Mi cuenta</div>
          <button type="button" className="dp16-drawer-opcion" onClick={() => { setMenuAbierto(false); document.querySelector<HTMLButtonElement>('.sgc-layout-docente .sgc-tema-toggle')?.click(); menuTrigger.current?.focus(); }}><Sun size={19} aria-hidden="true" /> Cambiar modo claro / oscuro</button>
          <button type="button" className="dp16-drawer-opcion" onClick={e => abrirModal('ayuda', e.currentTarget)}><HelpCircle size={19} aria-hidden="true" /> Ayuda para el marcado</button>
          <button type="button" className="dp16-drawer-opcion" onClick={() => { setMenuAbierto(false); void cargar(); }}><RefreshCw size={19} aria-hidden="true" /> Actualizar datos</button>
          <button type="button" className="dp16-drawer-salir" onClick={cerrarSesion}><LogOut size={19} aria-hidden="true" /> Cerrar sesión</button>
          <small className="dp16-drawer-pie">UAGRM · Ingeniería en Sistemas</small>
        </aside>
      </div>}

      {modal && <div className="dp16-overlay dp16-dialog-overlay">
        <div className="dp16-dialog" role="dialog" aria-modal="true" aria-labelledby="dp16-dialog-title">
          <div className="dp16-dialog-top"><div><span className="dp16-superior">SGC · PORTAL DOCENTE</span><h2 id="dp16-dialog-title">{modal === 'marcar' ? 'Registrar mi entrada' : modal === 'solicitar' ? 'Nueva solicitud' : 'Ayuda y reglas del marcado'}</h2></div><button ref={modalClose} type="button" className="dp16-icon-btn" disabled={guardando || enviandoSolicitud} onClick={cerrarModal} aria-label="Cerrar ventana"><X size={22} /></button></div>
          {error && <div role="alert" className="dp16-aviso dp16-error"><AlertCircle size={17} aria-hidden="true" /> {error}</div>}
          {modal === 'marcar' && claseElegida && <form className="dp16-form" onSubmit={guardar}>
            <div className="dp16-form-clase"><BookOpen size={19} aria-hidden="true" /><div><strong>{claseElegida.materia}</strong><p><Clock3 size={14} aria-hidden="true" /> {claseElegida.hora_inicio}–{claseElegida.hora_fin} · {claseElegida.aula || 'Aula no especificada'}</p></div></div>
            <p className="dp16-form-nota">Se permite marcar únicamente en la ventana autorizada por el servidor. Es obligatorio adjuntar una fotografía tomada en clase.</p>
            <label htmlFor="dp16-foto">Fotografía JPG o PNG, máximo 5 MB</label>
            <input id="dp16-foto" type="file" accept="image/jpeg,image/png" capture="environment" onChange={e => setFoto(e.target.files?.[0] ?? null)} required />
            {previewFoto && <img className="dp16-preview" src={previewFoto} alt="Vista previa de la fotografía que vas a adjuntar" />}
            {foto && <small>Archivo: {foto.name}</small>}
            <div className="dp16-form-acciones"><button type="button" className="dp16-btn dp16-btn-outline" disabled={guardando} onClick={cerrarModal}>Cancelar</button><button className="dp16-btn dp16-btn-rojo" disabled={guardando || !foto}><Camera size={18} aria-hidden="true" /> {guardando ? 'Registrando...' : 'Confirmar entrada'}</button></div>
          </form>}
          {modal === 'solicitar' && datos && <form className="dp16-form" onSubmit={solicitarRevision}>
            <p className="dp16-form-nota">Solicita una corrección si impartiste clase, o una justificación si no pudiste impartirla. Se admiten clases de hoy (después del horario) o de los últimos 45 días.</p>
            <label htmlFor="dp16-tipo">Tipo de solicitud</label>
            <select id="dp16-tipo" value={tipoSolicitud} onChange={e => { setTipoSolicitud(e.target.value as 'correccion' | 'justificacion'); setMotivoSolicitud(''); }}><option value="correccion">Corrección: impartí clase, pero no marqué</option><option value="justificacion">Justificación: no impartí clase</option></select>
            <label htmlFor="dp16-clase">Materia y horario</label>
            <select id="dp16-clase" value={claseSolicitud} onChange={e => setClaseSolicitud(e.target.value)} required><option value="">Selecciona una clase</option>{semana.map(c => <option key={c.horario_id} value={c.horario_id}>{c.materia} · {DIAS[c.dia_semana]} · {c.hora_inicio}</option>)}</select>
            <label htmlFor="dp16-fecha">Fecha de esa clase</label>
            <input id="dp16-fecha" type="date" value={fechaSolicitud} max={datos.fecha} min={new Date(Date.parse(`${datos.fecha}T12:00:00Z`) - 45 * 86400000).toISOString().slice(0,10)} onChange={e => setFechaSolicitud(e.target.value)} required />
            <label htmlFor="dp16-motivo">Motivo</label>
            <select id="dp16-motivo" value={motivoSolicitud} onChange={e => setMotivoSolicitud(e.target.value)} required><option value="">Selecciona un motivo</option>{(tipoSolicitud === 'correccion' ? ['Olvidé realizar el marcado', 'Problema técnico', 'Otro motivo'] : ['Enfermedad', 'Permiso autorizado', 'Actividad suspendida', 'Otro motivo']).map(m => <option key={m} value={m}>{m}</option>)}</select>
            <label htmlFor="dp16-descripcion">Explica lo ocurrido (mínimo 10 caracteres)</label>
            <textarea id="dp16-descripcion" rows={4} minLength={10} maxLength={1200} value={descripcionSolicitud} onChange={e => setDescripcionSolicitud(e.target.value)} required placeholder="Describe lo ocurrido para que Dirección pueda revisarlo" />
            <div className="dp16-form-acciones"><button type="button" className="dp16-btn dp16-btn-outline" disabled={enviandoSolicitud} onClick={cerrarModal}>Cancelar</button><button className="dp16-btn dp16-btn-rojo" disabled={enviandoSolicitud || !semana.length}><Send size={18} aria-hidden="true" /> {enviandoSolicitud ? 'Enviando...' : 'Enviar a Dirección'}</button></div>
          </form>}
          {modal === 'ayuda' && <div className="dp16-ayuda-modal"><p><ShieldCheck size={18} aria-hidden="true" /> El sistema utiliza la hora del servidor de Bolivia.</p><p>La entrada se habilita desde 15 minutos antes hasta 15 minutos después de empezar la clase. Solo se registra entrada; no salida.</p><p>Si necesitas una corrección o justificación, abre «Solicitudes»; Dirección evaluará tu petición.</p><button type="button" className="dp16-btn dp16-btn-rojo" onClick={cerrarModal}>Entendido</button></div>}
        </div>
      </div>}
      {vistaFoto && <div className="dp16-overlay dp16-foto-overlay"><div className="dp16-foto-dialog" role="dialog" aria-modal="true" aria-label="Evidencia de asistencia"><button type="button" className="dp16-btn dp16-btn-outline" onClick={() => setVistaFoto(null)}><X size={17} aria-hidden="true" /> Cerrar fotografía</button><img src={vistaFoto} alt="Evidencia fotográfica de asistencia" /></div></div>}
    </section>
  );
}
