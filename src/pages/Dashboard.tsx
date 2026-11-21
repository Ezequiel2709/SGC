import { useEffect, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, CalendarDays, ClipboardCheck, Clock3,
  FileClock, Files, FolderOpen, Inbox, Send, ShieldCheck, UsersRound,
} from 'lucide-react';
import { obtenerCorrespondencia } from '../lib/backend';

type DashboardProps = {
  nombreUsuario: string;
  abrirCorrespondencia: () => void;
  abrirAsistencia: () => void;
  rol: 'directora' | 'secretaria' | 'docente';
  token: string | null;
};

type DocumentoResumen = {
  id: number | string;
  tipo: 'recibida' | 'expedida';
  estado: string;
  referencia: string;
  fecha_creacion?: string;
};

type EstadoResumen = {
  recibidos: number;
  expedidos: number;
  enProceso: number;
  recientes: DocumentoResumen[];
};

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function extraerDocumentos(datos: unknown): DocumentoResumen[] {
  if (!esRegistro(datos) || !Array.isArray(datos.documentos)) {
    throw new Error('La API devolvió un formato de documentos inesperado.');
  }
  return datos.documentos.filter((entrada: unknown): entrada is DocumentoResumen => {
    if (!esRegistro(entrada)) return false;
    return (entrada.tipo === 'recibida' || entrada.tipo === 'expedida')
      && typeof entrada.estado === 'string'
      && typeof entrada.referencia === 'string'
      && (typeof entrada.id === 'string' || typeof entrada.id === 'number');
  });
}

function calcularResumen(documentos: DocumentoResumen[]): EstadoResumen {
  const estadosTerminados = new Set(['finalizado', 'entregado']);
  return {
    recibidos: documentos.filter((doc) => doc.tipo === 'recibida').length,
    expedidos: documentos.filter((doc) => doc.tipo === 'expedida').length,
    enProceso: documentos.filter((doc) => !estadosTerminados.has(doc.estado)).length,
    recientes: documentos.slice(0, 4),
  };
}

function fechaLegible(valor?: string): string {
  if (!valor) return 'Fecha no disponible';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }).format(fecha);
}

