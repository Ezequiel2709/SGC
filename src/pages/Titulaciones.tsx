import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpenCheck, CheckCircle2, ClipboardCheck,
  Clock3, Download, Eye, FileCheck2, FileText, GraduationCap, Info,
  LoaderCircle, Pencil, Plus, RefreshCw, Search, ShieldCheck, Upload,
  UserRoundPlus, UsersRound, X, type LucideIcon,
} from 'lucide-react';
import {
  buscarEstudiantesT, descargarDocumentoActaT, guardarActaT, guardarEstudianteT,
  listarActasT, obtenerActaT, obtenerResumenT, resolverActaT, subirDocumentoActaT,
  type ActaT, type DatosActaT, type EstadoActa, type EstudianteT,
  type NuevoEstudianteT, type ResumenT,
} from '../lib/titulaciones';
import '../styles/titulaciones.css';

type Props = { token: string };
type Seccion = 'actas' | 'estudiantes' | 'consultas';
type FormaActa = {
  estudiante_id: string; numero_acta: string; fecha_acta: string; fecha_defensa: string;
  modalidad: string; titulo_trabajo: string; nota_final: string; observaciones: string;
};
type FormaEstudiante = {
  ci: string; registro_universitario: string; nombres: string; apellidos: string;
  correo: string; telefono: string;
};
const ESTADOS: Record<EstadoActa, string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada',
};
const OPCIONES: { id: Seccion; nombre: string; texto: string; Icono: LucideIcon }[] = [
  { id: 'actas', nombre: 'Actas de graduación', texto: 'Registro y documentación', Icono: FileText },
  { id: 'estudiantes', nombre: 'Estudiantes', texto: 'Catálogo compartido', Icono: UsersRound },
  { id: 'consultas', nombre: 'Consultas y resultados', texto: 'Búsquedas y estados', Icono: ClipboardCheck },
];
const RESUMEN_VACIO: ResumenT = { estudiantes: 0, total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0 };
const ESTUDIANTE_VACIO: FormaEstudiante = {
  ci: '', registro_universitario: '', nombres: '', apellidos: '', correo: '', telefono: '',
};
function hoyBolivia(): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = (tipo: string) => p.find(x => x.type === tipo)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}
function nuevaFormaActa(): FormaActa {
  return { estudiante_id: '', numero_acta: '', fecha_acta: hoyBolivia(),
    fecha_defensa: '', modalidad: '', titulo_trabajo: '', nota_final: '', observaciones: '' };
}
function formaDeActa(a: ActaT): FormaActa {
  return {
    estudiante_id: a.estudiante_id, numero_acta: a.numero_acta, fecha_acta: a.fecha_acta,
    fecha_defensa: a.fecha_defensa ?? '', modalidad: a.modalidad ?? '',
    titulo_trabajo: a.titulo_trabajo ?? '', nota_final: String(a.nota_final),
    observaciones: a.observaciones ?? '',
  };
}
function fechaLegible(valor: string | null | undefined): string {
  if (!valor) return 'No registrada';
  const partes = valor.slice(0,10).split('-');
  if (partes.length !== 3) return valor;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}
