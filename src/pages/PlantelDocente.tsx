import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  obtenerPlantel, crearDocente, crearMateria, crearAsignacion, crearHorario,
  type ResumenPlantel,
} from '../lib/plantel';
import ControlAsistencia from './ControlAsistencia';

type Props = { token: string };
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
      setCodigoDocente('');setTelefono('');setEspecialidad('');
    });
  }
  function guardarMateria(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearMateria(token, {
      codigo:codigoMateria, nombre:nombreMateria,
      ...(semestre ? { semestre:Number(semestre) } : {}),
    }), 'Materia registrada correctamente.', () => {
      setCodigoMateria('');setNombreMateria('');setSemestre('');
    });
  }
  function guardarAsignacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearAsignacion(token, {
      docente_id: docenteId, materia_id:materiaId, gestion,
    }), 'Asignación registrada correctamente.', () => {
      setDocenteId('');setMateriaId('');
    });
  }
  function guardarHorario(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(() => crearHorario(token, {
      asignacion_id: asignacionId, dia_semana:dia,
      hora_inicio:inicio,hora_fin:fin,aula,
    }), 'Horario registrado correctamente.', () => {
      setAula('');setAsignacionId('');
    });
  }

  const docentesActivos = datos.docentes.filter(d=>d.activo && d.perfil_id);
  const materiasActivas = datos.materias.filter(m=>m.activo);
  const asignacionesActivas = datos.asignaciones.filter(a=>a.activo);

  return (
    <section className="sgc-correspondencia" style={{maxWidth:1200}}>
      <div className="sgc-pagina-encabezado">
        <h2>Plantel Docente y Asistencia</h2>
        <p>Administración académica, supervisión de asistencias y solicitudes del plantel.</p>
      </div>
      <div className="sgc-aviso">
        <strong>Acceso administrativo: Directora</strong>
        <p>Registra un docente con su cuenta, después sus materias, asignaciones y horarios. Usa datos ficticios para la primera prueba.</p>
      </div>
      {error && <div className="sgc-aviso" role="alert" style={{borderColor:'#b91c1c',color:'#b91c1c'}}>{error}</div>}
      {mensaje && <div className="sgc-aviso" role="status" style={{borderColor:'#166534'}}>{mensaje}</div>}
      {cargando && <p role="status">Actualizando información desde PostgreSQL...</p>}

      <ControlAsistencia token={token} docentes={datos.docentes} />

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

      <div style={{overflowX:'auto',marginBottom:24}}>
        <h3>Docentes registrados ({datos.docentes.length})</h3>
        <table className="sgc-tabla"><thead><tr><th>Nombre</th><th>CI</th><th>Correo</th><th>Código</th><th>Especialidad</th><th>Activo</th></tr></thead>
          <tbody>{datos.docentes.map(d=><tr key={d.id}>
            <td>{d.nombre_completo}</td><td>{d.ci}</td><td>{d.correo ?? 'Sin cuenta'}</td>
            <td>{d.codigo_docente || '—'}</td><td>{d.especialidad || '—'}</td><td>{d.activo?'Sí':'No'}</td>
          </tr>)}{!datos.docentes.length && <tr><td colSpan={6}>Todavía no hay docentes.</td></tr>}</tbody>
        </table>
      </div>

      <form style={tarjeta} onSubmit={guardarMateria}>
        <h3>2. Registrar materia</h3>
        <div style={fila}>
          <label style={campo}>Código *<input value={codigoMateria} onChange={e=>setCodigoMateria(e.target.value)} required maxLength={30}/></label>
          <label style={campo}>Nombre *<input value={nombreMateria} onChange={e=>setNombreMateria(e.target.value)} required maxLength={150}/></label>
          <label style={campo}>Semestre de la materia<input type="number" min={1} max={12} value={semestre} onChange={e=>setSemestre(e.target.value)}/></label>
          <button className="sgc-btn-principal" disabled={ocupado}>Guardar materia</button>
        </div>
      </form>
      <div style={{overflowX:'auto',marginBottom:24}}>
        <h3>Materias ({datos.materias.length})</h3>
        <table className="sgc-tabla"><thead><tr><th>Código</th><th>Materia</th><th>Semestre</th><th>Activo</th></tr></thead>
          <tbody>{datos.materias.map(m=><tr key={m.id}><td>{m.codigo}</td><td>{m.nombre}</td><td>{m.semestre ?? '—'}</td><td>{m.activo?'Sí':'No'}</td></tr>)}
          {!datos.materias.length && <tr><td colSpan={4}>Todavía no hay materias.</td></tr>}</tbody>
        </table>
      </div>

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
      <div style={{overflowX:'auto',marginBottom:24}}>
        <h3>Asignaciones ({datos.asignaciones.length})</h3>
        <table className="sgc-tabla"><thead><tr><th>Docente</th><th>Materia</th><th>Gestión</th><th>Activo</th></tr></thead>
          <tbody>{datos.asignaciones.map(a=><tr key={a.id}><td>{a.docente_nombre}</td><td>{a.materia_nombre}</td><td>{a.gestion}</td><td>{a.activo?'Sí':'No'}</td></tr>)}
          {!datos.asignaciones.length && <tr><td colSpan={4}>Todavía no hay asignaciones.</td></tr>}</tbody>
        </table>
      </div>

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
      <div style={{overflowX:'auto',marginBottom:24}}>
        <h3>Horarios ({datos.horarios.length})</h3>
        <table className="sgc-tabla"><thead><tr><th>Docente</th><th>Materia</th><th>Día</th><th>Horario</th><th>Aula</th></tr></thead>
          <tbody>{datos.horarios.map(h=>{
            const a=datos.asignaciones.find(x=>x.id===h.asignacion_id);
            return <tr key={h.id}><td>{a?.docente_nombre ?? '—'}</td><td>{a?.materia_nombre ?? '—'}</td>
              <td>{dias[h.dia_semana] ?? h.dia_semana}</td><td>{h.hora_inicio}–{h.hora_fin}</td><td>{h.aula||'—'}</td></tr>;
          })}{!datos.horarios.length && <tr><td colSpan={5}>Todavía no hay horarios.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}