export default function Dashboard({
  nombreUsuario, abrirCorrespondencia, abrirAsistencia, rol, token,
}: DashboardProps) {
  const [resumen, setResumen] = useState<EstadoResumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || rol === 'docente') return;
    let activo = true;
    setCargando(true);
    setError('');
    obtenerCorrespondencia(token)
      .then((datos) => {
        if (activo) setResumen(calcularResumen(extraerDocumentos(datos)));
      })
      .catch((e: unknown) => {
        if (activo) {
          setResumen(null);
          setError(e instanceof Error ? e.message : 'No se pudo consultar la correspondencia.');
        }
      })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [token, rol]);

  const fechaHoy = new Intl.DateTimeFormat('es-BO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());
  const indicador = (valor: number | undefined) => cargando ? '…' : valor ?? '—';

  return (
    <section className="sgc-dashboard">
      <div className="sgc-dashboard-miga">Inicio <span>/</span> Dashboard principal</div>
      <div className="sgc-hero">
        <div className="sgc-hero-contenido">
          <span className="sgc-hero-ceja"><ShieldCheck size={15} /> DIRECCIÓN DE CARRERA · UAGRM</span>
          <h2>Bienvenido/a, {nombreUsuario}</h2>
          <p>Tu espacio para gestionar los procesos administrativos y académicos de Ingeniería en Sistemas.</p>
          <span className="sgc-hero-fecha"><CalendarDays size={16} /> {fechaHoy}</span>
        </div>
        <div className="sgc-hero-insignia" aria-hidden="true">SGC<span>UAGRM</span></div>
      </div>

      {rol === 'docente' ? (
        <>
          <div className="sgc-seccion-titulo"><h3>Panel docente</h3><p>Accede a tus clases y a tu registro de asistencia.</p></div>
          <div className="sgc-accesos-grid sgc-accesos-grid-uno">
            <button type="button" className="sgc-acceso" onClick={abrirAsistencia}>
              <span className="sgc-acceso-icono rojo"><ClipboardCheck size={25} /></span>
              <span><strong>Mi asistencia</strong><small>Consultar horario, marcar entrada con fotografía y revisar solicitudes.</small></span>
              <ArrowUpRight className="sgc-acceso-flecha" size={20} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="sgc-seccion-titulo sgc-seccion-titulo-kpis">
            <div><h3>Resumen de Correspondencia</h3><p>Información obtenida de los documentos registrados en el sistema.</p></div>
            <span className="sgc-periodo"><CalendarDays size={15} /> Todas las gestiones</span>
          </div>
          <div className="sgc-indicadores">
            <article className="sgc-indicador">
              <div className="sgc-indicador-superior"><span className="sgc-stat-icono azul"><Inbox size={21} /></span><span className="sgc-stat-detalle">Recibidos</span></div>
              <strong>{indicador(resumen?.recibidos)}</strong><p>Documentos recibidos</p>
            </article>
            <article className="sgc-indicador">
              <div className="sgc-indicador-superior"><span className="sgc-stat-icono rojo"><Send size={21} /></span><span className="sgc-stat-detalle">Expedidos</span></div>
              <strong>{indicador(resumen?.expedidos)}</strong><p>Documentos expedidos</p>
            </article>
            <article className="sgc-indicador">
              <div className="sgc-indicador-superior"><span className="sgc-stat-icono violeta"><FileClock size={21} /></span><span className="sgc-stat-detalle">En seguimiento</span></div>
              <strong>{indicador(resumen?.enProceso)}</strong><p>Documentos aún no finalizados o entregados</p>
            </article>
          </div>
          {error && <p className="sgc-dashboard-error" role="alert">No se pudieron cargar los indicadores: {error}</p>}
          <div className="sgc-seccion-titulo"><h3>Accesos rápidos</h3><p>Ingresa a los módulos disponibles de la Dirección de Carrera.</p></div>
          <div className="sgc-accesos-grid">
            <button type="button" className="sgc-acceso" onClick={abrirCorrespondencia}>
              <span className="sgc-acceso-icono azul"><FolderOpen size={25} /></span>
              <span><strong>Gestionar Correspondencia</strong><small>Consultar, registrar y dar seguimiento a los documentos.</small></span>
              <ArrowUpRight className="sgc-acceso-flecha" size={20} />
            </button>
            {rol === 'directora' && (
              <button type="button" className="sgc-acceso" onClick={abrirAsistencia}>
                <span className="sgc-acceso-icono rojo"><UsersRound size={25} /></span>
                <span><strong>Plantel Docente y Asistencia</strong><small>Docentes, materias, horarios, solicitudes y reportes.</small></span>
                <ArrowUpRight className="sgc-acceso-flecha" size={20} />
              </button>
            )}
          </div>
          <div className="sgc-inferior-grid">
            <section className="sgc-panel sgc-panel-recientes" aria-labelledby="sgc-recientes-titulo">
              <div className="sgc-panel-header"><div><h3 id="sgc-recientes-titulo">Documentos recientes</h3><p>Últimos registros en Correspondencia</p></div><Files size={20} /></div>
              {cargando ? <p className="sgc-panel-vacio">Cargando documentos...</p> : !resumen?.recientes.length ? (
                <p className="sgc-panel-vacio">{error ? 'No se pudieron consultar los documentos.' : 'Todavía no hay documentos registrados.'}</p>
              ) : (
                <div className="sgc-lista-recientes">
                  {resumen.recientes.map((doc) => (
                    <div className="sgc-reciente" key={String(doc.id)}>
                      <span className={`sgc-reciente-icono ${doc.tipo}`}>
                        {doc.tipo === 'recibida' ? <Inbox size={17} /> : <Send size={17} />}
                      </span>
                      <div className="sgc-reciente-contenido"><strong>{doc.referencia}</strong><small>{doc.tipo === 'recibida' ? 'Recibido' : 'Expedido'} · {doc.estado.replaceAll('_', ' ')}</small></div>
                      <span className="sgc-reciente-fecha">{fechaLegible(doc.fecha_creacion)}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="sgc-link-discreto" type="button" onClick={abrirCorrespondencia}>Ver todos los documentos <ArrowRight size={16} /></button>
            </section>
            <section className="sgc-panel sgc-panel-info" aria-labelledby="sgc-panel-info-titulo">
              <div className="sgc-panel-header"><div><h3 id="sgc-panel-info-titulo">Área administrativa</h3><p>Estado del sistema</p></div><Clock3 size={20} /></div>
              <div className="sgc-info-recuadro"><span className="sgc-punto-activo" /><div><strong>Módulos disponibles</strong><p>Correspondencia y Plantel Docente con asistencia.</p></div></div>
              <div className="sgc-info-recuadro"><span className="sgc-punto-espera" /><div><strong>Próximamente</strong><p>Titulaciones y Auxiliaturas se habilitarán cuando estén desarrollados.</p></div></div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