function errorTexto(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
function estudianteNombre(e: Pick<EstudianteT, 'nombres'|'apellidos'>): string {
  return `${e.nombres} ${e.apellidos}`.trim();
}
function datosActa(form: FormaActa): DatosActaT {
  return {
    estudiante_id: form.estudiante_id,
    numero_acta: form.numero_acta.trim(),
    fecha_acta: form.fecha_acta,
    fecha_defensa: form.fecha_defensa || null,
    modalidad: form.modalidad.trim() || null,
    titulo_trabajo: form.titulo_trabajo.trim() || null,
    nota_final: Number(form.nota_final),
    observaciones: form.observaciones.trim() || null,
  };
}

export default function Titulaciones({ token }: Props) {
  const [seccion, setSeccion] = useState<Seccion>('actas');
  const [resumen, setResumen] = useState<ResumenT>(RESUMEN_VACIO);
  const [actas, setActas] = useState<ActaT[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteT[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoEstudiantes, setCargandoEstudiantes] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pagina, setPagina] = useState(1);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [busquedaEstudiante, setBusquedaEstudiante] = useState('');
  const [actualizacion, setActualizacion] = useState(0);
  const [modalActa, setModalActa] = useState(false);
  const [actaEditando, setActaEditando] = useState<string | null>(null);
  const [formActa, setFormActa] = useState<FormaActa>(nuevaFormaActa);
  const [modalEstudiante, setModalEstudiante] = useState(false);
  const [formEstudiante, setFormEstudiante] = useState<FormaEstudiante>(ESTUDIANTE_VACIO);
  const [detalle, setDetalle] = useState<ActaT | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [revision, setRevision] = useState<{estado:'aprobada'|'rechazada'; acta:ActaT} | null>(null);
  const [notaRevision, setNotaRevision] = useState('');

  const cargarEstudiantes = useCallback(async (buscar = '') => {
    setCargandoEstudiantes(true);
    try {
      const registros = await buscarEstudiantesT(token, buscar);
      setEstudiantes(registros);
    } catch (e) {
      setError(errorTexto(e));
    } finally { setCargandoEstudiantes(false); }
  }, [token]);

  useEffect(() => {
    const temporizadorBusqueda = window.setTimeout(() => {
      setPagina(1);
      setBusquedaAplicada(busqueda.trim());
    }, 350);
    return () => window.clearTimeout(temporizadorBusqueda);
  }, [busqueda]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    Promise.all([
      obtenerResumenT(token),
      listarActasT(token, { buscar: busquedaAplicada, estado: filtroEstado, pagina, limite: 25 }),
    ]).then(([datos, lista]) => {
      if (!vigente) return;
      setResumen(datos); setActas(lista.actas); setError('');
    }).catch(e => { if (vigente) setError(errorTexto(e)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [token, pagina, filtroEstado, busquedaAplicada, actualizacion]);

  useEffect(() => {
    if (seccion === 'estudiantes' || modalActa) void cargarEstudiantes();
  }, [seccion, modalActa, cargarEstudiantes]);

  const modalAbierto = modalActa || modalEstudiante || !!detalle || !!revision;
  useEffect(() => {
    if (!modalAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [modalAbierto]);

  useEffect(() => {
    if (!modalAbierto) return;
    const alTeclado = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !procesando) {
        if (modalEstudiante) setModalEstudiante(false);
        else if (revision) setRevision(null);
        else if (detalle) setDetalle(null);
        else setModalActa(false);
      }
    };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [modalAbierto, modalEstudiante, detalle, revision, procesando]);

  const hayMas = actas.length === 25;
  const estadisticas = [
    { nombre: 'Estudiantes', valor: resumen.estudiantes, Icono: UsersRound, clase: 'azul' },
    { nombre: 'Actas registradas', valor: resumen.total, Icono: FileText, clase: 'violeta' },
    { nombre: 'Pendientes', valor: resumen.pendientes, Icono: Clock3, clase: 'ambar' },
    { nombre: 'Aprobadas', valor: resumen.aprobadas, Icono: CheckCircle2, clase: 'verde' },
  ];

  const tituloSeccion = useMemo(() => OPCIONES.find(x => x.id === seccion)?.nombre ?? 'Actas', [seccion]);
  function actualizar() { setActualizacion(x => x + 1); }
  // La busqueda de actas se aplica automaticamente, sin pulsar "Buscar".
  // Se conserva el ultimo texto tras una breve pausa para evitar solicitudes por tecla.
  function abrirNuevoActa() {
    setFormActa(nuevaFormaActa()); setActaEditando(null); setModalActa(true); setError('');
  }
  function abrirEditar(a: ActaT) {
    if (a.estado !== 'pendiente') return;
    setFormActa(formaDeActa(a)); setActaEditando(a.id); setDetalle(null);
    setModalActa(true); setError('');
  }
  async function abrirDetalle(id: string) {
    setProcesando(true); setError(''); setArchivo(null);
    try { setDetalle(await obtenerActaT(token, id)); }
    catch (e) { setError(errorTexto(e)); }
    finally { setProcesando(false); }
  }
  async function guardarActa(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!formActa.estudiante_id) { setError('Selecciona un estudiante.'); return; }
    if (formActa.nota_final.trim() === '' || !Number.isFinite(Number(formActa.nota_final)) ||
      Number(formActa.nota_final) < 0 || Number(formActa.nota_final) > 100 ||
      !/^\d+(?:\.\d{1,2})?$/.test(formActa.nota_final)) {
      setError('La nota debe estar entre 0 y 100, con máximo dos decimales.'); return;
    }
    setProcesando(true); setError('');
    try {
      const respuesta = await guardarActaT(token, datosActa(formActa), actaEditando ?? undefined);
      setModalActa(false); setAviso(respuesta.mensaje); actualizar();
      setPagina(1); setBusqueda(''); setBusquedaAplicada(''); setFiltroEstado('');
    } catch (e) { setError(errorTexto(e)); }
    finally { setProcesando(false); }
  }
  async function guardarEstudiante(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setProcesando(true); setError('');
    try {
      const datos: NuevoEstudianteT = {
        ci: formEstudiante.ci.trim(), registro_universitario: formEstudiante.registro_universitario.trim(),
        nombres: formEstudiante.nombres.trim(), apellidos: formEstudiante.apellidos.trim(),
        correo: formEstudiante.correo.trim(), telefono: formEstudiante.telefono.trim(),
      };
      const respuesta = await guardarEstudianteT(token, datos);
      const creado: EstudianteT = { ...datos, id: respuesta.id,
        correo: datos.correo || null, telefono: datos.telefono || null, activo: true };
      setEstudiantes(lista => [creado, ...lista]);
      setFormActa(anterior => ({ ...anterior, estudiante_id: respuesta.id }));
      setModalEstudiante(false); setFormEstudiante(ESTUDIANTE_VACIO);
      setBusquedaEstudiante(''); setAviso('Estudiante registrado correctamente.'); actualizar();
    } catch (e) { setError(errorTexto(e)); }
    finally { setProcesando(false); }
  }
  async function guardarPDF() {
    if (!detalle || !archivo) return;
    if (archivo.size > 6 * 1024 * 1024 || !archivo.name.toLowerCase().endsWith('.pdf')) {
      setError('Selecciona un archivo PDF de hasta 6 MB.'); return;
    }
    setProcesando(true); setError('');
    try {
      await subirDocumentoActaT(token, detalle.id, archivo);
      setDetalle(await obtenerActaT(token, detalle.id));
      setArchivo(null); setAviso('PDF adjuntado correctamente.'); actualizar();
    } catch (e) { setError(errorTexto(e)); }
    finally { setProcesando(false); }
  }
  async function descargarPDF(a: ActaT) {
    setProcesando(true); setError('');
    try { await descargarDocumentoActaT(token, a.id, a.numero_acta); }
    catch (e) { setError(errorTexto(e)); }
    finally { setProcesando(false); }
  }
  async function guardarRevision(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!revision) return;
    if (revision.estado === 'rechazada' && !notaRevision.trim()) {
      setError('Indica el motivo del rechazo.'); return;
    }
    setProcesando(true); setError('');
    try {
      await resolverActaT(token, revision.acta.id, revision.estado, notaRevision);
      setAviso(`Acta marcada como ${revision.estado}.`);
      setDetalle(null); setRevision(null); setNotaRevision(''); actualizar();
    } catch (e) { setError(errorTexto(e)); }
    finally { setProcesando(false); }
  }
  function abrirEstudiante() {
    setFormEstudiante(ESTUDIANTE_VACIO); setError(''); setModalEstudiante(true);
  }
  const estudiantesFiltrados = useMemo(() => {
    const q = busquedaEstudiante.trim().toLocaleLowerCase('es');
    if (!q) return estudiantes;
    return estudiantes.filter(e => [e.nombres, e.apellidos, e.ci, e.registro_universitario]
      .some(v => v.toLocaleLowerCase('es').includes(q)));
  }, [estudiantes, busquedaEstudiante]);

  return (
    <section className="tit-pagina notranslate" translate="no" aria-label="Módulo de Titulaciones">
      <div className="tit-ruta">Dirección de Carrera <span>/</span> <strong>Titulaciones</strong></div>
      <header className="tit-hero">
        <div className="tit-hero-contenido">
          <span className="tit-hero-etiqueta"><ShieldCheck size={14}/> SISTEMA DE GESTIÓN DE CARRERA</span>
          <h1>Titulaciones y Área Académica</h1>
          <p>Registro y consulta de actas de graduación, estudiantes y resultados académicos.</p>
          <div className="tit-hero-permiso"><BookOpenCheck size={15}/> Administración exclusiva de Dirección de Carrera</div>
        </div>
        <div className="tit-hero-insignia" aria-hidden="true"><GraduationCap size={64}/><span>FINI</span></div>
      </header>

      <div className="tit-metricas" aria-label="Resumen de Titulaciones">
        {estadisticas.map(s => <div className="tit-metrica" key={s.nombre}>
          <div className={`tit-metrica-icono ${s.clase}`}><s.Icono size={21}/></div>
          <span>{s.nombre}</span><strong>{s.valor}</strong>
        </div>)}
      </div>

      <div className="tit-barra-secciones" role="tablist" aria-label="Secciones de Titulaciones">
        {OPCIONES.map(o => <button key={o.id} type="button" role="tab"
          aria-selected={seccion === o.id} className={`tit-tab ${seccion === o.id ? 'activo' : ''}`}
          onClick={() => { setSeccion(o.id); setError(''); setAviso(''); }}>
          <o.Icono size={19}/><span><strong>{o.nombre}</strong><small>{o.texto}</small></span>
        </button>)}
      </div>

      {aviso && <div className="tit-mensaje exito" role="status"><CheckCircle2 size={18}/>{aviso}
        <button type="button" onClick={() => setAviso('')} aria-label="Cerrar aviso"><X size={16}/></button></div>}
      {error && <div className="tit-mensaje error" role="alert"><Info size={18}/>{error}
        <button type="button" onClick={() => setError('')} aria-label="Cerrar error"><X size={16}/></button></div>}

      {seccion === 'estudiantes' ? <div className="tit-panel">
        <div className="tit-panel-superior">
          <div><h2>Estudiantes registrados</h2><p>Catálogo compartido con el módulo de Auxiliaturas.</p></div>
          <button className="tit-boton primario" type="button" onClick={abrirEstudiante}><UserRoundPlus size={18}/> Nuevo estudiante</button>
        </div>
        <div className="tit-filtros">
          <label className="tit-busqueda"><Search size={19}/>
            <input aria-label="Buscar estudiante" value={busquedaEstudiante}
              onChange={e => setBusquedaEstudiante(e.target.value)} placeholder="Buscar por nombre, CI o RU"/></label>
          <button type="button" className="tit-boton secundario" onClick={() => void cargarEstudiantes(busquedaEstudiante)}
            disabled={cargandoEstudiantes}><RefreshCw size={17}/> Buscar / actualizar</button>
        </div>
        <div className="tit-tabla-scroll"><table className="tit-tabla">
          <thead><tr><th>Estudiante</th><th>CI</th><th>Registro universitario</th><th>Correo</th></tr></thead>
          <tbody>{estudiantesFiltrados.map(e => <tr key={e.id}>
            <td><strong>{estudianteNombre(e)}</strong><small>ID {e.id}</small></td>
            <td>{e.ci}</td><td>{e.registro_universitario}</td><td>{e.correo ?? 'No registrado'}</td>
          </tr>)}</tbody>
        </table></div>
        {!cargandoEstudiantes && estudiantesFiltrados.length === 0 && <div className="tit-vacio">
          <UsersRound size={29}/><strong>Sin estudiantes para mostrar</strong><p>Prueba otra búsqueda o registra uno nuevo.</p></div>}
        {cargandoEstudiantes && <p className="tit-carga"><LoaderCircle size={18} className="tit-spinner"/> Cargando estudiantes...</p>}
        <p className="tit-pie-lista">La búsqueda del servidor devuelve hasta 100 estudiantes. Para bases más grandes, escribe un nombre, CI o RU y pulsa Buscar.</p>
      </div> : <div className="tit-panel">
        <div className="tit-panel-superior">
          <div><h2>{seccion === 'actas' ? 'Actas de graduación' : 'Consultas y resultados'}</h2>
            <p>{seccion === 'actas' ? 'Administra actas pendientes y sus documentos digitales.' :
              'Consulta calificaciones y estados registrados por Dirección.'}</p></div>
          {seccion === 'actas' ? <button className="tit-boton primario" type="button" onClick={abrirNuevoActa}>
            <Plus size={18}/> Nueva acta</button> : <button className="tit-boton secundario" type="button" onClick={actualizar}>
            <RefreshCw size={17}/> Actualizar</button>}
        </div>
        {seccion === 'consultas' && <div className="tit-consulta-resumen">
          <div><strong>{resumen.pendientes}</strong><span>Pendientes</span></div>
          <div><strong>{resumen.aprobadas}</strong><span>Aprobadas</span></div>
          <div><strong>{resumen.rechazadas}</strong><span>Rechazadas</span></div>
          <p><Info size={16}/> La consulta muestra el estado actual de cada acta. El historial de cambios todavía no está implementado en el backend.</p>
        </div>}
        <div className="tit-filtros">
          <label className="tit-busqueda"><Search size={19}/>
            <input aria-label="Buscar acta automáticamente" value={busqueda} maxLength={100}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar al escribir: número de acta, estudiante, CI o RU"/></label>
          <select className="tit-select" aria-label="Filtrar por estado" value={filtroEstado}
            onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option><option value="aprobada">Aprobada</option>
            <option value="rechazada">Rechazada</option>
          </select>
          {busqueda && <button className="tit-boton secundario" type="button"
            onClick={() => { setBusqueda(''); setBusquedaAplicada(''); setPagina(1); }}>
            <X size={17}/> Limpiar
          </button>}
        </div>
        <div className="tit-tabla-scroll"><table className="tit-tabla">
          <thead><tr><th>N.º de acta</th><th>Estudiante</th><th>Fecha</th><th>Modalidad</th><th>Nota</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{actas.map(a => <tr key={a.id}>
            <td><strong>{a.numero_acta}</strong><small>ID {a.id}</small></td>
            <td><strong>{a.nombres} {a.apellidos}</strong><small>RU: {a.registro_universitario}</small></td>
            <td>{fechaLegible(a.fecha_acta)}</td>
            <td>{a.modalidad ?? 'No especificada'}</td><td><strong>{Number(a.nota_final).toFixed(2)}</strong></td>
            <td><span className={`tit-estado ${a.estado}`}>{ESTADOS[a.estado]}</span></td>
            <td><div className="tit-acciones">
              <button type="button" onClick={() => void abrirDetalle(a.id)} title="Ver detalle" aria-label={`Ver acta ${a.numero_acta}`}><Eye size={17}/></button>
              {a.estado === 'pendiente' && <button type="button" onClick={() => abrirEditar(a)} title="Editar acta pendiente" aria-label={`Editar acta ${a.numero_acta}`}><Pencil size={17}/></button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>
        {!cargando && actas.length === 0 && <div className="tit-vacio"><FileText size={29}/>
          <strong>No hay actas para mostrar</strong><p>Registra una nueva acta o cambia los filtros de búsqueda.</p></div>}
        {cargando && <p className="tit-carga"><LoaderCircle size={18} className="tit-spinner"/> Consultando actas...</p>}
        <div className="tit-paginador"><span>Mostrando {actas.length} registros · Página {pagina}</span>
          <div><button type="button" className="tit-boton secundario" disabled={pagina <= 1 || cargando}
            onClick={() => setPagina(p => Math.max(1,p-1))}><ArrowLeft size={16}/> Anterior</button>
            <button type="button" className="tit-boton secundario" disabled={!hayMas || cargando}
              onClick={() => setPagina(p => p + 1)}>Siguiente <ArrowRight size={16}/></button></div></div>
      </div>}
      <div className="tit-nota-inferior"><ShieldCheck size={16}/>
        Administración restringida a la directora. Las calificaciones no determinan automáticamente la aprobación de un acta.
      </div>

      {modalActa && <div className="tit-velo" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !procesando) setModalActa(false); }}>
        <div className="tit-modal grande" role="dialog" aria-modal="true" aria-labelledby="tit-titulo-form-acta">
          <div className="tit-modal-cabecera"><div><span className="tit-mini">TITULACIONES · DIRECCIÓN DE CARRERA</span>
            <h2 id="tit-titulo-form-acta">{actaEditando ? 'Editar acta pendiente' : 'Registrar acta de graduación'}</h2>
            <p>Los campos marcados con * son obligatorios.</p></div>
            <button type="button" className="tit-cerrar" onClick={() => setModalActa(false)} disabled={procesando} aria-label="Cerrar"><X size={22}/></button></div>
          <form onSubmit={guardarActa} className="tit-form">
            <div className="tit-form-grilla">
              <label className="tit-campo ancho"><span>Estudiante *</span>
                <div className="tit-combinado">
                  <select value={formActa.estudiante_id} required onChange={e => setFormActa(f => ({...f, estudiante_id: e.target.value}))}>
                    <option value="">Seleccionar estudiante registrado</option>
                    {estudiantes.map(e => <option value={e.id} key={e.id}>{estudianteNombre(e)} — RU {e.registro_universitario}</option>)}
                    {formActa.estudiante_id && !estudiantes.some(e => e.id === formActa.estudiante_id) &&
                      <option value={formActa.estudiante_id}>Estudiante seleccionado (ID {formActa.estudiante_id})</option>}
                  </select>
                  <button type="button" className="tit-boton secundario" onClick={abrirEstudiante} disabled={procesando}>
                    <Plus size={16}/> Nuevo estudiante</button>
                </div></label>
              <label className="tit-campo"><span>Número de acta *</span><input required maxLength={50} placeholder="Ej.: ACT-2026-001"
                value={formActa.numero_acta} onChange={e => setFormActa(f => ({...f,numero_acta:e.target.value}))}/></label>
              <label className="tit-campo"><span>Nota final (0–100) *</span><input required type="number" min="0" max="100" step="0.01"
                placeholder="Ej.: 85.00" value={formActa.nota_final} onChange={e => setFormActa(f => ({...f,nota_final:e.target.value}))}/></label>
              <label className="tit-campo"><span>Fecha del acta *</span><input type="date" required value={formActa.fecha_acta}
                onChange={e => setFormActa(f => ({...f,fecha_acta:e.target.value}))}/></label>
              <label className="tit-campo"><span>Fecha de defensa</span><input type="date" value={formActa.fecha_defensa}
                onChange={e => setFormActa(f => ({...f,fecha_defensa:e.target.value}))}/></label>
              <label className="tit-campo ancho"><span>Modalidad de titulación</span><input maxLength={100} placeholder="Ej.: Proyecto de grado"
                value={formActa.modalidad} onChange={e => setFormActa(f => ({...f,modalidad:e.target.value}))}/></label>
              <label className="tit-campo ancho"><span>Título del trabajo</span><textarea rows={2} maxLength={4000}
                placeholder="Título registrado en la documentación académica" value={formActa.titulo_trabajo}
                onChange={e => setFormActa(f => ({...f,titulo_trabajo:e.target.value}))}/></label>
              <label className="tit-campo ancho"><span>Observaciones</span><textarea rows={2} maxLength={3000}
                placeholder="Anotaciones del registro" value={formActa.observaciones}
                onChange={e => setFormActa(f => ({...f,observaciones:e.target.value}))}/></label>
            </div>
            <p className="tit-ayuda"><Info size={16}/> El acta se guardará en estado pendiente. Podrás adjuntar el PDF desde su detalle.</p>
            {error && <p className="tit-error-form" role="alert">{error}</p>}
            <div className="tit-form-acciones"><button className="tit-boton secundario" type="button" disabled={procesando} onClick={() => setModalActa(false)}>Cancelar</button>
              <button className="tit-boton primario" type="submit" disabled={procesando}>
                {procesando && <LoaderCircle size={16} className="tit-spinner"/>}{actaEditando ? 'Guardar cambios' : 'Registrar acta'}</button></div>
          </form>
        </div>
      </div>}

      {modalEstudiante && <div className="tit-velo tit-velo-estudiante" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !procesando) setModalEstudiante(false); }}>
        <div className="tit-modal" role="dialog" aria-modal="true" aria-labelledby="tit-titulo-estudiante">
          <div className="tit-modal-cabecera"><div><span className="tit-mini">CATÁLOGO COMPARTIDO</span>
            <h2 id="tit-titulo-estudiante">Registrar nuevo estudiante</h2>
            <p>El estudiante también estará disponible en Auxiliaturas.</p></div>
            <button type="button" className="tit-cerrar" onClick={() => setModalEstudiante(false)} disabled={procesando} aria-label="Cerrar"><X size={22}/></button></div>
          <form className="tit-form" onSubmit={guardarEstudiante}>
            <div className="tit-form-grilla">
              {([
                ['ci','Cédula de identidad *','Ej.: 12345678'],
                ['registro_universitario','Registro universitario (RU) *','Ej.: 202012345'],
                ['nombres','Nombres *','Nombres del estudiante'],
                ['apellidos','Apellidos *','Apellidos del estudiante'],
                ['correo','Correo electrónico','estudiante@ejemplo.com'],
                ['telefono','Teléfono','Ej.: 70000000'],
              ] as const).map(([campo,etiqueta,placeholder]) =>
                <label className="tit-campo" key={campo}><span>{etiqueta}</span>
                  <input autoFocus={campo === 'ci'} required={['ci','registro_universitario','nombres','apellidos'].includes(campo)}
                    type={campo === 'correo' ? 'email' : 'text'} placeholder={placeholder}
                    maxLength={campo === 'ci' ? 30 : campo === 'registro_universitario' ? 40 : campo === 'correo' ? 120 : campo === 'telefono' ? 30 : 100}
                    value={formEstudiante[campo]} onChange={e => setFormEstudiante(f => ({...f,[campo]:e.target.value}))}/>
                </label>)}
            </div>
            {error && <p className="tit-error-form" role="alert">{error}</p>}
            <div className="tit-form-acciones"><button type="button" className="tit-boton secundario" onClick={() => setModalEstudiante(false)} disabled={procesando}>Cancelar</button>
              <button type="submit" className="tit-boton primario" disabled={procesando}>
                {procesando && <LoaderCircle size={16} className="tit-spinner"/>}Guardar estudiante</button></div>
          </form>
        </div>
      </div>}

      {detalle && <div className="tit-velo" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !procesando) setDetalle(null); }}>
        <div className="tit-modal grande" role="dialog" aria-modal="true" aria-labelledby="tit-titulo-detalle">
          <div className="tit-modal-cabecera"><div><span className="tit-mini">DETALLE DEL REGISTRO</span>
            <h2 id="tit-titulo-detalle">Acta {detalle.numero_acta}</h2><p>Información registrada en PostgreSQL.</p></div>
            <button type="button" className="tit-cerrar" disabled={procesando} onClick={() => setDetalle(null)} aria-label="Cerrar"><X size={22}/></button></div>
          <div className="tit-detalle">
            <div className="tit-detalle-principal"><GraduationCap size={26}/><div><strong>{detalle.nombres} {detalle.apellidos}</strong>
              <span>CI {detalle.ci} · RU {detalle.registro_universitario}</span></div>
              <span className={`tit-estado ${detalle.estado}`}>{ESTADOS[detalle.estado]}</span></div>
            <div className="tit-detalle-cuadricula">
              <div><span>N.º de acta</span><strong>{detalle.numero_acta}</strong></div>
              <div><span>Calificación final</span><strong>{Number(detalle.nota_final).toFixed(2)}/100</strong></div>
              <div><span>Fecha del acta</span><strong>{fechaLegible(detalle.fecha_acta)}</strong></div>
              <div><span>Fecha de defensa</span><strong>{fechaLegible(detalle.fecha_defensa)}</strong></div>
              <div><span>Modalidad</span><strong>{detalle.modalidad || 'No especificada'}</strong></div>
              <div><span>Documento digital</span><strong>{detalle.tiene_documento ? 'PDF adjunto' : 'Sin documento'}</strong></div>
            </div>
            <div className="tit-detalle-texto"><span>Título del trabajo</span><p>{detalle.titulo_trabajo || 'Sin registrar'}</p></div>
            <div className="tit-detalle-texto"><span>Observaciones</span><p>{detalle.observaciones || 'Sin observaciones'}</p></div>
            <div className="tit-documento">
              <div><FileCheck2 size={20}/><strong>Documento del acta</strong></div>
              {detalle.tiene_documento && <button className="tit-boton secundario" type="button" disabled={procesando}
                onClick={() => void descargarPDF(detalle)}><Download size={17}/> Descargar PDF</button>}
              {detalle.estado === 'pendiente' && <div className="tit-adjuntar">
                <input type="file" accept="application/pdf,.pdf" aria-label="Seleccionar PDF del acta"
                  onChange={e => setArchivo(e.target.files?.[0] ?? null)}/>
                <button type="button" className="tit-boton secundario" onClick={() => void guardarPDF()} disabled={!archivo || procesando}>
                  <Upload size={17}/> Subir PDF</button>
              </div>}
              <small>Se permiten archivos PDF de hasta 6 MB. Los documentos se almacenan de forma privada.</small>
            </div>
            {error && <p className="tit-error-form" role="alert">{error}</p>}
            <div className="tit-form-acciones">
              {detalle.estado === 'pendiente' && <>
                <button type="button" className="tit-boton secundario" onClick={() => abrirEditar(detalle)} disabled={procesando}><Pencil size={17}/> Editar</button>
                <button type="button" className="tit-boton rechazar" disabled={procesando} onClick={() => {setNotaRevision('');setError('');setRevision({estado:'rechazada',acta:detalle});}}>Rechazar</button>
                <button type="button" className="tit-boton aprobar" disabled={procesando} onClick={() => {setNotaRevision('');setError('');setRevision({estado:'aprobada',acta:detalle});}}>Aprobar</button>
              </>}
              <button type="button" className="tit-boton secundario" disabled={procesando} onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      </div>}

      {revision && <div className="tit-velo tit-velo-revision" role="presentation">
        <div className="tit-modal compacto" role="dialog" aria-modal="true" aria-labelledby="tit-titulo-revision">
          <div className="tit-modal-cabecera"><div><span className="tit-mini">DECISIÓN DE DIRECCIÓN</span>
            <h2 id="tit-titulo-revision">{revision.estado === 'aprobada' ? 'Aprobar acta' : 'Rechazar acta'}</h2>
            <p>{revision.acta.numero_acta}</p></div>
            <button type="button" className="tit-cerrar" disabled={procesando} onClick={() => setRevision(null)} aria-label="Cerrar"><X size={22}/></button></div>
          <form className="tit-form" onSubmit={guardarRevision}>
            <p className="tit-ayuda importante"><Info size={17}/> Esta decisión modifica el estado de forma definitiva en el backend actual.
              Debe corresponder a una validación institucional real; la nota por sí sola no aprueba el acta.</p>
            <label className="tit-campo"><span>Observaciones {revision.estado === 'rechazada' ? '*' : '(opcional)'}</span>
              <textarea rows={4} required={revision.estado === 'rechazada'} maxLength={3000}
                value={notaRevision} onChange={e => setNotaRevision(e.target.value)} placeholder="Indica el fundamento de la revisión"/></label>
            {error && <p className="tit-error-form" role="alert">{error}</p>}
            <div className="tit-form-acciones"><button type="button" className="tit-boton secundario" onClick={() => setRevision(null)} disabled={procesando}>Cancelar</button>
              <button type="submit" className={`tit-boton ${revision.estado === 'aprobada' ? 'aprobar' : 'rechazar'}`} disabled={procesando}>
                Confirmar {revision.estado === 'aprobada' ? 'aprobación' : 'rechazo'}</button></div>
          </form>
        </div>
      </div>}
      <span className="tit-lectura" aria-live="polite">{procesando && !modalAbierto ? 'Procesando...' : ''}</span>
      <span className="tit-lectura" aria-live="polite">{tituloSeccion}</span>
    </section>
  );
}
