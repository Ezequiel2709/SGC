import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight,
  ClipboardCheck, ClipboardList, Clock3, FileCheck2, FileText, GraduationCap,
  Info, Layers3, ListChecks, LoaderCircle, Pencil, Plus, RefreshCw, Search,
  ShieldCheck, SlidersHorizontal, Trophy, UsersRound, X, type LucideIcon,
} from 'lucide-react';
import {
  guardarConvocatoriaAux, obtenerConvocatoriaAux, obtenerConvocatoriasAux, obtenerMateriasAux,
  type Convocatoria, type ConvocatoriaDetalle, type DatosConvocatoria, type EstadoConvocatoria,
  type MateriaAux,
} from '../lib/auxiliaturas';
import '../styles/auxiliaturas.css';
import AuxiliaturasProcesos from './AuxiliaturasProcesos';

type Props = { token: string };
type Seccion = 'convocatorias' | 'postulaciones' | 'requisitos' | 'evaluaciones' | 'resultados';
type RequisitoEditable = { descripcion: string; obligatorio: boolean };
type Formulario = {
  materia_id: string;
  gestion: string;
  semestre: string;
  titulo: string;
  descripcion: string;
  requisitos_generales: string;
  fecha_apertura: string;
  fecha_cierre: string;
  fecha_examen: string;
  cupos: string;
  requisitos: RequisitoEditable[];
};

const secciones: {
  id: Seccion; titulo: string; breve: string; icono: LucideIcon; etapa: string;
}[] = [
  { id: 'convocatorias', titulo: 'Convocatorias', breve: 'Materia, fechas y cupos', icono: ClipboardList, etapa: '01' },
  { id: 'postulaciones', titulo: 'Postulaciones', breve: 'Aspirantes y documentos', icono: UsersRound, etapa: '02' },
  { id: 'requisitos', titulo: 'Requisitos', breve: 'Verificar habilitaciones', icono: ListChecks, etapa: '03' },
  { id: 'evaluaciones', titulo: 'Evaluaciones', breve: 'Criterios y puntajes', icono: FileCheck2, etapa: '04' },
  { id: 'resultados', titulo: 'Resultados', breve: 'Seleccionados y publicación', icono: Trophy, etapa: '05' },
];

const etiquetasEstado: Record<EstadoConvocatoria, string> = {
  borrador: 'Borrador', publicada: 'Publicada', cerrada: 'Cerrada',
  evaluacion: 'En evaluación', finalizada: 'Finalizada', anulada: 'Anulada',
};

function formularioInicial(): Formulario {
  return {
    materia_id: '', gestion: String(new Date().getFullYear()), semestre: '1',
    titulo: '', descripcion: '', requisitos_generales: '', fecha_apertura: '',
    fecha_cierre: '', fecha_examen: '', cupos: '1',
    requisitos: [{ descripcion: '', obligatorio: true }],
  };
}

function formularioDesdeDetalle(detalle: ConvocatoriaDetalle): Formulario {
  const c = detalle.convocatoria;
  return {
    materia_id: c.materia_id, gestion: String(c.gestion), semestre: String(c.semestre),
    titulo: c.titulo, descripcion: c.descripcion ?? '',
    requisitos_generales: c.requisitos_generales ?? '',
    fecha_apertura: c.fecha_apertura, fecha_cierre: c.fecha_cierre,
    fecha_examen: c.fecha_examen ?? '', cupos: String(c.cupos),
    requisitos: detalle.requisitos.map(r => ({ descripcion: r.descripcion, obligatorio: r.obligatorio })),
  };
}

function textoFecha(fecha: string | null): string {
  if (!fecha) return 'Por definir';
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

function mensajeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
}

