import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  obtenerPlantel, crearDocente, crearMateria, crearAsignacion, crearHorario, reprogramarHorario,
  obtenerHistorialHorario, type HistorialCambioHorario,
  editarDatosDocente, editarDatosMateria, editarDatosAsignacion,
  establecerEstadoMateria, establecerEstadoAsignacion,
  type Docente, type Materia, type Asignacion,
  type ResumenPlantel,
} from '../lib/plantel';
import ControlAsistencia from './ControlAsistencia';
import ReportesAsistencia from './ReportesAsistencia';
import '../styles/plantel-navegacion.css';
import ModalDocenteSGC from '../components/ModalDocenteSGC';
import '../styles/modal-docente-sgc.css';
import { BarChart3, BookOpen, CalendarDays, ClipboardCheck, Layers, UsersRound, type LucideIcon } from 'lucide-react';
import '../styles/plantel-iconos-bloque10.css';
import '../styles/modal-asignaciones-bloque12.css';
import '../styles/plantel-completado-bloque13-15.css';

type Props = { token: string };
type SeccionPlantel = 'docentes' | 'materias' | 'asignaciones' | 'horarios' | 'asistencias' | 'reportes';
const opcionesPlantel: { id: SeccionPlantel; nombre: string; icono: LucideIcon; descripcion: string }[] = [
  { id: 'docentes', nombre: 'Docentes', icono: UsersRound, descripcion: 'Cuentas y datos de docentes' },
  { id: 'materias', nombre: 'Materias', icono: BookOpen, descripcion: 'Catálogo de materias' },
  { id: 'asignaciones', nombre: 'Asignaciones', icono: Layers, descripcion: 'Materias asignadas por docente' },
  { id: 'horarios', nombre: 'Horarios', icono: CalendarDays, descripcion: 'Registro, cambios y vigencias' },
  { id: 'asistencias', nombre: 'Asistencias', icono: ClipboardCheck, descripcion: 'Marcados y solicitudes' },
  { id: 'reportes', nombre: 'Reportes', icono: BarChart3, descripcion: 'Informes y exportaciones' },
];
const dias = ['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

const vacio: ResumenPlantel = { docentes: [], materias: [], asignaciones: [], horarios: [] };

export default function PlantelDocente({ token }: Props) {
  const [datos, setDatos] = useState<ResumenPlantel>(vacio);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [seccionActiva, setSeccionActiva] = useState<SeccionPlantel>('docentes');
  const [nuevoDocente, setNuevoDocente] = useState(false);
  const [nuevaMateria, setNuevaMateria] = useState(false);
  const [nuevaAsignacion, setNuevaAsignacion] = useState(false);
  const [nuevoHorario, setNuevoHorario] = useState(false);

  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [ci, setCi] = useState('');
  const [codigoDocente, setCodigoDocente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [especialidad, setEspecialidad] = useState('');

  const [codigoMateria, setCodigoMateria] = useState('');
  const [nombreMateria, setNombreMateria] = useState('');
  const [semestre, setSemestre] = useState('');

  const [docenteId, setDocenteId] = useState('');
  const [materiaId, setMateriaId] = useState('');
  const [gestion, setGestion] = useState(new Date().getFullYear());

  const [asignacionId, setAsignacionId] = useState('');
  const [dia, setDia] = useState(1);
  const [inicio, setInicio] = useState('08:00');
  const [fin, setFin] = useState('10:00');
  const [aula, setAula] = useState('');
  const [editarId, setEditarId] = useState('');
  const [nuevoDia, setNuevoDia] = useState(1);
  const [nuevoInicio, setNuevoInicio] = useState('08:00');
  const [nuevoFin, setNuevoFin] = useState('10:00');
  const [nuevaAula, setNuevaAula] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [motivoCambio, setMotivoCambio] = useState('');

  const [historialId, setHistorialId] = useState('');
  const [historial, setHistorial] = useState<HistorialCambioHorario[]>([]);
  const [historialCargando, setHistorialCargando] = useState(false);
  const [historialError, setHistorialError] = useState('');
  const consultaHistorialActual = useRef(0);

  // Formularios de edición: se muestran solo al pulsar «Editar» en cada tabla.
  const [edDocenteId, setEdDocenteId] = useState('');
  const [edDocenteNombre, setEdDocenteNombre] = useState('');
  const [edDocenteCorreo, setEdDocenteCorreo] = useState('');
  const [edDocenteCi, setEdDocenteCi] = useState('');
  const [edDocenteCodigo, setEdDocenteCodigo] = useState('');
  const [edDocenteTelefono, setEdDocenteTelefono] = useState('');
  const [edDocenteEspecialidad, setEdDocenteEspecialidad] = useState('');

  const [edMateriaId, setEdMateriaId] = useState('');
  const [edMateriaCodigo, setEdMateriaCodigo] = useState('');
  const [edMateriaNombre, setEdMateriaNombre] = useState('');
  const [edMateriaSemestre, setEdMateriaSemestre] = useState('');

  const [edAsignacionId, setEdAsignacionId] = useState('');
  const [edAsignacionDocente, setEdAsignacionDocente] = useState('');
  const [edAsignacionMateria, setEdAsignacionMateria] = useState('');
  const [edAsignacionGestion, setEdAsignacionGestion] = useState(2026);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const respuesta = await obtenerPlantel(token);
      setDatos(respuesta);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el plantel.');
    } finally { setCargando(false); }
  }, [token]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function ejecutar(accion: () => Promise<unknown>, exito: string, limpiar: () => void) {
    if (ocupado) return;
    setOcupado(true); setError(''); setMensaje('');
    try {
      await accion();
      limpiar();
      setMensaje(exito);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally { setOcupado(false); }
  }

  function cerrarVentanaDocente() {
    if (ocupado) return;
    setNuevoDocente(false);
    setEdDocenteId('');
    setNombre(''); setCorreo(''); setPassword(''); setCi('');
    setCodigoDocente(''); setTelefono(''); setEspecialidad('');
    setError('');
  }

  function abrirNuevoDocente() {
    if (ocupado) return;
    setEdDocenteId('');
    setError('');
    setMensaje('');
    setNuevoDocente(true);
  }

  function guardarDocente(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearDocente(token, {
      nombre_completo: nombre, correo, password, ci,
      codigo_docente: codigoDocente, telefono, especialidad,
    }), 'Docente y cuenta creados correctamente.', () => {
      setNombre('');setCorreo('');setPassword('');setCi('');
      setCodigoDocente('');setTelefono('');setEspecialidad('');setNuevoDocente(false);
    });
  }
  function cerrarVentanaMateria() {
    if (ocupado) return;
    setNuevaMateria(false);
    setEdMateriaId('');
    setCodigoMateria('');
    setNombreMateria('');
    setSemestre('');
    setEdMateriaCodigo('');
    setEdMateriaNombre('');
    setEdMateriaSemestre('');
    setError('');
  }

  function abrirNuevaMateria() {
    if (ocupado) return;
    setNuevaMateria(true);
    setEdMateriaId('');
    setCodigoMateria('');
    setNombreMateria('');
    setSemestre('');
    setError('');
    setMensaje('');
  }

  function guardarMateria(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearMateria(token, {
      codigo:codigoMateria, nombre:nombreMateria,
      ...(semestre ? { semestre:Number(semestre) } : {}),
    }), 'Materia registrada correctamente.', () => {
      setCodigoMateria('');setNombreMateria('');setSemestre('');setNuevaMateria(false);
    });
  }
  function cerrarVentanaAsignacion() {
    if (ocupado) return;
    setNuevaAsignacion(false);
    setEdAsignacionId('');
    setDocenteId('');
    setMateriaId('');
    setGestion(new Date().getFullYear());
    setEdAsignacionDocente('');
    setEdAsignacionMateria('');
    setError('');
  }

  function abrirNuevaAsignacion() {
    if (ocupado) return;
    setEdAsignacionId('');
    setDocenteId('');
    setMateriaId('');
    setGestion(new Date().getFullYear());
    setError('');
    setMensaje('');
    setNuevaAsignacion(true);
  }

  function guardarAsignacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearAsignacion(token, {
      docente_id: docenteId, materia_id:materiaId, gestion,
    }), 'Asignación registrada correctamente.', () => {
      setDocenteId('');setMateriaId('');setNuevaAsignacion(false);
    });
  }
  function cerrarVentanaHorario() {
    if (ocupado) return;
    setNuevoHorario(false);
    setEditarId('');
    setAsignacionId('');
    setAula('');
    setVigencia('');
    setMotivoCambio('');
    setError('');
  }

  function abrirNuevoHorario() {
    if (ocupado) return;
    setEditarId('');
    setNuevoHorario(true);
    setAsignacionId('');
    setDia(1);
    setInicio('08:00');
    setFin('10:00');
    setAula('');
    setError('');
    setMensaje('');
  }

  function cerrarHistorialHorario() {
    consultaHistorialActual.current++;
    setHistorialId('');
    setHistorial([]);
    setHistorialError('');
    setHistorialCargando(false);
  }

  function guardarHorario(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearHorario(token, {
      asignacion_id: asignacionId, dia_semana:dia,
      hora_inicio:inicio,hora_fin:fin,aula,
    }), 'Horario registrado correctamente.', () => {
      setAula('');setAsignacionId('');setNuevoHorario(false);
    });
  }

  function editarHorario(id: string) {
    if (ocupado) return;
    setNuevoHorario(false);
    const horario = datos.horarios.find(h => h.id === id);
    if (!horario) return;
    setEditarId(id);
    setNuevoDia(horario.dia_semana);
    setNuevoInicio(horario.hora_inicio);
    setNuevoFin(horario.hora_fin);
    setNuevaAula(horario.aula ?? '');
    setVigencia('');
    setMotivoCambio('');
    setError(''); setMensaje('');
  }
  function guardarCambioHorario(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editarId) return;
    void ejecutar(() => reprogramarHorario(token, editarId, {
      dia_semana:nuevoDia, hora_inicio:nuevoInicio, hora_fin:nuevoFin,
      aula:nuevaAula, vigencia_desde:vigencia, motivo:motivoCambio,
    }), 'Cambio de horario programado, sin alterar el historial anterior.', () => {
      setEditarId('');setVigencia('');setMotivoCambio('');
      consultaHistorialActual.current++; setHistorialId(''); setHistorial([]);
    });
  }

  async function verHistorial(id: string) {
    const numeroConsulta = ++consultaHistorialActual.current;
    if (historialId === id) {
      setHistorialId('');
      setHistorial([]);
      setHistorialError('');
      setHistorialCargando(false);
      return;
    }
    setHistorialId(id);
    setHistorial([]);
    setHistorialError('');
    setHistorialCargando(true);
    try {
      const resultado = await obtenerHistorialHorario(token, id);
      if (consultaHistorialActual.current !== numeroConsulta) return;
      setHistorial(resultado.cambios);
    } catch (err) {
      if (consultaHistorialActual.current !== numeroConsulta) return;
      setHistorialError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');
    } finally {
      if (consultaHistorialActual.current === numeroConsulta) setHistorialCargando(false);
    }
  }

  function comenzarEdicionDocente(d: Docente) {
    setNuevoDocente(false);
    setEdDocenteId(d.id);
    setEdDocenteNombre(d.nombre_completo);
    setEdDocenteCorreo(d.correo ?? '');
    setEdDocenteCi(d.ci);
    setEdDocenteCodigo(d.codigo_docente ?? '');
    setEdDocenteTelefono(d.telefono ?? '');
    setEdDocenteEspecialidad(d.especialidad ?? '');
    setError(''); setMensaje('');
  }
  function guardarEdicionDocente(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edDocenteId) return;
    void ejecutar(() => editarDatosDocente(token, edDocenteId, {
      nombre_completo: edDocenteNombre, correo: edDocenteCorreo, ci: edDocenteCi,
      codigo_docente: edDocenteCodigo, telefono: edDocenteTelefono,
      especialidad: edDocenteEspecialidad,
    }), 'Datos del docente actualizados. Su contraseña se mantiene.', () => setEdDocenteId(''));
  }
  function comenzarEdicionMateria(m: Materia) {
    if (ocupado) return;
    setNuevaMateria(false);
    setEdMateriaId(m.id);
    setEdMateriaCodigo(m.codigo);
    setEdMateriaNombre(m.nombre);
    setEdMateriaSemestre(m.semestre == null ? '' : String(m.semestre));
    setError(''); setMensaje('');
  }
  function guardarEdicionMateria(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edMateriaId) return;
    void ejecutar(() => editarDatosMateria(token, edMateriaId, {
      codigo: edMateriaCodigo, nombre: edMateriaNombre,
      semestre: edMateriaSemestre ? Number(edMateriaSemestre) : null,
    }), 'Materia actualizada.', () => setEdMateriaId(''));
  }
  function cambiarMateria(id: string, activo: boolean) {
    const aviso = activo
      ? '¿Reactivar esta materia?'
      : '¿Desactivar esta materia? No podrá desactivarse si tiene asignaciones activas.';
    if (!window.confirm(aviso)) return;
    void ejecutar(() => establecerEstadoMateria(token,id,activo),
      activo ? 'Materia activada.' : 'Materia desactivada.', () => { if (edMateriaId===id) setEdMateriaId(''); });
  }
  function comenzarEdicionAsignacion(a: Asignacion) {
    if (ocupado) return;
    setNuevaAsignacion(false);
    setEdAsignacionId(a.id);
    setEdAsignacionDocente(a.docente_id);
    setEdAsignacionMateria(a.materia_id);
    setEdAsignacionGestion(a.gestion);
    setError(''); setMensaje('');
  }
  function guardarEdicionAsignacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edAsignacionId) return;
    void ejecutar(() => editarDatosAsignacion(token, edAsignacionId, {
      docente_id: edAsignacionDocente, materia_id: edAsignacionMateria,
      gestion: edAsignacionGestion,
    }), 'Asignación actualizada.', () => setEdAsignacionId(''));
  }
  function cambiarAsignacion(a: Asignacion) {
    const textoConfirmacion = a.activo
      ? `¿Desactivar la asignación de ${a.docente_nombre} — ${a.materia_nombre}? Desde ahora el docente no podrá marcar futuras clases de esta asignación. Las asistencias anteriores permanecerán guardadas.`
      : `¿Reactivar la asignación de ${a.docente_nombre} — ${a.materia_nombre}?`;
    if (!window.confirm(textoConfirmacion)) return;
    void ejecutar(() => establecerEstadoAsignacion(token,a.id,!a.activo),
      a.activo ? 'Asignación desactivada; historial conservado.' : 'Asignación reactivada.',
      () => { if (edAsignacionId===a.id) setEdAsignacionId(''); });
  }

  // Los formularios de todas las secciones ahora se abren en modales.
  // La tabla no se desplaza al editar o consultar el historial de Horarios.

  const docentesActivos = datos.docentes.filter(d=>d.activo && d.perfil_id);
  const materiasActivas = datos.materias.filter(m=>m.activo);
  const asignacionesActivas = datos.asignaciones.filter(a=>a.activo);
  const horarioHistorial = datos.horarios.find(h => h.id === historialId);
  const asignacionHistorial = datos.asignaciones.find(a => a.id === horarioHistorial?.asignacion_id);

  return (
    <section className="sgc-correspondencia sgc-plantel-pagina">
      <div className="sgc-pagina-encabezado">
        <h2>Plantel Docente y Asistencia</h2>
        <p>Administra cada proceso desde su sección, sin desplazarte por todos los formularios.</p>
      </div>
      <nav className="sgc-plantel-pestanas" role="tablist" aria-label="Secciones de Plantel Docente y Asistencia">
        {opcionesPlantel.map(opcion => {
          const Icono = opcion.icono;
          return (
          <button key={opcion.id} id={`sgc-tab-${opcion.id}`} type="button" role="tab"
            className={`sgc-plantel-pestana ${seccionActiva === opcion.id ? 'seleccionada' : ''}`}
            aria-selected={seccionActiva === opcion.id}
            aria-controls={`sgc-panel-${opcion.id}`}
            onClick={() => {
              setSeccionActiva(opcion.id);
              if (opcion.id !== 'docentes') { setNuevoDocente(false); setEdDocenteId(''); setPassword(''); }
              if (opcion.id !== 'materias') { setNuevaMateria(false); setEdMateriaId(''); }
              if (opcion.id !== 'asignaciones') { setNuevaAsignacion(false); setEdAsignacionId(''); }
              if (opcion.id !== 'horarios') { cerrarVentanaHorario(); cerrarHistorialHorario(); }
              setError(''); setMensaje('');
            }}
            title={opcion.descripcion}>
            <span className="sgc-plantel-pestana-icono" aria-hidden="true">
              <Icono size={20} strokeWidth={1.8} />
            </span>
            <span className="sgc-plantel-pestana-nombre">{opcion.nombre}</span>
            {opcion.id === 'docentes' && <span className="sgc-plantel-contador">{datos.docentes.length}</span>}
            {opcion.id === 'materias' && <span className="sgc-plantel-contador">{datos.materias.length}</span>}
            {opcion.id === 'asignaciones' && <span className="sgc-plantel-contador">{datos.asignaciones.length}</span>}
            {opcion.id === 'horarios' && <span className="sgc-plantel-contador">{datos.horarios.length}</span>}
          </button>
          );
        })}
      </nav>
      <div className="sgc-plantel-estado" aria-live="polite">
        {error && <div className="sgc-aviso" role="alert" style={{borderColor:'#b91c1c',color:'#b91c1c'}}>{error}</div>}
        {mensaje && <div className="sgc-aviso" role="status" style={{borderColor:'#166534'}}>{mensaje}</div>}
        {cargando && <p role="status">Actualizando información desde PostgreSQL...</p>}
      </div>
      {seccionActiva === 'docentes' && (
        <section className="sgc-plantel-vista" id="sgc-panel-docentes" role="tabpanel" aria-labelledby="sgc-tab-docentes" tabIndex={0}>
          <div className="sgc-plantel-vista-cabecera">
            <div><h3>Docentes</h3><p>Registra docentes y corrige sus datos de identificación y contacto.</p></div>
            <span className="sgc-plantel-chip">{datos.docentes.length} registrados</span>
          </div>
          <div className="sgc-plantel-acciones">
            <button type="button" className="sgc-btn-principal"
              aria-haspopup="dialog" onClick={abrirNuevoDocente} disabled={ocupado}>
              + Nuevo docente
            </button>
          </div>
        <div style={{overflowX:'auto',marginBottom:24}}>
          <h3>Docentes registrados ({datos.docentes.length})</h3>
          <table className="sgc-tabla"><thead><tr><th>Nombre</th><th>CI</th><th>Correo</th><th>Código</th><th>Especialidad</th><th>Activo</th><th>Acción</th></tr></thead>
            <tbody>{datos.docentes.map(d=><tr key={d.id}>
              <td>{d.nombre_completo}</td><td>{d.ci}</td><td>{d.correo ?? 'Sin cuenta'}</td>
              <td>{d.codigo_docente || '—'}</td><td>{d.especialidad || '—'}</td><td>{d.activo?'Sí':'No'}</td>
              <td><button type="button" aria-haspopup="dialog" disabled={ocupado || !d.perfil_id} onClick={()=>comenzarEdicionDocente(d)}>Editar</button></td>
            </tr>)}{!datos.docentes.length && <tr><td colSpan={7}>Todavía no hay docentes.</td></tr>}</tbody>
          </table>
        </div>

          {/* Ventanas emergentes de Docentes. Los otros cinco apartados no cambian. */}
          {nuevoDocente && (
            <ModalDocenteSGC
              titulo="Registrar nuevo docente"
              descripcion="Completa los datos para registrar al docente y crear su cuenta."
              ocupado={ocupado}
              onCerrar={cerrarVentanaDocente}
            >
              <form className="sgc-docente-modal-form" onSubmit={guardarDocente}>
                <div className="sgc-docente-modal-grid">
                  <label className="sgc-docente-modal-campo sgc-docente-modal-ancho">Nombre completo *
                    <input name="nombre" value={nombre} onChange={e=>setNombre(e.target.value)} required maxLength={150}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Correo institucional *
                    <input type="email" value={correo} onChange={e=>setCorreo(e.target.value)} required maxLength={150}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Contraseña temporal *
                    <input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} maxLength={128} required/>
                  </label>
                  <label className="sgc-docente-modal-campo">CI *
                    <input value={ci} onChange={e=>setCi(e.target.value)} required maxLength={30}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Código docente
                    <input value={codigoDocente} onChange={e=>setCodigoDocente(e.target.value)} maxLength={30}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Teléfono
                    <input value={telefono} onChange={e=>setTelefono(e.target.value)} maxLength={30}/>
                  </label>
                  <label className="sgc-docente-modal-campo sgc-docente-modal-ancho">Especialidad
                    <input value={especialidad} onChange={e=>setEspecialidad(e.target.value)} maxLength={120}/>
                  </label>
                </div>
                <p className="sgc-docente-modal-nota">La contraseña se cifra en el backend; utiliza una contraseña temporal diferente de las personales.</p>
                {error && <div className="sgc-docente-modal-error" role="alert">{error}</div>}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarVentanaDocente} disabled={ocupado}>Cancelar</button>
                  <button type="submit" className="sgc-btn-principal" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar docente'}</button>
                </div>
              </form>
            </ModalDocenteSGC>
          )}

          {Boolean(edDocenteId) && (
            <ModalDocenteSGC
              titulo="Editar docente"
              descripcion="Actualiza los datos de identificación y contacto. La contraseña no se modifica."
              ocupado={ocupado}
              onCerrar={cerrarVentanaDocente}
            >
              <form className="sgc-docente-modal-form" onSubmit={guardarEdicionDocente}>
                <div className="sgc-docente-modal-grid">
                  <label className="sgc-docente-modal-campo sgc-docente-modal-ancho">Nombre completo *
                    <input value={edDocenteNombre} onChange={e=>setEdDocenteNombre(e.target.value)} maxLength={150} required/>
                  </label>
                  <label className="sgc-docente-modal-campo">Correo *
                    <input type="email" value={edDocenteCorreo} onChange={e=>setEdDocenteCorreo(e.target.value)} maxLength={150} required/>
                  </label>
                  <label className="sgc-docente-modal-campo">CI *
                    <input value={edDocenteCi} onChange={e=>setEdDocenteCi(e.target.value)} maxLength={30} required/>
                  </label>
                  <label className="sgc-docente-modal-campo">Código docente
                    <input value={edDocenteCodigo} onChange={e=>setEdDocenteCodigo(e.target.value)} maxLength={30}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Teléfono
                    <input value={edDocenteTelefono} onChange={e=>setEdDocenteTelefono(e.target.value)} maxLength={30}/>
                  </label>
                  <label className="sgc-docente-modal-campo sgc-docente-modal-ancho">Especialidad
                    <input value={edDocenteEspecialidad} onChange={e=>setEdDocenteEspecialidad(e.target.value)} maxLength={120}/>
                  </label>
                </div>
                {error && <div className="sgc-docente-modal-error" role="alert">{error}</div>}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarVentanaDocente} disabled={ocupado}>Cancelar</button>
                  <button type="submit" className="sgc-btn-principal" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar cambios'}</button>
                </div>
              </form>
            </ModalDocenteSGC>
          )}

        </section>
      )}
      {seccionActiva === 'materias' && (
        <section className="sgc-plantel-vista" id="sgc-panel-materias" role="tabpanel" aria-labelledby="sgc-tab-materias" tabIndex={0}>
          <div className="sgc-plantel-vista-cabecera">
            <div><h3>Materias</h3><p>Gestiona el catálogo y activa o desactiva las materias.</p></div>
            <span className="sgc-plantel-chip">{datos.materias.length} materias</span>
          </div>
          <div className="sgc-plantel-acciones">
            <button type="button" className="sgc-btn-principal" aria-haspopup="dialog"
              onClick={abrirNuevaMateria} disabled={ocupado}>+ Nueva materia</button>
          </div>

          {nuevaMateria && (
            <ModalDocenteSGC
              titulo="Registrar nueva materia"
              descripcion="Registra una materia en el catálogo. Los campos con * son obligatorios."
              ocupado={ocupado}
              onCerrar={cerrarVentanaMateria}
            >
              <form className="sgc-docente-modal-form" onSubmit={guardarMateria}>
                <div className="sgc-docente-modal-grid">
                  <label className="sgc-docente-modal-campo">Código *
                    <input value={codigoMateria} onChange={e=>setCodigoMateria(e.target.value)} required maxLength={30}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Nombre *
                    <input value={nombreMateria} onChange={e=>setNombreMateria(e.target.value)} required maxLength={150}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Semestre
                    <input type="number" min={1} max={12} value={semestre} onChange={e=>setSemestre(e.target.value)}/>
                  </label>
                </div>
                {error && <div className="sgc-docente-modal-error" role="alert">{error}</div>}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarVentanaMateria} disabled={ocupado}>Cancelar</button>
                  <button type="submit" className="sgc-btn-principal" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar materia'}</button>
                </div>
              </form>
            </ModalDocenteSGC>
          )}

          {Boolean(edMateriaId) && (
            <ModalDocenteSGC
              titulo="Editar materia"
              descripcion="Actualiza el código, nombre o semestre de la materia seleccionada."
              ocupado={ocupado}
              onCerrar={cerrarVentanaMateria}
            >
              <form className="sgc-docente-modal-form" onSubmit={guardarEdicionMateria}>
                <div className="sgc-docente-modal-grid">
                  <label className="sgc-docente-modal-campo">Código *
                    <input value={edMateriaCodigo} onChange={e=>setEdMateriaCodigo(e.target.value)} required maxLength={30}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Nombre *
                    <input value={edMateriaNombre} onChange={e=>setEdMateriaNombre(e.target.value)} required maxLength={150}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Semestre
                    <input type="number" min={1} max={12} value={edMateriaSemestre} onChange={e=>setEdMateriaSemestre(e.target.value)}/>
                  </label>
                </div>
                {error && <div className="sgc-docente-modal-error" role="alert">{error}</div>}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarVentanaMateria} disabled={ocupado}>Cancelar</button>
                  <button type="submit" className="sgc-btn-principal" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar cambios'}</button>
                </div>
              </form>
            </ModalDocenteSGC>
          )}
        <div style={{overflowX:'auto',marginBottom:24}}>
          <h3>Materias ({datos.materias.length})</h3>
          <table className="sgc-tabla"><thead><tr><th>Código</th><th>Materia</th><th>Semestre</th><th>Activo</th><th>Acción</th></tr></thead>
            <tbody>{datos.materias.map(m=><tr key={m.id}><td>{m.codigo}</td><td>{m.nombre}</td><td>{m.semestre ?? '—'}</td><td>{m.activo?'Sí':'No'}</td>
              <td><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button type="button" aria-haspopup="dialog" disabled={ocupado} onClick={()=>comenzarEdicionMateria(m)}>Editar</button>
                <button type="button" disabled={ocupado} onClick={()=>cambiarMateria(m.id,!m.activo)}>{m.activo?'Desactivar':'Activar'}</button>
              </div></td></tr>)}
            {!datos.materias.length && <tr><td colSpan={5}>Todavía no hay materias.</td></tr>}</tbody>
          </table>
        </div>

        </section>
      )}
      {seccionActiva === 'asignaciones' && (
        <section className="sgc-plantel-vista" id="sgc-panel-asignaciones" role="tabpanel" aria-labelledby="sgc-tab-asignaciones" tabIndex={0}>
          <div className="sgc-plantel-vista-cabecera">
            <div><h3>Asignaciones</h3><p>Relaciona docentes con materias y gestiones sin perder el historial.</p></div>
            <span className="sgc-plantel-chip">{datos.asignaciones.length} asignaciones</span>
          </div>
          <div className="sgc-plantel-acciones">
            <button type="button" className="sgc-btn-principal" aria-haspopup="dialog"
              disabled={ocupado} onClick={abrirNuevaAsignacion}>+ Nueva asignación</button>
          </div>
          {nuevaAsignacion && (
            <ModalDocenteSGC
              titulo="Nueva asignación"
              descripcion="Selecciona un docente activo, una materia activa y la gestión correspondiente."
              ocupado={ocupado}
              onCerrar={cerrarVentanaAsignacion}
            >
              <form className="sgc-docente-modal-form sgc-asignaciones-modal" onSubmit={guardarAsignacion}>
                <div className="sgc-docente-modal-grid">
                  <label className="sgc-docente-modal-campo">Docente *
                    <select value={docenteId} onChange={e=>setDocenteId(e.target.value)} required>
                      <option value="">Selecciona docente</option>
                      {docentesActivos.map(d=><option key={d.id} value={d.id}>{d.nombre_completo} — {d.ci}</option>)}
                    </select>
                  </label>
                  <label className="sgc-docente-modal-campo">Materia *
                    <select value={materiaId} onChange={e=>setMateriaId(e.target.value)} required>
                      <option value="">Selecciona materia</option>
                      {materiasActivas.map(m=><option key={m.id} value={m.id}>{m.codigo} — {m.nombre}</option>)}
                    </select>
                  </label>
                  <label className="sgc-docente-modal-campo">Gestión *
                    <input type="number" min={2000} max={2100} value={gestion} onChange={e=>setGestion(Number(e.target.value))} required />
                  </label>
                </div>
                <p className="sgc-docente-modal-nota">
                  Los cambios posteriores a una asignación que tenga horarios se gestionan creando una nueva asignación, para conservar el historial.
                </p>
                {error && <div className="sgc-docente-modal-error" role="alert">{error}</div>}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarVentanaAsignacion} disabled={ocupado}>Cancelar</button>
                  <button type="submit" className="sgc-btn-principal" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Crear asignación'}</button>
                </div>
              </form>
            </ModalDocenteSGC>
          )}

          {Boolean(edAsignacionId) && (
            <ModalDocenteSGC
              titulo="Editar asignación"
              descripcion="Modifica la asignación seleccionada si todavía no tiene horarios registrados."
              ocupado={ocupado}
              onCerrar={cerrarVentanaAsignacion}
            >
              <form className="sgc-docente-modal-form sgc-asignaciones-modal" onSubmit={guardarEdicionAsignacion}>
                <div className="sgc-docente-modal-grid">
                  <label className="sgc-docente-modal-campo">Docente *
                    <select value={edAsignacionDocente} onChange={e=>setEdAsignacionDocente(e.target.value)} required>
                      <option value="">Seleccionar docente</option>
                      {docentesActivos.map(d=><option key={d.id} value={d.id}>{d.nombre_completo}</option>)}
                    </select>
                  </label>
                  <label className="sgc-docente-modal-campo">Materia *
                    <select value={edAsignacionMateria} onChange={e=>setEdAsignacionMateria(e.target.value)} required>
                      <option value="">Seleccionar materia</option>
                      {materiasActivas.map(m=><option key={m.id} value={m.id}>{m.codigo} — {m.nombre}</option>)}
                    </select>
                  </label>
                  <label className="sgc-docente-modal-campo">Gestión *
                    <input type="number" min={2000} max={2100} value={edAsignacionGestion} onChange={e=>setEdAsignacionGestion(Number(e.target.value))} required />
                  </label>
                </div>
                <p className="sgc-docente-modal-nota">
                  Si ya existen horarios, no se permite cambiar docente ni materia. Desactiva la asignación anterior y crea otra para preservar las asistencias.
                </p>
                {error && <div className="sgc-docente-modal-error" role="alert">{error}</div>}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarVentanaAsignacion} disabled={ocupado}>Cancelar</button>
                  <button type="submit" className="sgc-btn-principal" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar cambios'}</button>
                </div>
              </form>
            </ModalDocenteSGC>
          )}
        <div style={{overflowX:'auto',marginBottom:24}}>
          <h3>Asignaciones ({datos.asignaciones.length})</h3>
          <table className="sgc-tabla"><thead><tr><th>Docente</th><th>Materia</th><th>Gestión</th><th>Activo</th><th>Acción</th></tr></thead>
            <tbody>{datos.asignaciones.map(a=>{
              const conHorarios=datos.horarios.some(h=>h.asignacion_id===a.id);
              return <tr key={a.id}><td>{a.docente_nombre}</td><td>{a.materia_nombre}</td><td>{a.gestion}</td><td>{a.activo?'Sí':'No'}</td>
                <td><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button type="button" aria-haspopup="dialog" disabled={ocupado || !a.activo || conHorarios}
                    title={conHorarios?'Tiene horarios: desactiva esta asignación y crea otra para conservar las asistencias.':'Editar asignación sin horarios'}
                    onClick={()=>comenzarEdicionAsignacion(a)}>Editar</button>
                  <button type="button" disabled={ocupado} onClick={()=>cambiarAsignacion(a)}>{a.activo?'Desactivar':'Activar'}</button>
                </div></td>
              </tr>;
            })}
            {!datos.asignaciones.length && <tr><td colSpan={5}>Todavía no hay asignaciones.</td></tr>}</tbody>
          </table>
        </div>

        </section>
      )}
      {seccionActiva === 'horarios' && (
        <section className="sgc-plantel-vista" id="sgc-panel-horarios" role="tabpanel" aria-labelledby="sgc-tab-horarios" tabIndex={0}>
          <div className="sgc-plantel-vista-cabecera">
            <div><h3>Horarios</h3><p>Crea horarios, programa cambios futuros y consulta los motivos registrados.</p></div>
            <span className="sgc-plantel-chip">{datos.horarios.length} horarios</span>
          </div>
          <div className="sgc-plantel-acciones">
            <button type="button" className="sgc-btn-principal" aria-haspopup="dialog"
              onClick={abrirNuevoHorario} disabled={ocupado}>+ Nuevo horario</button>
          </div>

          {nuevoHorario && (
            <ModalDocenteSGC
              titulo="Registrar horario de clase"
              descripcion="Selecciona una asignación activa, el día y la franja horaria."
              ocupado={ocupado}
              onCerrar={cerrarVentanaHorario}
            >
              <form className="sgc-docente-modal-form sgc-horarios-modal" onSubmit={guardarHorario}>
                <div className="sgc-docente-modal-grid">
                  <label className="sgc-docente-modal-campo sgc-docente-modal-ancho">Asignación *
                    <select value={asignacionId} onChange={e=>setAsignacionId(e.target.value)} required>
                      <option value="">Selecciona asignación</option>
                      {asignacionesActivas.map(a=><option key={a.id} value={a.id}>{a.docente_nombre} — {a.materia_nombre} ({a.gestion})</option>)}
                    </select>
                  </label>
                  <label className="sgc-docente-modal-campo">Día de la semana *
                    <select value={dia} onChange={e=>setDia(Number(e.target.value))} required>
                      {dias.slice(1).map((nombre,i)=><option value={i+1} key={nombre}>{nombre}</option>)}
                    </select>
                  </label>
                  <label className="sgc-docente-modal-campo">Aula
                    <input value={aula} onChange={e=>setAula(e.target.value)} maxLength={50}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Hora de inicio *
                    <input type="time" value={inicio} onChange={e=>setInicio(e.target.value)} required/>
                  </label>
                  <label className="sgc-docente-modal-campo">Hora de fin *
                    <input type="time" value={fin} onChange={e=>setFin(e.target.value)} required min={inicio}/>
                  </label>
                </div>
                <p className="sgc-docente-modal-nota">Solo se muestran asignaciones activas. Los horarios y asistencias anteriores se conservan.</p>
                {error && <div className="sgc-docente-modal-error" role="alert">{error}</div>}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarVentanaHorario} disabled={ocupado}>Cancelar</button>
                  <button type="submit" className="sgc-btn-principal" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Guardar horario'}</button>
                </div>
              </form>
            </ModalDocenteSGC>
          )}

          {Boolean(editarId) && (
            <ModalDocenteSGC
              titulo="Programar cambio de horario"
              descripcion="Se creará una nueva versión desde la fecha indicada; no modifica las asistencias anteriores."
              ocupado={ocupado}
              onCerrar={cerrarVentanaHorario}
            >
              <form className="sgc-docente-modal-form sgc-horarios-modal" onSubmit={guardarCambioHorario}>
                <div className="sgc-docente-modal-grid">
                  <label className="sgc-docente-modal-campo">Nuevo día *
                    <select value={nuevoDia} onChange={e=>setNuevoDia(Number(e.target.value))} required>
                      {dias.slice(1).map((nombre,i)=><option key={nombre} value={i+1}>{nombre}</option>)}
                    </select>
                  </label>
                  <label className="sgc-docente-modal-campo">Nueva aula
                    <input value={nuevaAula} onChange={e=>setNuevaAula(e.target.value)} maxLength={50}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Hora de inicio *
                    <input type="time" value={nuevoInicio} onChange={e=>setNuevoInicio(e.target.value)} required/>
                  </label>
                  <label className="sgc-docente-modal-campo">Hora de fin *
                    <input type="time" value={nuevoFin} onChange={e=>setNuevoFin(e.target.value)} required min={nuevoInicio}/>
                  </label>
                  <label className="sgc-docente-modal-campo">Fecha de vigencia *
                    <input type="date" value={vigencia} onChange={e=>setVigencia(e.target.value)} required/>
                  </label>
                  <label className="sgc-docente-modal-campo sgc-docente-modal-ancho">Motivo del cambio *
                    <input value={motivoCambio} onChange={e=>setMotivoCambio(e.target.value)} minLength={1} maxLength={500} required placeholder="Ej. Cambio aprobado por Dirección"/>
                  </label>
                </div>
                <p className="sgc-docente-modal-nota">La vigencia debe iniciar desde mañana o una fecha posterior. El backend valida esta regla.</p>
                {error && <div className="sgc-docente-modal-error" role="alert">{error}</div>}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarVentanaHorario} disabled={ocupado}>Cancelar</button>
                  <button type="submit" className="sgc-btn-principal" disabled={ocupado}>{ocupado ? 'Guardando...' : 'Programar cambio'}</button>
                </div>
              </form>
            </ModalDocenteSGC>
          )}

          {Boolean(historialId) && (
            <ModalDocenteSGC
              titulo="Historial de cambios de horario"
              descripcion={`${asignacionHistorial?.docente_nombre ?? 'Docente'} — ${asignacionHistorial?.materia_nombre ?? 'Materia'}. Cada modificación conserva la versión anterior y su autorización.`}
              ocupado={false}
              onCerrar={cerrarHistorialHorario}
            >
              <div id="sgc-historial-horarios" className="sgc-horarios-historial" aria-live="polite">
                {historialCargando && <p role="status">Consultando historial...</p>}
                {historialError && <p className="sgc-docente-modal-error" role="alert">{historialError}</p>}
                {!historialCargando && !historialError && historial.length===0 && <p>Este horario todavía no tiene cambios registrados.</p>}
                {!historialCargando && !historialError && historial.map(c=><article key={c.id} className="sgc-horarios-cambio">
                  <strong>Cambio #{c.id} · Vigente desde {c.vigencia_desde}</strong>
                  <div className="sgc-horarios-cambio-comparacion">
                    <div className="sgc-horarios-cambio-anterior">
                      <strong>Horario anterior</strong>
                      <span>{dias[c.anterior_dia]} · {c.anterior_inicio}–{c.anterior_fin}</span>
                      <span>Aula: {c.anterior_aula || 'Sin aula'}</span>
                      <small>Vigente: {c.anterior_desde} al {c.anterior_hasta ?? 'sin término'}</small>
                    </div>
                    <div className="sgc-horarios-cambio-nuevo">
                      <strong>Horario nuevo</strong>
                      <span>{dias[c.nuevo_dia]} · {c.nuevo_inicio}–{c.nuevo_fin}</span>
                      <span>Aula: {c.nuevo_aula || 'Sin aula'}</span>
                      <small>Vigente: {c.nuevo_desde} al {c.nuevo_hasta ?? 'sin término'}</small>
                    </div>
                  </div>
                  <p><strong>Motivo:</strong> {c.motivo}</p>
                  <p><strong>Autorizado por:</strong> {c.autorizado_nombre}</p>
                  <small><strong>Registrado el:</strong> {c.fecha_cambio} (hora de Bolivia)</small>
                </article>)}
                <div className="sgc-docente-modal-acciones">
                  <button type="button" className="sgc-docente-modal-cancelar" onClick={cerrarHistorialHorario}>Cerrar historial</button>
                </div>
              </div>
            </ModalDocenteSGC>
          )}

        <div style={{overflowX:'auto',marginBottom:24}}>
          <h3>Horarios y vigencias ({datos.horarios.length})</h3>
          <p>Los cambios se programan desde una fecha futura. Las asistencias y solicitudes anteriores mantienen el horario original.</p>
          <table className="sgc-tabla"><thead><tr><th>Docente</th><th>Materia</th><th>Día</th><th>Horario</th><th>Aula</th><th>Vigente desde</th><th>Vigente hasta</th><th>Acción</th></tr></thead>
            <tbody>{datos.horarios.map(h=>{
              const a=datos.asignaciones.find(x=>x.id===h.asignacion_id);
              return <tr key={h.id}><td>{a?.docente_nombre ?? '—'}</td><td>{a?.materia_nombre ?? '—'}</td>
                <td>{dias[h.dia_semana] ?? h.dia_semana}</td><td>{h.hora_inicio}–{h.hora_fin}</td><td>{h.aula||'—'}</td>
                <td>{h.vigencia_desde}</td><td>{h.vigencia_hasta ?? 'Sin término'}</td>
                <td>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button type="button" disabled={ocupado || !h.activo || (!!h.vigencia_hasta && h.vigencia_hasta <= new Date().toISOString().slice(0,10))}
                      onClick={()=>editarHorario(h.id)} aria-haspopup="dialog">Editar</button>
                    <button type="button" aria-expanded={historialId===h.id} aria-haspopup="dialog"
                      onClick={()=>{void verHistorial(h.id);}}>
                      {historialId===h.id ? 'Ocultar historial' : 'Ver historial'}
                    </button>
                  </div>
                </td></tr>;
            })}{!datos.horarios.length && <tr><td colSpan={8}>Todavía no hay horarios.</td></tr>}</tbody>
          </table>
        </div>

        </section>
      )}
      {seccionActiva === 'asistencias' && (
        <section className="sgc-plantel-vista" id="sgc-panel-asistencias" role="tabpanel" aria-labelledby="sgc-tab-asistencias" tabIndex={0}>
          <div className="sgc-plantel-vista-cabecera">
            <div><h3>Control de asistencias</h3><p>Consulta fotografías, revisa correcciones y justificaciones.</p></div>
            
          </div>
          <ControlAsistencia token={token} docentes={datos.docentes} />
        </section>
      )}
      {seccionActiva === 'reportes' && (
        <section className="sgc-plantel-vista" id="sgc-panel-reportes" role="tabpanel" aria-labelledby="sgc-tab-reportes" tabIndex={0}>
          <div className="sgc-plantel-vista-cabecera">
            <div><h3>Reportes de asistencia</h3><p>Filtra estadísticas y exporta informes sin salir del módulo.</p></div>
            
          </div>
          <ReportesAsistencia token={token} docentes={datos.docentes} materias={datos.materias} />
        </section>
      )}
    </section>
  );
}
