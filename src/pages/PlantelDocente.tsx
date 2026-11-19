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

type Props = { token: string };
type SeccionPlantel = 'docentes' | 'materias' | 'asignaciones' | 'horarios' | 'asistencias' | 'reportes';
const opcionesPlantel: { id: SeccionPlantel; nombre: string; icono: string; descripcion: string }[] = [
  { id: 'docentes', nombre: 'Docentes', icono: '👤', descripcion: 'Cuentas y datos de docentes' },
  { id: 'materias', nombre: 'Materias', icono: '📚', descripcion: 'Catálogo de materias' },
  { id: 'asignaciones', nombre: 'Asignaciones', icono: '🗂️', descripcion: 'Materias asignadas por docente' },
  { id: 'horarios', nombre: 'Horarios', icono: '🗓️', descripcion: 'Registro, cambios y vigencias' },
  { id: 'asistencias', nombre: 'Asistencias', icono: '✅', descripcion: 'Marcados y solicitudes' },
  { id: 'reportes', nombre: 'Reportes', icono: '📊', descripcion: 'Informes y exportaciones' },
];
const dias = ['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const tarjeta: React.CSSProperties = {
  border: '1px solid #ddd6e7', borderRadius: 12, padding: 18,
  display: 'grid', gap: 12, marginBottom: 20, background: '#fff',
};
const fila: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' };
const campo: React.CSSProperties = { display: 'grid', gap: 5, minWidth: 175, flex: '1 1 175px' };
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
  function guardarMateria(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearMateria(token, {
      codigo:codigoMateria, nombre:nombreMateria,
      ...(semestre ? { semestre:Number(semestre) } : {}),
    }), 'Materia registrada correctamente.', () => {
      setCodigoMateria('');setNombreMateria('');setSemestre('');setNuevaMateria(false);
    });
  }
  function guardarAsignacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearAsignacion(token, {
      docente_id: docenteId, materia_id:materiaId, gestion,
    }), 'Asignación registrada correctamente.', () => {
      setDocenteId('');setMateriaId('');setNuevaAsignacion(false);
    });
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

  // Lleva al formulario de edición tras montarlo, incluso si la tabla es larga.
  useEffect(() => {
    const id = seccionActiva === 'docentes' && edDocenteId ? 'sgc-edicion-docente'
      : seccionActiva === 'materias' && edMateriaId ? 'sgc-edicion-materia'
      : seccionActiva === 'asignaciones' && edAsignacionId ? 'sgc-edicion-asignacion'
      : seccionActiva === 'horarios' && editarId ? 'sgc-edicion-horario'
      : null;
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [seccionActiva, edDocenteId, edMateriaId, edAsignacionId, editarId]);

  useEffect(() => {
    if (seccionActiva === 'horarios' && historialId) {
      document.getElementById('sgc-historial-horarios')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [seccionActiva, historialId]);

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
        {opcionesPlantel.map(opcion => (
          <button key={opcion.id} id={`sgc-tab-${opcion.id}`} type="button" role="tab"
            className={`sgc-plantel-pestana ${seccionActiva === opcion.id ? 'seleccionada' : ''}`}
            aria-selected={seccionActiva === opcion.id}
            aria-controls={`sgc-panel-${opcion.id}`}
            onClick={() => { setSeccionActiva(opcion.id); setError(''); setMensaje(''); }}
            title={opcion.descripcion}>
            <span aria-hidden="true">{opcion.icono}</span><span>{opcion.nombre}</span>
            {opcion.id === 'docentes' && <span className="sgc-plantel-contador">{datos.docentes.length}</span>}
            {opcion.id === 'materias' && <span className="sgc-plantel-contador">{datos.materias.length}</span>}
            {opcion.id === 'asignaciones' && <span className="sgc-plantel-contador">{datos.asignaciones.length}</span>}
            {opcion.id === 'horarios' && <span className="sgc-plantel-contador">{datos.horarios.length}</span>}
          </button>
        ))}
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
            <button type="button" className="sgc-btn-principal" aria-expanded={nuevoDocente} aria-controls="sgc-form-docente"
              onClick={() => setNuevoDocente(!nuevoDocente)}>{nuevoDocente ? 'Cerrar formulario' : '+ Nuevo docente'}</button>
          </div>
          {nuevoDocente && <div id="sgc-form-docente">
        <form style={tarjeta} onSubmit={guardarDocente}>
          <h3>1. Registrar docente y crear su cuenta</h3>
          <div style={fila}>
            <label style={campo}>Nombre completo *<input value={nombre} onChange={e=>setNombre(e.target.value)} required maxLength={150}/></label>
            <label style={campo}>Correo institucional *<input type="email" value={correo} onChange={e=>setCorreo(e.target.value)} required maxLength={150}/></label>
            <label style={campo}>Contraseña temporal *<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} maxLength={128} required/></label>
          </div>
          <div style={fila}>
            <label style={campo}>CI *<input value={ci} onChange={e=>setCi(e.target.value)} required maxLength={30}/></label>
            <label style={campo}>Código docente<input value={codigoDocente} onChange={e=>setCodigoDocente(e.target.value)} maxLength={30}/></label>
            <label style={campo}>Teléfono<input value={telefono} onChange={e=>setTelefono(e.target.value)} maxLength={30}/></label>
            <label style={campo}>Especialidad<input value={especialidad} onChange={e=>setEspecialidad(e.target.value)} maxLength={120}/></label>
          </div>
          <small>La contraseña se cifra en el backend; no se muestra ni se almacena en texto plano. Usar contraseña temporal distinta de las personales.</small>
          <div><button className="sgc-btn-principal" disabled={ocupado}>Guardar docente</button></div>
        </form>
          </div>}

        {edDocenteId && <form id="sgc-edicion-docente" style={tarjeta} onSubmit={guardarEdicionDocente}>
          <h3>Editar datos del docente</h3>
          <p>Modifica datos de identificación y contacto. La contraseña no cambia.</p>
          <div style={fila}>
            <label style={campo}>Nombre completo *<input value={edDocenteNombre} onChange={e=>setEdDocenteNombre(e.target.value)} maxLength={150} required/></label>
            <label style={campo}>Correo *<input type="email" value={edDocenteCorreo} onChange={e=>setEdDocenteCorreo(e.target.value)} maxLength={150} required/></label>
            <label style={campo}>CI *<input value={edDocenteCi} onChange={e=>setEdDocenteCi(e.target.value)} maxLength={30} required/></label>
            <label style={campo}>Código docente<input value={edDocenteCodigo} onChange={e=>setEdDocenteCodigo(e.target.value)} maxLength={30}/></label>
            <label style={campo}>Teléfono<input value={edDocenteTelefono} onChange={e=>setEdDocenteTelefono(e.target.value)} maxLength={30}/></label>
            <label style={campo}>Especialidad<input value={edDocenteEspecialidad} onChange={e=>setEdDocenteEspecialidad(e.target.value)} maxLength={120}/></label>
          </div>
          <div style={fila}>
            <button className="sgc-btn-principal" disabled={ocupado}>Guardar cambios</button>
            <button type="button" onClick={()=>setEdDocenteId('')} disabled={ocupado}>Cancelar</button>
          </div>
        </form>}
        <div style={{overflowX:'auto',marginBottom:24}}>
          <h3>Docentes registrados ({datos.docentes.length})</h3>
          <table className="sgc-tabla"><thead><tr><th>Nombre</th><th>CI</th><th>Correo</th><th>Código</th><th>Especialidad</th><th>Activo</th><th>Acción</th></tr></thead>
            <tbody>{datos.docentes.map(d=><tr key={d.id}>
              <td>{d.nombre_completo}</td><td>{d.ci}</td><td>{d.correo ?? 'Sin cuenta'}</td>
              <td>{d.codigo_docente || '—'}</td><td>{d.especialidad || '—'}</td><td>{d.activo?'Sí':'No'}</td>
              <td><button type="button" disabled={ocupado || !d.perfil_id} onClick={()=>comenzarEdicionDocente(d)}>Editar</button></td>
            </tr>)}{!datos.docentes.length && <tr><td colSpan={7}>Todavía no hay docentes.</td></tr>}</tbody>
          </table>
        </div>

        </section>
      )}
      {seccionActiva === 'materias' && (
        <section className="sgc-plantel-vista" id="sgc-panel-materias" role="tabpanel" aria-labelledby="sgc-tab-materias" tabIndex={0}>
          <div className="sgc-plantel-vista-cabecera">
            <div><h3>Materias</h3><p>Gestiona el catálogo y activa o desactiva las materias.</p></div>
            <span className="sgc-plantel-chip">{datos.materias.length} materias</span>
          </div>
          <div className="sgc-plantel-acciones">
            <button type="button" className="sgc-btn-principal" aria-expanded={nuevaMateria} aria-controls="sgc-form-materia"
              onClick={() => setNuevaMateria(!nuevaMateria)}>{nuevaMateria ? 'Cerrar formulario' : '+ Nueva materia'}</button>
          </div>
          {nuevaMateria && <div id="sgc-form-materia">
        <form style={tarjeta} onSubmit={guardarMateria}>
          <h3>2. Registrar materia</h3>
          <div style={fila}>
            <label style={campo}>Código *<input value={codigoMateria} onChange={e=>setCodigoMateria(e.target.value)} required maxLength={30}/></label>
            <label style={campo}>Nombre *<input value={nombreMateria} onChange={e=>setNombreMateria(e.target.value)} required maxLength={150}/></label>
            <label style={campo}>Semestre de la materia<input type="number" min={1} max={12} value={semestre} onChange={e=>setSemestre(e.target.value)}/></label>
            <button className="sgc-btn-principal" disabled={ocupado}>Guardar materia</button>
          </div>
        </form>
          </div>}

        {edMateriaId && <form id="sgc-edicion-materia" style={tarjeta} onSubmit={guardarEdicionMateria}>
          <h3>Editar materia</h3>
          <div style={fila}>
            <label style={campo}>Código *<input value={edMateriaCodigo} onChange={e=>setEdMateriaCodigo(e.target.value)} maxLength={30} required/></label>
            <label style={campo}>Nombre *<input value={edMateriaNombre} onChange={e=>setEdMateriaNombre(e.target.value)} maxLength={150} required/></label>
            <label style={campo}>Semestre<input type="number" min={1} max={12} value={edMateriaSemestre} onChange={e=>setEdMateriaSemestre(e.target.value)}/></label>
          </div>
          <div style={fila}>
            <button className="sgc-btn-principal" disabled={ocupado}>Guardar cambios</button>
            <button type="button" disabled={ocupado} onClick={()=>setEdMateriaId('')}>Cancelar</button>
          </div>
        </form>}
        <div style={{overflowX:'auto',marginBottom:24}}>
          <h3>Materias ({datos.materias.length})</h3>
          <table className="sgc-tabla"><thead><tr><th>Código</th><th>Materia</th><th>Semestre</th><th>Activo</th><th>Acción</th></tr></thead>
            <tbody>{datos.materias.map(m=><tr key={m.id}><td>{m.codigo}</td><td>{m.nombre}</td><td>{m.semestre ?? '—'}</td><td>{m.activo?'Sí':'No'}</td>
              <td><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button type="button" disabled={ocupado} onClick={()=>comenzarEdicionMateria(m)}>Editar</button>
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
            <button type="button" className="sgc-btn-principal" aria-expanded={nuevaAsignacion} aria-controls="sgc-form-asignación"
              onClick={() => setNuevaAsignacion(!nuevaAsignacion)}>{nuevaAsignacion ? 'Cerrar formulario' : '+ Nueva asignación'}</button>
          </div>
          {nuevaAsignacion && <div id="sgc-form-asignación">
        <form style={tarjeta} onSubmit={guardarAsignacion}>
          <h3>3. Asignar materia a docente</h3>
          <div style={fila}>
            <label style={campo}>Docente *<select value={docenteId} onChange={e=>setDocenteId(e.target.value)} required>
              <option value="">Selecciona docente</option>{docentesActivos.map(d=><option key={d.id} value={d.id}>{d.nombre_completo} — {d.ci}</option>)}
            </select></label>
            <label style={campo}>Materia *<select value={materiaId} onChange={e=>setMateriaId(e.target.value)} required>
              <option value="">Selecciona materia</option>{materiasActivas.map(m=><option key={m.id} value={m.id}>{m.codigo} — {m.nombre}</option>)}
            </select></label>
            <label style={campo}>Gestión *<input type="number" min={2000} max={2100} value={gestion} onChange={e=>setGestion(Number(e.target.value))} required/></label>
            <button className="sgc-btn-principal" disabled={ocupado}>Crear asignación</button>
          </div>
        </form>
          </div>}

        {edAsignacionId && <form id="sgc-edicion-asignacion" style={tarjeta} onSubmit={guardarEdicionAsignacion}>
          <h3>Editar asignación sin horarios</h3>
          <p>Si una asignación ya tiene horarios, no se puede cambiar su docente o materia: desactívala y crea otra para conservar el historial.</p>
          <div style={fila}>
            <label style={campo}>Docente *<select value={edAsignacionDocente} onChange={e=>setEdAsignacionDocente(e.target.value)} required>
              <option value="">Seleccionar docente</option>{docentesActivos.map(d=><option key={d.id} value={d.id}>{d.nombre_completo}</option>)}
            </select></label>
            <label style={campo}>Materia *<select value={edAsignacionMateria} onChange={e=>setEdAsignacionMateria(e.target.value)} required>
              <option value="">Seleccionar materia</option>{materiasActivas.map(m=><option key={m.id} value={m.id}>{m.codigo} — {m.nombre}</option>)}
            </select></label>
            <label style={campo}>Gestión *<input type="number" min={2000} max={2100} value={edAsignacionGestion} onChange={e=>setEdAsignacionGestion(Number(e.target.value))} required/></label>
          </div>
          <div style={fila}>
            <button className="sgc-btn-principal" disabled={ocupado}>Guardar cambios</button>
            <button type="button" disabled={ocupado} onClick={()=>setEdAsignacionId('')}>Cancelar</button>
          </div>
        </form>}
        <div style={{overflowX:'auto',marginBottom:24}}>
          <h3>Asignaciones ({datos.asignaciones.length})</h3>
          <table className="sgc-tabla"><thead><tr><th>Docente</th><th>Materia</th><th>Gestión</th><th>Activo</th><th>Acción</th></tr></thead>
            <tbody>{datos.asignaciones.map(a=>{
              const conHorarios=datos.horarios.some(h=>h.asignacion_id===a.id);
              return <tr key={a.id}><td>{a.docente_nombre}</td><td>{a.materia_nombre}</td><td>{a.gestion}</td><td>{a.activo?'Sí':'No'}</td>
                <td><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button type="button" disabled={ocupado || !a.activo || conHorarios}
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
            <button type="button" className="sgc-btn-principal" aria-expanded={nuevoHorario} aria-controls="sgc-form-horario"
              onClick={() => setNuevoHorario(!nuevoHorario)}>{nuevoHorario ? 'Cerrar formulario' : '+ Nuevo horario'}</button>
          </div>
          {nuevoHorario && <div id="sgc-form-horario">
        <form style={tarjeta} onSubmit={guardarHorario}>
          <h3>4. Registrar horario de clase</h3>
          <div style={fila}>
            <label style={campo}>Asignación *<select value={asignacionId} onChange={e=>setAsignacionId(e.target.value)} required>
              <option value="">Selecciona asignación</option>{asignacionesActivas.map(a=><option key={a.id} value={a.id}>{a.docente_nombre} — {a.materia_nombre} ({a.gestion})</option>)}
            </select></label>
            <label style={campo}>Día *<select value={dia} onChange={e=>setDia(Number(e.target.value))}>
              {dias.slice(1).map((nombre,i)=><option value={i+1} key={nombre}>{nombre}</option>)}
            </select></label>
            <label style={campo}>Inicio *<input type="time" value={inicio} onChange={e=>setInicio(e.target.value)} required/></label>
            <label style={campo}>Fin *<input type="time" value={fin} onChange={e=>setFin(e.target.value)} required/></label>
            <label style={campo}>Aula<input value={aula} onChange={e=>setAula(e.target.value)} maxLength={50}/></label>
          </div>
          <div><button className="sgc-btn-principal" disabled={ocupado}>Guardar horario</button></div>
        </form>
          </div>}

        {editarId && <form id="sgc-edicion-horario" style={tarjeta} onSubmit={guardarCambioHorario}>
          <h3>5. Programar cambio de horario</h3>
          <p>Este cambio creará una nueva versión del horario. El registro anterior conservará las asistencias y fotos ya registradas.</p>
          <div style={fila}>
            <label style={campo}>Nuevo día *<select value={nuevoDia} onChange={e=>setNuevoDia(Number(e.target.value))}>
              {dias.slice(1).map((nombre,i)=><option key={nombre} value={i+1}>{nombre}</option>)}
            </select></label>
            <label style={campo}>Hora de inicio *<input type="time" value={nuevoInicio} onChange={e=>setNuevoInicio(e.target.value)} required/></label>
            <label style={campo}>Hora de fin *<input type="time" value={nuevoFin} onChange={e=>setNuevoFin(e.target.value)} required/></label>
            <label style={campo}>Aula<input value={nuevaAula} onChange={e=>setNuevaAula(e.target.value)} maxLength={50}/></label>
            <label style={campo}>Fecha de vigencia *<input type="date" value={vigencia} onChange={e=>setVigencia(e.target.value)} required/></label>
            <label style={campo}>Motivo del cambio *<input value={motivoCambio} onChange={e=>setMotivoCambio(e.target.value)} minLength={1} maxLength={500} required placeholder="Ej. Cambio aprobado por Dirección"/></label>
          </div>
          <small>El cambio entra en vigor desde mañana o una fecha posterior. No aplica retroactivamente.</small>
          <div style={fila}>
            <button className="sgc-btn-principal" disabled={ocupado}>Guardar nuevo horario</button>
            <button type="button" onClick={()=>setEditarId('')} disabled={ocupado}>Cancelar</button>
          </div>
        </form>}
        {historialId && <section id="sgc-historial-horarios" style={tarjeta} aria-label="Historial de cambios del horario">
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',flexWrap:'wrap'}}>
            <div>
              <h3 style={{marginTop:0}}>Historial de cambios de horario</h3>
              <p style={{marginBottom:4}}><strong>{asignacionHistorial?.docente_nombre ?? 'Docente'} — {asignacionHistorial?.materia_nombre ?? 'Materia'}</strong></p>
              <p style={{marginBottom:0}}>Cada cambio conserva el motivo, los horarios anterior y nuevo, y quién lo autorizó.</p>
            </div>
            <button type="button" onClick={()=>{consultaHistorialActual.current++;setHistorialId('');setHistorial([]);setHistorialError('');setHistorialCargando(false);}}>Cerrar historial</button>
          </div>
          {historialCargando && <p role="status">Consultando historial...</p>}
          {historialError && <div role="alert" style={{color:'#b91c1c'}}>{historialError}</div>}
          {!historialCargando && !historialError && historial.length===0 && <p>Este horario todavía no tiene cambios registrados.</p>}
          {!historialCargando && !historialError && historial.map(c=><article key={c.id} style={{border:'1px solid #ddd6e7',borderRadius:10,padding:14,display:'grid',gap:10}}>
            <strong>Cambio #{c.id} · Vigente desde {c.vigencia_desde}</strong>
            <div style={fila}>
              <div style={{...campo,background:'#f8f8fa',padding:10,borderRadius:8}}>
                <strong>Horario anterior</strong>
                <span>{dias[c.anterior_dia]} · {c.anterior_inicio}–{c.anterior_fin}</span>
                <span>Aula: {c.anterior_aula || 'Sin aula'}</span>
                <small>Vigente: {c.anterior_desde} al {c.anterior_hasta ?? 'sin término'}</small>
              </div>
              <div style={{...campo,background:'#f1f8f4',padding:10,borderRadius:8}}>
                <strong>Horario nuevo</strong>
                <span>{dias[c.nuevo_dia]} · {c.nuevo_inicio}–{c.nuevo_fin}</span>
                <span>Aula: {c.nuevo_aula || 'Sin aula'}</span>
                <small>Vigente: {c.nuevo_desde} al {c.nuevo_hasta ?? 'sin término'}</small>
              </div>
            </div>
            <div><strong>Motivo:</strong> {c.motivo}</div>
            <div><strong>Autorizado por:</strong> {c.autorizado_nombre}</div>
            <small><strong>Registrado el:</strong> {c.fecha_cambio} (hora de Bolivia)</small>
          </article>)}
        </section>}
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
                      onClick={()=>editarHorario(h.id)}>Editar</button>
                    <button type="button" aria-expanded={historialId===h.id} aria-controls="sgc-historial-horarios"
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
