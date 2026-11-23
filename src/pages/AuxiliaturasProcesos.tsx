/** SGC · Etapas 2–5. No modifica ni reemplaza la pantalla existente de Convocatorias. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Download,
  FileCheck2, FilePlus2, FileText, GraduationCap, Info, LoaderCircle, Plus,
  RefreshCw, Save, Search, ShieldCheck, Trophy, UploadCloud, UsersRound, X,
} from 'lucide-react';
import {
  buscarEstudiantesAux, cambiarEstadoConv, consultarCriteriosAux, consultarEvaluadoresAux,
  consultarPuntajesAux, consultarRequisitosAux, consultarResultadosAux, crearEstudianteAux,
  descargarDocumentoAux, guardarCriteriosAux, guardarEvaluadoresAux, guardarPuntajesAux,
  guardarRequisitosAux, listarConvocatoriasProceso, listarDocumentosAux,
  listarPostulacionesAux, publicarResultadosAux, registrarPostulacionAux,
  registrarResultadoAux, revisarDocumentoAux, subirDocumentoAux,
  type DocumentoAux, type EstudianteAux, type PostulacionAux,
  type RequisitoVerificacion, type ResultadoAux,
} from '../lib/auxiliaturas-procesos';
import type { Convocatoria } from '../lib/auxiliaturas';
import '../styles/auxiliaturas-procesos.css';

type Seccion = 'postulaciones'|'requisitos'|'evaluaciones'|'resultados';
type Props = { token:string; seccion:Seccion };
type CriterioForm = { codigo:string; nombre:string; puntaje_maximo:string };
type EvaluadorForm = { nombre_docente:string; codigo_docente:string; tipo:'titular'|'invitado' };
type PuntajeForm = { criterio_id:string; nombre:string; maximo:number; puntaje:string; observaciones:string };
const ejemploCPD:CriterioForm[] = [
  {codigo:'MER_APROB',nombre:'Méritos: aprobación de la materia',puntaje_maximo:'24'},
  {codigo:'MER_MISMA',nombre:'Méritos: auxiliatura previa en la misma materia',puntaje_maximo:'12'},
  {codigo:'MER_OTRA',nombre:'Méritos: auxiliatura en otra materia',puntaje_maximo:'4'},
  {codigo:'EX_CONOC',nombre:'Examen: conocimientos',puntaje_maximo:'36'},
  {codigo:'EX_PEDAG',nombre:'Examen: pedagogía',puntaje_maximo:'24'},
];
const nombresEstado:Record<string,string> = {
  borrador:'Borrador',publicada:'Publicada',cerrada:'Cerrada',evaluacion:'En evaluación',
  finalizada:'Finalizada',anulada:'Anulada',registrada:'Registrada',en_revision:'En revisión',
  habilitada:'Habilitada',no_habilitada:'No habilitada',evaluada:'Evaluada',
  seleccionada:'Seleccionada',no_seleccionada:'No seleccionada',retirada:'Retirada',
};
const inicialEvaluadores:EvaluadorForm[] = [
  {nombre_docente:'',codigo_docente:'',tipo:'titular'},
  {nombre_docente:'',codigo_docente:'',tipo:'invitado'},
  {nombre_docente:'',codigo_docente:'',tipo:'invitado'},
];
function errorTexto(e:unknown) {return e instanceof Error?e.message:'Ocurrió un error inesperado.';}
function nombrePost(p:PostulacionAux) { return `${p.apellidos} ${p.nombres} — RU ${p.registro_universitario}`; }
function etiquetaEstado(valor:string) {return nombresEstado[valor]??valor.replaceAll('_',' ');}
function formularioEstado(id:string,postulaciones:PostulacionAux[]) {return postulaciones.find(p=>p.id===id);}

export default function AuxiliaturasProcesos({token,seccion}:Props) {
  const [convocatorias,setConvocatorias] = useState<Convocatoria[]>([]);
  const [convId,setConvId] = useState('');
  const [postulaciones,setPostulaciones] = useState<PostulacionAux[]>([]);
  const [postId,setPostId] = useState('');
  const [cargando,setCargando] = useState(true);
  const [ocupado,setOcupado] = useState(false);
  const [error,setError] = useState('');
  const [exito,setExito] = useState('');
  const [revision,setRevision] = useState(0);
  const [busqueda,setBusqueda] = useState('');
  const [estudiantes,setEstudiantes] = useState<EstudianteAux[]>([]);
  const [estudianteId,setEstudianteId] = useState('');
  const [nuevoEstudiante,setNuevoEstudiante] = useState(false);
  const [errorEstudiante,setErrorEstudiante] = useState('');
  const modalEstudianteRef = useRef<HTMLDivElement>(null);
  const primerCampoEstudianteRef = useRef<HTMLInputElement>(null);
  const botonNuevoEstudianteRef = useRef<HTMLButtonElement>(null);
  const guardandoEstudianteRef = useRef(false);
  const [estudianteForm,setEstudianteForm] = useState({ci:'',registro_universitario:'',nombres:'',apellidos:'',correo:'',telefono:''});
  const [notaPost,setNotaPost] = useState('');
  const [documentos,setDocumentos] = useState<DocumentoAux[]>([]);
  const [tipoDocumento,setTipoDocumento] = useState('Formulario de méritos CPD');
  const [archivo,setArchivo] = useState<File|null>(null);
  const [requisitos,setRequisitos] = useState<RequisitoVerificacion[]>([]);
  const [decisionReq,setDecisionReq] = useState('en_revision');
  const [criterios,setCriterios] = useState<CriterioForm[]>([]);
  const [evaluadores,setEvaluadores] = useState<EvaluadorForm[]>(inicialEvaluadores);
  const [notas,setNotas] = useState<PuntajeForm[]>([]);
  const [resultados,setResultados] = useState<ResultadoAux[]>([]);
  const [decisiones,setDecisiones] = useState<Record<string,{decision:'seleccionado'|'no_seleccionado'|'';observaciones:string}>>({});

  const conv=convocatorias.find(c=>c.id===convId);
  const post=formularioEstado(postId,postulaciones);
  const etapaSiguiente=conv?.estado==='borrador'?'publicada':conv?.estado==='publicada'?'cerrada':
    conv?.estado==='cerrada'?'evaluacion':null;

  function actualizar() {setRevision(r=>r+1);}
  async function accion(fn:()=>Promise<unknown>,mensaje?:string) {
    if(ocupado)return;
    setOcupado(true);setError('');setExito('');
    try{
      const respuesta=await fn();
      const respuestaMensaje=respuesta && typeof respuesta==='object' && 'mensaje' in respuesta &&
        typeof respuesta.mensaje==='string'?respuesta.mensaje:'';
      setExito(respuestaMensaje||mensaje||'Cambios guardados correctamente.');
      actualizar();
    }catch(e){setError(errorTexto(e));}finally{setOcupado(false);}
  }

  useEffect(()=>{
    let activo=true;
    setCargando(true);
    listarConvocatoriasProceso(token).then(r=>{
      if(!activo)return;
      setConvocatorias(r);
      setConvId(v=>r.some(c=>c.id===v)?v:r[0]?.id??'');
    }).catch(e=>{if(activo)setError(errorTexto(e));})
      .finally(()=>{if(activo)setCargando(false);});
    return ()=>{activo=false;};
  },[token,revision]);

  useEffect(()=>{
    let activo=true;
    if(!convId){setPostulaciones([]);return;}
    listarPostulacionesAux(token,convId).then(r=>{
      if(!activo)return;
      setPostulaciones(r);setPostId(v=>r.some(p=>p.id===v)?v:r[0]?.id??'');
    }).catch(e=>{if(activo)setError(errorTexto(e));});
    return ()=>{activo=false;};
  },[token,convId,revision]);

  useEffect(()=>{
    let activo=true;
    if(seccion!=='postulaciones')return;
    buscarEstudiantesAux(token,busqueda).then(r=>{if(activo)setEstudiantes(r);})
      .catch(e=>{if(activo)setError(errorTexto(e));});
    return ()=>{activo=false;};
  },[token,busqueda,seccion,revision]);

  useEffect(()=>{
    let activo=true;
    if(!postId){setDocumentos([]);setRequisitos([]);setNotas([]);return;}
    if(seccion==='postulaciones')listarDocumentosAux(token,postId).then(r=>{if(activo)setDocumentos(r);})
      .catch(e=>{if(activo)setError(errorTexto(e));});
    if(seccion==='requisitos')consultarRequisitosAux(token,postId).then(r=>{
      if(activo){setRequisitos(r);setDecisionReq(postulaciones.find(p=>p.id===postId)?.estado==='habilitada'?'habilitada':
        postulaciones.find(p=>p.id===postId)?.estado==='no_habilitada'?'no_habilitada':'en_revision');}
    }).catch(e=>{if(activo)setError(errorTexto(e));});
    if(seccion==='evaluaciones')consultarPuntajesAux(token,postId).then(r=>{
      if(activo)setNotas(r.map(n=>({criterio_id:n.criterio_id,nombre:n.nombre,maximo:Number(n.puntaje_maximo),
        puntaje:n.puntaje??'',observaciones:n.observaciones??''})));
    }).catch(e=>{if(activo)setError(errorTexto(e));});
    return ()=>{activo=false;};
  },[token,postId,seccion,revision]);

  useEffect(()=>{
    let activo=true;
    if(!convId)return;
    if(seccion==='evaluaciones'){
      void Promise.all([consultarCriteriosAux(token,convId),consultarEvaluadoresAux(token,convId)])
        .then(([c,e])=>{
          if(!activo)return;
          setCriterios(c.map(x=>({codigo:x.codigo,nombre:x.nombre,puntaje_maximo:x.puntaje_maximo})));
          setEvaluadores(e.length?e.map(x=>({nombre_docente:x.nombre_docente,
            codigo_docente:x.codigo_docente??'',tipo:x.tipo})):inicialEvaluadores);
        }).catch(e=>{if(activo)setError(errorTexto(e));});
    }
    if(seccion==='resultados')consultarResultadosAux(token,convId).then(r=>{
      if(!activo)return;
      setResultados(r);
      setDecisiones(Object.fromEntries(r.map(x=>[x.postulacion_id,{
        decision:x.decision??'',observaciones:x.observaciones??'',
      }])));
    }).catch(e=>{if(activo)setError(errorTexto(e));});
    return ()=>{activo=false;};
  },[token,convId,seccion,revision]);

  function cerrarModalEstudiante() {
    if (guardandoEstudianteRef.current) return;
    setNuevoEstudiante(false);
    setErrorEstudiante('');
  }

  useEffect(() => {
    if (!nuevoEstudiante) return;
    const focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    primerCampoEstudianteRef.current?.focus();

    function controlarTeclado(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        if (!guardandoEstudianteRef.current) {
          setNuevoEstudiante(false);
          setErrorEstudiante('');
        }
      }
      if (evento.key !== 'Tab') return;
      const controles = modalEstudianteRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
      );
      if (!controles?.length) return;
      const primero = controles[0]!;
      const ultimo = controles[controles.length - 1]!;
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault(); ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault(); primero.focus();
      }
    }
    document.addEventListener('keydown', controlarTeclado);
    return () => {
      document.removeEventListener('keydown', controlarTeclado);
      document.body.style.overflow = overflowAnterior;
      // Restaurar el foco al botón del panel al cerrar.
      if (focoAnterior?.isConnected) focoAnterior.focus();
      else botonNuevoEstudianteRef.current?.focus();
    };
  }, [nuevoEstudiante]);

  async function crearEstudiante(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if (guardandoEstudianteRef.current) return;
    guardandoEstudianteRef.current = true;
    setOcupado(true);
    setError('');setExito('');setErrorEstudiante('');
    try {
      const datos = Object.fromEntries(Object.entries(estudianteForm).map(([k,v])=>[k,v.trim()])) as typeof estudianteForm;
      const r = await crearEstudianteAux(token, datos);
      // Hacer que esté disponible inmediatamente en el selector, sin esperar otra consulta.
      setEstudiantes(anteriores => [{id:r.id,...datos,correo:datos.correo||null,telefono:datos.telefono||null,activo:true},
        ...anteriores.filter(x=>x.id!==r.id)]);
      setEstudianteId(r.id);
      setBusqueda(datos.ci); // Asegura que también aparezca en la siguiente búsqueda filtrada.
      setEstudianteForm({ci:'',registro_universitario:'',nombres:'',apellidos:'',correo:'',telefono:''});
      setNuevoEstudiante(false);
      setExito('Estudiante registrado y seleccionado. Ahora puedes registrar su postulación.');
      actualizar();
    } catch(err) {
      setErrorEstudiante(errorTexto(err));
    } finally {
      setOcupado(false);
      guardandoEstudianteRef.current = false;
    }
  }
  async function crearPostulacion(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!convId||!estudianteId)return;
    await accion(async()=>{
      const r=await registrarPostulacionAux(token,convId,estudianteId,notaPost);
      setPostId(r.id);setNotaPost('');return r;
    });
  }
  async function subirArchivo(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!archivo||!postId)return;
    await accion(async()=>{
      await subirDocumentoAux(token,postId,tipoDocumento,archivo);
      setArchivo(null);
      const input=document.getElementById('auxp-archivo') as HTMLInputElement|null;
      if(input)input.value='';
    },'Archivo adjuntado correctamente.');
  }
  async function revisarDocumento(docId:string,estado:string) {
    const nota = (estado==='observado'||estado==='rechazado')
      ? window.prompt('Observación para este documento (obligatoria):','') : '';
    if((estado==='observado'||estado==='rechazado') && (!nota || !nota.trim())) return;
    await accion(()=>revisarDocumentoAux(token,docId,estado,nota?.trim()||null));
  }
  async function cambiarEtapa() {
    if(!convId||!etapaSiguiente)return;
    const mensaje=etapaSiguiente==='publicada'?'Publicar la convocatoria y habilitar el registro administrativo de postulantes?':
      etapaSiguiente==='cerrada'?'Cerrar las postulaciones de esta convocatoria?':
      'Iniciar la evaluación? Las postulaciones deben tener requisitos revisados.';
    if(!window.confirm(mensaje))return;
    await accion(()=>cambiarEstadoConv(token,convId,etapaSiguiente));
  }
  async function guardarVerificaciones(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!postId)return;
    await accion(()=>guardarRequisitosAux(token,postId,decisionReq,requisitos));
  }
  async function guardarCriterios(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!convId)return;
    await accion(()=>guardarCriteriosAux(token,convId,criterios.map(c=>({
      codigo:c.codigo.trim(),nombre:c.nombre.trim(),puntaje_maximo:Number(c.puntaje_maximo),
    }))));
  }
  async function guardarEvaluadores(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!convId)return;
    await accion(()=>guardarEvaluadoresAux(token,convId,evaluadores.map(e=>({
      nombre_docente:e.nombre_docente.trim(),codigo_docente:e.codigo_docente.trim()||null,tipo:e.tipo,
    }))));
  }
  async function guardarNotas(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!postId)return;
    await accion(()=>guardarPuntajesAux(token,postId,notas.map(n=>({
      criterio_id:n.criterio_id,puntaje:n.puntaje===''?null:Number(n.puntaje),
      observaciones:n.observaciones.trim()||null,
    }))));
  }
  async function guardarDecision(postulacionId:string){
    const dato=decisiones[postulacionId];if(!dato||!dato.decision)return;
    if(!window.confirm(`Registrar decisión: ${dato.decision.replaceAll('_',' ')}?`))return;
    await accion(()=>registrarResultadoAux(token,postulacionId,dato.decision as 'seleccionado'|'no_seleccionado',dato.observaciones));
  }
  async function publicar(){
    if(!convId)return;
    if(!window.confirm('¿Confirmas publicar los resultados validados y finalizar esta convocatoria? Esta acción no se puede deshacer.'))return;
    await accion(()=>publicarResultadosAux(token,convId));
  }
  function exportarCSV(){
    if(!conv?.resultados_publicados)return;
    const esc=(s:string|number|null)=>`"${String(s??'').replaceAll('"','""')}"`;
    const lineas=[['Nombre completo','Registro universitario','Nota total','Resultado'],...resultados
      .filter(r=>r.decision).map(r=>[`${r.apellidos} ${r.nombres}`,r.registro_universitario,
        r.puntaje_total,r.decision==='seleccionado'?'Seleccionado':'No seleccionado'])]
      .map(f=>f.map(x=>esc(x)).join(';'));
    const blob=new Blob(['\uFEFF'+lineas.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
    a.download=`resultados-auxiliatura-${conv.gestion}-${conv.semestre}.csv`;a.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1200);
  }

  return <section className="auxp-modulo" aria-label={`Gestión de ${seccion}`}>
    <div className="auxp-cabecera">
      <div><span className="auxp-ceja">PROCESO DE SELECCIÓN · {seccion.toUpperCase()}</span>
        <h2>{seccion==='postulaciones'?'Registro de postulantes':seccion==='requisitos'?'Verificación de requisitos':
          seccion==='evaluaciones'?'Evaluación de aspirantes':'Resultados de auxiliaturas'}</h2>
        <p>Gestión administrativa exclusiva de la Dirección de Carrera.</p></div>
      <button className="auxp-btn auxp-btn-ligero" type="button" onClick={actualizar} disabled={ocupado}>
        <RefreshCw size={16}/> Actualizar</button>
    </div>
    <div className="auxp-selector-linea">
      <label className="auxp-campo auxp-selector">Convocatoria
        <select value={convId} onChange={e=>{setConvId(e.target.value);setPostId('');setError('');setExito('');}} disabled={cargando}>
          {convocatorias.length===0&&<option value="">No hay convocatorias</option>}
          {convocatorias.map(c=><option key={c.id} value={c.id}>{c.materia_nombre} · {c.gestion}-{c.semestre===1?'I':'II'} · {etiquetaEstado(c.estado)}</option>)}
        </select>
      </label>
      {conv&&<div className="auxp-conv-estado">
        <span className="auxp-pill">{etiquetaEstado(conv.estado)}</span>
        <span>{conv.cupos} cupo(s)</span>
        {etapaSiguiente&&<button type="button" className="auxp-btn auxp-btn-secundario" disabled={ocupado}
          onClick={()=>void cambiarEtapa()}>Pasar a {etiquetaEstado(etapaSiguiente)} <ArrowRight size={15}/></button>}
      </div>}
    </div>
    {error&&<div className="auxp-alerta auxp-error" role="alert"><AlertTriangle size={18}/><span>{error}</span><button type="button" onClick={()=>setError('')}>Cerrar</button></div>}
    {exito&&<div className="auxp-alerta auxp-exito" role="status"><CheckCircle2 size={18}/><span>{exito}</span></div>}
    {cargando?<div className="auxp-vacio"><LoaderCircle size={24}/> Cargando...</div>:!conv?
      <div className="auxp-vacio"><BookOpen size={25}/> Primero crea una convocatoria desde la etapa Convocatorias.</div>:null}

    {conv&&seccion==='postulaciones'&&<div className="auxp-grid-dos">
      <div className="auxp-tarjeta">
        <div className="auxp-tarjeta-cabecera auxp-tarjeta-cabecera-accion">
          <UsersRound size={21}/><h3>Inscribir aspirante</h3>
          <button ref={botonNuevoEstudianteRef} type="button" className="auxp-btn auxp-btn-nuevo-estudiante"
            onClick={()=>{setErrorEstudiante('');setNuevoEstudiante(true);}}>
            <FilePlus2 size={17}/> Nuevo estudiante
          </button>
        </div>
        <p className="auxp-panel-ayuda">Busca un estudiante existente o registra uno nuevo si todavía no está en el sistema.</p>
        {conv.estado!=='publicada'&&<p className="auxp-nota"><Info size={15}/> Publica la convocatoria desde el control superior para admitir postulaciones.</p>}
        <form onSubmit={e=>void crearPostulacion(e)} className="auxp-form">
          <label className="auxp-campo">Buscar estudiante por nombre, CI o RU
            <span className="auxp-input-icon"><Search size={15}/><input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar estudiante..."/></span></label>
          <label className="auxp-campo">Estudiante
            <select required value={estudianteId} onChange={e=>setEstudianteId(e.target.value)}>
              <option value="">Selecciona un estudiante existente</option>
              {estudiantes.map(e=><option key={e.id} value={e.id}>{e.apellidos} {e.nombres} · RU {e.registro_universitario}</option>)}
            </select></label>
          <label className="auxp-campo">Observaciones (opcional)<textarea rows={2} value={notaPost} onChange={e=>setNotaPost(e.target.value)} maxLength={2500}/></label>
          <button className="auxp-btn auxp-btn-primario" type="submit" disabled={ocupado||!estudianteId||conv.estado!=='publicada'}><Plus size={16}/> Registrar postulación</button>
        </form>
        <p className="auxp-nota"><Info size={15}/> Los estudiantes se reutilizan de la tabla general del SGC. Comprueba que no existan antes de crear otro registro.</p>
      </div>
      <div className="auxp-tarjeta">
        <div className="auxp-tarjeta-cabecera"><ClipboardCheck size={20}/><h3>Postulaciones y documentos</h3><span className="auxp-contador">{postulaciones.length}</span></div>
        <SeleccionPost postId={postId} setPostId={setPostId} postulaciones={postulaciones}/>
        {post&&<><div className="auxp-ficha"><strong>{nombrePost(post)}</strong><small>Estado: {etiquetaEstado(post.estado)} · Documentos: {post.documentos_cantidad}</small></div>
          <form onSubmit={e=>void subirArchivo(e)} className="auxp-form auxp-form-documentos">
            <label className="auxp-campo">Tipo de documento
              <select value={tipoDocumento} onChange={e=>setTipoDocumento(e.target.value)}>
                <option>Formulario de méritos CPD</option><option>Carta de solicitud</option><option>Comprobante de matrícula</option>
                <option>Cédula de identidad</option><option>Currículum vitae</option><option>Otro documento</option>
              </select></label>
            <label className="auxp-campo">Archivo privado (PDF, PNG o JPG · máximo 6 MB)
              <input id="auxp-archivo" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={e=>setArchivo(e.target.files?.[0]??null)}/></label>
            <button className="auxp-btn auxp-btn-secundario" type="submit" disabled={!archivo||ocupado||conv.estado==='finalizada'}><UploadCloud size={16}/> Adjuntar documento</button>
          </form>
          <div className="auxp-documentos">{documentos.length===0?<p className="auxp-muted">Sin documentos adjuntos.</p>:
            documentos.map(d=><div className="auxp-documento" key={d.id}><FileText size={17}/><span><strong>{d.tipo_documento}</strong><small>{d.nombre_archivo}</small></span>
              <select aria-label={`Estado de ${d.nombre_archivo}`} value={d.estado} disabled={ocupado||
                !['registrada','en_revision','habilitada','no_habilitada'].includes(post.estado)}
                onChange={e=>void revisarDocumento(d.id,e.target.value)}>
                <option value="entregado">Entregado</option><option value="observado">Observado</option>
                <option value="aprobado">Aprobado</option><option value="rechazado">Rechazado</option>
              </select>
              <button type="button" title="Descargar archivo privado" onClick={()=>void accion(()=>descargarDocumentoAux(token,d.id,d.nombre_archivo),'Descarga iniciada.')}><Download size={17}/></button></div>)}</div>
        </>}
      </div>
    </div>}

    {conv&&seccion==='requisitos'&&<div className="auxp-tarjeta">
      <div className="auxp-tarjeta-cabecera"><ClipboardCheck size={20}/><h3>Revisar documentos y condiciones</h3></div>
      <SeleccionPost postId={postId} setPostId={setPostId} postulaciones={postulaciones}/>
      {!post?<p className="auxp-muted">Todavía no hay postulaciones en esta convocatoria.</p>:<form className="auxp-form" onSubmit={e=>void guardarVerificaciones(e)}>
        <div className="auxp-ficha"><strong>{nombrePost(post)}</strong><small>Estado actual: {etiquetaEstado(post.estado)}</small></div>
        <p className="auxp-nota"><Info size={15}/> Revisa los documentos adjuntos en Postulaciones y comprueba cada requisito antes de habilitar al estudiante.</p>
        <div className="auxp-requisitos">{requisitos.map((r,i)=><div className="auxp-requisito" key={r.requisito_id}>
          <div><strong>{i+1}. {r.descripcion}</strong><small>{r.obligatorio?'Obligatorio':'Opcional'}</small></div>
          <label className="auxp-campo">Cumplimiento
            <select value={r.cumple===null?'pendiente':r.cumple?'si':'no'}
              disabled={!['registrada','en_revision','habilitada','no_habilitada'].includes(post.estado)}
              onChange={e=>setRequisitos(v=>v.map(x=>x.requisito_id===r.requisito_id?{...x,cumple:e.target.value==='pendiente'?null:e.target.value==='si'}:x))}>
              <option value="pendiente">Sin revisar</option><option value="si">Cumple</option><option value="no">No cumple</option>
            </select></label>
          <label className="auxp-campo">Observaciones
            <input value={r.observaciones??''} maxLength={1500} placeholder="Observación (opcional)"
              disabled={!['registrada','en_revision','habilitada','no_habilitada'].includes(post.estado)}
              onChange={e=>setRequisitos(v=>v.map(x=>x.requisito_id===r.requisito_id?{...x,observaciones:e.target.value}:x))}/></label>
        </div>)}</div>
        <label className="auxp-campo auxp-decision-final">Decisión de habilitación
          <select value={decisionReq} onChange={e=>setDecisionReq(e.target.value)}>
            <option value="en_revision">En revisión</option><option value="habilitada">Habilitada para evaluación</option>
            <option value="no_habilitada">No habilitada</option>
          </select></label>
        <button className="auxp-btn auxp-btn-primario" type="submit" disabled={ocupado||requisitos.length===0||
          !['registrada','en_revision','habilitada','no_habilitada'].includes(post.estado)||
          !['publicada','cerrada','evaluacion'].includes(conv.estado)}><Save size={16}/> Guardar verificación</button>
        {post.estado==='evaluada'&&<p className="auxp-nota">Esta postulación ya fue evaluada. No puedes modificar su habilitación.</p>}
      </form>}
    </div>}

    {conv&&seccion==='evaluaciones'&&<div className="auxp-grid-dos">
      <div className="auxp-tarjeta">
        <div className="auxp-tarjeta-cabecera"><FileCheck2 size={20}/><h3>Criterios y máximos</h3></div>
        <p className="auxp-nota"><Info size={15}/> Configura la escala aprobada para esta convocatoria. El modelo CPD de 100 puntos es solo un ejemplo editable.</p>
        <form className="auxp-form" onSubmit={e=>void guardarCriterios(e)}>
          {criterios.map((c,i)=><div className="auxp-criterio" key={i}>
            <label className="auxp-campo">Código<input required value={c.codigo} maxLength={40}
              onChange={e=>setCriterios(v=>v.map((x,j)=>j===i?{...x,codigo:e.target.value}:x))}/></label>
            <label className="auxp-campo">Criterio<input required value={c.nombre} maxLength={150}
              onChange={e=>setCriterios(v=>v.map((x,j)=>j===i?{...x,nombre:e.target.value}:x))}/></label>
            <label className="auxp-campo">Máximo<input type="number" min="0.01" max="1000" step="0.01" required
              value={c.puntaje_maximo} onChange={e=>setCriterios(v=>v.map((x,j)=>j===i?{...x,puntaje_maximo:e.target.value}:x))}/></label>
            <button type="button" title="Quitar criterio" onClick={()=>setCriterios(v=>v.filter((_,j)=>j!==i))}>×</button>
          </div>)}
          <div className="auxp-acciones-flex">
            <button type="button" className="auxp-btn auxp-btn-ligero" onClick={()=>setCriterios(v=>[...v,{codigo:'',nombre:'',puntaje_maximo:'1'}])} disabled={criterios.length>=15}><Plus size={15}/> Agregar</button>
            <button type="button" className="auxp-btn auxp-btn-ligero" onClick={()=>setCriterios(ejemploCPD.map(x=>({...x})))}>Ejemplo CPD 40/60</button>
          </div>
          <p className="auxp-suma">Máximo total configurado: <strong>{criterios.reduce((s,c)=>s+(Number(c.puntaje_maximo)||0),0).toFixed(2)} puntos</strong></p>
          <button className="auxp-btn auxp-btn-primario" type="submit" disabled={ocupado||!criterios.length||!['borrador','publicada','cerrada'].includes(conv.estado)}><Save size={16}/> Guardar criterios</button>
          {conv.estado==='evaluacion'&&<p className="auxp-nota">Los criterios no se editan una vez iniciada la evaluación.</p>}
        </form>
        <div className="auxp-separador"/>
        <div className="auxp-tarjeta-cabecera"><UsersRound size={20}/><h3>Comisión evaluadora</h3></div>
        <form className="auxp-form" onSubmit={e=>void guardarEvaluadores(e)}>
          {evaluadores.map((ev,i)=><div className="auxp-comision" key={i}>
            <span className="auxp-num">{i+1}</span>
            <label className="auxp-campo">Nombre docente<input required maxLength={180} value={ev.nombre_docente}
              onChange={e=>setEvaluadores(v=>v.map((x,j)=>i===j?{...x,nombre_docente:e.target.value}:x))}/></label>
            <label className="auxp-campo">Rol<select value={ev.tipo} onChange={e=>setEvaluadores(v=>v.map((x,j)=>i===j?{...x,tipo:e.target.value as EvaluadorForm['tipo']}:x))}>
              <option value="titular">Titular</option><option value="invitado">Invitado</option></select></label>
          </div>)}
          <button className="auxp-btn auxp-btn-secundario" type="submit" disabled={ocupado||conv.estado==='finalizada'}><Save size={16}/> Guardar comisión</button>
        </form>
      </div>
      <div className="auxp-tarjeta">
        <div className="auxp-tarjeta-cabecera"><GraduationCap size={20}/><h3>Registrar calificaciones</h3></div>
        <SeleccionPost postId={postId} setPostId={setPostId} postulaciones={postulaciones}
          filtro={p=>['habilitada','evaluada','seleccionada','no_seleccionada'].includes(p.estado)}/>
        {post&&<form className="auxp-form" onSubmit={e=>void guardarNotas(e)}>
          <div className="auxp-ficha"><strong>{nombrePost(post)}</strong><small>Estado: {etiquetaEstado(post.estado)}</small></div>
          {notas.length===0?<p className="auxp-nota">Primero configura y guarda los criterios de evaluación.</p>:
            notas.map((n,i)=><label className="auxp-campo auxp-nota-fila" key={n.criterio_id}>
              <span>{n.nombre} <small>(máx. {n.maximo})</small></span>
              <input type="number" min="0" max={n.maximo} step="0.01" value={n.puntaje} placeholder="Sin calificar"
                disabled={!['habilitada','evaluada'].includes(post.estado)}
                onChange={e=>setNotas(v=>v.map((x,j)=>i===j?{...x,puntaje:e.target.value}:x))}/>
              <input value={n.observaciones} placeholder="Observación" maxLength={1500}
                disabled={!['habilitada','evaluada'].includes(post.estado)}
                onChange={e=>setNotas(v=>v.map((x,j)=>i===j?{...x,observaciones:e.target.value}:x))}/>
            </label>)}
          <p className="auxp-suma">Puntaje registrado: <strong>{notas.filter(n=>n.puntaje!=='').reduce((s,n)=>s+Number(n.puntaje),0).toFixed(2)}</strong> / {notas.reduce((s,n)=>s+n.maximo,0)} puntos
            <small> ({notas.filter(n=>n.puntaje!=='').length}/{notas.length} criterios calificados)</small></p>
          <button type="submit" className="auxp-btn auxp-btn-primario" disabled={ocupado||!notas.length||conv.estado!=='evaluacion'||
            !['habilitada','evaluada'].includes(post.estado)}><Save size={16}/> Guardar calificaciones</button>
          {conv.estado!=='evaluacion'&&<p className="auxp-nota">Para guardar notas, la convocatoria debe estar en evaluación.</p>}
        </form>}
      </div>
    </div>}

    {conv&&seccion==='resultados'&&<div className="auxp-tarjeta">
      <div className="auxp-tarjeta-cabecera"><Trophy size={20}/><h3>Selección y publicación de resultados</h3>
        <span className="auxp-contador">{resultados.length} aspirante(s)</span></div>
      <p className="auxp-nota"><ShieldCheck size={16}/> La Dirección registra cada decisión; el sistema comprueba notas completas y cupos disponibles. No selecciona ganadores automáticamente.</p>
      <div className="auxp-tabla-wrap"><table className="auxp-tabla"><thead><tr><th>Aspirante</th><th>Estado</th><th>Puntaje</th><th>Decisión validada</th><th>Acción</th></tr></thead><tbody>
        {resultados.map(r=>{
          const d=decisiones[r.postulacion_id]??{decision:'',observaciones:''};
          const editable=conv.estado==='evaluacion'&&!conv.resultados_publicados&&
            ['evaluada','seleccionada','no_seleccionada'].includes(r.estado)&&r.puntaje_total!==null;
          return <tr key={r.postulacion_id}><td><strong>{r.apellidos} {r.nombres}</strong><small>RU {r.registro_universitario}</small></td>
            <td><span className="auxp-pill">{etiquetaEstado(r.estado)}</span></td>
            <td><strong>{r.puntaje_total??'Pendiente'}</strong><small>{r.criterios_calificados}/{r.criterios_configurados} criterios</small></td>
            <td><select value={d.decision} disabled={!editable} onChange={e=>setDecisiones(v=>({...v,[r.postulacion_id]:{...d,decision:e.target.value as typeof d.decision}}))}>
              <option value="">Pendiente</option><option value="seleccionado">Seleccionado</option><option value="no_seleccionado">No seleccionado</option>
            </select>
            <input aria-label="Observaciones de decisión" value={d.observaciones} disabled={!editable} maxLength={2500}
              onChange={e=>setDecisiones(v=>({...v,[r.postulacion_id]:{...d,observaciones:e.target.value}}))} placeholder="Observaciones"/></td>
            <td><button type="button" className="auxp-btn auxp-btn-secundario" disabled={ocupado||!editable||!d.decision}
              onClick={()=>void guardarDecision(r.postulacion_id)}><Save size={15}/> Validar</button></td></tr>;
        })}
        {!resultados.length&&<tr><td colSpan={5} className="auxp-muted">No hay postulantes para mostrar.</td></tr>}
      </tbody></table></div>
      <div className="auxp-publicacion">
        <div><strong>{conv.resultados_publicados?'Resultados publicados':'Publicación pendiente'}</strong>
          <p>{conv.resultados_publicados?'La convocatoria está finalizada. Puedes exportar la lista validada.':
            `Cupos disponibles: ${conv.cupos}. Valida una decisión para cada aspirante habilitado y evaluado.`}</p></div>
        {conv.resultados_publicados?<button type="button" className="auxp-btn auxp-btn-primario" onClick={exportarCSV}><Download size={17}/> Exportar resultados CSV</button>:
          <button type="button" className="auxp-btn auxp-btn-primario" onClick={()=>void publicar()}
            disabled={ocupado||conv.estado!=='evaluacion'||!resultados.some(r=>r.decision)}><Trophy size={17}/> Publicar resultados</button>}
      </div>
      <p className="auxp-nota"><Info size={15}/> La publicación marca los resultados como oficiales dentro del SGC y permite exportarlos. Este sistema no tiene todavía un portal público de estudiantes.</p>
    </div>}
    {nuevoEstudiante && seccion==='postulaciones' && createPortal(
      <div className="auxp-modal-velo" onMouseDown={e=>{
        if (e.target===e.currentTarget) cerrarModalEstudiante();
      }}>
        <div ref={modalEstudianteRef} role="dialog" aria-modal="true" aria-labelledby="auxp-nuevo-estudiante-titulo"
          aria-describedby="auxp-nuevo-estudiante-descripcion" className="auxp-modal-estudiante">
          <div className="auxp-modal-encabezado">
            <span className="auxp-modal-icono"><UsersRound size={22}/></span>
            <div className="auxp-modal-titulos">
              <span className="auxp-modal-etiqueta">DIRECCIÓN DE CARRERA · REGISTRO ACADÉMICO</span>
              <h2 id="auxp-nuevo-estudiante-titulo">Registrar nuevo estudiante</h2>
              <p id="auxp-nuevo-estudiante-descripcion">Completa los datos para añadir un estudiante al catálogo general del SGC.</p>
            </div>
            <button type="button" className="auxp-modal-cerrar" aria-label="Cerrar ventana" title="Cerrar"
              disabled={ocupado} onClick={cerrarModalEstudiante}><X size={20}/></button>
          </div>
          <form onSubmit={e=>void crearEstudiante(e)}>
            <div className="auxp-modal-cuerpo">
              {errorEstudiante && <div className="auxp-modal-error" role="alert"><AlertTriangle size={18}/>{errorEstudiante}</div>}
              <p className="auxp-modal-ayuda"><Info size={17}/> Verifica que el estudiante no esté registrado previamente. Los campos marcados con * son obligatorios.</p>
              <div className="auxp-campos-dos auxp-modal-campos">
                {(['ci','registro_universitario','nombres','apellidos','correo','telefono'] as const).map((campo,i)=><label className="auxp-campo" key={campo}>
                  <span>{ {ci:'Cédula de identidad',registro_universitario:'Registro universitario (RU)',nombres:'Nombres',apellidos:'Apellidos',correo:'Correo electrónico',telefono:'Teléfono'}[campo] }{i<4 ? ' *' : ''}</span>
                  <input ref={i===0 ? primerCampoEstudianteRef : undefined}
                    autoComplete={campo==='nombres'?'given-name':campo==='apellidos'?'family-name':campo==='correo'?'email':campo==='telefono'?'tel':'off'}
                    required={i<4} value={estudianteForm[campo]}
                    type={campo==='correo'?'email':campo==='telefono'?'tel':'text'}
                    maxLength={campo==='ci'?35:campo==='registro_universitario'?45:campo==='correo'?140:campo==='telefono'?40:140}
                    onChange={e=>setEstudianteForm(f=>({...f,[campo]:e.target.value}))}/>
                </label>)}
              </div>
            </div>
            <div className="auxp-modal-acciones">
              <button type="button" className="auxp-btn auxp-btn-modal-cancelar" disabled={ocupado}
                onClick={cerrarModalEstudiante}>Cancelar</button>
              <button type="submit" className="auxp-btn auxp-btn-modal-guardar" disabled={ocupado}>
                {ocupado?<LoaderCircle size={17} className="auxp-girando"/>:<Save size={17}/>}
                {ocupado?'Guardando…':'Guardar estudiante'}
              </button>
            </div>
          </form>
        </div>
      </div>,document.body
    )}
  </section>;
}

function SeleccionPost({postId,setPostId,postulaciones,filtro}:{postId:string;setPostId:(id:string)=>void;
  postulaciones:PostulacionAux[];filtro?:(p:PostulacionAux)=>boolean}){
  const opciones=filtro?postulaciones.filter(filtro):postulaciones;
  const actual=opciones.some(p=>p.id===postId)?postId:opciones[0]?.id??'';
  useEffect(()=>{if(actual!==postId)setPostId(actual);},[actual,postId,setPostId]);
  return <label className="auxp-campo auxp-seleccion-post">Aspirante
    <select value={actual} onChange={e=>setPostId(e.target.value)}>
      {!opciones.length&&<option value="">No hay aspirantes disponibles</option>}
      {opciones.map(p=><option key={p.id} value={p.id}>{nombrePost(p)} · {etiquetaEstado(p.estado)}</option>)}
    </select></label>;
}