export default function Auxiliaturas({ token }: Props) {
  const [seccion, setSeccion] = useState<Seccion>('convocatorias');
  const [registros, setRegistros] = useState<Convocatoria[]>([]);
  const [materias, setMaterias] = useState<MateriaAux[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMaterias, setCargandoMaterias] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<ConvocatoriaDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [editarId, setEditarId] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(formularioInicial);
  const [guardando, setGuardando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const datos = await obtenerConvocatoriasAux(token, pagina, estado);
      setRegistros(datos.convocatorias);
    } catch (err) {
      setError(mensajeError(err));
      setRegistros([]);
    } finally {
      setCargando(false);
    }
  }, [token, pagina, estado]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    let activo = true;
    setCargandoMaterias(true);
    obtenerMateriasAux(token)
      .then(res => { if (activo) setMaterias(res); })
      .catch(err => { if (activo) setError(mensajeError(err)); })
      .finally(() => { if (activo) setCargandoMaterias(false); });
    return () => { activo = false; };
  }, [token]);

  useEffect(() => {
    if (!detalle && !cargandoDetalle && !formularioAbierto) return;
    function cerrarEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && !guardando) {
        setDetalle(null); setFormularioAbierto(false); setCargandoDetalle(false); setErrorDetalle('');
      }
    }
    window.addEventListener('keydown', cerrarEscape);
    return () => window.removeEventListener('keydown', cerrarEscape);
  }, [detalle, cargandoDetalle, formularioAbierto, guardando]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    if (!termino) return registros;
    return registros.filter(c => [c.titulo, c.materia_nombre, c.materia_codigo, String(c.gestion)]
      .some(v => v.toLocaleLowerCase('es').includes(termino)));
  }, [registros, busqueda]);

  const resumen = useMemo(() => ({
    total: registros.length,
    borradores: registros.filter(c => c.estado === 'borrador').length,
    publicadas: registros.filter(c => c.estado === 'publicada').length,
  }), [registros]);

  async function abrirDetalle(id: string) {
    setAviso('');
    setErrorDetalle('');
    setDetalle(null);
    setCargandoDetalle(true);
    try {
      const respuesta = await obtenerConvocatoriaAux(token, id);
      setDetalle(respuesta);
    } catch (err) {
      setErrorDetalle(mensajeError(err));
    } finally {
      setCargandoDetalle(false);
    }
  }

  function nuevoBorrador() {
    setEditarId(null);
    setDetalle(null);
    setForm(formularioInicial());
    setErrorFormulario('');
    setFormularioAbierto(true);
  }

  function editarBorrador(actual: ConvocatoriaDetalle) {
    if (actual.convocatoria.estado !== 'borrador') return;
    setEditarId(actual.convocatoria.id);
    setForm(formularioDesdeDetalle(actual));
    setErrorFormulario('');
    setDetalle(null);
    setFormularioAbierto(true);
  }

  function actualizarRequisito(indice: number, cambios: Partial<RequisitoEditable>) {
    setForm(actual => ({
      ...actual,
      requisitos: actual.requisitos.map((r, i) => i === indice ? { ...r, ...cambios } : r),
    }));
  }

  function quitarRequisito(indice: number) {
    setForm(actual => ({ ...actual, requisitos: actual.requisitos.filter((_, i) => i !== indice) }));
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando) return;
    setErrorFormulario('');
    const gestion = Number(form.gestion);
    const semestre = Number(form.semestre);
    const cupos = Number(form.cupos);
    const requisitos = form.requisitos.map(r => ({ descripcion: r.descripcion.trim(), obligatorio: r.obligatorio }));
    if (!form.materia_id || !form.titulo.trim() || !/^\d{4}$/.test(form.gestion) ||
      gestion < 2000 || gestion > 2100 || ![1, 2].includes(semestre) ||
      !Number.isInteger(cupos) || cupos < 1 || cupos > 10000 ||
      !form.fecha_apertura || !form.fecha_cierre) {
      setErrorFormulario('Completa materia, título, gestión (2000–2100), semestre, fechas y cupos válidos.'); return;
    }
    if (form.fecha_cierre < form.fecha_apertura ||
        (form.fecha_examen && form.fecha_examen < form.fecha_apertura)) {
      setErrorFormulario('Revisa las fechas: el cierre y el examen no pueden ser anteriores a la apertura.'); return;
    }
    if (!requisitos.length || requisitos.some(r => !r.descripcion)) {
      setErrorFormulario('Incluye al menos un requisito y completa todas sus descripciones.'); return;
    }
    if (new Set(requisitos.map(r => r.descripcion.toLocaleLowerCase('es'))).size !== requisitos.length) {
      setErrorFormulario('Los requisitos no pueden estar duplicados.'); return;
    }

    const datos: DatosConvocatoria = {
      materia_id: form.materia_id, gestion, semestre, cupos,
      titulo: form.titulo.trim(), descripcion: form.descripcion.trim() || null,
      requisitos_generales: form.requisitos_generales.trim() || null,
      fecha_apertura: form.fecha_apertura, fecha_cierre: form.fecha_cierre,
      fecha_examen: form.fecha_examen || null, requisitos,
    };

    setGuardando(true);
    try {
      const resultado = await guardarConvocatoriaAux(token, datos, editarId ?? undefined);
      setFormularioAbierto(false);
      setEditarId(null);
      setAviso(resultado.mensaje);
      setPagina(1);
      setEstado('todos');
      setBusqueda('');
      // Si cambia un filtro/página, el efecto vuelve a consultar con los valores nuevos.
      if (pagina === 1 && estado === 'todos') await cargar();
    } catch (err) {
      setErrorFormulario(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  const ventanaAbierta = formularioAbierto || cargandoDetalle || !!detalle || !!errorDetalle;

  return (
    <div className="aux-pagina">
      <div className="aux-ruta">Dirección de Carrera <ChevronRight size={13} /> Gestión académica <ChevronRight size={13} /> <strong>Auxiliaturas</strong></div>

      <section className="aux-hero">
        <div className="aux-hero-info">
          <span className="aux-hero-ceja"><GraduationCap size={14} /> MÓDULO ACADÉMICO · FINI / UAGRM</span>
          <h1>Auxiliaturas de Cátedra</h1>
          <p>Organiza las convocatorias y el proceso de selección de auxiliares, desde la postulación hasta los resultados.</p>
          <span className="aux-hero-acceso"><ShieldCheck size={15} /> Administración exclusiva de Dirección de Carrera</span>
        </div>
        <div className="aux-hero-sello" aria-hidden="true"><GraduationCap size={66} strokeWidth={1.4} /><span>SGC</span></div>
      </section>

      <div className="aux-encabezado-seccion">
        <div><h2>Panel de gestión</h2><p>Seguimiento de las convocatorias registradas en el sistema.</p></div>
        <button type="button" className="aux-boton aux-boton-primario" onClick={nuevoBorrador} disabled={cargandoMaterias}>
          <Plus size={17} /> Nueva convocatoria
        </button>
      </div>

      <div className="aux-estadisticas">
        <div className="aux-estadistica"><span className="aux-stat-icon azul"><ClipboardList size={20} /></span><span className="aux-stat-etiqueta">Convocatorias</span><strong>{cargando ? '—' : resumen.total}</strong><small>En la página actual</small></div>
        <div className="aux-estadistica"><span className="aux-stat-icon rojo"><FileText size={20} /></span><span className="aux-stat-etiqueta">Borradores</span><strong>{cargando ? '—' : resumen.borradores}</strong><small>Pendientes de publicación</small></div>
        <div className="aux-estadistica"><span className="aux-stat-icon violeta"><CheckCircle2 size={20} /></span><span className="aux-stat-etiqueta">Publicadas</span><strong>{cargando ? '—' : resumen.publicadas}</strong><small>Convocatorias visibles en la consulta</small></div>
      </div>

      <div className="aux-flujo" aria-label="Etapas del proceso de Auxiliaturas">
        {secciones.map(s => {
          const Icono = s.icono;
          return <button key={s.id} type="button" onClick={() => setSeccion(s.id)}
            className={`aux-etapa ${seccion === s.id ? 'seleccionada' : ''}`} aria-current={seccion === s.id ? 'step' : undefined}>
            <span className="aux-etapa-numero">{s.etapa}</span><span className="aux-etapa-icono"><Icono size={19} /></span>
            <span className="aux-etapa-texto"><strong>{s.titulo}</strong><small>{s.breve}</small></span>
            
          </button>;
        })}
      </div>

      {seccion === 'convocatorias' ? (
        <section className="aux-contenedor">
          <div className="aux-contenedor-cabecera">
            <div><h2>Convocatorias registradas</h2><p>Consulta y edita los borradores de cada gestión académica.</p></div>
            <button type="button" className="aux-boton aux-boton-secundario" onClick={() => { setAviso(''); void cargar(); }} disabled={cargando}><RefreshCw size={15} /> Actualizar</button>
          </div>
          <div className="aux-filtros">
            <label className="aux-busqueda"><Search size={18} /><span className="aux-visualmente-oculto">Buscar convocatoria</span>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por materia, título o gestión..." /></label>
            <label className="aux-select-filtro"><SlidersHorizontal size={17} /><span className="aux-visualmente-oculto">Filtrar por estado</span>
              <select value={estado} onChange={e => { setEstado(e.target.value); setPagina(1); }}>
                <option value="todos">Todos los estados</option>
                {Object.entries(etiquetasEstado).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
              </select></label>
          </div>
          {aviso && <div className="aux-aviso aux-aviso-exito" role="status"><CheckCircle2 size={17} />{aviso}<button type="button" onClick={() => setAviso('')} aria-label="Cerrar aviso"><X size={15}/></button></div>}
          {error && <div className="aux-aviso aux-aviso-error" role="alert"><Info size={18} /><span>{error}</span><button type="button" onClick={() => void cargar()}>Reintentar</button></div>}
          {cargando ? (
            <div className="aux-vacio"><LoaderCircle className="aux-girando" size={30} /><strong>Cargando convocatorias...</strong><p>Consultando la base de datos del SGC.</p></div>
          ) : !error && visibles.length === 0 ? (
            <div className="aux-vacio"><span className="aux-vacio-icono"><BookOpen size={27} /></span>
              <strong>{registros.length ? 'No hay coincidencias' : 'Todavía no hay convocatorias en esta consulta'}</strong>
              <p>{registros.length ? 'Prueba con otro término de búsqueda.' : 'Puedes empezar creando la primera convocatoria en estado borrador.'}</p>
              {!registros.length && <button type="button" className="aux-boton aux-boton-primario" onClick={nuevoBorrador}><Plus size={16} /> Crear convocatoria</button>}
            </div>
          ) : !error && (
            <div className="aux-tabla-desplazamiento">
              <table className="aux-tabla">
                <thead><tr><th>Materia / Convocatoria</th><th>Gestión</th><th>Fechas</th><th>Cupos</th><th>Requisitos</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>{visibles.map(c => (
                  <tr key={c.id}>
                    <td><div className="aux-celda-principal"><span className="aux-celda-icono"><BookOpen size={18} /></span><span><strong>{c.materia_nombre}</strong><small>{c.materia_codigo} · {c.titulo}</small></span></div></td>
                    <td><span className="aux-dato-destacado">{c.gestion}-{c.semestre === 1 ? 'I' : 'II'}</span></td>
                    <td><span className="aux-fecha"><CalendarDays size={14} /> {textoFecha(c.fecha_apertura)}</span><small className="aux-fecha-secundaria">al {textoFecha(c.fecha_cierre)}</small></td>
                    <td><span className="aux-dato-destacado">{c.cupos}</span></td>
                    <td><span className="aux-dato-destacado">{c.cantidad_requisitos}</span></td>
                    <td><span className={`aux-estado aux-estado-${c.estado}`}>{etiquetasEstado[c.estado] ?? c.estado}</span></td>
                    <td><button type="button" className="aux-enlace-accion" onClick={() => void abrirDetalle(c.id)}>Ver detalle <ChevronRight size={15} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <footer className="aux-listado-pie"><span>{visibles.length} registro(s) visibles · Página {pagina}</span>
            <div className="aux-paginador"><button type="button" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1 || cargando}><ArrowLeft size={16}/> Anterior</button>
              <button type="button" onClick={() => setPagina(p => p + 1)} disabled={cargando || registros.length < 25}>Siguiente <ArrowRight size={16}/></button></div>
          </footer>
        </section>
      ) : (
        <AuxiliaturasProcesos token={token} seccion={seccion} />
      )}

      <div className="aux-pie-informativo"><Info size={17}/><span>Los requisitos y puntajes se verifican por Dirección. La publicación requiere validación manual; no se asignan ganadores automáticamente.</span></div>

      {ventanaAbierta && <div className="aux-modal-superposicion" role="presentation" onMouseDown={e => {
        if (e.target === e.currentTarget && !guardando) { setDetalle(null); setCargandoDetalle(false); setErrorDetalle(''); setFormularioAbierto(false); }
      }}>
        {formularioAbierto ? (
          <section className="aux-modal aux-modal-formulario" role="dialog" aria-modal="true" aria-label={editarId ? 'Editar convocatoria' : 'Nueva convocatoria'}>
            <div className="aux-modal-cabecera"><div><span className="aux-mini-etiqueta">DIRECCIÓN DE CARRERA</span><h2>{editarId ? 'Editar borrador' : 'Nueva convocatoria'}</h2><p>Los datos se guardarán en PostgreSQL como borrador.</p></div><button type="button" className="aux-modal-cerrar" onClick={() => !guardando && setFormularioAbierto(false)} disabled={guardando} aria-label="Cerrar formulario"><X size={21}/></button></div>
            <form onSubmit={e => void guardar(e)}>
              <div className="aux-modal-cuerpo">
                <div className="aux-form-grupo-titulo"><Layers3 size={18}/> Información académica</div>
                <div className="aux-form-grid">
                  <label className="aux-campo aux-columna-completa">Materia <span>*</span><select required value={form.materia_id} disabled={cargandoMaterias} onChange={e => setForm(f => ({ ...f, materia_id: e.target.value }))}>
                    <option value="">{cargandoMaterias ? 'Cargando materias...' : 'Seleccionar materia'}</option>
                    {materias.map(m => <option key={m.id} value={m.id}>{m.codigo} — {m.nombre}</option>)}
                  </select></label>
                  <label className="aux-campo">Gestión <span>*</span><input required type="number" min="2000" max="2100" value={form.gestion} onChange={e => setForm(f => ({ ...f, gestion: e.target.value }))}/></label>
                  <label className="aux-campo">Semestre de convocatoria <span>*</span><select value={form.semestre} onChange={e => setForm(f => ({ ...f, semestre: e.target.value }))}><option value="1">Primer semestre (I)</option><option value="2">Segundo semestre (II)</option></select></label>
                  <label className="aux-campo aux-columna-completa">Título de convocatoria <span>*</span><input required maxLength={200} value={form.titulo} placeholder="Ej. Convocatoria de Auxiliatura de Estadística 2027-I" onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}/></label>
                  <label className="aux-campo aux-columna-completa">Descripción<textarea rows={2} maxLength={10000} value={form.descripcion} placeholder="Información general del proceso..." onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}/></label>
                </div>
                <div className="aux-form-grupo-titulo"><Clock3 size={18}/> Fechas y disponibilidad</div>
                <div className="aux-form-grid aux-form-grid-tres">
                  <label className="aux-campo">Apertura <span>*</span><input required type="date" value={form.fecha_apertura} onChange={e => setForm(f => ({ ...f, fecha_apertura: e.target.value }))}/></label>
                  <label className="aux-campo">Cierre <span>*</span><input required type="date" min={form.fecha_apertura || undefined} value={form.fecha_cierre} onChange={e => setForm(f => ({ ...f, fecha_cierre: e.target.value }))}/></label>
                  <label className="aux-campo">Fecha de examen <small>Opcional</small><input type="date" min={form.fecha_apertura || undefined} value={form.fecha_examen} onChange={e => setForm(f => ({ ...f, fecha_examen: e.target.value }))}/></label>
                  <label className="aux-campo">Cupos <span>*</span><input required type="number" min="1" max="10000" value={form.cupos} onChange={e => setForm(f => ({ ...f, cupos: e.target.value }))}/></label>
                </div>
                <div className="aux-form-grupo-titulo aux-form-grupo-con-accion"><span><ClipboardCheck size={18}/> Requisitos de postulación</span><button type="button" className="aux-boton aux-boton-texto" onClick={() => setForm(f => ({ ...f, requisitos: [...f.requisitos, { descripcion: '', obligatorio: true }] }))} disabled={form.requisitos.length >= 30}><Plus size={16}/> Añadir requisito</button></div>
                <div className="aux-requisitos-edicion">
                  {form.requisitos.map((r, i) => <div className="aux-requisito-fila" key={i}>
                    <span className="aux-requisito-orden">{i + 1}</span>
                    <label className="aux-visualmente-oculto" htmlFor={`aux-req-${i}`}>Requisito {i + 1}</label>
                    <input id={`aux-req-${i}`} required maxLength={500} value={r.descripcion} placeholder="Describe el requisito solicitado" onChange={e => actualizarRequisito(i, { descripcion: e.target.value })}/>
                    <label className="aux-requisito-check"><input type="checkbox" checked={r.obligatorio} onChange={e => actualizarRequisito(i, { obligatorio: e.target.checked })}/> Obligatorio</label>
                    <button type="button" className="aux-icono-accion" onClick={() => quitarRequisito(i)} disabled={form.requisitos.length === 1} aria-label={`Eliminar requisito ${i + 1}`}><X size={17}/></button>
                  </div>)}
                </div>
                <label className="aux-campo aux-campo-final">Información general de requisitos<textarea rows={2} maxLength={10000} value={form.requisitos_generales} placeholder="Indicaciones adicionales (opcional)" onChange={e => setForm(f => ({ ...f, requisitos_generales: e.target.value }))}/></label>
                {errorFormulario && <div className="aux-aviso aux-aviso-error" role="alert"><Info size={18}/>{errorFormulario}</div>}
              </div>
              <footer className="aux-modal-pie"><span><Info size={15}/> No se publica automáticamente.</span><div><button type="button" className="aux-boton aux-boton-secundario" disabled={guardando} onClick={() => setFormularioAbierto(false)}>Cancelar</button><button type="submit" className="aux-boton aux-boton-primario" disabled={guardando || cargandoMaterias}>{guardando ? <LoaderCircle className="aux-girando" size={16}/> : <Check size={16}/>} {guardando ? 'Guardando...' : 'Guardar borrador'}</button></div></footer>
            </form>
          </section>
        ) : (
          <section className="aux-modal aux-modal-detalle" role="dialog" aria-modal="true" aria-label="Detalle de convocatoria">
            <div className="aux-modal-cabecera"><div><span className="aux-mini-etiqueta">CONVOCATORIA · CONSULTA</span><h2>Detalle de convocatoria</h2><p>Información recuperada desde PostgreSQL.</p></div><button type="button" className="aux-modal-cerrar" onClick={() => { setDetalle(null); setErrorDetalle(''); setCargandoDetalle(false); }} aria-label="Cerrar detalle"><X size={21}/></button></div>
            {cargandoDetalle ? <div className="aux-modal-espera"><LoaderCircle className="aux-girando" size={30}/> Consultando convocatoria...</div> : errorDetalle ? <div className="aux-modal-espera aux-texto-error" role="alert">{errorDetalle}</div> : detalle && <>
              <div className="aux-modal-cuerpo">
                <div className="aux-detalle-titulo"><span className="aux-detalle-icono"><BookOpen size={24}/></span><div><h3>{detalle.convocatoria.materia_nombre}</h3><p>{detalle.convocatoria.materia_codigo} · Gestión {detalle.convocatoria.gestion}-{detalle.convocatoria.semestre === 1 ? 'I' : 'II'}</p></div><span className={`aux-estado aux-estado-${detalle.convocatoria.estado}`}>{etiquetasEstado[detalle.convocatoria.estado]}</span></div>
                <h4 className="aux-detalle-nombre">{detalle.convocatoria.titulo}</h4>
                <div className="aux-detalle-cuadricula"><div><small>Fecha de apertura</small><strong>{textoFecha(detalle.convocatoria.fecha_apertura)}</strong></div><div><small>Fecha de cierre</small><strong>{textoFecha(detalle.convocatoria.fecha_cierre)}</strong></div><div><small>Fecha del examen</small><strong>{textoFecha(detalle.convocatoria.fecha_examen)}</strong></div><div><small>Cupos disponibles</small><strong>{detalle.convocatoria.cupos}</strong></div></div>
                {detalle.convocatoria.descripcion && <div className="aux-detalle-bloque"><h4>Descripción</h4><p>{detalle.convocatoria.descripcion}</p></div>}
                <div className="aux-detalle-bloque"><h4>Requisitos ({detalle.requisitos.length})</h4><ol>{detalle.requisitos.map(r => <li key={r.id}><span>{r.descripcion}</span><small>{r.obligatorio ? 'Obligatorio' : 'Opcional'}</small></li>)}</ol></div>
                {detalle.convocatoria.requisitos_generales && <div className="aux-detalle-bloque"><h4>Indicaciones generales</h4><p>{detalle.convocatoria.requisitos_generales}</p></div>}
              </div>
              <footer className="aux-modal-pie"><span><ShieldCheck size={15}/> Controlado por Dirección</span><div><button type="button" className="aux-boton aux-boton-secundario" onClick={() => setDetalle(null)}>Cerrar</button>{detalle.convocatoria.estado === 'borrador' && <button type="button" className="aux-boton aux-boton-primario" onClick={() => editarBorrador(detalle)}><Pencil size={16}/> Editar borrador</button>}</div></footer>
            </>}
          </section>
        )}
      </div>}
    </div>
  );
}
