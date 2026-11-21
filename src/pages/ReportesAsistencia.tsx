import { useState, type FormEvent } from 'react';
import type { Docente, Materia } from '../lib/plantel';
import {
  descargarReporte, fechaHoyBolivia, obtenerReporteAsistencia,
  type EstadoReporte, type FiltrosReporte, type ReporteAsistencia,
} from '../lib/reportesAsistencia';
import '../styles/reportes-asistencia.css';
import { BarChart3, FileSpreadsheet, FileText, Printer, Search, CalendarDays } from 'lucide-react';

type Props = { token: string; docentes: Docente[]; materias: Materia[] };
const etiquetas: Record<EstadoReporte,string> = {
  marcada: 'Marcada con foto', corregida: 'Corrección aprobada',
  justificada: 'Justificación aprobada', falta_registrada: 'Falta registrada',
  sin_registro: 'Sin registro', en_ventana: 'Ventana abierta', programada: 'Programada',
};
const TAMANO_PAGINA = 40;
const MAXIMO_IMPRESION = 1500;
const hoy = fechaHoyBolivia();
const inicial: FiltrosReporte = {
  desde: `${hoy.slice(0, 7)}-01`, hasta: hoy, docenteId: '', materiaId: '', gestion: '',
};

export default function ReportesAsistencia({ token, docentes, materias }: Props) {
  const [filtros, setFiltros] = useState<FiltrosReporte>(inicial);
  const [aplicados, setAplicados] = useState<FiltrosReporte | null>(null);
  const [reporte, setReporte] = useState<ReporteAsistencia | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');
  const [pagina, setPagina] = useState(1);

  function cambiar<K extends keyof FiltrosReporte>(campo: K, valor: FiltrosReporte[K]) {
    setFiltros(anterior => ({ ...anterior, [campo]: valor }));
  }
  const filtrosCambiados = Boolean(aplicados && JSON.stringify(filtros) !== JSON.stringify(aplicados));
  async function generar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true); setError('');
    try {
      const nuevo = await obtenerReporteAsistencia(token, filtros);
      setReporte(nuevo); setAplicados({ ...filtros }); setPagina(1);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo generar el reporte.');
    } finally { setOcupado(false); }
  }
  async function exportarArchivo(formato: 'csv' | 'excel') {
    if (!aplicados || !reporte || filtrosCambiados || descargando) return;
    setDescargando(true); setError('');
    try { await descargarReporte(token, aplicados, formato); }
    catch (fallo) { setError(fallo instanceof Error ? fallo.message : 'No se pudo exportar.'); }
    finally { setDescargando(false); }
  }

  const totalPaginas = Math.max(1, Math.ceil((reporte?.filas.length ?? 0) / TAMANO_PAGINA));
  const detalle = reporte?.filas.slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA) ?? [];
  const puedeImprimir = !!reporte && !filtrosCambiados && reporte.filas.length <= MAXIMO_IMPRESION;

  return <section id="sgc-reportes-asistencia" className="sgc-reporte-asistencias" aria-label="Reportes de asistencia">
    <header className="sgc-reporte-cabecera">
      <div className="sgc-reporte-titulo-con-icono"><BarChart3 size={24} aria-hidden="true"/><div><h3>Reportes de asistencia docente</h3>
        <p>Consulta por docente, materia, gestión y fechas. Los registros se obtienen de PostgreSQL.</p></div></div>
    </header>
    <form className="sgc-reporte-filtros" onSubmit={e => void generar(e)}>
      <label>Desde
        <input type="date" value={filtros.desde} required onChange={e => cambiar('desde', e.target.value)} /></label>
      <label>Hasta
        <input type="date" value={filtros.hasta} required onChange={e => cambiar('hasta', e.target.value)} /></label>
      <label>Docente
        <select value={filtros.docenteId} onChange={e => cambiar('docenteId', e.target.value)}>
          <option value="">Todos</option>
          {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre_completo}</option>)}
        </select></label>
      <label>Materia
        <select value={filtros.materiaId} onChange={e => cambiar('materiaId', e.target.value)}>
          <option value="">Todas</option>
          {materias.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>)}
        </select></label>
      <label>Gestión
        <select value={filtros.gestion} onChange={e => cambiar('gestion', e.target.value)}>
          <option value="">Todas las gestiones</option>
          {Array.from(new Set([new Date().getFullYear(), ...Array.from({length:7}, (_,i) => new Date().getFullYear()-i)]))
            .map(g => <option key={g} value={g}>{g}</option>)}
        </select></label>
      <button type="submit" className="docente-boton" disabled={ocupado}>
        <Search size={16} aria-hidden="true" /> {ocupado ? 'Generando…' : 'Generar reporte'}
      </button>
    </form>
    {error && <p className="docente-alerta error" role="alert">{error}</p>}
    {filtrosCambiados && <p className="sgc-reporte-aviso" role="status">
      Cambiaste los filtros. Presiona «Generar reporte» para actualizar los resultados antes de exportar.
    </p>}
    {reporte ? <>
      <div className="sgc-reporte-titulo-impresion">
        <h4>Informe de asistencia — Dirección de Carrera</h4>
        <p>Del {reporte.filtros.desde} al {reporte.filtros.hasta} · Generado {reporte.fecha_generacion} · America/La_Paz</p>
      </div>
      <div className="sgc-reporte-resumen">
        {([
          ['Clases programadas', reporte.resumen.programadas],
          ['Marcaciones con foto', reporte.resumen.marcadas],
          ['Correcciones aprobadas', reporte.resumen.corregidas],
          ['Justificaciones aprobadas', reporte.resumen.justificadas],
          ['Faltas registradas', reporte.resumen.faltas_registradas],
          ['Pasadas sin registro', reporte.resumen.sin_registro],
          ['Futuras', reporte.resumen.futuras],
          ['Ventana abierta', reporte.resumen.en_ventana],
          ['Solicitudes pendientes', reporte.resumen.solicitudes_pendientes],
        ] as [string, number][]).map(([nombre, valor]) =>
          <div key={nombre}><strong>{valor}</strong><span>{nombre}</span></div>)}
      </div>
      <p className="sgc-reporte-indicador">
        <strong>{reporte.resumen.porcentaje_marcadas === null ? 'Sin datos' : `${reporte.resumen.porcentaje_marcadas}%`}</strong>
        {' '}de clases transcurridas con asistencia marcada o corrección aprobada
        <small>Se incluyen las clases justificadas y sin registro en el denominador; se excluyen las futuras y las que aún tienen la ventana abierta.</small>
      </p>
      <p className="sgc-reporte-aviso">{reporte.advertencia}</p>
      <div className="sgc-reporte-acciones">
        <button type="button" className="docente-boton" disabled={descargando || filtrosCambiados}
          onClick={() => void exportarArchivo('excel')}><FileSpreadsheet size={16} aria-hidden="true" /> {descargando ? 'Exportando…' : 'Descargar Excel (.xlsx)'}</button>
        <button type="button" className="docente-boton secundario" disabled={descargando || filtrosCambiados}
          onClick={() => void exportarArchivo('csv')}><FileText size={16} aria-hidden="true"/> Descargar CSV</button>
        <button type="button" className="docente-boton secundario" disabled={!puedeImprimir}
          onClick={() => window.print()}><Printer size={16} aria-hidden="true"/> Imprimir / Guardar PDF</button>
      </div>
      {reporte.filas.length > MAXIMO_IMPRESION &&
        <p className="sgc-reporte-aviso">El PDF está limitado a {MAXIMO_IMPRESION} filas para evitar documentos demasiado grandes. Reduce el periodo o usa Excel o CSV, que exportan todo el reporte.</p>}
      <h4 className="sgc-reporte-subtitulo"><CalendarDays size={18} aria-hidden="true" /> Detalle de clases ({reporte.filas.length} registros)</h4>
      <div className="sgc-reporte-tabla-pantalla">
        <div className="sgc-reporte-scroll"><table className="sgc-tabla sgc-reporte-tabla">
          <thead><tr><th>Fecha</th><th>Docente</th><th>Materia</th><th>Horario</th><th>Estado</th><th>Solicitud</th></tr></thead>
          <tbody>{detalle.map(f => <tr key={`${f.horario_id}-${f.fecha}`}>
            <td>{f.fecha}</td><td>{f.docente}</td><td>{f.materia}</td>
            <td>{f.hora_inicio}–{f.hora_fin}</td>
            <td><span className={`sgc-reporte-estado estado-${f.estado}`}>{etiquetas[f.estado]}</span></td>
            <td>{f.solicitud_estado || '—'}</td>
          </tr>)}
          {!detalle.length && <tr><td colSpan={6}>No hay clases para los filtros seleccionados.</td></tr>}</tbody>
        </table></div>
        {reporte.filas.length > TAMANO_PAGINA && <div className="sgc-reporte-paginacion">
          <span>Página {pagina} de {totalPaginas}</span>
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</button>
          <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>Siguiente</button>
        </div>}
      </div>
      {puedeImprimir && <table className="sgc-reporte-tabla-impresion">
        <thead><tr><th>Fecha</th><th>Docente</th><th>Materia</th><th>Horario</th><th>Estado</th></tr></thead>
        <tbody>{reporte.filas.map(f => <tr key={`${f.horario_id}-${f.fecha}`}>
          <td>{f.fecha}</td><td>{f.docente}</td><td>{f.materia}</td>
          <td>{f.hora_inicio}–{f.hora_fin}</td><td>{etiquetas[f.estado]}</td>
        </tr>)}</tbody>
      </table>}
    </> : <p className="sgc-reporte-vacio">Elige las fechas y presiona «Generar reporte» para ver el resumen y los detalles.</p>}
  </section>;
}
